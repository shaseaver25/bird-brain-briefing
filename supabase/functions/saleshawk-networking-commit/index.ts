import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getCrm(business: string) {
  const map: Record<string, { url?: string; key?: string }> = {
    realpath: { url: Deno.env.get("CRM_REALPATH_URL"), key: Deno.env.get("CRM_REALPATH_SERVICE_KEY") },
    tailoredu: { url: Deno.env.get("CRM_TAILOREDU_URL"), key: Deno.env.get("CRM_TAILOREDU_SERVICE_KEY") },
    aiwhisperers: { url: Deno.env.get("CRM_AIWHISPERERS_URL"), key: Deno.env.get("CRM_AIWHISPERERS_SERVICE_KEY") },
  };
  const c = map[business];
  if (!c?.url || !c?.key) throw new Error(`No CRM credentials for ${business}`);
  return createClient(c.url, c.key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { queueId, business, action } = await req.json();
    if (!queueId) throw new Error("queueId required");

    const { data: row } = await userClient.from("saleshawk_networking_queue").select("*").eq("id", queueId).eq("user_id", user.id).single();
    if (!row) throw new Error("queue item not found");

    if (action === "skip") {
      await userClient.from("saleshawk_networking_queue").update({ status: "skipped", resolved_at: new Date().toISOString() }).eq("id", queueId);
      return new Response(JSON.stringify({ ok: true, action: "skipped" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!business) throw new Error("business required");
    const crm = getCrm(business);

    const meetingNoteEntry = `[${new Date(row.meeting_date ?? row.created_at).toLocaleDateString("en-US")}] ${row.meeting_title ?? "Meeting"}\n${row.meeting_notes ?? ""}`;

    let crmAction: "inserted" | "appended" = "inserted";
    let crmError: string | null = null;

    // Look up existing lead by email
    let existing: any = null;
    if (row.attendee_email) {
      const { data } = await crm.from("leads").select("id, notes").eq("email", row.attendee_email).maybeSingle();
      existing = data;
    }

    if (existing) {
      const newNotes = (existing.notes ? existing.notes + "\n\n---\n\n" : "") + meetingNoteEntry;
      const { error } = await crm.from("leads").update({ notes: newNotes }).eq("id", existing.id);
      if (error) crmError = error.message;
      else crmAction = "appended";
    } else {
      const { error } = await crm.from("leads").insert({
        business,
        name: row.attendee_name,
        email: row.attendee_email,
        company: row.attendee_company,
        title: row.attendee_title,
        source: "meeting",
        notes: meetingNoteEntry,
        score: 70,
        status: "new",
      });
      if (error) crmError = error.message;
    }

    await userClient.from("saleshawk_networking_queue").update({
      status: crmError ? "error" : "confirmed",
      confirmed_business: business,
      crm_action: crmError ? "none" : crmAction,
      crm_error: crmError,
      resolved_at: new Date().toISOString(),
    }).eq("id", queueId);

    return new Response(JSON.stringify({ ok: !crmError, action: crmAction, error: crmError }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("commit error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
