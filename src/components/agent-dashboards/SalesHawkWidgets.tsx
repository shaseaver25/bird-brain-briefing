import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DollarSign, TrendingUp, Users, Clock, AlertCircle, Target } from "lucide-react";

const PIPELINE_STAGES = [
  { stage: "Prospect", count: 12, value: 18000, color: "#94a3b8" },
  { stage: "Discovery", count: 8, value: 24000, color: "#60a5fa" },
  { stage: "Proposal", count: 5, value: 35000, color: "#a78bfa" },
  { stage: "Negotiation", count: 3, value: 27000, color: "#f59e0b" },
  { stage: "Closing", count: 2, value: 15000, color: "#10b981" },
];

const TOP_LEADS = [
  { name: "University of MN Extension", company: "UMN", score: 92, lastActivity: "2 hours ago", source: "Website" },
  { name: "Juliet Fox referral", company: "Metro Creative", score: 87, lastActivity: "1 day ago", source: "Referral" },
  { name: "Hennepin County HR", company: "Hennepin County", score: 74, lastActivity: "3 days ago", source: "Event" },
  { name: "St. Paul Chamber", company: "Chamber of Commerce", score: 68, lastActivity: "5 days ago", source: "Cold outreach" },
  { name: "Allina Health Foundation", company: "Allina Health", score: 61, lastActivity: "1 week ago", source: "LinkedIn" },
];

const DEAL_KPIS = { totalPipeline: 119000, weightedValue: 47200, avgDealSize: 8500, closingThisMonth: 15000 };

const FOLLOW_UPS = [
  { contact: "Sarah Chen", company: "Metro Transit", type: "Proposal follow-up", dueDate: "Apr 13", isOverdue: true, daysOverdue: 3 },
  { contact: "James Wright", company: "Hennepin County", type: "Discovery call", dueDate: "Apr 11", isOverdue: true, daysOverdue: 5 },
  { contact: "Maria Lopez", company: "UMN Extension", type: "Send case study", dueDate: "Apr 17", isOverdue: false, daysOverdue: 0 },
  { contact: "Tom Anderson", company: "Cancer Society", type: "Check-in call", dueDate: "Apr 18", isOverdue: false, daysOverdue: 0 },
  { contact: "Rachel Kim", company: "St. Paul Schools", type: "Proposal draft", dueDate: "Apr 19", isOverdue: false, daysOverdue: 0 },
];

function DealValuesWidget() {
  const kpis = [
    { label: "Total Pipeline", value: DEAL_KPIS.totalPipeline, icon: DollarSign },
    { label: "Weighted Value", value: DEAL_KPIS.weightedValue, icon: TrendingUp },
    { label: "Avg Deal Size", value: DEAL_KPIS.avgDealSize, icon: Target },
    { label: "Closing This Month", value: DEAL_KPIS.closingThisMonth, icon: Clock },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-2xl font-bold">${kpi.value.toLocaleString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PipelineFunnelWidget() {
  const maxValue = Math.max(...PIPELINE_STAGES.map((s) => s.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Target className="h-5 w-5 text-emerald-500" />Pipeline Funnel</CardTitle>
        <CardDescription>{PIPELINE_STAGES.reduce((s, p) => s + p.count, 0)} total opportunities</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.stage} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stage.stage}</span>
              <span className="text-muted-foreground">{stage.count} deals &middot; ${stage.value.toLocaleString()}</span>
            </div>
            <div className="h-6 rounded-md bg-muted overflow-hidden">
              <div className="h-full rounded-md transition-all" style={{ width: `${(stage.value / maxValue) * 100}%`, backgroundColor: stage.color }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LeadScoresWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5 text-emerald-500" />Top Leads</CardTitle>
        <CardDescription>Ranked by lead score</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {TOP_LEADS.map((lead) => (
          <div key={lead.name} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{lead.name}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">{lead.source}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{lead.company} &middot; {lead.lastActivity}</p>
            </div>
            <div className="w-24 space-y-1">
              <Progress value={lead.score} className="h-2" />
              <p className="text-xs text-right font-mono text-muted-foreground">{lead.score}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FollowUpQueueWidget() {
  const overdue = FOLLOW_UPS.filter((f) => f.isOverdue);
  const upcoming = FOLLOW_UPS.filter((f) => !f.isOverdue);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-emerald-500" />Follow-Up Queue</CardTitle>
        <CardDescription>
          {overdue.length > 0 && <span className="text-destructive font-medium">{overdue.length} overdue</span>}
          {overdue.length > 0 && upcoming.length > 0 && " · "}
          {upcoming.length} upcoming
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {FOLLOW_UPS.map((item) => (
          <div key={`${item.contact}-${item.type}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            {item.isOverdue && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.contact}</p>
              <p className="text-xs text-muted-foreground">{item.company} &middot; {item.type}</p>
            </div>
            <div className="text-right shrink-0">
              {item.isOverdue ? (
                <Badge variant="destructive" className="text-[10px]">{item.daysOverdue}d overdue</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">{item.dueDate}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function SalesHawkWidgets() {
  return (
    <div className="space-y-6">
      <DealValuesWidget />
      <PipelineFunnelWidget />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeadScoresWidget />
        <FollowUpQueueWidget />
      </div>
    </div>
  );
}
