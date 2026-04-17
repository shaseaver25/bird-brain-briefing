import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.20.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map business slug to CRM credentials
function getCrmClient(business: string) {
  const configs: Record<string, { url: string; key: string }> = {
    realpath: {
      url: Deno.env.get("CRM_REALPATH_URL")!,
      key: Deno.env.get("CRM_REALPATH_SERVICE_KEY")!,
    },
    tailoredu: {
      url: Deno.env.get("CRM_TAILOREDU_URL")!,
      key: Deno.env.get("CRM_TAILOREDU_SERVICE_KEY")!,
    },
    aiwhisperers: {
      url: Deno.env.get("CRM_AIWHISPERERS_URL")!,
      key: Deno.env.get("CRM_AIWHISPERERS_SERVICE_KEY")!,
    },
  };
  const config = configs[business];
  if (!config) throw new Error(`Unknown business: ${business}`);
  return createClient(config.url, config.key);
}

// Hunter.io email finder — returns null if not found or over free limit
async function findEmail(firstName: string, lastName: string, domain: string): Promise<string | null> {
  const apiKey = Deno.env.get("HUNTER_API_KEY");
  if (!apiKey || !domain) return null;
  try {
    const params = new URLSearchParams({ first_name: firstName, last_name: lastName, domain, api_key: apiKey });
    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return data?.email ?? null;
  } catch {
    return null;
  }
}

// Parse "First Last" into parts
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") || parts[0] };
}

// Extract domain from a URL
function urlToDomain(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface Prospect {
  name: string;
  title: string;
  company: string;
  website: string | null;
  linkedin_url: string | null;
  notes: string;
  score: number;
}

// Use Claude with web_search to find prospects matching an ICP
async function researchProspects(icp: string, count: number, business: string): Promise<Prospect[]> {
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  const systemPrompt = `You are SalesHawk, an elite sales researcher. Your job is to find real, specific, named individuals who match an ideal customer profile (ICP).

Rules:
- Only return real people you can verify exist via web search
- Always include their company website domain when you can find it
- Include LinkedIn URLs when findable
- Score each lead 0–100 based on ICP fit (title match, company size, location, engagement signals)
- Notes should include WHY this person is a good fit — specific signals like mutual connections, recent posts, company initiatives
- Return ONLY a valid JSON array, no other text`;

  const userPrompt = `Find ${count} prospects for this ICP:

${icp}

Business context: ${business}

Search for real people, verify they exist, find their company websites. Return a JSON array:
[
  {
    "name": "Full Name",
    "title": "Job Title",
    "company": "Company Name",
    "website": "company.com or null",
    "linkedin_url": "https://linkedin.com/in/handle or null",
    "notes": "Why this person fits — specific signals",
    "score": 75
  }
]`;

  // Run Claude with web search enabled
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search" } as any],
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract the final text block (after tool use)
  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText = block.text;
  }

  // Parse JSON from Claude's response
  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Claude did not return a valid JSON array");
  return JSON.parse(match[0]) as Prospect[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { business, icp, count = 10 } = await req.json();

    if (!business || !icp) {
      return new Response(
        JSON.stringify({ error: "business and icp are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validBusinesses = ["realpath", "tailoredu", "aiwhisperers"];
    if (!validBusinesses.includes(business)) {
      return new Response(
        JSON.stringify({ error: `business must be one of: ${validBusinesses.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`SalesHawk prospecting: ${count} leads for ${business}`);
    console.log(`ICP: ${icp}`);

    // Phase 1: Research prospects via Claude + web search
    const prospects = await researchProspects(icp, count, business);
    console.log(`Found ${prospects.length} prospects`);

    // Phase 2: Enrich emails via Hunter.io + build lead rows
    const crm = getCrmClient(business);
    const results = [];

    for (const prospect of prospects) {
      // Try to find email via Hunter.io
      let email: string | null = null;
      const domain = prospect.website ? urlToDomain(prospect.website) : null;
      if (domain) {
        const { first, last } = splitName(prospect.name);
        email = await findEmail(first, last, domain);
      }

      const leadRow = {
        business,
        name: prospect.name,
        email,
        company: prospect.company || null,
        title: prospect.title || null,
        phone: null,
        linkedin_url: prospect.linkedin_url || null,
        source: "ai_agent",
        notes: prospect.notes || null,
        score: prospect.score ?? 50,
        status: "new",
      };

      // Phase 3: Insert into CRM
      const { data, error } = await crm.from("leads").insert(leadRow).select("id").single();

      if (error) {
        console.error(`Failed to insert ${prospect.name}:`, error.message);
        results.push({ name: prospect.name, status: "error", error: error.message });
      } else {
        console.log(`Inserted lead: ${prospect.name} (${data.id})`);
        results.push({ name: prospect.name, status: "inserted", id: data.id, email });
      }
    }

    const inserted = results.filter((r) => r.status === "inserted").length;
    const failed = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({
        ok: true,
        summary: `${inserted} leads added to ${business} CRM${failed > 0 ? `, ${failed} failed` : ""}`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("saleshawk-prospect error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
