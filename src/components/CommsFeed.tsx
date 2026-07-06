import { useState } from "react";
import { ChevronDown, ChevronUp, Radio } from "lucide-react";
import { useAgentMessages } from "@/hooks/useAgentMessages";
import { DEFAULT_AGENTS } from "@/hooks/useAgentStore";

const KIND_STYLES: Record<string, string> = {
  report: "bg-primary/15 text-primary",
  request: "bg-amber-500/15 text-amber-500",
  handoff: "bg-violet-500/15 text-violet-400",
  alert: "bg-destructive/15 text-destructive",
};

// Agents that post to the bus but aren't on the staff-meeting chat roster.
const EXTRA_AGENTS: Record<string, { name: string; accentColor: string }> = {
  swift: { name: "Swift", accentColor: "150 70% 45%" },
};

function agentColor(slug: string): string {
  const agent = DEFAULT_AGENTS.find((a) => a.id === slug) ?? EXTRA_AGENTS[slug];
  return agent ? `hsl(${agent.accentColor})` : "hsl(var(--muted-foreground))";
}

function agentName(slug: string): string {
  if (slug === "all") return "everyone";
  return DEFAULT_AGENTS.find((a) => a.id === slug)?.name ?? EXTRA_AGENTS[slug]?.name ?? slug;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CommsFeed() {
  const { messages, loading } = useAgentMessages(25);
  const [open, setOpen] = useState(true);

  return (
    <section className="mt-6 rounded-lg border border-border bg-card/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-mono text-sm font-medium text-foreground">
          <Radio className="h-4 w-4 text-primary" />
          Agent Comms
          {messages.length > 0 && (
            <span className="text-xs text-muted-foreground">({messages.length})</span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 max-h-72 overflow-y-auto">
          {loading && (
            <p className="text-xs text-muted-foreground font-mono py-2">Loading…</p>
          )}
          {!loading && messages.length === 0 && (
            <p className="text-xs text-muted-foreground font-mono py-2">
              No agent messages yet — run an agent from its dashboard and its report will show up here.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2"
            >
              <span
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: agentColor(m.from_agent) }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-medium text-foreground">
                    {agentName(m.from_agent)}
                    <span className="text-muted-foreground font-normal"> → {agentName(m.to_agent)}</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide ${
                      KIND_STYLES[m.kind] ?? KIND_STYLES.report
                    }`}
                  >
                    {m.kind}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                    {relativeTime(m.created_at)}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 mt-0.5 break-words">{m.subject}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
