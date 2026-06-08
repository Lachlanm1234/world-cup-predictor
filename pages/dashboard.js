import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { generateKnockout } from "../lib/tournament";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scores, setScores] = useState({});
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    loadUserAndData();
  }, []);

  // Load user + matches + predictions
  const loadUserAndData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    const { data: userRow } = await supabase
      .from("users")
      .select("predictions_locked")
      .eq("id", user.id)
      .single();

    setLocked(userRow?.predictions_locked);

    const { data: matchData } = await supabase
      .from("matches")
      .select("*");

    const { data: predictionData } = await supabase
      .from("predictions")
      .select("*")
      .eq("user_id", user.id);

    const storedScores = {};
    predictionData?.forEach((p) => {
      storedScores[p.match_id] = {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
      };
    });

    setMatches(matchData || []);
    setScores(storedScores);
  };

  // Change score
  const handleChange = (matchId, field, value) => {
    if (locked) return;

    setScores((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [field]: value,
      },
    }));
  };

  // Save prediction
  const savePrediction = async (matchId) => {
    if (locked) return;

    const matchScore = scores[matchId];

    await supabase.from("predictions").upsert({
      user_id: user.id,
      match_id: matchId,
      predicted_home_score: parseInt(matchScore?.home || 0),
      predicted_away_score: parseInt(matchScore?.away || 0),
    });
  };

  // Lock predictions
  const lockPredictions = async () => {
    await supabase
      .from("users")
      .update({ predictions_locked: true })
      .eq("id", user.id);

    setLocked(true);
    alert("✅ Predictions locked!");
  };

  // 🔥 GENERATE KNOCKOUT (TEST VERSION)
const runKnockout = async () => {
  const { data: matches } = await supabase.from("matches").select("*");

  const { data: { user } } = await supabase.auth.getUser();

  const { data: predictions } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", user.id);

  // ✅ Build prediction lookup
  const predictionMap = {};
  predictions.forEach((p) => {
    predictionMap[p.match_id] = p;
  });

  // ✅ GROUP TABLES
  const groups = {};

  matches.forEach((match) => {
    if (!match.group) return; // ensure group field exists (A, B, C...)

    if (!groups[match.group]) {
      groups[match.group] = {};
    }

    const home = match.home_team;
    const away = match.away_team;

    const prediction = predictionMap[match.id];

    if (!prediction) return;

    const homeGoals = prediction.predicted_home_score;
    const awayGoals = prediction.predicted_away_score;

    // init teams
    if (!groups[match.group][home]) {
      groups[match.group][home] = { pts: 0, gd: 0, gf: 0 };
    }
    if (!groups[match.group][away]) {
      groups[match.group][away] = { pts: 0, gd: 0, gf: 0 };
    }

    // update stats
    groups[match.group][home].gf += homeGoals;
    groups[match.group][home].gd += homeGoals - awayGoals;

    groups[match.group][away].gf += awayGoals;
    groups[match.group][away].gd += awayGoals - homeGoals;

    if (homeGoals > awayGoals) {
      groups[match.group][home].pts += 3;
    } else if (awayGoals > homeGoals) {
      groups[match.group][away].pts += 3;
    } else {
      groups[match.group][home].pts += 1;
      groups[match.group][away].pts += 1;
    }
  });

  // ✅ EXTRACT TOP TEAMS
  const groupWinners = {};
  const groupRunners = {};
  const thirdPlace = [];

  Object.keys(groups).forEach((groupKey) => {
    const teams = Object.entries(groups[groupKey]);

    const ranked = teams.sort((a, b) => {
      if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
      if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
      return b[1].gf - a[1].gf;
    });

    groupWinners[groupKey] = ranked[0][0];
    groupRunners[groupKey] = ranked[1][0];

    thirdPlace.push({
      group: groupKey,
      team: ranked[2][0],
      stats: ranked[2][1]
    });
  });

  // ✅ SORT ALL 3RD PLACE TEAMS
  thirdPlace.sort((a, b) => {
    if (b.stats.pts !== a.stats.pts) return b.stats.pts - a.stats.pts;
    if (b.stats.gd !== a.stats.gd) return b.stats.gd - a.stats.gd;
    return b.stats.gf - a.stats.gf;
  });

  // ✅ TAKE TOP 8
  const bestThirds = thirdPlace.slice(0, 8);

  console.log("Winners:", groupWinners);
  console.log("Runners:", groupRunners);
  console.log("Best 3rds:", bestThirds);

  // ✅ GENERATE KNOCKOUT
  await generateKnockout(groupWinners, groupRunners, bestThirds);
};

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "Arial",
        maxWidth: 900,
        margin: "auto",
        backgroundColor: "#0f172a",
        minHeight: "100vh",
        color: "white"
      }}
    >
      <h1 style={{ marginBottom: 10 }}>World Cup Predictor</h1>

      {!locked && (
        <button
          onClick={lockPredictions}
          style={{
            marginBottom: 20,
            padding: "10px 16px",
            backgroundColor: "#28a745",
            color: "white",
            border: "none",
            borderRadius: 5,
            cursor: "pointer"
          }}
        >
          ✅ Submit All Predictions
        </button>
      )}

      {locked && (
        <p style={{ marginBottom: 20, color: "green" }}>
          ✅ Predictions locked — you're in!
        </p>
      )}

      <button
        onClick={() => (window.location.href = "/leaderboard")}
        style={{ marginBottom: 20 }}
      >
        View Leaderboard
      </button>

      {user && (
        <p style={{ marginBottom: 30 }}>
          Logged in as: <strong>{user.email}</strong>
        </p>
      )}

      {matches.map((match) => (
        <div
          key={match.id}
          style={{
            background: "#1e293b",
            padding: 15,
            marginBottom: 15,
            borderRadius: 10,
            boxShadow: "0 2px 10px rgba(0,0,0,0.3)"
          }}
        >
          <p style={{ fontSize: 18, fontWeight: "bold" }}>
            {match.home_team} vs {match.away_team}
          </p>

          <div style={{ marginTop: 10 }}>
            <input
              type="number"
              placeholder="Home"
              value={scores[match.id]?.home ?? ""}
              onChange={(e) =>
                handleChange(match.id, "home", e.target.value)
              }
              disabled={locked}
              style={{
                width: 60,
                marginRight: 10,
                padding: 8,
                borderRadius: 5
              }}
            />

            <input
              type="number"
              placeholder="Away"
              value={scores[match.id]?.away ?? ""}
              onChange={(e) =>
                handleChange(match.id, "away", e.target.value)
              }
              disabled={locked}
              style={{
                width: 60,
                marginRight: 10,
                padding: 8,
                borderRadius: 5
              }}
            />

            {!locked && (
              <button onClick={() => savePrediction(match.id)}>
                Save
              </button>
            )}
          </div>
        </div>
      ))}

      {/* ✅ NEW BUTTON */}
      <button onClick={runKnockout} style={{ marginTop: 20 }}>
        Generate Knockout Stage
      </button>

      <button
        onClick={logout}
        style={{
          marginTop: 20,
          padding: "10px 16px",
          backgroundColor: "#22c55e",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        Logout
      </button>
    </div>
  );
}
