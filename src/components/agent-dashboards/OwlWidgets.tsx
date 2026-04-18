import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, BookOpen, Radar, ListChecks } from "lucide-react";

interface Opportunity {
  id: string;
  title: string;
  source: string;
  event_type: string;
  urgency: "high" | "medium" | "low";
  missing_inputs: string[];
  summary: string;
}

interface Assessment {
  project_id: string;
  title: string;
  build_status: string;
  concept_graph_density: string;
  human_todos: string[];
  flag: string | null;
}

interface Todo {
  project: string;
  task: string;
  done: boolean;
}

interface OpportunityScanData {
  detected_opportunities: Opportunity[];
  meeting_summary: string;
  overall_readiness: "green" | "yellow" | "red";
  scanned_at: string;
}

interface ProjectAssessmentsData {
  assessments: Assessment[];
  assessed_at: string;
}

interface TodoChecklistData {
  todos: Todo[];
  generated_at: string;
}

const URGENCY_VARIANT: Record<Opportunity["urgency"], "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const READINESS_STYLE: Record<OpportunityScanData["overall_readiness"], string> = {
  green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  yellow: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  red: "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function OwlWidgets() {
  const [opportunityScan, setOpportunityScan] = useState<OpportunityScanData | null>(null);
  const [projectAssessments, setProjectAssessments] = useState<ProjectAssessmentsData | null>(null);
  const [todoChecklist, setTodoChecklist] = useState<TodoChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from("widget_data")
        .select("widget_key, data, updated_at")
        .eq("agent_id", "owl")
        .in("widget_key", ["opportunity_scan", "project_assessments", "todo_checklist"]);

      if (rows) {
        for (const row of rows) {
          if (row.widget_key === "opportunity_scan") {
            setOpportunityScan(row.data as unknown as OpportunityScanData);
            setLastRun(row.updated_at);
          }
          if (row.widget_key === "project_assessments") {
            setProjectAssessments(row.data as unknown as ProjectAssessmentsData);
          }
          if (row.widget_key === "todo_checklist") {
            setTodoChecklist(row.data as unknown as TodoChecklistData);
          }
        }
      }
    } catch (err) {
      console.error("OwlWidgets fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleRunNow() {
    setRunning(true);
    try {
      await supabase.functions.invoke("owl", {
        body: { context: "Manual run triggered from Bird Brain Briefing dashboard." },
      });
      // Give the edge function a moment to process before refetching
      await new Promise((r) => setTimeout(r, 4000));
      await fetchData();
    } catch (err) {
      console.error("Owl run error:", err);
    } finally {
      setRunning(false);
    }
  }

  const opportunities = opportunityScan?.detected_opportunities ?? [];
  const assessments = projectAssessments?.assessments ?? [];
  const todos = todoChecklist?.todos ?? [];
  const pendingTodos = todos.filter((t) => !t.done);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🦉 Owl — Intelligent Textbook Agent
          </h2>
          {lastRun && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last scan: {new Date(lastRun).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {opportunityScan?.overall_readiness && (
            <Badge
              variant="outline"
              className={`text-[10px] ${READINESS_STYLE[opportunityScan.overall_readiness]}`}
            >
              ● {opportunityScan.overall_readiness.toUpperCase()}
            </Badge>
          )}
          <Button size="sm" onClick={handleRunNow} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {running ? "Scanning…" : "Run Now"}
          </Button>
        </div>
      </div>

      {/* Meeting summary banner */}
      {opportunityScan?.meeting_summary && (
        <div className="border-l-4 border-amber-500 bg-amber-500/5 px-4 py-3 rounded-r-md">
          <p className="text-sm">
            <span className="font-semibold">Owl says:</span> {opportunityScan.meeting_summary}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-20 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading Owl data…</span>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Widget 1: Detected opportunities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Radar className="h-4 w-4 text-amber-500" />
                Detected Teaching Opportunities
              </CardTitle>
              <CardDescription>
                {opportunities.length} opportunit{opportunities.length !== 1 ? "ies" : "y"} identified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No teaching opportunities detected yet. Try running a scan.
                </p>
              ) : (
                opportunities.map((opp) => (
                  <div key={opp.id} className="border border-border rounded-md p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{opp.title}</p>
                      <Badge variant={URGENCY_VARIANT[opp.urgency]} className="text-[10px] shrink-0">
                        {opp.urgency}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{opp.summary}</p>
                    <div className="flex items-center gap-2 flex-wrap text-[10px]">
                      <Badge variant="outline" className="text-[10px]">{opp.event_type}</Badge>
                      <span className="text-muted-foreground">src: {opp.source}</span>
                    </div>
                    {opp.missing_inputs?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-semibold">Missing inputs:</span>{" "}
                        {opp.missing_inputs.join(", ")}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Widget 2: Project assessments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-500" />
                Textbook Project Status
              </CardTitle>
              <CardDescription>
                {assessments.length} project{assessments.length !== 1 ? "s" : ""} tracked
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {assessments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active textbook projects yet.</p>
              ) : (
                assessments.map((a) => (
                  <div key={a.project_id} className="border border-border rounded-md p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {a.build_status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-semibold">Graph density:</span> {a.concept_graph_density}
                    </p>
                    {a.flag && (
                      <p className="text-[11px] text-amber-600 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {a.flag}
                      </p>
                    )}
                    {a.human_todos?.length > 0 && (
                      <div className="space-y-0.5 pt-1">
                        {a.human_todos.slice(0, 3).map((todo, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground">• {todo}</p>
                        ))}
                        {a.human_todos.length > 3 && (
                          <p className="text-[11px] text-muted-foreground italic">
                            +{a.human_todos.length - 3} more tasks
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Widget 3: Pending todos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-amber-500" />
                Shannon's Remaining To-Dos
              </CardTitle>
              <CardDescription>
                {pendingTodos.length} task{pendingTodos.length !== 1 ? "s" : ""} awaiting human input
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No outstanding tasks. Owl has everything it needs — or no projects are active yet.
                </p>
              ) : (
                pendingTodos.map((todo, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border-b border-border pb-2 last:border-0">
                    <span className="text-muted-foreground mt-0.5">◦</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{todo.project}</p>
                      <p className="text-muted-foreground">{todo.task}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
