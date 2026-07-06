// Public intake endpoint for inbound leads — point website contact/inquiry
// forms here (e.g. the TailoredU inquiry form), or POST manually to log a
// LinkedIn or referral contact. Each lead is recorded with a source tag and
// announced on the team message bus.
//
// POST body: { name, email, company?, business?, source?, sourceDetail?, notes?, website? }
//   source: booking_page | website_form | linkedin | referral | organic | other
//   website: honeypot field — humans never fill it; bots that do are dropped.

import { corsHeaders } from "../_shared/cors.ts";
import { recordInboundLead } from "../_shared/inbound.ts";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, company, business, source, sourceDetail, notes, website } = body ?? {};

    // Honeypot: silently accept but drop bot submissions.
    if (typeof website === "string" && website.trim() !== "") {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (typeof name !== "string" || !name.trim() || name.length > 200) {
      return new Response(JSON.stringify({ error: "valid name required" }), { status: 400, headers });
    }
    if (typeof email !== "string" || !isEmail(email)) {
      return new Response(JSON.stringify({ error: "valid email required" }), { status: 400, headers });
    }

    await recordInboundLead({
      name: name.trim(),
      email: email.trim(),
      company: typeof company === "string" ? company : undefined,
      business: typeof business === "string" ? business : undefined,
      source: typeof source === "string" && source ? source : "website_form",
      sourceDetail: typeof sourceDetail === "string" ? sourceDetail : undefined,
      notes: typeof notes === "string" ? notes : undefined,
    });

    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (e) {
    console.error("inbound-intake error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
});
