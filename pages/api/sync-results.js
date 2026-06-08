import { supabaseAdmin } from "../../lib/supabase-admin";

// football-data.org v4 — 2026 FIFA World Cup competition code is "WC"
const FD_BASE = "https://api.football-data.org/v4";
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY;

async function fdFetch(path) {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": FD_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`football-data.org ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!FD_KEY) return res.status(500).json({ error: "FOOTBALL_DATA_API_KEY not set" });

  try {
    // Fetch all WC matches — returns up to 100 per page; WC has 104 total
    const data = await fdFetch("/competitions/WC/matches?limit=200");
    const matches = data.matches ?? [];

    const finished = matches.filter((m) => m.status === "FINISHED");

    // Load our DB matches for name-based lookup
    const { data: dbMatches, error: dbErr } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team");
    if (dbErr) throw dbErr;

    // Normalise team names to lower-case for fuzzy matching
    const normalise = (s) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

    const dbIndex = {};
    dbMatches.forEach((m) => {
      dbIndex[`${normalise(m.home_team)}|${normalise(m.away_team)}`] = m.id;
    });

    let updated = 0;
    const notMatched = [];

    for (const match of finished) {
      const homeName = match.homeTeam?.name ?? match.homeTeam?.shortName ?? "";
      const awayName = match.awayTeam?.name ?? match.awayTeam?.shortName ?? "";
      const key = `${normalise(homeName)}|${normalise(awayName)}`;
      const dbId = dbIndex[key];

      if (!dbId) {
        notMatched.push(`${homeName} v ${awayName}`);
        continue;
      }

      const homeScore = match.score?.fullTime?.home ?? 0;
      const awayScore = match.score?.fullTime?.away ?? 0;

      const { error: upErr } = await supabaseAdmin
        .from("matches")
        .update({ home_score: homeScore, away_score: awayScore, is_finished: true })
        .eq("id", dbId);

      if (!upErr) updated++;
    }

    return res.json({ ok: true, finished: finished.length, updated, notMatched });
  } catch (err) {
    console.error("sync-results error:", err);
    return res.status(500).json({ error: err.message });
  }
}
