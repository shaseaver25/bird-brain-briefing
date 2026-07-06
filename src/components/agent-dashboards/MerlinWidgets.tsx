import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  Milestone,
  Trophy,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
  owner: string | null;
  completion_pct: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  assignee: string | null;
  due_date: string | null;
  blocker: string | null;
  sort_order: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HACKATHON_ID = "a1b20001-0001-0001-0001-000000000001";

const PRIORITY_STYLES = {
  high: "bg-red-500/10 text-red-600 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-muted text-muted-foreground border-border",
};

const STATUS_DOT: Record<Project["status"], string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  completed: "bg-blue-500",
  cancelled: "bg-muted-foreground",
};

const TASK_STATUS_CONFIG = {
  done: { icon: CheckCircle2, color: "text-emerald-500", label: "Done" },
  in_progress: { icon: Loader2, color: "text-amber-500", label: "In Progress" },
  todo: { icon: Circle, color: "text-muted-foreground", label: "To Do" },
  blocked: { icon: AlertCircle, color: "text-red-500", label: "Blocked" },
};

// ── Hook ─────────────────────────────────────────────────────────────────────

function useMerlinProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [{ data: projData }, { data: taskData }] = await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .in("status", ["active", "paused"])
        .order("priority", { ascending: true }) // high first (alphabetical: high < low < medium)
        .order("created_at", { ascending: true }),
      supabase
        .from("project_tasks")
        .select("*")
        .order("sort_order", { ascending: true }),
    ]);

    if (projData) {
      // Sort by priority weight
      const weight = { high: 0, medium: 1, low: 2 };
      setProjects(
        (projData as Project[]).sort(
          (a, b) => weight[a.priority] - weight[b.priority]
        )
      );
    }
    if (taskData) setTasks(taskData as ProjectTask[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function toggleTask(task: ProjectTask) {
    // Cycle: todo → in_progress → done → todo
    const cycle: Record<ProjectTask["status"], ProjectTask["status"]> = {
      todo: "in_progress",
      in_progress: "done",
      done: "todo",
      blocked: "todo",
    };
    const next = cycle[task.status];
    await applyStatus(task, next);
  }

  async function markDone(task: ProjectTask) {
    if (task.status === "done") {
      await applyStatus(task, "todo");
    } else {
      await applyStatus(task, "done");
    }
  }

  async function applyStatus(task: ProjectTask, next: ProjectTask["status"]) {
    setUpdatingTask(task.id);

    const { error } = await supabase
      .from("project_tasks")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", task.id);

    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
      );
      // Recalculate project completion
      const projectTasks = tasks.filter((t) => t.project_id === task.project_id);
      const allWithUpdated = projectTasks.map((t) =>
        t.id === task.id ? { ...t, status: next } : t
      );
      const done = allWithUpdated.filter((t) => t.status === "done").length;
      const pct = Math.round((done / allWithUpdated.length) * 100);
      await supabase
        .from("projects")
        .update({ completion_pct: pct, updated_at: new Date().toISOString() })
        .eq("id", task.project_id);
      setProjects((prev) =>
        prev.map((p) =>
          p.id === task.project_id ? { ...p, completion_pct: pct } : p
        )
      );
    }
    setUpdatingTask(null);
  }

  async function deleteTask(task: ProjectTask) {
    setUpdatingTask(task.id);
    const { error } = await supabase
      .from("project_tasks")
      .delete()
      .eq("id", task.id);
    if (!error) {
      const remaining = tasks.filter((t) => t.id !== task.id);
      setTasks(remaining);
      const projectTasks = remaining.filter((t) => t.project_id === task.project_id);
      const pct = projectTasks.length
        ? Math.round(
            (projectTasks.filter((t) => t.status === "done").length /
              projectTasks.length) *
              100
          )
        : 0;
      await supabase
        .from("projects")
        .update({ completion_pct: pct, updated_at: new Date().toISOString() })
        .eq("id", task.project_id);
      setProjects((prev) =>
        prev.map((p) =>
          p.id === task.project_id ? { ...p, completion_pct: pct } : p
        )
      );
    }
    setUpdatingTask(null);
  }

  return { projects, tasks, loading, updatingTask, toggleTask, markDone, deleteTask, reload: loadData };
}

// ── Hackathon Hero Widget ─────────────────────────────────────────────────────

function HackathonWidget({
  project,
  tasks,
  updatingTask,
  toggleTask,
  markDone,
  deleteTask,
}: {
  project: Project;
  tasks: ProjectTask[];
  updatingTask: string | null;
  toggleTask: (t: ProjectTask) => void;
  markDone: (t: ProjectTask) => void;
  deleteTask: (t: ProjectTask) => void;
}) {
  const daysLeft = project.deadline
    ? Math.ceil(
        (new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <CardTitle className="text-lg">{project.name}</CardTitle>
              <CardDescription className="mt-0.5">{project.description}</CardDescription>
            </div>
          </div>
          <div className="text-right shrink-0">
            {daysLeft !== null && (
              <div className={`text-2xl font-bold ${daysLeft <= 3 ? "text-red-500" : "text-amber-500"}`}>
                {daysLeft}d
              </div>
            )}
            <div className="text-xs text-muted-foreground">until deadline</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{done} of {tasks.length} tasks done</span>
            <span>{project.completion_pct}%</span>
          </div>
          <Progress value={project.completion_pct} className="h-2" />
        </div>

        {/* Task checklist */}
        <div className="space-y-2">
          {tasks.map((task) => {
            const cfg = TASK_STATUS_CONFIG[task.status];
            const Icon = cfg.icon;
            const isUpdating = updatingTask === task.id;
            return (
              <div
                key={task.id}
                className="w-full flex items-center gap-2.5 text-left p-2 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <button
                  onClick={() => toggleTask(task)}
                  disabled={isUpdating}
                  title="Cycle status"
                  className="shrink-0"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Icon
                      className={`h-4 w-4 ${cfg.color} ${task.status === "in_progress" ? "animate-spin" : ""}`}
                    />
                  )}
                </button>
                <span
                  className={`text-sm flex-1 ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}
                >
                  {task.title}
                </span>
                {task.due_date && (
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
                <button
                  onClick={() => markDone(task)}
                  disabled={isUpdating}
                  title={task.status === "done" ? "Mark as to-do" : "Mark as finished"}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-emerald-500 transition-opacity shrink-0"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete task "${task.title}"?`)) deleteTask(task);
                  }}
                  disabled={isUpdating}
                  title="Delete task"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Project Board ────────────────────────────────────────────────────────────

interface CrmCard {
  id: string;
  board_id: string;
  board_name: string;
  column_title: string | null;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low" | null;
  due_date: string | null;
  status: "todo" | "in_progress" | "done" | "blocked";
  is_blocked: boolean;
  completed_at: string | null;
}

interface CrmBoardSummary {
  board_id: string;
  name: string;
  description: string | null;
  theme_color: string | null;
  priority: "high" | "medium" | "low";
  my_cards: CrmCard[];
  total: number;
  done: number;
  open: number;
  blocked: number;
  completion_pct: number;
  next_due: string | null;
}

function useCrmBoards() {
  const [boards, setBoards] = useState<CrmBoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("merlin-crm-tasks");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setBoards((data?.boards ?? []) as CrmBoardSummary[]);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  return { boards, loading, error, reload: load };
}

function ProjectBoardWidget({
  projects,
  tasks,
}: {
  projects: Project[];
  tasks: ProjectTask[];
}) {
  const nonHackathon = projects.filter((p) => p.id !== HACKATHON_ID);
  const { boards: crmBoards, loading: crmLoading, error: crmError, reload: reloadCrm } = useCrmBoards();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleBoard = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const totalOpenCrm = (crmBoards ?? []).reduce((s, b) => s + b.open, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-500" />
              Project Board
            </CardTitle>
            <CardDescription>
              {nonHackathon.filter((p) => p.status === "active").length} active projects
              {crmBoards && crmBoards.length > 0 && (
                <> · {totalOpenCrm} open Stone Arch task{totalOpenCrm === 1 ? "" : "s"}</>
              )}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={reloadCrm} className="gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${crmLoading ? "animate-spin" : ""}`} />
            CRM
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {nonHackathon.map((project) => {
          const projectTasks = tasks.filter((t) => t.project_id === project.id);
          const blocked = projectTasks.filter((t) => t.status === "blocked").length;
          return (
            <div
              key={project.id}
              className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[project.status]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{project.name}</p>
                  {blocked > 0 && (
                    <Badge variant="destructive" className="text-[10px] shrink-0">
                      {blocked} blocked
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {project.owner} &middot;{" "}
                  {project.deadline
                    ? `Due ${new Date(project.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : "No deadline"}
                </p>
              </div>
              <div className="w-28 space-y-1 shrink-0">
                <Progress value={project.completion_pct} className="h-1.5" />
                <p className="text-[10px] text-right text-muted-foreground">
                  {project.completion_pct}%
                </p>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${PRIORITY_STYLES[project.priority]}`}
              >
                {project.priority}
              </Badge>
            </div>
          );
        })}

        {/* Stone Arch CRM boards (cards assigned to me) */}
        {crmError && (
          <p className="text-xs text-red-500 pt-2">Could not load Stone Arch tasks: {crmError}</p>
        )}
        {crmBoards && crmBoards.length > 0 && (
          <div className="pt-3 mt-3 border-t border-border space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3 w-3" />
              Stone Arch CRM — assigned to you
            </p>
            {crmBoards.map((b) => {
              const isOpen = expanded.has(b.board_id);
              const open = b.my_cards.filter((c) => c.status !== "done");
              return (
                <div key={b.board_id} className="border-b border-border last:border-0">
                  <button
                    onClick={() => toggleBoard(b.board_id)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-1 transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: b.theme_color ?? "hsl(var(--primary))" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        {b.blocked > 0 && (
                          <Badge variant="destructive" className="text-[10px] shrink-0">
                            {b.blocked} blocked
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Stone Arch CRM &middot; {b.open} open / {b.total} total
                        {b.next_due && (
                          <> &middot; next {new Date(b.next_due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                        )}
                      </p>
                    </div>
                    <div className="w-28 space-y-1 shrink-0">
                      <Progress value={b.completion_pct} className="h-1.5" />
                      <p className="text-[10px] text-right text-muted-foreground">{b.completion_pct}%</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${PRIORITY_STYLES[b.priority ?? "medium"]}`}>
                      {b.priority ?? "medium"}
                    </Badge>
                  </button>
                  {isOpen && (
                    <div className="pl-6 pb-3 space-y-1.5">
                      {open.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No open cards. 🎉</p>
                      ) : (
                        open.map((c) => {
                          const cfg = TASK_STATUS_CONFIG[c.status];
                          const Icon = cfg.icon;
                          return (
                            <div key={c.id} className="flex items-start gap-2 text-sm">
                              <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color} ${c.status === "in_progress" ? "animate-spin" : ""}`} />
                              <span className="flex-1">{c.title}</span>
                              {c.column_title && (
                                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{c.column_title}</span>
                              )}
                              {c.due_date && (
                                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                                  {new Date(c.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {crmBoards && crmBoards.length === 0 && !crmError && !crmLoading && (
          <p className="text-xs text-muted-foreground pt-2">No Stone Arch CRM cards assigned to you right now.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Timeline Widget ──────────────────────────────────────────────────────────

function TimelineWidget({ projects }: { projects: Project[] }) {
  const upcoming = projects
    .filter((p) => p.deadline && p.status === "active")
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  if (!upcoming.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Milestone className="h-5 w-5 text-amber-500" />
          Upcoming Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6 space-y-4">
          <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
          {upcoming.map((p) => {
            const daysLeft = Math.ceil(
              (new Date(p.deadline!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            const urgent = daysLeft <= 5;
            return (
              <div key={p.id} className="relative">
                <div
                  className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 bg-background ${
                    urgent ? "border-red-500" : "border-amber-500"
                  }`}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-16">
                    {new Date(p.deadline!).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-sm font-medium">{p.name}</span>
                  <span
                    className={`text-xs ml-auto shrink-0 ${
                      urgent ? "text-red-500 font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {daysLeft}d left
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────

export default function MerlinWidgets() {
  const { projects, tasks, loading, updatingTask, toggleTask, markDone, deleteTask, reload } =
    useMerlinProjects();

  const hackathon = projects.find((p) => p.id === HACKATHON_ID);
  const hackathonTasks = tasks
    .filter((t) => t.project_id === HACKATHON_ID)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading projects…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with reload */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={reload} className="gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Follow-ups handed to Merlin by other agents (SalesHawk/Swift) */}
      <IncomingHandoffsWidget />

      {/* Action items pulled from meeting notes */}
      <MeetingActionItemsWidget />

      {/* Hackathon hero */}
      {hackathon && (
        <HackathonWidget
          project={hackathon}
          tasks={hackathonTasks}
          updatingTask={updatingTask}
          toggleTask={toggleTask}
          markDone={markDone}
          deleteTask={deleteTask}
        />
      )}

      {/* Other projects */}
      <ProjectBoardWidget projects={projects} tasks={tasks} />

      {/* Deadline timeline */}
      <TimelineWidget projects={projects} />
    </div>
  );
}

// ── Incoming Handoffs Widget ──────────────────────────────────────────────────
// Follow-ups other agents have handed to Merlin via the message bus.

interface HandoffRow {
  id: string;
  from_agent: string;
  subject: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function IncomingHandoffsWidget() {
  const [handoffs, setHandoffs] = useState<HandoffRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await (supabase.from("agent_messages" as never) as ReturnType<typeof supabase.from>)
        .select("id, from_agent, subject, payload, created_at")
        .eq("to_agent", "merlin")
        .eq("kind", "handoff")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setHandoffs((data ?? []) as unknown as HandoffRow[]);
      setLoading(false);
    }
    load();
    const poll = setInterval(load, 45_000);
    return () => { cancelled = true; clearInterval(poll); };
  }, []);

  if (!loading && handoffs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="h-5 w-5 text-primary" />
          Incoming Follow-ups
        </CardTitle>
        <CardDescription>Handed to Merlin by the team — new inbound leads to chase</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {handoffs.map((h) => (
          <div key={h.id} className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{h.subject}</p>
              <p className="text-xs text-muted-foreground">
                from {h.from_agent}
                {h.payload?.source ? ` · ${String(h.payload.source).replace("_", " ")}` : ""}
                {" · "}{new Date(h.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Meeting Action Items Widget ───────────────────────────────────────────────

interface ActionItem {
  id: string;
  title: string;
  context: string | null;
  due_date: string | null;
  status: "todo" | "in_progress" | "done";
  source_meeting_title: string | null;
  source_meeting_date: string | null;
  created_at: string;
}

function MeetingActionItemsWidget() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await (supabase
      .from("merlin_action_items" as any)
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50) as any);
    setItems((data ?? []) as ActionItem[]);
    setLoading(false);
  }

  async function scan() {
    setScanning(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("merlin-extract-actions");
      if (error) throw error;
      setMsg(`Scanned ${data?.scanned ?? 0} meetings — added ${data?.added ?? 0} action item${data?.added === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      setMsg(`Scan failed: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  }

  async function cycle(item: ActionItem) {
    const next: ActionItem["status"] = item.status === "todo" ? "in_progress" : item.status === "in_progress" ? "done" : "todo";
    await (supabase.from("merlin_action_items" as any) as any).update({ status: next, updated_at: new Date().toISOString() }).eq("id", item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
  }

  async function remove(id: string) {
    await (supabase.from("merlin_action_items" as any) as any).delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  useEffect(() => { load(); }, []);

  const open = items.filter((i) => i.status !== "done");
  const done = items.filter((i) => i.status === "done").slice(0, 5);

  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            From Your Meetings
          </CardTitle>
          <button
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning…" : "Scan Notes"}
          </button>
        </div>
        <CardDescription>
          {msg ?? `${open.length} open action item${open.length === 1 ? "" : "s"} pulled from your Granola notes.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="h-12 rounded bg-muted animate-pulse" />
        ) : open.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nothing yet. Click <span className="font-mono">Scan Notes</span> to pull next steps from recent meetings.
          </p>
        ) : (
          open.map((item) => {
            const cfg = TASK_STATUS_CONFIG[item.status];
            const Icon = cfg.icon;
            return (
              <div key={item.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group">
                <button onClick={() => cycle(item)} className="mt-0.5">
                  <Icon className={`h-4 w-4 shrink-0 ${cfg.color} ${item.status === "in_progress" ? "animate-spin" : ""}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.context && <p className="text-xs text-muted-foreground">{item.context}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {item.source_meeting_title}
                    {item.source_meeting_date && <> · {new Date(item.source_meeting_date).toLocaleDateString()}</>}
                  </p>
                </div>
                {item.due_date && (
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">
                    {new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
                <button onClick={() => remove(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
        {done.length > 0 && (
          <div className="pt-3 mt-3 border-t border-border space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Recently done</p>
            {done.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="line-through">{d.title}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
