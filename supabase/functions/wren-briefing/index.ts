import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function fetchTodayCalendar(accessToken: string): Promise<string> {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return "Calendar unavailable";

  const { items } = await res.json();
  if (!items?.length) return "No events today";

  return (items as any[]).map((e) => {
    const start = e.start?.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
      : "All day";
    return `- ${start}: ${e.summary ?? "(No title)"}`;
  }).join("\n");
}

async function fetchFlaggedEmails(accessToken: string): Promise<string> {
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+is:important&maxResults=5",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) return "Gmail unavailable";
  const { messages } = await listRes.json();
  if (!messages?.length) return "No flagged emails";

  const details = await Promise.all(
    (messages as { id: string }[]).map((m) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then((r) => r.json())
    )
  );

  return details.map((msg) => {
    const headers = msg.payload?.headers ?? [];
    const from = headers.find((h: any) => h.name === "From")?.value ?? "Unknown";
    const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "(No subject)";
    const name = from.match(/^"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? from.split("@")[0];
    return `- ${name}: "${subject}"`;
  }).join("\n");
}

async function compileBriefing(): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  // Fetch all data sources in parallel
  const accessToken = await getGoogleAccessToken(
    Deno.env.get("GOOGLE_CLIENT_ID")!,
    Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    Deno.env.get("GOOGLE_REFRESH_TOKEN_WREN")!
  );

  const [calendarText, emailText, saleshawkData, kiroData] = await Promise.all([
    fetchTodayCalendar(accessToken),
    fetchFlaggedEmails(accessToken),
    // SalesHawk's latest finds
    supabase
      .from("widget_data")
      .select("data, updated_at")
      .eq("agent_id", "saleshawk")
      .eq("widget_key", "todays_finds")
      .maybeSingle()
      .then(({ data }) => data),
    // Kiro's top high-relevance articles
    supabase
      .from("kiro_intel")
      .select("title, source, summary, topic_label, business")
      .eq("relevance", "high")
      .gt("expires_at", new Date().toISOString())
      .order("found_at", { ascending: false })
      .limit(3)
      .then(({ data }) => data ?? []),
  ]);

  // Format SalesHawk summary
  const saleshawkFinds = (saleshawkData?.data as any)?.finds ?? [];
  const inserted = saleshawkFinds.filter((f: any) => f.status === "inserted");
  const topLead = inserted.sort((a: any, b: any) => b.score - a.score)[0];
  const saleshawkText = inserted.length === 0
    ? "No new leads found recently."
    : `SalesHawk found ${inserted.length} new lead${inserted.length !== 1 ? "s" : ""} across all three businesses.${topLead ? ` Top pick: ${topLead.name} at ${topLead.company} (score ${topLead.score}).` : ""}`;

  // Format Kiro intel
  const kiroText = (kiroData as any[]).length === 0
    ? "No high-relevance intelligence flagged overnight."
    : (kiroData as any[]).map((a: any) => `- [${a.topic_label}] ${a.title} (${a.source}): ${a.summary}`).join("\n");

  // Compile the briefing with Claude
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago"
  });

  const prompt = `You are Wren, Shannon's Strategy Lead. Write a spoken morning briefing for Shannon to open the staff meeting.

Today is ${today}.

DATA:

CALENDAR TODAY:
${calendarText}

FLAGGED EMAILS:
${emailText}

SALESHAWK REPORT:
${saleshawkText}

KIRO INTELLIGENCE HIGHLIGHTS:
${kiroText}

INSTRUCTIONS:
- Write as if you're speaking directly to Shannon at the start of a meeting
- Conversational, confident, warm — you know Shannon well
- Cover all four areas but naturally, not like a list
- Flag anything urgent or time-sensitive first
- Mention the most important Kiro intel if relevant to the businesses
- End with one clear "focus for today" recommendation
- Keep it under 120 words — this will be spoken aloud
- Do NOT use bullet points, headers, or markdown — pure spoken prose`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const briefingText = response.content.find((b) => b.type === "text")?.text ?? "";

  // Save to widget_data
  await supabase.from("widget_data").upsert({
    agent_id: "wren",
    widget_key: "morning_briefing",
    data: {
      briefing: briefingText,
      compiled_at: new Date().toISOString(),
      sources: {
        calendar: calendarText,
        emails: emailText,
        saleshawk: saleshawkText,
        kiro_count: (kiroData as any[]).length,
      },
    },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "agent_id,widget_key" });

  console.log("Morning briefing compiled successfully");
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-ignore
  EdgeRuntime.waitUntil(
    compileBriefing().catch((err) => console.error("wren-briefing error:", err))
  );

  return new Response(
    JSON.stringify({ ok: true, status: "started", message: "Briefing compiling in background." }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
