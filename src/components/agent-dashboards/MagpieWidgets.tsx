import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, FileWarning, TrendingUp, RefreshCw, AlertTriangle } from "lucide-react";

interface FinanceData {
  is_connected: boolean;
  generated_at?: string;
  cash?: number;
  unpaid_total?: number;
  unpaid_count?: number;
  total_revenue?: number;
  revenue_by_business?: Record<string, number>;
  summary?: string;
}

function money(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString();
}

export default function MagpieWidgets() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const { data: row } = await supabase
      .from("widget_data")
      .select("data, updated_at")
      .eq("agent_id", "magpie")
      .eq("widget_key", "finance_summary")
      .maybeSingle();
    if (row?.data) setData(row.data as unknown as FinanceData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("magpie-weekly");
      setTimeout(async () => { await load(); setRunning(false); }, 5000);
    } catch { setRunning(false); }
  };

  const byBusiness = data?.revenue_by_business ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Magpie</h2>
          <p className="text-sm text-muted-foreground">Finance — cash, unpaid invoices, and revenue across the businesses</p>
        </div>
        <Button onClick={runNow} disabled={running} className="bg-amber-500 hover:bg-amber-600 text-white">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Pulling…" : "Run weekly report"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : !data ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No finance report yet — click Run weekly report.</CardContent></Card>
      ) : !data.is_connected ? (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              QuickBooks not connected
            </CardTitle>
            <CardDescription>{data.summary}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>Add these secrets in Supabase → Edge Functions → Secrets, then run again:</p>
            <p className="font-mono text-xs">QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REFRESH_TOKEN, QUICKBOOKS_REALM_ID</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" /> Cash position</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{money(data.cash)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><FileWarning className="h-4 w-4" /> Unpaid invoices</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{money(data.unpaid_total)}</p><p className="text-xs text-muted-foreground">{data.unpaid_count ?? 0} outstanding</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /> Revenue (YTD)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{money(data.total_revenue)}</p></CardContent>
            </Card>
          </div>

          {Object.keys(byBusiness).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by business</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byBusiness).map(([biz, amt]) => (
                  <div key={biz} className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0">
                    <span className="text-sm">{biz}</span>
                    <span className="text-sm font-medium">{money(amt as number)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.summary && (
            <p className="text-xs text-muted-foreground">
              {data.summary}
              {data.generated_at && ` · as of ${new Date(data.generated_at).toLocaleString()}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
