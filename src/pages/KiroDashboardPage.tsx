import { useParams, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useMemo } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useDashboardConfig } from '@/hooks/useDashboardConfig';
import { useWidgetData } from '@/hooks/useWidgetData';
import { WidgetFactory } from '@/components/WidgetFactory';
import type { LayoutConfigItem } from '@/types/kiro';
import { ArrowLeft } from 'lucide-react';

// Role-specific widget sets — lazy loaded by agent name
const ROLE_WIDGETS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  wren: lazy(() => import('@/components/agent-dashboards/WrenWidgets')),
  saleshawk: lazy(() => import('@/components/agent-dashboards/SalesHawkWidgets')),
  osprey: lazy(() => import('@/components/agent-dashboards/OspreyWidgets')),
  merlin: lazy(() => import('@/components/agent-dashboards/MerlinWidgets')),
  kiro: lazy(() => import('@/components/agent-dashboards/KiroWidgets')),
  warbler: lazy(() => import('@/components/agent-dashboards/KiroWidgets')),
};

function resolveWidgetKey(agent: { name: string; role: string }): string | null {
  const name = agent.name.toLowerCase();
  if (ROLE_WIDGETS[name]) return name;
  // Fallback: match by role keywords
  const role = agent.role.toLowerCase();
  if (role.includes('strategy') || role.includes('executive')) return 'wren';
  if (role.includes('sales')) return 'saleshawk';
  if (role.includes('architect')) return 'osprey';
  if (role.includes('project') || role.includes('tracker')) return 'merlin';
  if (role.includes('cloud') || role.includes('orchestrat')) return 'kiro';
  return null;
}

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

  // Resolve role-specific widget set — try Supabase agent first, fall back to URL param
  const roleKey = agent
    ? resolveWidgetKey(agent)
    : (agentId && ROLE_WIDGETS[agentId.toLowerCase()]) ? agentId.toLowerCase() : null;
  const RoleWidgets = roleKey ? ROLE_WIDGETS[roleKey] : null;

  // Fallback agent info from URL when Supabase doesn't have the agent
  const FALLBACK_AGENTS: Record<string, { name: string; role: string }> = {
    wren: { name: 'Wren', role: 'Strategy Lead' },
    saleshawk: { name: 'SalesHawk', role: 'Sales Lead' },
    osprey: { name: 'Osprey', role: 'Agent Architect' },
    merlin: { name: 'Merlin', role: 'Project Tracker' },
    kiro: { name: 'Kiro', role: 'Cloud Orchestrator' },
    warbler: { name: 'Kiro', role: 'Cloud Orchestrator' },
  };

  // Try fallback by name key first, then search app_config agents by UUID
  const displayAgent = agent
    || (agentId && FALLBACK_AGENTS[agentId.toLowerCase()])
    || null;

  if (agentLoading || configLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading dashboard…</div>
      </div>
    );
  }

  // Only show error if we have no agent AND no role widgets to fall back to
  if (!displayAgent && !RoleWidgets) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">Agent not found</p>
        <button onClick={() => navigate('/')} className="text-sm text-primary hover:underline">← Back</button>
      </div>
    );
  }

  const agentName = displayAgent?.name || agentId || 'Agent';
  const agentRole = displayAgent?.role || '';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          {agent?.avatar_url ? (
            <img src={agent.avatar_url} alt={agentName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
              {agentName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-foreground">{agentName}</h1>
            <p className="text-sm text-muted-foreground">{agentRole}</p>
          </div>
        </div>
        {agent?.status === 'active' && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Active
          </span>
        )}
      </header>

      {/* Dashboard Content */}
      <main className="p-6 max-w-6xl mx-auto">
        {/* Role-specific widgets (always shown if available) */}
        {RoleWidgets && (
          <Suspense fallback={<div className="animate-pulse text-muted-foreground text-center py-12">Loading widgets…</div>}>
            <RoleWidgets />
          </Suspense>
        )}

        {/* Supabase-configured widget grid (shown below role widgets if configured) */}
        {layout.length > 0 && (
          <div className={RoleWidgets ? "mt-8 pt-8 border-t border-border" : ""}>
            {RoleWidgets && (
              <h2 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-4">Custom Widgets</h2>
            )}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}
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
          </div>
        )}

        {/* Fallback when no widgets at all */}
        {!RoleWidgets && layout.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No dashboard configured</p>
            <p className="text-sm mt-1">This agent doesn't have a published dashboard yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
