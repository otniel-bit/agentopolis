# Agentopolis — Product Hunt Launch Kit

Weekend launch, scheduled for **12:01 AM PT**. Everything below is written against the
actual codebase (`docs/PROTOCOL.md`, `bin/agentopolis.js`, `src/hooks.js`, `src/redact.js`) —
no claim in this kit exceeds what the code does.

---

## 1. Product name + taglines

**Product name:** Agentopolis

Three tagline options, ranked. Constraint: ≤60 chars, lead with the benefit
(see many agents at a glance), not the pixels.

### #1 (recommended) — "See every AI coding agent at a glance — a living pixel city"
*59 chars.* Leads with the exact benefit (glanceability across many agents), then earns
the visual hook as the payoff instead of the pitch. "AI coding agent" is the search
phrase people actually use; "living" promises real-time without overclaiming.

### #2 — "Mission control for Claude Code, as a living pixel city"
*55 chars.* Category-first: anyone drowning in Claude Code tabs self-selects instantly,
and it names the integration (good for PH search). Ranked second because "mission
control" is a crowded metaphor on PH and it narrows the audience to Claude Code users
on day one, even though that's honest — Claude Code is the only adapter today.

### #3 — "Your AI coding agents, visualized as a living pixel city"
*56 chars.* Accurate and pleasant, but it leads with the subject ("your agents") and the
mechanism ("visualized") rather than the benefit. Keep as fallback if #1 reads too long
in the PH card preview.

---

## 2. Description (≤260 chars)

> Running five Claude Code sessions in five terminals doesn't scale. Agentopolis turns
> them into a living pixel city on localhost — one glance shows who's working, who's
> stuck, who needs you. Local-only, zero deps, MIT. Try: npx agentopolis --demo

*(245 chars.)*

---

## 3. First comment from the maker

> Hey Product Hunt — maker here.
>
> The origin story is embarrassing in the way most tooling stories are. I had six
> Claude Code sessions running across three repos — a refactor in one, a test-fixing
> loop in another, subagents fanning out underneath — and my "dashboard" was
> cmd-tabbing through terminal windows trying to remember which one had asked for
> permission twenty minutes ago. Terminals are great at *running* agents. They are
> terrible at *showing you many of them*.
>
> So I built the thing my brain apparently wanted: a city.
>
> `npx agentopolis` starts a tiny zero-dependency Node server on 127.0.0.1 and — with
> your explicit consent, and a backup of your settings first — adds async, observe-only
> hooks to Claude Code. Each repo becomes a district. Unnamed sessions pitch tents:
> temporary worksites. Name a session and the tent gets promoted to a permanent
> building, construction animation included. Every agent is a pixel worker, and when a
> session needs you — a permission prompt, a question — its building lights a beacon
> and a worker raises a hand. The city persists across restarts.
>
> The rule I refused to break while building this: **truth before animation**. Every
> sprite state maps to a real hook event through a deterministic classifier —
> researching, editing, testing, building, running, version control, installing. If
> Agentopolis can't classify a tool call, the worker shows "unknown." It never
> invents busywork, because a dashboard that lies is worse than no dashboard.
>
> Same rule for privacy: redaction happens at the edge, inside the hook, **before
> anything touches disk**. No file contents, no prompts, no assistant messages —
> ever. Commands are sanitized (secrets masked, capped at 80 chars), URLs are reduced
> to hostnames. The server binds to 127.0.0.1 only; nothing leaves your machine.
> `npx agentopolis --uninstall` removes the hooks and the bridge, and your local
> history is one folder (`~/.agentopolis`) you can delete whenever you like.
>
> You can tour the whole thing without touching your Claude Code config:
>
> `npx agentopolis --demo`
>
> That runs a synthetic swarm — three fake projects, a rename-to-building promotion, a
> permission standoff, one failure and recovery — so you can judge the idea in thirty
> seconds.
>
> It's MIT, the event protocol is documented, and the adapter layer is deliberately
> thin — I'd love to see adapters for other agent CLIs. What I want from you: does the
> beacon catch your eye fast enough? What's missing from the inspector? What would
> make this your default way to run a fleet of agents? Brutal feedback welcome.

*(~400 words — within the 300–500 target.)*

---

## 4. Gallery plan — 6 slides

All screenshots captured at **1270×760** (PH's preferred gallery ratio). Order matters:
slide 1 must work as the social-share thumbnail.

| # | Shot | Exact caption |
|---|------|---------------|
| 1 | **Hero city wide shot** — 3+ districts, mix of tents and permanent buildings, several workers mid-animation, summary bar visible | "Your agents at a glance: districts are repos, buildings are sessions, workers are agents." |
| 2 | **Attention beacon closeup** — pulsing beacon on one building, worker with raised hand, attention summary visible | "Know the moment an agent needs you." |
| 3 | **Rename → building promotion sequence** — before/after or mid-construction frame of a tent becoming a named building ("auth-refactor") | "Name a session and it earns a permanent building — construction crew included." |
| 4 | **Inspector open** — a clicked building/worker with live state and the redacted event feed panel | "Click anything, see the truth: real status, real events, nothing invented." |
| 5 | **Demo-mode swarm** — busy city from `npx agentopolis --demo`, multiple subagents, a confetti completion if you can time it | "Zero setup tour: npx agentopolis --demo runs a full synthetic swarm." |
| 6 | **Privacy/architecture card** — designed static slide (not a screenshot): edge-redaction diagram — hook → redact → disk/server → 127.0.0.1 browser | "Metadata only. Redacted before disk. 127.0.0.1 only. One command to uninstall." |

Capture notes:
- Slides 1–5 from demo mode (deterministic story: saturn-api / pixel-shop / dotfiles,
  the "auth-refactor" promotion, the ~25s permission standoff — everything you need
  occurs on a loop).
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
3. "Three-frame sequence: a small tent, then a construction site with scaffolding and
   workers, then a finished pixel building labeled 'auth-refactor'."
4. "City view with an inspector panel open on the right, listing an agent's current
   activity ('Running tests') and a scrolling feed of recent redacted events."
5. "A busy pixel city in demo mode: many workers across three districts, several
   subagents active, confetti bursting over one building that just finished a task."
6. "Diagram slide in pixel style: Claude Code hook events flow through a redaction
   layer before reaching disk and a local server, which serves a browser at
   127.0.0.1 only. Caption: metadata only, one command to uninstall."

---

## Final selections

**Tagline:** See every AI coding agent at a glance — a living pixel city

**Description:** Running five Claude Code sessions in five terminals doesn't scale.
Agentopolis turns them into a living pixel city on localhost — one glance shows who's
working, who's stuck, who needs you. Local-only, zero deps, MIT. Try: npx agentopolis --demo
