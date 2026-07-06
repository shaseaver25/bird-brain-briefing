// Swift's daily schedule report for the team board: what's on Shannon's
// calendar today, and who booked meetings in the last 24 hours (with their
// source tags). Runs on the morning cron alongside wren-briefing, or via
// manual invoke. Posts to the message bus, so it lands in the Comms Feed
// and in Wren's next briefing.

import { corsHeaders, postMessage, serviceClient } from "../_shared/agent-bus.ts";
import { getGoogleAccessToken, localParts, TZ } from "../_shared/availability.ts";

const AGENT_ID = "swift";

function timeLabel(iso: string): string {
  const lp = localParts(new Date(iso));
  const h12 = lp.hour % 12 === 0 ? 12 : lp.hour % 12;
  const ampm = lp.hour < 12 ? "am" : "pm";
  return `${h12}:${String(lp.minute).padStart(2, "0")}${ampm}`;
}

async function fetchTodaysEvents(accessToken: string): Promise<Array<{ time: string; title: string }>> {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "15",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Calendar error: ${await res.text()}`);
  const { items } = await res.json();
  return ((items ?? []) as Array<Record<string, unknown>>).map((e) => {
    const start = e.start as Record<string, string> | undefined;
    return {
      time: start?.dateTime ? timeLabel(start.dateTime) : "All day",
      title: (e.summary as string) ?? "(No title)",
    };
  });
}

async function runDailyReport(): Promise<void> {
  const sb = serviceClient();

  // Today's remaining calendar
  let events: Array<{ time: string; title: string }> = [];
  try {
    events = await fetchTodaysEvents(await getGoogleAccessToken());
  } catch (e) {
    console.error("swift-daily calendar fetch failed:", e);
  }

  // Bookings added in the last 24h (with source attribution)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: newBookings } = await sb
    .from("inbound_leads")
    .select("name, company, source, source_detail, status, created_at")
    .in("source", ["booking_page", "booking_agent"])
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false });
  const bookings = newBookings ?? [];

  const eventLines = events.map((e) => `${e.time} ${e.title}`);
  const bookingLines = bookings.map((b: Record<string, unknown>) =>
    `${b.name}${b.company ? ` (${b.company})` : ""} via ${String(b.source).replace("_", " ")}${b.source_detail ? ` — ${b.source_detail}` : ""}`
  );

  const subject =
    `Today: ${events.length === 0 ? "calendar clear" : `${events.length} meeting${events.length !== 1 ? "s" : ""} (${eventLines.slice(0, 3).join("; ")}${events.length > 3 ? "…" : ""})`}` +
    `; new bookings in last 24h: ${bookings.length === 0 ? "none" : bookingLines.slice(0, 2).join("; ") + (bookings.length > 2 ? "…" : "")}`;

  await postMessage(sb, {
    from: AGENT_ID,
    subject: subject.slice(0, 300),
    payload: {
      date: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ }),
      events,
      new_bookings: bookings,
    },
    ttlHours: 24,
  });

  // Cache for any dashboard/widget use
  await sb.from("widget_data").upsert({
    agent_id: AGENT_ID,
    widget_key: "daily_schedule",
    data: { events, new_bookings: bookings, generated_at: new Date().toISOString() },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "agent_id,widget_key" });

  console.log(`swift-daily: ${events.length} events today, ${bookings.length} new bookings in 24h`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
  EdgeRuntime.waitUntil(runDailyReport().catch((err) => console.error("swift-daily error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", agent: AGENT_ID }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
