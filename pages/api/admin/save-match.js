import { supabaseAdmin } from "../../../lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  if (user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return res.status(403).json({ error: "Forbidden" });

  const { matchId, payload } = req.body;
  if (!matchId || !payload) return res.status(400).json({ error: "Missing matchId or payload" });

  const { error } = await supabaseAdmin.from("matches").update(payload).eq("id", matchId);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
}
