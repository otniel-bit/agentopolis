# Agentopolis

**The office your Claude Code agents clock into.**

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-blueviolet)
![Original art](https://img.shields.io/badge/art-original%20%26%20procedural-ff9ecf)

![Agentopolis](site/og.png)

Your repos get office suites. Named sessions get meeting rooms. Every subagent gets a desk, a headset, and a walk down the hall — and when it finishes, it comes back and tells the foreman. You run six sessions across three repos with a subagent swarm on top; terminal tabs don't scale, but a floor plan does. One glance tells you who's working, what they're actually doing, and which room has someone standing out front with a hand up, waiting for you.

**Two things make it more than a toy.** Nothing on screen is invented: every worker, state, and animation traces to a real Claude Code hook event, and clicking anything shows you the event behind it. And the office only celebrates **outcomes** — a test suite going green, a commit landing — never elapsed time, so a run that spins for twenty minutes and produces nothing doesn't get to look productive.

## Try it in 10 seconds

```bash
npx agentopolis --demo
```

No hooks, no setup — a synthetic agent swarm builds the city so you can tour it. When you're ready for the real thing:

```bash
npx agentopolis
```

It asks once for consent to add observation hooks to `~/.claude/settings.json`, then opens the city. New Claude Code sessions appear as they start. Requires Node 18+ and Claude Code.

**On macOS, the city opens as a desktop widget** — a small always-on-top panel that floats over your work on every Space, built locally on first run (~10s, needs Xcode Command Line Tools). Drag it by its title bar, resize from the edges, hit `⤢` for the full browser view. Everywhere else (or with `--browser`), it opens as a browser tab — same city, same engine.

Flags: `--port <n>` (default 4114) · `--widget` / `--browser` (choose the face) · `--no-open` · `--yes` (skip the consent prompt) · `--no-hooks` (never touch `~/.claude/settings.json` this run) · `--no-log` (no local event history).

## What you're looking at

| In your terminal | On the office floor |
|---|---|
| A repo (project directory) | An office **suite**, connected to the others by a hallway |
| An unnamed session | A **hot desk** on the open floor, cone and all |
| An explicitly named session | A **meeting room** with its name over the door — naming a session promotes its hot desk |
| A subagent | A **coworker** with a type-colored headset (yellow = foreman, blue = Explore, purple = Plan) |
| What an agent is doing right now | Truthful activity states — *researching, editing, testing, building, running, committing, installing, planning, delegating* — derived from real tool calls, never invented |
| A session waiting on permission or input | A pulsing **beacon** over the room and a coworker out front with a hand up |
| Tests going green / a commit landing | A green burst and a **✓ tests passed** banner. The only things the office celebrates |
| An idle agent | Drifts to the **water cooler** with a ☕ — because idle should look idle |

Sessions that end leave their room standing with the lights off. The floor plan persists across restarts (`~/.agentopolis/city.json`), so your suites and rooms keep their places.

## How it works

Claude Code hooks fire on session and tool events. Each one pipes through a tiny bridge that redacts the payload down to metadata, hands it to the local server, and exits 0 — always. Hooks are registered `async`, the bridge caps its local POST at under a second, and any failure is swallowed silently: Claude never waits on Agentopolis and never sees it fail.

```
Claude Code sessions
     │  hook events (SessionStart, PreToolUse, Stop, …)
     ▼
hook bridge (~/.agentopolis/bridge/hook.mjs)
     │  redact → metadata only, at the edge, before anything touches disk
     │  POST /hook ──── server down? ──▶ spool to ~/.agentopolis/spool
     ▼
localhost server (127.0.0.1 only)  ◀── reconciler: `claude agents --json`
     │  normalized events → reducers → world state ⇄ city.json
     ▼  SSE world snapshots
your browser: canvas pixel city
```

Hooks are best-effort by nature, so a reconciler periodically asks Claude Code for the authoritative session list (`claude agents --json`) and emits repair events for anything hooks missed — discoveries, renames, status changes, disappearances. The event vocabulary is a small provider-neutral protocol; see [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Privacy

The promise: **everything stays on your machine, and only metadata exists in the first place.** Redaction happens in the bridge, before any event is sent or spooled — the server, the disk, and the browser only ever see the sanitized form.

**Stored** (locally, under `~/.agentopolis`, directory mode `0700`):
- Session IDs, project paths, session names
- Tool names and activity classifications ("editing", "testing", …)
- Safe display targets: file names (basename + parent directory only), command previews truncated to 80 chars with secret-shaped values masked — tokens, passwords, bearer headers, URL credentials, long base64 runs
- Search patterns (truncated to 40 chars), task subjects, and tool descriptions (truncated to 80)
- Timestamps, and a redacted local event history (`events-YYYY-MM-DD.jsonl`, pruned after 90 days; disable with `--no-log`)

**Never stored, never transmitted:**
- File contents, diffs, `old_string`/`new_string`
- Prompts and assistant messages
- Tool responses, or any payload field outside the small metadata allowlist
- Anything, to anywhere: the server binds to `127.0.0.1` only — no cloud, no telemetry, no analytics

**Leaving:** `npx agentopolis --uninstall` removes the hooks from `~/.claude/settings.json` and the bridge from your machine. Your local city history stays in `~/.agentopolis` until you delete that one folder — then every trace is gone.

## Keyboard & controls

| Input | Action |
|---|---|
| Drag | Pan the city |
| Scroll | Zoom |
| Click a building or worker | Open the inspector |
| `F` | Fit the whole city in view |
| `A` | Toggle the attention drawer (everything waiting on you) |
| `/` | Search |
| `Esc` | Close panels / clear selection |

## FAQ

**Does it slow Claude Code down?**
No. Hooks are registered with `"async": true`, so Claude doesn't wait on them at all. The bridge itself reads stdin, redacts, makes one localhost POST capped at 900 ms, and exits 0 unconditionally — even a wedged server costs a background process about a second, invisible to your session.

**Does it work with providers other than Claude Code?**
Not yet, but the event protocol is provider-neutral by design — adapters translate native signals into a small normalized vocabulary, and nothing past the adapter knows or cares where events came from. Adapters welcome: [docs/PROTOCOL.md](docs/PROTOCOL.md).

**I already have hooks in settings.json. Will it clobber them?**
No. The installer merges non-destructively — it appends its own entries and never touches anyone else's, after backing up your settings to `settings.json.agentopolis-backup-<timestamp>`. Uninstall removes only entries whose command path contains `.agentopolis`.

**What happens to events while Agentopolis isn't running?**
The bridge spools redacted payloads to `~/.agentopolis/spool` (bounded at 500). On the next launch the city drains the spool, and the reconciler catches up on session state from `claude agents --json`. You come back to a city that's current, not frozen.

**Can I keep an unnamed session as a permanent building?**
Yes — click its tent and hit **Pin as permanent building** in the inspector. (Renaming the session in Claude Code does the same thing, with more ceremony.)

## Performance

An always-on widget that eats your battery gets uninstalled, so these are measured, not asserted (Apple silicon, `ps` sampling over 20s):

| | CPU | Memory |
|---|---|---|
| Server, idle | ~0.5% of one core | 67 MB |
| Widget, busy office (3 suites, 8 workers) | ~14% of one core | 81 MB |
| Widget, idle office | ~6–9% of one core | 81 MB |
| Widget, popover closed | rendering fully paused | — |

Pixel art is stepped animation, so the renderer caps at 20fps while work is happening and 8fps when the office is quiet; static layers (floors, walls, plant pots, the plan grid) are baked once and blitted. `prefers-reduced-motion` is honored, and the 🌿 button toggles a calm mode that removes walking, particles, and celebration bursts while keeping every state readable.

## Honest comparisons

**There is another `agentopolis`.** [CodeBlackwell/agentopolis](https://github.com/CodeBlackwell/agentopolis) is an unrelated Python project (on PyPI) that renders a codebase as an isometric city from git history. Same name, different tool, different registry — this one is the npm package `agentopolis`. No affiliation, and no shade: it got there first on PyPI.

**[Munder Difflin](https://github.com/chaitanyagiri/munder-difflin) is a harness; Agentopolis is a viewer.** It spawns and orchestrates agents for you (Electron, real terminals, an orchestrator, shared memory) and draws an office as one panel of a much larger app. Agentopolis spawns nothing and orchestrates nothing — it watches the sessions you already start, in a menu-bar widget, installed with one command. If you want a team of agents managed for you, use theirs. If you want to *see* what your own agents are doing without adopting a new workflow, use this. They install hooks per-session and we install globally, so **you can run both at once.**

**On art:** every sprite, room, and prop here is drawn procedurally in code — no tilesets, no sprite sheets, no third-party art licenses, nothing to relicense later. The repo contains exactly one image, and it's a screenshot.

## Roadmap

- **Act from the city** — approve or deny permission requests without finding the right terminal tab
- **Widget on Windows/Linux** — the always-on-top panel is macOS-only today
- **More providers** — Codex, Gemini CLI, Cursor, via protocol adapters
- **Native notifications** — a knock on the glass when a session needs you

---

MIT © [otniel-bit](https://github.com/otniel-bit/agentopolis). Built for people who run too many agents at once.
