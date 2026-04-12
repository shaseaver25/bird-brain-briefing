import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Radio, Send } from "lucide-react";
import AgentPanel, { AgentPanelHandle } from "@/components/AgentPanel";
import SettingsPanel from "@/components/SettingsPanel";
import { useAgentStore } from "@/hooks/useAgentStore";

export default function Index() {
  const store = useAgentStore();
  const [meetingActive, setMeetingActive] = useState(false);
  const [askAllText, setAskAllText] = useState("");
  const panelRefs = useRef<Map<string, AgentPanelHandle>>(new Map());

  const setRef = useCallback((id: string, handle: AgentPanelHandle | null) => {
    if (handle) panelRefs.current.set(id, handle);
    else panelRefs.current.delete(id);
  }, []);

  const handleAskAll = () => {
    const text = askAllText.trim();
    if (!text || !meetingActive) return;
    setAskAllText("");
    store.agents.forEach((agent) => {
      const handle = panelRefs.current.get(agent.id);
      handle?.sendMessage(text);
    });
  };

  // Determine grid columns based on agent count
  const count = store.agents.length;
  const gridCols =
    count <= 1
      ? "grid-cols-1"
      : count === 2
      ? "grid-cols-1 lg:grid-cols-2"
      : count === 3
      ? "grid-cols-1 lg:grid-cols-3"
      : count === 4
      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      : count === 5
      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-xl font-mono font-bold text-foreground tracking-tight">
                Staff Meeting
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                TailoredU LLC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SettingsPanel
              agents={store.agents}
              apiKey={store.apiKey}
              onAddAgent={store.addAgent}
              onUpdateAgent={store.updateAgent}
              onRemoveAgent={store.removeAgent}
              onSetApiKey={store.setApiKey}
              onExport={store.exportConfig}
              onImport={store.importConfig}
            />

            <button
              onClick={() => setMeetingActive(!meetingActive)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-sm font-medium transition-all duration-300"
              style={{
                backgroundColor: meetingActive ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                color: meetingActive ? "hsl(var(--destructive-foreground))" : "hsl(var(--primary-foreground))",
              }}
            >
              {meetingActive ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  End Meeting
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Meeting
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Status bar + Ask All */}
      <div className="border-b border-border px-6 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${meetingActive ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
            />
            <span className="text-xs text-muted-foreground font-mono">
              {meetingActive ? "MEETING IN SESSION" : "STANDBY"}
            </span>
          </div>

          {meetingActive && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskAll();
              }}
              className="flex-1 flex items-center gap-2 max-w-xl ml-auto"
            >
              <input
                className="flex-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Ask all agents..."
                value={askAllText}
                onChange={(e) => setAskAllText(e.target.value)}
              />
              <button
                type="submit"
                disabled={!askAllText.trim()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                Ask All
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Agent Panels */}
      <main className="flex-1 p-6">
        <div className={`max-w-[1800px] mx-auto grid ${gridCols} gap-6`}>
          {store.agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <AgentPanel
                ref={(handle) => setRef(agent.id, handle)}
                agent={agent}
                isActive={meetingActive}
                apiKey={store.apiKey}
              />
            </motion.div>
          ))}
          {store.agents.length === 0 && (
            <div className="col-span-full text-center py-20">
              <p className="text-muted-foreground font-mono">No agents configured.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Open settings to add your first agent.
              </p>
            </div>
          )}
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
