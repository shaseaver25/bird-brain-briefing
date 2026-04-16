import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Agent } from '@/types/kiro';

export function useAgent(nameOrId: string) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!nameOrId) { setLoading(false); return; }
    let cancelled = false;
    async function fetch() {
      setLoading(true); setError(null);
      const isUuid = /^[0-9a-f]{8}-/.test(nameOrId);
      const { data, error: e } = await (isUuid
        ? supabase.from('agents').select('*').eq('id', nameOrId).single()
        : supabase.from('agents').select('*').ilike('name', nameOrId).single());
      if (cancelled) return;
      if (e) { setError(new Error(e.message)); setAgent(null); } else { setAgent(data as Agent); }
      setLoading(false);
    }
    fetch();
    return () => { cancelled = true; };
  }, [nameOrId]);
  return { agent, loading, error };
}
