import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

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
  aiwhisperers: {
    sender: "Shannon Seaver, founder of The AI Whisperers",
    offer: "practical AI training and consulting that helps business owners and nonprofits put AI to work without the overwhelm",
    cta: "a 20-minute intro call to learn about your goals and share what's working for others like you",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

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

Format your response as JSON only:
{
  "subject": "Email subject line",
  "body": "Full email body with line breaks as \\n"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "You are SalesHawk, an expert sales copywriter. Write concise, personalized cold emails that get replies. Respond with JSON only.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Claude did not return valid JSON");

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
