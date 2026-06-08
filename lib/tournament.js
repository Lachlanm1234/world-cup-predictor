import { supabase } from "./supabase";

// ===== MAIN ENTRY FUNCTION =====
export const generateKnockout = async (groupWinners, groupRunners, bestThirds) => {

  // ✅ STEP 1: Get existing R32 matches (empty ones)
  const { data: existingMatches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", "R32")
    .order("id", { ascending: true });

  if (!existingMatches || existingMatches.length === 0) {
    console.log("❌ No R32 matches found");
    return;
  }

  // ✅ STEP 2: Build combination key
  const comboKey = bestThirds
    .map((t) => t.group)
    .sort()
    .join("");

  // ✅ STEP 3: Lookup third-place teams
  const thirdLookup = {};
  bestThirds.forEach((t) => {
    thirdLookup[t.group] = t.team;
  });

  // ✅ STEP 4: Annex C mapping
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

  // ✅ STEP 5: Fallback mapping
  if (!mapping) {
    console.log("⚠️ Using fallback mapping");
    mapping = {};

    const groups = bestThirds.map(t => t.group);

    groups.forEach((g, i) => {
      mapping[g] = groups[(i + 1) % groups.length];
    });
  }

  // ✅ STEP 6: Build match assignments
  const matchAssignments = [];

  // From Annex C (winners vs third)
  Object.keys(mapping).forEach((group) => {
    if (groupWinners[group] && thirdLookup[mapping[group]]) {
      matchAssignments.push({
        home: groupWinners[group],
        away: thirdLookup[mapping[group]]
      });
    }
  });

  // ✅ STEP 7: Add fixed matches (important)
  matchAssignments.push(
    { home: groupRunners["A"], away: groupRunners["B"] },
    { home: groupWinners["C"], away: groupRunners["D"] },
    { home: groupWinners["E"], away: groupRunners["F"] },
    { home: groupWinners["G"], away: groupRunners["H"] }
  );

  // ✅ STEP 8: Update existing matches instead of inserting
  for (let i = 0; i < existingMatches.length; i++) {
    const match = existingMatches[i];
    const teams = matchAssignments[i];

    if (!match || !teams) continue;

    await supabase
      .from("matches")
      .update({
        home_team: teams.home,
        away_team: teams.away
      })
      .eq("id", match.id);
  }

  console.log("✅ Round of 32 populated!");
};



// ===== AUTO ADVANCE WINNERS =====
export const advanceWinners = async (stageFrom, stageTo) => {

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .eq("stage", stageFrom)
    .order("id");

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

    // ✅ Find next empty match
    const { data: nextMatches } = await supabase
      .from("matches")
      .select("*")
      .eq("stage", stageTo)
      .order("id");

    const nextMatchIndex = Math.floor(i / 2);
    const nextMatch = nextMatches[nextMatchIndex];

    if (!nextMatch) continue;

    // ✅ Fill slots
    const updateData = nextMatch.home_team
      ? { away_team: winner2 }
      : { home_team: winner1 };

    if (!nextMatch.home_team) {
      await supabase
        .from("matches")
        .update({ home_team: winner1 })
        .eq("id", nextMatch.id);

      await supabase
        .from("matches")
        .update({ away_team: winner2 })
        .eq("id", nextMatch.id);
    }
  }

  console.log(`✅ ${stageTo} populated`);
};
