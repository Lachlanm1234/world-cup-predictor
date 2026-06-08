import { supabase } from "./supabase";

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

// Fixed R32 bracket pairings that don't involve 3rd-place teams.
// These are the 4 winner-vs-runner matches and 4 runner-vs-runner matches.
// Bracket order matches the pre-seeded R32 match rows in the database.
// ⚠️  Update to match your actual DB R32 fixture list.
const FIXED_BRACKET = [
  { home: "runner", homeGroup: "A", away: "runner", awayGroup: "B" }, // 2A vs 2B
  { home: "winner", homeGroup: "C", away: "runner", awayGroup: "D" }, // 1C vs 2D
  { home: "winner", homeGroup: "E", away: "runner", awayGroup: "F" }, // 1E vs 2F
  { home: "winner", homeGroup: "G", away: "runner", awayGroup: "H" }, // 1G vs 2H
  { home: "runner", homeGroup: "I", away: "runner", awayGroup: "J" }, // 2I vs 2J
  { home: "winner", homeGroup: "K", away: "runner", awayGroup: "L" }, // 1K vs 2L
  { home: "runner", homeGroup: "C", away: "runner", awayGroup: "E" }, // 2C vs 2E
  { home: "runner", homeGroup: "G", away: "runner", awayGroup: "K" }, // 2G vs 2K
];

// ─── GROUP STANDINGS CALCULATOR ───────────────────────────────────────────────

export function calculateGroupStandings(groupMatches, predictionMap) {
  const groups = {};

  groupMatches.forEach((match) => {
    const g = match.group;
    if (!g) return;
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
  const { data: groupMatches } = await supabase
    .from("matches")
    .select("*")
    .not("group", "is", null);

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
    .eq("stage", "R32")
    .order("id", { ascending: true });

  if (!r32Matches?.length) {
    console.error("No R32 matches found in DB");
    return;
  }

  // Build Annex C mapping
  const comboKey = bestThirds.map((t) => t.group).sort().join("");
  const thirdLookup = {};
  bestThirds.forEach((t) => { thirdLookup[t.group] = t.team; });

  let annexMapping = ANNEX_C[comboKey];

  if (!annexMapping) {
    // Fallback: pair each third with a winner from the "opposite" section
    console.warn(`Annex C key "${comboKey}" not found — using fallback`);
    annexMapping = buildFallbackMapping(bestThirds);
  }

  // Build the 16 match assignments in bracket order
  // First 8: Annex C (winner vs 3rd)
  const annexAssignments = Object.entries(annexMapping).map(([winnerGroup, thirdGroup]) => ({
    home: winners[winnerGroup] || "TBD",
    away: thirdLookup[thirdGroup] || "TBD",
  }));

  // Last 8: fixed bracket (winner-runner and runner-runner pairings)
  const fixedAssignments = FIXED_BRACKET.map((slot) => ({
    home: slot.home === "winner" ? (winners[slot.homeGroup] || "TBD") : (runners[slot.homeGroup] || "TBD"),
    away: slot.away === "winner" ? (winners[slot.awayGroup] || "TBD") : (runners[slot.awayGroup] || "TBD"),
  }));

  const assignments = [...annexAssignments, ...fixedAssignments];

  for (let i = 0; i < r32Matches.length; i++) {
    const match = r32Matches[i];
    const teams = assignments[i];
    if (!match || !teams) continue;

    await supabase
      .from("matches")
      .update({ home_team: teams.home, away_team: teams.away })
      .eq("id", match.id);
  }

  console.log("R32 populated");
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
    .eq("stage", stageFrom)
    .order("id", { ascending: true });

  const { data: toMatches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", stageTo)
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
