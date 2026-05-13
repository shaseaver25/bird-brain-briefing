import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRANOLA_GATEWAY = "https://connector-gateway.lovable.dev/granola";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const BUSINESSES = [
  { id: "realpath", desc: "K-12 education — superintendents, curriculum directors, EdTech in Twin Cities school districts." },
  { id: "tailoredu", desc: "Custom software, CRM, AI workflow automation for SMBs in Twin Cities (5-200 employees)." },
  { id: "aiwhisperers", desc: "AI training/consulting for small businesses, nonprofits, and HR/L&D teams." },
];

interface Attendee { name?: string; email?: string; company?: string; title?: string; }

async function suggestBusiness(LOVABLE_API_KEY: string, attendee: Attendee, meetingTitle: string, notes: string) {
  const sys = `You route contacts into one of three CRMs. Reply with strict JSON: {"business":"realpath|tailoredu|aiwhisperers","reasoning":"one short sentence"}. Businesses:\n${BUSINESSES.map(b => `- ${b.id}: ${b.desc}`).join("\n")}`;
  const user = `Attendee: ${attendee.name ?? ""} <${attendee.email ?? ""}> — ${attendee.title ?? ""} at ${attendee.company ?? ""}\nMeeting: ${meetingTitle}\nNotes (truncated): ${(notes ?? "").slice(0, 1500)}`;
  try {
    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text);
    if (BUSINESSES.find(b => b.id === parsed.business)) return parsed;
  } catch (e) { console.warn("AI suggest failed:", e); }
  return { business: "tailoredu", reasoning: "default — could not classify" };
}

function isUserEmail(email: string | undefined, userEmail: string | undefined) {
  if (!email || !userEmail) return false;
  return email.toLowerCase() === userEmail.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GRANOLA_API_KEY = Deno.env.get("GRANOLA_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    if (!GRANOLA_API_KEY) throw new Error("GRANOLA_API_KEY missing — connect Granola");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Get last scan
    const { data: state } = await userClient.from("saleshawk_scan_state").select("last_scan_at").eq("user_id", user.id).maybeSingle();
    const lastScan = new Date(state?.last_scan_at ?? Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    // Fetch Granola notes since last_scan
    const url = `${GRANOLA_GATEWAY}/v1/notes?limit=50&created_after=${encodeURIComponent(lastScan)}`;
    const notesRes = await fetch(url, {
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GRANOLA_API_KEY },
    });
    if (!notesRes.ok) throw new Error(`Granola error ${notesRes.status}: ${await notesRes.text()}`);
    const notesPayload = await notesRes.json();
    const meetings: any[] = notesPayload?.notes ?? [];

    let queued = 0;
    let scanned = 0;

    for (const m of meetings) {
      scanned++;
      const meetingId = m.id;
      // fetch full note for attendees + summary
      const detailRes = await fetch(`${GRANOLA_GATEWAY}/v1/notes/${meetingId}`, {
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GRANOLA_API_KEY },
      });
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();
      const note = detail?.note ?? detail;
      const attendees: Attendee[] = note?.attendees ?? note?.participants ?? [];
      const summary = note?.summary ?? note?.ai_summary ?? note?.content ?? "";
      const title = note?.title ?? "Meeting";
      const meetingDate = note?.created_at ?? note?.start_time ?? null;

      for (const a of attendees) {
        if (!a?.email && !a?.name) continue;
        if (isUserEmail(a.email, user.email)) continue;
        // dedupe done by unique index; use upsert ignore
        const suggestion = await suggestBusiness(LOVABLE_API_KEY, a, title, summary);
        const { error } = await userClient.from("saleshawk_networking_queue").insert({
          user_id: user.id,
          granola_meeting_id: meetingId,
          meeting_title: title,
          meeting_date: meetingDate,
          attendee_name: a.name ?? a.email ?? "Unknown",
          attendee_email: a.email ?? null,
          attendee_company: a.company ?? null,
          attendee_title: a.title ?? null,
          meeting_notes: typeof summary === "string" ? summary.slice(0, 6000) : JSON.stringify(summary).slice(0, 6000),
          ai_suggested_business: suggestion.business,
          ai_reasoning: suggestion.reasoning,
          status: "pending",
        });
        if (!error) queued++;
      }
    }

    // Update last scan
    await userClient.from("saleshawk_scan_state").upsert({ user_id: user.id, last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    return new Response(JSON.stringify({ ok: true, scanned, queued }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
