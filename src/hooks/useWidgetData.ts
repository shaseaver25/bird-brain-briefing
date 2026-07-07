import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WidgetDataRow } from '@/types/kiro';

export function useWidgetData(agentId: string, widgetKeys: string[]) {
  const [widgetData, setWidgetData] = useState<Record<string, WidgetDataRow>>({});
  const [loading, setLoading] = useState(true);
  // Depend on a stable joined string rather than the array identity, and rebuild
  // the key list from it inside the effect so the dependency list is complete.
  const keysKey = widgetKeys.join(',');
  useEffect(() => {
    const keys = keysKey ? keysKey.split(',') : [];
    if (!agentId || keys.length === 0) { setWidgetData({}); setLoading(false); return; }
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      const { data, error } = await supabase.from('widget_data').select('*').eq('agent_id', agentId).in('widget_key', keys);
      if (cancelled) return;
      if (!error && data) {
        const record: Record<string, WidgetDataRow> = {};
        for (const row of data as WidgetDataRow[]) record[row.widget_key] = row;
        setWidgetData(record);
      }
      setLoading(false);
    }
    fetch();
    return () => { cancelled = true; };
  }, [agentId, keysKey]);
  return { widgetData, loading };
}
