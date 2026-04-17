import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DollarSign, TrendingUp, Users, Clock, AlertCircle, Target, Zap, RefreshCw, Linkedin, ExternalLink } from "lucide-react";
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
  status: string;
}

interface TodaysFindsData {
  date: string;
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

  async function loadCached() {
    const { data: row } = await supabase
      .from("widget_data")
      .select("data, updated_at")
      .eq("agent_id", "saleshawk")
      .eq("widget_key", "todays_finds")
      .maybeSingle();

    if (row?.data) {
      setData(row.data as unknown as TodaysFindsData);
      if (row.updated_at) setLastUpdated(new Date(row.updated_at));
      return true;
    }
    return false;
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("saleshawk-daily");
      if (error) throw error;
      // Reload from widget_data after run completes
      await loadCached();
    } catch (err) {
      console.error("saleshawk-daily failed:", err);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    loadCached().finally(() => setLoading(false));
  }, []);

  return { data, loading, running, lastUpdated, runNow };
}

// --- Today's Finds Widget ---

function TodaysFindsWidget() {
  const { data, loading, running, lastUpdated, runNow } = useTodaysFinds();

  const finds = data?.finds?.filter((f) => f.status === "inserted") ?? [];
  const byBusiness = {
    realpath: finds.filter((f) => f.business === "realpath"),
    tailoredu: finds.filter((f) => f.business === "tailoredu"),
    aiwhisperers: finds.filter((f) => f.business === "aiwhisperers"),
  };

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
        <CardDescription>
          {loading ? "Loading…" : running ? "SalesHawk is prospecting…" : data
            ? `${finds.length} new leads added${data.date ? ` — ${data.date}` : ""}`
            : "No run yet today — click Run Now"}
        </CardDescription>
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
                      <div key={`${lead.name}-${lead.company}`} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{lead.name}</p>
                            {lead.email && (
                              <Badge variant="outline" className="text-[10px] text-emerald-600">email found</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{lead.title} · {lead.company}</p>
                          {lead.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lead.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {lead.linkedin_url && (
                            <a
                              href={lead.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-blue-500 transition-colors"
                            >
                              <Linkedin className="h-4 w-4" />
                            </a>
                          )}
                          <div className="text-right">
                            <p className="text-sm font-bold font-mono text-emerald-600">{lead.score}</p>
                            <p className="text-[10px] text-muted-foreground">score</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
      <DealValuesWidget />
      <PipelineFunnelWidget />
      <FollowUpQueueWidget />
    </div>
  );
}
