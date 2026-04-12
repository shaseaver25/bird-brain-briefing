import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardConfig } from '@/types/kiro';

export function useDashboardConfig(agentId: string) {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!agentId) { setLoading(false); return; }
    let cancelled = false;
    async function fetch() {
      setLoading(true); setError(null);
      const { data, error: e } = await supabase.from('dashboard_configs').select('*').eq('agent_id', agentId).eq('is_published', true).single();
      if (cancelled) return;
      if (e) { setError(new Error(e.message)); setConfig(null); } else { setConfig(data as DashboardConfig); }
      setLoading(false);
    }
    fetch();
    return () => { cancelled = true; };
  }, [agentId]);
  return { config, loading, error };
}
