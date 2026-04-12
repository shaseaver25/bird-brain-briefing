import type { ServiceStatusPayload, ErrorPayload } from '@/types/kiro';

const isError = (d: ServiceStatusPayload | ErrorPayload | null): d is ErrorPayload =>
  d !== null && 'error' in d && (d as ErrorPayload).error === true;

const dot = (s: string) => s === 'operational' ? 'bg-green-500' : s === 'permission_error' ? 'bg-red-500' : 'bg-gray-400';
const label = (s: string) => s === 'operational' ? 'Operational' : s === 'permission_error' ? 'Permission error' : 'Unknown';

export function StatusIndicator({ data, title }: { data: ServiceStatusPayload | ErrorPayload | null; title?: string }) {
  const heading = title ?? 'Service Status';
  if (!data || isError(data)) return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <p className="text-sm text-muted-foreground mt-1">{isError(data) ? data.message : 'No data available'}</p>
    </div>
  );
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{heading}</h3>
      <div className="space-y-1.5">
        {data.services.map((svc, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-foreground">{svc.service}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${dot(svc.status)}`} />
              {label(svc.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
