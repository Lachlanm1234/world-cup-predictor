// Exact strings stored in the DB's `stage` column
export const DB_STAGE = {
  R32:   "Round of 32",
  R16:   "Round of 16",
  QF:    "Quarter Final",
  SF:    "Semi - Final",
  Final: "Final",
};

// ─── ANNEX C ──────────────────────────────────────────────────────────────────
// Key = sorted string of 8 groups whose 3rd-place teams qualified.
// Value = { winnerGroup: thirdGroup }
const ANNEX_C = {
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

// ─── GROUP STANDINGS ──────────────────────────────────────────────────────────

export function calculateGroupStandings(groupMatches, predMap) {
  const groups = {};

  groupMatches.forEach((match) => {
    const g = match.stage?.replace("Group ", "").trim();
    if (!g || g.length > 1) return;
    const pred = predMap[match.id];
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

    if (hg > ag)      { groups[g][home].pts += 3; }
    else if (ag > hg) { groups[g][away].pts += 3; }
    else              { groups[g][home].pts += 1; groups[g][away].pts += 1; }
  });

  const winners = {};
  const runners = {};
  const allThirds = [];

  Object.keys(groups).forEach((g) => {
    const ranked = Object.entries(groups[g]).sort((a, b) => {
      if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
      if (b[1].gd  !== a[1].gd)  return b[1].gd  - a[1].gd;
      return b[1].gf - a[1].gf;
    });
    winners[g] = ranked[0]?.[0];
    runners[g] = ranked[1]?.[0];
    if (ranked[2]) allThirds.push({ group: g, team: ranked[2][0], stats: ranked[2][1] });
  });

  allThirds.sort((a, b) => {
    if (b.stats.pts !== a.stats.pts) return b.stats.pts - a.stats.pts;
    if (b.stats.gd  !== a.stats.gd)  return b.stats.gd  - a.stats.gd;
    return b.stats.gf - a.stats.gf;
  });

  return { winners, runners, bestThirds: allThirds.slice(0, 8) };
}

// ─── BUILD R32 TEAM LIST ───────────────────────────────────────────────────────
// Returns an array of 16 { home, away } pairs — one per R32 slot in bracket order.

function buildR32Teams(winners, runners, bestThirds) {
  const comboKey = bestThirds.map((t) => t.group).sort().join("");
  const thirdLookup = {};
  bestThirds.forEach((t) => { thirdLookup[t.group] = t.team; });

  const annexMapping = ANNEX_C[comboKey] || buildFallbackMapping(bestThirds);
  if (!ANNEX_C[comboKey]) console.warn(`Annex C key "${comboKey}" not found — using fallback`);

  const annexWinnerGroups = new Set(Object.keys(annexMapping));
  const annexGroupsSorted = [...annexWinnerGroups].sort();
  const allGroups = Object.keys(winners).sort();
  const freeGroups = allGroups.filter((g) => !annexWinnerGroups.has(g));

  // 8 Annex C: winner vs 3rd
  const annexPairs = Object.entries(annexMapping).map(([wg, tg]) => ({
    home: winners[wg] || "TBD",
    away: thirdLookup[tg] || "TBD",
  }));

  // 4 free winner vs runner
  const winnerRunnerPairs = freeGroups.map((wg, i) => ({
    home: winners[wg] || "TBD",
    away: runners[annexGroupsSorted[i]] || "TBD",
  }));

  // 4 runner vs runner
  const runnerRunnerPairs = [];
  for (let i = freeGroups.length; i < annexGroupsSorted.length; i += 2) {
    runnerRunnerPairs.push({
      home: runners[annexGroupsSorted[i]] || "TBD",
      away: runners[annexGroupsSorted[i + 1]] || "TBD",
    });
  }

  return [...annexPairs, ...winnerRunnerPairs, ...runnerRunnerPairs];
}

function buildFallbackMapping(bestThirds) {
  const sections = [["A","B","C"], ["D","E","F"], ["G","H","I"], ["J","K","L"]];
  const getSection = (g) => sections.findIndex((s) => s.includes(g));
  const mapping = {};
  bestThirds.forEach((third, i) => {
    const ts = getSection(third.group);
    const targetGroup = sections[(ts + 2) % 4][i % 3];
    if (!mapping[targetGroup]) mapping[targetGroup] = third.group;
  });
  return mapping;
}

// ─── CLIENT-SIDE BRACKET COMPUTATION ─────────────────────────────────────────
//
// Takes ALL matches from DB (group + knockout slots) and the user's predMap.
// Returns a map of stageKey → array of match objects with correct home_team/away_team.
// Nothing is written to the DB — each user gets their own personal bracket.
//

function pickWinner(match, pred) {
  if (!pred) return "TBD";
  return Number(pred.predicted_home_score) >= Number(pred.predicted_away_score)
    ? match.home_team
    : match.away_team;
}

function advanceStage(fromMatches, toSlots, predMap) {
  return toSlots.map((slot, i) => {
    const m1 = fromMatches[i * 2];
    const m2 = fromMatches[i * 2 + 1];
    if (!m1 || !m2) return { ...slot, home_team: "TBD", away_team: "TBD" };
    const w1 = pickWinner(m1, predMap[m1.id]);
    const w2 = pickWinner(m2, predMap[m2.id]);
    return { ...slot, home_team: w1, away_team: w2 };
  });
}

export function computeFullBracket(allMatches, predMap) {
  const byId = (a, b) => (a.id > b.id ? 1 : -1);

  const groupMatches = allMatches.filter((m) => m.stage?.startsWith("Group "));
  const r32Slots  = allMatches.filter((m) => m.stage === DB_STAGE.R32).sort(byId);
  const r16Slots  = allMatches.filter((m) => m.stage === DB_STAGE.R16).sort(byId);
  const qfSlots   = allMatches.filter((m) => m.stage === DB_STAGE.QF).sort(byId);
  const sfSlots   = allMatches.filter((m) => m.stage === DB_STAGE.SF).sort(byId);
  const finalSlots = allMatches.filter((m) => m.stage === DB_STAGE.Final).sort(byId);

  // Only build R32 once all group matches are predicted
  const groupAllPredicted = groupMatches.every((m) => predMap[m.id]);
  if (!groupAllPredicted) {
    return { group: groupMatches, R32: r32Slots, R16: r16Slots, QF: qfSlots, SF: sfSlots, Final: finalSlots };
  }

  const { winners, runners, bestThirds } = calculateGroupStandings(groupMatches, predMap);
  const r32Teams = buildR32Teams(winners, runners, bestThirds);
  const r32 = r32Slots.map((slot, i) => ({
    ...slot,
    home_team: r32Teams[i]?.home || "TBD",
    away_team: r32Teams[i]?.away || "TBD",
  }));

  const r16   = advanceStage(r32,  r16Slots,   predMap);
  const qf    = advanceStage(r16,  qfSlots,    predMap);
  const sf    = advanceStage(qf,   sfSlots,    predMap);
  const final_ = advanceStage(sf,  finalSlots, predMap);

  return { group: groupMatches, R32: r32, R16: r16, QF: qf, SF: sf, Final: final_ };
}
