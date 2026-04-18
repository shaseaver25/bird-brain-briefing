import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ClipboardCheck,
  Loader2,
  Rocket,
  Sparkles,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DeployAgentModal } from "./DeployAgentModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentBuild {
  id: string;
  name: string;
  description: string;
  status: "generating" | "ready" | "deployed" | "cancelled";
  requested_by: string;
  system_prompt: string | null;
  edge_function_code: string | null;
  widget_code: string | null;
  sql_migration: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<AgentBuild["status"], { label: string; cls: string }> = {
  generating: { label: "Generating…", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  ready: { label: "Ready to Deploy", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  deployed: { label: "Deployed", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

function useAgentBuilds() {
  const [builds, setBuilds] = useState<AgentBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadBuilds() {
    const { data, error } = await supabase
      .from("agent_builds")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setBuilds(data as AgentBuild[]);
    setLoading(false);
  }

  // Poll while any build is generating
  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      await loadBuilds();
      // Stop polling once nothing is generating
      const { data } = await supabase
        .from("agent_builds")
        .select("id")
        .eq("status", "generating")
        .limit(1);
      if (!data?.length) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
      }
    }, 5000);
  }

  useEffect(() => {
    loadBuilds();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function markDeployed(buildId: string) {
    const { error } = await supabase
      .from("agent_builds")
      .update({ status: "deployed", updated_at: new Date().toISOString() })
      .eq("id", buildId);
    if (!error) {
      setBuilds((prev) =>
        prev.map((b) => (b.id === buildId ? { ...b, status: "deployed" } : b))
      );
    }
  }

  return { builds, loading, loadBuilds, startPolling, markDeployed };
}

// ── Code Block ────────────────────────────────────────────────────────────────

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!code?.trim()) return null;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <span className="text-xs font-mono font-semibold text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {code.length.toLocaleString()} chars
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="relative">
          <pre className="text-[11px] font-mono p-3 overflow-x-auto max-h-64 bg-background leading-relaxed whitespace-pre-wrap">
            {code}
          </pre>
          <button
            onClick={copy}
            className="absolute top-2 right-2 p-1.5 rounded bg-muted hover:bg-muted/80 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Clipboard className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Build Card ─────────────────────────────────────────────────────────────────

function BuildCard({
  build,
  onMarkDeployed,
  onRefresh,
}: {
  build: AgentBuild;
  onMarkDeployed: (id: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const style = STATUS_STYLES[build.status];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0">
          <Bot className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{build.name}</p>
              <Badge variant="outline" className={`text-[10px] ${style.cls}`}>
                {build.status === "generating" && (
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                )}
                {style.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{build.description}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {new Date(build.created_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/Chicago",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(build.status === "ready" || build.status === "deployed") && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 text-purple-600 border-purple-500/30 hover:bg-purple-500/10"
              onClick={() => setDeployOpen(true)}
            >
              <Rocket className="h-3.5 w-3.5" />
              {build.status === "deployed" ? "Re-deploy" : "Deploy →"}
            </Button>
          )}
          {(build.status === "ready" || build.status === "deployed") && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs gap-1"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Artifacts
            </Button>
          )}
        </div>
      </div>

      {/* Generating spinner */}
      {build.status === "generating" && (
        <div className="px-4 pb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Osprey is designing this agent with Claude… usually takes 30–60 seconds.
        </div>
      )}

      {/* Notes */}
      {build.notes && build.status !== "generating" && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground italic leading-relaxed">{build.notes}</p>
        </div>
      )}

      {/* Artifacts (expanded) */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Generated Artifacts
          </p>
          <CodeBlock label="system_prompt.md" code={build.system_prompt ?? ""} />
          <CodeBlock label="edge_function/index.ts" code={build.edge_function_code ?? ""} />
          <CodeBlock label="*Widgets.tsx" code={build.widget_code ?? ""} />
          {build.sql_migration?.trim() && (
            <CodeBlock label="migration.sql" code={build.sql_migration} />
          )}
        </div>
      )}
      <DeployAgentModal
        build={build}
        open={deployOpen}
        onOpenChange={setDeployOpen}
        onDeployed={onRefresh}
      />
    </div>
  );
}

// ── Commission Form ───────────────────────────────────────────────────────────

function CommissionAgentWidget({
  onBuildStarted,
}: {
  onBuildStarted: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/osprey-build-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setName("");
      setDescription("");
      onBuildStarted();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-purple-500/30 bg-purple-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Commission a New Agent
        </CardTitle>
        <CardDescription>
          Describe what you need — Osprey will design the system prompt, edge function, widgets, and SQL.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Agent Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Newsletter Curator, Client Onboarding Agent…"
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              What should this agent do?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the agent's purpose, what data it needs, and how it should report in staff meetings…"
              rows={4}
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting || !name.trim() || !description.trim()}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Wrench className="h-4 w-4" />
                Build Agent
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────────

export default function OspreyWidgets() {
  const { builds, loading, loadBuilds, startPolling, markDeployed } = useAgentBuilds();

  function handleBuildStarted() {
    loadBuilds();
    startPolling();
  }

  const deployed = builds.filter((b) => b.status === "deployed").length;
  const ready = builds.filter((b) => b.status === "ready").length;
  const generating = builds.filter((b) => b.status === "generating").length;

  return (
    <div className="space-y-6">
      {/* Commission form */}
      <CommissionAgentWidget onBuildStarted={handleBuildStarted} />

      {/* Build queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5 text-purple-500" />
                Agent Build Queue
              </CardTitle>
              <CardDescription className="flex items-center gap-3 mt-1">
                {generating > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {generating} generating
                  </span>
                )}
                {ready > 0 && (
                  <span className="text-emerald-600">{ready} ready to deploy</span>
                )}
                {deployed > 0 && (
                  <span className="text-blue-600">{deployed} deployed</span>
                )}
                {builds.length === 0 && !loading && (
                  <span>No agents commissioned yet</span>
                )}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadBuilds}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading builds…</span>
            </div>
          ) : builds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Commission your first agent above — Osprey will build everything you need.
            </p>
          ) : (
            builds.map((build) => (
              <BuildCard
                key={build.id}
                build={build}
                onMarkDeployed={markDeployed}
                onRefresh={loadBuilds}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
