// Exact strings stored in the DB's `stage` column
export const DB_STAGE = {
  R32:   "Round of 32",
  R16:   "Round of 16",
  QF:    "Quarter Final",
  SF:    "Semi - Final",
  Final: "Final",
};

// ─── OFFICIAL R32 BRACKET (FIFA 2026 Article 12.6) ────────────────────────────
// Fixed 16 match slots. "best3rd" slots resolve to whichever qualifying
// 3rd-place team came from one of the listed groups.
const R32_BRACKET = [
  { home: { type: "runner", group: "A" }, away: { type: "runner", group: "B" } },
  { home: { type: "winner", group: "E" }, away: { type: "best3rd", groups: ["A","B","C","D","F"] } },
  { home: { type: "winner", group: "F" }, away: { type: "runner", group: "C" } },
  { home: { type: "winner", group: "C" }, away: { type: "runner", group: "F" } },
  { home: { type: "winner", group: "I" }, away: { type: "best3rd", groups: ["C","D","F","G","H"] } },
  { home: { type: "runner", group: "E" }, away: { type: "runner", group: "I" } },
  { home: { type: "winner", group: "A" }, away: { type: "best3rd", groups: ["C","E","F","H","I"] } },
  { home: { type: "winner", group: "L" }, away: { type: "best3rd", groups: ["E","H","I","J","K"] } },
  { home: { type: "winner", group: "D" }, away: { type: "best3rd", groups: ["B","E","F","I","J"] } },
  { home: { type: "winner", group: "G" }, away: { type: "best3rd", groups: ["A","E","H","I","J"] } },
  { home: { type: "runner", group: "K" }, away: { type: "runner", group: "L" } },
  { home: { type: "winner", group: "H" }, away: { type: "runner", group: "J" } },
  { home: { type: "winner", group: "B" }, away: { type: "best3rd", groups: ["E","F","G","I","J"] } },
  { home: { type: "winner", group: "J" }, away: { type: "runner", group: "H" } },
  { home: { type: "winner", group: "K" }, away: { type: "best3rd", groups: ["D","E","I","J","L"] } },
  { home: { type: "runner", group: "D" }, away: { type: "runner", group: "G" } },
];

function resolveSlot(slot, winners, runners, best3rdMap) {
  if (slot.type === "winner") return winners[slot.group] || "TBD";
  if (slot.type === "runner") return runners[slot.group] || "TBD";
  // best3rd: find the qualifying 3rd-place team from the specified groups
  for (const g of slot.groups) {
    if (best3rdMap[g]) return best3rdMap[g];
  }
  return "TBD";
}

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

  // Build a map of group → 3rd-place team for the 8 qualifying thirds
  const best3rdMap = {};
  bestThirds.forEach((t) => { best3rdMap[t.group] = t.team; });

  const r32 = r32Slots.map((slot, i) => {
    const spec = R32_BRACKET[i];
    if (!spec) return { ...slot, home_team: "TBD", away_team: "TBD" };
    return {
      ...slot,
      home_team: resolveSlot(spec.home, winners, runners, best3rdMap),
      away_team: resolveSlot(spec.away, winners, runners, best3rdMap),
    };
  });

  const r16   = advanceStage(r32,  r16Slots,   predMap);
  const qf    = advanceStage(r16,  qfSlots,    predMap);
  const sf    = advanceStage(qf,   sfSlots,    predMap);
  const final_ = advanceStage(sf,  finalSlots, predMap);

  return { group: groupMatches, R32: r32, R16: r16, QF: qf, SF: sf, Final: final_ };
}
