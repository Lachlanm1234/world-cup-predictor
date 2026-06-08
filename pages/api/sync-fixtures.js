import { supabaseAdmin } from "../../lib/supabase-admin";

const FD_BASE = "https://api.football-data.org/v4";
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY;

async function fdFetch(path) {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": FD_KEY },
  });
  const remaining = res.headers.get("X-Requests-Available-Minute");
  const reset = res.headers.get("X-RequestCounter-Reset");
  console.log(`football-data.org [${path}] status=${res.status} remaining=${remaining} reset=${reset}s`);
  if (res.status === 429) throw new Error(`Rate limited — resets in ${reset ?? 60}s`);
  if (!res.ok) { const text = await res.text(); throw new Error(`${path} → ${res.status}: ${text}`); }
  return res.json();
}

// Maps football-data.org stage strings to our DB stage values
const STAGE_MAP = {
  ROUND_OF_32:    "Round of 32",
  ROUND_OF_16:    "Round of 16",
  QUARTER_FINALS: "Quarter Final",
  SEMI_FINALS:    "Semi - Final",
  FINAL:          "Final",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!FD_KEY) return res.status(500).json({ error: "FOOTBALL_DATA_API_KEY not set" });

  try {
    const data = await fdFetch("/competitions/WC/matches");
    const apiMatches = data.matches ?? [];

    // Only knockout matches with real team names (not placeholders)
    const knockoutFixtures = apiMatches.filter((m) => {
      const dbStage = STAGE_MAP[m.stage];
      if (!dbStage) return false;
      const homeName = m.homeTeam?.name;
      const awayName = m.awayTeam?.name;
      // Skip if either team is still a placeholder (contains "Winner", "Loser", "Group", etc.)
      if (!homeName || !awayName) return false;
      if (/winner|loser|group|runner|best|tbd/i.test(homeName + awayName)) return false;
      return true;
    });

    if (knockoutFixtures.length === 0) {
      return res.json({ ok: true, updated: 0, message: "No confirmed knockout fixtures yet" });
    }

    // Group API fixtures by stage, sorted by date
    const apiByStage = {};
    knockoutFixtures.forEach((m) => {
      const s = STAGE_MAP[m.stage];
      if (!apiByStage[s]) apiByStage[s] = [];
      apiByStage[s].push(m);
    });
    Object.values(apiByStage).forEach((arr) => arr.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)));

    // Load our DB knockout slots per stage, sorted by id
    const { data: dbMatches, error: dbErr } = await supabaseAdmin
      .from("matches")
      .select("id, stage, home_team, away_team")
      .in("stage", Object.values(STAGE_MAP));
    if (dbErr) throw dbErr;

    const dbByStage = {};
    dbMatches.forEach((m) => {
      if (!dbByStage[m.stage]) dbByStage[m.stage] = [];
      dbByStage[m.stage].push(m);
    });
    Object.values(dbByStage).forEach((arr) => arr.sort((a, b) => (a.id > b.id ? 1 : -1)));

    let updated = 0;
    const skipped = [];

    for (const [stage, apiList] of Object.entries(apiByStage)) {
      const dbList = dbByStage[stage] || [];
      for (let i = 0; i < apiList.length; i++) {
        const api = apiList[i];
        const db = dbList[i];
        if (!db) { skipped.push(`${stage} slot ${i + 1} — no DB slot`); continue; }

        const homeName = api.homeTeam.name;
        const awayName = api.awayTeam.name;

        // Skip if already set correctly
        if (db.home_team === homeName && db.away_team === awayName) continue;

        const { error } = await supabaseAdmin
          .from("matches")
          .update({ home_team: homeName, away_team: awayName })
          .eq("id", db.id);

        if (!error) updated++;
        else skipped.push(`${stage} slot ${i + 1}: ${error.message}`);
      }
    }

    return res.json({ ok: true, updated, skipped, knockoutFixtures: knockoutFixtures.length });
  } catch (err) {
    console.error("sync-fixtures error:", err);
    return res.status(500).json({ error: err.message });
  }
}
