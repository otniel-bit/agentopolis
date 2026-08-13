// Reconciler: periodically asks Claude Code for the authoritative session list
// (`claude agents --json`) and emits protocol events to repair anything hooks
// missed — session discovery, status, names, and disappearances.

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

function evt(type, session, project, data = {}) {
  return {
    v: 1,
    id: 'e-' + crypto.randomUUID(),
    type,
    at: Date.now(),
    provider: 'claude-code',
    session,
    agent: 'root',
    project,
    data,
  };
}

// Generated names look like "<dirname>-3c" (hash suffix). Explicit renames are
// user-typed slugs. AI-generated prose titles ("Fix auth token bug") contain
// spaces/uppercase — those label the worksite but never promote it.
export function classifyNameOrigin(name, cwd) {
  if (!name) return 'unknown';
  const base = path.basename(cwd || '').toLowerCase();
  if (new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[0-9a-f]{1,4}$`).test(name)) {
    return 'generated';
  }
  if (/^[a-z0-9][a-z0-9._-]{0,59}$/.test(name)) return 'explicit';
  return 'generated';
}

function mapStatus(s) {
  if (s === 'busy' || s === 'working') return 'working';
  if (s === 'blocked' || s === 'waiting') return 'blocked';
  return 'idle';
}

export function listSessions() {
  return new Promise((resolve, reject) => {
    execFile('claude', ['agents', '--json'], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const arr = JSON.parse(stdout);
        resolve(Array.isArray(arr) ? arr : []);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function startReconciler(world, ingest, { intervalActive = 4000, intervalIdle = 20000 } = {}) {
  let timer = null;
  let stopped = false;
  const knownLive = new Map(); // sessionId -> last seen name

  async function tick() {
    if (stopped) return;
    let sessions = null;
    try {
      sessions = await listSessions();
      world.providerHealth.lastReconcileAt = Date.now();
      world.providerHealth.reconcileError = null;
    } catch (e) {
      // Provider trouble is health info, never session failure.
      world.providerHealth.reconcileError = String(e && e.message || e).slice(0, 120);
    }

    if (sessions) {
      const seen = new Set();
      for (const s of sessions) {
        const id = s.sessionId || s.session_id;
        if (!id) continue;
        seen.add(id);
        const cwd = s.cwd || '/unknown';
        // Rediscover both brand-new sessions AND hydrated/ended ones the
        // provider says are alive (e.g. running across a server restart).
        const known = world.sessions.get(id);
        if (!known || !known.live) {
          ingest(evt('session.started', id, cwd, { source: 'unknown' }));
        }
        ingest(evt('session.status', id, cwd, {
          status: mapStatus(s.status),
          waitingFor: typeof s.waitingFor === 'string' ? s.waitingFor.slice(0, 80) : undefined,
        }));
        const name = typeof s.name === 'string' ? s.name : null;
        if (name && knownLive.get(id) !== name) {
          knownLive.set(id, name);
          ingest(evt('session.named', id, cwd, { name, origin: classifyNameOrigin(name, cwd) }));
        }
      }
      // Live sessions that vanished from the listing have ended.
      for (const s of world.sessions.values()) {
        if (s.live && !seen.has(s.id)) {
          ingest(evt('session.ended', s.id, s.project, { reason: 'gone' }));
          knownLive.delete(s.id);
        }
      }
    }

    const anyLive = [...world.sessions.values()].some((s) => s.live);
    const delay = (anyLive ? intervalActive : intervalIdle) + Math.random() * 500;
    timer = setTimeout(tick, delay);
    if (timer.unref) timer.unref();
  }

  tick();
  return {
    stop() { stopped = true; if (timer) clearTimeout(timer); },
    kick() { if (timer) clearTimeout(timer); tick(); },
  };
}
