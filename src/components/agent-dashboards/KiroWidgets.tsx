import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Activity, Rocket, Shield, Clock, Zap, AlertTriangle, Newspaper, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// --- Types ---

interface IntelArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string;
  relevance: "high" | "medium" | "low";
  topic_id: string;
  topic_label: string;
  business: string;
  found_at: string;
}

// --- Static infrastructure data ---

type ServiceStatus = "healthy" | "degraded" | "down";
const SERVICES: Array<{ service: string; status: ServiceStatus; latency: string; region: string; details: string }> = [
  { service: "Supabase (PostgreSQL)", status: "healthy", latency: "12ms", region: "us-east-1", details: "2.1GB storage, 847 rows/sec" },
  { service: "Staff Meeting API", status: "healthy", latency: "340ms", region: "us-east-1", details: "Edge Functions, Supabase" },
  { service: "n8n Instance", status: "healthy", latency: "890ms", region: "us-east-1", details: "Self-hosted, 5 active workflows" },
  { service: "ElevenLabs TTS", status: "healthy", latency: "450ms", region: "external", details: "API quota: 62% remaining" },
  { service: "Anthropic API", status: "healthy", latency: "1.1s", region: "external", details: "Claude Sonnet 4.6" },
  { service: "TinyFish", status: "healthy", latency: "~60s", region: "external", details: "Web automation, SSE streaming" },
];

const LAMBDA_METRICS = {
  invocations: { value: 2847, label: "Invocations (24h)", trend: "+12%" },
  errors: { value: 3, label: "Errors (24h)", trend: "-67%" },
  avgDuration: { value: 842, label: "Avg Duration (ms)", trend: "-15%" },
  throttles: { value: 0, label: "Throttles (24h)", trend: "0" },
};

const DEPLOY_LOGS = [
  { service: "saleshawk-daily", version: "v1.3.0", status: "success" as const, timestamp: "Apr 18, 7:00 AM", deployer: "n8n" },
  { service: "kiro-daily", version: "v1.0.0", status: "success" as const, timestamp: "Apr 18, 7:01 AM", deployer: "n8n" },
  { service: "refresh-dashboard", version: "v1.1.0", status: "success" as const, timestamp: "Apr 17, 2:14 PM", deployer: "Shannon" },
  { service: "saleshawk-draft", version: "v1.0.0", status: "success" as const, timestamp: "Apr 17, 11:30 AM", deployer: "Shannon" },
  { service: "invoke-agent", version: "v1.0.0", status: "success" as const, timestamp: "Apr 15, 9:20 AM", deployer: "Shannon" },
];

function genDots(pct: number): boolean[] {
  return Array.from({ length: 30 }, (_, i) => pct >= 100 ? true : i >= 30 - Math.round((1 - pct / 100) * 30));
}

const UPTIME_DATA = [
  { service: "Supabase", percent: 100, dots: genDots(100) },
  { service: "Anthropic API", percent: 99.9, dots: genDots(99.9) },
  { service: "n8n", percent: 99.2, dots: genDots(99.2) },
  { service: "ElevenLabs", percent: 99.7, dots: genDots(99.7) },
];

const STATUS_STYLES = {
  healthy: { dot: "bg-emerald-500", label: "Healthy", text: "text-emerald-500" },
  degraded: { dot: "bg-amber-500", label: "Degraded", text: "text-amber-500" },
  down: { dot: "bg-red-500", label: "Down", text: "text-red-500" },
};

const RELEVANCE_STYLES = {
  high: "bg-red-500/10 text-red-600 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-muted text-muted-foreground border-border",
};

const TOPIC_COLORS: Record<string, string> = {
  ai_k12: "text-blue-500",
  ai_smb: "text-emerald-500",
  ai_training: "text-purple-500",
  ai_agents: "text-cyan-500",
};

const BUSINESS_LABELS: Record<string, string> = {
  realpath: "RealPath",
  tailoredu: "TailoredU",
  aiwhisperers: "AI Whisperers",
  all: "All",
};

// --- Intel Feed Hook ---

function useKiroIntel() {
  const [articles, setArticles] = useState<IntelArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  async function loadArticles() {
    const { data, error } = await supabase
      .from("kiro_intel")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("found_at", { ascending: false });

    if (!error && data?.length) {
      setArticles(data as IntelArticle[]);
      setLastUpdated(new Date((data[0] as IntelArticle).found_at));
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await supabase.functions.invoke("kiro-daily");
      // Poll until new articles appear
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await loadArticles();
        if (attempts >= 12) { // 3 min max
          clearInterval(poll);
          setRunning(false);
        }
      }, 15000);
    } catch (err) {
      console.error("kiro-daily failed:", err);
      setRunning(false);
    }
  }

  useEffect(() => {
    loadArticles().finally(() => setLoading(false));
  }, []);

  const topics = Array.from(new Set(articles.map((a) => a.topic_id)));
  const filtered = activeFilter === "all" ? articles : articles.filter((a) => a.topic_id === activeFilter);

  return { articles: filtered, allArticles: articles, topics, loading, running, lastUpdated, activeFilter, setActiveFilter, runNow };
}

// --- Intelligence Feed Widget ---

function IntelFeedWidget() {
  const { articles, allArticles, topics, loading, running, lastUpdated, activeFilter, setActiveFilter, runNow } = useKiroIntel();

  const highCount = allArticles.filter((a) => a.relevance === "high").length;

  return (
    <Card className="border-cyan-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-cyan-500" />
            Intelligence Feed
          </CardTitle>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground font-mono">
                Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT
              </span>
            )}
            <button
              onClick={runNow}
              disabled={running}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} />
              {running ? "Scanning…" : "Scan Now"}
            </button>
          </div>
        </div>
        <CardDescription>
          {loading ? "Loading…" : running ? "Kiro is scanning sources…" :
            `${allArticles.length} articles in the last 2 weeks${highCount > 0 ? ` · ${highCount} high relevance` : ""}`}
        </CardDescription>

        {/* Topic filter tabs */}
        {!loading && allArticles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-mono transition-colors ${activeFilter === "all" ? "bg-cyan-500/20 text-cyan-600" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              All ({allArticles.length})
            </button>
            {topics.map((tid) => {
              const count = allArticles.filter((a) => a.topic_id === tid).length;
              const label = allArticles.find((a) => a.topic_id === tid)?.topic_label ?? tid;
              return (
                <button
                  key={tid}
                  onClick={() => setActiveFilter(tid)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono transition-colors ${activeFilter === tid ? `bg-cyan-500/20 ${TOPIC_COLORS[tid]}` : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded bg-muted animate-pulse" />)}
          </div>
        ) : running ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-cyan-500 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Scanning news, blogs, and research reports…</p>
            <p className="text-xs text-muted-foreground mt-1">Takes about 1 minute</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No articles yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Runs automatically at 7 AM, or click Scan Now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div key={article.id} className="p-3 rounded-lg border border-border bg-card hover:border-cyan-500/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${TOPIC_COLORS[article.topic_id] ?? "text-muted-foreground"}`}>
                        {article.topic_label}
                      </span>
                      {article.business !== "all" && (
                        <span className="text-[10px] text-muted-foreground font-mono">→ {BUSINESS_LABELS[article.business] ?? article.business}</span>
                      )}
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:text-cyan-500 transition-colors flex items-start gap-1 group"
                    >
                      <span>{article.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{article.summary}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${RELEVANCE_STYLES[article.relevance]}`}>
                      {article.relevance}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{article.source}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Infrastructure Widgets (unchanged) ---

function InfraHealthWidget() {
  const healthyCt = SERVICES.filter((s) => s.status === "healthy").length;
  const degradedCt = SERVICES.filter((s) => s.status === "degraded").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Server className="h-5 w-5 text-cyan-500" />Infrastructure Health</CardTitle>
        <CardDescription>
          <span className="text-emerald-500 font-medium">{healthyCt} healthy</span>
          {degradedCt > 0 && <> · <span className="text-amber-500 font-medium">{degradedCt} degraded</span></>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {SERVICES.map((svc) => {
          const style = STATUS_STYLES[svc.status];
          return (
            <div key={svc.service} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{svc.service}</p>
                  {svc.status !== "healthy" && <Badge variant="outline" className={`text-[10px] ${style.text}`}>{style.label}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{svc.details}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono">{svc.latency}</p>
                <p className="text-[10px] text-muted-foreground">{svc.region}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function KiroWidgets() {
  const metricItems = [
    { ...LAMBDA_METRICS.invocations, icon: Zap, fmt: (v: number) => v.toLocaleString() },
    { ...LAMBDA_METRICS.errors, icon: AlertTriangle, fmt: (v: number) => v.toString() },
    { ...LAMBDA_METRICS.avgDuration, icon: Clock, fmt: (v: number) => `${v}ms` },
    { ...LAMBDA_METRICS.throttles, icon: Shield, fmt: (v: number) => v.toString() },
  ];

  return (
    <div className="space-y-6">
      {/* Intelligence Feed — live */}
      <IntelFeedWidget />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        {metricItems.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className="h-4 w-4 text-cyan-500" />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{m.fmt(m.value)}</p>
                <span className={`text-xs font-mono ${m.trend.startsWith("-") ? "text-emerald-500" : m.trend === "0" ? "text-muted-foreground" : "text-emerald-500"}`}>{m.trend}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Infra Health */}
      <InfraHealthWidget />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deploy Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Rocket className="h-5 w-5 text-cyan-500" />Recent Deployments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DEPLOY_LOGS.map((d, i) => (
              <div key={`${d.service}-${i}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium font-mono">{d.service}</p>
                    <span className="text-xs font-mono text-muted-foreground">{d.version}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{d.deployer} · {d.timestamp}</p>
                </div>
                <Badge variant={d.status === "success" ? "outline" : "destructive"} className="text-[10px] shrink-0">{d.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-500" />Uptime (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {UPTIME_DATA.map((svc) => (
              <div key={svc.service} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{svc.service}</p>
                  <span className={`text-sm font-mono font-bold ${svc.percent >= 99.5 ? "text-emerald-500" : svc.percent >= 98 ? "text-amber-500" : "text-red-500"}`}>{svc.percent}%</span>
                </div>
                <div className="flex gap-0.5">
                  {svc.dots.map((up, i) => (
                    <div key={i} className={`h-4 flex-1 rounded-sm ${up ? "bg-emerald-500/60" : "bg-red-500/60"}`} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
