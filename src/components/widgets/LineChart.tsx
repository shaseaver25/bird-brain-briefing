import { LineChart as RechartsLine, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LineChartProps {
  data: unknown;
}

export function LineChart({ data }: LineChartProps) {
  const d = data as { data?: { date: string; cost: number }[] } | null;
  const points = d?.data ?? [];

  if (points.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No chart data available</div>;
  }

  return (
    <div className="p-4 h-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLine data={points}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
        </RechartsLine>
      </ResponsiveContainer>
    </div>
  );
}
