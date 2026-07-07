// SalesHawk's pipeline keeper — the follow-up discipline that keeps a
// solo-operator pipeline alive. Flags leads that have gone cold: awaiting
// first contact, untouched 10+ days, or otherwise stalled. Writes a health
// snapshot to widget_data and posts a one-liner to the team bus.

import { corsHeaders, postMessage, serviceClient } from "../_shared/agent-bus.ts";

const STALE_DAYS = 10;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function runPipelineCheck(): Promise<void> {
  const sb = serviceClient();

  // Everything in the pipeline that isn't closed/converted.
  const { data: rows } = await sb
    .from("inbound_leads")
    .select("id, name, company, email, source, status, created_at, updated_at")
    .not("status", "in", "(converted,closed)")
    .order("updated_at", { ascending: true })
    .limit(200);
  const leads = rows ?? [];

  const awaitingFirstContact = leads
    .filter((l) => l.status === "new")
    .map((l) => ({ ...l, days: daysSince(l.created_at) }));

  const stale = leads
    .filter((l) => l.status !== "new" && daysSince(l.updated_at) >= STALE_DAYS)
    .map((l) => ({ ...l, days: daysSince(l.updated_at) }));

  const contactedWaiting = leads
    .filter((l) => l.status === "contacted" && daysSince(l.updated_at) < STALE_DAYS)
    .map((l) => ({ ...l, days: daysSince(l.updated_at) }));

  const now = new Date().toISOString();
  await sb.from("widget_data").upsert({
    agent_id: "saleshawk",
    widget_key: "pipeline_health",
    data: {
      generated_at: now,
      stale_days: STALE_DAYS,
      awaiting_first_contact: awaitingFirstContact,
      stale: stale,
      contacted_waiting: contactedWaiting,
      counts: {
        awaiting_first_contact: awaitingFirstContact.length,
        stale: stale.length,
        contacted_waiting: contactedWaiting.length,
        open_total: leads.length,
      },
    },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
  }, { onConflict: "agent_id,widget_key" });

  const parts: string[] = [];
  if (awaitingFirstContact.length) parts.push(`${awaitingFirstContact.length} awaiting first contact`);
  if (stale.length) parts.push(`${stale.length} untouched ${STALE_DAYS}+ days`);
  if (contactedWaiting.length) parts.push(`${contactedWaiting.length} contacted, waiting on you`);

  await postMessage(sb, {
    from: "saleshawk",
    kind: stale.length > 0 ? "alert" : "report",
    subject: parts.length
      ? `Pipeline check: ${parts.join(", ")}`
      : "Pipeline check: no leads need attention — all current",
    payload: {
      awaiting_first_contact: awaitingFirstContact.length,
      stale: stale.length,
      contacted_waiting: contactedWaiting.length,
      top_stale: stale.slice(0, 3).map((l) => `${l.name}${l.company ? ` (${l.company})` : ""} — ${l.days}d`),
    },
    ttlHours: 24,
  });

  console.log(`saleshawk-pipeline: ${awaitingFirstContact.length} new, ${stale.length} stale, ${contactedWaiting.length} waiting`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
  EdgeRuntime.waitUntil(runPipelineCheck().catch((err) => console.error("saleshawk-pipeline error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", agent: "saleshawk" }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
