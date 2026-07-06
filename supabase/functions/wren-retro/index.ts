// Wren's weekly retro — a Friday counterpart to the morning briefing.
// The message bus now holds a week of what every agent did, so Wren can write
// a real retrospective: what closed, what stalled, where leads actually came
// from, and the focus for next week. Posts to the bus + widget_data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/agent-bus.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TZ = "America/Chicago";

async function compileRetro(): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Everything the agents said to each other this week.
  const { data: msgs } = await supabase
    .from("agent_messages")
    .select("from_agent, to_agent, kind, subject, created_at")
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: true })
    .limit(200);

  // Real lead outcomes, by source.
  const { data: inbound } = await supabase
    .from("inbound_leads")
    .select("name, company, source, status, created_at")
    .gte("created_at", weekAgo);
  const leads = inbound ?? [];
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const l of leads) {
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  }

  const activity = (msgs ?? [])
    .map((m) => `- [${m.from_agent}${m.to_agent !== "all" ? ` → ${m.to_agent}` : ""}, ${m.kind}] ${m.subject}`)
    .join("\n");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: TZ,
  });

  const prompt = `You are Wren, Shannon's Strategy Lead, writing the Friday weekly retro for the team. Today is ${today}.

This week's agent activity (from the team message bus — this is your ground truth, do not invent anything beyond it):
${activity || "(no agent activity recorded this week)"}

Inbound leads this week: ${leads.length} total.
By source: ${JSON.stringify(bySource)}
By status: ${JSON.stringify(byStatus)}

Write a concise weekly retro with exactly these four short sections (spoken prose under each heading, no bullet lists, 1-3 sentences each):
WHAT CLOSED / MOVED — concrete wins visible in the activity above.
WHAT STALLED — anything that went quiet, got no follow-through, or shows no activity.
WHERE LEADS CAME FROM — attribute honestly from the source data; if a source is 0, say so.
FOCUS FOR NEXT WEEK — one clear priority, grounded in what the data shows.

GROUNDING: use only the activity and lead data above. If a section has no data, say plainly that there was no activity there rather than inventing progress. Keep the whole thing under 180 words.`;

  const aiRes = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const aiData = await aiRes.json();
  const retro = aiData.choices?.[0]?.message?.content ?? "";

  const now = new Date().toISOString();
  await supabase.from("widget_data").upsert({
    agent_id: "wren",
    widget_key: "weekly_retro",
    data: {
      retro,
      compiled_at: now,
      lead_count: leads.length,
      by_source: bySource,
      by_status: byStatus,
      message_count: (msgs ?? []).length,
    },
    expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
  }, { onConflict: "agent_id,widget_key" });

  await supabase.from("agent_messages").insert({
    from_agent: "wren",
    to_agent: "all",
    kind: "report",
    subject: `Weekly retro ready — ${leads.length} leads this week, ${(msgs ?? []).length} agent updates`,
    payload: { by_source: bySource },
    expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  });

  console.log(`wren-retro compiled: ${leads.length} leads, ${(msgs ?? []).length} messages`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
  EdgeRuntime.waitUntil(compileRetro().catch((err) => console.error("wren-retro error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", message: "Weekly retro compiling in background." }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
