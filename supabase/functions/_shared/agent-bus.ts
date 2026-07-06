// Shared inter-agent message bus helpers.
//
// Every agent edge function posts a compact summary message at the end of a
// successful run (postMessage) and reads unconsumed peer messages at the start
// (readInbox). Messages live in the `agent_messages` table, identified by the
// same text slugs used in `widget_data` ("wren", "saleshawk", "kiro", ...).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export { corsHeaders } from "./cors.ts";

// Appended to every agent's system prompt so agents never fabricate facts.
// These rules take priority over persona/style instructions.
export const GROUNDING_RULES = `GROUNDING RULES (these override all style and persona instructions):
- Only state facts that come from the data you were actually given: your data context, team messages, meeting transcript, or this conversation.
- If you do not have the data to answer, say so plainly ("I don't have data on that") and name what data source would be needed. NEVER invent names, numbers, dates, links, sources, attribution stories, or events.
- Every factual claim must be traceable: when asked where something came from, cite the exact source (e.g. "today's Apollo run", "a kiro_intel article", "the team message from Merlin", "you told me this on <date>"). If you cannot point to a source, do not state it as fact.
- Keep facts and suggestions clearly separated, and label estimates as estimates.`;

export type MessageKind = "report" | "request" | "handoff" | "alert";

export interface AgentMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  kind: MessageKind;
  subject: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Bus failures must never kill an agent run — log and continue.
export async function postMessage(
  sb: SupabaseClient,
  msg: {
    from: string;
    to?: string;
    kind?: MessageKind;
    subject: string;
    payload?: Record<string, unknown>;
    ttlHours?: number;
  },
): Promise<void> {
  try {
    const { error } = await sb.from("agent_messages").insert({
      from_agent: msg.from,
      to_agent: msg.to ?? "all",
      kind: msg.kind ?? "report",
      subject: msg.subject.slice(0, 300),
      payload: msg.payload ?? {},
      expires_at: new Date(
        Date.now() + (msg.ttlHours ?? 168) * 60 * 60 * 1000,
      ).toISOString(),
    });
    if (error) console.error(`agent-bus: post from ${msg.from} failed:`, error.message);
  } catch (e) {
    console.error(`agent-bus: post from ${msg.from} failed:`, e);
  }
}

export async function readInbox(
  sb: SupabaseClient,
  agent: string,
  opts?: { limit?: number; markRead?: boolean },
): Promise<AgentMessage[]> {
  try {
    const { data, error } = await sb
      .from("agent_messages")
      .select("id, from_agent, to_agent, kind, subject, payload, created_at, read_by")
      .in("to_agent", [agent, "all"])
      .neq("from_agent", agent)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) {
      console.error(`agent-bus: inbox read for ${agent} failed:`, error.message);
      return [];
    }
    type Row = AgentMessage & { read_by: string[] };
    const unread = ((data ?? []) as Row[])
      .filter((m) => !(m.read_by ?? []).includes(agent))
      .slice(-(opts?.limit ?? 15));

    if (opts?.markRead !== false && unread.length > 0) {
      for (const m of unread) {
        await sb
          .from("agent_messages")
          .update({ read_by: [...(m.read_by ?? []), agent] })
          .eq("id", m.id);
      }
    }
    return unread.map(({ read_by: _readBy, ...m }) => m);
  } catch (e) {
    console.error(`agent-bus: inbox read for ${agent} failed:`, e);
    return [];
  }
}

export function formatInboxForPrompt(messages: AgentMessage[]): string {
  if (!messages.length) return "";
  const lines = messages.map((m) => {
    const target = m.to_agent === "all" ? "all" : m.to_agent;
    return `- [${m.from_agent} → ${target}, ${m.kind}] ${m.subject}`;
  });
  return `TEAM MESSAGES (latest reports from the other agents):\n${lines.join("\n")}`;
}

// A handoff is a directed request from one agent to another to act on
// something — the thing that turns "reporting to each other" into
// "working together". Convenience wrapper over postMessage.
export async function handoff(
  sb: SupabaseClient,
  from: string,
  to: string,
  subject: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await postMessage(sb, { from, to, kind: "handoff", subject, payload });
}

// Read only the unconsumed handoffs addressed to an agent, marking just
// those handoffs as read (not the agent's other inbox messages).
export async function readHandoffs(
  sb: SupabaseClient,
  agent: string,
  opts?: { limit?: number; markRead?: boolean },
): Promise<AgentMessage[]> {
  const all = await readInbox(sb, agent, { limit: 50, markRead: false });
  const handoffs = all.filter((m) => m.kind === "handoff").slice(-(opts?.limit ?? 10));
  if (opts?.markRead !== false && handoffs.length > 0) {
    for (const m of handoffs) {
      const { data } = await sb.from("agent_messages").select("read_by").eq("id", m.id).maybeSingle();
      const readBy: string[] = (data as { read_by?: string[] } | null)?.read_by ?? [];
      await sb.from("agent_messages").update({ read_by: [...readBy, agent] }).eq("id", m.id);
    }
  }
  return handoffs;
}
