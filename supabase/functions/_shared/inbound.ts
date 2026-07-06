// Shared inbound-lead intake: record the lead with its source tag and alert
// the team on the message bus. Used by booking-create (demo bookings) and
// inbound-intake (website form fills / manually logged contacts).

import { postMessage, serviceClient } from "./agent-bus.ts";

export const INBOUND_SOURCES = [
  "booking_page",
  "booking_agent",
  "website_form",
  "linkedin",
  "referral",
  "organic",
  "other",
] as const;
export type InboundSource = (typeof INBOUND_SOURCES)[number];

export const BUSINESSES = ["realpath", "tailoredu", "aiwhisperers", "stonearch", "unknown"] as const;

export interface InboundLead {
  name: string;
  email: string;
  company?: string;
  business?: string;
  source?: string;
  sourceDetail?: string;
  notes?: string;
  status?: "new" | "contacted" | "demo_booked" | "converted" | "closed";
}

function normalizeSource(s: unknown): InboundSource {
  const v = String(s ?? "").toLowerCase().trim();
  return (INBOUND_SOURCES as readonly string[]).includes(v) ? (v as InboundSource) : "other";
}

function normalizeBusiness(b: unknown): string {
  const v = String(b ?? "").toLowerCase().trim();
  return (BUSINESSES as readonly string[]).includes(v) ? v : "unknown";
}

// Never throws — intake failure must not break the user-facing flow
// (a lost booking is far worse than a lost attribution row).
export async function recordInboundLead(lead: InboundLead): Promise<void> {
  try {
    const sb = serviceClient();
    const source = normalizeSource(lead.source);

    // Skip duplicates: same email + source within the last 24h
    // (e.g. a double-submitted form). A repeat inquiry later still records.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from("inbound_leads")
      .select("id")
      .eq("email", lead.email.toLowerCase())
      .eq("source", source)
      .gte("created_at", dayAgo)
      .limit(1);
    if (existing && existing.length > 0) return;

    const { error } = await sb.from("inbound_leads").insert({
      name: lead.name.slice(0, 200),
      email: lead.email.toLowerCase().slice(0, 320),
      company: lead.company?.slice(0, 200) ?? null,
      business: normalizeBusiness(lead.business),
      source,
      source_detail: lead.sourceDetail?.slice(0, 500) ?? null,
      notes: lead.notes?.slice(0, 2000) ?? null,
      status: lead.status ?? "new",
    });
    if (error) {
      console.error("inbound: insert failed:", error.message);
      return;
    }

    // Bookings are announced by Swift (the scheduling agent); other inbound
    // leads by SalesHawk (the pipeline owner).
    const announcer = source === "booking_page" || source === "booking_agent" ? "swift" : "saleshawk";
    await postMessage(sb, {
      from: announcer,
      kind: "alert",
      subject: `New inbound: ${lead.name}${lead.company ? ` (${lead.company})` : ""} via ${source.replace("_", " ")}`,
      payload: {
        source,
        source_detail: lead.sourceDetail ?? null,
        business: normalizeBusiness(lead.business),
        status: lead.status ?? "new",
      },
    });
  } catch (e) {
    console.error("inbound: intake failed:", e);
  }
}
