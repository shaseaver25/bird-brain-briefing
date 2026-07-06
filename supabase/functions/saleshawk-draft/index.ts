import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUSINESS_CONTEXT: Record<string, { sender: string; offer: string; cta: string }> = {
  realpath: {
    sender: "Shannon Seaver, founder of RealPath Learning",
    offer: "AI-powered professional development and learning solutions designed specifically for K-12 educators and districts",
    cta: "a 20-minute call to explore whether RealPath is a fit for your district",
  },
  tailoredu: {
    sender: "Shannon Seaver, founder of TailoredU",
    offer: "custom software builds, CRM systems, and AI workflow automation for small and mid-sized businesses",
    cta: "a quick call to hear about your current systems and see if there's a fit",
  },
  stonearch: {
    sender: "Shannon Seaver, founder of Stone Arch Collective",
    offer: "a community-driven AI training and peer-learning program that helps business and nonprofit leaders build practical AI skills together",
    cta: "a quick intro call to see whether Stone Arch's community and training would be a fit",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await authClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lead, business } = await req.json();

    if (!lead || !business) {
      return new Response(JSON.stringify({ error: "lead and business are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = BUSINESS_CONTEXT[business];
    if (!ctx) {
      return new Response(JSON.stringify({ error: `Unknown business: ${business}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are SalesHawk, writing a cold outreach email on behalf of ${ctx.sender}.

Lead details:
- Name: ${lead.name}
- Title: ${lead.title || "Unknown"}
- Company: ${lead.company || "Unknown"}
- Research notes: ${lead.notes || "No notes available"}

What we offer: ${ctx.offer}

Write a cold email that:
1. Opens with a specific, genuine observation about this person or their organization (from the research notes — no generic openers)
2. Connects that observation to a relevant pain point or opportunity
3. Introduces ${ctx.sender.split(",")[0].replace("Shannon Seaver", "Shannon")} and the offer in 1–2 sentences — no fluff
4. Ends with a low-pressure CTA: ${ctx.cta}
5. Keeps the whole email under 150 words
6. Sounds like a real person wrote it, not a marketing department
7. Uses ONLY the lead details provided above — never invent facts about this person, their company, mutual connections, or past interactions. If the research notes are empty, open with an observation about their role or industry instead

Format your response as JSON only:
{
  "subject": "Email subject line",
  "body": "Full email body with line breaks as \\n"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content:
              "You are SalesHawk, an expert sales copywriter. Write concise, personalized cold emails that get replies. Respond with JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!aiRes.ok) throw new Error(`Gateway ${aiRes.status}: ${await aiRes.text()}`);
    const aiJson = await aiRes.json();
    const text: string = aiJson.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return valid JSON");

    const draft = JSON.parse(match[0]) as { subject: string; body: string };

    return new Response(JSON.stringify({ ok: true, draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("saleshawk-draft error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
