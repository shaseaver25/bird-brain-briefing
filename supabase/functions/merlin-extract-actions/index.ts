import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRANOLA_GATEWAY = "https://connector-gateway.lovable.dev/granola";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Action { title: string; due_date?: string | null; context?: string | null; }

async function extractActions(LOVABLE_API_KEY: string, title: string, summary: string, userEmail: string | undefined): Promise<Action[]> {
  const sys = `You extract action items from meeting notes that are assigned to or owned by Shannon (email: ${userEmail ?? "shannon@tailoredu.org"}).
Only return tasks Shannon needs to do — NOT things assigned to other attendees.
Reply with strict JSON: {"actions":[{"title":"short verb-led task","due_date":"YYYY-MM-DD or null","context":"one sentence why"}]}.
If there are no Shannon-owned next steps, return {"actions":[]}.`;
  const user = `Meeting: ${title}\n\nNotes:\n${(summary ?? "").slice(0, 6000)}`;
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
    return Array.isArray(parsed?.actions) ? parsed.actions : [];
  } catch (e) {
    console.warn("extract failed:", e);
    return [];
  }
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

    const { data: state } = await userClient.from("merlin_scan_state").select("last_scan_at").eq("user_id", user.id).maybeSingle();
    const lastScan = new Date(state?.last_scan_at ?? Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    const url = `${GRANOLA_GATEWAY}/v1/notes?limit=50&created_after=${encodeURIComponent(lastScan)}`;
    const notesRes = await fetch(url, {
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GRANOLA_API_KEY },
    });
    if (!notesRes.ok) throw new Error(`Granola error ${notesRes.status}: ${await notesRes.text()}`);
    const payload = await notesRes.json();
    const meetings: any[] = payload?.notes ?? [];

    let scanned = 0;
    let added = 0;

    for (const m of meetings) {
      scanned++;
      const detailRes = await fetch(`${GRANOLA_GATEWAY}/v1/notes/${m.id}`, {
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GRANOLA_API_KEY },
      });
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();
      const note = detail?.note ?? detail;
      const summary = note?.summary ?? note?.ai_summary ?? note?.content ?? "";
      const title = note?.title ?? "Meeting";
      const meetingDate = note?.created_at ?? note?.start_time ?? null;
      const actions = await extractActions(LOVABLE_API_KEY, title, typeof summary === "string" ? summary : JSON.stringify(summary), user.email);

      for (const a of actions) {
        if (!a?.title) continue;
        const { error } = await userClient.from("merlin_action_items").insert({
          user_id: user.id,
          title: a.title,
          context: a.context ?? null,
          due_date: a.due_date && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) ? a.due_date : null,
          status: "todo",
          source: "granola",
          source_meeting_id: m.id,
          source_meeting_title: title,
          source_meeting_date: meetingDate,
        });
        if (!error) added++;
      }
    }

    await userClient.from("merlin_scan_state").upsert({ user_id: user.id, last_scan_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    return new Response(JSON.stringify({ ok: true, scanned, added }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("merlin-extract-actions error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
