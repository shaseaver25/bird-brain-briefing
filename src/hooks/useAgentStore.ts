import { useState, useEffect, useCallback } from "react";

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  role: string;
  voiceId: string;
  agentId: string; // ID sent in POST body to identify which agent responds
  apiUrl: string;
  accentColor: string; // raw HSL like "173 80% 40%"
  speakOrder: number; // determines response order in meetings
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
    apiUrl: import.meta.env.VITE_WREN_API_URL || "",
    accentColor: "45 90% 50%",
    speakOrder: 1,
  },
  {
    id: "saleshawk",
    name: "SalesHawk",
    emoji: "🦅",
    role: "Sales Lead",
    voiceId: "pNInz6obpgDQGcFmaJgB",
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
    apiUrl: import.meta.env.VITE_MERLIN_API_URL || "",
    accentColor: "260 60% 60%",
    speakOrder: 4,
  },
];

function loadState(): StoreState {
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

function saveState(state: StoreState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useAgentStore() {
  const [state, setState] = useState<StoreState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

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

  // Return agents sorted by speakOrder for display
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
