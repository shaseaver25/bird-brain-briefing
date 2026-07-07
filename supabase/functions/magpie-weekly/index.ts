// Magpie — the finance bird. A weekly pull of cash position, unpaid invoices,
// and revenue from QuickBooks Online, summarized and posted to the team bus so
// it lands in Wren's briefing. Gated on QuickBooks credentials: until they're
// added it reports "not connected" rather than inventing numbers.
//
// Required secrets (add in Supabase → Edge Functions → Secrets):
//   QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
//   QUICKBOOKS_REFRESH_TOKEN (seed — rotates into quickbooks_auth thereafter),
//   QUICKBOOKS_REALM_ID, optional QUICKBOOKS_ENV ("production" | "sandbox").

import { corsHeaders, postMessage, serviceClient } from "../_shared/agent-bus.ts";

const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function apiBase(): string {
  return (Deno.env.get("QUICKBOOKS_ENV") ?? "production") === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

// Refresh the access token. QB rotates the refresh token on every call, so we
// read the current one from quickbooks_auth (falling back to the seed secret)
// and write the rotated value back.
async function getAccessToken(sb: ReturnType<typeof serviceClient>): Promise<{ accessToken: string; realmId: string } | null> {
  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
  const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
  const seedRefresh = Deno.env.get("QUICKBOOKS_REFRESH_TOKEN");
  const seedRealm = Deno.env.get("QUICKBOOKS_REALM_ID");
  if (!clientId || !clientSecret || (!seedRefresh && true)) return null;

  const { data: stored } = await sb.from("quickbooks_auth").select("refresh_token, realm_id").eq("id", 1).maybeSingle();
  const refreshToken = (stored?.refresh_token as string) || seedRefresh;
  const realmId = (stored?.realm_id as string) || seedRealm;
  if (!refreshToken || !realmId) return null;

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    console.error(`QuickBooks token refresh failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const tok = await res.json();
  // Persist the rotated refresh token so the next run works.
  await sb.from("quickbooks_auth").upsert({
    id: 1,
    refresh_token: tok.refresh_token ?? refreshToken,
    realm_id: realmId,
    updated_at: new Date().toISOString(),
  });
  return { accessToken: tok.access_token, realmId };
}

async function qbQuery(accessToken: string, realmId: string, query: string): Promise<any> {
  const url = `${apiBase()}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=70`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`QB query error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function qbReport(accessToken: string, realmId: string, name: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, minorversion: "70" }).toString();
  const url = `${apiBase()}/v3/company/${realmId}/reports/${name}?${qs}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`QB report ${name} error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Walk a QuickBooks report's row tree collecting {label -> amount} at the
// class/customer split level.
function collectReportRows(report: any): Array<{ label: string; amount: number }> {
  const out: Array<{ label: string; amount: number }> = [];
  const walk = (rows: any[]) => {
    for (const r of rows ?? []) {
      if (r.Rows?.Row) walk(r.Rows.Row);
      const cols = r.ColData;
      if (Array.isArray(cols) && cols.length >= 2) {
        const label = cols[0]?.value ?? "";
        const amount = parseFloat(cols[cols.length - 1]?.value ?? "");
        if (label && !isNaN(amount)) out.push({ label, amount });
      }
    }
  };
  walk(report?.Rows?.Row ?? []);
  return out;
}

async function runFinance(): Promise<void> {
  const sb = serviceClient();
  const auth = await getAccessToken(sb);

  if (!auth) {
    // Not connected — record it plainly, never fabricate figures.
    const now = new Date().toISOString();
    await sb.from("finance_snapshots").insert({
      is_connected: false,
      summary: "QuickBooks is not connected yet. Add the QUICKBOOKS_* secrets to enable Magpie's weekly finance report.",
    });
    await sb.from("widget_data").upsert({
      agent_id: "magpie",
      widget_key: "finance_summary",
      data: { is_connected: false, generated_at: now, summary: "QuickBooks not connected. Add QUICKBOOKS_* secrets to enable." },
      expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now,
    }, { onConflict: "agent_id,widget_key" });
    await postMessage(sb, {
      from: "magpie",
      subject: "Finance report unavailable — QuickBooks not connected",
      payload: { is_connected: false },
      ttlHours: 24 * 8,
    });
    console.log("magpie-weekly: QuickBooks not connected");
    return;
  }

  const { accessToken, realmId } = auth;
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;

  // Unpaid invoices.
  const invRes = await qbQuery(accessToken, realmId, "select Id, TotalAmt, Balance from Invoice where Balance != '0' maxresults 200");
  const invoices = (invRes?.QueryResponse?.Invoice ?? []) as Array<{ Balance: string }>;
  const unpaidTotal = invoices.reduce((s, i) => s + (parseFloat(i.Balance) || 0), 0);

  // Cash: sum of Bank account balances.
  const acctRes = await qbQuery(accessToken, realmId, "select Name, CurrentBalance, AccountType from Account where AccountType = 'Bank' maxresults 100");
  const banks = (acctRes?.QueryResponse?.Account ?? []) as Array<{ CurrentBalance: number }>;
  const cash = banks.reduce((s, a) => s + (Number(a.CurrentBalance) || 0), 0);

  // Revenue by business — P&L split by Class (maps to the three businesses).
  const revenueByBusiness: Record<string, number> = {};
  let totalRevenue = 0;
  try {
    const pl = await qbReport(accessToken, realmId, "ProfitAndLoss", { start_date: yearStart, end_date: today, summarize_column_by: "Classes" });
    // Total from the Income section; per-class from column headers if present.
    const rows = collectReportRows(pl);
    const income = rows.find((r) => /total income|total revenue/i.test(r.label));
    totalRevenue = income?.amount ?? rows.reduce((s, r) => s + r.amount, 0);
    for (const r of rows) {
      if (/realpath|tailoredu|tailored|whisperer|stone ?arch/i.test(r.label)) revenueByBusiness[r.label] = r.amount;
    }
  } catch (e) {
    console.warn("magpie P&L by class failed, using total only:", e);
  }

  const summary = `Cash ~$${Math.round(cash).toLocaleString()}; ${invoices.length} unpaid invoice${invoices.length !== 1 ? "s" : ""} totaling $${Math.round(unpaidTotal).toLocaleString()}; YTD revenue ~$${Math.round(totalRevenue).toLocaleString()}.`;
  const now = new Date().toISOString();

  await sb.from("finance_snapshots").insert({
    is_connected: true,
    cash_position: cash,
    unpaid_invoices_total: unpaidTotal,
    unpaid_invoices_count: invoices.length,
    revenue_by_business: revenueByBusiness,
    summary,
  });
  await sb.from("widget_data").upsert({
    agent_id: "magpie",
    widget_key: "finance_summary",
    data: { is_connected: true, generated_at: now, cash, unpaid_total: unpaidTotal, unpaid_count: invoices.length, revenue_by_business: revenueByBusiness, total_revenue: totalRevenue, summary },
    expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now,
  }, { onConflict: "agent_id,widget_key" });

  await postMessage(sb, {
    from: "magpie",
    subject: `Weekly finance: ${summary}`,
    payload: { cash, unpaid_total: unpaidTotal, unpaid_count: invoices.length },
    ttlHours: 24 * 8,
  });

  console.log(`magpie-weekly: cash ${cash}, unpaid ${invoices.length}/${unpaidTotal}`);
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // @ts-expect-error EdgeRuntime is provided by the Supabase edge runtime
  EdgeRuntime.waitUntil(runFinance().catch((err) => console.error("magpie-weekly error:", err)));

  return new Response(
    JSON.stringify({ ok: true, status: "started", agent: "magpie" }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
