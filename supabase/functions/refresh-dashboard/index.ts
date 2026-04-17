import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Refresh a Google OAuth access token using the stored refresh token
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

// Format a Google Calendar start/end into display strings
function formatCalendarItem(event: Record<string, unknown>): { date: string; time: string; title: string; type: "meeting" | "deadline" } {
  const start = event.start as Record<string, string>;
  const summary = (event.summary as string) || "(No title)";
  const dt = start.dateTime ? new Date(start.dateTime) : new Date(start.date as string);
  const isAllDay = !start.dateTime;

  const date = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = isAllDay ? "All day" : dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Heuristic: "deadline" if all-day or title contains deadline keywords
  const lc = summary.toLowerCase();
  const isDeadline = isAllDay && (lc.includes("deadline") || lc.includes("due") || lc.includes("submit"));

  return { date, time, title: summary, type: isDeadline ? "deadline" : "meeting" };
}

// Fetch next N days of calendar events
async function fetchCalendarEvents(accessToken: string, days = 4): Promise<unknown[]> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Calendar API error: ${await res.text()}`);
  const { items } = await res.json();
  return (items || []).map(formatCalendarItem);
}

// Parse a Gmail header value by name
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// Parse sender name from "Name <email>" format
function parseSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+?)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0];
}

// Compute a human-readable flag reason based on message age
function flagReason(internalDate: string): string {
  const ms = Date.now() - parseInt(internalDate);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "Received today — needs reply";
  if (days === 1) return "No reply in 1 day";
  return `No reply in ${days} days`;
}

// Fetch unread important messages from Gmail
async function fetchGmailFlagged(accessToken: string, maxResults = 8): Promise<unknown[]> {
  // Get message IDs for unread important messages
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+is:important&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail list error: ${await listRes.text()}`);
  const { messages } = await listRes.json();
  if (!messages?.length) return [];

  // Fetch metadata for each message in parallel
  const details = await Promise.all(
    messages.map((m: { id: string }) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then((r) => r.json())
    )
  );

  return details.map((msg) => {
    const headers = msg.payload?.headers ?? [];
    const from = getHeader(headers, "From");
    const subject = getHeader(headers, "Subject");
    const internalDate = msg.internalDate ?? "0";
    const receivedAt = new Date(parseInt(internalDate)).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return {
      from: parseSenderName(from),
      subject,
      flagReason: flagReason(internalDate),
      receivedAt,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { agent_id = "wren" } = await req.json().catch(() => ({}));

    // Only Wren has Google OAuth for now
    if (agent_id !== "wren") {
      return new Response(JSON.stringify({ error: "Only wren is supported" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN_WREN");

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Missing Google OAuth environment variables");
    }

    const accessToken = await getGoogleAccessToken(clientId, clientSecret, refreshToken);

    // Fetch both in parallel
    const [calendarItems, emailItems] = await Promise.all([
      fetchCalendarEvents(accessToken),
      fetchGmailFlagged(accessToken),
    ]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Cache expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase.from("widget_data").upsert([
      {
        agent_id: "wren",
        widget_key: "calendar_overview",
        data: { items: calendarItems },
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      {
        agent_id: "wren",
        widget_key: "flagged_emails",
        data: { emails: emailItems },
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: "agent_id,widget_key" });

    return new Response(
      JSON.stringify({
        ok: true,
        calendar: calendarItems,
        emails: emailItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("refresh-dashboard error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
