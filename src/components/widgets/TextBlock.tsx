import type { ErrorPayload } from '@/types/kiro';

type TextBlockData = { title?: string; body: string } | ErrorPayload | null;
const isError = (d: TextBlockData): d is ErrorPayload =>
  d !== null && 'error' in (d as object) && (d as ErrorPayload).error === true;

export function TextBlock({ data, title }: { data: TextBlockData; title?: string }) {
  const heading = title ?? 'Summary';
  if (!data || isError(data)) return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <p className="text-sm text-muted-foreground mt-1">{isError(data) ? data.message : 'No data available'}</p>
    </div>
  );
  const d = data as { title?: string; body: string };
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{d.title ?? heading}</h3>
      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{d.body}</p>
    </div>
  );
}
