import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Only use in API routes (server-side).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
