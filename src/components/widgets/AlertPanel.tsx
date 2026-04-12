import type { HealthAlertsPayload, ErrorPayload } from '@/types/kiro';

const isError = (d: HealthAlertsPayload | ErrorPayload | null): d is ErrorPayload =>
  d !== null && 'error' in d && (d as ErrorPayload).error === true;

const statusColor = (s: string) =>
  s === 'open' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
  s === 'upcoming' ? 'bg-blue-100 text-blue-800 border-blue-200' :
  'bg-gray-100 text-gray-700 border-gray-200';

export function AlertPanel({ data, title }: { data: HealthAlertsPayload | ErrorPayload | null; title?: string }) {
  const heading = title ?? 'AWS Health Alerts';
  if (!data) return <div className="p-4"><h3 className="text-sm font-semibold text-foreground">{heading}</h3><p className="text-sm text-muted-foreground mt-1">No data available</p></div>;

  if (isError(data)) {
    const e = data as ErrorPayload & { code?: string };
    if (e.code === 'HEALTH_SUPPORT_PLAN_REQUIRED') return (
      <div className="p-4">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <p className="text-sm text-yellow-600 mt-1">AWS Health requires Business/Enterprise support plan</p>
      </div>
    );
    return <div className="p-4"><h3 className="text-sm font-semibold text-foreground">{heading}</h3><p className="text-sm text-red-500 mt-1">{data.message}</p></div>;
  }

  if (!data.alerts?.length) return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <p className="text-sm text-green-600 mt-1">No active health alerts</p>
    </div>
  );

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{heading}</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {data.alerts.map((a, i) => (
          <div key={i} className="border rounded-lg p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{a.eventTypeCode}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${statusColor(a.statusCode)}`}>{a.statusCode}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{a.service} · {a.region} · {new Date(a.startTime).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
