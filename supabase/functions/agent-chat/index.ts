// Server-side chat proxy so agent conversations work with zero user setup and
// no API keys in the browser. Grounds each agent in durable memory + past
// lessons, prefers Claude (falling back to the Lovable AI gateway), and
// auto-captures Shannon's corrections as new lessons.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, formatInboxForPrompt, GROUNDING_RULES, readInbox, serviceClient } from "../_shared/agent-bus.ts";

// Supabase Edge runtime global for scheduling background work after the response.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_MODEL = "google/gemini-2.5-flash";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

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

type ChatTurn = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(text: string): any {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate.trim()); } catch (_) { /* fall through */ }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { /* give up */ }
  }
  return null;
}

// ── Model calls ────────────────────────────────────────────────
// Both return a uniform shape so the caller can transparently fall back.

async function callClaude(system: string, history: ChatTurn[], userMsg: string, maxTokens: number, apiKey: string) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages: [...history, { role: "user", content: userMsg }] }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = Array.isArray(j.content)
    ? j.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim()
    : "";
  return { text, input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 };
}

async function callGateway(system: string, history: ChatTurn[], userMsg: string, maxTokens: number, lovableKey: string) {
  const r = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: userMsg }],
    }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { text: (j.choices?.[0]?.message?.content ?? "").trim(), input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 };
}

// ── Auto-learning from corrections ─────────────────────────────
// Runs in the background (never blocks the reply). Given the agent's last
// statement and the user's correcting reply, extract the corrected fact and
// store it as a "learned" memory so the agent stops repeating the mistake.
async function learnFromCorrection(
  sb: any,
  opts: { agentId: string; userId: string; priorAssistant: string; correction: string; anthropicKey?: string; lovableKey?: string },
) {
  try {
    const sys =
      'You detect factual corrections in a conversation. Given the assistant\'s previous statement and the user\'s reply, decide whether the user is correcting a factual error. Respond ONLY with JSON: {"is_correction": boolean, "lesson": "one sentence stating the CORRECT fact, phrased as a durable note the assistant should remember next time"}. If the reply is not a factual correction, respond {"is_correction": false}.';
    const usr = `Assistant previously said: "${opts.priorAssistant.slice(0, 900)}"\n\nUser replied: "${opts.correction.slice(0, 900)}"`;
    let text = "";
    try {
      const r = opts.anthropicKey
        ? await callClaude(sys, [], usr, 300, opts.anthropicKey)
        : await callGateway(sys, [], usr, 300, opts.lovableKey!);
      text = r.text;
    } catch (e) {
      console.warn("learnFromCorrection: model call failed:", (e as Error).message);
      return;
    }
    const parsed = extractJson(text);
    if (!parsed || parsed.is_correction !== true || !parsed.lesson) return;
    const { error } = await sb.from("agent_memory").insert({
      agent_id: opts.agentId,
      user_id: opts.userId,
      memory_type: "learned",
      content: String(parsed.lesson).slice(0, 500),
      source: "auto:correction",
      confidence: 0.9,
      is_active: true,
    });
    if (error) console.warn("learnFromCorrection: insert failed:", error.message);
  } catch (e) {
    console.warn("learnFromCorrection failed:", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!lovableKey && !anthropicKey) return json({ error: "No model backend configured (need ANTHROPIC_API_KEY or LOVABLE_API_KEY)" }, 500);

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
    let { data: agent } = await sb.from("agents").select("id, name").eq("slug", slug).maybeSingle();
    if (!agent) {
      ({ data: agent } = await sb.from("agents").select("id, name").ilike("name", displayName).maybeSingle());
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

    // Durable memory (facts) + lessons (past corrections) — the grounding that
    // stops agents from inventing. Team-wide facts come from shared_context;
    // per-agent facts and lessons come from agent_memory.
    const [{ data: memRows }, { data: sharedRows }] = await Promise.all([
      sb.from("agent_memory")
        .select("memory_type, content, expires_at, confidence")
        .eq("agent_id", agent.id).eq("user_id", user.id).eq("is_active", true)
        .order("confidence", { ascending: false }).limit(60),
      sb.from("shared_context")
        .select("content, expires_at")
        .eq("user_id", user.id).eq("is_active", true)
        .order("updated_at", { ascending: false }).limit(30),
    ]);
    const nowMs = Date.now();
    const fresh = (r: { expires_at?: string | null }) => !r.expires_at || new Date(r.expires_at).getTime() > nowMs;
    const memActive = (memRows ?? []).filter(fresh);
    const facts = memActive.filter((m: any) => m.memory_type !== "learned").map((m: any) => m.content);
    const lessons = memActive.filter((m: any) => m.memory_type === "learned").map((m: any) => m.content);
    const teamFacts = (sharedRows ?? []).filter(fresh).map((s: any) => s.content);
    const allFacts = [...teamFacts, ...facts];
    if (allFacts.length) {
      systemPrompt += `\n\nMEMORY — durable facts you know. Treat these as ground truth and prefer them over any assumption:\n${allFacts.map((f) => `- ${f}`).join("\n")}`;
    }
    if (lessons.length) {
      systemPrompt += `\n\nLESSONS — corrections from Shannon on things you got wrong before. Do NOT repeat these mistakes:\n${lessons.map((l) => `- ${l}`).join("\n")}`;
    }
    if (allFacts.length || lessons.length) {
      systemPrompt += `\n\nIf a question is not answered by your MEMORY, LESSONS, the data above, or this conversation, say you do not know instead of guessing.`;
    }

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
    const history: ChatTurn[] = (historyRows ?? [])
      .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .reverse();

    // Prefer Claude; fall back to the Lovable gateway (Gemini) on any failure so
    // a bad key/model can never take chat down.
    const maxTokens = meetingMode ? 512 : (profile?.max_tokens ?? 2048);
    let result: { text: string; input: number; output: number };
    try {
      if (anthropicKey) result = await callClaude(systemPrompt, history, message, maxTokens, anthropicKey);
      else result = await callGateway(systemPrompt, history, message, maxTokens, lovableKey!);
    } catch (primaryErr) {
      console.warn("agent-chat: primary model failed, falling back:", (primaryErr as Error).message);
      if (lovableKey) {
        try {
          result = await callGateway(systemPrompt, history, message, maxTokens, lovableKey);
        } catch (fallbackErr) {
          return json({ error: `AI error: ${(fallbackErr as Error).message}` }, 502);
        }
      } else {
        return json({ error: `AI error: ${(primaryErr as Error).message}` }, 502);
      }
    }
    const response = result.text;
    if (!response) return json({ error: "Empty AI response" }, 502);

    const finalSessionId = sessionId || crypto.randomUUID();
    const { error: saveErr } = await sb.from("conversations").insert([
      { user_id: user.id, agent_id: agent.id, session_id: finalSessionId, role: "user", content: message },
      { user_id: user.id, agent_id: agent.id, session_id: finalSessionId, role: "assistant", content: response },
    ]);
    if (saveErr) console.warn("agent-chat: failed to save conversation:", saveErr.message);

    // If this message looks like a correction of the agent's last reply, learn
    // from it in the background — never adds latency to the response.
    const CORRECTION_CUE = /\b(no,|nope|that'?s (wrong|incorrect|not right|not true)|actually|incorrect|not true|you'?re wrong|that is(n'?t| not) right|wrong[.,!]|correction[:,]|to be clear|it'?s actually|should be)\b/i;
    const priorAssistant = [...history].reverse().find((h) => h.role === "assistant")?.content ?? "";
    if (priorAssistant && CORRECTION_CUE.test(message)) {
      const task = learnFromCorrection(sb, {
        agentId: agent.id, userId: user.id, priorAssistant, correction: message, anthropicKey, lovableKey,
      });
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
      else void task;
    }

    return json({
      response,
      agentId,
      sessionId: finalSessionId,
      tokens: { input: result.input, output: result.output },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
