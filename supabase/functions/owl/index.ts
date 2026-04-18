import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AGENT_ID = "owl";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

  const body = await req.json().catch(() => ({}));
  const userContext: string = body.context ?? "";

  // @ts-ignore - EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(
    (async () => {
      try {
        // Existing textbook projects
        const { data: existing } = await supabase
          .from("widget_data")
          .select("data")
          .eq("agent_id", AGENT_ID)
          .eq("widget_key", "textbook_projects")
          .maybeSingle();

        const projects: Array<Record<string, unknown>> =
          (existing?.data as { projects?: Array<Record<string, unknown>> } | null)?.projects ?? [];

        // Recent context from sibling agents
        const { data: recentContext } = await supabase
          .from("widget_data")
          .select("agent_id, widget_key, data, updated_at")
          .in("agent_id", ["wren", "merlin", "kiro"])
          .order("updated_at", { ascending: false })
          .limit(10);

        const contextSummary = (recentContext ?? [])
          .map(
            (row) =>
              `Agent: ${row.agent_id} | Key: ${row.widget_key} | Data: ${JSON.stringify(
                row.data
              ).slice(0, 300)}`
          )
          .join("\n");

        const detectionPrompt = `You are Owl, an intelligent textbook agent following Dan McCreary's intelligent textbook methodology. Your job is to:
1. Scan the meeting/agent context for any teaching/education opportunities (workshops, courses, training, conference talks, onboarding, bootcamps, customer enablement).
2. Review existing textbook projects and assess each.
3. Return a structured JSON response.

User-provided context:
${userContext || "No explicit context provided."}

Recent platform context from other agents:
${contextSummary || "No recent platform context available."}

Existing textbook projects:
${JSON.stringify(projects, null, 2)}

Return ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "detected_opportunities": [
    {
      "id": "unique-slug",
      "title": "Short title",
      "source": "where it was detected",
      "event_type": "workshop|course|conference_talk|training|onboarding|other",
      "urgency": "high|medium|low",
      "missing_inputs": ["audience","scope","duration","learning_outcomes","prerequisites","delivery_context","format"],
      "summary": "One sentence description"
    }
  ],
  "project_assessments": [
    {
      "project_id": "id from projects list",
      "title": "project title",
      "build_status": "scaffolded|in_progress|ready_to_deploy|blocked",
      "concept_graph_density": "low|medium|high|overly_dense",
      "human_todos": ["remaining tasks"],
      "flag": "any conflict or warning, or null"
    }
  ],
  "meeting_summary": "2-3 sentence Owl-voice summary for the staff meeting",
  "overall_readiness": "green|yellow|red"
}`;

        const detection = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [{ role: "user", content: detectionPrompt }],
        });

        const rawText =
          detection.content[0].type === "text" ? detection.content[0].text : "{}";

        let parsed: Record<string, unknown> = {};
        try {
          const m = rawText.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0]) : {};
        } catch {
          parsed = { error: "Failed to parse Claude response", raw: rawText.slice(0, 500) };
        }

        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await supabase.from("widget_data").upsert(
          {
            agent_id: AGENT_ID,
            widget_key: "opportunity_scan",
            data: {
              detected_opportunities: parsed.detected_opportunities ?? [],
              meeting_summary: parsed.meeting_summary ?? "",
              overall_readiness: parsed.overall_readiness ?? "yellow",
              scanned_at: now,
              context_used: userContext.slice(0, 200),
            },
            expires_at: expiresAt,
            updated_at: now,
          },
          { onConflict: "agent_id,widget_key" }
        );

        await supabase.from("widget_data").upsert(
          {
            agent_id: AGENT_ID,
            widget_key: "project_assessments",
            data: {
              assessments: parsed.project_assessments ?? [],
              assessed_at: now,
            },
            expires_at: expiresAt,
            updated_at: now,
          },
          { onConflict: "agent_id,widget_key" }
        );

        // Merge newly detected opportunities into the persistent project list
        const existingIds = new Set(projects.map((p) => p.id));
        const newOpps = (
          (parsed.detected_opportunities as Array<Record<string, unknown>>) ?? []
        )
          .filter((o) => !existingIds.has(o.id))
          .map((o) => ({
            ...o,
            status: "opportunity_detected",
            created_at: now,
            audience: null,
            scope: null,
            format: null,
            duration: null,
            prerequisites: null,
            learning_outcomes: null,
            delivery_context: null,
          }));

        const mergedProjects = [...projects, ...newOpps];

        await supabase.from("widget_data").upsert(
          {
            agent_id: AGENT_ID,
            widget_key: "textbook_projects",
            data: { projects: mergedProjects, updated_at: now },
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: now,
          },
          { onConflict: "agent_id,widget_key" }
        );

        // To-do checklist derived from human_todos
        const allTodos: Array<{ project: string; task: string; done: boolean }> = [];
        for (const a of (parsed.project_assessments as Array<Record<string, unknown>>) ?? []) {
          for (const t of (a.human_todos as string[]) ?? []) {
            allTodos.push({ project: a.title as string, task: t, done: false });
          }
        }

        await supabase.from("widget_data").upsert(
          {
            agent_id: AGENT_ID,
            widget_key: "todo_checklist",
            data: { todos: allTodos, generated_at: now },
            expires_at: expiresAt,
            updated_at: now,
          },
          { onConflict: "agent_id,widget_key" }
        );

        console.log(`Owl scan complete: ${(parsed.detected_opportunities as unknown[])?.length ?? 0} opportunities, ${allTodos.length} todos`);
      } catch (err) {
        console.error("Owl edge function error:", err);
      }
    })()
  );

  return new Response(
    JSON.stringify({ status: "accepted", agent: AGENT_ID }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
