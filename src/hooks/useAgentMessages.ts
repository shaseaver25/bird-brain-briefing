import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgentMessageRow {
  id: string;
  from_agent: string;
  to_agent: string;
  kind: "report" | "request" | "handoff" | "alert";
  subject: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const POLL_MS = 30_000;

// Live feed of inter-agent bus messages. Uses Supabase realtime when the
// table is in the publication, with slow polling as a safety net.
export function useAgentMessages(limit = 25) {
  const [messages, setMessages] = useState<AgentMessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLatest() {
      // Table may not exist until the agent_messages migration runs — fail quiet.
      const { data, error } = await (supabase.from("agent_messages" as never) as ReturnType<typeof supabase.from>)
        .select("id, from_agent, to_agent, kind, subject, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (cancelled) return;
      if (!error && data) setMessages(data as unknown as AgentMessageRow[]);
      setLoading(false);
    }

    fetchLatest();
    const poll = setInterval(fetchLatest, POLL_MS);

    const channel = supabase
      .channel("agent-messages-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_messages" },
        (payload) => {
          const row = payload.new as AgentMessageRow;
          setMessages((prev) => [row, ...prev.filter((m) => m.id !== row.id)].slice(0, limit));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { messages, loading };
}
