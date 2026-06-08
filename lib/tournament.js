import { supabase } from "./supabase";

// ===== MAIN ENTRY FUNCTION =====
export const generateKnockout = async (groupWinners, groupRunners, bestThirds) => {

  // ✅ STEP 1: Build combination key
  const comboKey = bestThirds
    .map((t) => t.group)
    .sort()
    .join("");

  // ✅ STEP 2: Lookup table for 3rd teams
  const thirdLookup = {};
  bestThirds.forEach((t) => {
    thirdLookup[t.group] = t.team;
  });

  // ✅ STEP 3: Annex C mapping (add more over time)
  const annexC = {
    "ABCDEFGH": {
      A: "C", B: "D", C: "E", D: "F",
      E: "G", F: "H", G: "A", H: "B"
    },
    "ACDFGHJK": {
      A: "C", B: "D", C: "F", D: "G",
      E: "H", F: "J", G: "K", H: "A"
    }
  };

  let mapping = annexC[comboKey];

  // ✅ STEP 4: Fallback (if combo not defined)
  if (!mapping) {
    console.log("Using fallback mapping");
    mapping = {};

    const groups = bestThirds.map(t => t.group);

    groups.forEach((g, i) => {
      const next = groups[(i + 1) % groups.length];
      mapping[g] = next;
    });
  }

  // ✅ STEP 5: Generate Round of 32 matches
  const round32 = [];

  // Matches using 3rd place teams
  Object.keys(mapping).forEach((group) => {
    if (groupWinners[group] && thirdLookup[mapping[group]]) {
      round32.push({
        home_team: groupWinners[group],
        away_team: thirdLookup[mapping[group]],
        stage: "R32"
      });
    }
  });

  // ✅ STEP 6: Add fixed matches (important)
  round32.push(
    { home_team: groupRunners["A"], away_team: groupRunners["B"], stage: "R32" },
    { home_team: groupWinners["C"], away_team: groupRunners["D"], stage: "R32" },
    { home_team: groupWinners["E"], away_team: groupRunners["F"], stage: "R32" },
    { home_team: groupWinners["G"], away_team: groupRunners["H"], stage: "R32" }
  );

  // ✅ STEP 7: Save to DB
  const { data, error } = await supabase
    .from("matches")
    .insert(round32);

  if (error) {
    console.error(error);
    return;
  }

  console.log("✅ Round of 32 created");

  return round32;
};



// ===== AUTO ADVANCE WINNERS =====
export const advanceWinners = async (stageFrom, stageTo) => {

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", stageFrom);

  const nextMatches = [];

  for (let i = 0; i < matches.length; i += 2) {
    const match1 = matches[i];
    const match2 = matches[i + 1];

    if (!match1 || !match2) continue;

    if (
      match1.home_score == null ||
      match1.away_score == null ||
      match2.home_score == null ||
      match2.away_score == null
    ) continue;

    const winner1 =
      match1.home_score > match1.away_score
        ? match1.home_team
        : match1.away_team;

    const winner2 =
      match2.home_score > match2.away_score
        ? match2.home_team
        : match2.away_team;

    nextMatches.push({
      home_team: winner1,
      away_team: winner2,
      stage: stageTo
    });
  }

  if (nextMatches.length > 0) {
    await supabase.from("matches").insert(nextMatches);
    console.log(`✅ ${stageTo} created`);
  }
};
``
