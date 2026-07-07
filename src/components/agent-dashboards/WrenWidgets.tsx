import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, CheckSquare, Mail, TrendingUp, RefreshCw,
  Mic, Volume2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// --- Types ---

interface CalendarItem {
  date: string;
  time: string;
  title: string;
  type: "meeting" | "deadline";
}

interface EmailItem {
  from: string;
  subject: string;
  flagReason: string;
  receivedAt: string;
}

// --- Static Mock Data (non-Google widgets) ---

const PENDING_TASKS = [
  { title: "Review SalesHawk's UMN proposal draft", priority: "high" as const, assignee: "Shannon", dueDate: "Today" },
  { title: "Approve content calendar for next week", priority: "medium" as const, assignee: "Shannon", dueDate: "Apr 17" },
  { title: "Send Juliet agenda for AvidEdge meeting", priority: "high" as const, assignee: "Wren", dueDate: "Today" },
  { title: "Schedule Co-Lab brainstorm session", priority: "low" as const, assignee: "Wren", dueDate: "Apr 18" },
  { title: "Draft thank-you email for Cancer Society donation", priority: "medium" as const, assignee: "Wren", dueDate: "Apr 17" },
];

// Social media widgets (drafts, variants, schedule, engagement, content calendar)
// moved to MockingJay's dashboard — he owns everything social.

// --- Live data hook ---

function useLiveWrenData() {
  const [calendarItems, setCalendarItems] = useState<CalendarItem[] | null>(null);
  const [emailItems, setEmailItems] = useState<EmailItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadCachedData() {
    const { data } = await supabase
      .from("widget_data")
      .select("widget_key, data, expires_at, updated_at")
      .eq("agent_id", "wren")
      .in("widget_key", ["calendar_overview", "flagged_emails"]);

    if (data?.length) {
      for (const row of data) {
        if (row.widget_key === "calendar_overview") {
          const d = row.data as { items?: CalendarItem[] };
          if (d?.items) setCalendarItems(d.items);
        }
        if (row.widget_key === "flagged_emails") {
          const d = row.data as { emails?: EmailItem[] };
          if (d?.emails) setEmailItems(d.emails);
        }
        if (row.updated_at) setLastUpdated(new Date(row.updated_at));
      }
      return true;
    }
    return false;
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-dashboard", {
        body: { agent_id: "wren" },
      });
      if (error) throw error;
      if (data?.calendar) setCalendarItems(data.calendar);
      if (data?.emails) setEmailItems(data.emails);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("refresh-dashboard failed:", err);
      // Fall back to cached data if refresh fails
      await loadCachedData();
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    // Mount-only: show cached data immediately, then refresh in the background.
    // loadCachedData/refresh are stable in intent here; re-running on their
    // identity would loop, so this initializer runs once.
    loadCachedData().then((hasCached) => {
      if (hasCached) setLoading(false);
      refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { calendarItems, emailItems, loading, refreshing, lastUpdated, refresh };
}

// --- Live Widgets ---

function CalendarOverviewWidget({
  items,
  loading,
  refreshing,
  onRefresh,
  lastUpdated,
}: {
  items: CalendarItem[] | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Calendar Overview
          </CardTitle>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Refresh from Google Calendar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <CardDescription>
          {loading ? "Loading…" : lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            : "Next 3 days"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : !items?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No upcoming events</p>
        ) : (
          items.map((item) => (
            <div key={`${item.date}-${item.title}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <div className="w-16 text-right shrink-0">
                <p className="text-xs font-mono text-muted-foreground">{item.date}</p>
                <p className="text-xs font-mono font-medium">{item.time}</p>
              </div>
              <div className={`w-1 h-8 rounded-full ${item.type === "meeting" ? "bg-blue-500" : "bg-red-500"}`} />
              <p className="text-sm flex-1">{item.title}</p>
              <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FlaggedEmailsWidget({
  emails,
  loading,
  refreshing,
  onRefresh,
}: {
  emails: EmailItem[] | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-500" />
            Flagged Emails
          </CardTitle>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Refresh from Gmail"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <CardDescription>
          {loading ? "Loading…" : emails?.length ? `${emails.length} need attention` : "All clear"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : !emails?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">Inbox is clear</p>
        ) : (
          emails.map((email) => (
            <div key={email.subject} className="p-3 rounded-md bg-red-500/5 border border-red-500/20">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{email.from}</p>
                  <p className="text-xs text-muted-foreground">{email.subject}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{email.receivedAt}</span>
              </div>
              <p className="text-xs text-red-500 mt-1">{email.flagReason}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// --- Static Widgets (unchanged) ---

function PendingTasksWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-blue-500" />
          Pending Tasks
        </CardTitle>
        <CardDescription>{PENDING_TASKS.length} action items</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {PENDING_TASKS.map((task) => (
          <div key={task.title} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${
              task.priority === "high" ? "bg-red-500" : task.priority === "medium" ? "bg-amber-500" : "bg-blue-500"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{task.title}</p>
              <p className="text-xs text-muted-foreground">{task.assignee}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">{task.dueDate}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}






// --- Morning Briefing Hook ---

function useMorningBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [compiledAt, setCompiledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadCached(): Promise<string | null> {
    const { data } = await supabase
      .from("widget_data")
      .select("data, updated_at")
      .eq("agent_id", "wren")
      .eq("widget_key", "morning_briefing")
      .maybeSingle();
    if (data?.data) {
      const d = data.data as { briefing?: string };
      if (d?.briefing) {
        setBriefing(d.briefing);
        if (data.updated_at) setCompiledAt(new Date(data.updated_at));
        return d.briefing;
      }
    }
    return null;
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function compile() {
    setCompiling(true);
    stopPolling();
    const prevAt = compiledAt?.toISOString() ?? null;
    try {
      await supabase.functions.invoke("wren-briefing");
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        const { data } = await supabase
          .from("widget_data")
          .select("data, updated_at")
          .eq("agent_id", "wren")
          .eq("widget_key", "morning_briefing")
          .maybeSingle();
        if (data?.updated_at && data.updated_at !== prevAt) {
          const d = data.data as { briefing?: string };
          if (d?.briefing) setBriefing(d.briefing);
          setCompiledAt(new Date(data.updated_at));
          stopPolling();
          setCompiling(false);
        }
        if (attempts >= 16) { stopPolling(); setCompiling(false); }
      }, 15000);
    } catch (err) {
      console.error("wren-briefing failed:", err);
      setCompiling(false);
    }
  }

  useEffect(() => {
    loadCached().finally(() => setLoading(false));
    return () => stopPolling();
  }, []);

  return { briefing, compiledAt, loading, compiling, compile };
}

// --- Morning Briefing Widget ---

function MorningBriefingWidget() {
  const { briefing, compiledAt, loading, compiling, compile } = useMorningBriefing();
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function speakBriefing() {
    if (!briefing) return;
    setSpeaking(true);
    try {
      // Use ElevenLabs via the browser if available — fallback to Web Speech API
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(briefing);
        utterance.rate = 0.95;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      setSpeaking(false);
    }
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return (
    <Card className="border-blue-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Mic className="h-5 w-5 text-blue-500" />
            Morning Briefing
          </CardTitle>
          <div className="flex items-center gap-2">
            {compiledAt && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {compiledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT
              </span>
            )}
            <button
              onClick={compile}
              disabled={compiling}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${compiling ? "animate-spin" : ""}`} />
              {compiling ? "Compiling…" : "Refresh"}
            </button>
          </div>
        </div>
        <CardDescription>
          {loading ? "Loading…" : compiling ? "Wren is reading your calendar, emails, and agent reports…" : briefing ? "Ready to speak" : "No briefing yet — click Refresh"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || compiling ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-4 rounded bg-muted animate-pulse" style={{ width: `${90 - i * 10}%` }} />)}
          </div>
        ) : briefing ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-foreground">{briefing}</p>
            <div className="flex items-center gap-2">
              {speaking ? (
                <button
                  onClick={stopSpeaking}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                >
                  <Volume2 className="h-3.5 w-3.5 animate-pulse" /> Stop
                </button>
              ) : (
                <button
                  onClick={speakBriefing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Read Aloud
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No briefing compiled yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Runs automatically at 7:05 AM, or click Refresh.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Weekly Retro Widget ---

function WeeklyRetroWidget() {
  const [retro, setRetro] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ leadCount?: number; bySource?: Record<string, number>; compiledAt?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadCached() {
    const { data } = await supabase
      .from("widget_data")
      .select("data, updated_at")
      .eq("agent_id", "wren")
      .eq("widget_key", "weekly_retro")
      .maybeSingle();
    const d = data?.data as { retro?: string; lead_count?: number; by_source?: Record<string, number> } | undefined;
    if (d?.retro) {
      setRetro(d.retro);
      setMeta({ leadCount: d.lead_count, bySource: d.by_source, compiledAt: data?.updated_at ?? undefined });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCached();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function compile() {
    setCompiling(true);
    if (pollRef.current) clearInterval(pollRef.current);
    const prev = meta?.compiledAt ?? null;
    try {
      await supabase.functions.invoke("wren-retro");
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        const { data } = await supabase
          .from("widget_data")
          .select("data, updated_at")
          .eq("agent_id", "wren")
          .eq("widget_key", "weekly_retro")
          .maybeSingle();
        if ((data?.updated_at && data.updated_at !== prev) || attempts > 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          await loadCached();
          setCompiling(false);
        }
      }, 3000);
    } catch (err) {
      console.error("wren-retro failed:", err);
      setCompiling(false);
    }
  }

  return (
    <Card className="border-emerald-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Weekly Retro
          </CardTitle>
          <button
            onClick={compile}
            disabled={compiling}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${compiling ? "animate-spin" : ""}`} />
            {compiling ? "Compiling…" : "Run retro"}
          </button>
        </div>
        <CardDescription>
          {compiling ? "Wren is reviewing the week's agent activity and lead sources…"
            : retro ? `${meta?.leadCount ?? 0} leads this week${meta?.bySource ? " · " + Object.entries(meta.bySource).map(([s, n]) => `${n} ${s.replace("_", " ")}`).join(", ") : ""}`
            : "What closed, what stalled, where leads came from — click Run retro"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || compiling ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-4 rounded bg-muted animate-pulse" style={{ width: `${92 - i * 8}%` }} />)}
          </div>
        ) : retro ? (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{retro}</p>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No retro yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Best run Friday afternoon, or any time to see the week so far.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WrenWidgets() {
  const { calendarItems, emailItems, loading, refreshing, lastUpdated, refresh } = useLiveWrenData();

  return (
    <div className="space-y-6">
      <MorningBriefingWidget />
      <WeeklyRetroWidget />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CalendarOverviewWidget
          items={calendarItems}
          loading={loading}
          refreshing={refreshing}
          onRefresh={refresh}
          lastUpdated={lastUpdated}
        />
        <PendingTasksWidget />
      </div>
      <FlaggedEmailsWidget
        emails={emailItems}
        loading={loading}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </div>
  );
}
