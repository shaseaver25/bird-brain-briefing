import { useEffect, useState } from "react";
import { VolumeX } from "lucide-react";

function stopAllVoice() {
  document.querySelectorAll("audio").forEach((a) => {
    try {
      a.pause();
      a.currentTime = 0;
      a.src = "";
      a.remove();
    } catch {
      // ignore
    }
  });
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("global-voice-stop"));
}

export default function GlobalVoiceStop() {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopAllVoice();
        setFlash(true);
        setTimeout(() => setFlash(false), 400);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      onClick={() => {
        stopAllVoice();
        setFlash(true);
        setTimeout(() => setFlash(false), 400);
      }}
      title="Stop all voice (Esc)"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-xs font-mono font-medium text-destructive-foreground shadow-lg hover:opacity-90 transition-opacity"
      style={{ outline: flash ? "2px solid hsl(var(--primary))" : "none" }}
    >
      <VolumeX className="h-4 w-4" />
      Stop Voice
    </button>
  );
}