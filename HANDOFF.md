# HANDOFF — Bird Brain Briefing

Session log, newest first. What changed, why, and what's open — so nobody has to reconstruct it from commit history or a chat transcript.

---

## 2026-07-12 — Agent reliability sweep, memory system, CLAUDE.md (session spanning Jul 7–12)

**Why:** MockingJay ran but produced zero posts while claiming success; agents hallucinated freely; "most agents disconnected" outage; the /meet link unfurled as a dashboard screenshot; no project instructions existed for future sessions.

**Changed:**

- **MockingJay (`supabase/functions/mockingjay/`)** — root cause of empty drafts was `max_tokens: 2000` truncating the JSON and a fallback brief that claimed "Content drafted" anyway. Raised budgets, added a retry, surfaced failures in `widget_data.error` + a red dashboard banner. Also feeds on `projects`, `project_tasks`, and `agent_messages` now, so posts come from what the team is actually building.
- **Merlin CRM (`merlin-crm-tasks`)** — pulled cards by an assignee that is never set (all 74 Stone Arch cards have `assigned_to = NULL`, so it always returned nothing). Now pulls all open cards on active boards.
- **Social ownership** — Wren's five hardcoded social widgets deleted; MockingJay's live versions are the only social surface. TinyFish and Co-Lab projects set `cancelled` (reversible; DB CHECK has no "archived").
- **Chat outage + backends (`agent-chat`, `agent-api.ts`)** — outage was the Settings "Claude API (MCP)" toggle: browser-direct Anthropic calls with no fallback. Added edge-function fallback to MCP/legacy paths; `agent-chat` itself now prefers Claude (`claude-sonnet-4-6`) with a Gemini gateway fallback.
- **Missing profiles** — Owl (slug `guidebook`) and Magpie had `agents` rows but no `agent_profiles` row → guaranteed "Connection error." Both seeded with real personas. All 9 agents now pass the profile check.
- **Anti-hallucination memory** — `agent-chat` now injects `shared_context` (team facts, 4 seeded) + `agent_memory` (incl. `learned` lessons auto-captured in the background when Shannon corrects an agent) with a "say you don't know" rule.
- **Voice** — persistent global toggle in the nav (`useVoiceSettings.tsx`, localStorage) + per-agent mutes; the old Meeting-Room toggle reset to ON every reload.
- **/meet social preview** — replaced Lovable's default OG tags/screenshot with a 1200×630 calendar card (`public/og-meet.png`, source SVG alongside). Site-wide by SPA necessity.
- **Type fixes** — `SpeechRecognitionErrorEvent` declared; My Agent page's `onMessage` was written for a defunct ElevenLabs payload shape (transcript never populated) — now reads `{ message, role }`.
- **CLAUDE.md created** — full system map (three-Supabase trap, Lovable sync + Publish gap, agent name/slug table, conventions, definition of done). Then updated with today's decisions: lockfile policy, testing bar (lib logic needs vitest; UI/edge verified live), every-agent-needs-a-profile rule.
- **Repo hygiene** — legacy `bun.lockb` removed (`bun.lock` is Lovable's — keep; `package-lock.json` is local npm). Untracked leftovers (`invoke-agent/` prototype, hand-written memory-layer migration, stale `seed_agents.sql`) archived to `~/bird-brain-briefing-archive/`. `supabase/.temp/` gitignored.

**Verified live:** Owl chatting in persona; all 9 agents have active profiles; seeded team facts query correctly; Merlin dashboard shows 2 active projects; CRM has 4 boards/74 cards ready for the new pull.

**Open:**
- Shannon must **Publish** in Lovable for frontend changes (voice toggle, OG card already published earlier — re-publish picks up the rest) and run the LinkedIn Post Inspector once to bust its preview cache.
- **Mic error in Meeting Room** unresolved — exact toast text never captured; likely per-origin permission on the new domain or the editor-preview iframe.
- A pre-pull `package-lock.json` stash exists; dropping it needs Shannon's explicit say-so.
- Memory is scoped to the main account (`3ac973ea…`); decide whether the older second account should share team facts.
- First auto-learned correction not yet spot-checked in `agent_memory`.
