import { useParams, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useDashboardConfig } from '@/hooks/useDashboardConfig';
import { useWidgetData } from '@/hooks/useWidgetData';
import { WidgetFactory } from '@/components/WidgetFactory';
import type { LayoutConfigItem } from '@/types/kiro';
import { ArrowLeft } from 'lucide-react';

export default function KiroDashboardPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { agent, loading: agentLoading, error: agentError } = useAgent(agentId ?? '');
  const { config, loading: configLoading } = useDashboardConfig(agentId ?? '');

  const widgetKeys = useMemo(() => {
    if (!config?.layout_config) return [];
    return (config.layout_config as unknown as LayoutConfigItem[]).map(w => w.widget_key);
  }, [config]);

  const { widgetData, loading: dataLoading } = useWidgetData(agentId ?? '', widgetKeys);

  const layout = useMemo(() => {
    if (!config?.layout_config) return [];
    return config.layout_config as unknown as LayoutConfigItem[];
  }, [config]);

  if (agentLoading || configLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading dashboard…</div>
      </div>
    );
  }

  if (agentError || !agent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">Failed to load agent</p>
        <button onClick={() => navigate('/')} className="text-sm text-primary hover:underline">← Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          {agent.avatar_url ? (
            <img src={agent.avatar_url} alt={agent.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">☁️</div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-foreground">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">{agent.role}</p>
          </div>
        </div>
        {agent.status === 'active' && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Active
          </span>
        )}
      </header>

      {/* Dashboard Grid */}
      <main className="p-6">
        {layout.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No dashboard configured</p>
            <p className="text-sm mt-1">This agent doesn't have a published dashboard yet.</p>
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: 'repeat(12, 1fr)',
            }}
          >
            {layout.map((item) => {
              const wd = widgetData[item.widget_key];
              const isStale = wd?.expires_at ? new Date(wd.expires_at) < new Date() : false;

              return (
                <div
                  key={item.widget_key}
                  className="bg-card border rounded-xl overflow-hidden shadow-sm"
                  style={{
                    gridColumn: `${item.col} / span ${item.col_span}`,
                    gridRow: item.row_span ? `${item.row} / span ${item.row_span}` : `${item.row}`,
                  }}
                >
                  <WidgetFactory
                    type={item.type}
                    data={wd?.data ?? null}
                    isLoading={dataLoading}
                    isStale={isStale}
                    widgetKey={item.widget_key}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
