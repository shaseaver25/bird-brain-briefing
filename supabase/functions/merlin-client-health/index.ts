// Merlin's client-delivery tracker — watches signed clients for check-in
// cadence, so "Client X signed 3 weeks ago, no touchpoint in 14 days" becomes
// a report worth waking up to. Flags overdue clients, posts to the team bus.

import { corsHeaders, postMessage, serviceClient } from "../_shared/agent-bus.ts";

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function runClientHealth(): Promise<void> {
  const sb = serviceClient();

  const { data: rows } = await sb
    .from("clients")
    .select("id, name, company, business, signed_at, last_touch_at, cadence_days, status")
    .eq("status", "active")
    .order("last_touch_at", { ascending: true })
    .limit(200);
  const clients = rows ?? [];

  const scored = clients.map((c) => {
    const sinceTouch = daysSince(c.last_touch_at);
    return {
      ...c,
      days_since_touch: sinceTouch,
      overdue_by: Math.max(0, sinceTouch - (c.cadence_days ?? 14)),
    };
  });
  const overdue = scored.filter((c) => c.overdue_by > 0).sort((a, b) => b.overdue_by - a.overdue_by);
  const dueSoon = scored.filter((c) => c.overdue_by === 0 && (c.cadence_days - c.days_since_touch) <= 2);

  const now = new Date().toISOString();
  await sb.from("widget_data").upsert({
    agent_id: "merlin",
    widget_key: "client_health",
    data: {
      generated_at: now,
      overdue,
      due_soon: dueSoon,
      counts: { total: clients.length, overdue: overdue.length, due_soon: dueSoon.length },
    },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
  }, { onConflict: "agent_id,widget_key" });

  await postMessage(sb, {
    from: "merlin",
    kind: overdue.length > 0 ? "alert" : "report",
    subject: overdue.length > 0
      ? `Client check-ins overdue: ${overdue.slice(0, 3).map((c) => `${c.name} (${c.overdue_by}d past cadence)`).join(", ")}${overdue.length > 3 ? `, +${overdue.length - 3} more` : ""}`
      : `Client health: all ${clients.length} active client${clients.length !== 1 ? "s" : ""} within cadence`,
    payload: { overdue: overdue.length, due_soon: dueSoon.length, total: clients.length },
    ttlHours: 24,
  });

  console.log(`merlin-client-health: ${overdue.length} overdue of ${clients.length} active clients`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
  EdgeRuntime.waitUntil(runClientHealth().catch((err) => console.error("merlin-client-health error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", agent: "merlin" }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
