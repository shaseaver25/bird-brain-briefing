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
Company size: districts with 500–50,000 students.`,
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

function getCrmClient(business: string) {
  const configs: Record<string, { url: string; key: string }> = {
    realpath: { url: Deno.env.get("CRM_REALPATH_URL")!, key: Deno.env.get("CRM_REALPATH_SERVICE_KEY")! },
    tailoredu: { url: Deno.env.get("CRM_TAILOREDU_URL")!, key: Deno.env.get("CRM_TAILOREDU_SERVICE_KEY")! },
    aiwhisperers: { url: Deno.env.get("CRM_AIWHISPERERS_URL")!, key: Deno.env.get("CRM_AIWHISPERERS_SERVICE_KEY")! },
  };
  const config = configs[business];
  if (!config) throw new Error(`Unknown business: ${business}`);
  return createClient(config.url, config.key);
}

async function findEmail(firstName: string, lastName: string, domain: string): Promise<string | null> {
  const apiKey = Deno.env.get("HUNTER_API_KEY");
  if (!apiKey || !domain) return null;
  try {
    const params = new URLSearchParams({ first_name: firstName, last_name: lastName, domain, api_key: apiKey });
    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return data?.email ?? null;
  } catch { return null; }
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, "").trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") || parts[0] };
}

function urlToDomain(url: string): string | null {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return null; }
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

// Attempt to repair malformed JSON using a second Claude call
async function repairJson(anthropic: Anthropic, rawText: string): Promise<Prospect[]> {
  const repair = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: "You are a JSON repair tool. Extract and return ONLY a valid JSON array from the input. No explanation, no markdown, just the array.",
    messages: [{ role: "user", content: `Extract the JSON array from this text:\n\n${rawText}` }],
  });
  const repairText = repair.content.find((b) => b.type === "text")?.text ?? "";
  const match = repairText.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("JSON repair failed");
  return JSON.parse(match[0]) as Prospect[];
}

async function researchProspects(icp: string, count: number, business: string): Promise<Prospect[]> {
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  const userPrompt = `Find ${count} real, verifiable prospects matching this ICP for ${business}:

${icp}

Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Search for real people. Verify they exist. Find company websites and LinkedIn profiles.

CRITICAL OUTPUT FORMAT: Your final message must contain ONLY a valid JSON array — no prose, no markdown fences, no explanation before or after. Start with [ and end with ]. Example shape:

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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
    system: "You are SalesHawk, an elite sales researcher. Use web search to find real people matching the ICP. Your final response MUST be a valid JSON array starting with [ and ending with ]. Output nothing else — no prose, no markdown.",
    messages: [
      { role: "user", content: userPrompt },
    ],
  } as any);

  // Collect all text blocks from Claude's response
  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText += block.text;
  }

  try {
    const match = jsonText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("no array found");
    return JSON.parse(match[0]) as Prospect[];
  } catch {
    console.warn(`JSON parse failed for ${business}, attempting repair...`);
    return repairJson(anthropic, jsonText);
  }
}

interface FindResult {
  business: string;
  name: string;
  title: string;
  company: string;
  score: number;
  linkedin_url: string | null;
  email: string | null;
  notes: string;
  status: "inserted" | "error";
  error?: string;
}

// Process a single business run — returns its finds
async function prospectForBusiness(run: typeof DAILY_RUNS[0]): Promise<FindResult[]> {
  const finds: FindResult[] = [];
  const prospects = await researchProspects(run.icp, run.count, run.business);
  const crm = getCrmClient(run.business);

  await Promise.all(prospects.map(async (prospect) => {
    let email: string | null = null;
    const domain = prospect.website ? urlToDomain(prospect.website) : null;
    if (domain) {
      const { first, last } = splitName(prospect.name);
      email = await findEmail(first, last, domain);
    }

    const { error } = await crm.from("leads").insert({
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
    });

    if (error) console.error(`Insert failed [${run.business}] ${prospect.name}: ${error.message}`);
    else console.log(`✓ ${prospect.name} → ${run.business} CRM`);

    finds.push({
      business: run.business,
      name: prospect.name,
      title: prospect.title,
      company: prospect.company,
      score: prospect.score ?? 50,
      linkedin_url: prospect.linkedin_url || null,
      email,
      notes: prospect.notes || "",
      status: error ? "error" : "inserted",
      error: error?.message,
    });
  }));

  return finds;
}

async function runProspecting(): Promise<void> {
  const staffMeetingSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fix #6: Run all 3 businesses in parallel — cuts runtime from ~3 min to ~1 min
  const settledResults = await Promise.allSettled(DAILY_RUNS.map(prospectForBusiness));

  const allFinds: FindResult[] = [];
  for (let i = 0; i < settledResults.length; i++) {
    const result = settledResults[i];
    if (result.status === "fulfilled") {
      allFinds.push(...result.value);
    } else {
      // Entire business run failed — record it so the dashboard can show it
      console.error(`Business run failed [${DAILY_RUNS[i].business}]:`, result.reason);
      allFinds.push({
        business: DAILY_RUNS[i].business,
        name: "Run failed",
        title: "",
        company: "",
        score: 0,
        linkedin_url: null,
        email: null,
        notes: String(result.reason),
        status: "error",
        error: String(result.reason),
      });
    }
  }

  const inserted = allFinds.filter((f) => f.status === "inserted");
  const runTime = new Date().toISOString();

  // Fix #1: agent_id stored as text slug "saleshawk" — requires widget_data.agent_id to be TEXT type
  await staffMeetingSupabase.from("widget_data").upsert({
    agent_id: "saleshawk",
    widget_key: "todays_finds",
    data: {
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      run_time: runTime,
      total: inserted.length,
      finds: allFinds,
    },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    updated_at: runTime,
  }, { onConflict: "agent_id,widget_key" });

  console.log(`saleshawk-daily complete: ${inserted.length}/${allFinds.length} inserted`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-ignore
  EdgeRuntime.waitUntil(runProspecting().catch((err) => console.error("saleshawk-daily error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", message: "Prospecting running in background (~1 min). Check widget_data when done." }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
