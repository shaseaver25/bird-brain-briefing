import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Clock, Calendar as CalendarIcon, Check, ExternalLink } from "lucide-react";

const TZ = "America/Chicago";
const FN_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co`;

type Slot = { start: string; end: string };

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: TZ,
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: TZ,
  });
}

export default function BookingPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ start: string; meetLink: string | null; htmlLink: string } | null>(null);

  useEffect(() => {
    fetch(`${FN_BASE}/booking-availability`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setSlots(d.slots ?? []);
        if (d.slots?.length) setSelectedDay(dayKey(d.slots[0].start));
      })
      .catch(e => toast({ title: "Couldn't load availability", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.start);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [slots]);

  const days = Array.from(grouped.keys());
  const daySlots = selectedDay ? grouped.get(selectedDay) ?? [] : [];

  async function submit() {
    if (!selectedSlot || !name || !email) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${FN_BASE}/booking-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selectedSlot.start, name, email, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed");
      setConfirmation({ start: selectedSlot.start, meetLink: data.meetLink, htmlLink: data.htmlLink });
    } catch (e) {
      toast({ title: "Couldn't book", description: String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-lg w-full p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">You're booked</h1>
          <p className="text-muted-foreground">
            {dayKey(confirmation.start)} at {timeLabel(confirmation.start)} ({TZ})
          </p>
          <p className="text-sm text-muted-foreground">A calendar invite has been sent to {email}.</p>
          {confirmation.meetLink && (
            <a href={confirmation.meetLink} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 text-primary hover:underline">
              Join Google Meet <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold">Book time with Shannon</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" /> 30-minute meeting · {TZ.replace("_", " ")}
          </p>
        </header>

        {loading ? (
          <p className="text-muted-foreground font-mono text-sm">Loading availability…</p>
        ) : slots.length === 0 ? (
          <Card className="p-6"><p className="text-muted-foreground">No openings in the next two weeks.</p></Card>
        ) : (
          <div className="grid md:grid-cols-[200px_1fr_320px] gap-4">
            {/* Days */}
            <Card className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
              {days.map(d => (
                <button key={d}
                  onClick={() => { setSelectedDay(d); setSelectedSlot(null); }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                    selectedDay === d ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
                    <span className="truncate">{d}</span>
                  </div>
                  <span className="text-xs opacity-70 ml-5">{grouped.get(d)?.length} slots</span>
                </button>
              ))}
            </Card>

            {/* Times */}
            <Card className="p-3">
              <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
                {daySlots.map(s => (
                  <button key={s.start} onClick={() => setSelectedSlot(s)}
                    className={`px-3 py-2 rounded-md border text-sm transition ${
                      selectedSlot?.start === s.start
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary"
                    }`}>
                    {timeLabel(s.start)}
                  </button>
                ))}
              </div>
            </Card>

            {/* Form */}
            <Card className="p-4 space-y-3">
              <h2 className="font-medium">Your details</h2>
              {selectedSlot ? (
                <p className="text-xs text-muted-foreground">
                  {dayKey(selectedSlot.start)} · {timeLabel(selectedSlot.start)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Pick a time to continue</p>
              )}
              <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <Textarea placeholder="What's this about? (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
              <Button className="w-full" disabled={!selectedSlot || !name || !email || submitting} onClick={submit}>
                {submitting ? "Booking…" : "Confirm booking"}
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}