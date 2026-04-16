/**
 * agent-api.ts — Unified API client for agent communication
 *
 * Supports two backends via feature flag:
 *   - "legacy" → OpenClaw/Lambda (original apiUrl per agent)
 *   - "mcp"    → Claude API directly from browser (no edge function needed)
 */

import { supabase } from "@/integrations/supabase/client";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ── Types ──────────────────────────────────────────────────────

export type BackendMode = "legacy" | "mcp";

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
    if (!user) return "legacy";
    const { data } = await (supabase
      .from("app_config")
      .select("use_mcp_backend")
      .eq("user_id", user.id)
      .maybeSingle() as unknown as Promise<{ data: { use_mcp_backend?: boolean } | null }>);
    _cachedMode = data?.use_mcp_backend ? "mcp" : "legacy";
  } catch {
    _cachedMode = "legacy";
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
  "kiro": "Kiro",
  "warbler": "Kiro",
};

async function resolveAgentProfile(agentId: string): Promise<{
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  metadata: Record<string, unknown>;
} | null> {
  // Resolve display name from OpenClaw id or use as-is
  const displayName = OPENCLAW_NAME_MAP[agentId.toLowerCase()] || agentId;

  // Look up agent UUID by name
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .ilike("name", displayName)
    .single();

  if (!agent) return null;

  // Load agent profile
  const { data: profile } = await (supabase
    .from("agent_profiles")
    .select("system_prompt, model, temperature, max_tokens, metadata")
    .eq("agent_id", agent.id)
    .eq("is_active", true)
    .single() as unknown as Promise<{ data: { system_prompt: string; model: string; temperature: number; max_tokens: number; metadata: Record<string, unknown> } | null }>);

  return profile ?? null;
}

async function loadHistory(agentId: string, sessionId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const displayName = OPENCLAW_NAME_MAP[agentId.toLowerCase()] || agentId;
  const { data: agent } = await supabase.from("agents").select("id").ilike("name", displayName).single();
  if (!agent) return [];

  const { data } = await supabase
    .from("conversations")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("agent_id", agent.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  return (data ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

async function saveHistory(agentId: string, sessionId: string, userMsg: string, assistantMsg: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const displayName = OPENCLAW_NAME_MAP[agentId.toLowerCase()] || agentId;
  const { data: agent } = await supabase.from("agents").select("id").ilike("name", displayName).single();
  if (!agent) return;

  await supabase.from("conversations").insert([
    { user_id: user.id, agent_id: agent.id, session_id: sessionId, role: "user", content: userMsg },
    { user_id: user.id, agent_id: agent.id, session_id: sessionId, role: "assistant", content: assistantMsg },
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
  return { response: data.response || data.message || data.text || JSON.stringify(data), agentId };
}

// ── MCP backend (Claude API direct from browser) ───────────────

async function callMcp(request: AgentRequest, anthropicKey: string): Promise<AgentResponse> {
  const sessionId = request.sessionId || getSessionId();

  // Load agent profile from Supabase
  const profile = await resolveAgentProfile(request.agentId);
  if (!profile) throw new Error(`Agent '${request.agentId}' not found`);

  // Build system prompt
  let systemPrompt = profile.system_prompt;

  // Add meeting context if needed
  if (request.meetingMode) {
    const agentName = (profile.metadata?.display_name as string) ?? request.agentId;
    const others = ["Wren", "SalesHawk", "Osprey", "Merlin", "Kiro"]
      .filter((n) => n.toLowerCase() !== agentName.toLowerCase()).join(", ");
    const transcript = request.meetingTranscript?.slice(-20).join("\n") ?? "";
    if (transcript) systemPrompt += `\n\n--- MEETING TRANSCRIPT ---\n${transcript}\n--- END TRANSCRIPT ---`;
    systemPrompt += `\n\nYou are ${agentName} in a live staff meeting. The other agents are: ${others}. Shannon is the moderator.\n\nMEETING RULES:\n- If Shannon says YOUR name and asks you to expand, give a fuller answer (3-5 sentences).\n- If Shannon addresses ANOTHER agent and NOT you, respond with ONLY "---"\n- If it's a general question to everyone, respond with ONE short sentence.\n- Do NOT repeat what others said. Build on it.\n- NEVER use markdown or bullet points. Speak naturally.`;
  }

  // Load conversation history
  const history = await loadHistory(request.agentId, sessionId);
  const messages = [...history, { role: "user" as const, content: request.message }];

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
      model: profile.model || "claude-sonnet-4-6",
      max_tokens: profile.max_tokens || 4096,
      temperature: profile.temperature || 0.7,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const response = data.content?.[0]?.text ?? "";
  const tokens = { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 };

  // Save conversation
  await saveHistory(request.agentId, sessionId, request.message, response);

  return { response, agentId: request.agentId, sessionId, tokens };
}

// ── Unified send function ──────────────────────────────────────

export async function sendAgentMessage(
  request: AgentRequest,
  legacyApiUrl?: string,
  anthropicKey?: string
): Promise<AgentResponse> {
  const mode = await getBackendMode();

  if (mode === "mcp") {
    if (!anthropicKey) throw new Error("Anthropic API key required for MCP mode. Add it in Settings.");
    return callMcp(request, anthropicKey);
  }

  if (!legacyApiUrl) throw new Error(`No API URL configured for agent ${request.agentId}`);
  return callLegacy(legacyApiUrl, request.agentId, request.message);
}
