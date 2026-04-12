import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AgentCard } from '@/components/AgentCard';
import { AgentCardSkeleton } from '@/components/AgentCardSkeleton';
import type { Agent } from '@/types/kiro';

export default function StaffMeetingPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAgents() {
      setLoading(true);
      const { data, error: e } = await supabase
        .from('agents')
        .select('*')
        .order('name');
      if (cancelled) return;
      if (e) {
        setError(new Error(e.message));
      } else {
        setAgents((data ?? []) as unknown as Agent[]);
      }
      setLoading(false);
    }
    fetchAgents();
    return () => { cancelled = true; };
  }, []);

  const handleAgentClick = (agentId: string) => {
    navigate(`/dashboard/${agentId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">Staff Meeting</h1>
        <p className="text-sm text-muted-foreground mt-1">Click an agent to view their dashboard</p>
      </header>

      <main className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error.message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <AgentCardSkeleton key={i} />)
            : agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onClick={handleAgentClick}
                />
              ))
          }
        </div>

        {!loading && agents.length === 0 && !error && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No agents found</p>
            <p className="text-sm mt-1">Add agents to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}
