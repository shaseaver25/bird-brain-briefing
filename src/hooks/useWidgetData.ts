import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WidgetDataRow } from '@/types/kiro';

export function useWidgetData(agentId: string, widgetKeys: string[]) {
  const [widgetData, setWidgetData] = useState<Record<string, WidgetDataRow>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!agentId || widgetKeys.length === 0) { setWidgetData({}); setLoading(false); return; }
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      const { data, error } = await supabase.from('widget_data').select('*').eq('agent_id', agentId).in('widget_key', widgetKeys);
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
  }, [agentId, widgetKeys.join(',')]);
  return { widgetData, loading };
}
