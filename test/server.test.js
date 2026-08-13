// Chaos tests: the server must survive garbage, floods, and duplicates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AGENTOPOLIS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'apolis-test-'));

const { createWorld } = await import('../src/state.js');
const { createCityServer } = await import('../src/server.js');
const { ensureHome } = await import('../src/persist.js');

async function boot() {
  ensureHome();
  const world = createWorld();
  const city = createCityServer(world, { logEvents: false, version: 'test' });
  const port = await city.listen(0);
  return { world, city, port, url: `http://127.0.0.1:${port}` };
}

function claudePayload(overrides = {}) {
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'chaos-1',
    cwd: '/repo/chaos',
    tool_name: 'Bash',
    tool_use_id: 't-' + Math.random().toString(36).slice(2),
    tool_input: { command: 'npm test' },
    ...overrides,
  };
}

test('valid hook payload creates a session and activity', async () => {
  const { world, city, port, url } = await boot();
  const res = await fetch(url + '/hook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(claudePayload({ hook_event_name: 'SessionStart' })),
  });
  assert.equal(res.status, 204);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(world.sessions.has('chaos-1'), true);
  city.server.close();
});

test('garbage, empty, and non-JSON bodies never crash the server', async () => {
  const { city, url } = await boot();
  for (const body of ['', 'not json', '[]', '{"a":', '{"hook_event_name":9}', 'null', '\x00\x01\x02']) {
    const res = await fetch(url + '/hook', { method: 'POST', body });
    assert.equal(res.status, 204);
  }
  const health = await fetch(url + '/api/health').then((r) => r.json());
  assert.equal(health.ok, true);
  city.server.close();
});

test('oversized payloads are rejected without harm', async () => {
  const { city, url } = await boot();
  const big = JSON.stringify(claudePayload({ tool_input: { command: 'x'.repeat(500000) } }));
  await fetch(url + '/hook', { method: 'POST', body: big }).catch(() => {});
  const health = await fetch(url + '/api/health').then((r) => r.json());
  assert.equal(health.ok, true);
  city.server.close();
});

test('a flood of duplicate SessionStarts creates exactly one session', async () => {
  const { world, city, url } = await boot();
  const payload = JSON.stringify(claudePayload({ hook_event_name: 'SessionStart' }));
  await Promise.all(Array.from({ length: 50 }, () =>
    fetch(url + '/hook', { method: 'POST', body: payload })));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(world.sessions.size, 1);
  assert.equal(world.buildings.size, 1);
  city.server.close();
});

test('static file traversal is blocked', async () => {
  const { city, url } = await boot();
  for (const p of ['/../package.json', '/..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd']) {
    const res = await fetch(url + p);
    assert.notEqual(res.status, 200, `path ${p} must not serve files`);
  }
  city.server.close();
});

test('full pipeline: hooks → snapshot has truthful activity', async () => {
  const { city, url } = await boot();
  const seq = [
    claudePayload({ hook_event_name: 'SessionStart', session_id: 'e2e' }),
    claudePayload({ hook_event_name: 'SubagentStart', session_id: 'e2e', agent_id: 'ag-9', agent_type: 'Explore' }),
    claudePayload({ hook_event_name: 'PreToolUse', session_id: 'e2e', agent_id: 'ag-9', tool_name: 'Grep', tool_input: { pattern: 'jwt' } }),
  ];
  for (const p of seq) {
    await fetch(url + '/hook', { method: 'POST', body: JSON.stringify(p) });
  }
  await new Promise((r) => setTimeout(r, 80));
  const { snapshot } = await import('../src/state.js');
  // reach through the SSE payload shape
  const res = await fetch(url + '/events', { headers: { Accept: 'text/event-stream' } });
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  reader.cancel();
  const snap = JSON.parse(text.split('data: ')[1].split('\n')[0]);
  const worker = snap.agents.find((a) => a.id === 'e2e:ag-9');
  assert.equal(worker.agentType, 'Explore');
  assert.equal(worker.activity.kind, 'researching');
  assert.match(worker.activity.label, /jwt|Searching/i);
  city.server.close();
});
