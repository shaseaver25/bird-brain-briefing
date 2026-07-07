import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { DEFAULT_AGENTS } from "@/hooks/useAgentStore";

const LINKS = [
  { to: "/", label: "Meeting Room" },
  { to: "/meeting", label: "Agent Grid" },
  { to: "/panel", label: "Panel" },
  { to: "/voice", label: "Voice" },
  { to: "/my-agent", label: "My Agent" },
  { to: "/meet", label: "Swift" },
];

export default function AppNav() {
  const location = useLocation();
  const [dashOpen, setDashOpen] = useState(false);

  // Public visitor pages stand alone — no internal nav for visitors.
  if (location.pathname === "/meet") return null;

  return (
    <nav className="border-b border-border bg-background/95 sticky top-0 z-40">
      <div className="max-w-[1800px] mx-auto px-6 flex items-center gap-1 h-10 overflow-x-auto">
        {LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`px-3 py-1.5 rounded-md font-mono text-xs whitespace-nowrap transition-colors ${
              location.pathname === link.to
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        ))}

        <div className="relative">
          <button
            onClick={() => setDashOpen(!dashOpen)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-mono text-xs whitespace-nowrap transition-colors ${
              location.pathname.startsWith("/dashboard")
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Dashboards
            <ChevronDown className="h-3 w-3" />
          </button>
          {dashOpen && (
            <div
              className="absolute left-0 top-full mt-1 rounded-md border border-border bg-popover shadow-lg py-1 min-w-40"
              onMouseLeave={() => setDashOpen(false)}
            >
              {DEFAULT_AGENTS.map((agent) => (
                <Link
                  key={agent.id}
                  to={`/dashboard/${agent.id}`}
                  onClick={() => setDashOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <span>{agent.emoji}</span>
                  {agent.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
