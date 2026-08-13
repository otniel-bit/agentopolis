#!/usr/bin/env node
// Agentopolis CLI: `npx agentopolis` — start the city, install hooks (with
// consent), open the browser. `--demo` runs a synthetic swarm, `--uninstall`
// removes every trace from ~/.claude/settings.json.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createWorld } from '../src/state.js';
import { createCityServer } from '../src/server.js';
import { ensureHome, homeDir, loadCity, saveCity, writePortFile, drainSpool, pruneEventLogs } from '../src/persist.js';
import { installHooks, uninstallHooks } from '../src/hooks.js';
import { startReconciler } from '../src/reconcile.js';
import { startDemo } from '../src/demo.js';

const PKG_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

const args = new Set(process.argv.slice(2));
const argValue = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

if (args.has('--help') || args.has('-h')) {
  console.log(`
  agentopolis v${VERSION} — your AI coding agents as a living pixel city

  npx agentopolis              start the city (asks once to install hooks)
  npx agentopolis --demo       tour the city with a synthetic agent swarm
  npx agentopolis --uninstall  remove hooks + bridge from this machine

  --port <n>     port to listen on (default 4114)
  --no-open      don't open the browser
  --no-hooks     never touch ~/.claude/settings.json this run
  --yes          install hooks without asking
  --no-log       don't write the local event history log

  Everything stays on your machine: 127.0.0.1 only, metadata only.
`);
  process.exit(0);
}
if (args.has('--version') || args.has('-v')) {
  console.log(VERSION);
  process.exit(0);
}

const bridgeDir = path.join(homeDir(), 'bridge');
const bridgePath = path.join(bridgeDir, 'hook.mjs');

if (args.has('--uninstall')) {
  const { removed } = uninstallHooks(SETTINGS);
  try { fs.rmSync(bridgeDir, { recursive: true, force: true }); } catch { /* fine */ }
  console.log(`  Removed ${removed} hook entr${removed === 1 ? 'y' : 'ies'} from ${SETTINGS}`);
  console.log('  Your city history in ~/.agentopolis is untouched (delete it any time).');
  process.exit(0);
}

function installBridge() {
  fs.mkdirSync(bridgeDir, { recursive: true, mode: 0o700 });
  for (const f of ['hook-bridge.mjs', 'redact.js']) {
    const dest = path.join(bridgeDir, f === 'hook-bridge.mjs' ? 'hook.mjs' : f);
    fs.copyFileSync(path.join(PKG_ROOT, 'src', f), dest);
    fs.chmodSync(dest, 0o755);
  }
}

function hooksInstalled() {
  try {
    return fs.readFileSync(SETTINGS, 'utf8').includes('.agentopolis');
  } catch {
    return false;
  }
}

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y?$|^yes$/i.test(answer.trim()));
    });
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  execFile(cmd, [url], () => {});
}

async function main() {
  ensureHome();
  pruneEventLogs();

  const world = createWorld();
  loadCity(world);

  const city = createCityServer(world, { logEvents: !args.has('--no-log'), version: VERSION });

  // Find a port; if another Agentopolis already owns it, just open that one.
  const wanted = parseInt(argValue('--port', '4114'), 10) || 4114;
  let port = null;
  for (let p = wanted; p < wanted + 20 && port === null; p++) {
    try {
      port = await city.listen(p);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      const running = await fetch(`http://127.0.0.1:${p}/api/health`, { signal: AbortSignal.timeout(500) })
        .then((r) => r.json()).catch(() => null);
      if (running && running.ok) {
        console.log(`  Agentopolis is already running → http://127.0.0.1:${p}`);
        if (!args.has('--no-open')) openBrowser(`http://127.0.0.1:${p}`);
        process.exit(0);
      }
    }
  }
  if (port === null) {
    console.error('  Could not find a free port. Try --port <n>.');
    process.exit(1);
  }
  writePortFile(port);
  const url = `http://127.0.0.1:${port}`;

  console.log(`
   ┌─────────────────────────────────────────────┐
   │            A G E N T O P O L I S            │
   │   your agents are building a city  v${VERSION.padEnd(7)}│
   └─────────────────────────────────────────────┘
`);

  // Replay anything the bridge spooled while we were away.
  const spooled = drainSpool();
  for (const payload of spooled) city.ingestHookPayload(payload);
  if (spooled.length) console.log(`  Caught up on ${spooled.length} event(s) from while the city slept.`);

  // Hook install: explicit consent, loud about what it does.
  if (!args.has('--no-hooks') && !args.has('--demo')) {
    installBridge(); // refresh bridge code on every run so upgrades stick
    if (!hooksInstalled()) {
      console.log('  To see LIVE sessions, Agentopolis adds observation hooks to');
      console.log(`  ${SETTINGS}`);
      console.log('  (async, metadata-only, existing hooks untouched, `npx agentopolis --uninstall` removes them)\n');
      const yes = args.has('--yes') || await ask('  Install Claude Code hooks now? [Y/n] ');
      if (yes) {
        const { installed } = installHooks(SETTINGS, bridgePath);
        console.log(`  Installed hooks for ${installed.length} events. New sessions appear as they start.\n`);
      } else {
        console.log('  Skipped. Run with --yes later, or use --demo to tour the city.\n');
      }
    }
  }

  let demo = null;
  let reconciler = null;
  if (args.has('--demo')) {
    demo = startDemo((evt) => city.ingest(evt));
    console.log('  DEMO MODE — a synthetic agent swarm is building the city.\n');
  } else {
    reconciler = startReconciler(world, (evt) => city.ingest(evt));
  }

  console.log(`  City is live → ${url}\n`);
  if (!args.has('--no-open')) openBrowser(url);

  const shutdown = () => {
    if (demo) demo.stop();
    if (reconciler) reconciler.stop();
    saveCity(world, { immediate: true });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('  Agentopolis failed to start:', err.message);
  process.exit(1);
});
