/**
 * agent-api.ts — Unified API client for agent communication
 *
 * Supports three backends:
 *   - "edge"   → agent-chat edge function (default — no user setup, keys stay server-side)
 *   - "mcp"    → Claude API directly from browser (opt-in, needs an Anthropic key)
 *   - "legacy" → OpenClaw/Lambda (original apiUrl per agent)
 */

import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/untyped-db";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface AgentRow { id: string }
interface AgentProfile {
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  metadata: Record<string, unknown>;
}
interface ConversationRow { role: "user" | "assistant"; content: string }

// Mirrors GROUNDING_RULES in supabase/functions/_shared/agent-bus.ts —
// keep the two in sync so every chat path enforces the same rules.
const GROUNDING_RULES = `GROUNDING RULES (these override all style and persona instructions):
- Only state facts that come from the data you were actually given: your data context, team messages, meeting transcript, or this conversation.
- If you do not have the data to answer, say so plainly ("I don't have data on that") and name what data source would be needed. NEVER invent names, numbers, dates, links, sources, attribution stories, or events.
- Every factual claim must be traceable: when asked where something came from, cite the exact source (e.g. "today's Apollo run", "a kiro_intel article", "the team message from Merlin", "you told me this on <date>"). If you cannot point to a source, do not state it as fact.
- Keep facts and suggestions clearly separated, and label estimates as estimates.`;

// ── Types ──────────────────────────────────────────────────────

export type BackendMode = "edge" | "legacy" | "mcp";

export interface AgentRequest {
  agentId: string;
  message: string;
  sessionId?: string;
  meetingMode?: boolean;
  meetingTranscript?: string[];
}

export interface AgentResponse {
  response: string;
  agentId: string;
  sessionId?: string;
  tokens?: { input: number; output: number };
}

// ── Session management ─────────────────────────────────────────

let _currentSessionId: string | null = null;

export function getSessionId(): string {
  if (!_currentSessionId) _currentSessionId = crypto.randomUUID();
  return _currentSessionId;
}

export function resetSession(): void {
  _currentSessionId = null;
}

// ── Backend mode detection ─────────────────────────────────────

let _cachedMode: BackendMode | null = null;

export async function getBackendMode(): Promise<BackendMode> {
  if (_cachedMode) return _cachedMode;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "edge";
    const { data } = await (supabase
      .from("app_config")
      .select("use_mcp_backend")
      .eq("user_id", user.id)
      .maybeSingle() as unknown as Promise<{ data: { use_mcp_backend?: boolean } | null }>);
    // Users who explicitly enabled the direct-browser backend keep it;
    // everyone else gets the built-in edge function (works with no setup).
    _cachedMode = data?.use_mcp_backend ? "mcp" : "edge";
  } catch {
    _cachedMode = "edge";
  }
  return _cachedMode;
}

export function setBackendMode(mode: BackendMode): void { _cachedMode = mode; }
export function clearBackendModeCache(): void { _cachedMode = null; }

// ── Agent name → UUID map lookup ───────────────────────────────

const OPENCLAW_NAME_MAP: Record<string, string> = {
  "main": "Wren",
  "forge": "Osprey",
  "saleshawk": "SalesHawk",
  "merlin": "Merlin",
  "kiro": "Warbler",
  "warbler": "Warbler",
};

async function resolveAgentProfile(agentId: string): Promise<AgentProfile | null> {
  // Resolve display name from OpenClaw id or use as-is
  const displayName = OPENCLAW_NAME_MAP[agentId.toLowerCase()] || agentId;

  // Look up agent UUID by name
  const { data: agent } = await db("agents").select("id").ilike("name", displayName).single();
  if (!agent) return null;

  const { data: profile } = await db("agent_profiles")
    .select("system_prompt, model, temperature, max_tokens, metadata")
    .eq("agent_id", (agent as AgentRow).id)
    .eq("is_active", true)
    .single();

  return (profile as AgentProfile | null) ?? null;
}

async function loadHistory(agentId: string, sessionId: string, limit = 40): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const displayName = OPENCLAW_NAME_MAP[agentId.toLowerCase()] || agentId;
  const { data: agent } = await db("agents").select("id").ilike("name", displayName).single();
  if (!agent) return [];

  // Load recent messages across all sessions in the last 14 days,
  // so the agent has cross-session memory. Older rows are auto-purged by cron.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db("conversations")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("agent_id", (agent as AgentRow).id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Reverse to chronological order for the model
  return ((data as ConversationRow[] | null) ?? [])
    .map((m) => ({ role: m.role, content: m.content }))
    .reverse();
}

async function saveHistory(agentId: string, sessionId: string, userMsg: string, assistantMsg: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const displayName = OPENCLAW_NAME_MAP[agentId.toLowerCase()] || agentId;
  const { data: agent } = await db("agents").select("id").ilike("name", displayName).single();
  if (!agent) return;

  const agentUuid = (agent as AgentRow).id;
  await db("conversations").insert([
    { user_id: user.id, agent_id: agentUuid, session_id: sessionId, role: "user", content: userMsg },
    { user_id: user.id, agent_id: agentUuid, session_id: sessionId, role: "assistant", content: assistantMsg },
  ]);
}

// ── Legacy backend (OpenClaw / Lambda) ─────────────────────────

async function callLegacy(apiUrl: string, agentId: string, message: string): Promise<AgentResponse> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: agentId, message }),
  });
  const data = await res.json();
  const response = data.response || data.message || data.text || JSON.stringify(data);
  // Persist legacy conversations too, so the per-agent history view & 14-day memory work
  try {
    await saveHistory(agentId, getSessionId(), message, response);
  } catch (e) {
    console.warn("Failed to save legacy conversation:", e);
  }
  return { response, agentId };
}

// ── MCP backend (Claude API direct from browser) ───────────────

async function callMcp(request: AgentRequest, anthropicKey: string): Promise<AgentResponse> {
  const sessionId = request.sessionId || getSessionId();

  // Load agent profile from Supabase
  const profile = await resolveAgentProfile(request.agentId);
  if (!profile) throw new Error(`Agent '${request.agentId}' not found`);

  // Build system prompt
  let systemPrompt = profile.system_prompt + `\n\n${GROUNDING_RULES}`;

  // Add meeting context if needed
  if (request.meetingMode) {
    const agentName = (profile.metadata?.display_name as string) ?? request.agentId;
    const others = ["Wren", "SalesHawk", "Osprey", "Merlin", "Warbler"]
      .filter((n) => n.toLowerCase() !== agentName.toLowerCase()).join(", ");
    const transcript = request.meetingTranscript?.slice(-10).join("\n") ?? "";
    if (transcript) systemPrompt += `\n\n--- MEETING TRANSCRIPT ---\n${transcript}\n--- END TRANSCRIPT ---`;
    systemPrompt += `\n\nYou are ${agentName} in a live staff meeting. The other agents are: ${others}. Shannon is the moderator.\n\nMEETING RULES:\n- If Shannon says YOUR name and asks you to expand, give a fuller answer (3-5 sentences).\n- If Shannon addresses ANOTHER agent and NOT you, respond with ONLY "---"\n- If it's a general question to everyone, answer in 1-2 sentences FROM YOUR SPECIALTY ONLY. ${agentName} must answer the way only ${agentName} would — name a specific thing from your domain (a lead, a deadline, a system, a deployment, a lesson). Generic answers that any agent could give are forbidden.\n- Read the transcript before answering. If another agent already made your point, do NOT rephrase it — either add something genuinely new or respond with ONLY "---". Passing is better than repeating.\n- NEVER use markdown or bullet points. Speak naturally.`;
  }

  // Conversation history is each agent's individual memory — it's what makes
  // their answers diverge. In meeting mode load a smaller slice (the shared
  // transcript carries the rest) so responses stay fast but distinct.
  const history = await loadHistory(request.agentId, sessionId, request.meetingMode ? 12 : 40);
  const messages = [...history, { role: "user" as const, content: request.message }];

  // In meeting mode, use Haiku for speed and cap tokens for snappy responses
  const meetingModel = request.meetingMode ? "claude-haiku-4-5-20251001" : null;
  const meetingMaxTokens = request.meetingMode ? 512 : null;

  // Call Claude API
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: meetingModel || profile.model || "claude-sonnet-4-6",
      max_tokens: meetingMaxTokens || profile.max_tokens || 4096,
      temperature: profile.temperature || 0.7,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const response = data.content?.[0]?.text ?? "";
  const tokens = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 };

  // Save conversation in the background — don't make the reply wait on it
  void saveHistory(request.agentId, sessionId, request.message, response).catch((e) =>
    console.warn("Failed to save conversation:", e)
  );

  return { response, agentId: request.agentId, sessionId, tokens };
}

// ── Edge backend (agent-chat function, server-side keys) ──────

async function callEdge(request: AgentRequest): Promise<AgentResponse> {
  const sessionId = request.sessionId || getSessionId();
  const { data, error } = await supabase.functions.invoke("agent-chat", {
    body: { ...request, sessionId },
  });
  if (error) throw new Error(`agent-chat error: ${error.message}`);
  if (data?.error) throw new Error(`agent-chat error: ${data.error}`);
  return data as AgentResponse;
}

// ── Unified send function ──────────────────────────────────────

export async function sendAgentMessage(
  request: AgentRequest,
  legacyApiUrl?: string,
  anthropicKey?: string
): Promise<AgentResponse> {
  const mode = await getBackendMode();

  if (mode === "mcp" && anthropicKey) {
    return callMcp(request, anthropicKey);
  }

  if (mode === "legacy" && legacyApiUrl) {
    return callLegacy(legacyApiUrl, request.agentId, request.message);
  }

  // Default path: built-in edge function. Fall back to whatever the user has
  // configured if the edge function is unavailable.
  try {
    return await callEdge(request);
  } catch (edgeErr) {
    if (anthropicKey) return callMcp(request, anthropicKey);
    if (legacyApiUrl) return callLegacy(legacyApiUrl, request.agentId, request.message);
    throw edgeErr;
  }
}
