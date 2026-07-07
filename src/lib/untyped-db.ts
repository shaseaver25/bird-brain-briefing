import { supabase } from "@/integrations/supabase/client";

/**
 * Some tables (agents, agent_profiles, conversations, clients, guidebooks, …)
 * aren't in the generated Supabase types. Route their access through this one
 * helper instead of scattering `as any` / `as never` casts across the app.
 *
 * The query builder is returned fully chainable; cast the resulting `data` to a
 * local row interface at the call site when you read fields off it.
 */
export const db = (table: string) =>
  supabase.from(table as never) as ReturnType<typeof supabase.from>;
