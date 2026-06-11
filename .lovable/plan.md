## Add MockingJay agent

### Files to create
1. **`supabase/functions/mockingjay/index.ts`** — exact content provided by user (Anthropic Claude, writes 4 widget rows: post_queue, platform_scorecard, content_calendar, meeting_brief).
2. **`src/components/agent-dashboards/MockingJayWidgets.tsx`** — exact content provided by user (post queue tabs, scorecard, 7-day calendar, meeting brief, Run Now button).

### Files to edit
3. **`src/pages/KiroDashboardPage.tsx`** — register MockingJay so `/dashboard/mockingjay` works:
   - Add `mockingjay: lazy(() => import('@/components/agent-dashboards/MockingJayWidgets'))` to `ROLE_WIDGETS`.
   - Add `mockingjay: { name: 'MockingJay', role: 'Social Media Agent' }` to `FALLBACK_AGENTS`.
   - Add a role keyword match (`social`/`content`) in `resolveWidgetKey`.

4. **`src/hooks/useAgentStore.ts`** — add MockingJay to `DEFAULT_AGENTS` so it shows on the staff-meeting grid and is reachable from the agent list:
   ```ts
   {
     id: "mockingjay", name: "MockingJay", emoji: "🐦",
     role: "Social Media Agent", voiceId: "ErXwobaYiN019PkySvjV",
     agentId: "mockingjay", apiUrl: "",
     accentColor: "330 80% 60%", speakOrder: 7,
   }
   ```
   `mergeWithDefaults` will pick it up for existing users automatically.

### Not changing
- `src/App.tsx` — the existing `/dashboard/:agentId` route already covers `/dashboard/mockingjay`; no new route needed.
- No DB migration — the function reuses the existing `widget_data` table.

### Deploy & verify
- Deploy `mockingjay` edge function and confirm it builds cleanly. Do **not** invoke it (Anthropic cost; user can hit Run Now from the dashboard).
- Confirm `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are present (they are).

### Notes
- The function uses Anthropic `claude-sonnet-4-6` across 4 calls per run, which is expensive. Flagging for your awareness — happy to swap to the Lovable AI Gateway (`google/gemini-2.5-flash`) in a follow-up if you want to keep costs down, but per your instructions I'll ship the code exactly as provided.