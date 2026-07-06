import { corsHeaders } from "../_shared/cors.ts";
import { recordInboundLead } from "../_shared/inbound.ts";
import { ALLOWED_DURATIONS, getGoogleAccessToken, TZ } from "../_shared/availability.ts";

function isEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

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