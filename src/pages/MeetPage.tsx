import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Calendar as CalendarIcon, Check, ExternalLink, Send } from "lucide-react";

const FN_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OfferedSlot {
  start: string;
  end: string;
  label: string;
}

interface Booked {
  start: string;
  end: string;
  durationMin: number;
  meetLink: string | null;
  label: string;
}

// Attribution: /meet?src=linkedin (or email-signature, referral...) tags the
// lead that Swift books. Falls back to the referrer.
function detectSrc(): string {
  const params = new URLSearchParams(window.location.search);
  const src = params.get("src") ?? params.get("utm_source") ?? "";
  if (src) return src.slice(0, 100);
  if (/linkedin\.com/i.test(document.referrer)) return "linkedin";
  return document.referrer ? `referrer:${document.referrer.slice(0, 80)}` : "";
}

const GREETING =
  "Hi! I'm Swift, Shannon's scheduling assistant. I can find a time for you two to meet — what would you like to talk with her about?";

export default function MeetPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [slots, setSlots] = useState<OfferedSlot[]>([]);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, slots, booked]);

  async function send(text: string) {
    if (!text.trim() || busy || booked) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setSlots([]);
    setBusy(true);
    try {
      const res = await fetch(`${FN_BASE}/booking-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, src: detectSrc() }),
      });
      const data = await res.json();
      const reply: string = data.reply ?? "Sorry, something went wrong — please try again.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (data.action === "propose" && Array.isArray(data.slots)) setSlots(data.slots);
      if (data.action === "book" && data.booked) setBooked(data.booked);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I couldn't reach the calendar just now — mind trying again?" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function pickSlot(slot: OfferedSlot) {
    // Send the choice as a normal chat turn; Swift then collects name/email
    // (or books immediately if it already has them).
    send(`I'll take ${slot.label} (${slot.start})`);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-xl flex-1 flex flex-col">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center justify-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Meet with Shannon
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chat with Swift to find a time that works.
          </p>
        </header>

        <Card className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[55vh] pr-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {slots.length > 0 && !booked && (
              <div className="flex flex-wrap gap-2 pt-1">
                {slots.map((s) => (
                  <Button
                    key={s.start}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => pickSlot(s)}
                    className="font-mono text-xs"
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            )}

            {booked && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-2">
                <p className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary" />
                  Booked: {booked.label} ({booked.durationMin} min)
                </p>
                <p className="text-xs text-muted-foreground">
                  A calendar invite is on its way to your email.
                </p>
                {booked.meetLink && (
                  <a
                    href={booked.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    Google Meet link <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {busy && (
              <p className="text-xs text-muted-foreground font-mono animate-pulse">Swift is typing…</p>
            )}
            <div ref={bottomRef} />
          </div>

          {!booked && (
            <form
              className="flex gap-2 pt-2 border-t border-border"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                disabled={busy}
                autoFocus
              />
              <Button type="submit" size="icon" disabled={busy || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </Card>

        <p className="text-center text-[10px] text-muted-foreground tracking-wider font-mono mt-4">
          POWERED BY SWIFT — TAILOREDU LLC
        </p>
      </div>
    </div>
  );
}
