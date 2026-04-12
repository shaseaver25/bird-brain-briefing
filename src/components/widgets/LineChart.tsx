import type { CostTrendPayload, ErrorPayload } from '@/types/kiro';

const isError = (d: CostTrendPayload | ErrorPayload | null): d is ErrorPayload =>
  d !== null && 'error' in d && (d as ErrorPayload).error === true;

const W = 400, H = 160, P = { t: 12, r: 12, b: 32, l: 48 };

export function LineChart({ data, title }: { data: CostTrendPayload | ErrorPayload | null; title?: string }) {
  if (!data || isError(data) || !('data' in data) || data.data.length === 0) return (
    <div className="p-4">
      {title && <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>}
      <p className="text-sm text-muted-foreground">{isError(data) ? data.message : 'No trend data'}</p>
    </div>
  );

  const pts = data.data;
  const costs = pts.map(p => p.cost);
  const min = Math.min(...costs), max = Math.max(...costs), range = max - min || 1;
  const iW = W - P.l - P.r, iH = H - P.t - P.b;
  const toX = (i: number) => P.l + (i / (pts.length - 1 || 1)) * iW;
  const toY = (v: number) => P.t + iH - ((v - min) / range) * iH;
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.cost).toFixed(1)}`).join(' ');

  return (
    <div className="p-4">
      {title && <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {[min, min + range / 2, max].map(v => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={toY(v)} y2={toY(v)} stroke="currentColor" strokeOpacity={0.1} />
            <text x={P.l - 4} y={toY(v) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>${v.toFixed(0)}</text>
          </g>
        ))}
        <text x={toX(0)} y={H - 4} textAnchor="start" className="fill-muted-foreground" fontSize={9}>{pts[0].date.slice(5)}</text>
        <text x={toX(pts.length - 1)} y={H - 4} textAnchor="end" className="fill-muted-foreground" fontSize={9}>{pts[pts.length - 1].date.slice(5)}</text>
        <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={toX(i)} cy={toY(p.cost)} r={3} fill="hsl(var(--primary))" />)}
      </svg>
    </div>
  );
}
