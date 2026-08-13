// Agentopolis world state: reducers + snapshot. Speaks ONLY protocol v1
// (docs/PROTOCOL.md). Provider payloads never reach this module.

const ACTIVITY_KINDS = new Set([
  'planning', 'researching', 'editing', 'creating', 'testing', 'building',
  'running', 'version_control', 'installing', 'delegating', 'unknown',
]);

const KNOWN_TYPES = new Set([
  'session.started', 'session.ended', 'session.named', 'session.status',
  'agent.spawned', 'agent.finished',
  'activity.started', 'activity.ended',
  'attention.raised', 'attention.cleared',
  'task.created', 'task.completed',
  'turn.completed', 'turn.failed',
]);

const STALE_ACTIVITY_MS = 10 * 60 * 1000;
const ATTENTION_EXPIRE_MS = 45 * 60 * 1000;
const RECENT_WINDOW_MS = 5 * 60 * 1000;
const FEED_LIMIT = 60;
const SEEN_LIMIT = 8000;

export function createWorld() {
  return {
    seq: 0,
    seenIds: new Set(),
    seenOrder: [],
    districts: new Map(),   // path -> district
    buildings: new Map(),   // id -> building
    sessions: new Map(),    // sessionId -> session
    agents: new Map(),      // "session:agent" -> agent
    attention: new Map(),   // id -> attention record
    feed: [],
    recentDone: [],         // timestamps of recent completions
    recentFail: [],
    providerHealth: { lastEventAt: null, lastReconcileAt: null, reconcileError: null },
  };
}

export function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') return false;
  if (evt.v !== 1) return false;
  if (typeof evt.id !== 'string' || !evt.id) return false;
  if (typeof evt.type !== 'string') return false;
  if (typeof evt.at !== 'number' || !Number.isFinite(evt.at)) return false;
  return true;
}

// FNV-1a → stable [0,1) seed for sprite appearance.
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

function shortId(str) {
  return (hashSeed(str) * 0xffffff | 0).toString(36);
}

// Deterministic outward spiral of grid plots: keeps early buildings central.
const PLOT_ORDER = (() => {
  const seen = new Set();
  const order = [];
  for (let ring = 0; ring < 13 && order.length < 169; ring++) {
    for (let y = 0; y <= ring; y++) {
      for (let x = 0; x <= ring; x++) {
        if (Math.max(x, y) !== ring) continue;
        const k = `${x},${y}`;
        if (!seen.has(k)) { seen.add(k); order.push({ x, y }); }
      }
    }
  }
  return order;
})();

// Beyond the precomputed spiral, march row-major in a 13-wide band —
// y >= 13 there, so it can never collide with spiral plots.
function plotForIndex(n) {
  if (n < PLOT_ORDER.length) return { ...PLOT_ORDER[n] };
  const m = n - PLOT_ORDER.length;
  return { x: m % 13, y: 13 + Math.floor(m / 13) };
}

function ensureDistrict(world, project) {
  const path = (project || '/unknown').replace(/\/+$/, '') || '/';
  let d = world.districts.get(path);
  if (!d) {
    const i = world.districts.size;
    d = {
      id: 'd-' + shortId(path),
      name: path.split('/').filter(Boolean).pop() || path,
      path,
      col: i % 3,
      row: Math.floor(i / 3),
      nextPlot: 0,
      freePlots: [],
    };
    world.districts.set(path, d);
  }
  return d;
}

function allocatePlot(district) {
  if (!district.freePlots) district.freePlots = [];
  if (district.freePlots.length) return district.freePlots.shift();
  return plotForIndex(district.nextPlot++);
}

// Dismantle a temporary worksite: its plot goes back into the pool.
function removeBuilding(world, b) {
  world.buildings.delete(b.id);
  const district = [...world.districts.values()].find((d) => d.id === b.districtId);
  if (district) {
    if (!district.freePlots) district.freePlots = [];
    district.freePlots.push({ ...b.plot });
    district.freePlots.sort((p, q) => (p.y - q.y) || (p.x - q.x));
  }
}

function ensureSession(world, evt) {
  let s = world.sessions.get(evt.session);
  if (!s) {
    s = {
      id: evt.session,
      project: (evt.project || '/unknown').replace(/\/+$/, '') || '/',
      buildingId: null,
      name: null,
      nameOrigin: 'unknown',
      status: 'working',
      live: true,
      startedAt: evt.at,
      lastEventAt: evt.at,
      endedAt: null,
    };
    world.sessions.set(evt.session, s);
    attachBuilding(world, s, evt);
    ensureAgent(world, evt.session, 'root', 'root', evt.at);
  }
  s.lastEventAt = Math.max(s.lastEventAt, evt.at);
  return s;
}

function attachBuilding(world, session, evt) {
  if (session.buildingId && world.buildings.has(session.buildingId)) return;
  const district = ensureDistrict(world, session.project);
  // A returning explicit name reopens its old building instead of creating
  // one — whether the name arrives on the event or is already on the session.
  const name = (evt.data && evt.data.name) || session.name;
  if (name) {
    for (const b of world.buildings.values()) {
      if (b.districtId === district.id && b.permanent && b.name === name && !b.sessionId) {
        b.sessionId = session.id;
        b.state = 'working';
        session.buildingId = b.id;
        return;
      }
    }
  }
  const b = {
    id: 'b-' + shortId(session.id + ':' + session.project),
    districtId: district.id,
    projectPath: session.project,
    plot: allocatePlot(district),
    name: name || 'session ' + session.id.slice(0, 6),
    permanent: false,
    nameOrigin: 'unknown',
    state: 'working',
    sessionId: session.id,
    attention: null,
    createdAt: evt.at,
    lastActiveAt: evt.at,
  };
  world.buildings.set(b.id, b);
  session.buildingId = b.id;
}

function ensureAgent(world, sessionId, agentId, agentType, at) {
  const key = sessionId + ':' + (agentId || 'root');
  let a = world.agents.get(key);
  if (!a) {
    const session = world.sessions.get(sessionId);
    a = {
      id: key,
      sessionId,
      buildingId: session ? session.buildingId : null,
      agentType: agentType || (agentId === 'root' ? 'root' : 'agent'),
      isRoot: (agentId || 'root') === 'root',
      state: 'active',
      activity: null,
      spawnedAt: at,
      finishedAt: null,
      lastFailAt: null,
      seed: hashSeed(key),
    };
    world.agents.set(key, a);
  }
  return a;
}

function getBuilding(world, session) {
  return session && session.buildingId ? world.buildings.get(session.buildingId) : null;
}

function touchBuilding(world, session, at) {
  const b = getBuilding(world, session);
  if (b) b.lastActiveAt = Math.max(b.lastActiveAt, at);
  return b;
}

function feedPush(world, evt, label) {
  world.feed.push({
    at: evt.at,
    type: evt.type,
    session: evt.session || null,
    agent: evt.agent || null,
    project: evt.project || null,
    label,
  });
  if (world.feed.length > FEED_LIMIT) world.feed.splice(0, world.feed.length - FEED_LIMIT);
}

function sessionLabel(world, evt) {
  const s = world.sessions.get(evt.session);
  const b = s && getBuilding(world, s);
  return b ? b.name : (evt.session || '').slice(0, 8);
}

function clearAttention(world, sessionId, agentId) {
  let cleared = false;
  for (const [id, att] of world.attention) {
    if (att.sessionId !== sessionId) continue;
    if (agentId && att.agentId && att.agentId !== sessionId + ':' + agentId) continue;
    world.attention.delete(id);
    cleared = true;
  }
  if (cleared) {
    const s = world.sessions.get(sessionId);
    const b = s && getBuilding(world, s);
    if (b) b.attention = null;
  }
  return cleared;
}

// Applies one protocol event. Returns true if the world changed.
export function reduce(world, evt) {
  if (!validateEvent(evt)) return false;
  if (world.seenIds.has(evt.id)) return false;
  // Growth cap: a flood of fabricated sessions must not exhaust memory.
  if (evt.session && !world.sessions.has(evt.session) && world.sessions.size >= 1500) return false;
  world.seenIds.add(evt.id);
  world.seenOrder.push(evt.id);
  if (world.seenOrder.length > SEEN_LIMIT) {
    const drop = world.seenOrder.splice(0, world.seenOrder.length - SEEN_LIMIT);
    for (const id of drop) world.seenIds.delete(id);
  }
  if (!KNOWN_TYPES.has(evt.type)) return false;
  world.providerHealth.lastEventAt = Date.now();

  const d = evt.data || {};
  switch (evt.type) {
    case 'session.started': {
      const existed = world.sessions.get(evt.session);
      const s = ensureSession(world, evt);
      s.live = true;
      s.endedAt = null;
      // Revival path: resumed/rediscovered sessions need their building back
      // (session.ended dismantled a worksite or detached a permanent building).
      let b = getBuilding(world, s);
      if (!b) {
        s.buildingId = null;
        attachBuilding(world, s, evt);
        b = getBuilding(world, s);
      }
      if (b) {
        if (!b.sessionId) b.sessionId = s.id;
        if (b.sessionId === s.id && (b.state === 'closed' || b.state === 'idle')) b.state = 'working';
      }
      // ...and their root agent back on shift.
      const root = ensureAgent(world, s.id, 'root', 'root', evt.at);
      if (root.finishedAt) {
        root.finishedAt = null;
        root.state = 'active';
        root.activity = null;
      }
      root.buildingId = s.buildingId;
      if (!existed) feedPush(world, evt, `${sessionLabel(world, evt)} · session started`);
      break;
    }
    case 'session.ended': {
      const s = world.sessions.get(evt.session);
      if (!s) return false;
      s.live = false;
      s.status = 'idle';
      s.endedAt = evt.at;
      const label = sessionLabel(world, evt);
      const b = getBuilding(world, s);
      if (b && b.sessionId === s.id) {
        b.sessionId = null;
        b.attention = null;
        if (b.permanent) {
          b.state = 'closed'; // lights off, building stays
        } else {
          removeBuilding(world, b); // worksites are dismantled
          s.buildingId = null;
        }
      }
      for (const a of world.agents.values()) {
        if (a.sessionId === s.id && !a.finishedAt) {
          a.state = 'done';
          a.finishedAt = evt.at;
          a.activity = null;
        }
      }
      clearAttention(world, s.id);
      feedPush(world, evt, `${label} · session ended`);
      break;
    }
    case 'session.named': {
      const s = ensureSession(world, evt);
      const name = String(d.name || '').slice(0, 60);
      if (!name) return false;
      const origin = d.origin || 'unknown';
      if (s.name === name && s.nameOrigin === origin) return false;
      s.name = name;
      s.nameOrigin = origin;
      const b = getBuilding(world, s);
      if (!b) return false;
      if (origin === 'explicit') {
        // Reopen an existing permanent building with this name if one is idle.
        const district = ensureDistrict(world, s.project);
        for (const other of world.buildings.values()) {
          if (other.id !== b.id && other.districtId === district.id &&
              other.permanent && other.name === name && !other.sessionId) {
            other.sessionId = s.id;
            other.state = b.state;
            other.attention = b.attention;
            other.lastActiveAt = evt.at;
            for (const a of world.agents.values()) {
              if (a.buildingId === b.id) a.buildingId = other.id;
            }
            for (const att of world.attention.values()) {
              if (att.buildingId === b.id) att.buildingId = other.id;
            }
            removeBuilding(world, b); // frees the tent's plot
            s.buildingId = other.id;
            feedPush(world, evt, `${name} · building reopened`);
            return true;
          }
        }
        const wasPermanent = b.permanent;
        b.permanent = true;
        b.name = name;
        b.nameOrigin = 'explicit';
        b.promotedAt = b.promotedAt || evt.at;
        feedPush(world, evt, wasPermanent
          ? `${name} · building renamed`
          : `${name} · promoted to a permanent building`);
      } else {
        // Generated titles label the worksite but never promote it.
        if (!b.permanent) { b.name = name; b.nameOrigin = origin; }
      }
      break;
    }
    case 'session.status': {
      const s = ensureSession(world, evt);
      const status = ['working', 'idle', 'blocked'].includes(d.status) ? d.status : 'working';
      if (s.status === status) return false;
      s.status = status;
      const b = getBuilding(world, s);
      if (b && b.sessionId === s.id && !b.attention) {
        b.state = status === 'working' ? 'working' : status === 'blocked' ? 'waiting' : 'idle';
      }
      break;
    }
    case 'agent.spawned': {
      const s = ensureSession(world, evt);
      const a = ensureAgent(world, evt.session, evt.agent, d.agentType, evt.at);
      a.state = 'active';
      touchBuilding(world, s, evt.at);
      if (!a.isRoot) feedPush(world, evt, `${sessionLabel(world, evt)} · ${a.agentType} worker arrived`);
      break;
    }
    case 'agent.finished': {
      const key = evt.session + ':' + (evt.agent || 'root');
      const a = world.agents.get(key);
      if (!a || a.finishedAt) return false;
      const outcome = ['completed', 'failed', 'stopped'].includes(d.outcome) ? d.outcome : 'completed';
      a.state = outcome === 'failed' ? 'failed' : 'done';
      a.finishedAt = evt.at;
      a.activity = null;
      if (outcome === 'failed') world.recentFail.push(evt.at);
      else world.recentDone.push(evt.at);
      const s = world.sessions.get(evt.session);
      if (s) touchBuilding(world, s, evt.at);
      feedPush(world, evt, `${sessionLabel(world, evt)} · ${a.agentType} worker ${outcome}`);
      break;
    }
    case 'activity.started': {
      const s = ensureSession(world, evt);
      const a = ensureAgent(world, evt.session, evt.agent, undefined, evt.at);
      if (a.finishedAt) return false; // late start after completion: never reopen
      const kind = ACTIVITY_KINDS.has(d.kind) ? d.kind : 'unknown';
      a.activity = {
        kind,
        label: String(d.label || kind).slice(0, 80),
        target: d.target ? String(d.target).slice(0, 60) : null,
        tool: d.tool || null,
        toolUseId: d.toolUseId || null,
        ruleId: d.ruleId || 'unknown',
        startedAt: evt.at,
        done: false,
      };
      if (a.state !== 'attention') a.state = 'active';
      if (s.live) s.status = 'working';
      const b = touchBuilding(world, s, evt.at);
      if (b && !b.attention && b.sessionId === s.id) b.state = 'working';
      const verb = a.activity.label.charAt(0).toLowerCase() + a.activity.label.slice(1);
      feedPush(world, evt, `${sessionLabel(world, evt)} · ${a.isRoot ? 'foreman' : a.agentType} ${verb}`);
      break;
    }
    case 'activity.ended': {
      const s = world.sessions.get(evt.session);
      const a = world.agents.get(evt.session + ':' + (evt.agent || 'root'));
      if (!a) return false;
      const fail = d.outcome === 'fail';
      if (a.activity && (!d.toolUseId || !a.activity.toolUseId || a.activity.toolUseId === d.toolUseId)) {
        a.activity.done = true;
      }
      if (fail) {
        // Tool failures flash and land in the feed, but only turn/agent
        // failures count in the summary — Claude usually recovers tools itself.
        a.lastFailAt = evt.at;
        feedPush(world, evt, `${sessionLabel(world, evt)} · ${d.tool || 'a tool'} failed${d.errorCategory ? ` (${d.errorCategory})` : ''}`);
      }
      if (s) touchBuilding(world, s, evt.at);
      break;
    }
    case 'attention.raised': {
      const s = ensureSession(world, evt);
      const kind = ['permission', 'input', 'question'].includes(d.kind) ? d.kind : 'input';
      const agentKey = evt.agent ? evt.session + ':' + evt.agent : null;
      const id = 'att-' + shortId(evt.session + ':' + (evt.agent || 'root') + ':' + kind);
      const prior = world.attention.get(id);
      if (prior) {
        // A fresh request supersedes the stale one — update, never ignore.
        const summary = String(d.summary || 'Needs your attention').slice(0, 120);
        if (prior.summary === summary) return false;
        prior.summary = summary;
        prior.since = evt.at;
        const sb = world.buildings.get(prior.buildingId);
        if (sb && sb.attention) { sb.attention.summary = summary; sb.attention.since = evt.at; }
        feedPush(world, evt, `${sessionLabel(world, evt)} · needs you: ${summary}`);
        break;
      }
      const att = {
        id,
        sessionId: s.id,
        buildingId: s.buildingId,
        agentId: agentKey || s.id + ':root',
        kind,
        summary: String(d.summary || 'Needs your attention').slice(0, 120),
        since: evt.at,
      };
      world.attention.set(id, att);
      const b = getBuilding(world, s);
      if (b) { b.state = 'attention'; b.attention = { kind, summary: att.summary, since: evt.at }; }
      const a = world.agents.get(att.agentId);
      if (a && !a.finishedAt) a.state = 'attention';
      feedPush(world, evt, `${sessionLabel(world, evt)} · needs you: ${att.summary}`);
      break;
    }
    case 'attention.cleared': {
      const s = world.sessions.get(evt.session);
      if (!s) return false;
      const had = clearAttention(world, s.id, evt.agent);
      if (!had) return false;
      const b = getBuilding(world, s);
      if (b && b.sessionId === s.id) b.state = s.status === 'working' ? 'working' : 'idle';
      for (const a of world.agents.values()) {
        if (a.sessionId === s.id && a.state === 'attention' && !a.finishedAt) a.state = 'active';
      }
      feedPush(world, evt, `${sessionLabel(world, evt)} · attention resolved`);
      break;
    }
    case 'task.created': {
      ensureSession(world, evt);
      feedPush(world, evt, `${sessionLabel(world, evt)} · work order: ${String(d.subject || 'task').slice(0, 60)}`);
      break;
    }
    case 'task.completed': {
      const s = world.sessions.get(evt.session);
      if (s) touchBuilding(world, s, evt.at);
      world.recentDone.push(evt.at);
      feedPush(world, evt, `${sessionLabel(world, evt)} · work order completed`);
      break;
    }
    case 'turn.completed': {
      const s = world.sessions.get(evt.session);
      if (!s) return false;
      s.status = 'idle';
      const root = world.agents.get(s.id + ':root');
      if (root && !root.finishedAt) { root.activity = null; root.state = 'active'; }
      const b = getBuilding(world, s);
      if (b && b.sessionId === s.id && !b.attention) b.state = 'idle';
      // A finished turn is idle, not "done" — only real completions count.
      feedPush(world, evt, `${sessionLabel(world, evt)} · turn finished`);
      break;
    }
    case 'turn.failed': {
      const s = world.sessions.get(evt.session);
      if (!s) return false;
      world.recentFail.push(evt.at);
      const b = getBuilding(world, s);
      if (b && !b.attention) b.state = 'failed';
      feedPush(world, evt, `${sessionLabel(world, evt)} · turn failed`);
      break;
    }
  }
  world.seq++;
  return true;
}

// Periodic housekeeping: stale activities, expired attention, recent windows.
export function sweep(world, now = Date.now()) {
  let changed = false;
  for (const a of world.agents.values()) {
    if (a.activity && !a.activity.done && now - a.activity.startedAt > STALE_ACTIVITY_MS) {
      a.activity = null; // stale, not failed
      changed = true;
    }
  }
  for (const [id, att] of world.attention) {
    if (now - att.since > ATTENTION_EXPIRE_MS) {
      world.attention.delete(id);
      const s = world.sessions.get(att.sessionId);
      const b = (s && s.buildingId && world.buildings.get(s.buildingId)) || world.buildings.get(att.buildingId);
      if (b) { b.attention = null; if (b.state === 'attention') b.state = 'idle'; }
      const a = world.agents.get(att.agentId);
      if (a && a.state === 'attention' && !a.finishedAt) a.state = 'active';
      changed = true;
    }
  }
  // GC: ended sessions and their agents eventually leave the world entirely.
  const GC_MS = 60 * 60 * 1000;
  for (const [id, s] of world.sessions) {
    if (!s.live && s.endedAt && now - s.endedAt > GC_MS) {
      world.sessions.delete(id);
      for (const [k, a] of world.agents) {
        if (a.sessionId === id) world.agents.delete(k);
      }
      changed = true;
    }
  }
  const cutRecent = (arr) => {
    const keep = arr.filter((t) => now - t < RECENT_WINDOW_MS);
    if (keep.length !== arr.length) { arr.length = 0; arr.push(...keep); return true; }
    return false;
  };
  if (cutRecent(world.recentDone)) changed = true;
  if (cutRecent(world.recentFail)) changed = true;
  if (changed) world.seq++;
  return changed;
}

export function snapshot(world, now = Date.now()) {
  let working = 0, waiting = 0;
  for (const s of world.sessions.values()) {
    if (!s.live) continue;
    if (s.status === 'working') working++;
    else if (s.status === 'idle') waiting++;
    // 'blocked' sessions surface through attention, not the idle count
  }
  return {
    seq: world.seq,
    now,
    providerHealth: world.providerHealth,
    summary: {
      working,
      waiting,
      needsYou: world.attention.size,
      failed: world.recentFail.filter((t) => now - t < RECENT_WINDOW_MS).length,
      doneRecent: world.recentDone.filter((t) => now - t < RECENT_WINDOW_MS).length,
    },
    districts: [...world.districts.values()].map((d) => ({
      id: d.id, name: d.name, path: d.path, col: d.col, row: d.row,
    })),
    buildings: [...world.buildings.values()].map((b) => ({
      id: b.id, districtId: b.districtId, plot: b.plot, name: b.name,
      permanent: b.permanent, nameOrigin: b.nameOrigin, state: b.state,
      sessionId: b.sessionId, attention: b.attention, lastActiveAt: b.lastActiveAt,
    })),
    agents: [...world.agents.values()]
      .filter((a) => !a.finishedAt || now - a.finishedAt < RECENT_WINDOW_MS)
      .map((a) => ({
        id: a.id, buildingId: a.buildingId, agentType: a.agentType, isRoot: a.isRoot,
        state: a.state, activity: a.activity, spawnedAt: a.spawnedAt,
        finishedAt: a.finishedAt, lastFailAt: a.lastFailAt, seed: a.seed,
      })),
    attention: [...world.attention.values()],
    feed: world.feed.slice(-FEED_LIMIT),
  };
}

// ——— persistence hydration (geography + history survive restarts) ———

export function dehydrate(world) {
  const permanent = [...world.buildings.values()].filter((b) => b.permanent);
  const keepDistricts = new Set(permanent.map((b) => b.districtId));
  // Plots held by temporary worksites are freed in the saved copy — those
  // buildings don't survive a restart, so their land shouldn't either.
  // Districts with nothing permanent in them aren't saved at all.
  const districts = [...world.districts.values()]
    .filter((d) => keepDistricts.has(d.id))
    .map((d) => {
      const free = [...(d.freePlots || [])];
      for (const b of world.buildings.values()) {
        if (b.districtId === d.id && !b.permanent) free.push({ ...b.plot });
      }
      free.sort((p, q) => (p.y - q.y) || (p.x - q.x));
      return { ...d, freePlots: free };
    });
  return {
    v: 1,
    districts,
    buildings: permanent.map((b) => ({ ...b, sessionId: null, state: 'closed', attention: null })),
    sessions: [...world.sessions.values()]
      .filter((s) => s.name && s.nameOrigin === 'explicit')
      .map((s) => ({ id: s.id, project: s.project, name: s.name, nameOrigin: s.nameOrigin, buildingId: s.buildingId })),
  };
}

export function hydrate(world, saved) {
  if (!saved || saved.v !== 1) return;
  for (const d of saved.districts || []) {
    world.districts.set(d.path, { ...d });
  }
  for (const b of saved.buildings || []) {
    world.buildings.set(b.id, { ...b, sessionId: null, state: 'closed', attention: null });
  }
  for (const s of saved.sessions || []) {
    if (!world.buildings.has(s.buildingId)) continue;
    world.sessions.set(s.id, {
      id: s.id, project: s.project, buildingId: s.buildingId,
      name: s.name, nameOrigin: s.nameOrigin,
      status: 'idle', live: false, startedAt: 0, lastEventAt: 0, endedAt: 0,
    });
  }
  world.seq++;
}
