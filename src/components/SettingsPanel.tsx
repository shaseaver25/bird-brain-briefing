import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Settings, Plus, Trash2, Download, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { AgentConfig } from "@/hooks/useAgentStore";

interface SettingsPanelProps {
  agents: AgentConfig[];
  apiKey: string;
  onAddAgent: (agent: Omit<AgentConfig, "id">) => void;
  onUpdateAgent: (id: string, updates: Partial<AgentConfig>) => void;
  onRemoveAgent: (id: string) => void;
  onSetApiKey: (key: string) => void;
  onExport: () => string;
  onImport: (json: string) => boolean;
}

const COLOR_PRESETS = [
  { label: "Teal", value: "173 80% 40%" },
  { label: "Amber", value: "35 90% 55%" },
  { label: "Purple", value: "260 60% 60%" },
  { label: "Rose", value: "350 80% 55%" },
  { label: "Blue", value: "210 80% 55%" },
  { label: "Green", value: "145 70% 40%" },
  { label: "Orange", value: "25 95% 53%" },
  { label: "Cyan", value: "190 80% 45%" },
];

const EMPTY_AGENT: Omit<AgentConfig, "id"> = {
  name: "",
  emoji: "🦅",
  role: "",
  voiceId: "",
  apiUrl: "",
  accentColor: "210 80% 55%",
};

const inputClass =
  "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function AgentForm({
  agent,
  onChange,
  children,
}: {
  agent: Omit<AgentConfig, "id"> & { id?: string };
  onChange: (field: string, value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 p-3 rounded-md bg-muted">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          className={inputClass}
          placeholder="Agent name"
          value={agent.name}
          onChange={(e) => onChange("name", e.target.value)}
        />
        <input
          className={inputClass + " w-16 text-center text-lg"}
          placeholder="🦅"
          value={agent.emoji}
          onChange={(e) => onChange("emoji", e.target.value)}
        />
      </div>
      <input
        className={inputClass}
        placeholder="Role (e.g. Sales Lead)"
        value={agent.role}
        onChange={(e) => onChange("role", e.target.value)}
      />
      <input
        className={inputClass}
        placeholder="API endpoint URL"
        value={agent.apiUrl}
        onChange={(e) => onChange("apiUrl", e.target.value)}
      />
      <input
        className={inputClass}
        placeholder="ElevenLabs Voice ID"
        value={agent.voiceId}
        onChange={(e) => onChange("voiceId", e.target.value)}
      />
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Accent color</label>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              onClick={() => onChange("accentColor", c.value)}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: `hsl(${c.value})`,
                borderColor: agent.accentColor === c.value ? "hsl(var(--foreground))" : "transparent",
              }}
              title={c.label}
            />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPanel({
  agents,
  apiKey,
  onAddAgent,
  onUpdateAgent,
  onRemoveAgent,
  onSetApiKey,
  onExport,
  onImport,
}: SettingsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAgent, setNewAgent] = useState(EMPTY_AGENT);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState(false);

  const handleAddAgent = () => {
    if (!newAgent.name.trim()) return;
    onAddAgent(newAgent);
    setNewAgent(EMPTY_AGENT);
    setShowNewForm(false);
  };

  const handleExport = () => {
    const json = onExport();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "staff-meeting-roster.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const ok = onImport(importText);
    if (ok) {
      setImportText("");
      setImportError(false);
    } else {
      setImportError(true);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Settings className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent className="bg-card border-border overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-foreground font-mono">Settings</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* API Key */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono block mb-2">
              ElevenLabs API Key
            </label>
            <input
              type="password"
              className={inputClass}
              placeholder="Enter API key..."
              value={apiKey}
              onChange={(e) => onSetApiKey(e.target.value)}
            />
          </div>

          {/* Agent Roster */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                Agent Roster ({agents.length})
              </label>
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {showNewForm && (
              <div className="mb-3">
                <AgentForm
                  agent={newAgent}
                  onChange={(f, v) => setNewAgent((a) => ({ ...a, [f]: v }))}
                >
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleAddAgent}
                      disabled={!newAgent.name.trim()}
                      className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
                    >
                      Add Agent
                    </button>
                    <button
                      onClick={() => {
                        setShowNewForm(false);
                        setNewAgent(EMPTY_AGENT);
                      }}
                      className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </AgentForm>
              </div>
            )}

            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `hsl(${agent.accentColor})` }}
                    />
                    <span className="text-sm font-medium text-foreground flex-1">
                      {agent.emoji} {agent.name}
                    </span>
                    <span className="text-xs text-muted-foreground mr-2">{agent.role}</span>
                    {expandedId === agent.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {expandedId === agent.id && (
                    <div className="border-t border-border">
                      <AgentForm
                        agent={agent}
                        onChange={(f, v) => onUpdateAgent(agent.id, { [f]: v })}
                      >
                        <div className="px-0 pt-1">
                          <button
                            onClick={() => {
                              onRemoveAgent(agent.id);
                              setExpandedId(null);
                            }}
                            className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove agent
                          </button>
                        </div>
                      </AgentForm>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Import / Export */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-mono block mb-2">
              Import / Export
            </label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary/80"
              >
                <Download className="h-4 w-4" /> Export JSON
              </button>
            </div>
            <textarea
              className={inputClass + " h-24 resize-none font-mono text-xs"}
              placeholder="Paste JSON config here to import..."
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(false);
              }}
            />
            {importError && (
              <p className="text-xs text-destructive mt-1">Invalid JSON format.</p>
            )}
            {importText && (
              <button
                onClick={handleImport}
                className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                <Upload className="h-4 w-4" /> Import
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}