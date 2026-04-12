import type { WidgetType } from '@/types/kiro';
import { KpiCard, LineChart, AlertPanel, ActivityFeed, StatusIndicator, TextBlock, QuickActions } from './widgets';

interface WidgetFactoryProps {
  type: WidgetType;
  data: unknown;
  isLoading: boolean;
  isStale: boolean;
  widgetKey: string;
}

function keyToLabel(key: string): string {
  return key.replace(/^kpi-/i, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function WidgetContent({ type, data, widgetKey }: Pick<WidgetFactoryProps, 'type' | 'data' | 'widgetKey'>) {
  const d = data as any;
  switch (type) {
    case 'kpi_card':        return <KpiCard data={d} label={keyToLabel(widgetKey)} />;
    case 'line_chart':      return <LineChart data={d} />;
    case 'alert_panel':     return <AlertPanel data={d} />;
    case 'activity_feed':   return <ActivityFeed data={d} />;
    case 'status_indicator': return <StatusIndicator data={d} />;
    case 'text_block':      return <TextBlock data={d} />;
    case 'quick_actions':   return <QuickActions data={d} />;
    default:
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Unknown widget type: <code>{type}</code>
        </div>
      );
  }
}

export function WidgetFactory({ type, data, isLoading, isStale, widgetKey }: WidgetFactoryProps) {
  if (isLoading) return <div className="animate-pulse h-full bg-muted rounded-xl" />;

  const widget = <WidgetContent type={type} data={data} widgetKey={widgetKey} />;

  if (isStale) {
    return (
      <div className="relative">
        {widget}
        <span className="absolute top-2 right-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
          Stale data
        </span>
      </div>
    );
  }

  return widget;
}
