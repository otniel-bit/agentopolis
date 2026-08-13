#!/usr/bin/env node
// Agentopolis hook bridge. Claude Code pipes one hook payload to stdin; we
// redact it, hand it to the local server, and spool (redacted) if the server
// is down. Registered async — but still: never block, never fail, exit 0.
// This file is copied to ~/.agentopolis/bridge/ next to redact.js.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { redactHookPayload } from './redact.js';

const HOME = process.env.AGENTOPOLIS_HOME || path.join(os.homedir(), '.agentopolis');
const MAX_BYTES = 262144;
const SPOOL_CAP = 500;

function readStdin() {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    process.stdin.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BYTES) chunks.push(c);
    });
    process.stdin.on('end', () => resolve(size > MAX_BYTES ? null : Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(null));
    setTimeout(() => resolve(null), 3000).unref();
  });
}

function port() {
  try { return parseInt(fs.readFileSync(path.join(HOME, 'port'), 'utf8'), 10) || 4114; }
  catch { return 4114; }
}

function spool(safe) {
  try {
    const dir = path.join(HOME, 'spool');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.readdirSync(dir).length >= SPOOL_CAP) return; // bounded, drop oldest-first is overkill
    const name = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`;
    fs.writeFileSync(path.join(dir, name), JSON.stringify(safe), { mode: 0o600 });
  } catch { /* silent */ }
}

const raw = await readStdin();
if (!raw) process.exit(0);

let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

let safe;
try {
  safe = redactHookPayload(payload);
  safe.__agentopolis_ts = Date.now();
} catch { process.exit(0); }

try {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 900);
  await fetch(`http://127.0.0.1:${port()}/hook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safe),
    signal: ctl.signal,
  });
  clearTimeout(t);
} catch {
  spool(safe);
}
process.exit(0);
