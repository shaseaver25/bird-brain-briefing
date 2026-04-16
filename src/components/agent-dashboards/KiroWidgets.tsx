import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Activity, Rocket, Shield, Clock, Zap, AlertTriangle } from "lucide-react";

const SERVICES = [
  { service: "Supabase (PostgreSQL)", status: "healthy" as const, latency: "12ms", region: "us-east-1", details: "2.1GB storage, 847 rows/sec" },
  { service: "Staff Meeting API", status: "healthy" as const, latency: "340ms", region: "us-east-1", details: "Lambda, 512MB memory" },
  { service: "n8n Instance", status: "degraded" as const, latency: "890ms", region: "us-east-1", details: "78% memory, 14 active workflows" },
  { service: "Donor Agent Edge Fn", status: "healthy" as const, latency: "920ms", region: "us-east-1", details: "Avg 1.2s cold start" },
  { service: "ElevenLabs TTS", status: "healthy" as const, latency: "450ms", region: "external", details: "API quota: 62% remaining" },
  { service: "Anthropic API", status: "healthy" as const, latency: "1.1s", region: "external", details: "Claude Sonnet 4.6" },
];

const LAMBDA_METRICS = {
  invocations: { value: 2847, label: "Invocations (24h)", trend: "+12%" },
  errors: { value: 3, label: "Errors (24h)", trend: "-67%" },
  avgDuration: { value: 842, label: "Avg Duration (ms)", trend: "-15%" },
  throttles: { value: 0, label: "Throttles (24h)", trend: "0" },
};

const DEPLOY_LOGS = [
  { service: "donor-agent", version: "v2.3.1", status: "success" as const, timestamp: "Apr 16, 2:14 PM", deployer: "Shannon" },
  { service: "staff-meeting-api", version: "v1.8.0", status: "success" as const, timestamp: "Apr 15, 11:30 AM", deployer: "Kiro" },
  { service: "n8n-webhook-handler", version: "v0.4.2", status: "failed" as const, timestamp: "Apr 15, 9:45 AM", deployer: "Auto" },
  { service: "n8n-webhook-handler", version: "v0.4.1", status: "success" as const, timestamp: "Apr 15, 9:20 AM", deployer: "Auto" },
  { service: "onboarding-agent", version: "v1.2.0", status: "success" as const, timestamp: "Apr 14, 4:00 PM", deployer: "Shannon" },
];

const UPTIME_DATA = [
  { service: "Staff Meeting API", percent: 99.7, dots: genDots(99.7) },
  { service: "Donor Agent", percent: 99.9, dots: genDots(99.9) },
  { service: "Supabase", percent: 100, dots: genDots(100) },
  { service: "n8n", percent: 97.2, dots: genDots(97.2) },
];

function genDots(pct: number): boolean[] {
  return Array.from({ length: 30 }, (_, i) => pct >= 100 ? true : i >= 30 - Math.round((1 - pct / 100) * 30));
}

const STATUS_STYLES = {
  healthy: { dot: "bg-emerald-500", label: "Healthy", text: "text-emerald-500" },
  degraded: { dot: "bg-amber-500", label: "Degraded", text: "text-amber-500" },
  down: { dot: "bg-red-500", label: "Down", text: "text-red-500" },
};

export default function KiroWidgets() {
  const healthyCt = SERVICES.filter((s) => s.status === "healthy").length;
  const degradedCt = SERVICES.filter((s) => s.status === "degraded").length;

  const metricItems = [
    { ...LAMBDA_METRICS.invocations, icon: Zap, fmt: (v: number) => v.toLocaleString() },
    { ...LAMBDA_METRICS.errors, icon: AlertTriangle, fmt: (v: number) => v.toString() },
    { ...LAMBDA_METRICS.avgDuration, icon: Clock, fmt: (v: number) => `${v}ms` },
    { ...LAMBDA_METRICS.throttles, icon: Shield, fmt: (v: number) => v.toString() },
  ];

  return (
    <div className="space-y-6">
      {/* Lambda KPIs */}
      <div className="grid grid-cols-2 gap-4">
        {metricItems.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className="h-4 w-4 text-cyan-500" />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{m.fmt(m.value)}</p>
                <span className={`text-xs font-mono ${m.trend.startsWith("-") ? "text-emerald-500" : m.trend === "0" ? "text-muted-foreground" : "text-emerald-500"}`}>{m.trend}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Infrastructure Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Server className="h-5 w-5 text-cyan-500" />Infrastructure Health</CardTitle>
          <CardDescription>
            <span className="text-emerald-500 font-medium">{healthyCt} healthy</span>
            {degradedCt > 0 && <> &middot; <span className="text-amber-500 font-medium">{degradedCt} degraded</span></>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SERVICES.map((svc) => {
            const style = STATUS_STYLES[svc.status];
            return (
              <div key={svc.service} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{svc.service}</p>
                    {svc.status !== "healthy" && <Badge variant="outline" className={`text-[10px] ${style.text}`}>{style.label}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{svc.details}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono">{svc.latency}</p>
                  <p className="text-[10px] text-muted-foreground">{svc.region}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deploy Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Rocket className="h-5 w-5 text-cyan-500" />Recent Deployments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DEPLOY_LOGS.map((d, i) => (
              <div key={`${d.service}-${i}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium font-mono">{d.service}</p>
                    <span className="text-xs font-mono text-muted-foreground">{d.version}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{d.deployer} &middot; {d.timestamp}</p>
                </div>
                <Badge variant={d.status === "success" ? "outline" : "destructive"} className="text-[10px] shrink-0">{d.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-500" />Uptime (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {UPTIME_DATA.map((svc) => (
              <div key={svc.service} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{svc.service}</p>
                  <span className={`text-sm font-mono font-bold ${svc.percent >= 99.5 ? "text-emerald-500" : svc.percent >= 98 ? "text-amber-500" : "text-red-500"}`}>{svc.percent}%</span>
                </div>
                <div className="flex gap-0.5">
                  {svc.dots.map((up, i) => (
                    <div key={i} className={`h-4 flex-1 rounded-sm ${up ? "bg-emerald-500/60" : "bg-red-500/60"}`} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
