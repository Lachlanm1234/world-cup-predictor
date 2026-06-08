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
    const groupWinners = {
      A: "Team A1",
      B: "Team B1",
      C: "Team C1",
      D: "Team D1",
      E: "Team E1",
      F: "Team F1",
      G: "Team G1",
      H: "Team H1"
    };

    const groupRunners = {
      A: "Team A2",
      B: "Team B2",
      C: "Team C2",
      D: "Team D2",
      E: "Team E2",
      F: "Team F2",
      G: "Team G2",
      H: "Team H2"
    };

    const bestThirds = [
      { group: "A", team: "Team A3" },
      { group: "C", team: "Team C3" },
      { group: "D", team: "Team D3" },
      { group: "F", team: "Team F3" },
      { group: "G", team: "Team G3" },
      { group: "H", team: "Team H3" },
      { group: "J", team: "Team J3" },
      { group: "K", team: "Team K3" }
    ];

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
