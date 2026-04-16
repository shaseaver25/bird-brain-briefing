import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Bot, GitBranch, Hammer, ArrowRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const AGENT_DESIGNS = [
  { name: "Donor Intelligence Agent", description: "Full CRM search, donor profiling, event matching", status: "testing" as const, tools: 8, lastUpdated: "2 hours ago" },
  { name: "Event Coordinator Agent", description: "Registration management, venue logistics, speaker scheduling", status: "designing" as const, tools: 5, lastUpdated: "1 day ago" },
  { name: "Grant Writer Assistant", description: "Proposal outlines, compliance checks, deadline tracking", status: "designing" as const, tools: 4, lastUpdated: "3 days ago" },
  { name: "Onboarding Agent", description: "New client intake, document collection, welcome sequences", status: "deployed" as const, tools: 6, lastUpdated: "1 week ago" },
  { name: "Content Repurposer", description: "Takes long-form content and creates platform-specific variants", status: "deployed" as const, tools: 3, lastUpdated: "2 weeks ago" },
];

const WORKFLOWS = [
  { name: "Donor Intelligence Pipeline", steps: ["User Query", "Intent Classification", "Tool Selection", "Supabase Query", "Response Synthesis"], status: "active" as const },
  { name: "Event Registration Flow", steps: ["Trigger: Form Submit", "Validate Fields", "Create Constituent", "Register for Event", "Send Confirmation"], status: "draft" as const },
  { name: "Client Onboarding Sequence", steps: ["Welcome Email", "Wait 1 day", "Intake Form", "Document Upload", "Kick-off Calendar"], status: "active" as const },
];

const BUILDS = [
  { agentName: "Donor Intelligence Agent", version: "v2.4", progress: 85, status: "building" as const, eta: "~30 min" },
  { agentName: "Event Coordinator Agent", version: "v0.1", progress: 25, status: "building" as const, eta: "~2 days" },
  { agentName: "Onboarding Agent", version: "v1.2", progress: 100, status: "success" as const, eta: "Deployed" },
  { agentName: "Content Repurposer", version: "v1.0", progress: 100, status: "success" as const, eta: "Deployed" },
  { agentName: "Grant Writer Assistant", version: "v0.0", progress: 0, status: "pending" as const, eta: "Not started" },
];

const STATUS_STYLES = {
  designing: { label: "Designing", variant: "outline" as const, icon: Clock },
  testing: { label: "Testing", variant: "secondary" as const, icon: AlertCircle },
  deployed: { label: "Deployed", variant: "default" as const, icon: CheckCircle2 },
};

const BUILD_COLORS = { building: "text-purple-500", success: "text-emerald-500", failed: "text-red-500", pending: "text-muted-foreground" };

export default function OspreyWidgets() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Bot className="h-5 w-5 text-purple-500" />Active Agent Designs</CardTitle>
          <CardDescription>{AGENT_DESIGNS.length} agents in the portfolio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {AGENT_DESIGNS.map((agent) => {
            const style = STATUS_STYLES[agent.status];
            const StatusIcon = style.icon;
            return (
              <div key={agent.name} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${agent.status === "deployed" ? "text-emerald-500" : agent.status === "testing" ? "text-purple-500" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{agent.name}</p>
                    <Badge variant={style.variant} className="text-[10px]">{style.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{agent.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{agent.tools} tools &middot; Updated {agent.lastUpdated}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><GitBranch className="h-5 w-5 text-purple-500" />Workflow Blueprints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {WORKFLOWS.map((wf) => (
            <div key={wf.name}>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-medium">{wf.name}</p>
                <Badge variant={wf.status === "active" ? "default" : "outline"} className="text-[10px]">{wf.status}</Badge>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {wf.steps.map((step, i) => (
                  <div key={step} className="flex items-center gap-1 shrink-0">
                    <div className="px-2.5 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-xs font-medium whitespace-nowrap">{step}</div>
                    {i < wf.steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Hammer className="h-5 w-5 text-purple-500" />Build Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {BUILDS.map((build) => (
            <div key={build.agentName} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{build.agentName}</p>
                  <span className="text-xs font-mono text-muted-foreground">{build.version}</span>
                </div>
                <span className={`text-xs ${BUILD_COLORS[build.status]}`}>{build.eta}</span>
              </div>
              <Progress value={build.progress} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
