// Swift — the conversational scheduling agent behind the public /meet page.
// Visitors chat to book time with Shannon: Swift asks why they want to meet,
// picks the meeting length from the reason, offers only genuinely open slots
// from the real calendar, and books through booking-create (which also logs
// the lead with source attribution and alerts the team bus).
//
// Stateless: the client sends the full conversation each turn.
// POST body: { messages: [{role:'user'|'assistant', content}...], src?: string }
// Response:  { reply, durationMin?, slots?: [{start,end}], booked?: {...} }

import { corsHeaders } from "../_shared/cors.ts";
import { ALLOWED_DURATIONS, getOpenSlots, localParts, TZ, type Slot } from "../_shared/availability.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 2000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function slotLabel(iso: string): string {
  const lp = localParts(new Date(iso));
  const h12 = lp.hour % 12 === 0 ? 12 : lp.hour % 12;
  const ampm = lp.hour < 12 ? "am" : "pm";
  return `${lp.weekday} ${lp.month}/${lp.day} ${h12}:${String(lp.minute).padStart(2, "0")}${ampm}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are Swift, Shannon Seaver's scheduling assistant. Visitors reach you from Shannon's email signature or social posts to book a meeting with her. Shannon runs TailoredU (AI training), RealPath (K-12 education), and AI Whisperers (AI consulting), based in Minneapolis (${TZ} timezone).

YOUR JOB, in order:
1. Greet briefly and find out WHY they want to meet (one question, not an interrogation).
2. From the reason, pick the meeting length:
   - Quick intro, networking, or "pick your brain" → 15 minutes
   - Product demo, sales conversation, or exploring working together → 30 minutes
   - Working session, consulting, workshop planning, or complex project discussion → 60 minutes
   If genuinely ambiguous, ask one clarifying question; when in doubt between two lengths, choose the shorter (Shannon can always extend).
3. Ask for any timing preference (morning/afternoon, specific days) and request open times. Prefer mornings for demos and intros; working sessions fit best mid-morning or early afternoon — but the visitor's stated preference always wins.
4. Once they pick a time, collect their name and email (both required), then confirm the booking.

STRICT RULES:
- Respond with ONLY a JSON object, no markdown fences, matching:
  {"reply": "what you say to the visitor",
   "action": "chat" | "propose" | "book",
   "durationMin": 15 | 30 | 60 (include once the reason is known),
   "reason": "one-line meeting purpose (include once known)",
   "preference": "visitor's timing preference in a few words, or null",
   "chosenStart": "ISO start time (only with action book)",
   "name": "visitor name (only with action book)",
   "email": "visitor email (only with action book)"}
- action "chat": you still need information (reason, length, preference, name, or email).
- action "propose": reason and durationMin are known and you want to show open times. Do NOT list times in your reply — the system fetches real availability and shows it; your reply should just lead into it (e.g. "Here's what Shannon has open...").
- action "book": the visitor accepted a specific offered time AND you have name + email. chosenStart must be exactly one of the offered slot start times.
- NEVER invent, guess, or state specific dates/times yourself — only reference times the system has actually offered in this conversation.
- Never promise anything on Shannon's behalf beyond the meeting itself. If asked things outside scheduling, answer in one friendly sentence and steer back to booking.
- Keep replies to 1-3 short sentences, warm and human, no markdown.`;

interface AgentDecision {
  reply?: string;
  action?: string;
  durationMin?: number;
  reason?: string;
  preference?: string | null;
  chosenStart?: string;
  name?: string;
  email?: string;
}

function extractJson(text: string): AgentDecision | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate.trim()); } catch { /* fall through */ }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

async function callModel(messages: Array<{ role: string; content: string }>): Promise<AgentDecision | null> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    console.error(`booking-agent AI error: ${res.status} ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  return extractJson(data.choices?.[0]?.message?.content ?? "");
}

// Pick up to `count` slots spread across different days so the visitor
// gets variety, honoring a morning/afternoon preference when stated.
function pickSpreadSlots(slots: Slot[], preference: string | null | undefined, count = 4): Slot[] {
  const pref = (preference ?? "").toLowerCase();
  let pool = slots;
  if (/morning/.test(pref)) {
    pool = slots.filter((s) => localParts(new Date(s.start)).hour < 12);
  } else if (/afternoon|evening/.test(pref)) {
    pool = slots.filter((s) => localParts(new Date(s.start)).hour >= 12);
  }
  if (pool.length === 0) pool = slots;

  const byDay = new Map<string, Slot[]>();
  for (const s of pool) {
    const lp = localParts(new Date(s.start));
    const key = `${lp.year}-${lp.month}-${lp.day}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const picked: Slot[] = [];
  // First pass: one per day; second pass: fill remaining from earliest days.
  for (const daySlots of byDay.values()) {
    if (picked.length >= count) break;
    picked.push(daySlots[0]);
  }
  for (const daySlots of byDay.values()) {
    for (const s of daySlots.slice(1)) {
      if (picked.length >= count) break;
      picked.push(s);
    }
  }
  return picked.sort((a, b) => a.start.localeCompare(b.start));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!Deno.env.get("LOVABLE_API_KEY")) return json({ error: "not configured" }, 500);
    const body = await req.json().catch(() => ({}));
    const src: string = typeof body?.src === "string" ? body.src.slice(0, 200) : "";
    const rawMessages: Array<{ role: string; content: string }> = Array.isArray(body?.messages) ? body.messages : [];

    // Abuse guards for a public LLM endpoint: bounded conversation size.
    if (rawMessages.length > MAX_MESSAGES) {
      return json({ reply: "This conversation has gotten long — please refresh and start a new booking.", action: "chat" });
    }
    const messages = rawMessages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

    const today = new Date();
    const lp = localParts(today);
    const context = `Today is ${WEEKDAYS[new Date().getUTCDay()]} ${lp.month}/${lp.day}/${lp.year} (${TZ}).`;

    const decision = await callModel([
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${context}` },
      ...(messages.length ? messages : [{ role: "user", content: "Hi" }]),
    ]);
    if (!decision || typeof decision.reply !== "string") {
      return json({ reply: "Sorry — I hiccuped. Could you say that again?", action: "chat" });
    }

    const durationMin = (ALLOWED_DURATIONS as readonly number[]).includes(Number(decision.durationMin))
      ? Number(decision.durationMin)
      : null;

    // ── Propose: fetch real availability and let Swift pick suitable times ──
    if (decision.action === "propose" && durationMin) {
      const open = await getOpenSlots(durationMin);
      if (open.length === 0) {
        return json({
          reply: "Shannon's calendar is fully booked for the next two weeks. Leave your email on the contact form and she'll reach out directly.",
          action: "chat",
        });
      }
      const offered = pickSpreadSlots(open, decision.preference, 4);
      return json({
        reply: decision.reply,
        action: "propose",
        durationMin,
        reason: decision.reason ?? null,
        slots: offered.map((s) => ({ ...s, label: slotLabel(s.start) })),
      });
    }

    // ── Book: validate against real availability, then create the event ──
    if (decision.action === "book") {
      const { chosenStart, name, email } = decision;
      if (!chosenStart || !name || !email || !durationMin) {
        return json({ reply: decision.reply || "I still need a couple details before I can book that.", action: "chat" });
      }
      // Re-verify the chosen time is genuinely open (also guards against
      // the model inventing a time that was never offered).
      const open = await getOpenSlots(durationMin);
      const valid = open.some((s) => s.start === new Date(chosenStart).toISOString());
      if (!valid) {
        const offered = pickSpreadSlots(open, decision.preference, 4);
        return json({
          reply: "That time just became unavailable — here are the current options.",
          action: "propose",
          durationMin,
          reason: decision.reason ?? null,
          slots: offered.map((s) => ({ ...s, label: slotLabel(s.start) })),
        });
      }

      const createRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/booking-create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Service-role auth lets booking-create trust the forwarded
            // visitor IP for its per-IP rate limit.
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            start: chosenStart,
            name,
            email,
            durationMin,
            notes: decision.reason ? `Reason (via Swift booking agent): ${decision.reason}` : "Booked via Swift booking agent",
            source: "booking_agent",
            sourceDetail: [decision.reason && `reason: ${decision.reason}`, src && `src: ${src}`]
              .filter(Boolean).join("; "),
            clientIp: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown",
          }),
        },
      );
      const created = await createRes.json();
      if (createRes.status === 429) {
        return json({
          reply: "It looks like you've hit the limit of 2 bookings per day. Please come back tomorrow, or email Shannon directly if it's urgent.",
          action: "chat",
        });
      }
      if (!createRes.ok) {
        console.error("booking-agent create failed:", created);
        return json({
          reply: "That slot was taken a moment ago — let me pull up fresh times.",
          action: "chat",
        });
      }

      return json({
        reply: decision.reply,
        action: "book",
        booked: {
          start: created.start,
          end: created.end,
          durationMin,
          meetLink: created.meetLink ?? null,
          label: slotLabel(created.start),
        },
      });
    }

    // ── Plain conversational turn ──
    return json({
      reply: decision.reply,
      action: "chat",
      durationMin: durationMin ?? undefined,
    });
  } catch (e) {
    console.error("booking-agent error:", e);
    return json({ reply: "Something went wrong on my end — mind trying again?", action: "chat" });
  }
});
