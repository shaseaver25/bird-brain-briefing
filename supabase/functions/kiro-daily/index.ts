import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Topics Kiro monitors — stored here for now, move to kiro_topics table later
const TOPICS = [
  {
    id: "ai_k12",
    label: "AI in K-12 Education",
    business: "realpath",
    query: "AI artificial intelligence K-12 schools education technology new use cases 2026",
  },
  {
    id: "ai_smb",
    label: "AI for Small Business",
    business: "tailoredu",
    query: "AI automation tools small medium business SMB workflow productivity 2026",
  },
  {
    id: "ai_training",
    label: "AI Training & Consulting",
    business: "aiwhisperers",
    query: "AI training consulting corporate learning development workforce 2026",
  },
  {
    id: "ai_agents",
    label: "AI Agent Frameworks",
    business: "all",
    query: "AI agents multi-agent systems LLM frameworks agentic workflows 2026",
  },
];

const ARTICLES_PER_TOPIC = 4;

interface Article {
  title: string;
  url: string;
  source: string;
  summary: string;
  relevance: "high" | "medium" | "low";
  topic_id: string;
  topic_label: string;
  business: string;
}

async function findArticlesForTopic(
  anthropic: Anthropic,
  topic: typeof TOPICS[0]
): Promise<Article[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
    system: `You are Kiro, an intelligence analyst. Find recent, real articles and reports published in the last 48 hours.
Prioritize: news sites, industry blogs, research reports, LinkedIn articles.
Avoid: paywalled content, forums, job boards, opinion pieces older than 2 days.
Return ONLY a valid JSON array, no other text.`,
    messages: [{
      role: "user",
      content: `Search for the ${ARTICLES_PER_TOPIC} most relevant and recent articles (last 48 hours) on this topic:

Topic: ${topic.label}
Search query: ${topic.query}
Business relevance: ${topic.business === "all" ? "all businesses" : topic.business}

For each article return:
- title: exact article headline
- url: direct link to the article
- source: publication name (e.g. "EdSurge", "TechCrunch", "McKinsey")
- summary: 2 sentences max — what it says and why it matters
- relevance: "high" | "medium" | "low" based on how actionable/important it is

Return JSON array only:
[
  {
    "title": "Article headline",
    "url": "https://...",
    "source": "Publication Name",
    "summary": "What it says and why it matters.",
    "relevance": "high"
  }
]`,
    }],
  } as any);

  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") jsonText += block.text;
  }

  const match = jsonText.match(/\[[\s\S]*\]/);
  if (!match) {
    console.warn(`No JSON found for topic ${topic.id}`);
    return [];
  }

  try {
    const raw = JSON.parse(match[0]) as Array<Omit<Article, "topic_id" | "topic_label" | "business">>;
    return raw.map((a) => ({
      ...a,
      topic_id: topic.id,
      topic_label: topic.label,
      business: topic.business,
    }));
  } catch (err) {
    console.warn(`JSON parse failed for topic ${topic.id}:`, err);
    return [];
  }
}

async function runKiroIntel(): Promise<void> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  // Fetch all topics in parallel
  const results = await Promise.allSettled(
    TOPICS.map((topic) => findArticlesForTopic(anthropic, topic))
  );

  const allArticles: Article[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      allArticles.push(...r.value);
      console.log(`✓ ${TOPICS[i].label}: ${r.value.length} articles`);
    } else {
      console.error(`✗ ${TOPICS[i].label}: ${r.reason}`);
    }
  }

  if (!allArticles.length) {
    console.warn("No articles found — nothing to save");
    return;
  }

  // Get existing URLs to skip duplicates
  const { data: existing } = await supabase
    .from("kiro_intel")
    .select("url");

  const existingUrls = new Set((existing ?? []).map((r: { url: string }) => r.url));
  const newArticles = allArticles.filter((a) => !existingUrls.has(a.url));

  console.log(`${allArticles.length} found, ${newArticles.length} new (${allArticles.length - newArticles.length} skipped as duplicates)`);

  if (!newArticles.length) return;

  // 2 weeks from now
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const rows = newArticles.map((a) => ({
    title: a.title,
    url: a.url,
    source: a.source,
    summary: a.summary,
    relevance: a.relevance,
    topic_id: a.topic_id,
    topic_label: a.topic_label,
    business: a.business,
    expires_at: expiresAt,
    found_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("kiro_intel").insert(rows);
  if (error) console.error("Insert error:", error.message);
  else console.log(`Saved ${rows.length} new articles to kiro_intel`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-ignore
  EdgeRuntime.waitUntil(
    runKiroIntel().catch((err) => console.error("kiro-daily error:", err))
  );

  return new Response(
    JSON.stringify({ ok: true, status: "started", message: "Kiro intel run started. Check kiro_intel table in ~1 min." }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
