import type { CloudWatchFeedPayload, ErrorPayload } from '@/types/kiro';

const isError = (d: CloudWatchFeedPayload | ErrorPayload | null): d is ErrorPayload =>
  d !== null && 'error' in d && (d as ErrorPayload).error === true;

export function ActivityFeed({ data, title }: { data: CloudWatchFeedPayload | ErrorPayload | null; title?: string }) {
  const heading = title ?? 'CloudWatch Activity';
  if (!data || isError(data)) return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <p className="text-sm text-muted-foreground mt-1">{isError(data) ? data.message : 'No data available'}</p>
    </div>
  );
  if (!data.events?.length) return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <p className="text-sm text-muted-foreground mt-1">No recent log events</p>
    </div>
  );
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{heading}</h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {data.events.map((ev, i) => (
          <div key={i} className="border rounded-lg p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">{ev.logGroup}</span>
              <span className="text-xs text-muted-foreground">{new Date(ev.timestamp).toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{ev.message.length > 100 ? ev.message.slice(0, 100) + '…' : ev.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
