import { useCallback, useState } from "react";
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";

const AGENT_ID = "agent_3801kphssj98ed1s2t6asg5z3ymn";

function MyAgentPageInner() {
  const [isStarting, setIsStarting] = useState(false);
  const [transcript, setTranscript] = useState<
    { role: "user" | "agent"; text: string; id: string }[]
  >([]);

  const conversation = useConversation({
    onConnect: () => toast.success("Connected"),
    onDisconnect: () => toast.info("Disconnected"),
    onError: (err) => {
      console.error("My Agent error:", err);
      toast.error("Voice agent error");
    },
    onMessage: (msg: {
      type?: string;
      user_transcription_event?: { user_transcript?: string };
      agent_response_event?: { agent_response?: string };
    }) => {
      if (msg?.type === "user_transcript") {
        const text = msg.user_transcription_event?.user_transcript;
        if (text) setTranscript((t) => [...t, { role: "user", text, id: crypto.randomUUID() }]);
      } else if (msg?.type === "agent_response") {
        const text = msg.agent_response_event?.agent_response;
        if (text) setTranscript((t) => [...t, { role: "agent", text, id: crypto.randomUUID() }]);
      }
    },
  });

  const start = useCallback(async () => {
    setIsStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "webrtc",
      });
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Failed to start");
    } finally {
      setIsStarting(false);
    }
  }, [conversation]);

  const stop = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const connected = conversation.status === "connected";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Agent</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Talk to your ElevenLabs Conversational AI agent in real time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!connected ? (
            <Button onClick={start} disabled={isStarting} size="lg">
              {isStarting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
              ) : (
                <><Mic className="mr-2 h-4 w-4" /> Start conversation</>
              )}
            </Button>
          ) : (
            <Button onClick={stop} variant="destructive" size="lg">
              <MicOff className="mr-2 h-4 w-4" /> End conversation
            </Button>
          )}
          {connected && (
            <span className="text-sm text-muted-foreground">
              {conversation.isSpeaking ? "Agent speaking…" : "Listening…"}
            </span>
          )}
        </div>

        <Card className="p-4">
          <h2 className="text-sm font-medium mb-3">Transcript</h2>
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {transcript.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm p-2 rounded ${
                    m.role === "user" ? "bg-muted" : "bg-primary/10"
                  }`}
                >
                  <span className="font-semibold mr-2">
                    {m.role === "user" ? "You" : "Agent"}:
                  </span>
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// The voice hook (useConversation) must run inside ConversationProvider. Wrapping
// it here — rather than in App.tsx — keeps the ElevenLabs/livekit stack in this
// lazily-loaded route chunk instead of the initial bundle.
export default function MyAgentPage() {
  return (
    <ConversationProvider>
      <MyAgentPageInner />
    </ConversationProvider>
  );
}