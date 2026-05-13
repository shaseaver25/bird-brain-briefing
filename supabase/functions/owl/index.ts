import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AGENT_ID = "owl";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

  const body = await req.json().catch(() => ({}));
  const topicsOverride: string[] | undefined = body.topics;

  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil((async () => {
    try {
      // Load topics
      let topics: string[] = topicsOverride ?? [];
      if (topics.length === 0) {
        const { data } = await supabase.from("owl_topics").select("topic").eq("active", true);
        topics = (data ?? []).map((r: { topic: string }) => r.topic);
      }
      if (topics.length === 0) {
        await supabase.from("widget_data").upsert({
          agent_id: AGENT_ID,
          widget_key: "legislation_summary",
          data: { summary: "No topics configured. Add topics below to start tracking legislation.", scanned_at: new Date().toISOString(), topics: [] },
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "agent_id,widget_key" });
        return;
      }

      const allItems: Array<Record<string, unknown>> = [];

      for (const topic of topics) {
        const prompt = `You are a legislative tracker. Find recent or active US legislation (2024-2026) related to: "${topic}". Include both FEDERAL (Congress) bills and STATE bills from multiple states. For each bill provide: jurisdiction (e.g. "U.S. Congress" or "California"), level ("federal" or "state"), bill_id (e.g. "HR 1234" or "CA AB 123"), title, one-sentence summary, current status (introduced/committee/passed/signed/etc), last_action with date, and a url to the bill text or tracker if known.

Return ONLY valid JSON with this shape (no prose, no markdown fences):
{
  "items": [
    {
      "level": "federal" | "state",
      "jurisdiction": "string",
      "bill_id": "string",
      "title": "string",
      "summary": "string",
      "status": "string",
      "last_action": "string",
      "last_action_date": "YYYY-MM-DD or null",
      "url": "string or null",
      "source": "string"
    }
  ]
}

Aim for 8-15 items spanning federal + several states. Be accurate; if uncertain about a specific bill, omit it.`;

        const res = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });

        if (!res.ok) {
          console.error(`AI error for topic "${topic}": ${res.status} ${await res.text()}`);
          continue;
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "{}";
        let parsed: { items?: Array<Record<string, unknown>> } = {};
        try {
          const m = text.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0]) : {};
        } catch (e) {
          console.error(`Parse error for "${topic}":`, e);
        }
        for (const item of parsed.items ?? []) {
          allItems.push({ ...item, topic });
        }
      }

      // Replace items in DB
      await supabase.from("legislation_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (allItems.length > 0) {
        const rows = allItems.map((it) => ({
          topic: it.topic,
          level: (it.level as string) ?? "unknown",
          jurisdiction: (it.jurisdiction as string) ?? "Unknown",
          bill_id: (it.bill_id as string) ?? null,
          title: (it.title as string) ?? "Untitled",
          summary: (it.summary as string) ?? null,
          status: (it.status as string) ?? null,
          last_action: (it.last_action as string) ?? null,
          last_action_date: (it.last_action_date as string) || null,
          url: (it.url as string) ?? null,
          source: (it.source as string) ?? null,
        }));
        await supabase.from("legislation_items").insert(rows);
      }

      // Generate overall summary
      const summaryPrompt = `You are Owl, a legislative analyst. Topics tracked: ${topics.join(", ")}. Below is a JSON list of bills currently being tracked. Write a concise 3-5 sentence executive summary highlighting key trends, urgent items, and notable conflicts between state vs federal approaches. Plain prose, no markdown.

${JSON.stringify(allItems.slice(0, 50), null, 2)}`;

      let overallSummary = `Tracking ${allItems.length} bills across ${topics.length} topic(s).`;
      try {
        const sRes = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: summaryPrompt }],
          }),
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          overallSummary = sData.choices?.[0]?.message?.content?.trim() ?? overallSummary;
        }
      } catch (e) {
        console.error("Summary error:", e);
      }

      await supabase.from("widget_data").upsert({
        agent_id: AGENT_ID,
        widget_key: "legislation_summary",
        data: {
          summary: overallSummary,
          topics,
          item_count: allItems.length,
          scanned_at: new Date().toISOString(),
        },
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id,widget_key" });

      console.log(`Owl scan complete: ${allItems.length} bills across ${topics.length} topics`);
    } catch (err) {
      console.error("Owl error:", err);
    }
  })());

  return new Response(JSON.stringify({ status: "accepted", agent: AGENT_ID }), {
    status: 202,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
