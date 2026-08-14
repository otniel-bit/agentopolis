import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { HOOK_EVENTS, installHooks, uninstallHooks } from "../src/hooks.js";

const HOOK_SCRIPT = "/Users/some one/.agentopolis/hook.js";
const OUR_ENTRY = {
  type: "command",
  command: `"${HOOK_SCRIPT}"`,
  async: true,
  timeout: 10,
};

function tmpSettingsPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentopolis-hooks-"));
  return path.join(dir, "settings.json");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listDir(p) {
  return fs.readdirSync(path.dirname(p)).sort();
}

// Simulates another tool's (rubin-buddy-style) pre-existing settings.
function otherToolSettings() {
  return {
    model: "opus",
    theme: "dark",
    statusLine: { type: "command", command: "~/.rubin-buddy/statusline.sh" },
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: "command", command: "~/.rubin-buddy/state.sh session_start", async: true },
          ],
        },
        {
          matcher: ".*",
          hooks: [{ type: "command", command: "~/.rubin-buddy/state.sh matched" }],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "~/.rubin-buddy/state.sh post_bash", timeout: 5 }],
        },
      ],
    },
  };
}

test("install into missing file registers every event", () => {
  const p = tmpSettingsPath();
  const result = installHooks(p, HOOK_SCRIPT);

  assert.deepEqual(result.installed, HOOK_EVENTS);
  assert.deepEqual(result.alreadyPresent, []);

  const settings = readJson(p);
  for (const event of HOOK_EVENTS) {
    assert.deepEqual(settings.hooks[event], [{ hooks: [OUR_ENTRY] }], event);
  }
  // no backup for a file that did not exist
  assert.deepEqual(listDir(p), ["settings.json"]);
});

test("install preserves other tools' hooks and appends ours after them", () => {
  const p = tmpSettingsPath();
  fs.writeFileSync(p, JSON.stringify(otherToolSettings(), null, 2));

  const result = installHooks(p, HOOK_SCRIPT);
  assert.deepEqual(result.installed, HOOK_EVENTS);

  const settings = readJson(p);
  const original = otherToolSettings();

  assert.deepEqual(settings.hooks.SessionStart, [
    ...original.hooks.SessionStart,
    { hooks: [OUR_ENTRY] },
  ]);
  assert.deepEqual(settings.hooks.PostToolUse, [
    ...original.hooks.PostToolUse,
    { hooks: [OUR_ENTRY] },
  ]);
  for (const event of HOOK_EVENTS) {
    if (event === "SessionStart" || event === "PostToolUse") continue;
    assert.deepEqual(settings.hooks[event], [{ hooks: [OUR_ENTRY] }], event);
  }
});

test("double install is idempotent", () => {
  const p = tmpSettingsPath();
  installHooks(p, HOOK_SCRIPT);
  const after1 = readJson(p);

  const result = installHooks(p, HOOK_SCRIPT);
  assert.deepEqual(result.installed, []);
  assert.deepEqual(result.alreadyPresent, HOOK_EVENTS);

  const after2 = readJson(p);
  assert.deepEqual(after2, after1);
  for (const event of HOOK_EVENTS) {
    const ours = after2.hooks[event]
      .flatMap((g) => g.hooks)
      .filter((h) => h.command.includes(".agentopolis"));
    assert.equal(ours.length, 1, event);
  }
});

test("uninstall removes exactly ours and leaves others intact", () => {
  const p = tmpSettingsPath();
  fs.writeFileSync(p, JSON.stringify(otherToolSettings(), null, 2));
  installHooks(p, HOOK_SCRIPT);

  const result = uninstallHooks(p);
  assert.deepEqual(result, { removed: HOOK_EVENTS.length });

  const settings = readJson(p);
  const original = otherToolSettings();
  assert.deepEqual(settings.hooks, original.hooks);
  assert.ok(!JSON.stringify(settings).includes(".agentopolis"));
});

test("uninstall then reinstall round-trips", () => {
  const p = tmpSettingsPath();
  fs.writeFileSync(p, JSON.stringify(otherToolSettings(), null, 2));

  installHooks(p, HOOK_SCRIPT);
  const firstInstall = readJson(p);

  uninstallHooks(p);
  const result = installHooks(p, HOOK_SCRIPT);

  assert.deepEqual(result.installed, HOOK_EVENTS);
  assert.deepEqual(readJson(p), firstInstall);
});

test("uninstall on a fresh install empties our entries", () => {
  const p = tmpSettingsPath();
  installHooks(p, HOOK_SCRIPT);

  const result = uninstallHooks(p);
  assert.deepEqual(result, { removed: HOOK_EVENTS.length });
  assert.deepEqual(readJson(p).hooks, {});
});

test("malformed JSON: install throws without writing anything", () => {
  const p = tmpSettingsPath();
  const garbage = "{ this is not json";
  fs.writeFileSync(p, garbage);

  assert.throws(() => installHooks(p, HOOK_SCRIPT), /Malformed JSON/);

  assert.equal(fs.readFileSync(p, "utf8"), garbage);
  assert.deepEqual(listDir(p), ["settings.json"]); // no backup, no tmp files
});

test("malformed JSON: uninstall returns removed 0 without writing", () => {
  const p = tmpSettingsPath();
  const garbage = "not even close";
  fs.writeFileSync(p, garbage);

  assert.deepEqual(uninstallHooks(p), { removed: 0 });
  assert.equal(fs.readFileSync(p, "utf8"), garbage);
});

test("missing file: uninstall returns removed 0 and creates nothing", () => {
  const p = tmpSettingsPath();
  assert.deepEqual(uninstallHooks(p), { removed: 0 });
  assert.deepEqual(listDir(p), []);
});

test("install backs up an existing settings file", () => {
  const p = tmpSettingsPath();
  const original = otherToolSettings();
  fs.writeFileSync(p, JSON.stringify(original, null, 2));

  installHooks(p, HOOK_SCRIPT);

  const backups = listDir(p).filter((f) =>
    /^settings\.json\.agentopolis-backup-\d+$/.test(f),
  );
  assert.equal(backups.length, 1);
  const backupContent = readJson(path.join(path.dirname(p), backups[0]));
  assert.deepEqual(backupContent, original);
});

test("model/theme/statusLine top-level keys survive install and uninstall", () => {
  const p = tmpSettingsPath();
  const original = otherToolSettings();
  fs.writeFileSync(p, JSON.stringify(original, null, 2));

  installHooks(p, HOOK_SCRIPT);
  let settings = readJson(p);
  assert.equal(settings.model, original.model);
  assert.equal(settings.theme, original.theme);
  assert.deepEqual(settings.statusLine, original.statusLine);

  uninstallHooks(p);
  settings = readJson(p);
  assert.equal(settings.model, original.model);
  assert.equal(settings.theme, original.theme);
  assert.deepEqual(settings.statusLine, original.statusLine);
});

// Launch-blocker guarantee: a tool that leaves junk in a user's Claude config
// earns exactly the kind of review that sinks a launch. After uninstall, the
// string ".agentopolis" must not survive anywhere in settings.json, and a
// coexisting tool's hooks must be byte-identical to before we touched them.
test("uninstall leaves zero trace, byte-identical to pre-install", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apolis-clean-"));
  const settings = path.join(dir, "settings.json");
  const original = {
    model: "claude-opus-5",
    theme: "dark",
    statusLine: { type: "command", command: "/Users/x/statusline.sh" },
    hooks: {
      SessionStart: [
        { hooks: [{ type: "command", command: '"/Users/x/.rubin-buddy/state.sh" idle', async: true }] },
        { matcher: ".*", hooks: [{ type: "command", command: "'/Users/x/Xirp/sessionStart.cjs'" }] },
      ],
      PreToolUse: [
        { matcher: ".*", hooks: [{ type: "command", command: "'/Users/x/Xirp/preToolUse.cjs'" }] },
      ],
      Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
    },
  };
  const before = JSON.stringify(original, null, 2) + "\n";
  fs.writeFileSync(settings, before);

  installHooks(settings, "/Users/x/.agentopolis/bridge/hook.mjs");
  assert.ok(fs.readFileSync(settings, "utf8").includes(".agentopolis"), "install landed");

  uninstallHooks(settings);
  const after = fs.readFileSync(settings, "utf8");
  assert.ok(!after.includes(".agentopolis"), "no trace of our hooks remains");
  assert.ok(!after.includes("agentopolis"), "not even the bare name remains");
  assert.deepEqual(JSON.parse(after), original, "config is semantically identical to pre-install");
});
