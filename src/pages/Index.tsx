import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Radio } from "lucide-react";
import AgentPanel from "@/components/AgentPanel";

const AGENTS = [
  {
    name: "Osprey",
    emoji: "🦅",
    role: "Agent Architect",
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    apiUrl: import.meta.env.VITE_OSPREY_API_URL || "",
    colorVar: "osprey",
  },
  {
    name: "SalesHawk",
    emoji: "🦅",
    role: "Sales Lead",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    apiUrl: import.meta.env.VITE_SALESHAWK_API_URL || "",
    colorVar: "saleshawk",
  },
  {
    name: "Merlin",
    emoji: "🦅",
    role: "Project Tracker",
    voiceId: "ErXwobaYiN019PkySvjV",
    apiUrl: import.meta.env.VITE_MERLIN_API_URL || "",
    colorVar: "merlin",
  },
];

export default function Index() {
  const [meetingActive, setMeetingActive] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-xl font-mono font-bold text-foreground tracking-tight">
                Staff Meeting
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                TailoredU LLC
              </p>
            </div>
          </div>

          <button
            onClick={() => setMeetingActive(!meetingActive)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-sm font-medium transition-all duration-300"
            style={{
              backgroundColor: meetingActive ? "hsl(var(--destructive))" : "hsl(var(--primary))",
              color: meetingActive ? "hsl(var(--destructive-foreground))" : "hsl(var(--primary-foreground))",
            }}
          >
            {meetingActive ? (
              <>
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                End Meeting
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Meeting
              </>
            )}
          </button>
        </div>
      </header>

      {/* Status bar */}
      <div className="border-b border-border px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${meetingActive ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
          />
          <span className="text-xs text-muted-foreground font-mono">
            {meetingActive ? "MEETING IN SESSION" : "STANDBY"}
          </span>
        </div>
      </div>

      {/* Agent Panels */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {AGENTS.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <AgentPanel agent={agent} isActive={meetingActive} />
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3">
        <p className="text-center text-[10px] text-muted-foreground tracking-wider font-mono">
          © 2026 TAILOREDU LLC — CONFIDENTIAL
        </p>
      </footer>
    </div>
  );
}
