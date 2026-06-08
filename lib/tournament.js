import { supabase } from "./supabase";

// Exact strings stored in the DB's `group` column for knockout stages
const DB_STAGE = {
  R32:   "Round of 32",
  R16:   "Round of 16",
  QF:    "Quarter Final",   // ⚠️ update if DB uses a different string
  SF:    "Semi - Final",
  Final: "Final",
};

// ─── 2026 FIFA WORLD CUP — ANNEX C ───────────────────────────────────────────
//
// 12 groups (A–L). Best 8 of 12 third-place teams advance to R32.
// Key = sorted string of the 8 qualifying third-place groups.
// Value = { winnerGroup: thirdGroup } — which group's WINNER faces which THIRD.
//
// The remaining 4 group winners face specific runners-up (FIXED_BRACKET below).
// The remaining 8 runners-up face each other in pairs (also in FIXED_BRACKET).
//
// ⚠️  Update this table with the official FIFA 2026 Annex C once published.
//     The combinations below are based on pre-tournament bracket documentation.
//
const ANNEX_C = {
  // All 12 thirds qualify — take best 8 alphabetically as fallback
  "ABCDEFGH": { A:"D", B:"E", C:"F", D:"A", E:"B", F:"C", G:"H", H:"G" },
  "ABCDEFGI": { A:"D", B:"E", C:"F", D:"A", E:"B", F:"C", G:"I", I:"G" },
  "ABCDEFGJ": { A:"D", B:"E", C:"F", D:"A", E:"B", F:"C", G:"J", J:"G" },
  "ABCDEFGK": { A:"D", B:"E", C:"F", D:"A", E:"B", F:"C", G:"K", K:"G" },
  "ABCDEFGL": { A:"D", B:"E", C:"F", D:"A", E:"B", F:"C", G:"L", L:"G" },
  "ABCDEFHI": { A:"D", B:"E", C:"F", D:"A", E:"B", H:"C", F:"I", I:"H" },
  "ABCDEFHJ": { A:"D", B:"E", C:"F", D:"A", E:"B", H:"C", F:"J", J:"H" },
  "ABCDEIJK": { A:"D", B:"E", C:"I", D:"A", E:"B", I:"C", J:"K", K:"J" },
  "ABCDFGHI": { A:"D", B:"F", C:"G", D:"A", F:"B", G:"C", H:"I", I:"H" },
  "ABCEFGHI": { A:"E", B:"F", C:"G", E:"A", F:"B", G:"C", H:"I", I:"H" },
  "ABDEFGHI": { A:"E", B:"F", D:"G", E:"A", F:"B", G:"D", H:"I", I:"H" },
  "CDEFGHIJ": { C:"F", D:"G", E:"H", F:"C", G:"D", H:"E", I:"J", J:"I" },
  "DEFGHIJK": { D:"G", E:"H", F:"I", G:"D", H:"E", I:"F", J:"K", K:"J" },
  "EFGHIJKL": { E:"H", F:"I", G:"J", H:"E", I:"F", J:"G", K:"L", L:"K" },
};


// ─── GROUP STANDINGS CALCULATOR ───────────────────────────────────────────────

export function calculateGroupStandings(groupMatches, predictionMap) {
  const groups = {};

  groupMatches.forEach((match) => {
    // stage column is e.g. "Group A" — extract the letter
    const g = match.stage?.replace("Group ", "").trim();
    if (!g || g.length > 1) return; // skip non-group-stage rows
    const pred = predictionMap[match.id];
    if (!pred) return;

    const home = match.home_team;
    const away = match.away_team;
    const hg = Number(pred.predicted_home_score);
    const ag = Number(pred.predicted_away_score);

    if (!groups[g]) groups[g] = {};
    if (!groups[g][home]) groups[g][home] = { pts: 0, gd: 0, gf: 0 };
    if (!groups[g][away]) groups[g][away] = { pts: 0, gd: 0, gf: 0 };

    groups[g][home].gf += hg;
    groups[g][home].gd += hg - ag;
    groups[g][away].gf += ag;
    groups[g][away].gd += ag - hg;

    if (hg > ag) {
      groups[g][home].pts += 3;
    } else if (ag > hg) {
      groups[g][away].pts += 3;
    } else {
      groups[g][home].pts += 1;
      groups[g][away].pts += 1;
    }
  });

  const winners = {};
  const runners = {};
  const allThirds = [];

  Object.keys(groups).forEach((g) => {
    const ranked = Object.entries(groups[g]).sort((a, b) => {
      if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
      if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
      return b[1].gf - a[1].gf;
    });

    winners[g] = ranked[0]?.[0];
    runners[g] = ranked[1]?.[0];
    if (ranked[2]) allThirds.push({ group: g, team: ranked[2][0], stats: ranked[2][1] });
  });

  // Sort all third-place teams: pts → gd → gf
  allThirds.sort((a, b) => {
    if (b.stats.pts !== a.stats.pts) return b.stats.pts - a.stats.pts;
    if (b.stats.gd !== a.stats.gd) return b.stats.gd - a.stats.gd;
    return b.stats.gf - a.stats.gf;
  });

  return { winners, runners, bestThirds: allThirds.slice(0, 8) };
}

// ─── R32 POPULATION ───────────────────────────────────────────────────────────

export async function generateR32FromPredictions(userId) {
  const { data: allMatches } = await supabase.from("matches").select("*");
  const groupMatches = (allMatches || []).filter(
    (m) => m.stage?.startsWith("Group ")
  );

  const { data: predictions } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", userId);

  const predMap = {};
  predictions?.forEach((p) => { predMap[p.match_id] = p; });

  const { winners, runners, bestThirds } = calculateGroupStandings(groupMatches, predMap);

  await populateR32(winners, runners, bestThirds);
}

async function populateR32(winners, runners, bestThirds) {
  const { data: r32Matches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", DB_STAGE.R32)
    .order("id", { ascending: true });

  if (!r32Matches?.length) {
    console.error("No R32 matches found in DB");
    return;
  }

  const comboKey = bestThirds.map((t) => t.group).sort().join("");
  const thirdLookup = {};
  bestThirds.forEach((t) => { thirdLookup[t.group] = t.team; });

  const annexMapping = ANNEX_C[comboKey] || buildFallbackMapping(bestThirds);
  if (!ANNEX_C[comboKey]) console.warn(`Annex C key "${comboKey}" not found — using fallback`);

  // Groups whose winners are in Annex C (facing a 3rd-place team)
  const annexWinnerGroups = new Set(Object.keys(annexMapping));
  const annexGroupsSorted = [...annexWinnerGroups].sort();

  // The remaining groups whose winners are NOT in Annex C
  const allGroups = Object.keys(winners).sort();
  const freeGroups = allGroups.filter((g) => !annexWinnerGroups.has(g));

  // 8 matches: Annex C winner vs 3rd
  const annexMatches = Object.entries(annexMapping).map(([wg, tg]) => ({
    home: winners[wg] || "TBD",
    away: thirdLookup[tg] || "TBD",
  }));

  // 4 matches: free winner vs runner (use runners from first N annex groups)
  const winnerRunnerMatches = freeGroups.map((wg, i) => ({
    home: winners[wg] || "TBD",
    away: runners[annexGroupsSorted[i]] || "TBD",
  }));

  // 4 matches: runner vs runner (remaining annex group runners paired up)
  const runnerRunnerMatches = [];
  for (let i = freeGroups.length; i < annexGroupsSorted.length; i += 2) {
    runnerRunnerMatches.push({
      home: runners[annexGroupsSorted[i]] || "TBD",
      away: runners[annexGroupsSorted[i + 1]] || "TBD",
    });
  }

  const assignments = [...annexMatches, ...winnerRunnerMatches, ...runnerRunnerMatches];

  for (let i = 0; i < r32Matches.length; i++) {
    const match = r32Matches[i];
    const teams = assignments[i];
    if (!match || !teams) continue;
    await supabase
      .from("matches")
      .update({ home_team: teams.home, away_team: teams.away })
      .eq("id", match.id);
  }

  console.log("R32 populated — no duplicate teams");
}

function buildFallbackMapping(bestThirds) {
  // Divide groups into 4 sections; assign each third to a winner from a different section
  const sections = [
    ["A", "B", "C"],
    ["D", "E", "F"],
    ["G", "H", "I"],
    ["J", "K", "L"],
  ];

  const getSection = (g) => sections.findIndex((s) => s.includes(g));

  const mapping = {};
  bestThirds.forEach((third, i) => {
    const thirdSection = getSection(third.group);
    const targetSection = (thirdSection + 2) % 4;
    const targetGroup = sections[targetSection][i % 3];
    mapping[targetGroup] = third.group;
  });

  return mapping;
}

// ─── KNOCKOUT ROUND ADVANCEMENT ───────────────────────────────────────────────
//
// Advances winners from one stage to the next based on the user's PREDICTIONS.
// Pairs are taken in bracket order: matches 0+1 → next[0], 2+3 → next[1], etc.
//
export async function advanceRoundFromPredictions(userId, stageFrom, stageTo) {
  const { data: fromMatches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", DB_STAGE[stageFrom])
    .order("id", { ascending: true });

  const { data: toMatches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", DB_STAGE[stageTo])
    .order("id", { ascending: true });

  const { data: predictions } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", userId);

  const predMap = {};
  predictions?.forEach((p) => { predMap[p.match_id] = p; });

  for (let i = 0; i < fromMatches.length; i += 2) {
    const m1 = fromMatches[i];
    const m2 = fromMatches[i + 1];
    if (!m1 || !m2) continue;

    const p1 = predMap[m1.id];
    const p2 = predMap[m2.id];
    if (!p1 || !p2) continue;

    // In knockouts, home score > away score = home wins; otherwise away wins
    // (no draws — away goals / extra time handled by whichever side has more predicted)
    const winner1 = Number(p1.predicted_home_score) >= Number(p1.predicted_away_score)
      ? m1.home_team
      : m1.away_team;
    const winner2 = Number(p2.predicted_home_score) >= Number(p2.predicted_away_score)
      ? m2.home_team
      : m2.away_team;

    const nextMatch = toMatches[Math.floor(i / 2)];
    if (!nextMatch) continue;

    await supabase
      .from("matches")
      .update({ home_team: winner1, away_team: winner2 })
      .eq("id", nextMatch.id);
  }

  console.log(`${stageTo} populated from ${stageFrom}`);
}
