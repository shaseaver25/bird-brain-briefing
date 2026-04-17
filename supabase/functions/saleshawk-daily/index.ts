import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ICPs per business — update these as targeting evolves
const DAILY_RUNS = [
  {
    business: "realpath",
    count: 4,
    icp: `Find superintendents and curriculum directors at K-12 school districts in the Twin Cities metro area (Minneapolis-Saint Paul, MN).
Target titles: Superintendent, Assistant Superintendent, Curriculum Director, EdTech Director, Director of Teaching & Learning.
Target districts: public and charter school districts in Hennepin, Ramsey, Dakota, Anoka, Washington, and Scott counties.
Prioritize: people who have posted about AI in education, professional development, or instructional technology on LinkedIn recently.
Company size: districts with 500–50,000 students. Exclude districts already in the leads table if possible.`,
  },
  {
    business: "tailoredu",
    count: 3,
    icp: `Find owners and operations leaders at small to medium-sized businesses in the Twin Cities metro area (Minneapolis-Saint Paul, MN) who could benefit from custom software, CRM systems, or AI workflow automation.
Target titles: Owner, CEO, COO, Operations Manager, Director of Operations, Founder.
Target industries: professional services, healthcare clinics, real estate, construction, retail, restaurants, nonprofits with business operations.
Company size: 5–200 employees.
Prioritize: people actively posting about business operations, tech adoption, or growth challenges on LinkedIn.`,
  },
  {
    business: "aiwhisperers",
    count: 3,
    icp: `Find small business owners and nonprofit leaders in the Twin Cities metro area (Minneapolis-Saint Paul, MN) who would benefit from AI education, training, or consulting.
Target titles: Owner, Executive Director, CEO, Founder, President, Director.
Target: small businesses with 1–50 employees, and nonprofits of any size in Hennepin and Ramsey counties.
Prioritize: people who have expressed curiosity about AI, posted about efficiency challenges, or attended local business/tech events.
Also target: HR directors and L&D managers at Twin Cities companies interested in AI training programs for their staff.`,
  },
];

// Map business to CRM Supabase client
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

// Hunter.io email lookup
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

function splitName(name: string): { first: string; last: string } {
  const parts = name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, "").trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") || parts[0] };
}

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

async function researchProspects(icp: string, count: number, business: string): Promise<Prospect[]> {
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: `You are SalesHawk, an elite sales researcher for Shannon Seaver's businesses in Minneapolis. Find real, verifiable people who match the ICP. Use web search to confirm they exist and gather signals. Return ONLY a valid JSON array, no other text.`,
    messages: [{
      role: "user",
      content: `Find ${count} prospects matching this ICP for ${business}:

${icp}

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Search for real people. Verify they exist. Find their company websites and LinkedIn profiles.

Return a JSON array only:
[
  {
    "name": "Full Name",
    "title": "Job Title",
    "company": "Company Name",
    "website": "company.com or null",
    "linkedin_url": "https://linkedin.com/in/handle or null",
    "notes": "Why this person fits — specific signals like recent posts, mutual connections, company initiatives",
    "score": 75
  }
]`,
    }],
  } as any);

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText = block.text;
  }

  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Claude did not return valid JSON for ${business}`);
  return JSON.parse(match[0]) as Prospect[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const staffMeetingSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const runDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const allFinds: Array<{
      business: string;
      name: string;
      title: string;
      company: string;
      score: number;
      linkedin_url: string | null;
      email: string | null;
      notes: string;
      status: string;
    }> = [];

    // Run each business sequentially to avoid rate limits
    for (const run of DAILY_RUNS) {
      console.log(`Prospecting for ${run.business} (${run.count} leads)...`);

      try {
        const prospects = await researchProspects(run.icp, run.count, run.business);
        const crm = getCrmClient(run.business);

        for (const prospect of prospects) {
          let email: string | null = null;
          const domain = prospect.website ? urlToDomain(prospect.website) : null;
          if (domain) {
            const { first, last } = splitName(prospect.name);
            email = await findEmail(first, last, domain);
          }

          const leadRow = {
            business: run.business,
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

          const { error } = await crm.from("leads").insert(leadRow);

          allFinds.push({
            business: run.business,
            name: prospect.name,
            title: prospect.title,
            company: prospect.company,
            score: prospect.score ?? 50,
            linkedin_url: prospect.linkedin_url || null,
            email,
            notes: prospect.notes || "",
            status: error ? "error" : "inserted",
          });

          if (error) console.error(`Failed to insert ${prospect.name}:`, error.message);
          else console.log(`✓ ${prospect.name} → ${run.business} CRM`);
        }
      } catch (err) {
        console.error(`Error prospecting for ${run.business}:`, err);
        allFinds.push({
          business: run.business,
          name: `Error: ${String(err)}`,
          title: "",
          company: "",
          score: 0,
          linkedin_url: null,
          email: null,
          notes: "",
          status: "error",
        });
      }
    }

    // Write today's finds to widget_data so the dashboard can display them
    const inserted = allFinds.filter((f) => f.status === "inserted");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // expires in 24h

    await staffMeetingSupabase.from("widget_data").upsert({
      agent_id: "saleshawk",
      widget_key: "todays_finds",
      data: {
        date: runDate,
        total: inserted.length,
        finds: allFinds,
      },
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "agent_id,widget_key" });

    return new Response(
      JSON.stringify({
        ok: true,
        date: runDate,
        total_inserted: inserted.length,
        by_business: {
          realpath: inserted.filter((f) => f.business === "realpath").length,
          tailoredu: inserted.filter((f) => f.business === "tailoredu").length,
          aiwhisperers: inserted.filter((f) => f.business === "aiwhisperers").length,
        },
        finds: allFinds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("saleshawk-daily error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
