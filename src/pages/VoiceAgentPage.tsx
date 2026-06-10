import { useCallback, useEffect, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";

const STORAGE_KEY = "elevenlabs_agent_id";

export default function VoiceAgentPage() {
  const [agentId, setAgentId] = useState<string>(
    () => (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "",
  );
  const [isStarting, setIsStarting] = useState(false);
  const [transcript, setTranscript] = useState<
    { role: "user" | "agent"; text: string; id: string }[]
  >([]);

  const conversation = useConversation({
    onConnect: () => toast.success("Connected"),
    onDisconnect: () => toast.info("Disconnected"),
    onError: (err) => {
      console.error("Voice agent error:", err);
      toast.error("Voice agent error");
    },
    onMessage: (msg: any) => {
      if (msg?.type === "user_transcript") {
        const text = msg.user_transcription_event?.user_transcript;
        if (text) setTranscript((t) => [...t, { role: "user", text, id: crypto.randomUUID() }]);
      } else if (msg?.type === "agent_response") {
        const text = msg.agent_response_event?.agent_response;
        if (text) setTranscript((t) => [...t, { role: "agent", text, id: crypto.randomUUID() }]);
      }
    },
  });

  useEffect(() => {
    if (agentId) localStorage.setItem(STORAGE_KEY, agentId);
  }, [agentId]);

  const start = useCallback(async () => {
    if (!agentId.trim()) {
      toast.error("Enter your ElevenLabs Agent ID");
      return;
    }
    setIsStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data, error } = await supabase.functions.invoke("elevenlabs-conversation-token", {
        body: { agentId: agentId.trim() },
      });
      if (error) throw error;
      if (!data?.token) throw new Error("No token returned");
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });
    } catch (e) {
      console.error(e);
      toast.error((e as Error).message || "Failed to start");
    } finally {
      setIsStarting(false);
    }
  }, [agentId, conversation]);

  const stop = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const connected = conversation.status === "connected";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Voice Agent</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Talk to your ElevenLabs Conversational AI agent in real time.
          </p>
        </div>

        <Card className="p-4 space-y-3">
          <label className="text-sm font-medium">ElevenLabs Agent ID</label>
          <Input
            placeholder="agent_..."
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            disabled={connected}
          />
          <p className="text-xs text-muted-foreground">
            Create an agent at{" "}
            <a
              href="https://elevenlabs.io/app/conversational-ai/agents"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              elevenlabs.io
            </a>{" "}
            and paste its ID here.
          </p>
        </Card>

        <div className="flex items-center gap-3">
          {!connected ? (
            <Button onClick={start} disabled={isStarting} size="lg">
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" /> Start conversation
                </>
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