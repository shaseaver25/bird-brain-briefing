import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Newspaper, RefreshCw, ExternalLink, Star } from "lucide-react";
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

type PercentileTier = "top10" | "top25" | "top50" | "below50";

const TIER_STYLES: Record<PercentileTier, string> = {
  top10: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  top25: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  top50: "bg-muted text-foreground/70 border-border",
  below50: "bg-muted/40 text-muted-foreground border-border",
};

const TIER_LABELS: Record<PercentileTier, string> = {
  top10: "Top 10%",
  top25: "Top 25%",
  top50: "Top 50%",
  below50: "Below 50%",
};

const RELEVANCE_SCORE = { high: 3, medium: 2, low: 1 } as const;

function computeTiers(articles: IntelArticle[]): Map<string, PercentileTier> {
  const tiers = new Map<string, PercentileTier>();
  const byTopic = new Map<string, IntelArticle[]>();
  for (const a of articles) {
    const list = byTopic.get(a.topic_id) ?? [];
    list.push(a);
    byTopic.set(a.topic_id, list);
  }
  for (const [, list] of byTopic) {
    const sorted = [...list].sort((a, b) => {
      const ra = RELEVANCE_SCORE[a.relevance] ?? 0;
      const rb = RELEVANCE_SCORE[b.relevance] ?? 0;
      if (rb !== ra) return rb - ra;
      return new Date(b.found_at).getTime() - new Date(a.found_at).getTime();
    });
    const n = sorted.length;
    sorted.forEach((a, idx) => {
      const pct = (idx + 1) / n; // 1 = top, n/n = bottom
      let tier: PercentileTier;
      if (pct <= 0.1 || (n <= 10 && idx === 0)) tier = "top10";
      else if (pct <= 0.25) tier = "top25";
      else if (pct <= 0.5) tier = "top50";
      else tier = "below50";
      tiers.set(a.id, tier);
    });
  }
  return tiers;
}

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

  const tiers = computeTiers(allArticles);
  const topCount = Array.from(tiers.values()).filter((t) => t === "top10").length;

  // Split visible articles: top 10% featured, then the rest
  const featured = articles.filter((a) => tiers.get(a.id) === "top10");
  const rest = articles.filter((a) => tiers.get(a.id) !== "top10");

  return (
    <Card className="border-cyan-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-cyan-500" />
            Warbler — Intelligence Feed
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
          {loading ? "Loading…" : running ? "Warbler is scanning sources…" :
            `${allArticles.length} articles in the last 2 weeks${topCount > 0 ? ` · ${topCount} top-10% signal${topCount === 1 ? "" : "s"}` : ""}`}
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
          <div className="space-y-5">
            {featured.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-700">
                    Top Signal{featured.length === 1 ? "" : "s"} — Per Category
                  </span>
                </div>
                <div className="space-y-3">
                  {featured.map((article) => (
                    <ArticleRow key={article.id} article={article} tier={tiers.get(article.id) ?? "below50"} />
                  ))}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                {featured.length > 0 && (
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Other Signals
                  </div>
                )}
                <div className="space-y-3">
                  {rest.map((article) => (
                    <ArticleRow key={article.id} article={article} tier={tiers.get(article.id) ?? "below50"} />
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

function ArticleRow({ article, tier }: { article: IntelArticle; tier: PercentileTier }) {
  const isTop = tier === "top10";
  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isTop
          ? "border-amber-500/40 bg-amber-500/5 shadow-sm hover:border-amber-500/60"
          : "border-border bg-card hover:border-cyan-500/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isTop && <Star className="h-3 w-3 fill-amber-500 text-amber-500 shrink-0" />}
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
            className={`font-medium hover:text-cyan-500 transition-colors flex items-start gap-1 group ${isTop ? "text-base" : "text-sm"}`}
          >
            <span>{article.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{article.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${TIER_STYLES[tier]}`}>
            {TIER_LABELS[tier]}
          </span>
          <span className="text-[10px] text-muted-foreground">{article.source}</span>
        </div>
      </div>
    </div>
  );
}

export default function KiroWidgets() {
  return (
    <div className="space-y-6">
      <IntelFeedWidget />
    </div>
  );
}
