import { corsHeaders } from "../_shared/cors.ts";
import { ALLOWED_DURATIONS, getOpenSlots, TZ } from "../_shared/availability.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const requested = Number(url.searchParams.get("duration") ?? 30);
    const duration = (ALLOWED_DURATIONS as readonly number[]).includes(requested) ? requested : 30;

    const slots = await getOpenSlots(duration);

    return new Response(JSON.stringify({ slots, timezone: TZ, durationMinutes: duration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("booking-availability error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
