# Agentopolis — Product Hunt Launch Kit

Weekend launch, scheduled for **12:01 AM PT**. Everything below is written against the
actual codebase (`docs/PROTOCOL.md`, `bin/agentopolis.js`, `src/hooks.js`, `src/redact.js`) —
no claim in this kit exceeds what the code does.

---

## 1. Product name + taglines

**Product name:** Agentopolis

**Framing rule (why these changed):** research on this category found that the *same
product* scored 1, 3, and 1,006 points on Hacker News depending only on how it was
titled — the 1,006-point version led with the cultural artifact ("Warcraft III Peon
Voice Notifications for Claude Code") and the 1-point version led with the mechanism
("a pixel desktop pet that watches your AI coding agents"). So: **lead with the office,
let the integration be the plumbing.** Never open with "Your AI coding agents,
visualized as…" — that is measurably the losing pattern.

### #1 (recommended) — "The office your Claude Code agents clock into"
*44 chars.* World first, platform named second, zero mechanism words. Reads as a place
that exists rather than a dashboard that describes. Short enough to survive the PH card
crop, and it sets up the whole gallery (suites, rooms, desks, the water cooler).

### #2 — "An office floor where your AI agents actually work"
*49 chars.* Same world-first shape, and "actually work" quietly does double duty —
it hints that what you see is real, which is the core differentiator. Slightly vaguer on
platform, so weaker for PH search.

### #3 — "Your agents have an office now. Watch them work."
*47 chars.* Most playful, best for X/Twitter. Weakest for PH search because neither
"Claude Code" nor a category word appears.

**Do not use:** anything starting "See every…", "Mission control for…", or
"…visualized as…". All three are the low-scoring mechanism-first pattern.

---

## 2. Description (≤260 chars)

> Your repos become office suites. Your named sessions become meeting rooms. Every
> subagent gets a desk, a headset, and a walk down the hall. Nothing on screen is
> invented, and it only celebrates green tests — never elapsed time. One command,
> local-only, MIT.

*(258 chars.)*

---

## 3. First comment from the maker

Post it within a minute of going live. Voice notes: first person, concrete, no
marketing register, and it must name the honest limitation before anyone else does.

> I kept six Claude Code sessions open across three repos and lost track of all of them.
> Not "which one is running" — I could alt-tab for that. I mean *which one had been
> quietly waiting nineteen minutes for me to approve a command.*
>
> So I gave them an office.
>
> `npx agentopolis` puts a small pixel office in your menu bar. Each repo you work in
> becomes a suite. Name a session and it gets a meeting room with its name over the door.
> Every subagent walks out of that door with a headset on, sits at a desk, and does
> whatever it's actually doing — reading, editing, testing, committing. When one needs
> you, it stands out front with its hand up and the room lights a beacon. When one is
> idle, it goes and stands at the water cooler, because idle should look idle.
>
> Two things I cared about more than the pixels:
>
> **Nothing on screen is invented.** Every worker, state, and animation traces to a real
> Claude Code hook event, through a documented event protocol. Click any coworker and you
> see the event and the classifier rule behind what they're doing. If the floor shows a
> test running, a test is running.
>
> **It only celebrates outcomes.** A green test suite or a landed commit gets the burst
> and the ✓ banner. Tool calls, token counts, and elapsed time never do — because a
> swarm of busy little workers is exactly how you convince yourself a twenty-minute run
> that produced nothing was productive. I didn't want to build that.
>
> It's also a spend tracker: it reads the token counts (only the numbers — never content)
> out of your own Claude Code transcripts and shows what you've spent today, this week,
> and per model. That part was genuinely unpleasant to look at, which I think means it works.
>
> Local-only by architecture: binds to 127.0.0.1, rejects non-loopback requests, no
> telemetry, metadata-only with redaction before anything touches disk. MIT, zero runtime
> dependencies, and every sprite is drawn procedurally in code — no tilesets, no
> third-party art licenses. `npx agentopolis --uninstall` removes every trace, which is
> enforced by a test.
>
> **Honest limitations:** it observes, it doesn't orchestrate — no spawning, no routing,
> no approving permissions from the office yet. The menu-bar widget is macOS-only right
> now (everywhere else it opens in a browser). And it's day one, so the art will keep
> getting better.
>
> Try it without touching your Claude settings: `npx agentopolis --demo`.
> I'd genuinely like to know whether you'd leave it open, or whether it's a nice thing
> you look at once. That's the whole question for me.

## 4. Gallery plan — 6 slides

All screenshots captured at **1270×760** (PH's preferred gallery ratio). Order matters:
slide 1 must work as the social-share thumbnail.

| # | Shot | Exact caption |
|---|------|---------------|
| 1 | **Hero city wide shot** — 3+ districts, mix of tents and permanent buildings, several workers mid-animation, summary bar visible | "Your agents at a glance: districts are repos, buildings are sessions, workers are agents." |
| 2 | **Attention beacon closeup** — pulsing beacon on one building, worker with raised hand, attention summary visible | "Know the moment an agent needs you." |
| 3 | **Rename → building promotion sequence** — before/after or mid-rise frame of a tent becoming a named building ("auth-refactor"), confetti burst visible | "Name a session and it earns a permanent building — confetti included." |
| 4 | **Inspector open** — a clicked building/worker with live state and the redacted event feed panel | "Click anything, see the truth: real status, real events, nothing invented." |
| 5 | **Demo-mode swarm** — busy city from `npx agentopolis --demo`, multiple subagents, a subagent-completion burst if you can time it | "Zero setup tour: npx agentopolis --demo runs a full synthetic swarm." |
| 6 | **Privacy/architecture card** — designed static slide (not a screenshot): edge-redaction diagram — hook → redact → disk/server → 127.0.0.1 browser | "Metadata only. Redacted before disk. 127.0.0.1 only. One command to uninstall." |

Capture notes:
- Slides 1–5 from demo mode (deterministic story: saturn-api / pixel-shop / dotfiles,
  the "auth-refactor" promotion at ~6s, the ~25s permission standoff starting at ~30s —
  the whole story loops every ~95 seconds, so every shot comes around again).
- Slide 6 is designed in the same pixel style so the gallery reads as one artifact.
- Optional slide-0 video: 30s screen capture of demo mode; PH autoplays video first
  when present.

---

## 5. Launch-day checklist

### Before launch (T-2 days)
- [ ] Schedule the launch for **Saturday or Sunday, 12:01 AM PT** (weekend = lighter
      competition; PH day resets at midnight PT, launching at 12:01 gives the full 24h).
- [ ] Verify `npx agentopolis --demo` works on a clean machine (Node 18+, no repo
      clone) — this is the first thing every visitor will run.
- [ ] README top section matches the PH pitch; GitHub repo public at
      https://github.com/otniel-bit/agentopolis with the demo GIF in the README.
- [ ] All 6 gallery images exported at 1270×760, alt text ready (section 6).

### Hunter notes
- Self-hunting is fine on today's PH — maker-hunted launches rank normally. If you use
  an external hunter, pick one who covers devtools, send them the kit (tagline,
  description, gallery, first comment) **48h ahead**, and agree on the 12:01 AM PT slot.
- Give the hunter one line of context they can post honestly: "local-only pixel-city
  dashboard for Claude Code agents, zero dependencies, MIT."

### Launch minute → first hour
- [ ] Post the **maker first comment within 5 minutes** of going live (12:01–12:06 AM PT).
      The first comment anchors every thread that follows.
- [ ] Pin the demo command in the comment: `npx agentopolis --demo`.
- [ ] Sanity-check the listing on mobile — taglines truncate differently there.

### Responding cadence
- **First 3 hours:** check every 15–20 minutes; answer every comment, even one-liners.
- **Morning US hours (6 AM–12 PM PT):** hourly sweeps; this is peak traffic.
- **Rest of day:** every 2 hours until midnight PT.
- Answer technical questions with specifics (file names, protocol details) — the
  audience for this product respects precision. If someone finds a bug, thank them,
  file it publicly, link the issue in your reply.

### Where to share (same day, staggered)
- **Hacker News, ~7–9 AM PT** — Show HN, suggested title (69 chars, under HN's 80):
  > Show HN: Agentopolis – Your Claude Code agents as a living pixel city
  First HN comment: the same story as the PH maker comment but more technical —
  lead with edge redaction and the zero-dependency architecture, link `docs/PROTOCOL.md`.
  Do not link the PH page from HN.
- **r/ClaudeAI, mid-morning PT** — post title: "I turned my Claude Code sessions into
  a pixel city (local-only, open source)". Lead with the demo GIF, answer questions in
  the thread all day. Mention `--uninstall` early; that subreddit asks about hooks.
- **X/Twitter thread** (post at launch or early morning PT) — 5 tweets, demo GIF first:
  1. **Demo GIF** + hook: "I kept losing track of my Claude Code agents, so I built
     them a city. Districts = repos. Tents = new sessions. Name one → it becomes a
     building." (GIF is the tweet; text stays short.)
  2. The beacon: "The actual point: the moment any agent needs you — permission,
     question — its building lights a beacon and a worker raises a hand. No more
     cmd-tabbing through terminals to find the stuck one." (beacon closeup image)
  3. Truth before animation: "Every sprite state maps to a real hook event:
     researching, editing, testing, running, installing. Unknown tool call → the worker
     shows 'unknown'. It never fakes busywork." (inspector screenshot)
  4. Privacy/architecture: "Zero npm dependencies. 127.0.0.1 only. Redaction happens
     inside the hook, before anything hits disk — no file contents, no prompts, secrets
     masked. MIT. One command uninstalls." (architecture card)
  5. CTA: "Try it in 30 seconds, no config touched: npx agentopolis --demo" + GitHub
     link + PH link. ("We're live on Product Hunt today — feedback welcome.")

### What NOT to do
- **No vote begging.** Never ask anyone to upvote — not in DMs, not in Slack groups,
  not in the thread. PH's algorithm penalizes vote rings, and one detected burst can
  bury the launch. Share the link, ask for *feedback*, and let votes happen.
- No "we're #3, help us get to #1" posts.
- No linking the PH page in the HN submission or comments.
- No engagement-bait replies ("great question! 🙌") — answer or don't.
- Don't ship changes to the CLI mid-launch-day; a broken `npx agentopolis --demo` at
  hour 6 costs more than any feature earns.
- Don't claim capabilities that don't exist yet (other providers, remote access,
  analytics). Claude Code is the only adapter today; say so plainly.

---

## 6. Topics/tags + image alt text

### Suggested PH topics (max 3 primary, listed in priority order)
1. **Developer Tools** (primary — this is the shelf it belongs on)
2. **Artificial Intelligence** (discovery traffic)
3. **Open Source** (accurate, and it's a trust signal for a tool that installs hooks)

Alternates if a slot is contested: **GitHub**, **Productivity**.

### Alt text for gallery images (accessibility)
1. "Pixel-art city viewed from above: three labeled districts of buildings and tents,
   small worker characters moving between them, a status bar showing counts of
   working, waiting, and needs-you sessions."
2. "Close-up of one pixel building with a bright pulsing beacon on its roof; a worker
   character in front raises a hand; a label reads 'permission needed'."
3. "Three-frame sequence: a small tent, then a pixel building rising out of the ground
   amid a burst of colorful particles, then the finished building labeled 'auth-refactor'."
4. "City view with an inspector panel open on the right, listing an agent's current
   activity ('Running tests') and a scrolling feed of recent redacted events."
5. "A busy pixel city in demo mode: many workers across three districts, several
   subagents active, a small green burst above a worker whose subagent just finished."
6. "Diagram slide in pixel style: Claude Code hook events flow through a redaction
   layer before reaching disk and a local server, which serves a browser at
   127.0.0.1 only. Caption: metadata only, one command to uninstall."

---

## 7. Objection playbook — prepared answers

These are the criticisms this category actually attracts (from analysis of comparable
launches). Have the answers ready; do not improvise them at 2am.

**"Gamification of serious work is confusing / this is a toy."**
> Fair worry, and it's why the office only celebrates two things: tests going green and
> commits landing. Never elapsed time, never tool calls. A run that spins for twenty
> minutes and produces nothing looks exactly as unproductive as it was. There's also a
> calm mode that strips the motion and keeps the states, and the menu-bar summary is
> readable without ever opening the office.

**"You're paying people in Pokémon for waiting — busy sprites make wasted runs feel good."**
> This is the sharpest version of the objection and I agree with it, which is why
> outcomes drive celebration and elapsed time earns nothing. Idle agents visibly go
> stand at the water cooler. The one loud state is a session that needs you.

**"Isn't this just <other agent visualizer>?"**
> Most tools in this space are harnesses — they spawn and orchestrate agents for you.
> Agentopolis spawns nothing and orchestrates nothing; it watches the sessions you
> already start. One command, no Electron, nothing to adopt. If you want agents managed
> for you, use a harness — and you can run both at once, since they attach hooks per
> session and we install globally.

**"Wait, there's already an Agentopolis."**
> Yes, and it got there first on PyPI — CodeBlackwell/agentopolis, an unrelated Python
> project that renders a codebase as an isometric city from git history. Different tool,
> different registry, no affiliation. This one is the npm package.

**"Won't this melt my battery?"**
> Measured on Apple silicon: server ~0.5% of one core and 67MB; widget ~14% with a busy
> three-suite office, ~6–9% idle, and zero while the popover is closed. 20fps while work
> is happening, 8fps when it isn't, static layers baked. Numbers are in the README so you
> can hold me to them.

**"Does it slow Claude Code down / touch my config?"**
> Hooks are async and observe-only with a 10s ceiling — they never block a tool call or a
> prompt. Install asks first, backs up settings.json, merges non-destructively next to
> your other tools' hooks, and `--uninstall` provably removes every trace (there's a test
> asserting the string `.agentopolis` cannot survive anywhere in the file).

**"What about my code / prompts?"**
> They never enter the pipeline. Redaction happens in the hook bridge before anything
> touches disk: file names not contents, commands truncated to 80 chars with secrets
> masked, no prompts, no assistant messages. 127.0.0.1 only, non-loopback requests
> rejected, zero telemetry.

**"Anthropic/OpenAI will just ship this."**
> Maybe — OpenAI already ships pet modes in Codex. This is MIT and local; if the platform
> ships something better I'd rather have built the thing that made the case for it.

**Do not:** argue with anyone, vote-beg, or say "great question". Answer the substance,
concede the real limitation, move on.

## Final selections

- **Tagline:** The office your Claude Code agents clock into
- **Description:** Your repos become office suites. Your named sessions become meeting
  rooms. Every subagent gets a desk, a headset, and a walk down the hall. Nothing on
  screen is invented, and it only celebrates green tests — never elapsed time. One
  command, local-only, MIT.
- **Show HN title:** An office floor where your Claude Code agents clock in and work
- **Lead gallery slide:** the widget floating over a code editor, office visible, one
  room beaconing for attention
- **Never open with:** "See every…", "Mission control for…", "…visualized as…"
