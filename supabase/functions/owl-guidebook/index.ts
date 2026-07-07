// Owl — the intelligent guidebook builder. Following Dan McCreary's
// intelligent-textbook design: research the topic, enumerate its concepts,
// build a concept-dependency KNOWLEDGE GRAPH, order concepts so prerequisites
// come first, and generate learning content per concept with an explicit
// learning objective and Bloom's-taxonomy level. Learning-science best
// practices baked into the prompt (concept-based, prerequisite-ordered,
// worked examples, checks for understanding).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";
import { corsHeaders, postMessage } from "../_shared/agent-bus.ts";

interface Concept {
  key: string;
  label: string;
  definition: string;
  prerequisites: string[];
  learning_objective: string;
  bloom_level: string;
  content: string;
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate.trim()); } catch { /* fall through */ }
  const s = candidate.indexOf("{");
  const e = candidate.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(candidate.slice(s, e + 1)); } catch { /* */ } }
  return null;
}

// Order concepts so prerequisites always precede dependents (Kahn's algorithm);
// cycles/unknowns fall back to declared order.
function topoSort(concepts: Concept[]): Concept[] {
  const byKey = new Map(concepts.map((c) => [c.key, c]));
  const indeg = new Map(concepts.map((c) => [c.key, 0]));
  for (const c of concepts) {
    for (const p of c.prerequisites) {
      if (byKey.has(p)) indeg.set(c.key, (indeg.get(c.key) ?? 0) + 1);
    }
  }
  const queue = concepts.filter((c) => (indeg.get(c.key) ?? 0) === 0).map((c) => c.key);
  const ordered: Concept[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const k = queue.shift()!;
    if (seen.has(k)) continue;
    seen.add(k);
    const c = byKey.get(k);
    if (c) ordered.push(c);
    for (const other of concepts) {
      if (other.prerequisites.includes(k) && !seen.has(other.key)) {
        indeg.set(other.key, (indeg.get(other.key) ?? 1) - 1);
        if ((indeg.get(other.key) ?? 0) <= 0) queue.push(other.key);
      }
    }
  }
  // Append anything left (cycles).
  for (const c of concepts) if (!seen.has(c.key)) ordered.push(c);
  return ordered;
}

async function generate(buildId: string, topic: string, audience: string): Promise<void> {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  try {
    const system = `You are Owl, an intelligent-guidebook designer. You build guidebooks the way Dan McCreary designs intelligent textbooks: concept-based, backed by a concept-dependency knowledge graph, ordered so prerequisites come first, and grounded in learning science (clear learning objectives, Bloom's taxonomy, worked examples, and checks for understanding).

Research the topic using web search for accuracy, then design the guidebook. Return ONLY valid JSON, no prose, no markdown fences:
{
  "title": "guidebook title",
  "summary": "2-3 sentence overview of what the learner will be able to do",
  "learning_objectives": ["3-6 course-level objectives, each a measurable can-do statement"],
  "concepts": [
    {
      "key": "snake_case_id",
      "label": "Human-readable concept name",
      "definition": "one precise sentence",
      "prerequisites": ["keys of concepts that must be understood first"],
      "learning_objective": "a single measurable objective for this concept",
      "bloom_level": "Remember|Understand|Apply|Analyze|Evaluate|Create",
      "content": "120-180 words teaching this concept for the stated audience: a plain-language explanation, one concrete worked example or analogy, and end with a one-line 'Check yourself:' question. No markdown headers."
    }
  ]
}

Rules: enumerate 10-18 concepts spanning foundational to advanced. Every prerequisite MUST reference a key that exists in this concepts list (foundational concepts have an empty prerequisites array). Order roughly foundational-first. Be accurate; if unsure of a fact, keep it general rather than inventing specifics.`;

    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
      system,
      messages: [{
        role: "user",
        content: `Build an intelligent guidebook on: "${topic}". Audience: ${audience || "a motivated beginner"}. Research first, then return the JSON.`,
      }],
    } as any);

    let jsonText = "";
    for (const block of resp.content) if (block.type === "text") jsonText += block.text;
    const parsed = extractJson(jsonText);
    if (!parsed?.concepts?.length) throw new Error("Guidebook generation returned no concepts");

    const concepts: Concept[] = (parsed.concepts as any[]).map((c) => ({
      key: String(c.key),
      label: String(c.label ?? c.key),
      definition: String(c.definition ?? ""),
      prerequisites: Array.isArray(c.prerequisites) ? c.prerequisites.map(String) : [],
      learning_objective: String(c.learning_objective ?? ""),
      bloom_level: String(c.bloom_level ?? ""),
      content: String(c.content ?? ""),
    }));
    const ordered = topoSort(concepts);

    // Knowledge graph: nodes = concepts, edges = prerequisite → concept.
    const nodes = ordered.map((c) => ({ id: c.key, label: c.label }));
    const validKeys = new Set(ordered.map((c) => c.key));
    const edges: Array<{ from: string; to: string }> = [];
    for (const c of ordered) {
      for (const p of c.prerequisites) if (validKeys.has(p)) edges.push({ from: p, to: c.key });
    }

    await supabase.from("guidebooks").update({
      title: parsed.title ?? topic,
      summary: parsed.summary ?? null,
      learning_objectives: Array.isArray(parsed.learning_objectives) ? parsed.learning_objectives : [],
      knowledge_graph: { nodes, edges },
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", buildId);

    await supabase.from("guidebook_concepts").insert(
      ordered.map((c, i) => ({
        guidebook_id: buildId,
        concept_key: c.key,
        label: c.label,
        definition: c.definition,
        prerequisites: c.prerequisites,
        learning_objective: c.learning_objective,
        bloom_level: c.bloom_level,
        content: c.content,
        sort_order: i,
      })),
    );

    await postMessage(supabase, {
      from: "owl",
      kind: "report",
      subject: `Guidebook ready: "${parsed.title ?? topic}" — ${ordered.length} concepts`,
      payload: { guidebook_id: buildId, concept_count: ordered.length },
    });

    console.log(`owl-guidebook: "${topic}" ready with ${ordered.length} concepts`);
  } catch (err) {
    console.error("owl-guidebook generation error:", err);
    await supabase.from("guidebooks").update({ status: "error", error: String(err), updated_at: new Date().toISOString() }).eq("id", buildId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { topic, audience } = await req.json();
    if (!topic?.trim()) {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: book, error } = await supabase
      .from("guidebooks")
      .insert({ topic: topic.trim(), audience: audience?.trim() ?? null, status: "generating" })
      .select("id")
      .single();
    if (error) throw error;

    // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
    EdgeRuntime.waitUntil(generate(book.id, topic.trim(), audience?.trim() ?? "").catch((e) => console.error("owl-guidebook error:", e)));

    return new Response(
      JSON.stringify({ ok: true, guidebookId: book.id, status: "generating" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
