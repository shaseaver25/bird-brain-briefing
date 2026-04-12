import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  role: string;
  voiceId: string;
  agentId: string;
  apiUrl: string;
  accentColor: string;
  speakOrder: number;
}

interface StoreState {
  agents: AgentConfig[];
  apiKey: string;
}

const STORAGE_KEY = "staff-meeting-config";
const CONFIG_ID = "default";

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "wren",
    name: "Wren",
    emoji: "🐦",
    role: "Strategy Lead",
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    agentId: "main",
    apiUrl: import.meta.env.VITE_WREN_API_URL || "",
    accentColor: "45 90% 50%",
    speakOrder: 1,
  },
  {
    id: "saleshawk",
    name: "SalesHawk",
    emoji: "🦅",
    role: "Sales Lead",
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",
    agentId: "saleshawk",
    apiUrl: import.meta.env.VITE_SALESHAWK_API_URL || "",
    accentColor: "35 90% 55%",
    speakOrder: 2,
  },
  {
    id: "osprey",
    name: "Osprey",
    emoji: "🦅",
    role: "Agent Architect",
    voiceId: "ErXwobaYiN019PkySvjV",
    agentId: "forge",
    apiUrl: import.meta.env.VITE_OSPREY_API_URL || "",
    accentColor: "173 80% 40%",
    speakOrder: 3,
  },
  {
    id: "merlin",
    name: "Merlin",
    emoji: "🦅",
    role: "Project Tracker",
    voiceId: "ErXwobaYiN019PkySvjV",
    agentId: "merlin",
    apiUrl: import.meta.env.VITE_MERLIN_API_URL || "",
    accentColor: "260 60% 60%",
    speakOrder: 4,
  },
];

function loadLocalState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const agents = (parsed.agents || DEFAULT_AGENTS).map((a: AgentConfig, i: number) => ({
        ...a,
        speakOrder: a.speakOrder ?? i + 1,
      }));
      return {
        agents,
        apiKey: parsed.apiKey || import.meta.env.VITE_ELEVENLABS_API_KEY || "",
      };
    }
  } catch {}
  return {
    agents: DEFAULT_AGENTS,
    apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY || "",
  };
}

function saveLocal(state: StoreState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadFromCloud(): Promise<StoreState | null> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("agents, api_key")
      .eq("id", CONFIG_ID)
      .maybeSingle();

    if (error || !data) return null;

    const agents = (data.agents as AgentConfig[]).map((a, i) => ({
      ...a,
      speakOrder: a.speakOrder ?? i + 1,
    }));

    return { agents, apiKey: (data.api_key as string) || "" };
  } catch {
    return null;
  }
}

async function saveToCloud(state: StoreState) {
  try {
    await supabase
      .from("app_config")
      .upsert({
        id: CONFIG_ID,
        agents: state.agents as unknown as Record<string, unknown>,
        api_key: state.apiKey,
        updated_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error("Cloud save failed:", err);
  }
}

export function useAgentStore() {
  const [state, setState] = useState<StoreState>(loadLocalState);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // On mount, try to load from cloud (overrides localStorage)
  useEffect(() => {
    loadFromCloud().then((cloudState) => {
      if (cloudState && cloudState.agents.length > 0) {
        setState(cloudState);
        saveLocal(cloudState);
      }
      setCloudLoaded(true);
    });
  }, []);

  // Save to both localStorage and cloud on changes (after initial cloud load)
  useEffect(() => {
    if (!cloudLoaded) return;
    saveLocal(state);
    saveToCloud(state);
  }, [state, cloudLoaded]);

  const setAgents = useCallback((agents: AgentConfig[]) => {
    setState((s) => ({ ...s, agents }));
  }, []);

  const addAgent = useCallback((agent: Omit<AgentConfig, "id">) => {
    setState((s) => ({
      ...s,
      agents: [...s.agents, { ...agent, id: crypto.randomUUID() }],
    }));
  }, []);

  const updateAgent = useCallback((id: string, updates: Partial<AgentConfig>) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  }, []);

  const removeAgent = useCallback((id: string) => {
    setState((s) => ({ ...s, agents: s.agents.filter((a) => a.id !== id) }));
  }, []);

  const setApiKey = useCallback((apiKey: string) => {
    setState((s) => ({ ...s, apiKey }));
  }, []);

  const exportConfig = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importConfig = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed.agents && Array.isArray(parsed.agents)) {
        setState({
          agents: parsed.agents.map((a: AgentConfig, i: number) => ({
            ...a,
            speakOrder: a.speakOrder ?? i + 1,
          })),
          apiKey: parsed.apiKey || state.apiKey,
        });
        return true;
      }
    } catch {}
    return false;
  }, [state.apiKey]);

  const sortedAgents = [...state.agents].sort((a, b) => a.speakOrder - b.speakOrder);

  return {
    agents: sortedAgents,
    apiKey: state.apiKey,
    setAgents,
    addAgent,
    updateAgent,
    removeAgent,
    setApiKey,
    exportConfig,
    importConfig,
  };
}
