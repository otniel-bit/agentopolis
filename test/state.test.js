import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, reduce, snapshot, sweep, dehydrate, hydrate } from '../src/state.js';

let n = 0;
const evt = (type, session, data = {}, extra = {}) => ({
  v: 1,
  id: 'e-' + (++n),
  type,
  at: extra.at ?? Date.now(),
  provider: 'test',
  session,
  agent: extra.agent ?? 'root',
  project: extra.project ?? '/repo/alpha',
  data,
});

test('session start creates district, worksite, and root agent', () => {
  const w = createWorld();
  assert.equal(reduce(w, evt('session.started', 's1', { source: 'startup' })), true);
  const snap = snapshot(w);
  assert.equal(snap.districts.length, 1);
  assert.equal(snap.buildings.length, 1);
  assert.equal(snap.buildings[0].permanent, false);
  assert.equal(snap.agents.length, 1);
  assert.equal(snap.agents[0].isRoot, true);
});

test('duplicate event ids are dropped', () => {
  const w = createWorld();
  const e = evt('session.started', 's1');
  assert.equal(reduce(w, e), true);
  assert.equal(reduce(w, e), false);
  assert.equal(snapshot(w).buildings.length, 1);
});

test('unknown event types are ignored without crashing', () => {
  const w = createWorld();
  assert.equal(reduce(w, evt('alien.event', 's1')), false);
  assert.equal(reduce(w, { garbage: true }), false);
  assert.equal(reduce(w, null), false);
  assert.equal(reduce(w, evt('session.started', 's1')), true);
});

test('explicit naming promotes the worksite; generated does not', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.named', 's1', { name: 'alpha-3f', origin: 'generated' }));
  assert.equal(snapshot(w).buildings[0].permanent, false);
  assert.equal(snapshot(w).buildings[0].name, 'alpha-3f');
  reduce(w, evt('session.named', 's1', { name: 'auth-refactor', origin: 'explicit' }));
  const b = snapshot(w).buildings[0];
  assert.equal(b.permanent, true);
  assert.equal(b.name, 'auth-refactor');
  assert.equal(b.nameOrigin, 'explicit');
});

test('rename of a promoted building renames in place, never duplicates', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.named', 's1', { name: 'auth-refactor', origin: 'explicit' }));
  reduce(w, evt('session.named', 's1', { name: 'auth-rewrite', origin: 'explicit' }));
  const snap = snapshot(w);
  assert.equal(snap.buildings.length, 1);
  assert.equal(snap.buildings[0].name, 'auth-rewrite');
});

test('temporary worksite is dismantled on session end; permanent survives closed', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.started', 's2'));
  reduce(w, evt('session.named', 's2', { name: 'billing', origin: 'explicit' }));
  reduce(w, evt('session.ended', 's1'));
  reduce(w, evt('session.ended', 's2'));
  const snap = snapshot(w);
  assert.equal(snap.buildings.length, 1);
  assert.equal(snap.buildings[0].name, 'billing');
  assert.equal(snap.buildings[0].state, 'closed');
  assert.equal(snap.buildings[0].sessionId, null);
});

test('freed plots are reused by the next worksite', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  const plot1 = snapshot(w).buildings[0].plot;
  reduce(w, evt('session.ended', 's1'));
  reduce(w, evt('session.started', 's2'));
  assert.deepEqual(snapshot(w).buildings[0].plot, plot1);
});

test('a new session with the same explicit name reopens the old building', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.named', 's1', { name: 'auth-refactor', origin: 'explicit' }));
  const id1 = snapshot(w).buildings[0].id;
  reduce(w, evt('session.ended', 's1'));
  reduce(w, evt('session.started', 's2'));
  reduce(w, evt('session.named', 's2', { name: 'auth-refactor', origin: 'explicit' }));
  const snap = snapshot(w);
  assert.equal(snap.buildings.length, 1);
  assert.equal(snap.buildings[0].id, id1);
  assert.equal(snap.buildings[0].sessionId, 's2');
});

test('subagent lifecycle: spawn, activity, finish', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('agent.spawned', 's1', { agentType: 'Explore' }, { agent: 'a1' }));
  reduce(w, evt('activity.started', 's1', { kind: 'researching', label: 'Reading auth.ts', tool: 'Read', ruleId: 'read.v1' }, { agent: 'a1' }));
  let snap = snapshot(w);
  const worker = snap.agents.find((a) => a.id === 's1:a1');
  assert.equal(worker.agentType, 'Explore');
  assert.equal(worker.activity.kind, 'researching');
  reduce(w, evt('agent.finished', 's1', { outcome: 'completed' }, { agent: 'a1' }));
  snap = snapshot(w);
  assert.equal(snap.agents.find((a) => a.id === 's1:a1').state, 'done');
  assert.equal(snap.summary.doneRecent >= 1, true);
});

test('out-of-order: completion before start, late start never reopens', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  // completion for an agent we have never seen — must not throw
  assert.equal(reduce(w, evt('activity.ended', 's1', { outcome: 'ok', tool: 'Read' }, { agent: 'ghost' })), false);
  reduce(w, evt('agent.spawned', 's1', { agentType: 'Explore' }, { agent: 'a1' }));
  reduce(w, evt('agent.finished', 's1', { outcome: 'completed' }, { agent: 'a1' }));
  // a late activity.start after finish must not resurrect the worker
  reduce(w, evt('activity.started', 's1', { kind: 'editing', label: 'x', tool: 'Edit', ruleId: 'r' }, { agent: 'a1' }));
  const worker = snapshot(w).agents.find((a) => a.id === 's1:a1');
  assert.equal(worker.state, 'done');
  assert.equal(worker.activity, null);
});

test('attention raise and clear drive building state', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('attention.raised', 's1', { kind: 'permission', summary: 'Wants to run: npm publish' }));
  let snap = snapshot(w);
  assert.equal(snap.summary.needsYou, 1);
  assert.equal(snap.buildings[0].state, 'attention');
  reduce(w, evt('attention.cleared', 's1'));
  snap = snapshot(w);
  assert.equal(snap.summary.needsYou, 0);
  assert.notEqual(snap.buildings[0].state, 'attention');
});

test('turn.completed means idle, not done', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('turn.completed', 's1'));
  const snap = snapshot(w);
  assert.equal(snap.summary.working, 0);
  assert.equal(snap.summary.waiting, 1);
  assert.equal(snap.buildings[0].state, 'idle');
});

test('sweep clears stale activities without failing them', () => {
  const w = createWorld();
  const old = Date.now() - 11 * 60 * 1000;
  reduce(w, evt('session.started', 's1', {}, { at: old }));
  reduce(w, evt('activity.started', 's1', { kind: 'testing', label: 'Running tests', tool: 'Bash', ruleId: 'r' }, { at: old }));
  assert.equal(sweep(w), true);
  const root = snapshot(w).agents.find((a) => a.isRoot);
  assert.equal(root.activity, null);
  assert.notEqual(root.state, 'failed');
});

test('dehydrate/hydrate round-trip preserves geography', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.named', 's1', { name: 'auth-refactor', origin: 'explicit' }));
  const saved = JSON.parse(JSON.stringify(dehydrate(w)));

  const w2 = createWorld();
  hydrate(w2, saved);
  const snap = snapshot(w2);
  assert.equal(snap.buildings.length, 1);
  assert.equal(snap.buildings[0].name, 'auth-refactor');
  assert.equal(snap.buildings[0].state, 'closed');
  assert.deepEqual(snap.buildings[0].plot, snapshot(w).buildings[0].plot);

  // and the returning session reopens it rather than building a second one
  reduce(w2, evt('session.started', 's9'));
  reduce(w2, evt('session.named', 's9', { name: 'auth-refactor', origin: 'explicit' }));
  assert.equal(snapshot(w2).buildings.length, 1);
  assert.equal(snapshot(w2).buildings[0].sessionId, 's9');
});

test('sessions in different projects land in different districts', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1', {}, { project: '/repo/alpha' }));
  reduce(w, evt('session.started', 's2', {}, { project: '/repo/beta' }));
  const snap = snapshot(w);
  assert.equal(snap.districts.length, 2);
  const [b1, b2] = snap.buildings;
  assert.notEqual(b1.districtId, b2.districtId);
});
