interface KpiCardProps {
  data: unknown;
  label: string;
}

export function KpiCard({ data, label }: KpiCardProps) {
  const d = data as { currentMonthCost?: number; value?: number; percentageChange?: number; currency?: string } | null;
  const value = d?.currentMonthCost ?? d?.value ?? 0;
  const change = d?.percentageChange ?? 0;
  const currency = d?.currency ?? '';

  return (
    <div className="p-4">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">
        {currency}{typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {change !== 0 && (
        <p className={`text-xs mt-1 ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change > 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </p>
      )}
    </div>
  );
}
