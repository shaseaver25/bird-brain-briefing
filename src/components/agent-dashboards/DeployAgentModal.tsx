import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Database,
  FileCode,
  Loader2,
  MessageSquareCode,
  Rocket,
  Server,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AgentBuild {
  id: string;
  name: string;
  description: string;
  status: string;
  system_prompt: string | null;
  edge_function_code: string | null;
  widget_code: string | null;
  sql_migration: string | null;
}

interface DeployAgentModalProps {
  build: AgentBuild;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeployed: () => void;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function pascal(name: string) {
  return name.replace(/(?:^|\s|[-_])(\w)/g, (_, c) => c.toUpperCase()).replace(/\s+/g, "");
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <ClipboardCheck className="h-3 w-3 text-emerald-500" />
      ) : (
        <Clipboard className="h-3 w-3" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ArtifactBlock({
  icon: Icon,
  title,
  path,
  code,
}: {
  icon: typeof FileCode;
  title: string;
  path: string;
  code: string;
}) {
  if (!code?.trim()) return null;
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{title}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{path}</p>
          </div>
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="text-[10px] font-mono p-2 overflow-x-auto max-h-32 bg-background leading-relaxed whitespace-pre-wrap">
        {code.length > 600 ? code.slice(0, 600) + "\n…" : code}
      </pre>
    </div>
  );
}

export function DeployAgentModal({ build, open, onOpenChange, onDeployed }: DeployAgentModalProps) {
  const [sqlStatus, setSqlStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [sqlMessage, setSqlMessage] = useState<string>("");
  const [marking, setMarking] = useState(false);

  const slug = slugify(build.name);
  const pascalName = pascal(build.name);
  const hasSql = !!build.sql_migration?.trim();

  const lovablePrompt = `Please add a new agent named "${build.name}" to the project. Osprey already generated all the code — you just need to write these two files:

1. Create file: \`supabase/functions/${slug}/index.ts\` with this exact content:

\`\`\`typescript
${build.edge_function_code ?? "// (no edge function code generated)"}
\`\`\`

2. Create file: \`src/components/agent-dashboards/${pascalName}Widgets.tsx\` with this exact content:

\`\`\`typescript
${build.widget_code ?? "// (no widget code generated)"}
\`\`\`

After creating both files, please:
- Add a route for /dashboard/${slug} in src/App.tsx that renders ${pascalName}Widgets
- Add ${build.name} to the agent list / sidebar navigation if applicable
- Confirm the edge function deploys cleanly

Description of what this agent does: ${build.description}`;

  async function runMigration() {
    setSqlStatus("running");
    setSqlMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/osprey-run-migration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ buildId: build.id }),
        }
      );
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSqlStatus("success");
      setSqlMessage(body.message ?? "Migration executed successfully");
    } catch (err) {
      setSqlStatus("error");
      setSqlMessage(String(err instanceof Error ? err.message : err));
    }
  }

  async function markDeployed() {
    setMarking(true);
    const { error } = await supabase
      .from("agent_builds")
      .update({ status: "deployed", updated_at: new Date().toISOString() })
      .eq("id", build.id);
    setMarking(false);
    if (!error) {
      onDeployed();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-purple-500" />
            Deploy {build.name}
          </DialogTitle>
          <DialogDescription>
            Three steps to ship this agent. Edge functions can't write to your repo, so file
            creation needs Lovable AI — but the SQL runs right here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* STEP 1: SQL Migration */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Step 1</Badge>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Database className="h-4 w-4" />
                Run database migration
              </h3>
            </div>
            {!hasSql ? (
              <p className="text-xs text-muted-foreground pl-1">
                No new tables needed for this agent — skip to Step 2.
              </p>
            ) : (
              <div className="space-y-2">
                <ArtifactBlock
                  icon={Database}
                  title="migration.sql"
                  path="(runs against your database)"
                  code={build.sql_migration!}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={runMigration}
                    disabled={sqlStatus === "running" || sqlStatus === "success"}
                    className="gap-1.5"
                  >
                    {sqlStatus === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {sqlStatus === "success" && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {sqlStatus === "success" ? "Migration ran" : "Run SQL now"}
                  </Button>
                  {sqlStatus === "error" && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {sqlMessage}
                    </span>
                  )}
                  {sqlStatus === "success" && (
                    <span className="text-xs text-emerald-600">{sqlMessage}</span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* STEP 2: Code files */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Step 2</Badge>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <FileCode className="h-4 w-4" />
                Create code files via Lovable AI
              </h3>
            </div>
            <p className="text-xs text-muted-foreground pl-1">
              Copy the prompt below, paste it into Lovable chat. I'll create both files and wire up
              the route.
            </p>
            <div className="border border-purple-500/30 bg-purple-500/5 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <MessageSquareCode className="h-3.5 w-3.5 text-purple-500" />
                  One-click prompt for Lovable
                </span>
                <CopyButton text={lovablePrompt} label="Copy prompt" />
              </div>
              <pre className="text-[10px] font-mono p-2 overflow-x-auto max-h-32 bg-background border border-border rounded leading-relaxed whitespace-pre-wrap">
                {lovablePrompt.slice(0, 400)}…
              </pre>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Or copy each file manually
              </summary>
              <div className="space-y-2 mt-2">
                <ArtifactBlock
                  icon={Server}
                  title="Edge function"
                  path={`supabase/functions/${slug}/index.ts`}
                  code={build.edge_function_code ?? ""}
                />
                <ArtifactBlock
                  icon={FileCode}
                  title="Widget component"
                  path={`src/components/agent-dashboards/${pascalName}Widgets.tsx`}
                  code={build.widget_code ?? ""}
                />
              </div>
            </details>
          </section>

          {/* STEP 3: Mark deployed */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Step 3</Badge>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Mark as deployed
              </h3>
            </div>
            <p className="text-xs text-muted-foreground pl-1">
              Once Lovable confirms the files exist and the edge function deployed, mark this build
              as shipped.
            </p>
            <Button
              size="sm"
              onClick={markDeployed}
              disabled={marking || build.status === "deployed"}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {marking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Rocket className="h-3.5 w-3.5" />
              {build.status === "deployed" ? "Already deployed" : "Mark as deployed"}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
