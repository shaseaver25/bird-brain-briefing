import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, postMessage } from "../_shared/agent-bus.ts";

// Member-company runs sourced from Apollo
const DAILY_RUNS = [
  {
    business: "realpath",
    per_page: 4,
    person_titles: [
      "Superintendent",
      "Assistant Superintendent",
      "Curriculum Director",
      "Director of Technology",
      "Director of Teaching and Learning",
    ],
    organization_num_employees_ranges: undefined as string[] | undefined,
  },
  {
    business: "tailoredu",
    per_page: 3,
    person_titles: ["Owner", "CEO", "COO", "Operations Manager", "Director of Operations", "Founder"],
    organization_num_employees_ranges: ["5,200"],
  },
  {
    business: "stonearch",
    per_page: 3,
    person_titles: [
      "Owner",
      "Executive Director",
      "CEO",
      "Founder",
      "President",
      "Director of Human Resources",
      "Learning and Development Manager",
    ],
    organization_num_employees_ranges: ["1,50"],
  },
];

const APOLLO_LOCATIONS = [
  "Minneapolis, Minnesota, United States",
  "Saint Paul, Minnesota, United States",
];

interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  linkedin_url?: string | null;
  email?: string | null;
  organization?: { name?: string; website_url?: string | null } | null;
}

async function apolloSearch(run: typeof DAILY_RUNS[0]): Promise<ApolloPerson[]> {
  const body: Record<string, unknown> = {
    person_titles: run.person_titles,
    person_locations: APOLLO_LOCATIONS,
    page: 1,
    per_page: run.per_page,
  };
  if (run.organization_num_employees_ranges) {
    body.organization_num_employees_ranges = run.organization_num_employees_ranges;
  }
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": Deno.env.get("APOLLO_API_KEY")!,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apollo search ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.people ?? []) as ApolloPerson[];
}

async function apolloReveal(id: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": Deno.env.get("APOLLO_API_KEY")!,
      },
      body: JSON.stringify({ id, reveal_personal_emails: true }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.person?.email as string | undefined) ?? null;
  } catch {
    return null;
  }
}

interface Scored {
  apollo_id: string;
  score: number;
  note: string;
}

async function scorePeople(business: string, people: ApolloPerson[]): Promise<Map<string, Scored>> {
  const map = new Map<string, Scored>();
  if (people.length === 0) return map;

  const summary = people.map((p) => ({
    apollo_id: p.id,
    name: p.name,
    title: p.title,
    company: p.organization?.name,
    linkedin_url: p.linkedin_url,
  }));

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are SalesHawk, scoring leads for member company '" +
              business +
              "'. Return ONLY JSON of the form {\"results\":[{\"apollo_id\":\"...\",\"score\":0-100,\"note\":\"one sentence on why they fit\"}]}.",
          },
          {
            role: "user",
            content: `Score these prospects 0-100 for fit with member company "${business}" and give one short note each.\n\n${JSON.stringify(summary)}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Gateway ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const arr: Scored[] = parsed.results ?? parsed.scores ?? [];
    for (const s of arr) {
      if (s?.apollo_id) map.set(s.apollo_id, s);
    }
  } catch (err) {
    console.error(`scoring failed [${business}]:`, err);
  }
  return map;
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

function getStoneArchClient() {
  const url = Deno.env.get("STONEARCH_CRM_URL") ?? "https://vvaqdqzpbtlfucsoiupc.supabase.co";
  return createClient(url, Deno.env.get("STONEARCH_CRM_SERVICE_KEY")!);
}

async function prospectForBusiness(run: typeof DAILY_RUNS[0]): Promise<FindResult[]> {
  const finds: FindResult[] = [];
  const people = await apolloSearch(run);
  const scores = await scorePeople(run.business, people);
  const stoneArch = getStoneArchClient();

  await Promise.all(
    people.map(async (person) => {
      const scored = scores.get(person.id);
      const score = scored?.score ?? 50;
      const note = scored?.note ?? "";

      let email: string | null = person.email ?? null;
      if (!email || email === "email_not_unlocked@domain.com") {
        email = await apolloReveal(person.id);
      }

      const name = person.name ?? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();

      const { error } = await stoneArch.from("prospect_leads").upsert(
        {
          apollo_id: person.id,
          member_company: run.business,
          contact_name: name,
          title: person.title ?? null,
          company: person.organization?.name ?? null,
          linkedin_url: person.linkedin_url ?? null,
          email,
          source: "saleshawk_apollo",
          status: "new",
          lead_score: score,
          notes: note,
          ai_insights: note,
          enrichment_data: person,
        },
        { onConflict: "apollo_id" }
      );

      if (error) console.error(`Insert failed [${run.business}] ${name}: ${error.message}`);
      else console.log(`✓ ${name} → stonearch CRM (${run.business})`);

      finds.push({
        business: run.business,
        name,
        title: person.title ?? "",
        company: person.organization?.name ?? "",
        score,
        linkedin_url: person.linkedin_url ?? null,
        email,
        notes: note,
        status: error ? "error" : "inserted",
        error: error?.message,
      });
    })
  );

  return finds;
}

async function runProspecting(): Promise<void> {
  const staffMeetingSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const settledResults = await Promise.allSettled(DAILY_RUNS.map(prospectForBusiness));

  const allFinds: FindResult[] = [];
  for (let i = 0; i < settledResults.length; i++) {
    const result = settledResults[i];
    if (result.status === "fulfilled") {
      allFinds.push(...result.value);
    } else {
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

  // Inbound picture for the same window — outbound finds mean little
  // without knowing what walked in the door on its own.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: inboundRows } = await staffMeetingSupabase
    .from("inbound_leads")
    .select("name, company, source, business, status, created_at")
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false });
  const inbound = inboundRows ?? [];
  const inboundBySource: Record<string, number> = {};
  for (const l of inbound) {
    inboundBySource[l.source] = (inboundBySource[l.source] ?? 0) + 1;
  }

  await staffMeetingSupabase.from("widget_data").upsert(
    {
      agent_id: "saleshawk",
      widget_key: "todays_finds",
      data: {
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        run_time: runTime,
        total: inserted.length,
        finds: allFinds,
        inbound_24h: { total: inbound.length, by_source: inboundBySource, leads: inbound },
      },
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: runTime,
    },
    { onConflict: "agent_id,widget_key" }
  );

  const topLead = [...inserted].sort((a, b) => b.score - a.score)[0];
  const inboundSummary = inbound.length === 0
    ? "no inbound in 24h"
    : `${inbound.length} inbound in 24h (${Object.entries(inboundBySource).map(([s, n]) => `${n} ${s.replace("_", " ")}`).join(", ")})`;
  await postMessage(staffMeetingSupabase, {
    from: "saleshawk",
    subject: (inserted.length === 0
      ? "Prospecting run: no new outbound leads today"
      : `${inserted.length} new outbound lead${inserted.length !== 1 ? "s" : ""}${topLead ? `; top: ${topLead.name} at ${topLead.company} (score ${topLead.score})` : ""}`)
      + `; ${inboundSummary}`,
    payload: {
      count: inserted.length,
      top_lead: topLead ? { name: topLead.name, company: topLead.company, score: topLead.score, business: topLead.business } : null,
      inbound_24h: { total: inbound.length, by_source: inboundBySource },
    },
  });

  console.log(`saleshawk-daily complete: ${inserted.length}/${allFinds.length} inserted`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  // @ts-ignore
  EdgeRuntime.waitUntil(runProspecting().catch((err) => console.error("saleshawk-daily error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", message: "Apollo prospecting running in background. Check widget_data when done." }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
