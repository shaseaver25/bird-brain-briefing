import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Calendar, CheckSquare, Mail, FileText, Share2, Clock,
  BarChart3, Layout, ThumbsUp, ThumbsDown, Linkedin, Twitter,
  Globe, Eye, Heart, MessageSquare, Repeat2, TrendingUp, RefreshCw,
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

const DRAFTS = [
  {
    id: "draft-1",
    title: "AI in Education — Thought Leadership",
    platform: "LinkedIn",
    status: "ready" as const,
    content: "Most schools aren't ready for AI. Not because the tech isn't there — it is. Because we're still designing around the wrong question.\n\nWe keep asking: 'How do we teach students to use AI?'\n\nThe better question: 'How do we redesign learning now that AI can do half of what we used to test for?'\n\nThree shifts I'm seeing work...",
  },
  {
    id: "draft-2",
    title: "Agent Workflows Thread",
    platform: "Twitter",
    status: "ready" as const,
    content: "🧵 I replaced my entire project management system with 5 AI agents.\n\nNot a joke. Not a demo. Running my actual business.\n\nHere's how it works (and what broke along the way):\n\n1/ First, the roster...",
  },
  {
    id: "draft-3",
    title: "TailoredU Case Study Teaser",
    platform: "LinkedIn",
    status: "needs_edit" as const,
    content: "When a small nonprofit came to us with 3 disconnected systems and a spreadsheet held together by prayers...\n\n[Draft needs client approval before publishing]",
  },
];

const PLATFORM_VARIANTS = {
  topic: "AI in Education — Thought Leadership",
  linkedin: "Most schools aren't ready for AI. Not because the tech isn't there — it is. Because we're still designing around the wrong question.\n\nWe keep asking: 'How do we teach students to use AI?'\n\nThe better question: 'How do we redesign learning now that AI can do half of what we used to test for?'\n\nThree shifts I'm seeing work:\n\n1. Assessment redesign — test thinking, not recall\n2. AI as tutor, not shortcut — pair programming for every subject\n3. Teacher as architect — designing learning experiences, not delivering content\n\nThe schools that get this right in the next 2 years will be a decade ahead.\n\n#AIinEducation #EdTech #TailoredU",
  twitter: "Most schools aren't ready for AI.\n\nNot because the tech isn't there.\n\nBecause we're asking the wrong question.\n\n❌ \"How do we teach students to use AI?\"\n✅ \"How do we redesign learning now that AI can do half of what we test for?\"\n\nThree shifts that actually work 🧵",
  generic: "Most schools aren't ready for AI — not because the technology isn't there, but because we're still designing around the wrong question. Instead of asking how to teach students to use AI, we should be asking how to redesign learning entirely. The schools that figure this out first will be a decade ahead.",
};

const POSTING_SCHEDULE = [
  { day: "Monday", time: "9:00 AM", platform: "LinkedIn", content: "AI in Education post", status: "scheduled" as const },
  { day: "Monday", time: "12:00 PM", platform: "Twitter", content: "Agent workflows thread", status: "scheduled" as const },
  { day: "Tuesday", time: "10:00 AM", platform: "LinkedIn", content: "TailoredU case study", status: "pending_approval" as const },
  { day: "Wednesday", time: "9:00 AM", platform: "Twitter", content: "Quick tip — automation", status: "draft" as const },
  { day: "Thursday", time: "11:00 AM", platform: "LinkedIn", content: "Co-Lab announcement teaser", status: "draft" as const },
  { day: "Friday", time: "9:00 AM", platform: "Generic", content: "Weekend reading roundup", status: "not_started" as const },
];

const ENGAGEMENT_METRICS = {
  impressions: { value: 12400, label: "Impressions", change: "+23%" },
  likes: { value: 347, label: "Likes", change: "+18%" },
  shares: { value: 89, label: "Shares / Reposts", change: "+45%" },
  comments: { value: 42, label: "Comments", change: "+12%" },
  clicks: { value: 156, label: "Link Clicks", change: "+31%" },
  followers: { value: 28, label: "New Followers", change: "+8%" },
};

const CONTENT_CALENDAR = [
  { week: "Apr 14–18", topic: "AI in Education", theme: "Thought Leadership", platforms: ["LinkedIn", "Twitter"], status: "active" as const },
  { week: "Apr 14–18", topic: "Agent Workflows", theme: "Behind the Scenes", platforms: ["Twitter"], status: "active" as const },
  { week: "Apr 21–25", topic: "TailoredU Case Study", theme: "Social Proof", platforms: ["LinkedIn"], status: "planned" as const },
  { week: "Apr 21–25", topic: "Co-Lab Teaser", theme: "Product Launch", platforms: ["LinkedIn", "Twitter"], status: "planned" as const },
  { week: "Apr 28–May 2", topic: "Conference Preview", theme: "Event Marketing", platforms: ["LinkedIn", "Twitter", "Email"], status: "idea" as const },
  { week: "Apr 28–May 2", topic: "Nonprofit Tech Stack", theme: "How-To", platforms: ["LinkedIn"], status: "idea" as const },
];

const SCHEDULE_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "text-emerald-500" },
  pending_approval: { label: "Pending Approval", color: "text-amber-500" },
  draft: { label: "Draft", color: "text-blue-500" },
  not_started: { label: "Not Started", color: "text-muted-foreground" },
};

const CALENDAR_STATUS_STYLES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "This Week", variant: "default" },
  planned: { label: "Planned", variant: "secondary" },
  idea: { label: "Idea", variant: "outline" },
};

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
    // Load cached data immediately for instant display, then refresh in background
    loadCachedData().then((hasCached) => {
      if (hasCached) setLoading(false);
      // Always kick off a fresh refresh (runs in background after showing cached)
      refresh();
    });
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

function DraftsApprovalWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          Drafts Ready for Approval
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {DRAFTS.map((draft) => (
          <div key={draft.id} className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-muted/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {draft.platform === "LinkedIn" && <Linkedin className="h-3.5 w-3.5 text-blue-600" />}
                {draft.platform === "Twitter" && <Twitter className="h-3.5 w-3.5 text-sky-500" />}
                <span className="text-sm font-medium">{draft.title}</span>
              </div>
              <Badge variant={draft.status === "ready" ? "default" : "secondary"} className="text-[10px]">
                {draft.status === "ready" ? "Ready" : "Needs Edit"}
              </Badge>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-4">{draft.content}</p>
            </div>
            <div className="px-4 py-2 border-t border-border flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><ThumbsUp className="h-3 w-3" /> Approve</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"><ThumbsDown className="h-3 w-3" /> Revise</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground ml-auto"><Eye className="h-3 w-3" /> Preview</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PlatformVariantsWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Share2 className="h-5 w-5 text-blue-500" />
          Platform Variants
        </CardTitle>
        <CardDescription>{PLATFORM_VARIANTS.topic}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="linkedin">
          <TabsList className="w-full">
            <TabsTrigger value="linkedin" className="flex-1 gap-1.5"><Linkedin className="h-3.5 w-3.5" /> LinkedIn</TabsTrigger>
            <TabsTrigger value="twitter" className="flex-1 gap-1.5"><Twitter className="h-3.5 w-3.5" /> Twitter</TabsTrigger>
            <TabsTrigger value="generic" className="flex-1 gap-1.5"><Globe className="h-3.5 w-3.5" /> Generic</TabsTrigger>
          </TabsList>
          <TabsContent value="linkedin" className="mt-4">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-sm whitespace-pre-line">{PLATFORM_VARIANTS.linkedin}</p>
            </div>
          </TabsContent>
          <TabsContent value="twitter" className="mt-4">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
              <p className="text-sm whitespace-pre-line">{PLATFORM_VARIANTS.twitter}</p>
            </div>
          </TabsContent>
          <TabsContent value="generic" className="mt-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm whitespace-pre-line">{PLATFORM_VARIANTS.generic}</p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PostingScheduleWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Posting Schedule
        </CardTitle>
        <CardDescription>This week</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {POSTING_SCHEDULE.map((slot) => {
          const ss = SCHEDULE_STATUS_STYLES[slot.status];
          return (
            <div key={`${slot.day}-${slot.platform}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <div className="w-24 shrink-0">
                <p className="text-xs font-medium">{slot.day}</p>
                <p className="text-[10px] text-muted-foreground">{slot.time}</p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">{slot.platform}</Badge>
              <p className="text-sm flex-1 truncate">{slot.content}</p>
              <span className={`text-[10px] font-medium shrink-0 ${ss.color}`}>{ss.label}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function EngagementAnalyticsWidget() {
  const entries = Object.entries(ENGAGEMENT_METRICS);
  const maxVal = Math.max(...entries.map(([, m]) => m.value));
  const iconMap: Record<string, typeof Eye> = { impressions: Eye, likes: Heart, shares: Repeat2, comments: MessageSquare, clicks: TrendingUp, followers: TrendingUp };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          Engagement Analytics
        </CardTitle>
        <CardDescription>Last 7 days across all platforms</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.map(([key, metric]) => {
          const Icon = iconMap[key] || Eye;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{metric.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{metric.value.toLocaleString()}</span>
                  <span className="text-xs text-emerald-500">{metric.change}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(metric.value / maxVal) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ContentCalendarWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Layout className="h-5 w-5 text-blue-500" />
          Content Calendar
        </CardTitle>
        <CardDescription>Topics, themes & timing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {CONTENT_CALENDAR.map((item) => {
          const style = CALENDAR_STATUS_STYLES[item.status];
          return (
            <div key={`${item.week}-${item.topic}`} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <div className="w-24 shrink-0">
                <p className="text-xs font-mono text-muted-foreground">{item.week}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.topic}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{item.theme}</span>
                  <span className="text-muted-foreground">&middot;</span>
                  {item.platforms.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] py-0">{p}</Badge>
                  ))}
                </div>
              </div>
              <Badge variant={style.variant} className="text-[10px] shrink-0">{style.label}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function WrenWidgets() {
  const { calendarItems, emailItems, loading, refreshing, lastUpdated, refresh } = useLiveWrenData();

  return (
    <div className="space-y-6">
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
      <DraftsApprovalWidget />
      <PlatformVariantsWidget />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PostingScheduleWidget />
        <EngagementAnalyticsWidget />
      </div>
      <ContentCalendarWidget />
    </div>
  );
}
