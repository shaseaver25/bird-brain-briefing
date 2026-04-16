import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Radio, Send, Mic, Volume2, VolumeX, RotateCcw, Square, LogOut } from "lucide-react";
import AgentPanel, { AgentPanelHandle } from "@/components/AgentPanel";
import SettingsPanel from "@/components/SettingsPanel";
import { useAgentStore } from "@/hooks/useAgentStore";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { resetSession } from "@/lib/agent-api";
import { supabase } from "@/integrations/supabase/client";

interface IndexProps {
  userId: string;
}

export default function Index({ userId }: IndexProps) {
  const store = useAgentStore(userId);
  const [meetingActive, setMeetingActive] = useState(false);
  const [askAllText, setAskAllText] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [silentMode, setSilentMode] = useState(false);
  const [meetingParticipants, setMeetingParticipants] = useState<Set<string>>(
    () => new Set(store.agents.map((a) => a.id))
  );
  const panelRefs = useRef<Map<string, AgentPanelHandle>>(new Map());
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
  const prevTranscriptRef = useRef("");
  const abortRef = useRef(false);

  const setRef = useCallback((id: string, handle: AgentPanelHandle | null) => {
    if (handle) panelRefs.current.set(id, handle);
    else panelRefs.current.delete(id);
  }, []);

  // Detect if user is addressing a specific agent by name
  const detectTargetAgents = useCallback((text: string) => {
    const participating = store.agents.filter(
      (a) => meetingParticipants.has(a.id) && a.apiUrl
    );
    const lower = text.toLowerCase();
    const matched = participating.filter((a) => lower.includes(a.name.toLowerCase()));
    return matched.length > 0 ? matched : participating;
  }, [store.agents, meetingParticipants]);

  // Send message to targeted agents in parallel, then speak in order
  // Queue for TTS playback in speak-order
  const ttsQueueRef = useRef<{ agent: typeof store.agents[0]; handle: AgentPanelHandle; reply: string }[]>([]);
  const ttsPlayingRef = useRef(false);

  const processTtsQueue = useCallback(async () => {
    if (ttsPlayingRef.current) return;
    ttsPlayingRef.current = true;
    while (ttsQueueRef.current.length > 0) {
      if (abortRef.current) break;
      // Sort by speakOrder so agents speak in configured order
      ttsQueueRef.current.sort((a, b) => a.agent.speakOrder - b.agent.speakOrder);
      const item = ttsQueueRef.current.shift()!;
      if (abortRef.current) break;
      await item.handle.speak(item.reply);
    }
    ttsPlayingRef.current = false;
  }, []);

  // Shared meeting transcript — persists across rounds so agents remember the full conversation
  const meetingTranscriptRef = useRef<string[]>([]);

  const broadcastMessage = useCallback(async (text: string) => {
    if (!text.trim() || !meetingActive || isBroadcasting) return;
    setIsBroadcasting(true);
    abortRef.current = false;
    ttsQueueRef.current = [];
    ttsPlayingRef.current = false;

    const targetAgents = detectTargetAgents(text);
    if (targetAgents.length === 0) {
      console.log("No agents targeted, skipping broadcast");
      setIsBroadcasting(false);
      return;
    }

    // Add Shannon's message to the transcript
    meetingTranscriptRef.current.push(`Shannon: ${text}`);

    // Sort agents by speakOrder so they go in turn
    const sorted = [...targetAgents].sort((a, b) => a.speakOrder - b.speakOrder);

    // Send sequentially — each agent sees what came before
    for (const agent of sorted) {
      if (abortRef.current) break;
      const handle = panelRefs.current.get(agent.id);
      if (!handle) continue;

      // Send with meeting transcript so this agent can "hear" everyone
      const reply = await handle.sendMeetingMessage(text, [...meetingTranscriptRef.current]);
      if (abortRef.current || !reply) continue;

      // Skip silent responses (agent chose not to speak)
      if (reply.trim() === "---") continue;

      // Add this agent's response to the transcript for the next agent
      meetingTranscriptRef.current.push(`${agent.name}: ${reply}`);

      // Speak immediately (no queue needed — we're already sequential)
      if (!abortRef.current) {
        await handle.speak(reply);
      }
    }

    // Keep transcript trimmed to last 40 entries to avoid token overflow
    if (meetingTranscriptRef.current.length > 40) {
      meetingTranscriptRef.current = meetingTranscriptRef.current.slice(-40);
    }

    setIsBroadcasting(false);
  }, [meetingActive, detectTargetAgents, isBroadcasting]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    // Stop all currently speaking agents
    panelRefs.current.forEach((handle) => handle.stopSpeaking());
    setIsBroadcasting(false);
  }, []);

  // Handle speech recognition result
  const handleMicClick = () => {
    if (!meetingActive || isBroadcasting) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // When speech recognition ends with a transcript, broadcast it
  useEffect(() => {
    if (!isListening && transcript && transcript !== prevTranscriptRef.current) {
      prevTranscriptRef.current = transcript;
      broadcastMessage(transcript);
    }
  }, [isListening, transcript, broadcastMessage]);

  const handleAskAll = () => {
    const text = askAllText.trim();
    if (!text) return;
    setAskAllText("");
    broadcastMessage(text);
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
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-md font-mono text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
            <SettingsPanel
              agents={store.agents}
              apiKey={store.apiKey}
              anthropicKey={store.anthropicKey}
              onAddAgent={store.addAgent}
              onUpdateAgent={store.updateAgent}
              onRemoveAgent={store.removeAgent}
              onSetApiKey={store.setApiKey}
              onSetAnthropicKey={store.setAnthropicKey}
              onExport={store.exportConfig}
              onImport={store.importConfig}
            />

            <button
              onClick={async () => {
                resetSession();
                meetingTranscriptRef.current = [];
                // Also try legacy reset if available
                const baseUrl = store.agents[0]?.apiUrl;
                if (baseUrl) {
                  try {
                    const url = new URL(baseUrl);
                    await fetch(`${url.origin}/reset`, { method: "POST" });
                  } catch {
                    // Legacy reset failed — fine, MCP mode uses session IDs
                  }
                }
                window.location.reload();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md font-mono text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Meeting
            </button>

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

      {/* Status bar + Broadcast controls */}
      <div className="border-b border-border px-6 py-3">
        <div className="max-w-[1800px] mx-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${meetingActive ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
            />
            <span className="text-xs text-muted-foreground font-mono">
            {isBroadcasting ? "AGENTS RESPONDING..." : meetingActive ? "MEETING IN SESSION" : "STANDBY"}
            </span>
            {isBroadcasting && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
              >
                <Square className="h-3 w-3 fill-current" />
                STOP
              </button>
            )}
            {meetingActive && (
              <button
                onClick={() => setSilentMode(!silentMode)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors"
                style={{
                  backgroundColor: silentMode ? "hsl(var(--primary) / 0.15)" : "transparent",
                  color: silentMode ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                }}
                title={silentMode ? "Silent mode ON — text only" : "Sound ON — voice responses"}
              >
                {silentMode ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {silentMode ? "SILENT" : "SOUND"}
              </button>
            )}
          </div>

          {meetingActive && (
            <div className="flex-1 flex items-center gap-3 max-w-2xl ml-auto">
              {/* Broadcast mic button */}
              <div className="relative">
                {isListening && (
                  <>
                    <span className="absolute inset-0 rounded-full animate-pulse-ring bg-primary" />
                    <span className="absolute inset-0 rounded-full animate-pulse-ring bg-primary" style={{ animationDelay: "0.5s" }} />
                  </>
                )}
                <button
                  onClick={handleMicClick}
                  disabled={isBroadcasting}
                  className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 border-primary transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isListening ? "hsl(var(--primary))" : "transparent",
                    color: isListening ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))",
                  }}
                  title="Broadcast to all agents"
                >
                  <Mic className="h-5 w-5" />
                </button>
              </div>

              {isListening && transcript && (
                <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
                  "{transcript}"
                </span>
              )}

              {/* Text input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskAll();
                }}
                className="flex-1 flex items-center gap-2"
              >
                <input
                  className="flex-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Ask all agents..."
                  value={askAllText}
                  onChange={(e) => setAskAllText(e.target.value)}
                  disabled={isBroadcasting}
                />
                <button
                  type="submit"
                  disabled={!askAllText.trim() || isBroadcasting}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  Ask All
                </button>
              </form>
            </div>
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
                anthropicKey={store.anthropicKey}
                silentMode={silentMode}
                inMeeting={meetingParticipants.has(agent.id)}
                onToggleMeeting={() => {
                  setMeetingParticipants((prev) => {
                    const next = new Set(prev);
                    if (next.has(agent.id)) next.delete(agent.id);
                    else next.add(agent.id);
                    return next;
                  });
                }}
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
