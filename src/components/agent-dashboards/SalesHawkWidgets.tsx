import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Users, Clock, AlertCircle, Target, Zap, RefreshCw, Linkedin, Mail, Copy, Check, Send, ChevronDown, ChevronUp, Network, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// --- Types ---

interface DailyFind {
  business: string;
  name: string;
  title: string;
  company: string;
  score: number;
  linkedin_url: string | null;
  email: string | null;
  notes: string;
  status: "inserted" | "error";
  error?: string;
}

interface TodaysFindsData {
  date: string;
  run_time?: string;
  total: number;
  finds: DailyFind[];
}

// --- Static Mock Data ---

const PIPELINE_STAGES = [
  { stage: "Prospect", count: 12, value: 18000, color: "#94a3b8" },
  { stage: "Discovery", count: 8, value: 24000, color: "#60a5fa" },
  { stage: "Proposal", count: 5, value: 35000, color: "#a78bfa" },
  { stage: "Negotiation", count: 3, value: 27000, color: "#f59e0b" },
  { stage: "Closing", count: 2, value: 15000, color: "#10b981" },
];

const DEAL_KPIS = { totalPipeline: 119000, weightedValue: 47200, avgDealSize: 8500, closingThisMonth: 15000 };

const FOLLOW_UPS = [
  { contact: "Sarah Chen", company: "Metro Transit", type: "Proposal follow-up", dueDate: "Apr 13", isOverdue: true, daysOverdue: 3 },
  { contact: "James Wright", company: "Hennepin County", type: "Discovery call", dueDate: "Apr 11", isOverdue: true, daysOverdue: 5 },
  { contact: "Maria Lopez", company: "UMN Extension", type: "Send case study", dueDate: "Apr 17", isOverdue: false, daysOverdue: 0 },
  { contact: "Tom Anderson", company: "Cancer Society", type: "Check-in call", dueDate: "Apr 18", isOverdue: false, daysOverdue: 0 },
  { contact: "Rachel Kim", company: "St. Paul Schools", type: "Proposal draft", dueDate: "Apr 19", isOverdue: false, daysOverdue: 0 },
];

const BUSINESS_COLORS: Record<string, string> = {
  realpath: "text-blue-500",
  tailoredu: "text-emerald-500",
  aiwhisperers: "text-purple-500",
};

const BUSINESS_LABELS: Record<string, string> = {
  realpath: "RealPath",
  tailoredu: "TailoredU",
  aiwhisperers: "AI Whisperers",
};

// --- Live Today's Finds Hook ---

function useTodaysFinds() {
  const [data, setData] = useState<TodaysFindsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadCached(): Promise<Date | null> {
    const { data: row } = await supabase
      .from("widget_data")
      .select("data, updated_at")
      .eq("agent_id", "saleshawk")
      .eq("widget_key", "todays_finds")
      .maybeSingle();

    if (row?.data) {
      setData(row.data as unknown as TodaysFindsData);
      const ts = row.updated_at ? new Date(row.updated_at) : null;
      if (ts) setLastUpdated(ts);
      return ts;
    }
    return null;
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function runNow() {
    setRunning(true);
    stopPolling();

    // Snapshot the current updated_at so we know when new data arrives
    const prevUpdatedAt = lastUpdated?.toISOString() ?? null;

    try {
      const { error } = await supabase.functions.invoke("saleshawk-daily");
      if (error) throw error;

      // Fire-and-forget returns 202 immediately — poll every 15s until
      // widget_data has a newer timestamp (job typically takes 2-3 min)
      let attempts = 0;
      const MAX_ATTEMPTS = 20; // 5 minutes max
      pollRef.current = setInterval(async () => {
        attempts++;
        const newTs = await loadCached();
        const hasNewData = newTs && newTs.toISOString() !== prevUpdatedAt;
        if (hasNewData || attempts >= MAX_ATTEMPTS) {
          stopPolling();
          setRunning(false);
        }
      }, 15000);
    } catch (err) {
      console.error("saleshawk-daily failed:", err);
      setRunning(false);
    }
  }

  useEffect(() => {
    loadCached().finally(() => setLoading(false));
    return () => stopPolling();
  }, []);

  return { data, loading, running, lastUpdated, runNow };
}

// --- Lead Card with Draft Email ---

function LeadCard({ lead, business }: { lead: DailyFind; business: string }) {
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDraft() {
    setDrafting(true);
    setDraftError(null);
    setExpanded(true);
    try {
      const { data, error } = await supabase.functions.invoke("saleshawk-draft", {
        body: { lead, business },
      });
      if (error) throw error;
      if (!data?.draft) throw new Error("No draft returned");
      setDraft(data.draft);
    } catch (err) {
      setDraftError(String(err));
    } finally {
      setDrafting(false);
    }
  }

  function handleCopy() {
    if (!draft) return;
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const gmailUrl = draft
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email ?? "")}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : "#";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Lead info row */}
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{lead.name}</p>
            {lead.email && <Badge variant="outline" className="text-[10px] text-emerald-600">email found</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{lead.title}{lead.title && lead.company ? " · " : ""}{lead.company}</p>
          {lead.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lead.notes}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lead.linkedin_url && (
            <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-blue-500 transition-colors">
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          <div className="text-right mr-1">
            <p className="text-sm font-bold font-mono text-emerald-600">{lead.score}</p>
            <p className="text-[10px] text-muted-foreground">score</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={draft ? () => setExpanded(!expanded) : handleDraft}
            disabled={drafting}
          >
            {drafting ? (
              <><RefreshCw className="h-3 w-3 animate-spin" /> Drafting…</>
            ) : draft ? (
              expanded ? <><ChevronUp className="h-3 w-3" /> Hide</> : <><ChevronDown className="h-3 w-3" /> Draft</>
            ) : (
              <><Mail className="h-3 w-3" /> Draft</>
            )}
          </Button>
        </div>
      </div>

      {/* Draft panel */}
      {expanded && (
        <div className="border-t border-border bg-muted/30 p-3 space-y-2">
          {draftError ? (
            <p className="text-xs text-destructive">{draftError}</p>
          ) : draft ? (
            <>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Subject</p>
                <p className="text-sm font-medium">{draft.subject}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Body</p>
                <p className="text-sm whitespace-pre-line leading-relaxed">{draft.body}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopy}>
                  {copied ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </Button>
                <a
                  href={gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-7 px-3 text-xs rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Send className="h-3 w-3" /> Open in Gmail
                </a>
                <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto text-muted-foreground"
                  onClick={handleDraft}>
                  <RefreshCw className="h-3 w-3" /> Regenerate
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Writing personalized email…</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Today's Finds Widget ---

function TodaysFindsWidget() {
  const { data, loading, running, lastUpdated, runNow } = useTodaysFinds();

  const finds = data?.finds?.filter((f) => f.status === "inserted") ?? [];
  const errors = data?.finds?.filter((f) => f.status === "error") ?? [];
  const byBusiness = {
    realpath: finds.filter((f) => f.business === "realpath"),
    tailoredu: finds.filter((f) => f.business === "tailoredu"),
    aiwhisperers: finds.filter((f) => f.business === "aiwhisperers"),
  };
  const lastRunTime = data?.run_time
    ? new Date(data.run_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
    : lastUpdated?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) ?? null;

  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Today's Finds
          </CardTitle>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={runNow}
              disabled={running}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
              title="Run prospecting now"
            >
              <RefreshCw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} />
              {running ? "Running…" : "Run Now"}
            </button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {loading ? "Loading…" : running ? "SalesHawk is prospecting…" : data ? (
            <span>
              {finds.length} leads added{data.date ? ` — ${data.date}` : ""}
              {lastRunTime ? <span className="ml-2 text-emerald-600 font-mono">Last run: {lastRunTime} CT</span> : null}
              {errors.length > 0 ? <span className="ml-2 text-destructive">{errors.length} failed</span> : null}
            </span>
          ) : "No run yet today — click Run Now"}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded bg-muted animate-pulse" />)}
          </div>
        ) : running ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Finding leads across all three businesses…</p>
            <p className="text-xs text-muted-foreground mt-1">This takes ~60 seconds</p>
          </div>
        ) : finds.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No leads found yet today.</p>
            <p className="text-xs text-muted-foreground mt-1">Runs automatically at 7 AM, or click Run Now.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(["realpath", "tailoredu", "aiwhisperers"] as const).map((biz) => {
              const leads = byBusiness[biz];
              if (!leads.length) return null;
              return (
                <div key={biz}>
                  <p className={`text-xs font-mono font-semibold uppercase tracking-wider mb-2 ${BUSINESS_COLORS[biz]}`}>
                    {BUSINESS_LABELS[biz]} — {leads.length} lead{leads.length !== 1 ? "s" : ""}
                  </p>
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <LeadCard key={`${lead.name}-${lead.company}`} lead={lead} business={biz} />
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Errors section */}
            {errors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-destructive/20">
                <p className="text-xs font-mono font-semibold uppercase tracking-wider mb-2 text-destructive">
                  Failed — {errors.length} issue{errors.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-1">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-destructive/80 bg-destructive/5 rounded px-2 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span><span className="font-medium">{BUSINESS_LABELS[e.business] ?? e.business}:</span> {e.error ?? "Insert failed"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Static Widgets ---

function DealValuesWidget() {
  const kpis = [
    { label: "Total Pipeline", value: DEAL_KPIS.totalPipeline, icon: DollarSign },
    { label: "Weighted Value", value: DEAL_KPIS.weightedValue, icon: TrendingUp },
    { label: "Avg Deal Size", value: DEAL_KPIS.avgDealSize, icon: Target },
    { label: "Closing This Month", value: DEAL_KPIS.closingThisMonth, icon: Clock },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-2xl font-bold">${kpi.value.toLocaleString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PipelineFunnelWidget() {
  const maxValue = Math.max(...PIPELINE_STAGES.map((s) => s.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-500" />
          Pipeline Funnel
        </CardTitle>
        <CardDescription>{PIPELINE_STAGES.reduce((s, p) => s + p.count, 0)} total opportunities</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.stage} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stage.stage}</span>
              <span className="text-muted-foreground">{stage.count} deals · ${stage.value.toLocaleString()}</span>
            </div>
            <div className="h-6 rounded-md bg-muted overflow-hidden">
              <div className="h-full rounded-md transition-all" style={{ width: `${(stage.value / maxValue) * 100}%`, backgroundColor: stage.color }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FollowUpQueueWidget() {
  const overdue = FOLLOW_UPS.filter((f) => f.isOverdue);
  const upcoming = FOLLOW_UPS.filter((f) => !f.isOverdue);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-emerald-500" />
          Follow-Up Queue
        </CardTitle>
        <CardDescription>
          {overdue.length > 0 && <span className="text-destructive font-medium">{overdue.length} overdue</span>}
          {overdue.length > 0 && upcoming.length > 0 && " · "}
          {upcoming.length} upcoming
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {FOLLOW_UPS.map((item) => (
          <div key={`${item.contact}-${item.type}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            {item.isOverdue && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.contact}</p>
              <p className="text-xs text-muted-foreground">{item.company} · {item.type}</p>
            </div>
            <div className="text-right shrink-0">
              {item.isOverdue ? (
                <Badge variant="destructive" className="text-[10px]">{item.daysOverdue}d overdue</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{item.dueDate}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function SalesHawkWidgets() {
  return (
    <div className="space-y-6">
      <TodaysFindsWidget />
      <NetworkingWidget />
      {/* Deal Values, Pipeline Funnel, and Follow-Up Queue are hidden until
          they're wired to real CRM data. See DealValuesWidget, PipelineFunnelWidget,
          FollowUpQueueWidget above — kept in the file for future re-enablement. */}
    </div>
  );
}

// --- Networking Widget (meeting-driven CRM sync) ---

interface QueueRow {
  id: string;
  granola_meeting_id: string | null;
  meeting_title: string | null;
  meeting_date: string | null;
  attendee_name: string;
  attendee_email: string | null;
  attendee_company: string | null;
  attendee_title: string | null;
  meeting_notes: string | null;
  ai_suggested_business: string | null;
  ai_reasoning: string | null;
  status: string;
  confirmed_business: string | null;
  crm_action: string | null;
  crm_error: string | null;
  created_at: string;
}

function NetworkingWidget() {
  const [items, setItems] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await (supabase
      .from("saleshawk_networking_queue" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50) as any);
    setItems((data ?? []) as QueueRow[]);
    setLoading(false);
  }

  async function runScan() {
    setScanning(true);
    setScanMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("saleshawk-networking-scan");
      if (error) throw error;
      setScanMsg(`Scanned ${data?.scanned ?? 0} meetings, queued ${data?.queued ?? 0} contacts.`);
      await load();
    } catch (e) {
      setScanMsg(`Scan failed: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  }

  async function commit(queueId: string, business: string | null, action: "confirm" | "skip") {
    const { error } = await supabase.functions.invoke("saleshawk-networking-commit", {
      body: { queueId, business, action: action === "skip" ? "skip" : "confirm" },
    });
    if (error) console.error(error);
    await load();
  }

  useEffect(() => { load(); }, []);

  const pending = items.filter((i) => i.status === "pending");
  const recent = items.filter((i) => i.status !== "pending").slice(0, 10);

  return (
    <Card className="border-blue-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5 text-blue-500" />
            Networking — Meeting → CRM
          </CardTitle>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning…" : "Scan Meetings"}
          </button>
        </div>
        <CardDescription>
          {scanMsg ?? `${pending.length} contact${pending.length === 1 ? "" : "s"} awaiting CRM placement.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="h-16 rounded bg-muted animate-pulse" />
        ) : pending.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No pending contacts. Click <span className="font-mono">Scan Meetings</span> to pull from Granola.
          </p>
        ) : (
          pending.map((q) => (
            <div key={q.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{q.attendee_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[q.attendee_title, q.attendee_company].filter(Boolean).join(" · ")}
                    {q.attendee_email && <> · <span className="font-mono">{q.attendee_email}</span></>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    From: <span className="italic">{q.meeting_title}</span>
                    {q.meeting_date && <> · {new Date(q.meeting_date).toLocaleDateString()}</>}
                  </p>
                </div>
                <button
                  onClick={() => commit(q.id, null, "skip")}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title="Skip"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {q.ai_reasoning && (
                <p className="text-[11px] text-muted-foreground italic">AI: {q.ai_reasoning}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[10px] text-muted-foreground font-mono uppercase">Add to:</span>
                {(["realpath", "tailoredu", "aiwhisperers"] as const).map((biz) => {
                  const isSuggested = q.ai_suggested_business === biz;
                  return (
                    <Button
                      key={biz}
                      size="sm"
                      variant={isSuggested ? "default" : "outline"}
                      className={`h-7 text-xs ${isSuggested ? "" : BUSINESS_COLORS[biz]}`}
                      onClick={() => commit(q.id, biz, "confirm")}
                    >
                      {BUSINESS_LABELS[biz]}{isSuggested ? " ★" : ""}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {recent.length > 0 && (
          <div className="pt-3 mt-3 border-t border-border">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Recent</p>
            <div className="space-y-1">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-1">
                  {r.status === "confirmed" ? (
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : r.status === "skipped" ? (
                    <X className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                  )}
                  <span className="font-medium">{r.attendee_name}</span>
                  {r.confirmed_business && (
                    <span className={`font-mono text-[10px] ${BUSINESS_COLORS[r.confirmed_business]}`}>
                      → {BUSINESS_LABELS[r.confirmed_business]}
                    </span>
                  )}
                  {r.crm_action && (
                    <span className="text-[10px] text-muted-foreground">({r.crm_action})</span>
                  )}
                  {r.crm_error && <span className="text-[10px] text-destructive">{r.crm_error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
