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

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "wren",
    name: "Wren",
    emoji: "🐦",
    role: "Strategy Lead",
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    agentId: "main",
    apiUrl: "",
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
    apiUrl: "",
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
    apiUrl: "",
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
    apiUrl: "",
    accentColor: "260 60% 60%",
    speakOrder: 4,
  },
  {
    id: "kiro",
    name: "Warbler",
    emoji: "☁️",
    role: "Cloud Orchestrator",
    voiceId: "ErXwobaYiN019PkySvjV",
    agentId: "kiro",
    apiUrl: "https://x3dabj2fiompspg7x7dnhid3se0spttn.lambda-url.us-east-1.on.aws/",
    accentColor: "210 80% 55%",
    speakOrder: 5,
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
      return { agents, apiKey: parsed.apiKey || "" };
    }
  } catch {}
  return { agents: DEFAULT_AGENTS, apiKey: "" };
}

function saveLocal(state: StoreState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadFromCloud(userId: string): Promise<StoreState | null> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("agents, api_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;

    const agents = (data.agents as unknown as AgentConfig[]).map((a, i) => ({
      ...a,
      speakOrder: a.speakOrder ?? i + 1,
    }));

    return { agents, apiKey: (data.api_key as string) || "" };
  } catch {
    return null;
  }
}

async function saveToCloud(userId: string, state: StoreState) {
  try {
    await (supabase.from("app_config") as any).upsert({
      user_id: userId,
      agents: state.agents,
      api_key: state.apiKey,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cloud save failed:", err);
  }
}

export function useAgentStore(userId: string | null) {
  const [state, setState] = useState<StoreState>(loadLocalState);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // Load from cloud when userId is available
  useEffect(() => {
    if (!userId) {
      setCloudLoaded(false);
      return;
    }
    loadFromCloud(userId).then((cloudState) => {
      if (cloudState && cloudState.agents.length > 0) {
        setState(cloudState);
        saveLocal(cloudState);
      }
      setCloudLoaded(true);
    });
  }, [userId]);

  // Save to both localStorage and cloud on changes
  useEffect(() => {
    if (!cloudLoaded || !userId) return;
    saveLocal(state);
    saveToCloud(userId, state);
  }, [state, cloudLoaded, userId]);

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
