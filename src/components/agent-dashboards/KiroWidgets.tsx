import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Newspaper, RefreshCw, ExternalLink } from "lucide-react";
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
    const startCount = articles.length;
    const startLatest = articles[0]?.found_at ?? "";
    try {
      await supabase.functions.invoke("kiro-daily");
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const { data } = await supabase
          .from("kiro_intel")
          .select("*")
          .gt("expires_at", new Date().toISOString())
          .order("found_at", { ascending: false });
        const rows = (data ?? []) as IntelArticle[];
        const newest = rows[0]?.found_at ?? "";
        if (rows.length > startCount || (newest && newest !== startLatest)) {
          setArticles(rows);
          if (rows[0]) setLastUpdated(new Date(rows[0].found_at));
          clearInterval(poll);
          setRunning(false);
        } else if (attempts >= 12) {
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

export default function KiroWidgets() {
  return (
    <div className="space-y-6">
      <IntelFeedWidget />
    </div>
  );
}
