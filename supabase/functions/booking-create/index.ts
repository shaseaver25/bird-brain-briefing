import { corsHeaders } from "../_shared/cors.ts";
import { recordInboundLead } from "../_shared/inbound.ts";
import { serviceClient } from "../_shared/agent-bus.ts";
import { ALLOWED_DURATIONS, getGoogleAccessToken, TZ } from "../_shared/availability.ts";

const MAX_BOOKINGS_PER_IP_PER_DAY = 2;

function isEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

// The visitor's IP. Direct browser calls carry it in x-forwarded-for.
// Internal calls from booking-agent forward the visitor's real IP in the
// body — trusted only when authenticated with the service-role key, so a
// direct caller can't spoof clientIp to dodge the limit.
function clientIp(req: Request, body: Record<string, unknown>): string {
  const auth = req.headers.get("authorization") ?? "";
  const isInternal = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (isInternal && typeof body.clientIp === "string" && body.clientIp) {
    return body.clientIp.slice(0, 100);
  }
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { start, name, email, notes, source, sourceDetail, durationMin } = body ?? {};
    if (!start || !name || !email) throw new Error("start, name, email required");
    if (!isEmail(email)) throw new Error("invalid email");
    if (typeof name !== "string" || name.length > 200) throw new Error("invalid name");

    const slotMin = (ALLOWED_DURATIONS as readonly number[]).includes(Number(durationMin))
      ? Number(durationMin)
      : 30;

    // Rate limit: max 2 bookings per IP per rolling 24h.
    const ip = clientIp(req, body ?? {});
    const sb = serviceClient();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: rlError } = await sb
      .from("booking_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", dayAgo);
    // If the rate-limit table is missing (migration not yet applied), log
    // and allow — a lost booking is worse than a missed limit check.
    if (rlError) console.error("booking-create rate-limit check failed:", rlError.message);
    else if ((recentCount ?? 0) >= MAX_BOOKINGS_PER_IP_PER_DAY) {
      return new Response(
        JSON.stringify({ error: "Booking limit reached — you can book up to 2 meetings per day. Please try again tomorrow or email Shannon directly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) throw new Error("invalid start");
    if (startDate < new Date()) throw new Error("start in the past");
    const endDate = new Date(startDate.getTime() + slotMin * 60 * 1000);

    const accessToken = await getGoogleAccessToken();

    // Re-check availability for this exact slot (defense vs race / stale UI)
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    const fbJson = await fbRes.json();
    const busy = fbJson.calendars?.primary?.busy ?? [];
    if (busy.length > 0) {
      return new Response(JSON.stringify({ error: "Slot is no longer available" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = {
      summary: `Meeting with ${name}`,
      description: `Booked via Skein.\n\nName: ${name}\nEmail: ${email}\n\nNotes:\n${notes ?? "(none)"}`,
      start: { dateTime: startDate.toISOString(), timeZone: TZ },
      end: { dateTime: endDate.toISOString(), timeZone: TZ },
      attendees: [{ email, displayName: name }],
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: { useDefault: true },
    };

    const createRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }
    );
    if (!createRes.ok) throw new Error(`Calendar create error: ${await createRes.text()}`);
    const created = await createRes.json();

    // Count this booking against the IP's daily limit.
    const { error: rlInsertError } = await sb.from("booking_rate_limits").insert({ ip });
    if (rlInsertError) console.error("booking-create rate-limit record failed:", rlInsertError.message);

    // Attribution: log the booking as an inbound lead and alert the team.
    // Fire-and-forget — the booking must succeed even if intake fails.
    // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
    EdgeRuntime.waitUntil(recordInboundLead({
      name,
      email,
      notes: notes ?? undefined,
      source: typeof source === "string" && source ? source : "booking_page",
      sourceDetail: typeof sourceDetail === "string" ? sourceDetail.slice(0, 500) : undefined,
      status: "demo_booked",
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        eventId: created.id,
        htmlLink: created.htmlLink,
        meetLink: created.hangoutLink ?? null,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("booking-create error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});