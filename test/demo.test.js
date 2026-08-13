import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startDemo } from '../src/demo.js';

// Local mirror of the protocol catalog (docs/PROTOCOL.md) — intentionally
// independent of demo.js internals.
const EVENT_TYPES = new Set([
  'session.started', 'session.ended', 'session.named', 'session.status',
  'agent.spawned', 'agent.finished',
  'activity.started', 'activity.ended',
  'attention.raised', 'attention.cleared',
  'task.created', 'task.completed', 'turn.completed', 'turn.failed',
]);

const ACTIVITY_KINDS = new Set([
  'planning', 'researching', 'editing', 'creating', 'testing', 'building',
  'running', 'version_control', 'installing', 'delegating', 'unknown',
]);

async function collectDemo(ms) {
  const events = [];
  const demo = startDemo((e) => events.push(e), { speed: 0 });
  await sleep(ms);
  return { events, demo };
}

test('demo at speed 0 emits a valid looping story', async () => {
  const { events, demo } = await collectDemo(300);
  demo.stop();

  assert.ok(events.length > 50, `expected many events, got ${events.length}`);

  // stop() cancels all pending timers — no further emissions
  const countAtStop = events.length;
  await sleep(50);
  assert.equal(events.length, countAtStop, 'stop() must prevent further emissions');

  // ids unique
  const ids = new Set(events.map((e) => e.id));
  assert.equal(ids.size, events.length, 'event ids must be unique');

  // structural validation per catalog
  for (const e of events) {
    assert.equal(e.v, 1, 'v must be 1');
    assert.match(e.id, /^e-\d+-[a-z0-9]+$/, 'id must match e-<counter>-<rand36>');
    assert.ok(EVENT_TYPES.has(e.type), `unknown event type: ${e.type}`);
    assert.equal(typeof e.at, 'number', 'at must be a number');
    assert.equal(e.provider, 'demo');
    assert.ok(typeof e.session === 'string' && e.session.length > 0, 'session required');
    assert.ok(typeof e.agent === 'string' && e.agent.length > 0, 'agent required');
    assert.ok(typeof e.project === 'string' && e.project.startsWith('/'), 'project must be absolute');
    assert.ok(e.data && typeof e.data === 'object', 'data must be an object');
  }

  // s1 promotion: session.named with explicit origin, same name every loop
  const named = events.filter((e) => e.type === 'session.named' && e.session.startsWith('s1'));
  assert.ok(named.length > 0, 'expected session.named for s1');
  for (const e of named) {
    assert.equal(e.data.origin, 'explicit');
    assert.equal(e.data.name, 'auth-refactor');
  }

  // attention.raised is eventually followed by attention.cleared (same session)
  const raisedIdx = events.findIndex((e) => e.type === 'attention.raised');
  assert.ok(raisedIdx >= 0, 'expected an attention.raised event');
  const raised = events[raisedIdx];
  assert.equal(raised.data.kind, 'permission');
  assert.equal(typeof raised.data.summary, 'string');
  const cleared = events
    .slice(raisedIdx + 1)
    .find((e) => e.type === 'attention.cleared' && e.session === raised.session);
  assert.ok(cleared, 'attention.raised must be followed by attention.cleared');

  // every activity.started carries a known kind and a ruleId
  const started = events.filter((e) => e.type === 'activity.started');
  assert.ok(started.length > 0, 'expected activity.started events');
  for (const e of started) {
    assert.ok(ACTIVITY_KINDS.has(e.data.kind), `unknown activity kind: ${e.data.kind}`);
    assert.ok(typeof e.data.ruleId === 'string' && e.data.ruleId.length > 0, 'ruleId required');
    assert.equal(typeof e.data.tool, 'string');
    assert.equal(typeof e.data.label, 'string');
  }

  // failure + recovery on s3
  const failedEnd = events.find(
    (e) => e.type === 'activity.ended' && e.data.outcome === 'fail',
  );
  assert.ok(failedEnd, 'expected a failed activity.ended');
  assert.equal(failedEnd.data.errorCategory, 'exit-1');
  assert.ok(events.some((e) => e.type === 'turn.failed'), 'expected turn.failed');
  assert.ok(events.some((e) => e.type === 'task.completed'), 'expected task.completed');
  assert.ok(events.some((e) => e.type === 'turn.completed'), 'expected turn.completed');

  // subagents spawn and finish
  const spawnedTypes = new Set(
    events.filter((e) => e.type === 'agent.spawned').map((e) => e.data.agentType),
  );
  assert.ok(spawnedTypes.has('Explore'));
  assert.ok(spawnedTypes.has('Plan'));
  assert.ok(spawnedTypes.has('general-purpose'));
  const finished = events.filter((e) => e.type === 'agent.finished');
  assert.ok(finished.length > 0, 'expected agent.finished events');
  for (const e of finished) assert.equal(e.data.outcome, 'completed');

  // the story loops with fresh session ids on the same project
  const saturnSessions = new Set(
    events
      .filter((e) => e.type === 'session.started' && e.project === '/demo/saturn-api')
      .map((e) => e.session),
  );
  assert.ok(saturnSessions.size >= 2, 'expected the story to loop with fresh session ids');
  assert.ok(saturnSessions.has('s1'));
  assert.ok(saturnSessions.has('s1-2'));
});

test('stop() immediately after start emits nothing further', async () => {
  const events = [];
  const demo = startDemo((e) => events.push(e), { speed: 0 });
  demo.stop();
  const countAtStop = events.length;
  await sleep(50);
  assert.equal(events.length, countAtStop);
});
