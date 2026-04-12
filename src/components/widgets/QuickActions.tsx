import type { ErrorPayload } from '@/types/kiro';

type QAData = { actions: { label: string; url: string; icon?: string }[] } | ErrorPayload | null;
const isError = (d: QAData): d is ErrorPayload =>
  d !== null && 'error' in (d as object) && (d as ErrorPayload).error === true;

export function QuickActions({ data, title }: { data: QAData; title?: string }) {
  const heading = title ?? 'Quick Actions';
  if (!data || isError(data)) return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <p className="text-sm text-muted-foreground mt-1">{isError(data) ? data.message : 'No data available'}</p>
    </div>
  );
  const { actions } = data as { actions: { label: string; url: string; icon?: string }[] };
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{heading}</h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border hover:bg-accent transition-colors">
            {a.icon && <span>{a.icon}</span>}
            {a.label}
          </a>
        ))}
      </div>
    </div>
  );
}
