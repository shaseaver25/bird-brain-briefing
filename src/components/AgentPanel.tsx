import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Volume2 } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { textToSpeech } from "@/lib/elevenlabs";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

interface AgentConfig {
  name: string;
  emoji: string;
  role: string;
  voiceId: string;
  apiUrl: string;
  colorVar: string;
}

interface AgentPanelProps {
  agent: AgentConfig;
  isActive: boolean;
}

export default function AgentPanel({ agent, isActive }: AgentPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevTranscriptRef = useRef("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // When listening stops and we have a transcript, send it
  useEffect(() => {
    if (!isListening && transcript && transcript !== prevTranscriptRef.current) {
      prevTranscriptRef.current = transcript;
      sendMessage(transcript);
    }
  }, [isListening, transcript]);

  const sendMessage = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsThinking(true);

    try {
      const res = await fetch(agent.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();
      const reply = data.response || data.message || data.text || JSON.stringify(data);

      setMessages((prev) => [...prev, { role: "agent", text: reply }]);
      setIsThinking(false);

      // TTS
      setIsSpeaking(true);
      const audio = await textToSpeech(reply, agent.voiceId);
      if (audio) {
        audio.onended = () => setIsSpeaking(false);
        await audio.play();
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("Agent error:", err);
      setMessages((prev) => [...prev, { role: "agent", text: "Connection error. Please try again." }]);
      setIsThinking(false);
    }
  }, [agent]);

  const handleMicClick = () => {
    if (!isActive) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const accentColor = `hsl(var(--agent-${agent.colorVar}))`;

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card overflow-hidden h-full"
      style={{ borderTopColor: accentColor, borderTopWidth: "2px" }}
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{agent.emoji}</span>
          <div>
            <h3 className="font-semibold text-foreground text-lg font-mono">{agent.name}</h3>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
          {isSpeaking && (
            <Volume2 className="ml-auto h-4 w-4 animate-pulse" style={{ color: accentColor }} />
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px]">
        {messages.length === 0 && !isThinking && (
          <p className="text-muted-foreground text-sm text-center mt-8 italic">
            Waiting for input...
          </p>
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
              style={msg.role === "agent" ? { borderLeft: `2px solid ${accentColor}` } : undefined}
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
                style={{ backgroundColor: accentColor, animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Mic button */}
      <div className="p-4 border-t border-border flex justify-center">
        <div className="relative">
          {isListening && (
            <>
              <span
                className="absolute inset-0 rounded-full animate-pulse-ring"
                style={{ backgroundColor: accentColor }}
              />
              <span
                className="absolute inset-0 rounded-full animate-pulse-ring"
                style={{ backgroundColor: accentColor, animationDelay: "0.5s" }}
              />
            </>
          )}
          <button
            onClick={handleMicClick}
            disabled={!isActive || isThinking}
            className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              borderColor: accentColor,
              backgroundColor: isListening ? accentColor : "transparent",
              color: isListening ? "hsl(var(--background))" : accentColor,
            }}
          >
            <Mic className="h-6 w-6" />
          </button>
        </div>
      </div>

      {isListening && transcript && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground italic truncate">"{transcript}"</p>
        </div>
      )}
    </div>
  );
}
