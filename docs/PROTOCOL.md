# Agentopolis Event Protocol v1

This document is the **binding contract** between all Agentopolis modules. Provider
adapters (Claude Code today, others later) translate native signals into these
events. Reducers, persistence, the renderer, and demo mode speak ONLY this protocol.
Provider-native payloads never travel past the adapter.

## 1. Normalized event envelope

Every event is a flat JSON object:

```js
{
  v: 1,                      // protocol version (integer)
  id: "e-<uuid>",            // unique event id, used for dedup
  type: "activity.started",  // see catalog below
  at: 1723580000000,         // when it happened (ms epoch, local clock ok)
  provider: "claude-code",   // adapter that produced it ("demo" for demo mode)
  session: "abc-123",        // provider session id (string) — required for all session-scoped events
  agent: "root",             // agent id within session: "root" for the main loop,
                             // provider agent_id for subagents. Required for agent-scoped events.
  project: "/Users/x/repo",  // absolute project root (cwd), the district key
  data: { ... }              // type-specific payload, ALREADY REDACTED
}
```

Rules:
- Unknown `type` values must be ignored by reducers (logged to diagnostics, never crash).
- Duplicate `id` must be dropped by the reducer.
- Events may arrive out of order; reducers must tolerate a completion without a start
  (create the record) and a start after completion (ignore reopen).
- `data` must never contain: file contents, prompts, assistant messages, env values,
  secrets, or unsanitized commands. Redaction happens in the adapter (see redact.js).

## 2. Event catalog

### Session events
| type | data | meaning |
|---|---|---|
| `session.started` | `{ source: "startup"\|"resume"\|"clear"\|"unknown", name?: string }` | session discovered live |
| `session.ended` | `{ reason?: string }` | session ended |
| `session.named` | `{ name: string, origin: "explicit"\|"generated"\|"unknown" }` | name observed/changed |
| `session.status` | `{ status: "working"\|"idle"\|"blocked", waitingFor?: string }` | reconciled status |

### Agent events
| type | data | meaning |
|---|---|---|
| `agent.spawned` | `{ agentType: string }` | subagent started (agent = its id) |
| `agent.finished` | `{ outcome: "completed"\|"failed"\|"stopped" }` | subagent done |

### Activity events
| type | data | meaning |
|---|---|---|
| `activity.started` | `{ kind: ActivityKind, label: string, target?: string, tool: string, toolUseId?: string, ruleId: string }` | tool call began |
| `activity.ended` | `{ outcome: "ok"\|"fail", tool: string, toolUseId?: string, errorCategory?: string }` | tool call finished |

`ActivityKind` = `planning | researching | editing | creating | testing | building |
running | version_control | installing | delegating | unknown`

### Attention events
| type | data | meaning |
|---|---|---|
| `attention.raised` | `{ kind: "permission"\|"input"\|"question", summary: string }` | session needs the human |
| `attention.cleared` | `{}` | no longer waiting |

### Task + turn events
| type | data | meaning |
|---|---|---|
| `task.created` | `{ taskId?: string, subject: string }` | work order created |
| `task.completed` | `{ taskId?: string }` | work order done |
| `turn.completed` | `{}` | root turn finished (Stop) — session is idle, not "done" |
| `turn.failed` | `{ errorCategory?: string }` | root turn errored |

## 3. World snapshot (server → browser via SSE)

The server broadcasts the full world snapshot (throttled ≥ 10/s max) as SSE event
`world`. The client keeps the previous snapshot and diffs to trigger animations.

```js
{
  seq: 184,                 // monotonically increasing; gap = client refetches
  now: 1723580001000,
  summary: { working: 3, waiting: 1, needsYou: 1, failed: 0, doneRecent: 2 },
  districts: [
    { id: "d-<hash>", name: "repo", path: "/Users/x/repo", col: 0, row: 0 }
  ],
  buildings: [
    {
      id: "b-<id>", districtId: "d-<hash>",
      plot: { x: 1, y: 0 },              // grid slot within district, persistent
      name: "auth-refactor",             // display name
      permanent: true,                    // false = temporary worksite (tent)
      nameOrigin: "explicit",
      state: "working"|"waiting"|"attention"|"failed"|"idle"|"closed",
      sessionId: "abc-123" | null,        // live session currently attached
      attention: { kind, summary, since } | null,
      lastActiveAt: 1723579990000
    }
  ],
  agents: [
    {
      id: "abc-123:root", buildingId: "b-<id>",
      agentType: "root"|"Explore"|"Plan"|..., isRoot: true,
      state: "active"|"waiting"|"attention"|"done"|"failed",
      activity: { kind: "testing", label: "Running tests", target: "npm test" } | null,
      spawnedAt: 1723579000000, finishedAt: null,
      seed: 0.4823                        // stable [0,1) appearance seed
    }
  ],
  attention: [ { id, buildingId, agentId, kind, summary, since } ],
  feed: [ /* last 60 normalized events, redacted, for the inspector */ ]
}
```

## 4. Module contracts

### `src/classify.js`
```js
classify(toolName: string, toolInput: object|undefined) ->
  { kind: ActivityKind, label: string, target?: string, ruleId: string }
```
Pure, deterministic, never throws. Unknown tools → `{ kind: "unknown", label: toolName, ruleId: "fallback.v1" }`.
- Read/Glob/Grep/WebFetch/WebSearch → researching (label like "Reading auth.ts", target = basename or short query)
- Edit/Write/NotebookEdit → editing (Write to a brand-new-looking path is still "editing"; keep it simple)
- Task/Agent tool → delegating
- TodoWrite/TaskCreate → planning
- Bash → subclassify by command: testing / building / version_control / installing / running
  (conservative regexes; see PRD patterns: npm test, pytest, cargo test, jest, vitest, go test…)
- target must be SAFE for display: basename for files, first token(s) for commands, never full content.

### `src/redact.js`
```js
redactHookPayload(payload: object) -> object   // deep-copied, safe subset only
sanitizeCommand(cmd: string) -> string          // ≤ 80 chars, secrets masked
```
Keeps: hook_event_name, session_id, agent_id, agent_type, cwd, tool_name, tool_use_id,
tool_input SAFE FIELDS ONLY (file_path, command→sanitized, description, pattern, url host),
permission_mode, timestamps. Drops everything else (content, new_string, old_string, prompt,
message bodies, tool_response bodies). sanitizeCommand masks tokens/passwords/bearer headers/
env-var values/base64 runs, truncates heredocs.

### `src/hooks.js`
```js
installHooks(settingsPath, hookScriptPath) -> { installed: string[], alreadyPresent: string[] }
uninstallHooks(settingsPath) -> { removed: number }
```
Merges into `~/.claude/settings.json` non-destructively (other tools' hooks untouched).
Every entry we add uses command = hookScriptPath and `"async": true` (PermissionRequest
and SessionEnd excepted from async if docs require sync — keep async everywhere since we
only observe). Identify our entries for uninstall by command path containing `.agentopolis`.
Backup settings.json to settings.json.agentopolis-backup-<ts> before first write.
Events registered: SessionStart, SessionEnd, PreToolUse, PostToolUse, PostToolUseFailure,
PermissionRequest, PermissionDenied, Notification, SubagentStart, SubagentStop,
TaskCreated, TaskCompleted, Stop, StopFailure.

### `src/demo.js`
```js
startDemo(emit: (evt) => void) -> { stop: () => void }
```
Emits protocol events (provider: "demo") on timers telling a story: three projects
("saturn-api", "pixel-shop", "dotfiles"), sessions starting as worksites, one renamed
"auth-refactor" → promotion, subagents spawning (Explore/Plan/general-purpose), truthful
activity rotation, one permission attention that self-resolves after ~25s, one failure
+ recovery, completions with confetti moments. Loops forever, staggered, calm pacing.
Every emitted event must validate against this protocol.

## 5. Reducer state-precedence (for building/agent visual state)

attention > failed > working/active > waiting > idle > closed.
A `turn.completed` sets session idle (NOT completed). `session.ended` closes the
building (stays in city, lights off). Activities with no `activity.ended` after
10 min become stale → agent falls back to idle (never marked failed).

## 6. Building promotion

Sessions appear as temporary worksites. Promotion to permanent building happens when:
- `session.named` with origin "explicit", or
- user pins via UI (POST /api/pin).
Generated-looking names (e.g. `dirname-a1b2`, matching /^[a-z0-9-]+-[0-9a-f]{2,4}$/ where
prefix ≈ project dirname, or reconciler marks origin "generated") do NOT promote.
A rename of a promoted building renames it in place — never a second building.
