import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Sparkles, Target, Loader2, AlertTriangle, ArrowLeft, Network } from "lucide-react";

// Untyped-table access — these tables aren't in the generated Supabase types.
const db = (table: string) =>
  (supabase.from(table as never) as ReturnType<typeof supabase.from>);

interface GraphNode { id: string; label: string }
interface GraphEdge { from: string; to: string }
interface KnowledgeGraph { nodes: GraphNode[]; edges: GraphEdge[] }

interface Guidebook {
  id: string;
  topic: string;
  audience: string | null;
  title: string | null;
  summary: string | null;
  learning_objectives: string[] | null;
  knowledge_graph: KnowledgeGraph | null;
  status: "generating" | "ready" | "error";
  error: string | null;
  created_at: string;
}

interface Concept {
  id: string;
  concept_key: string;
  label: string;
  definition: string;
  prerequisites: string[];
  learning_objective: string;
  bloom_level: string;
  content: string;
  sort_order: number;
}

const BLOOM_COLORS: Record<string, string> = {
  remember: "bg-slate-100 text-slate-700",
  understand: "bg-blue-100 text-blue-700",
  apply: "bg-emerald-100 text-emerald-700",
  analyze: "bg-amber-100 text-amber-700",
  evaluate: "bg-orange-100 text-orange-700",
  create: "bg-purple-100 text-purple-700",
};

function bloomClass(level: string): string {
  return BLOOM_COLORS[level?.toLowerCase()] ?? "bg-muted text-muted-foreground";
}

/**
 * Layered knowledge-graph view. Nodes are assigned to a column by their
 * longest prerequisite chain (depth), so prerequisites always sit to the left
 * of the concepts that depend on them — the same "prerequisites first" reading
 * order Dan McCreary's concept graphs use. Edges are drawn as SVG curves.
 */
function KnowledgeGraphView({ graph }: { graph: KnowledgeGraph }) {
  const layout = useMemo(() => {
    const nodes = graph.nodes ?? [];
    const edges = graph.edges ?? [];
    if (!nodes.length) return null;

    const preOf = new Map<string, string[]>();
    for (const n of nodes) preOf.set(n.id, []);
    for (const e of edges) {
      if (preOf.has(e.to)) preOf.get(e.to)!.push(e.from);
    }

    // Depth = longest prerequisite chain. Memoized with cycle guard.
    const depthCache = new Map<string, number>();
    const depth = (id: string, stack: Set<string>): number => {
      if (depthCache.has(id)) return depthCache.get(id)!;
      if (stack.has(id)) return 0; // cycle break
      stack.add(id);
      const pres = preOf.get(id) ?? [];
      const d = pres.length ? 1 + Math.max(...pres.map((p) => depth(p, stack))) : 0;
      stack.delete(id);
      depthCache.set(id, d);
      return d;
    };

    const columns = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      const d = depth(n.id, new Set());
      if (!columns.has(d)) columns.set(d, []);
      columns.get(d)!.push(n);
    }

    const colKeys = [...columns.keys()].sort((a, b) => a - b);
    const COL_W = 190;
    const ROW_H = 58;
    const NODE_W = 150;
    const NODE_H = 38;
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    colKeys.forEach((c, ci) => {
      const col = columns.get(c)!;
      maxRows = Math.max(maxRows, col.length);
      col.forEach((n, ri) => {
        pos.set(n.id, { x: ci * COL_W + 10, y: ri * ROW_H + 10 });
      });
    });

    const width = colKeys.length * COL_W;
    const height = maxRows * ROW_H + 20;
    return { pos, width, height, NODE_W, NODE_H, nodes, edges };
  }, [graph]);

  if (!layout) return null;

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(layout.width, 300)} height={layout.height} className="min-w-full">
        {/* edges */}
        {layout.edges.map((e, i) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + layout.NODE_W;
          const y1 = a.y + layout.NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + layout.NODE_H / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.35}
              strokeWidth={1.5}
            />
          );
        })}
        {/* nodes */}
        {layout.nodes.map((n) => {
          const p = layout.pos.get(n.id);
          if (!p) return null;
          return (
            <g key={n.id}>
              <rect
                x={p.x}
                y={p.y}
                width={layout.NODE_W}
                height={layout.NODE_H}
                rx={8}
                className="fill-primary/10 stroke-primary/40"
                strokeWidth={1}
              />
              <text
                x={p.x + layout.NODE_W / 2}
                y={p.y + layout.NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground"
                fontSize={11}
              >
                {n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GuidebookDetail({ book, onBack }: { book: Guidebook; onBack: () => void }) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await db("guidebook_concepts")
        .select("*")
        .eq("guidebook_id", book.id)
        .order("sort_order", { ascending: true });
      setConcepts((data as unknown as Concept[]) ?? []);
      setLoading(false);
    })();
  }, [book.id]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All guidebooks
      </button>

      <div>
        <h2 className="text-2xl font-semibold">{book.title ?? book.topic}</h2>
        {book.audience && <p className="text-sm text-muted-foreground mt-0.5">For {book.audience}</p>}
        {book.summary && <p className="text-sm mt-3 max-w-2xl">{book.summary}</p>}
      </div>

      {book.learning_objectives && book.learning_objectives.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Learning objectives</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {book.learning_objectives.map((o, i) => (
                <li key={i} className="text-sm flex gap-2"><span className="text-primary">•</span>{o}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {book.knowledge_graph && (book.knowledge_graph.nodes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" /> Concept knowledge graph</CardTitle>
            <CardDescription>Prerequisites flow left → right. Each arrow means "understand this first."</CardDescription>
          </CardHeader>
          <CardContent>
            <KnowledgeGraphView graph={book.knowledge_graph} />
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Concepts, in learning order
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading concepts…</p>
        ) : (
          <div className="space-y-4">
            {concepts.map((c, i) => (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">
                      <span className="text-muted-foreground mr-2">{i + 1}.</span>{c.label}
                    </CardTitle>
                    {c.bloom_level && (
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${bloomClass(c.bloom_level)}`}>
                        {c.bloom_level}
                      </span>
                    )}
                  </div>
                  {c.definition && <CardDescription>{c.definition}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-2">
                  {c.learning_objective && (
                    <p className="text-xs text-muted-foreground flex gap-1.5">
                      <Target className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {c.learning_objective}
                    </p>
                  )}
                  {c.prerequisites?.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Prerequisites: {c.prerequisites.join(", ")}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-line">{c.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OwlGuidebookWidgets() {
  const [books, setBooks] = useState<Guidebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Guidebook | null>(null);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db("guidebooks")
      .select("*")
      .order("created_at", { ascending: false });
    setBooks((data as unknown as Guidebook[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // While anything is still generating, poll so the card flips to "ready".
  useEffect(() => {
    if (!books.some((b) => b.status === "generating")) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [books, load]);

  const create = async () => {
    if (!topic.trim()) return;
    setCreating(true);
    try {
      await supabase.functions.invoke("owl-guidebook", {
        body: { topic: topic.trim(), audience: audience.trim() || undefined },
      });
      setTopic("");
      setAudience("");
      setTimeout(load, 1500);
    } finally {
      setCreating(false);
    }
  };

  if (selected) {
    // Keep the selected book fresh from the list (status may have flipped).
    const fresh = books.find((b) => b.id === selected.id) ?? selected;
    return <GuidebookDetail book={fresh} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5" /> Owl — Intelligent Guidebooks</h2>
        <p className="text-sm text-muted-foreground">
          Researches a topic, maps its concepts into a knowledge graph, and writes a prerequisite-ordered guidebook.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> New guidebook</CardTitle>
          <CardDescription>Give Owl a topic and (optionally) who it's for.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Topic — e.g. Retrieval-augmented generation"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && create()}
          />
          <Input
            placeholder="Audience (optional) — e.g. a founder new to AI"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && create()}
          />
          <Button onClick={create} disabled={creating || !topic.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
            {creating ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending to Owl…</> : <>Build guidebook</>}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Guidebooks</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : books.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No guidebooks yet — build your first one above.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {books.map((b) => (
              <Card
                key={b.id}
                className={b.status === "ready" ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}
                onClick={() => b.status === "ready" && setSelected(b)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{b.title ?? b.topic}</CardTitle>
                    {b.status === "generating" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Building
                      </span>
                    )}
                    {b.status === "error" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Failed
                      </span>
                    )}
                    {b.status === "ready" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                        {b.knowledge_graph?.nodes?.length ?? 0} concepts
                      </span>
                    )}
                  </div>
                  {b.audience && <CardDescription>For {b.audience}</CardDescription>}
                </CardHeader>
                <CardContent>
                  {b.status === "error" ? (
                    <p className="text-xs text-red-600">{b.error ?? "Generation failed — try again."}</p>
                  ) : b.status === "generating" ? (
                    <p className="text-xs text-muted-foreground">Researching and mapping concepts… this takes a minute.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground line-clamp-2">{b.summary}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
