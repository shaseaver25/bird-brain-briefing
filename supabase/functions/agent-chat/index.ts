// Server-side chat proxy so agent conversations work with zero user setup and
// no API keys in the browser. Mirrors the direct-browser "mcp" path in
// src/lib/agent-api.ts but calls the Lovable AI gateway with the project's key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, formatInboxForPrompt, GROUNDING_RULES, readInbox, serviceClient } from "../_shared/agent-bus.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

// Slug/legacy-id → display name, mirroring OPENCLAW_NAME_MAP in agent-api.ts.
const NAME_MAP: Record<string, string> = {
  main: "Wren",
  forge: "Osprey",
  wren: "Wren",
  osprey: "Osprey",
  saleshawk: "SalesHawk",
  merlin: "Merlin",
  kiro: "Warbler",
  warbler: "Warbler",
  owl: "Owl",
  mockingjay: "MockingJay",
};

const MEETING_ROSTER = ["Wren", "SalesHawk", "Osprey", "Merlin", "Warbler", "Eagle", "MockingJay"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    // Identify the caller from their JWT.
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);
    const { data: isAdmin } = await authClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const { agentId, message, sessionId, meetingMode, meetingTranscript } = await req.json();
    if (!agentId || !message) return json({ error: "agentId and message required" }, 400);

    const sb = serviceClient();
    const slug = String(agentId).toLowerCase();
    const displayName = NAME_MAP[slug] ?? agentId;

    // Resolve the agent row: prefer the slug column, fall back to name match.
    let { data: agent } = await sb
      .from("agents")
      .select("id, name")
      .eq("slug", slug)
      .maybeSingle();
    if (!agent) {
      ({ data: agent } = await sb
        .from("agents")
        .select("id, name")
        .ilike("name", displayName)
        .maybeSingle());
    }
    if (!agent) return json({ error: `Agent '${agentId}' not found` }, 404);

    const { data: profile } = await sb
      .from("agent_profiles")
      .select("system_prompt, model, max_tokens")
      .eq("agent_id", agent.id)
      .eq("is_active", true)
      .maybeSingle();

    let systemPrompt = profile?.system_prompt ??
      `You are ${agent.name}, an AI staff agent on Shannon's team. Be helpful, concise, and speak in first person.`;
    systemPrompt += `\n\n${GROUNDING_RULES}`;

    // Let any agent reference the latest work of its peers.
    const inbox = await readInbox(sb, slug, { markRead: false, limit: 10 });
    const inboxText = formatInboxForPrompt(inbox);
    if (inboxText) systemPrompt += `\n\n${inboxText}`;

    // SalesHawk gets the source-tagged inbound pipeline so attribution
    // questions are answered from records, never invented.
    if (slug === "saleshawk") {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: inboundLeads } = await sb
        .from("inbound_leads")
        .select("name, company, email, source, source_detail, business, status, created_at")
        .gte("created_at", twoWeeksAgo)
        .order("created_at", { ascending: false })
        .limit(20);
      if (inboundLeads && inboundLeads.length > 0) {
        const lines = inboundLeads.map((l: Record<string, unknown>) =>
          `- ${l.name}${l.company ? ` (${l.company})` : ""} — source: ${l.source}${l.source_detail ? ` [${l.source_detail}]` : ""}, status: ${l.status}, ${String(l.created_at).slice(0, 10)}`
        );
        systemPrompt += `\n\nINBOUND LEADS (last 14 days, source-tagged from the intake system — this is your ONLY attribution data):\n${lines.join("\n")}`;
      } else {
        systemPrompt += `\n\nINBOUND LEADS: none recorded in the last 14 days. If asked about inbound leads or attribution, say the intake system has no records — do not invent any.`;
      }
    }

    if (meetingMode) {
      const others = MEETING_ROSTER.filter((n) => n.toLowerCase() !== agent.name.toLowerCase()).join(", ");
      const transcript = Array.isArray(meetingTranscript) ? meetingTranscript.slice(-10).join("\n") : "";
      if (transcript) systemPrompt += `\n\n--- MEETING TRANSCRIPT ---\n${transcript}\n--- END TRANSCRIPT ---`;
      systemPrompt += `\n\nYou are ${agent.name} in a live staff meeting. The other agents are: ${others}. Shannon is the moderator.\n\nMEETING RULES:\n- If Shannon says YOUR name and asks you to expand, give a fuller answer (3-5 sentences).\n- If Shannon addresses ANOTHER agent and NOT you, respond with ONLY "---"\n- If it's a general question to everyone, answer in 1-2 sentences FROM YOUR SPECIALTY ONLY. ${agent.name} must answer the way only ${agent.name} would — name a specific thing from your domain (a lead, a deadline, a system, a deployment, a lesson). Generic answers that any agent could give are forbidden.\n- Read the transcript before answering. If another agent already made your point, do NOT rephrase it — either add something genuinely new or respond with ONLY "---". Passing is better than repeating.\n- NEVER use markdown or bullet points. Speak naturally.`;
    }

    // Last 14 days of cross-session history — each agent's individual memory.
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: historyRows } = await sb
      .from("conversations")
      .select("role, content")
      .eq("user_id", user.id)
      .eq("agent_id", agent.id)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(meetingMode ? 12 : 40);
    const history = (historyRows ?? [])
      .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .reverse();

    const aiResp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: meetingMode ? 512 : (profile?.max_tokens ?? 2048),
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return json({ error: `AI error: ${aiResp.status} ${txt}` }, 502);
    }
    const aiJson = await aiResp.json();
    const response: string = aiJson.choices?.[0]?.message?.content?.trim() ?? "";
    if (!response) return json({ error: "Empty AI response" }, 502);

    const finalSessionId = sessionId || crypto.randomUUID();
    const { error: saveErr } = await sb.from("conversations").insert([
      { user_id: user.id, agent_id: agent.id, session_id: finalSessionId, role: "user", content: message },
      { user_id: user.id, agent_id: agent.id, session_id: finalSessionId, role: "assistant", content: response },
    ]);
    if (saveErr) console.warn("agent-chat: failed to save conversation:", saveErr.message);

    return json({
      response,
      agentId,
      sessionId: finalSessionId,
      tokens: {
        input: aiJson.usage?.prompt_tokens ?? 0,
        output: aiJson.usage?.completion_tokens ?? 0,
      },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
