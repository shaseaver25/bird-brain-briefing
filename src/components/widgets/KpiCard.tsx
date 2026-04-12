import type { CostKpiPayload, LambdaKpiPayload, S3KpiPayload, Ec2KpiPayload, ErrorPayload } from '@/types/kiro';

type KpiData = CostKpiPayload | LambdaKpiPayload | S3KpiPayload | Ec2KpiPayload | ErrorPayload | null;

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${bytes} B`;
}

const isCostKpi = (d: KpiData): d is CostKpiPayload => d !== null && 'currentMonthCost' in d;
const isLambdaKpi = (d: KpiData): d is LambdaKpiPayload => d !== null && 'functionCount' in d;
const isS3Kpi = (d: KpiData): d is S3KpiPayload => d !== null && 'bucketCount' in d;
const isEc2Kpi = (d: KpiData): d is Ec2KpiPayload => d !== null && 'runningCount' in d;
const isError = (d: KpiData): d is ErrorPayload => d !== null && 'error' in d && (d as ErrorPayload).error === true;

export function KpiCard({ data, label }: { data: KpiData; label: string }) {
  if (data === null) return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm text-muted-foreground mt-1">No data</p>
    </div>
  );

  if (isError(data)) return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm text-red-500 mt-1">{data.message}</p>
    </div>
  );

  let value = '', sub: string | null = null, trendEl: React.ReactNode = null;

  if (isCostKpi(data)) {
    value = `$${data.currentMonthCost.toFixed(2)}`;
    sub = data.currency;
    const pct = data.percentageChange;
    trendEl = <span className={`text-sm font-medium ${pct > 0 ? 'text-red-500' : 'text-green-500'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>;
  } else if (isLambdaKpi(data)) {
    value = String(data.functionCount); sub = `functions · ${data.region}`;
  } else if (isS3Kpi(data)) {
    value = `${data.bucketCount} buckets`; sub = data.totalStorageBytes != null ? formatBytes(data.totalStorageBytes) : null;
  } else if (isEc2Kpi(data)) {
    value = `${data.runningCount} / ${data.totalCount}`; sub = 'running / total';
  }

  return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {trendEl}
      </div>
    </div>
  );
}
