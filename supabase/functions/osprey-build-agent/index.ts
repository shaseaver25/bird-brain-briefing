import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateAgent(buildId: string, name: string, description: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  // Derive a slug for file paths
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // PascalCase for component name
  const pascal = name.replace(/(?:^|\s|[-_])(\w)/g, (_, c) => c.toUpperCase()).replace(/\s+/g, "");

  const prompt = `You are Osprey, the AI Agent Architect for Shannon Seaver's multi-agent staff meeting platform (Bird Brain Briefing).

Shannon wants to commission a new agent:
Name: "${name}"
Description: "${description}"

Tech stack:
- Frontend: React/Vite with shadcn/ui components (@/components/ui/*)
- Backend: Supabase Edge Functions (Deno/TypeScript)
- AI: Claude API via @anthropic-ai/sdk
- Database: Supabase PostgreSQL — widget_data table exists (agent_id text, widget_key text, data jsonb, expires_at timestamptz, updated_at timestamptz)
- Existing agents: Wren (strategy/executive), SalesHawk (sales prospecting), Kiro (intelligence feed), Merlin (project tracking), Osprey (agent architect)

Generate all four artifacts. Return ONLY valid JSON — no markdown fences, no explanation outside the JSON.

{
  "system_prompt": "Complete system prompt for ${name} (400-700 words). Define: who this agent is, their personality, their specific capabilities, what data they access, how they speak in staff meetings (brief, focused, with their unique voice), and what their dashboard shows Shannon.",
  "edge_function_code": "Complete Deno/TypeScript edge function for supabase/functions/${slug}/index.ts. Must: import createClient from supabase-js@2 and Anthropic from sdk@0.32.1, fetch or generate relevant data, use Claude claude-sonnet-4-6 to process/summarize it, store results in widget_data (upsert with onConflict agent_id,widget_key), use EdgeRuntime.waitUntil for fire-and-forget, return 202. Agent ID must be '${slug}'.",
  "widget_code": "Complete React/TypeScript component for src/components/agent-dashboards/${pascal}Widgets.tsx. Must: import supabase from @/integrations/supabase/client, load live data from Supabase in a useEffect hook, use Card/CardContent/CardHeader/CardTitle/CardDescription from @/components/ui/card, Badge from @/components/ui/badge. Export default function ${pascal}Widgets(). Show at least 2 widgets with real data. Include a Run Now button that invokes the edge function.",
  "sql_migration": "SQL to CREATE any new tables this agent needs (with IF NOT EXISTS), add RLS policies (authenticated read, service role full), and add updated_at triggers using update_updated_at_column(). If no new tables are needed beyond widget_data, return an empty string.",
  "notes": "3-4 sentences: what this agent does in meetings, what the Run Now button triggers, and any one-time setup steps needed."
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content.find((b) => b.type === "text")?.text ?? "";

  // Extract the outermost JSON object
  const match = rawText.match(/\{[\s\S]*\}/);
  let artifacts = {
    system_prompt: "",
    edge_function_code: "",
    widget_code: "",
    sql_migration: "",
    notes: "",
  };

  if (match) {
    try {
      artifacts = JSON.parse(match[0]);
    } catch (parseErr) {
      // Attempt repair: ask Claude to fix the JSON
      console.warn("Initial parse failed, attempting repair:", parseErr);
      const repair = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: rawText },
          {
            role: "user",
            content:
              "The JSON you returned had a syntax error. Return ONLY the corrected valid JSON object with the same five keys. No markdown, no explanation.",
          },
        ],
      });
      const repairText = repair.content.find((b) => b.type === "text")?.text ?? "";
      const repairMatch = repairText.match(/\{[\s\S]*\}/);
      if (repairMatch) {
        try {
          artifacts = JSON.parse(repairMatch[0]);
        } catch (e2) {
          console.error("Repair also failed:", e2);
          artifacts.notes = `Build failed: JSON parse error even after repair. Raw output saved.`;
          artifacts.system_prompt = rawText.slice(0, 2000);
        }
      }
    }
  } else {
    artifacts.notes = "Build failed: no JSON found in Claude response.";
    artifacts.system_prompt = rawText.slice(0, 2000);
  }

  const { error } = await supabase
    .from("agent_builds")
    .update({
      status: "ready",
      system_prompt: artifacts.system_prompt,
      edge_function_code: artifacts.edge_function_code,
      widget_code: artifacts.widget_code,
      sql_migration: artifacts.sql_migration,
      notes: artifacts.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", buildId);

  if (error) console.error("Failed to save build:", error.message);
  else console.log(`Agent "${name}" built successfully — build ID: ${buildId}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, description } = await req.json();

    if (!name?.trim() || !description?.trim()) {
      return new Response(
        JSON.stringify({ error: "name and description are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the build record immediately so the UI can poll it
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: buildRow, error: insertError } = await supabase
      .from("agent_builds")
      .insert({ name: name.trim(), description: description.trim(), status: "generating" })
      .select("id")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const buildId = buildRow.id;

    // @ts-ignore
    EdgeRuntime.waitUntil(
      generateAgent(buildId, name.trim(), description.trim()).catch((err) =>
        console.error("osprey-build-agent error:", err)
      )
    );

    return new Response(
      JSON.stringify({ ok: true, buildId, status: "generating", message: "Osprey is designing your agent. Check the build queue." }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
