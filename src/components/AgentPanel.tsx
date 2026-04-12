import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2 } from "lucide-react";
import { textToSpeech } from "@/lib/elevenlabs";
import { AgentConfig } from "@/hooks/useAgentStore";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

interface AgentPanelProps {
  agent: AgentConfig;
  isActive: boolean;
  apiKey: string;
  silentMode: boolean;
}

export interface AgentPanelHandle {
  /** Send a message and fetch response (no TTS). Returns the reply text. */
  sendMessage: (text: string) => Promise<string>;
  /** Play TTS for a given text. Returns when audio finishes. */
  speak: (text: string) => Promise<void>;
}

const AgentPanel = forwardRef<AgentPanelHandle, AgentPanelProps>(({ agent, isActive, apiKey, silentMode }, ref) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const sendMessage = useCallback(async (text: string): Promise<string> => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsThinking(true);

    try {
      const res = await fetch(agent.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agent.agentId, message: text }),
      });

      const data = await res.json();
      const reply = data.response || data.message || data.text || JSON.stringify(data);

      setMessages((prev) => [...prev, { role: "agent", text: reply }]);
      setIsThinking(false);
      return reply;
    } catch (err) {
      console.error("Agent error:", err);
      const errorMsg = "Connection error. Please try again.";
      setMessages((prev) => [...prev, { role: "agent", text: errorMsg }]);
      setIsThinking(false);
      return errorMsg;
    }
  }, [agent]);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (silentMode) return;
    setIsSpeaking(true);
    try {
      const audio = await textToSpeech(text, agent.voiceId, apiKey);
      if (audio) {
        await new Promise<void>((resolve) => {
          audio.onended = () => { setIsSpeaking(false); resolve(); };
          audio.onerror = () => { setIsSpeaking(false); resolve(); };
          audio.play().catch(() => { setIsSpeaking(false); resolve(); });
        });
      } else {
        setIsSpeaking(false);
      }
    } catch {
      setIsSpeaking(false);
    }
  }, [agent, apiKey, silentMode]);

  useImperativeHandle(ref, () => ({ sendMessage, speak }), [sendMessage, speak]);

  const accent = `hsl(${agent.accentColor})`;

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card overflow-hidden h-full"
      style={{ borderTopColor: accent, borderTopWidth: "2px" }}
    >
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{agent.emoji}</span>
          <div>
            <h3 className="font-semibold text-foreground text-lg font-mono">{agent.name}</h3>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">#{agent.speakOrder}</span>
            {isSpeaking && (
              <Volume2 className="h-4 w-4 animate-pulse" style={{ color: accent }} />
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px]">
        {messages.length === 0 && !isThinking && (
          <p className="text-muted-foreground text-sm text-center mt-8 italic">Waiting for input...</p>
        )}
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-sm rounded-md px-3 py-2 ${
                msg.role === "user"
                  ? "bg-secondary text-secondary-foreground ml-6"
                  : "bg-muted text-foreground mr-6"
              }`}
              style={msg.role === "agent" ? { borderLeft: `2px solid ${accent}` } : undefined}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
                {msg.role === "user" ? "You" : agent.name}
              </span>
              {msg.text}
            </motion.div>
          ))}
        </AnimatePresence>

        {isThinking && (
          <div className="flex items-center gap-1 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">{agent.name}</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full animate-thinking-dot"
                style={{ backgroundColor: accent, animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
});

AgentPanel.displayName = "AgentPanel";
export default AgentPanel;
