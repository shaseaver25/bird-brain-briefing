# Bird Brain Briefing — Project Instructions

My global `~/.claude/CLAUDE.md` still applies (communication style, never auto-commit, verify before acting). This file is the project-specific layer: the things that are true *here* and that you cannot infer from the code alone. When this file and the code disagree, investigate — the live database and deployed app are the source of truth, not this file and not `seed_agents.sql`.

## What this is

"AI Staff Meeting" — a multi-agent AI staff platform. A flock of named bird agents (Wren, SalesHawk, Osprey, Merlin, Warbler, MockingJay, Owl, Eagle, Magpie, Swift) each own a business function, chat in a shared Meeting Room or 1:1, keep per-agent dashboards of live widgets, and speak via ElevenLabs. Swift is the public-facing scheduling assistant on `/meet`.

- Lovable project: `b506da29-9cfa-41ba-8310-62cc39cb4b56` (editor: lovable.dev/projects/…)
- Live domain: `https://flock-of-agents.tailoredu.ai` · Lovable URL: `https://bird-brain-briefing.lovable.app`
- Stack: React 18 + Vite + TypeScript, Tailwind + shadcn/ui, Supabase (Lovable Cloud) Postgres + Deno edge functions, ElevenLabs TTS, Claude + Lovable AI gateway.

## The system map (read this before touching anything)

Three code/infra surfaces are in play. Confusing them is the #1 way to break things here.

1. **GitHub `shaseaver25/bird-brain-briefing` ↔ Lovable two-way sync.** Shannon builds in the Lovable editor; Lovable commits to `main` (often mid-session, often titled just "Changes"). The local clone drifts far behind — it has been 100+ commits stale.
   - **HARD RULE: `git fetch` + fast-forward pull before editing any file.** Stash local junk first if needed.
   - Expect your `git push` to be rejected because Lovable pushed meanwhile. The pattern: `git fetch` → inspect what changed (`git log/diff HEAD..origin/main`) and check overlap with your files → `git rebase origin/main` → re-verify your changes survived (grep for your key additions, run tsc) → push. Never force-push. If the remote commit rewrote the same functions you did, reconcile by hand — a textually clean rebase can still produce broken code (this has happened; typecheck catches it).

2. **The app's backend is Lovable-Cloud-managed Supabase, ref `drzxvvcecgoorcldwgtj`.** It does NOT appear in the Supabase MCP's `list_projects` — that MCP sees Shannon's personal org instead (`tailoredu-llc` = bjwmwbcubsjfhrloqhtt, `stone-arch-collective` = vvaqdqzpbtlfucsoiupc, `InControl` = bcjxhlvisbyzextkmukj). Those are DIFFERENT systems.
   - Query/modify this app's DB through the **Lovable MCP** `query_database` tool with the Lovable project id.
   - Direct DB changes (INSERT/UPDATE) take effect immediately — no deploy needed. Prefer them for data fixes; use migrations for schema.
   - The **Stone Arch CRM** is the `stone-arch-collective` Supabase project — a separate product that Merlin reads via `merlin-crm-tasks` (service key, read-only). Its `board_cards.assigned_to` is always NULL — never filter cards by assignee.

3. **Deploy pipeline — the Publish gap.** `git push` → Lovable syncs the repo and auto-redeploys **edge functions**. But the live domain serves the last **Published** build — frontend changes are invisible until Shannon clicks Publish in the Lovable editor (or explicitly asks for a deploy). Claude must not trigger production publishes on its own.
   - So: "I pushed but the site shows the old thing" is usually the Publish gap, not a bug. Check what the domain actually serves (`curl`) before debugging.
   - Verification order after a change: typecheck → push → edge functions live after sync (test via DB effects) → frontend live only after Publish.

## Agents: identity, chat, and the 404 trap

- **DB is canonical.** `public.agents` (has a `slug` column) + `public.agent_profiles` (system prompt, model, max_tokens, `is_active`). `supabase/seed_agents.sql` is stale — never trust it.
- **Three different name spaces** for the same agent — do not guess, map:

  | UI id (`useAgentStore`) | DB slug | Display name |
  |---|---|---|
  | `wren` (agentId `main`) | `wren` | Wren |
  | `osprey` (agentId `forge`) | `osprey` | Osprey |
  | `kiro` | `kiro` | Warbler |
  | `owl` | `owl` | **Eagle** (legislation/learning) |
  | `guidebook` | `guidebook` | **Owl** (intelligent guidebooks) |
  | `mockingjay` | `mockingjay` | MockingJay |
  | `magpie` | `magpie` | Magpie |

- **An agent chats only if it has BOTH an `agents` row and an active `agent_profiles` row.** Missing profile = the UI shows "Connection error. Please try again." (this bit Owl; Magpie may still lack a profile — check before debugging anything else).
- **Chat backends** (`src/lib/agent-api.ts`): default is the `agent-chat` edge function (server-side keys). A Settings toggle ("Claude API (MCP)", persisted in localStorage + `app_config.use_mcp_backend`) switches to direct-from-browser Anthropic calls — this is a known footgun that has taken down all chat; both paths must keep their edge-function fallback. If every agent errors at once, check `app_config.use_mcp_backend` first.
- **Meeting mode:** agents reply literally `---` to pass when not addressed. That is designed behavior, not a failure.
- **Memory (anti-hallucination):** `agent-chat` injects `shared_context` (team-wide facts, keyed by `context_key`) and `agent_memory` (`memory_type` ∈ fact/preference/learned/instruction; `learned` = lessons auto-captured when Shannon corrects an agent) into the system prompt, plus GROUNDING_RULES. When agents hallucinate, the fix is usually seeding/correcting memory rows — not prompt surgery.
- **Models:** `agent-chat` prefers Claude (`claude-sonnet-4-6`, `ANTHROPIC_API_KEY`) and falls back to the Lovable AI gateway (`google/gemini-2.5-flash`, `LOVABLE_API_KEY`). Agent-owned edge functions (mockingjay etc.) call Anthropic directly.

## Database conventions

- `widget_data.agent_id` is a **text slug** (`'mockingjay'`, `'wren'`) — NOT the `agents.id` UUID. Agent dashboards read from it; agent edge functions upsert to it with `onConflict: 'agent_id,widget_key'`.
- Some agents also have dedicated tables (`mockingjay_posts`, `merlin_action_items`, `kiro_intel`, `inbound_leads`, `projects`/`project_tasks`, `agent_messages` for the inter-agent bus). Check `information_schema` (via Lovable MCP) before writing any query — per my global rule, confirm table/column names first.
- `projects.status` has a CHECK constraint: `active | paused | completed | cancelled` (no "archived"). Merlin's dashboard shows only active/paused; "removing" a project = set `cancelled` (reversible), not DELETE.
- `conversations` holds 14-day rolling chat history per user per agent; Shannon's admin user id is `3ac973ea-0f66-4ee7-9690-9ec64ea5abd0` (a second, older account exists: `39baee92-…`).
- RLS + `has_role(user, 'admin')` gate the edge functions; service-role clients bypass RLS inside functions.

## Edge function conventions (`supabase/functions/`)

- Deno. Shared helpers in `_shared/agent-bus.ts`: `corsHeaders`, `GROUNDING_RULES`, `readInbox`/`postMessage` (inter-agent messages), `serviceClient()`.
- **GROUNDING_RULES is duplicated in `src/lib/agent-api.ts` — if you edit one, edit both** (the comment in each file says so).
- LLM calls that must return JSON: use the local `extractJson` pattern (fence-strip → parse → brace-slice), give **generous `max_tokens`** (truncation silently produced zero MockingJay drafts for weeks), retry once on empty/unparseable, and log `stop_reason`.
- **No silent failure:** a failed generation must be visible — write an `error` field into the `widget_data` row and make the fallback copy say something went wrong. Never let fallback text claim success ("Content drafted") when nothing was produced.
- Long work: return `202` immediately and run in `EdgeRuntime.waitUntil(...)`.
- Auth preamble (anon client from the request JWT → `getUser` → `has_role` admin check) is copy-pasted across functions — keep new functions consistent with it.

## Frontend conventions

- Named exports, TypeScript, async/await (global rules). Per-agent dashboard widgets live in `src/components/agent-dashboards/<Agent>Widgets.tsx`; routing is `/dashboard/:agentId` via `KiroDashboardPage`'s `ROLE_WIDGETS` map — a new agent dashboard needs an entry there plus `DEFAULT_AGENTS` in `useAgentStore.ts`.
- Tables missing from the generated Supabase types: use the `db()` helper in `src/lib/untyped-db.ts` — do not scatter `as any` casts (a lint pass removed them all once already).
- Voice: `VoiceProvider` in `src/hooks/useVoiceSettings.tsx` (localStorage-persisted global on/off + per-agent mutes); `GlobalVoiceStop` + Escape kills all audio. Any new speech path must respect `useVoice()` before playing audio.
- **MockingJay owns everything social.** Wren's dashboard deliberately has no social widgets — do not reintroduce them.
- Domain ownership: sales → SalesHawk, projects/tracking → Merlin, scheduling/email → Wren, social → MockingJay, guidebooks → Owl, cloud/intel → Warbler, finance → Magpie, legislation/learning → Eagle, public booking → Swift. Route features to the right bird; flag scope creep across birds instead of merging them.
- SPA + single `index.html`: link crawlers don't run JS, so OG/social-preview tags are **site-wide** (currently the `/meet` booking card, `public/og-meet.png`, source `og-meet.svg`). Per-route previews are impossible on this hosting — don't chase them.

## Secrets & env

Edge function secrets live in Lovable Cloud (not in the repo): `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`, `SUPABASE_*` (auto), `STONEARCH_CRM_SERVICE_KEY` (+ optional `STONEARCH_CRM_URL`, `STONEARCH_SHANNON_USER_ID`), ElevenLabs key entered by the user in Settings (stored in `app_config.api_key`). Frontend env: `.env` `VITE_SUPABASE_URL` / `VITE_SUPABASE_PROJECT_ID`. Never hardcode keys (global hard rule).

## Definition of done

Work is not done when it compiles. In order:

1. `npx tsc --noEmit -p tsconfig.app.json` → **0 errors**. (`main` is currently clean; if you hit errors in files you didn't touch, diff against `origin/main` — pre-existing breakage is not yours to silently absorb, but flag it and offer the fix.)
2. `npm run lint` → clean (the repo was brought to 0/0 deliberately; don't regress it). `npm test` runs vitest if tests are relevant.
3. For edge functions: no Deno locally — sanity-check structure (brace balance, imports) and rely on Lovable's deploy; then **verify against the live system**: query the actual tables (`widget_data`, `conversations`, `mockingjay_posts`…) through the Lovable MCP and confirm the run produced real rows. A 200 response with empty output is a failure that must be surfaced, not success.
4. For frontend: remember nothing is user-visible until Shannon Publishes. Say so explicitly when reporting done.
5. Report honestly: what was verified live vs. what was only typechecked.

## Git & deployment rules

- **HARD RULE: never commit or push without Shannon saying so in that turn.** "commit this" / "push" / "run" (after showing the command) is sufficient authorization — then just do it, no double-confirming.
- Commit only the files belonging to the current task — this working tree carries long-lived untracked files (`supabase/functions/invoke-agent/`, `supabase/migrations/20260417_mcp_memory_layer.sql`, `supabase/seed_agents.sql`, `supabase/.temp/`) and sometimes a stash; leave them alone unless asked.
- Use npm/npx for local commands (both `bun.lockb` and `package-lock.json` exist; npm is what's actually used locally).
- Production Publish (Lovable) and anything outward-facing: Shannon's action or explicit request only.

## Working style (project-specific reinforcement)

- Investigate before acting: for any bug report, establish which of the three systems owns it (frontend build? edge function? DB row? Lovable publish state? browser-side setting?) before proposing fixes. Several "outages" here were a single flipped config row.
- When a user-visible failure has multiple plausible surfaces (e.g. "mic doesn't work", "agents disconnected"), ask which surface/symptom rather than guessing — one clarifying question beats a wrong fix.
- Data over docs: this file, the README, and seed files go stale; the live DB, the deployed code (read via Lovable MCP), and `git log` are ground truth.
- Costs: agent edge functions make multiple LLM calls per run. Don't invoke them speculatively; let Shannon hit Run Now.
