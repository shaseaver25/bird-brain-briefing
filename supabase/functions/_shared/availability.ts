// Shared calendar availability: computes open slots of a given length from
// the Google Calendar free/busy data (all subscribed calendars, with buffer
// and lead time). Used by booking-availability (30-min default page) and
// booking-agent (variable-length conversational scheduling).

export const TZ = "America/Chicago";
export const BUFFER_MIN = 15;
export const LEAD_HOURS = 24;
export const DAYS_AHEAD = 14;
export const WORK_START_HOUR = 9; // local
export const WORK_END_HOUR = 17;
export const ALLOWED_DURATIONS = [15, 30, 45, 60] as const;

export interface Slot {
  start: string;
  end: string;
}

export async function getGoogleAccessToken(): Promise<string> {
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
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60000);
}

export function localParts(d: Date) {
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

export async function getOpenSlots(durationMin: number): Promise<Slot[]> {
  if (!(ALLOWED_DURATIONS as readonly number[]).includes(durationMin)) {
    throw new Error(`duration must be one of ${ALLOWED_DURATIONS.join(", ")}`);
  }
  const accessToken = await getGoogleAccessToken();

  const now = new Date();
  const earliest = new Date(now.getTime() + LEAD_HOURS * 3600 * 1000);
  const horizon = new Date(now.getTime() + DAYS_AHEAD * 24 * 3600 * 1000);

  // Honor conflicts across every subscribed calendar — not just "primary".
  const calListRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader&showHidden=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!calListRes.ok) throw new Error(`calendarList error: ${await calListRes.text()}`);
  const calListJson = await calListRes.json();
  const calendarIds: string[] = (calListJson.items ?? [])
    .filter((c: Record<string, unknown>) => c.selected !== false)
    .map((c: Record<string, string>) => c.id);
  if (calendarIds.length === 0) calendarIds.push("primary");

  const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
      timeZone: TZ,
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!fbRes.ok) throw new Error(`freeBusy error: ${await fbRes.text()}`);
  const fbJson = await fbRes.json();
  const busy: { start: string; end: string }[] = [];
  for (const id of calendarIds) {
    const cal = fbJson.calendars?.[id];
    if (cal?.busy?.length) busy.push(...cal.busy);
  }
  const busyRanges = busy.map(b => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));

  // Walk each weekday in TZ, generate candidate slots on a 30-min grid,
  // filter against busy + buffer.
  const slotMs = durationMin * 60 * 1000;
  const bufMs = BUFFER_MIN * 60 * 1000;
  const slots: Slot[] = [];

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const probe = new Date(now.getTime() + i * 24 * 3600 * 1000);
    const lp = localParts(probe);
    if (lp.weekday === "Sat" || lp.weekday === "Sun") continue;

    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
      for (const m of [0, 30]) {
        const startUtc = localToUtc(lp.year, lp.month, lp.day, h, m);
        const endUtc = new Date(startUtc.getTime() + slotMs);

        if (startUtc < earliest) continue;
        // Slot must end by work end, same local day
        const endLp = localParts(endUtc);
        if (endLp.day !== lp.day || endLp.hour > WORK_END_HOUR || (endLp.hour === WORK_END_HOUR && endLp.minute > 0)) continue;

        const conflict = busyRanges.some(b =>
          startUtc.getTime() < b.end + bufMs && endUtc.getTime() > b.start - bufMs
        );
        if (conflict) continue;

        slots.push({ start: startUtc.toISOString(), end: endUtc.toISOString() });
      }
    }
  }

  return slots;
}
