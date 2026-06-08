import { supabaseAdmin } from "../../lib/supabase-admin";

const API_BASE = "https://worldcup26.ir";

async function apiFetch(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

async function getToken() {
  // Prefer a pre-set long-lived token; fall back to password auth
  if (process.env.WORLDCUP_API_TOKEN) return process.env.WORLDCUP_API_TOKEN;

  const res = await fetch(`${API_BASE}/auth/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.WORLDCUP_API_EMAIL,
      password: process.env.WORLDCUP_API_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error("Failed to authenticate with worldcup API");
  const data = await res.json();
  return data.token || data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Simple secret to prevent random callers triggering syncs
  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = await getToken();

    const [games, teams] = await Promise.all([
      apiFetch("/get/games", token),
      apiFetch("/get/teams", token),
    ]);

    // Build team-id → name map
    const teamName = {};
    (Array.isArray(teams) ? teams : teams.teams ?? []).forEach((t) => {
      teamName[t.id] = t.name;
    });

    // Load our DB matches
    const { data: dbMatches, error } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team");
    if (error) throw error;

    // Index DB matches by "HomeTeam|AwayTeam" for quick lookup
    const dbIndex = {};
    dbMatches.forEach((m) => {
      dbIndex[`${m.home_team}|${m.away_team}`] = m.id;
    });

    const gamesArr = Array.isArray(games) ? games : games.games ?? [];
    const finished = gamesArr.filter(
      (g) => g.finished === true || g.finished === "TRUE" || g.finished === "true"
    );

    let updated = 0;
    const notMatched = [];

    for (const game of finished) {
      const homeName = teamName[game.home_team_id] ?? game.home_team_id;
      const awayName = teamName[game.away_team_id] ?? game.away_team_id;
      const key = `${homeName}|${awayName}`;
      const dbId = dbIndex[key];

      if (!dbId) {
        notMatched.push(key);
        continue;
      }

      const { error: upErr } = await supabaseAdmin
        .from("matches")
        .update({
          home_score: game.home_score ?? 0,
          away_score: game.away_score ?? 0,
          is_finished: true,
        })
        .eq("id", dbId);

      if (!upErr) updated++;
    }

    return res.json({
      ok: true,
      finished: finished.length,
      updated,
      notMatched,
    });
  } catch (err) {
    console.error("sync-results error:", err);
    return res.status(500).json({ error: err.message });
  }
}
