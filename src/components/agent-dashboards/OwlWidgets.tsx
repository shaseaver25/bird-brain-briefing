import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Plus, X, ExternalLink, Landmark, MapPin } from "lucide-react";

interface LegislationItem {
  id: string;
  topic: string;
  level: string;
  jurisdiction: string;
  bill_id: string | null;
  title: string;
  summary: string | null;
  status: string | null;
  last_action: string | null;
  last_action_date: string | null;
  url: string | null;
}

interface Topic { id: string; topic: string; }
interface SummaryData { summary: string; topics: string[]; item_count?: number; scanned_at: string; }

export default function OwlWidgets() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<LegislationItem[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function fetchAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [topicsRes, itemsRes, summaryRes] = await Promise.all([
      user ? supabase.from("owl_topics").select("id, topic").eq("user_id", user.id).order("created_at") : Promise.resolve({ data: [] as Topic[] }),
      supabase.from("legislation_items").select("*").order("level").order("jurisdiction"),
      supabase.from("widget_data").select("data").eq("agent_id", "owl").eq("widget_key", "legislation_summary").maybeSingle(),
    ]);
    setTopics((topicsRes.data ?? []) as Topic[]);
    setItems((itemsRes.data ?? []) as LegislationItem[]);
    setSummary((summaryRes.data?.data as unknown as SummaryData) ?? null);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function addTopic() {
    if (!newTopic.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("owl_topics").insert({ user_id: user.id, topic: newTopic.trim() });
    setNewTopic("");
    await fetchAll();
  }

  async function removeTopic(id: string) {
    await supabase.from("owl_topics").delete().eq("id", id);
    await fetchAll();
  }

  async function runScan() {
    setRunning(true);
    try {
      await supabase.functions.invoke("owl", { body: {} });
      // Poll for fresh summary
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data } = await supabase.from("widget_data").select("data, updated_at").eq("agent_id", "owl").eq("widget_key", "legislation_summary").maybeSingle();
        const newScannedAt = (data?.data as unknown as SummaryData)?.scanned_at;
        if (newScannedAt && newScannedAt !== summary?.scanned_at) break;
      }
      await fetchAll();
    } finally {
      setRunning(false);
    }
  }

  // Group items by jurisdiction
  const federal = items.filter((i) => i.level === "federal");
  const state = items.filter((i) => i.level !== "federal");
  const stateGroups = state.reduce<Record<string, LegislationItem[]>>((acc, it) => {
    (acc[it.jurisdiction] ||= []).push(it);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">🦉 Owl — Legislation Tracker</h2>
          {summary?.scanned_at && (
            <p className="text-xs text-muted-foreground mt-0.5">Last scan: {new Date(summary.scanned_at).toLocaleString()}</p>
          )}
        </div>
        <Button size="sm" onClick={runScan} disabled={running || topics.length === 0} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {running ? "Scanning…" : "Run Scan"}
        </Button>
      </div>

      {/* Topics manager */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracked Topics</CardTitle>
          <CardDescription>Owl monitors federal and state legislation matching these topics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1.5 pr-1">
                {t.topic}
                <button onClick={() => removeTopic(t.id)} className="hover:bg-background/50 rounded p-0.5"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            {topics.length === 0 && <p className="text-sm text-muted-foreground">No topics yet. Add one to begin.</p>}
          </div>
          <div className="flex gap-2">
            <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="e.g. AI regulation, school choice, data privacy"
              onKeyDown={(e) => e.key === "Enter" && addTopic()} />
            <Button onClick={addTopic} size="sm" className="gap-1"><Plus className="h-4 w-4" />Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Overall summary */}
      {summary?.summary && (
        <div className="border-l-4 border-amber-500 bg-amber-500/5 px-4 py-3 rounded-r-md">
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Owl's overall summary:</span> {summary.summary}
          </p>
          {summary.item_count !== undefined && (
            <p className="text-xs text-muted-foreground mt-2">{summary.item_count} bills across {summary.topics.length} topic(s)</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-20 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No legislation tracked yet. Add topics and run a scan.</p>
      ) : (
        <div className="space-y-6">
          {/* Federal */}
          {federal.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-amber-500" />Federal — U.S. Congress</CardTitle>
                <CardDescription>{federal.length} bill{federal.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {federal.map((it) => <BillRow key={it.id} item={it} />)}
              </CardContent>
            </Card>
          )}

          {/* State groups */}
          {Object.entries(stateGroups).sort(([a], [b]) => a.localeCompare(b)).map(([jur, list]) => (
            <Card key={jur}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-amber-500" />{jur}</CardTitle>
                <CardDescription>{list.length} bill{list.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {list.map((it) => <BillRow key={it.id} item={it} />)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BillRow({ item }: { item: LegislationItem }) {
  return (
    <div className="border border-border rounded-md p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.bill_id && <Badge variant="outline" className="text-[10px] font-mono">{item.bill_id}</Badge>}
            <Badge variant="secondary" className="text-[10px]">{item.topic}</Badge>
            {item.status && <Badge variant="outline" className="text-[10px]">{item.status}</Badge>}
          </div>
          <p className="text-sm font-semibold mt-1.5">{item.title}</p>
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {item.summary && <p className="text-xs text-muted-foreground">{item.summary}</p>}
      {item.last_action && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold">Last action:</span> {item.last_action}
          {item.last_action_date && ` (${item.last_action_date})`}
        </p>
      )}
    </div>
  );
}
