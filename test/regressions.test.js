// Regression tests for confirmed adversarial-review findings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, reduce, snapshot, sweep } from '../src/state.js';
import { normalize } from '../src/adapter-claude.js';
import { sanitizeCommand } from '../src/redact.js';

let n = 0;
const evt = (type, session, data = {}, extra = {}) => ({
  v: 1, id: 'e-' + (++n), type, at: extra.at ?? Date.now(),
  provider: 'test', session, agent: extra.agent ?? 'root',
  project: extra.project ?? '/repo/alpha', data,
});

test('CRITICAL: resumed session gets its building and root agent back', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.ended', 's1'));
  assert.equal(snapshot(w).buildings.length, 0); // worksite dismantled

  // resume the SAME session id
  reduce(w, evt('session.started', 's1'));
  let snap = snapshot(w);
  assert.equal(snap.buildings.length, 1, 'building reattached on resume');
  assert.equal(snap.buildings[0].sessionId, 's1');

  // activity from the resumed session must render, not be dropped
  reduce(w, evt('activity.started', 's1', { kind: 'editing', label: 'Editing x', tool: 'Edit', ruleId: 'r' }));
  snap = snapshot(w);
  const root = snap.agents.find((a) => a.isRoot && a.id === 's1:root');
  assert.ok(root, 'root agent revived');
  assert.equal(root.finishedAt, null);
  assert.equal(root.activity.kind, 'editing');
});

test('CRITICAL: resumed permanent building can close again', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.named', 's1', { name: 'billing', origin: 'explicit' }));
  reduce(w, evt('session.ended', 's1'));
  reduce(w, evt('session.started', 's1')); // resume
  let b = snapshot(w).buildings[0];
  assert.equal(b.sessionId, 's1', 'permanent building reattached');
  assert.equal(b.state, 'working');
  reduce(w, evt('session.ended', 's1'));
  b = snapshot(w).buildings[0];
  assert.equal(b.state, 'closed', 'building closes after resumed session ends');
});

test('permission grant clears attention via PreToolUse', () => {
  const w = createWorld();
  const base = { session_id: 'p1', cwd: '/repo/x' };
  for (const e of normalize({ ...base, hook_event_name: 'SessionStart' })) reduce(w, e);
  for (const e of normalize({ ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' } })) reduce(w, e);
  assert.equal(snapshot(w).summary.needsYou, 1);
  // user grants → tool starts running
  for (const e of normalize({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'npm test' } })) reduce(w, e);
  const snap = snapshot(w);
  assert.equal(snap.summary.needsYou, 0, 'attention cleared once the tool runs');
  assert.notEqual(snap.buildings[0].state, 'attention');
});

test('a second permission request updates the stale summary', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('attention.raised', 's1', { kind: 'permission', summary: 'Wants to run: npm test' }));
  reduce(w, evt('attention.raised', 's1', { kind: 'permission', summary: 'Wants to run: rm -rf dist' }));
  const atts = snapshot(w).attention;
  assert.equal(atts.length, 1);
  assert.equal(atts[0].summary, 'Wants to run: rm -rf dist');
});

test('sweep-expired attention releases the agent, not just the building', () => {
  const w = createWorld();
  const old = Date.now() - 46 * 60 * 1000;
  reduce(w, evt('session.started', 's1', {}, { at: old }));
  reduce(w, evt('attention.raised', 's1', { kind: 'permission', summary: 'x' }, { at: old }));
  sweep(w);
  const root = snapshot(w).agents.find((a) => a.isRoot);
  assert.notEqual(root.state, 'attention');
});

test('reopen merge frees the tent plot and remaps attention', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('session.named', 's1', { name: 'auth', origin: 'explicit' }));
  reduce(w, evt('session.ended', 's1'));
  // new session raises attention while still a tent, then gets the old name
  reduce(w, evt('session.started', 's2'));
  reduce(w, evt('attention.raised', 's2', { kind: 'permission', summary: 'y' }));
  reduce(w, evt('session.named', 's2', { name: 'auth', origin: 'explicit' }));
  const snap = snapshot(w);
  assert.equal(snap.buildings.length, 1);
  assert.equal(snap.attention.length, 1);
  assert.equal(snap.attention[0].buildingId, snap.buildings[0].id, 'attention follows the reopened building');
});

test('turn.completed no longer inflates the done count', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('turn.completed', 's1'));
  reduce(w, evt('turn.completed', 's1'));
  assert.equal(snapshot(w).summary.doneRecent, 0);
});

test('feed preserves case of file names', () => {
  const w = createWorld();
  reduce(w, evt('session.started', 's1'));
  reduce(w, evt('activity.started', 's1', { kind: 'researching', label: 'Reading README.md', tool: 'Read', ruleId: 'r' }));
  const feed = snapshot(w).feed;
  assert.ok(feed.some((f) => f.label.includes('README.md')), 'README.md not lowercased');
  assert.ok(feed.some((f) => f.label.includes('foreman')), 'root agent is the foreman everywhere');
});

test('secrets: attached mysql passwords, flag-style tokens, aws keys, curl -u', () => {
  assert.ok(!sanitizeCommand('mysql -u root -phunter2').includes('hunter2'));
  assert.ok(!sanitizeCommand('vault login --token s.abc123xyz').includes('s.abc123xyz'));
  assert.ok(!sanitizeCommand('aws configure set aws_secret_access_key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY').includes('wJalrXUtnFEMI'));
  assert.ok(!sanitizeCommand('curl -u alice:hunter2 https://api.example.com').includes('hunter2'));
  // benign flags survive
  assert.ok(sanitizeCommand('mkdir -p some/dir').includes('-p some/dir'));
});

test('forged future timestamps are ignored by the adapter', () => {
  const events = normalize({
    hook_event_name: 'SessionStart', session_id: 'f1', cwd: '/x',
    __agentopolis_ts: Date.now() + 8.64e15,
  });
  assert.ok(events[0].at <= Date.now() + 1000, 'future ts clamped to receive time');
});

test('session flood cannot grow the world without bound', () => {
  const w = createWorld();
  for (let i = 0; i < 2000; i++) {
    reduce(w, evt('session.started', 'flood-' + i));
  }
  assert.ok(w.sessions.size <= 1500, `sessions capped, got ${w.sessions.size}`);
});
