import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TZ = "America/Chicago";
const SLOT_MIN = 30;
const BUFFER_MIN = 15;
const LEAD_HOURS = 24;
const DAYS_AHEAD = 14;
const WORK_START_HOUR = 9; // local
const WORK_END_HOUR = 17;

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN_WREN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

// Get the offset (in minutes) of TZ from UTC at a given UTC instant.
function tzOffsetMinutes(utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcDate).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return (asUTC - utcDate.getTime()) / 60000;
}

// Build a UTC Date from a local (TZ) wall-clock time.
function localToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // First guess assuming UTC, then correct by the actual offset at that instant.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60000);
}

function localParts(d: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(dtf.formatToParts(d).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const accessToken = await getAccessToken();

    const now = new Date();
    const earliest = new Date(now.getTime() + LEAD_HOURS * 3600 * 1000);
    const horizon = new Date(now.getTime() + DAYS_AHEAD * 24 * 3600 * 1000);

    // Free/busy lookup
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: horizon.toISOString(),
        timeZone: TZ,
        items: [{ id: "primary" }],
      }),
    });
    if (!fbRes.ok) throw new Error(`freeBusy error: ${await fbRes.text()}`);
    const fbJson = await fbRes.json();
    const busy: { start: string; end: string }[] = fbJson.calendars?.primary?.busy ?? [];
    const busyRanges = busy.map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));

    // Walk each day in TZ, generate candidate slots, filter against busy + buffer.
    const slotMs = SLOT_MIN * 60 * 1000;
    const bufMs = BUFFER_MIN * 60 * 1000;
    const slots: { start: string; end: string }[] = [];

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const probe = new Date(now.getTime() + i * 24 * 3600 * 1000);
      const lp = localParts(probe);
      if (lp.weekday === "Sat" || lp.weekday === "Sun") continue;

      for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
        for (const m of [0, 30]) {
          const startUtc = localToUtc(lp.year, lp.month, lp.day, h, m);
          const endUtc = new Date(startUtc.getTime() + slotMs);

          if (startUtc < earliest) continue;
          // Slot must end by work end
          const endLp = localParts(endUtc);
          if (endLp.day !== lp.day || endLp.hour > WORK_END_HOUR || (endLp.hour === WORK_END_HOUR && endLp.minute > 0)) continue;

          // Check overlap with busy ± buffer
          const conflict = busyRanges.some(b =>
            startUtc.getTime() < b.end + bufMs && endUtc.getTime() > b.start - bufMs
          );
          if (conflict) continue;

          slots.push({ start: startUtc.toISOString(), end: endUtc.toISOString() });
        }
      }
    }

    return new Response(JSON.stringify({ slots, timezone: TZ, durationMinutes: SLOT_MIN }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("booking-availability error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});