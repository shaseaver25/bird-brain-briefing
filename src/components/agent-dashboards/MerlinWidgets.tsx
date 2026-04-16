import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, AlertTriangle, Milestone, Clock } from "lucide-react";

const PROJECTS = [
  { project: "AvidEdge Chrome Extension", status: "red" as const, owner: "Shannon", completion: 35, lastUpdate: "Apr 10" },
  { project: "Co-Lab Membership Flow", status: "red" as const, owner: "Shannon", completion: 20, lastUpdate: "Apr 14" },
  { project: "Conference Stripe Integration", status: "yellow" as const, owner: "Kiro", completion: 60, lastUpdate: "Apr 15" },
  { project: "AI Whisperers Blog Redesign", status: "yellow" as const, owner: "Shannon", completion: 45, lastUpdate: "Apr 12" },
  { project: "n8n Webhook Monitoring", status: "yellow" as const, owner: "Kiro", completion: 50, lastUpdate: "Apr 14" },
  { project: "Wren Content Calendar v2", status: "green" as const, owner: "Wren", completion: 80, lastUpdate: "Apr 16" },
  { project: "Donor Agent Tool Expansion", status: "green" as const, owner: "Osprey", completion: 85, lastUpdate: "Apr 16" },
  { project: "Staff Meeting TTS Upgrade", status: "green" as const, owner: "Kiro", completion: 90, lastUpdate: "Apr 15" },
  { project: "TailoredU Landing Page", status: "green" as const, owner: "Shannon", completion: 70, lastUpdate: "Apr 16" },
];

const OVERDUE_ITEMS = [
  { task: "Chrome Extension discovery spec", project: "AvidEdge", daysOverdue: 4, assignee: "Shannon", blocker: "Waiting on Juliet's feedback on candidate fields" },
  { task: "Membership flow wireframes", project: "Co-Lab", daysOverdue: 2, assignee: "Shannon", blocker: "Pricing model not finalized" },
  { task: "API endpoint documentation", project: "Staff Meeting", daysOverdue: 1, assignee: "Kiro", blocker: "None — just needs time" },
];

const MILESTONES = [
  { milestone: "Conference Stripe webhooks", date: "Apr 17", project: "Conference Platform", completed: false },
  { milestone: "Wren content calendar v2", date: "Apr 18", project: "Agent Platform", completed: false },
  { milestone: "Co-Lab landing page copy", date: "Apr 18", project: "Co-Lab", completed: false },
  { milestone: "Donor Agent beta launch", date: "Apr 22", project: "CRM", completed: false },
  { milestone: "AvidEdge MVP demo", date: "Apr 25", project: "AvidEdge", completed: false },
  { milestone: "Blog redesign live", date: "Apr 14", project: "AI Whisperers", completed: true },
  { milestone: "TTS integration shipped", date: "Apr 12", project: "Staff Meeting", completed: true },
];

const STATUS_CONFIG = {
  red: { label: "Overdue", dot: "bg-red-500", text: "text-red-500" },
  yellow: { label: "At Risk", dot: "bg-amber-500", text: "text-amber-500" },
  green: { label: "On Track", dot: "bg-emerald-500", text: "text-emerald-500" },
};

export default function MerlinWidgets() {
  const counts = { red: PROJECTS.filter((p) => p.status === "red").length, yellow: PROJECTS.filter((p) => p.status === "yellow").length, green: PROJECTS.filter((p) => p.status === "green").length };
  const upcoming = MILESTONES.filter((m) => !m.completed);
  const completed = MILESTONES.filter((m) => m.completed);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><ClipboardList className="h-5 w-5 text-amber-500" />Project Status Board</CardTitle>
          <CardDescription className="flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {counts.red} overdue</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {counts.yellow} at risk</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {counts.green} on track</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROJECTS.map((project) => {
            const config = STATUS_CONFIG[project.status];
            return (
              <div key={project.project} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className={`w-3 h-3 rounded-full shrink-0 ${config.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{project.project}</p>
                  <p className="text-xs text-muted-foreground">{project.owner} &middot; Updated {project.lastUpdate}</p>
                </div>
                <div className="w-24 space-y-1">
                  <Progress value={project.completion} className="h-2" />
                  <p className="text-[10px] text-right text-muted-foreground">{project.completion}%</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${config.text} shrink-0`}>{config.label}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Overdue Items</CardTitle>
            <CardDescription>{OVERDUE_ITEMS.length} items past deadline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {OVERDUE_ITEMS.map((item) => (
              <div key={item.task} className="p-3 rounded-md bg-red-500/5 border border-red-500/20">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.task}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.project} &middot; {item.assignee}</p>
                  </div>
                  <Badge variant="destructive" className="text-[10px] shrink-0">{item.daysOverdue}d overdue</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">Blocker: {item.blocker}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Milestone className="h-5 w-5 text-amber-500" />Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
              {upcoming.map((m) => (
                <div key={m.milestone} className="relative">
                  <div className="absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 border-amber-500 bg-background" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-14">{m.date}</span>
                    <span className="text-sm font-medium">{m.milestone}</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-16">{m.project}</p>
                </div>
              ))}
              {completed.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider"><Clock className="h-3 w-3 inline mr-1" />Recently completed</p>
                  {completed.map((m) => (
                    <div key={m.milestone} className="relative mb-3">
                      <div className="absolute -left-4 top-1.5 w-3 h-3 rounded-full bg-emerald-500" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground w-14 line-through">{m.date}</span>
                        <span className="text-sm text-muted-foreground line-through">{m.milestone}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
