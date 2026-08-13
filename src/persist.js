// Local persistence under ~/.agentopolis (0700): city geography, redacted
// event log, hook spool drain, port file. No cloud, no network.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dehydrate, hydrate } from './state.js';

export function homeDir() {
  return process.env.AGENTOPOLIS_HOME || path.join(os.homedir(), '.agentopolis');
}

export function ensureHome() {
  const dir = homeDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(dir, 'spool'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(dir, 'quarantine'), { recursive: true, mode: 0o700 });
  return dir;
}

function cityPath() {
  return path.join(homeDir(), 'city.json');
}

export function loadCity(world) {
  try {
    const raw = fs.readFileSync(cityPath(), 'utf8');
    hydrate(world, JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

let saveTimer = null;
export function saveCity(world, { immediate = false } = {}) {
  const write = () => {
    saveTimer = null;
    try {
      const tmp = cityPath() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(dehydrate(world)), { mode: 0o600 });
      fs.renameSync(tmp, cityPath());
    } catch { /* persistence is best-effort; never crash the city */ }
  };
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    write();
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(write, 1500);
}

// Redacted normalized events only — this is the local history log.
export function appendEventLog(evt) {
  try {
    const day = new Date(evt.at).toISOString().slice(0, 10);
    const file = path.join(homeDir(), `events-${day}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(evt) + '\n', { mode: 0o600 });
  } catch { /* best-effort */ }
}

export function pruneEventLogs(maxDays = 90) {
  try {
    const dir = homeDir();
    const cutoff = Date.now() - maxDays * 86400000;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^events-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (m && new Date(m[1]).getTime() < cutoff) fs.unlinkSync(path.join(dir, f));
    }
  } catch { /* best-effort */ }
}

// Hook payloads spooled while the server was down. Returns parsed payloads
// (already redacted by the bridge) and removes the files; malformed files
// are quarantined rather than retried forever.
export function drainSpool() {
  const spool = path.join(homeDir(), 'spool');
  const out = [];
  let files = [];
  try {
    files = fs.readdirSync(spool).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return out;
  }
  for (const f of files.slice(0, 2000)) {
    const p = path.join(spool, f);
    try {
      const stat = fs.lstatSync(p);
      if (!stat.isFile() || stat.size > 262144) throw new Error('bad spool file');
      out.push(JSON.parse(fs.readFileSync(p, 'utf8')));
      fs.unlinkSync(p);
    } catch {
      try { fs.renameSync(p, path.join(homeDir(), 'quarantine', f)); } catch { /* drop */ }
    }
  }
  return out;
}

export function writePortFile(port) {
  try {
    fs.writeFileSync(path.join(homeDir(), 'port'), String(port), { mode: 0o600 });
  } catch { /* best-effort */ }
}
