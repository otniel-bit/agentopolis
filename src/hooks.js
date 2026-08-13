import fs from "node:fs";

export const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
];

// Our entries are identified by the command path containing this marker.
const OWNER_MARK = ".agentopolis";

function isOurHook(hook) {
  return typeof hook?.command === "string" && hook.command.includes(OWNER_MARK);
}

function groupHasOurHook(group) {
  return Array.isArray(group?.hooks) && group.hooks.some(isOurHook);
}

function readSettings(settingsPath) {
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { settings: {}, existed: false };
    throw err;
  }
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Malformed JSON in ${settingsPath}: ${err.message}. ` +
        "Nothing was written; fix the file and retry.",
      { cause: err },
    );
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(
      `Malformed settings in ${settingsPath}: expected a JSON object. Nothing was written.`,
    );
  }
  return { settings, existed: true };
}

// tmp file lives next to the target so rename stays on one filesystem (atomic).
function writeAtomic(settingsPath, settings) {
  const tmpPath = `${settingsPath}.agentopolis-tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + "\n");
  fs.renameSync(tmpPath, settingsPath);
}

export function installHooks(settingsPath, hookScriptPath) {
  const { settings, existed } = readSettings(settingsPath);

  if (existed) {
    const backupPath = `${settingsPath}.agentopolis-backup-${Math.floor(Date.now() / 1000)}`;
    fs.copyFileSync(settingsPath, backupPath);
  }

  if (settings.hooks === null || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  const hooks = settings.hooks;

  const installed = [];
  const alreadyPresent = [];
  for (const event of HOOK_EVENTS) {
    if (!Array.isArray(hooks[event])) hooks[event] = [];
    const groups = hooks[event];
    if (groups.some(groupHasOurHook)) {
      alreadyPresent.push(event);
      continue;
    }
    groups.push({
      hooks: [
        {
          type: "command",
          // quoted because the script path may contain spaces
          command: `"${hookScriptPath}"`,
          async: true,
          timeout: 10,
        },
      ],
    });
    installed.push(event);
  }

  writeAtomic(settingsPath, settings);
  return { installed, alreadyPresent };
}

export function uninstallHooks(settingsPath) {
  let settings;
  try {
    ({ settings } = readSettings(settingsPath));
  } catch {
    return { removed: 0 };
  }

  const hooks = settings.hooks;
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    return { removed: 0 };
  }

  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;

    let eventChanged = false;
    const keptGroups = [];
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) {
        keptGroups.push(group);
        continue;
      }
      const keptHooks = group.hooks.filter((hook) => !isOurHook(hook));
      if (keptHooks.length === group.hooks.length) {
        keptGroups.push(group);
        continue;
      }
      removed += group.hooks.length - keptHooks.length;
      eventChanged = true;
      if (keptHooks.length > 0) keptGroups.push({ ...group, hooks: keptHooks });
    }

    if (!eventChanged) continue;
    if (keptGroups.length === 0) delete hooks[event];
    else hooks[event] = keptGroups;
  }

  if (removed > 0) writeAtomic(settingsPath, settings);
  return { removed };
}
