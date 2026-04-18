import { useState, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";

interface SRState {
  isListening: boolean;
  transcript: string;
  error: string | null;
}

export function useSpeechRecognition() {
  const [state, setState] = useState<SRState>({
    isListening: false,
    transcript: "",
    error: null,
  });
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const setIsListening = useCallback(
    (v: boolean) => setState((s) => ({ ...s, isListening: v })),
    []
  );
  const setTranscript = useCallback(
    (v: string) => setState((s) => ({ ...s, transcript: v })),
    []
  );
  const setError = useCallback(
    (v: string | null) => setState((s) => ({ ...s, error: v })),
    []
  );

  const startListening = useCallback(async () => {
    setError(null);

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const msg =
        "Speech recognition is not supported in this browser. Use Chrome, Edge, or Safari.";
      setError(msg);
      toast({ variant: "destructive", title: "Mic unavailable", description: msg });
      return;
    }

    // Proactively request mic permission so we can surface a clear error
    // before the SpeechRecognition API silently fails.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only needed permission — release the stream immediately so the
      // SpeechRecognition API can take over the mic.
      stream.getTracks().forEach((t) => t.stop());
    } catch (err: any) {
      let msg = "Microphone access failed.";
      if (err?.name === "NotAllowedError") {
        msg = "Microphone permission denied. Allow mic access in your browser settings and reload.";
      } else if (err?.name === "NotFoundError") {
        msg = "No microphone found. Plug one in and try again.";
      } else if (err?.name === "NotReadableError") {
        msg = "Microphone is in use by another app. Close it and retry.";
      }
      setError(msg);
      toast({ variant: "destructive", title: "Microphone error", description: msg });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript;
      }
      setTranscript(finalTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      const errType = event?.error || "unknown";
      let msg = `Speech recognition error: ${errType}`;
      if (errType === "not-allowed" || errType === "service-not-allowed") {
        msg = "Microphone permission denied. Allow mic access in your browser settings.";
      } else if (errType === "no-speech") {
        msg = "No speech detected. Try speaking closer to the mic.";
      } else if (errType === "audio-capture") {
        msg = "No microphone detected.";
      } else if (errType === "network") {
        msg = "Network error — speech recognition needs an internet connection.";
      }
      console.error("[useSpeechRecognition] error:", errType, event);
      setError(msg);
      toast({ variant: "destructive", title: "Mic error", description: msg });
      setIsListening(false);
    };

    try {
      recognitionRef.current = recognition;
      setTranscript("");
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error("[useSpeechRecognition] start failed:", err);
      const msg = "Could not start speech recognition. Try again.";
      setError(msg);
      toast({ variant: "destructive", title: "Mic error", description: msg });
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, transcript, error, startListening, stopListening };
}
