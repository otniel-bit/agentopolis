// Local usage tracker. Reads ONLY the numeric `usage` records and model names
// from Claude Code's own transcript files — never message content, never
// prompts, never tool payloads. Aggregates cost per session, per day, per week,
// and per model, entirely on this machine.
//
// This is a read-only accounting feature and is deliberately independent of the
// city's event pipeline: if the transcript format changes, usage degrades to
// zeros and nothing else breaks.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { homeDir } from './persist.js';

// USD per million tokens, from the published Claude API price list.
// Cache reads bill at 0.1x input; cache writes at 1.25x (5m TTL) or 2x (1h).
const PRICING = {
  'claude-fable-5': { in: 10, out: 50 },
  'claude-mythos-5': { in: 10, out: 50 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-opus-4-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15, introIn: 2, introOut: 10, introUntil: '2026-08-31' },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
const CACHE_READ_RATE = 0.1;
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;

// Display names, so the UI never shows a raw model id.
const LABELS = {
  'claude-fable-5': 'Fable 5',
  'claude-mythos-5': 'Mythos 5',
  'claude-opus-5': 'Opus 5',
  'claude-opus-4-8': 'Opus 4.8',
  'claude-opus-4-7': 'Opus 4.7',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-opus-4-5': 'Opus 4.5',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
};

// Variant suffixes are deployment identifiers, not separate models:
// "claude-fable-5[1m]" and "claude-opus-5-fast" price as their base model.
export function normalizeModel(raw) {
  if (typeof raw !== 'string' || !raw) return 'unknown';
  // Claude Code labels locally-generated messages "<synthetic>" — not a model.
  if (raw.startsWith('<')) return 'unknown';
  let m = raw.trim().toLowerCase();
  m = m.replace(/\[[^\]]*\]$/, '');           // [1m] context variant
  m = m.replace(/-fast$/, '');                 // fast mode
  m = m.replace(/-(\d{8})$/, '');              // dated snapshot
  return m;
}

export function modelLabel(id) {
  return LABELS[id] || id.replace(/^claude-/, '');
}

function rates(model, atISO) {
  const p = PRICING[model];
  if (!p) return null;
  if (p.introUntil && atISO && atISO.slice(0, 10) <= p.introUntil) {
    return { in: p.introIn, out: p.introOut };
  }
  return { in: p.in, out: p.out };
}

// Cost of one usage record, in USD.
export function costOf(model, u, atISO) {
  const r = rates(model, atISO);
  if (!r) return 0;
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cc = u.cache_creation || {};
  const w5 = cc.ephemeral_5m_input_tokens ?? (u.cache_creation_input_tokens || 0);
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const inputCost =
    (input + cacheRead * CACHE_READ_RATE + w5 * CACHE_WRITE_5M + w1h * CACHE_WRITE_1H) * r.in;
  return (inputCost + output * r.out) / 1e6;
}

function emptyTotals() {
  return { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
}

function addTotals(dst, model, u, cost) {
  dst.cost += cost;
  dst.input += u.input_tokens || 0;
  dst.output += u.output_tokens || 0;
  dst.cacheRead += u.cache_read_input_tokens || 0;
  const cc = u.cache_creation || {};
  dst.cacheWrite += (cc.ephemeral_5m_input_tokens || 0) + (cc.ephemeral_1h_input_tokens || 0) ||
    (u.cache_creation_input_tokens || 0);
  dst.requests += 1;
}

function mergeTotals(dst, src) {
  for (const k of Object.keys(src)) dst[k] = (dst[k] || 0) + src[k];
}

// ——— per-file scanning (incremental: transcripts are append-only) ———

function newFileAgg() {
  return { days: {}, sessions: {}, models: {} };
}

function recordInto(agg, evt) {
  const msg = evt.message;
  if (!msg || typeof msg !== 'object') return;
  const u = msg.usage;
  if (!u || typeof u !== 'object') return;
  const at = typeof evt.timestamp === 'string' ? evt.timestamp : null;
  const model = normalizeModel(msg.model);
  if (model === 'unknown') return;
  const cost = costOf(model, u, at);
  const day = (at || new Date().toISOString()).slice(0, 10);

  agg.days[day] = agg.days[day] || emptyTotals();
  addTotals(agg.days[day], model, u, cost);

  agg.models[model] = agg.models[model] || emptyTotals();
  addTotals(agg.models[model], model, u, cost);

  const sid = evt.sessionId || evt.session_id;
  if (sid) {
    const s = agg.sessions[sid] || (agg.sessions[sid] = {
      ...emptyTotals(), model, firstAt: at, lastAt: at, cwd: evt.cwd || null,
    });
    addTotals(s, model, u, cost);
    s.model = model;                    // last model wins for display
    if (at && (!s.lastAt || at > s.lastAt)) s.lastAt = at;
    if (at && (!s.firstAt || at < s.firstAt)) s.firstAt = at;
    if (evt.cwd) s.cwd = evt.cwd;
  }
}

function mergeFileAgg(dst, src) {
  for (const [day, t] of Object.entries(src.days)) {
    dst.days[day] = dst.days[day] || emptyTotals();
    mergeTotals(dst.days[day], t);
  }
  for (const [m, t] of Object.entries(src.models)) {
    dst.models[m] = dst.models[m] || emptyTotals();
    mergeTotals(dst.models[m], t);
  }
  for (const [sid, s] of Object.entries(src.sessions)) {
    const cur = dst.sessions[sid];
    if (!cur) { dst.sessions[sid] = { ...s }; continue; }
    const { model, firstAt, lastAt, cwd, ...nums } = s;
    mergeTotals(cur, nums);
    cur.model = model || cur.model;
    if (cwd) cur.cwd = cwd;
    if (lastAt && (!cur.lastAt || lastAt > cur.lastAt)) cur.lastAt = lastAt;
    if (firstAt && (!cur.firstAt || firstAt < cur.firstAt)) cur.firstAt = firstAt;
  }
}

// Streams a file from `offset`, parsing only usage-bearing lines. Async so a
// first-run scan of a large transcript never blocks the event loop.
async function scanFile(file, offset) {
  const agg = newFileAgg();
  let read = offset;
  await new Promise((resolve) => {
    let stream;
    try {
      stream = fs.createReadStream(file, { start: offset, encoding: 'utf8' });
    } catch {
      return resolve();
    }
    stream.on('error', resolve);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      read += Buffer.byteLength(line, 'utf8') + 1;
      if (!line || line.indexOf('"usage"') === -1) return;
      try { recordInto(agg, JSON.parse(line)); } catch { /* partial or foreign line */ }
    });
    rl.on('close', resolve);
    rl.on('error', resolve);
  });
  return { agg, offset: read };
}

function transcriptFiles() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(root, 0);
  return out;
}

// ——— cache ———

function cachePath() {
  return path.join(homeDir(), 'usage-cache.json');
}

function loadCache() {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
    if (c && c.v === 1 && c.files) return c;
  } catch { /* cold start */ }
  return { v: 1, files: {} };
}

function saveCache(cache) {
  try {
    const tmp = cachePath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 });
    fs.renameSync(tmp, cachePath());
  } catch { /* best-effort */ }
}

// ——— window math ———

function startOfWeekISO(now) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;          // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumDays(days, fromDay, toDay) {
  const t = emptyTotals();
  for (const [day, v] of Object.entries(days)) {
    if (day >= fromDay && day <= toDay) mergeTotals(t, v);
  }
  return t;
}

function dayKey(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ——— public API ———

let snapshot = null;
let scanning = false;

export function lastSnapshot() {
  return snapshot;
}

// Rebuilds the usage snapshot. Cheap after the first run: only the newly
// appended bytes of changed transcripts are parsed.
export async function refreshUsage() {
  if (scanning) return snapshot;
  scanning = true;
  try {
    const cache = loadCache();
    const files = transcriptFiles();
    const alive = new Set(files);
    const total = newFileAgg();

    for (const file of files) {
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      const prev = cache.files[file];
      if (prev && prev.size === stat.size && prev.mtimeMs === stat.mtimeMs) {
        mergeFileAgg(total, prev.agg);
        continue;
      }
      // A shrunken file means it was rewritten — rescan from the top.
      const from = prev && stat.size >= prev.offset ? prev.offset : 0;
      const base = from > 0 && prev ? prev.agg : newFileAgg();
      const { agg, offset } = await scanFile(file, from);
      const merged = newFileAgg();
      mergeFileAgg(merged, base);
      mergeFileAgg(merged, agg);
      cache.files[file] = { size: stat.size, mtimeMs: stat.mtimeMs, offset, agg: merged };
      mergeFileAgg(total, merged);
    }
    for (const f of Object.keys(cache.files)) if (!alive.has(f)) delete cache.files[f];
    saveCache(cache);

    const now = new Date();
    const today = dayKey(now);
    const weekStart = dayKey(startOfWeekISO(now));
    const d7 = dayKey(new Date(now.getTime() - 6 * 86400000));
    const d30 = dayKey(new Date(now.getTime() - 29 * 86400000));

    // Per-model totals for the current week, so "how much on Fable 5 this
    // week" is answerable. Day buckets carry no model split, so this is
    // derived from sessions: a session counts toward the week it was last
    // active in — an approximation the UI labels as such.
    const weekModels = {};
    for (const s of Object.values(total.sessions)) {
      if (!s.lastAt || s.lastAt.slice(0, 10) < weekStart) continue;
      const m = s.model || 'unknown';
      weekModels[m] = weekModels[m] || emptyTotals();
      mergeTotals(weekModels[m], {
        cost: s.cost, input: s.input, output: s.output,
        cacheRead: s.cacheRead, cacheWrite: s.cacheWrite, requests: s.requests,
      });
    }

    const sessions = Object.entries(total.sessions)
      .map(([id, s]) => ({
        id,
        model: s.model,
        modelLabel: modelLabel(s.model || 'unknown'),
        project: s.cwd ? path.basename(s.cwd) : null,
        cost: s.cost,
        input: s.input,
        output: s.output,
        cacheRead: s.cacheRead,
        cacheWrite: s.cacheWrite,
        requests: s.requests,
        firstAt: s.firstAt,
        lastAt: s.lastAt,
      }))
      .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));

    snapshot = {
      generatedAt: Date.now(),
      today: sumDays(total.days, today, today),
      week: sumDays(total.days, weekStart, today),
      last7: sumDays(total.days, d7, today),
      last30: sumDays(total.days, d30, today),
      allTime: sumDays(total.days, '0000-00-00', '9999-99-99'),
      weekStart,
      models: Object.entries(total.models)
        .map(([id, t]) => ({ id, label: modelLabel(id), ...t }))
        .sort((a, b) => b.cost - a.cost),
      weekModels: Object.entries(weekModels)
        .map(([id, t]) => ({ id, label: modelLabel(id), ...t }))
        .sort((a, b) => b.cost - a.cost),
      sessions: sessions.slice(0, 60),
      byDay: Object.entries(total.days)
        .filter(([d]) => d >= d30)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, t]) => ({ day, cost: t.cost })),
      priced: true,
    };
    return snapshot;
  } catch {
    return snapshot;
  } finally {
    scanning = false;
  }
}

export function startUsageTracker({ intervalMs = 60000 } = {}) {
  refreshUsage();
  const timer = setInterval(refreshUsage, intervalMs);
  if (timer.unref) timer.unref();
  return { stop: () => clearInterval(timer), refresh: refreshUsage };
}
