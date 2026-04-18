import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Pin, PinOff, GripVertical, Edit2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgentStore, AgentConfig } from "@/hooks/useAgentStore";

import merlinAvatar from "@/assets/merlin-avatar.png";
import ospreyAvatar from "@/assets/osprey-avatar.png";
import saleshawkAvatar from "@/assets/saleshawk-avatar.png";
import wrenAvatar from "@/assets/wren-avatar.png";
import owlAvatar from "@/assets/owl-avatar.png";

const AVATAR_MAP: Record<string, string> = {
  merlin: merlinAvatar,
  osprey: ospreyAvatar,
  saleshawk: saleshawkAvatar,
  wren: wrenAvatar,
  owl: owlAvatar,
};

function getAvatar(agent: { id: string; name: string }): string | undefined {
  return AVATAR_MAP[agent.id] || AVATAR_MAP[agent.name.toLowerCase()];
}

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  created_at: string;
}

interface Widget {
  id: string;
  widget_type: string;
  title: string;
  config: Record<string, any>;
  position: number;
}

// ─── Notes Section ───
function NotesSection({ userId, agentId }: { userId: string; agentId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("agent_notes")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (data) setNotes(data as Note[]);
  }, [userId, agentId]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!newTitle.trim()) return;
    await supabase.from("agent_notes").insert({
      user_id: userId,
      agent_id: agentId,
      title: newTitle.trim(),
      content: newContent.trim(),
    });
    setNewTitle("");
    setNewContent("");
    setAdding(false);
    load();
  };

  const togglePin = async (note: Note) => {
    await supabase.from("agent_notes").update({ pinned: !note.pinned }).eq("id", note.id);
    load();
  };

  const deleteNote = async (id: string) => {
    await supabase.from("agent_notes").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-semibold text-foreground uppercase tracking-wider">Notes</h3>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-mono"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
            <input
              className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <textarea
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
              placeholder="Content..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={addNote} className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-mono">Save</button>
              <button onClick={() => setAdding(false)} className="px-3 py-1 rounded-md border border-border text-xs font-mono text-muted-foreground">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {notes.map((note) => (
          <div key={note.id} className="rounded-md border border-border bg-card p-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {note.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                  <span className="text-sm font-medium text-foreground truncate">{note.title}</span>
                </div>
                {note.content && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{note.content}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => togglePin(note)} className="p-1 hover:text-primary text-muted-foreground">
                  {note.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                </button>
                <button onClick={() => deleteNote(note.id)} className="p-1 hover:text-destructive text-muted-foreground">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {notes.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground italic text-center py-4">No notes yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Tasks Section ───
const PRIORITY_COLORS = { low: "bg-muted text-muted-foreground", medium: "bg-primary/15 text-primary", high: "bg-destructive/15 text-destructive" };
const STATUS_LABELS = { todo: "To Do", in_progress: "In Progress", done: "Done" };

function TasksSection({ userId, agentId }: { userId: string; agentId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("agent_tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });
    if (data) setTasks(data as Task[]);
  }, [userId, agentId]);

  useEffect(() => { load(); }, [load]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    await supabase.from("agent_tasks").insert({
      user_id: userId,
      agent_id: agentId,
      title: newTitle.trim(),
    });
    setNewTitle("");
    setAdding(false);
    load();
  };

  const cycleStatus = async (task: Task) => {
    const next = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo";
    await supabase.from("agent_tasks").update({ status: next }).eq("id", task.id);
    load();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("agent_tasks").delete().eq("id", id);
    load();
  };

  const grouped = {
    todo: tasks.filter((t) => t.status === "todo"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    done: tasks.filter((t) => t.status === "done"),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-semibold text-foreground uppercase tracking-wider">Tasks</h3>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-mono"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex gap-2 overflow-hidden">
            <input
              className="flex-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Task title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
            />
            <button onClick={addTask} className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-mono">Add</button>
          </motion.div>
        )}
      </AnimatePresence>

      {(["todo", "in_progress", "done"] as const).map((status) => (
        <div key={status}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1.5">
            {STATUS_LABELS[status]} ({grouped[status].length})
          </p>
          <div className="space-y-1.5">
            {grouped[status].map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 group">
                <button
                  onClick={() => cycleStatus(task)}
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    task.status === "done"
                      ? "bg-primary border-primary"
                      : task.status === "in_progress"
                      ? "border-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {task.status === "done" && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  {task.status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
                <span className={`text-sm flex-1 ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {task.title}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${PRIORITY_COLORS[task.priority]}`}>
                  {task.priority}
                </span>
                <button onClick={() => deleteTask(task.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-opacity">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {tasks.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic text-center py-4">No tasks yet</p>
      )}
    </div>
  );
}

// ─── Widgets Section ───
function WidgetsSection({ userId, agentId }: { userId: string; agentId: string }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("kpi");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("agent_widgets")
      .select("*")
      .eq("user_id", userId)
      .eq("agent_id", agentId)
      .order("position", { ascending: true });
    if (data) setWidgets(data as Widget[]);
  }, [userId, agentId]);

  useEffect(() => { load(); }, [load]);

  const addWidget = async () => {
    if (!newTitle.trim()) return;
    await supabase.from("agent_widgets").insert({
      user_id: userId,
      agent_id: agentId,
      title: newTitle.trim(),
      widget_type: newType,
      config: newType === "kpi" ? { value: "0", label: "Metric" } : newType === "markdown" ? { content: "# Hello" } : {},
      position: widgets.length,
    });
    setNewTitle("");
    setAdding(false);
    load();
  };

  const deleteWidget = async (id: string) => {
    await supabase.from("agent_widgets").delete().eq("id", id);
    load();
  };

  const updateWidgetConfig = async (id: string, config: Record<string, any>) => {
    await supabase.from("agent_widgets").update({ config }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-semibold text-foreground uppercase tracking-wider">Widgets</h3>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-mono"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
            <input
              className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Widget title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <select
              className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              <option value="kpi">KPI Card</option>
              <option value="markdown">Markdown Block</option>
              <option value="iframe">Embedded URL</option>
            </select>
            <div className="flex gap-2">
              <button onClick={addWidget} className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-mono">Add</button>
              <button onClick={() => setAdding(false)} className="px-3 py-1 rounded-md border border-border text-xs font-mono text-muted-foreground">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {widgets.map((w) => (
          <WidgetCard key={w.id} widget={w} onDelete={() => deleteWidget(w.id)} onUpdateConfig={(c) => updateWidgetConfig(w.id, c)} />
        ))}
      </div>
      {widgets.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic text-center py-4">No widgets yet — add KPIs, notes, or embeds</p>
      )}
    </div>
  );
}

function WidgetCard({ widget, onDelete, onUpdateConfig }: { widget: Widget; onDelete: () => void; onUpdateConfig: (c: Record<string, any>) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(widget.config.value || widget.config.content || widget.config.url || "");

  const save = () => {
    const key = widget.widget_type === "kpi" ? "value" : widget.widget_type === "markdown" ? "content" : "url";
    onUpdateConfig({ ...widget.config, [key]: value });
    setEditing(false);
  };

  return (
    <div className="rounded-md border border-border bg-card p-3 group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{widget.title}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(!editing)} className="p-1 text-muted-foreground hover:text-primary">
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          {widget.widget_type === "markdown" ? (
            <textarea
              className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground min-h-[60px]"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <input
              className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          <div className="flex gap-1">
            <button onClick={save} className="p-1 text-primary"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ) : widget.widget_type === "kpi" ? (
        <p className="text-2xl font-bold text-foreground font-mono">{widget.config.value || "—"}</p>
      ) : widget.widget_type === "markdown" ? (
        <p className="text-sm text-foreground whitespace-pre-wrap">{widget.config.content || ""}</p>
      ) : widget.widget_type === "iframe" && widget.config.url ? (
        <iframe src={widget.config.url} className="w-full h-40 rounded border border-border" title={widget.title} />
      ) : (
        <p className="text-xs text-muted-foreground italic">No URL configured</p>
      )}
    </div>
  );
}

// ─── Main Dashboard ───
export default function AgentDashboard({ userId }: { userId: string }) {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const store = useAgentStore(userId);

  const agent = store.agents.find((a) => a.id === agentId);

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground font-mono">Agent not found</p>
          <button onClick={() => navigate("/")} className="text-primary text-sm font-mono hover:underline">← Back to meeting</button>
        </div>
      </div>
    );
  }

  const accent = `hsl(${agent.accentColor})`;
  const avatar = getAvatar(agent);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border" style={{ borderBottomColor: accent, borderBottomWidth: "2px" }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-mono transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Meeting
          </button>

          {avatar ? (
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 shrink-0 flex items-center justify-center"
              style={{ borderColor: accent, backgroundColor: `hsl(${agent.accentColor} / 0.1)` }}>
              <img src={avatar} alt={agent.name} className="w-full h-full object-contain" />
            </div>
          ) : (
            <span className="text-2xl">{agent.emoji}</span>
          )}

          <div>
            <h1 className="text-xl font-mono font-bold text-foreground">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 py-6">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — Notes & Tasks */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-border bg-card p-4"
            >
              <TasksSection userId={userId} agentId={agent.id} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-lg border border-border bg-card p-4"
            >
              <WidgetsSection userId={userId} agentId={agent.id} />
            </motion.div>
          </div>

          {/* Right column — Notes */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-lg border border-border bg-card p-4"
            >
              <NotesSection userId={userId} agentId={agent.id} />
            </motion.div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-3">
        <p className="text-center text-[10px] text-muted-foreground tracking-wider font-mono">
          © 2026 TAILOREDU LLC — CONFIDENTIAL
        </p>
      </footer>
    </div>
  );
}
