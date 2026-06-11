const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stone Arch CRM (Supabase) — read-only via service key
const STONEARCH_URL = Deno.env.get("STONEARCH_CRM_URL") ?? "https://vvaqdqzpbtlfucsoiupc.supabase.co";
const STONEARCH_KEY = Deno.env.get("STONEARCH_CRM_SERVICE_KEY")!;
// Shannon Seaver in the Stone Arch CRM (user_profiles.id). Override via env if needed.
const SHANNON_USER_ID = Deno.env.get("STONEARCH_SHANNON_USER_ID") ?? "db8e2218-305c-48df-951c-87a40b1c64e4";

interface BoardCard {
  id: string;
  board_id: string;
  column_id: string | null;
  headline: string;
  description: string | null;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  is_blocked: boolean | null;
  assigned_to: string | null;
  updated_at: string;
}

async function crmFetch(path: string): Promise<any> {
  const r = await fetch(`${STONEARCH_URL}/rest/v1/${path}`, {
    headers: {
      apikey: STONEARCH_KEY,
      Authorization: `Bearer ${STONEARCH_KEY}`,
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Stone Arch CRM ${path} ${r.status}: ${t}`);
  }
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!STONEARCH_KEY) throw new Error("STONEARCH_CRM_SERVICE_KEY not configured");

    // Pull every board card assigned to Shannon
    const cards = (await crmFetch(
      `board_cards?assigned_to=eq.${SHANNON_USER_ID}&select=id,board_id,column_id,headline,description,priority,due_date,completed_at,is_blocked,assigned_to,updated_at&order=due_date.asc.nullslast,updated_at.desc`,
    )) as BoardCard[];

    const boardIds = [...new Set(cards.map((c) => c.board_id))];
    const columnIds = [...new Set(cards.map((c) => c.column_id).filter(Boolean) as string[])];

    const [boards, columns] = await Promise.all([
      boardIds.length
        ? crmFetch(`boards?id=in.(${boardIds.join(",")})&select=id,name,description,theme_color,is_archived,end_date,priority`)
        : Promise.resolve([]),
      columnIds.length
        ? crmFetch(`board_columns?id=in.(${columnIds.join(",")})&select=id,title,column_type,is_done_column`)
        : Promise.resolve([]),
    ]);

    const boardMap = new Map<string, any>(boards.map((b: any) => [b.id, b]));
    const colMap = new Map<string, any>(columns.map((c: any) => [c.id, c]));

    const enriched = cards.map((c) => {
      const col = c.column_id ? colMap.get(c.column_id) : null;
      const isDone = !!c.completed_at || !!col?.is_done_column;
      return {
        id: c.id,
        board_id: c.board_id,
        board_name: boardMap.get(c.board_id)?.name ?? "Board",
        column_title: col?.title ?? null,
        title: c.headline,
        description: c.description,
        priority: (c.priority as "high" | "medium" | "low" | null) ?? "medium",
        due_date: c.due_date,
        status: c.is_blocked ? "blocked" : isDone ? "done" : col?.column_type === "in_progress" ? "in_progress" : "todo",
        is_blocked: !!c.is_blocked,
        completed_at: c.completed_at,
        updated_at: c.updated_at,
      };
    });

    // Group by board for the Project Board widget
    const byBoard = new Map<string, any>();
    for (const card of enriched) {
      if (!byBoard.has(card.board_id)) {
        const b = boardMap.get(card.board_id);
        byBoard.set(card.board_id, {
          board_id: card.board_id,
          name: b?.name ?? "Board",
          description: b?.description ?? null,
          theme_color: b?.theme_color ?? null,
          end_date: b?.end_date ?? null,
          priority: b?.priority ?? "medium",
          my_cards: [] as any[],
        });
      }
      byBoard.get(card.board_id).my_cards.push(card);
    }

    const boardSummaries = [...byBoard.values()].map((b) => {
      const done = b.my_cards.filter((c: any) => c.status === "done").length;
      const blocked = b.my_cards.filter((c: any) => c.status === "blocked").length;
      const nextDue = b.my_cards
        .filter((c: any) => c.due_date && c.status !== "done")
        .map((c: any) => c.due_date)
        .sort()[0] ?? b.end_date ?? null;
      return {
        ...b,
        total: b.my_cards.length,
        done,
        blocked,
        open: b.my_cards.length - done,
        completion_pct: b.my_cards.length ? Math.round((done / b.my_cards.length) * 100) : 0,
        next_due: nextDue,
      };
    }).sort((a, b) => (b.open - b.done) - (a.open - a.done));

    return new Response(
      JSON.stringify({ user_id: SHANNON_USER_ID, total_cards: enriched.length, boards: boardSummaries, cards: enriched }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("merlin-crm-tasks failed:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});