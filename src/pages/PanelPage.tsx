import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScribe } from "@elevenlabs/react";

type Panelist = {
  id: string;
  name: string;
  role: string;
  description: string | null;
  voice_id: string | null;
};

type Turn = {
  id: string;
  agentId: string;
  agentName: string;
  question: string;
  answer: string;
};

const PANEL_COLORS = [
  "from-sky-500/30 to-sky-500/5 ring-sky-400",
  "from-rose-500/30 to-rose-500/5 ring-rose-400",
  "from-amber-500/30 to-amber-500/5 ring-amber-400",
  "from-emerald-500/30 to-emerald-500/5 ring-emerald-400",
  "from-violet-500/30 to-violet-500/5 ring-violet-400",
  "from-cyan-500/30 to-cyan-500/5 ring-cyan-400",
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Try to find which panelist is being addressed at the start of a question.
function matchPanelist(text: string, panelists: Panelist[]): { panelist: Panelist; rest: string } | null {
  const cleaned = text.trim().replace(/^(hey|hi|hello|ok|okay|so|um|uh)[\s,]+/i, "");
  const lower = cleaned.toLowerCase();
  // longest names first to avoid prefix collisions
  const sorted = [...panelists].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const n = p.name.toLowerCase();
    if (lower.startsWith(n)) {
      const rest = cleaned.slice(n.length).replace(/^[\s,:\-–—!?.]+/, "").trim();
      return { panelist: p, rest: rest || cleaned };
    }
    // also tolerate name anywhere in the first 6 words
    const first = lower.split(/\s+/).slice(0, 6).join(" ");
    if (new RegExp(`\\b${n}\\b`).test(first)) {
      return { panelist: p, rest: cleaned };
    }
  }
  return null;
}

export default function PanelPage() {
  const [panelists, setPanelists] = useState<Panelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [thinkingAgentId, setThinkingAgentId] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [lastQuestion, setLastQuestion] = useState<{ name: string; text: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelistsRef = useRef<Panelist[]>([]);
  const partialRef = useRef("");
  const lastSubmittedRef = useRef("");
  const finishTimerRef = useRef<number | null>(null);
  panelistsRef.current = panelists;

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, role, description, voice_id")
        .order("name");
      console.log("[panel] loaded panelists:", data?.length, error);
      if (error) {
        toast.error("Failed to load panelists");
      } else {
        setPanelists((data ?? []) as Panelist[]);
      }
      setLoading(false);
    })();
  }, []);

  const askPanelist = useCallback(async (agentId: string, agentName: string, question: string) => {
    setThinkingAgentId(agentId);
    setLastQuestion({ name: agentName, text: question });
    try {
      const { data, error } = await supabase.functions.invoke("panel-ask", {
        body: { agentId, question },
      });
      if (error) throw error;
      if (!data?.audioContent || !data?.text) throw new Error("No response");

      setThinkingAgentId(null);
      setActiveAgentId(agentId);
      setTurns((t) => [
        ...t,
        { id: crypto.randomUUID(), agentId, agentName, question, answer: data.text },
      ]);

      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
      audioRef.current = audio;
      audio.onended = () => setActiveAgentId((cur) => (cur === agentId ? null : cur));
      audio.onerror = () => setActiveAgentId((cur) => (cur === agentId ? null : cur));
      await audio.play();
    } catch (e) {
      setThinkingAgentId(null);
      console.error(e);
      toast.error((e as Error).message || "Failed to get response");
    }
  }, []);

  const handleCommitted = useCallback(
    (text: string) => {
      const cleanText = text?.trim();
      if (!cleanText) return false;
      if (lastSubmittedRef.current === cleanText) return true;
      console.log("[panel] committed text:", cleanText);
      const match = matchPanelist(cleanText, panelistsRef.current);
      if (!match) {
        toast("No panelist named — try starting with a name", {
          description: cleanText,
        });
        return false;
      }
      lastSubmittedRef.current = cleanText;
      console.log("[panel] matched:", match.panelist.name, "question:", match.rest);
      askPanelist(match.panelist.id, match.panelist.name, match.rest);
      return true;
    },
    [askPanelist],
  );

  const handleCommittedRef = useRef(handleCommitted);
  handleCommittedRef.current = handleCommitted;

  const stopMicRef = useRef<() => void>(() => {});

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: "vad" as any,
    onPartialTranscript: (d) => {
      partialRef.current = d.text;
      setPartial(d.text);
    },
    onCommittedTranscript: (d) => {
      if (finishTimerRef.current) {
        window.clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      setFinishing(false);
      partialRef.current = "";
      setPartial("");
      const handled = handleCommittedRef.current(d.text);
      // Auto-stop mic after the question is captured so the panelist can answer
      if (handled) stopMicRef.current();
    },
    onError: (e) => {
      console.error("[panel] scribe error:", e);
      toast.error((e as Error)?.message || "Transcription error");
    },
  });

  const stopMic = useCallback(() => {
    scribe.disconnect();
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    setFinishing(false);
    partialRef.current = "";
    setPartial("");
  }, [scribe]);

  stopMicRef.current = stopMic;

  const finishQuestion = useCallback(() => {
    const pendingText = partialRef.current.trim();
    setFinishing(true);

    try {
      scribe.commit();
    } catch (e) {
      console.warn("[panel] manual commit failed; using partial transcript", e);
    }

    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null;
      if (pendingText) {
        handleCommittedRef.current(pendingText);
      } else {
        toast("No speech captured — try again and start with a panelist name");
      }
      stopMicRef.current();
    }, pendingText ? 700 : 1800);
  }, [scribe]);

  const startMic = useCallback(async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");
      if (error) throw error;
      if (!data?.token) throw new Error("No token from server");
      await scribe.connect({
        token: data.token,
        microphone: { echoCancellation: true, noiseSuppression: true } as any,
      });
      toast.success("Mic on — ask a panelist by name");
    } catch (e) {
      console.error("[panel] startMic error:", e);
      toast.error((e as Error).message || "Could not start mic");
    } finally {
      setStarting(false);
    }
  }, [scribe]);

  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    panelists.forEach((p, i) => map.set(p.id, PANEL_COLORS[i % PANEL_COLORS.length]));
    return map;
  }, [panelists]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Panel of Experts</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Open the mic and ask a question by name — e.g. "Wren, what's on the agenda?"
            </p>
          </div>
          {scribe.isConnected ? (
            <Button onClick={finishQuestion} disabled={finishing} variant="destructive" size="lg">
              {finishing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finishing…</>
              ) : (
                <><MicOff className="mr-2 h-4 w-4" /> Finish question</>
              )}
            </Button>
          ) : (
            <Button onClick={startMic} disabled={starting} size="lg">
              {starting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
              ) : (
                <><Mic className="mr-2 h-4 w-4" /> Open mic</>
              )}
            </Button>
          )}
        </header>

        {loading ? (
          <p className="text-muted-foreground">Loading panelists…</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {panelists.map((p) => {
              const isActive = activeAgentId === p.id;
              const isThinking = thinkingAgentId === p.id;
              const grad = colorFor.get(p.id) ?? PANEL_COLORS[0];
              return (
                <Card
                  key={p.id}
                  className={cn(
                    "relative p-5 transition-all bg-gradient-to-br",
                    grad,
                    isActive && "ring-4 ring-offset-2 ring-offset-background scale-[1.02] shadow-2xl",
                    isThinking && "ring-2 ring-offset-1 ring-offset-background animate-pulse",
                    !isActive && !isThinking && "ring-1 ring-border/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-lg font-bold border">
                      {initials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{p.name}</h3>
                        {isActive && <Mic className="h-4 w-4 text-primary animate-pulse" />}
                        {isThinking && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.role}</p>
                      <p className="text-xs mt-2 line-clamp-2 opacity-80">{p.description}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="p-4 min-h-[80px]">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Live</div>
          {partial ? (
            <p className="text-base italic text-foreground/80">{partial}…</p>
          ) : lastQuestion ? (
            <p className="text-sm">
              <span className="font-semibold">To {lastQuestion.name}:</span> {lastQuestion.text}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {finishing ? "Finishing question…" : scribe.isConnected ? "Listening…" : "Mic off"}
            </p>
          )}
        </Card>

        {turns.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Transcript</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {turns.map((t) => (
                <div key={t.id} className="text-sm border-l-2 border-primary/40 pl-3">
                  <p className="text-muted-foreground">Q → {t.agentName}: {t.question}</p>
                  <p className="mt-1"><span className="font-semibold">{t.agentName}:</span> {t.answer}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
