import { supabaseAdmin } from "../../lib/supabase-admin";

const FD_BASE = "https://api.football-data.org/v4";
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY;

async function fdFetch(path) {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": FD_KEY },
  });

  // Respect rate-limit headers — log remaining quota so we can see it in Render logs
  const remaining = res.headers.get("X-Requests-Available-Minute");
  const reset = res.headers.get("X-RequestCounter-Reset");
  console.log(`football-data.org [${path}] status=${res.status} remaining=${remaining} reset=${reset}s`);

  if (res.status === 429) {
    const wait = Number(reset ?? 60);
    throw new Error(`Rate limited — ${remaining} requests left, resets in ${wait}s. Try again shortly.`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`football-data.org ${path} → ${res.status}: ${text}`);
  }

  return res.json();
}

const normalise = (s) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (req.headers["x-sync-secret"] !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!FD_KEY) return res.status(500).json({ error: "FOOTBALL_DATA_API_KEY not set" });

  try {
    // Single request — all 104 WC matches in one call
    const data = await fdFetch("/competitions/WC/matches");
    const apiMatches = data.matches ?? [];
    const finished = apiMatches.filter((m) => m.status === "FINISHED");

    // Load our DB matches
    const { data: dbMatches, error: dbErr } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team");
    if (dbErr) throw dbErr;

    // Index by normalised "home|away" for name-tolerant matching
    const dbIndex = {};
    dbMatches.forEach((m) => {
      dbIndex[`${normalise(m.home_team)}|${normalise(m.away_team)}`] = m.id;
    });

    let updated = 0;
    const notMatched = [];

    for (const match of finished) {
      // football-data.org provides both name and shortName — try both
      const homeNames = [match.homeTeam?.name, match.homeTeam?.shortName, match.homeTeam?.tla].filter(Boolean);
      const awayNames = [match.awayTeam?.name, match.awayTeam?.shortName, match.awayTeam?.tla].filter(Boolean);

      let dbId = null;
      outer: for (const h of homeNames) {
        for (const a of awayNames) {
          const key = `${normalise(h)}|${normalise(a)}`;
          if (dbIndex[key]) { dbId = dbIndex[key]; break outer; }
        }
      }

      if (!dbId) {
        notMatched.push(`${match.homeTeam?.name} v ${match.awayTeam?.name}`);
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
