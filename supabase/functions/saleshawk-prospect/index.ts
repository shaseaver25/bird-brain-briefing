import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Per-business Apollo search defaults (mirror saleshawk-daily)
const PRESETS: Record<
  string,
  { person_titles: string[]; organization_num_employees_ranges?: string[] }
> = {
  realpath: {
    person_titles: [
      "Superintendent",
      "Assistant Superintendent",
      "Curriculum Director",
      "Director of Technology",
      "Director of Teaching and Learning",
    ],
  },
  tailoredu: {
    person_titles: ["Owner", "CEO", "COO", "Operations Manager", "Director of Operations", "Founder"],
    organization_num_employees_ranges: ["5,200"],
  },
  stonearch: {
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
};

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

async function apolloSearch(
  preset: typeof PRESETS[string],
  per_page: number
): Promise<ApolloPerson[]> {
  const body: Record<string, unknown> = {
    person_titles: preset.person_titles,
    person_locations: APOLLO_LOCATIONS,
    page: 1,
    per_page,
  };
  if (preset.organization_num_employees_ranges) {
    body.organization_num_employees_ranges = preset.organization_num_employees_ranges;
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

async function scorePeople(
  business: string,
  people: ApolloPerson[]
): Promise<Map<string, { score: number; note: string }>> {
  const map = new Map<string, { score: number; note: string }>();
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
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const arr = (parsed.results ?? parsed.scores ?? []) as Array<{
      apollo_id: string;
      score: number;
      note: string;
    }>;
    for (const s of arr) if (s?.apollo_id) map.set(s.apollo_id, { score: s.score, note: s.note });
  } catch (err) {
    console.error(`scoring failed [${business}]:`, err);
  }
  return map;
}

function getStoneArchClient() {
  const url = Deno.env.get("STONEARCH_CRM_URL") ?? "https://vvaqdqzpbtlfucsoiupc.supabase.co";
  return createClient(url, Deno.env.get("STONEARCH_CRM_SERVICE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Require authenticated admin caller
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

    const { business, count: rawCount = 10 } = await req.json();
    // Bound count server-side to prevent abuse
    const count = Math.min(Math.max(1, Number(rawCount) || 10), 25);

    const preset = PRESETS[business];
    if (!preset) {
      return new Response(
        JSON.stringify({ error: `business must be one of: ${Object.keys(PRESETS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`SalesHawk prospecting (Apollo): ${count} leads for ${business}`);

    const people = await apolloSearch(preset, count);
    console.log(`Apollo returned ${people.length} people`);

    const scores = await scorePeople(business, people);
    const stoneArch = getStoneArchClient();
    const results: Array<Record<string, unknown>> = [];

    for (const person of people) {
      const scored = scores.get(person.id);
      const score = scored?.score ?? 50;
      const note = scored?.note ?? "";

      let email: string | null = person.email ?? null;
      if (!email || email === "email_not_unlocked@domain.com") {
        email = await apolloReveal(person.id);
      }

      const name =
        person.name ?? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();

      const { data, error } = await stoneArch
        .from("prospect_leads")
        .upsert(
          {
            apollo_id: person.id,
            member_company: business,
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
        )
        .select("apollo_id")
        .maybeSingle();

      if (error) {
        console.error(`Failed to upsert ${name}:`, error.message);
        results.push({ name, status: "error", error: error.message });
      } else {
        results.push({ name, status: "inserted", id: data?.apollo_id ?? person.id, email });
      }
    }

    const inserted = results.filter((r) => r.status === "inserted").length;
    const failed = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({
        ok: true,
        summary: `${inserted} leads added to Stone Arch CRM for ${business}${
          failed > 0 ? `, ${failed} failed` : ""
        }`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("saleshawk-prospect error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
