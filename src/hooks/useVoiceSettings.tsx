import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

// Global voice settings, persisted to localStorage so a choice survives reloads
// (the old Meeting-Room toggle was useState, so voices came back on every refresh).
// `enabled` is the global on/off; `muted` holds individually silenced agent ids.
interface VoiceSettings {
  enabled: boolean;
  muted: string[];
}

const STORAGE_KEY = "voice-settings";
const DEFAULTS: VoiceSettings = { enabled: true, muted: [] };

function load(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        enabled: typeof p.enabled === "boolean" ? p.enabled : true,
        muted: Array.isArray(p.muted) ? p.muted.filter((m: unknown) => typeof m === "string") : [],
      };
    }
  } catch {
    /* corrupt/unavailable localStorage — fall back to defaults */
  }
  return DEFAULTS;
}

interface VoiceContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;
  isMuted: (agentId: string) => boolean;
  toggleMuted: (agentId: string) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<VoiceSettings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore write failures (private mode, quota) */
    }
  }, [settings]);

  const setEnabled = useCallback((v: boolean) => setSettings((s) => ({ ...s, enabled: v })), []);
  const toggleEnabled = useCallback(() => setSettings((s) => ({ ...s, enabled: !s.enabled })), []);
  const toggleMuted = useCallback(
    (agentId: string) =>
      setSettings((s) => ({
        ...s,
        muted: s.muted.includes(agentId) ? s.muted.filter((m) => m !== agentId) : [...s.muted, agentId],
      })),
    []
  );
  const isMuted = useCallback((agentId: string) => settings.muted.includes(agentId), [settings.muted]);

  return (
    <VoiceContext.Provider value={{ enabled: settings.enabled, setEnabled, toggleEnabled, isMuted, toggleMuted }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within a VoiceProvider");
  return ctx;
}
