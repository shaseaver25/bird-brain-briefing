import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, Send, Paperclip, X, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { textToSpeech } from "@/lib/elevenlabs";
import { sendAgentMessage, getSessionId } from "@/lib/agent-api";
import { supabase } from "@/integrations/supabase/client";
import { AgentConfig } from "@/hooks/useAgentStore";

import merlinAvatar from "@/assets/merlin-avatar.png";
import ospreyAvatar from "@/assets/osprey-avatar.png";
import saleshawkAvatar from "@/assets/saleshawk-avatar.png";
import wrenAvatar from "@/assets/wren-avatar.png";
import kiroAvatar from "@/assets/kiro-avatar.png";
import owlAvatar from "@/assets/owl-avatar.png";

const AVATAR_MAP: Record<string, string> = {
  merlin: merlinAvatar,
  osprey: ospreyAvatar,
  saleshawk: saleshawkAvatar,
  wren: wrenAvatar,
  kiro: kiroAvatar,
  warbler: kiroAvatar,
  owl: owlAvatar,
};

function getAvatar(agent: { id: string; name: string }): string | undefined {
  return AVATAR_MAP[agent.id] || AVATAR_MAP[agent.name.toLowerCase()];
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  attachments?: { name: string; kind: "image" | "file"; dataUrl?: string }[];
}

interface AgentPanelProps {
  agent: AgentConfig;
  isActive: boolean;
  apiKey: string;
  anthropicKey?: string;
  silentMode: boolean;
  inMeeting: boolean;
  onToggleMeeting: () => void;
}

export interface AgentPanelHandle {
  sendMessage: (text: string) => Promise<string>;
  sendMeetingMessage: (text: string, transcript: string[]) => Promise<string>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
}

const AgentPanel = forwardRef<AgentPanelHandle, AgentPanelProps>(({ agent, isActive, apiKey, anthropicKey, silentMode, inMeeting, onToggleMeeting }, ref) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [directInput, setDirectInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ name: string; kind: "image" | "file"; dataUrl?: string; textContent?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortSpeakRef = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // OpenClaw id → display name (must match agent-api.ts)
  const NAME_MAP: Record<string, string> = {
    main: "Wren",
    forge: "Osprey",
    saleshawk: "SalesHawk",
    merlin: "Merlin",
    kiro: "Kiro",
    warbler: "Kiro",
  };

  // Load past 14 days of conversation history on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const aid = (agent.agentId || agent.id).toLowerCase();
        const displayName = NAME_MAP[aid] || agent.name;
        const { data: agentRow } = await (supabase
          .from("agents" as any)
          .select("id")
          .ilike("name", displayName)
          .single() as any);
        if (!agentRow) return;
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await (supabase
          .from("conversations" as any)
          .select("role, content, created_at")
          .eq("user_id", user.id)
          .eq("agent_id", agentRow.id)
          .gte("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(60) as any);
        if (cancelled || !data) return;
        const history: ChatMessage[] = data.map((m: any) => ({
          role: m.role === "user" ? "user" : "agent",
          text: m.content,
        }));
        setMessages(history);
      } catch (e) {
        console.warn("Failed to load history for", agent.name, e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  const clearHistory = useCallback(async () => {
    if (!confirm(`Clear all chat history with ${agent.name}? This cannot be undone.`)) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const aid = (agent.agentId || agent.id).toLowerCase();
      const displayName = NAME_MAP[aid] || agent.name;
      const { data: agentRow } = await (supabase
        .from("agents" as any)
        .select("id")
        .ilike("name", displayName)
        .single() as any);
      if (!agentRow) return;
      await (supabase
        .from("conversations" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("agent_id", agentRow.id) as any);
      setMessages([]);
    } catch (e) {
      console.error("Failed to clear history:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id, agent.name]);

  const sendMessage = useCallback(async (text: string): Promise<string> => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsThinking(true);

    try {
      const result = await sendAgentMessage(
        {
          agentId: agent.agentId || agent.id,
          message: text,
          sessionId: getSessionId(),
        },
        agent.apiUrl || undefined,
        anthropicKey || apiKey || undefined
      );

      const reply = result.response;
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

  // Meeting-aware send: includes transcript of what other agents said
  const sendMeetingMessage = useCallback(async (text: string, transcript: string[]): Promise<string> => {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setIsThinking(true);

    try {
      const result = await sendAgentMessage(
        {
          agentId: agent.agentId || agent.id,
          message: text,
          sessionId: getSessionId(),
          meetingMode: true,
          meetingTranscript: transcript,
        },
        agent.apiUrl || undefined,
        anthropicKey || apiKey || undefined
      );

      const reply = result.response;
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
  }, [agent, anthropicKey, apiKey]);

  const stopSpeaking = useCallback(() => {
    abortSpeakRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    if (silentMode) return;
    abortSpeakRef.current = false;
    setIsSpeaking(true);
    try {
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let nextAudioPromise: Promise<HTMLAudioElement | null> | null = null;

      for (let i = 0; i < sentences.length; i++) {
        if (abortSpeakRef.current) break;
        const audioPromise = nextAudioPromise || textToSpeech(sentences[i].trim(), agent.voiceId, apiKey);
        nextAudioPromise = i + 1 < sentences.length
          ? textToSpeech(sentences[i + 1].trim(), agent.voiceId, apiKey)
          : null;

        const audio = await audioPromise;
        if (abortSpeakRef.current) break;
        if (audio) {
          currentAudioRef.current = audio;
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          });
          currentAudioRef.current = null;
        }
      }
    } catch {
      // ignore
    } finally {
      setIsSpeaking(false);
    }
  }, [agent, apiKey, silentMode]);

  useImperativeHandle(ref, () => ({ sendMessage, sendMeetingMessage, speak, stopSpeaking }), [sendMessage, sendMeetingMessage, speak, stopSpeaking]);

  const accent = `hsl(${agent.accentColor})`;

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const MAX_BYTES = 5 * 1024 * 1024;
    const next: typeof pendingFiles = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        console.warn(`Skipping ${file.name}: exceeds 5MB`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const dataUrl = await readFileAsDataUrl(file);
        next.push({ name: file.name, kind: "image", dataUrl });
      } else {
        const isTextLike =
          file.type.startsWith("text/") ||
          /json|xml|csv|yaml|javascript|typescript|markdown/.test(file.type) ||
          /\.(txt|md|json|csv|yaml|yml|xml|log|js|ts|tsx|jsx|py|html|css)$/i.test(file.name);
        if (isTextLike) {
          const textContent = await readFileAsText(file);
          next.push({ name: file.name, kind: "file", textContent });
        } else {
          next.push({ name: file.name, kind: "file" });
        }
      }
    }
    setPendingFiles((prev) => [...prev, ...next]);
  };

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card overflow-hidden h-full"
      style={{ borderTopColor: accent, borderTopWidth: "2px" }}
    >
      {/* Avatar banner */}
      {getAvatar(agent) && (
        <div
          className="w-full h-32 overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: `hsl(${agent.accentColor} / 0.1)` }}
          onClick={() => navigate(`/dashboard/${agent.id}`)}
        >
          <img
            src={getAvatar(agent)}
            alt={`${agent.name} avatar`}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          {!getAvatar(agent) && <span className="text-2xl">{agent.emoji}</span>}
          <div className="cursor-pointer" onClick={() => navigate(`/dashboard/${agent.id}`)}>
            <h3 className="font-semibold text-foreground text-lg font-mono hover:text-primary transition-colors">{agent.name}</h3>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onToggleMeeting}
              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium transition-colors"
              style={{
                backgroundColor: inMeeting ? `hsl(${agent.accentColor} / 0.15)` : 'transparent',
                color: inMeeting ? accent : 'hsl(var(--muted-foreground))',
                border: `1px solid ${inMeeting ? accent : 'hsl(var(--border))'}`,
              }}
            >
              {inMeeting ? "IN" : "OUT"}
            </button>
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
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.attachments.map((att, j) =>
                    att.kind === "image" && att.dataUrl ? (
                      <img
                        key={j}
                        src={att.dataUrl}
                        alt={att.name}
                        className="max-h-32 rounded border border-border"
                      />
                    ) : (
                      <span
                        key={j}
                        className="text-[10px] font-mono px-2 py-1 rounded bg-background border border-border"
                      >
                        📎 {att.name}
                      </span>
                    )
                  )}
                </div>
              )}
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

      {/* Pending attachments preview */}
      {pendingFiles.length > 0 && (
        <div className="border-t border-border px-2 pt-2 flex flex-wrap gap-2">
          {pendingFiles.map((f, i) => (
            <div
              key={i}
              className="relative flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded bg-muted border border-border"
            >
              {f.kind === "image" && f.dataUrl ? (
                <img src={f.dataUrl} alt={f.name} className="h-8 w-8 object-cover rounded" />
              ) : (
                <span>📎</span>
              )}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                className="ml-1 opacity-60 hover:opacity-100"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Per-agent direct input — DM this agent without broadcasting */}
      <form
        className="border-t border-border p-2 flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const text = directInput.trim();
          if ((!text && pendingFiles.length === 0) || isThinking) return;

          const attachments = pendingFiles.map((f) => ({ name: f.name, kind: f.kind, dataUrl: f.dataUrl }));

          // Build the outbound message: include extracted text from text files,
          // and notes for image/binary attachments by name.
          let outbound = text;
          const textParts: string[] = [];
          const imageNames: string[] = [];
          const fileNames: string[] = [];
          for (const f of pendingFiles) {
            if (f.kind === "image") imageNames.push(f.name);
            else if (f.textContent) textParts.push(`--- FILE: ${f.name} ---\n${f.textContent}\n--- END FILE ---`);
            else fileNames.push(f.name);
          }
          if (imageNames.length) outbound += `\n\n[User attached image(s): ${imageNames.join(", ")}]`;
          if (fileNames.length) outbound += `\n\n[User attached file(s) I cannot read: ${fileNames.join(", ")}]`;
          if (textParts.length) outbound += `\n\n${textParts.join("\n\n")}`;

          setDirectInput("");
          setPendingFiles([]);

          const userDisplayText = text || "(attachment)";
          setMessages((prev) => [...prev, { role: "user", text: userDisplayText, attachments }]);
          setIsThinking(true);
          let reply = "";
          try {
            const result = await sendAgentMessage(
              {
                agentId: agent.agentId || agent.id,
                message: outbound || "(see attachment)",
                sessionId: getSessionId(),
              },
              agent.apiUrl || undefined,
              anthropicKey || apiKey || undefined
            );
            reply = result.response;
            setMessages((prev) => [...prev, { role: "agent", text: reply }]);
          } catch (err) {
            console.error("Agent error:", err);
            reply = "Connection error. Please try again.";
            setMessages((prev) => [...prev, { role: "agent", text: reply }]);
          } finally {
            setIsThinking(false);
          }
          if (reply && reply.trim() !== "---") {
            speak(reply);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,text/*,.txt,.md,.json,.csv,.yaml,.yml,.xml,.log,.pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isThinking}
          className="p-1.5 rounded-md transition-colors hover:bg-muted disabled:opacity-30"
          style={{ color: accent }}
          aria-label="Attach file or image"
          title="Attach file or image (5MB max)"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          value={directInput}
          onChange={(e) => setDirectInput(e.target.value)}
          onPaste={async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (const item of Array.from(items)) {
              if (item.kind === "file") {
                const f = item.getAsFile();
                if (f && f.type.startsWith("image/")) files.push(f);
              }
            }
            if (files.length > 0) {
              e.preventDefault();
              const dt = new DataTransfer();
              files.forEach((f) => {
                // Give pasted images a friendly name if blank
                const named = f.name && f.name !== "image.png"
                  ? f
                  : new File([f], `pasted-${Date.now()}.${(f.type.split("/")[1] || "png")}`, { type: f.type });
                dt.items.add(named);
              });
              await handleFiles(dt.files);
            }
          }}
          placeholder={`Message ${agent.name}...`}
          disabled={isThinking}
          className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={(!directInput.trim() && pendingFiles.length === 0) || isThinking}
          className="p-1.5 rounded-md transition-colors disabled:opacity-30"
          style={{ backgroundColor: `hsl(${agent.accentColor} / 0.15)`, color: accent }}
          aria-label={`Send to ${agent.name}`}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
});

AgentPanel.displayName = "AgentPanel";
export default AgentPanel;
