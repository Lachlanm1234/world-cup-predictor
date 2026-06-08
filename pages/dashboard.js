import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scores, setScores] = useState({});
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    loadUserAndData();
  }, []);

  // Load user, matches, and predictions
  const loadUserAndData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    // Get lock status
    const { data: userRow } = await supabase
      .from("users")
      .select("predictions_locked")
      .eq("id", user.id)
      .single();

    setLocked(userRow?.predictions_locked);

    // Get matches
    const { data: matchData } = await supabase
      .from("matches")
      .select("*");

    // Get predictions
    const { data: predictionData } = await supabase
      .from("predictions")
      .select("*")
      .eq("user_id", user.id);

    // Convert predictions to lookup
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

  // Handle input change
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
    alert("✅ Predictions locked! Good luck.");
  };

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div style={{ padding: 40, fontFamily: "Arial", maxWidth: 800, margin: "auto" }}>
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
          ✅ Predictions locked — you’re in!
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
            border: "1px solid #ddd",
            padding: 15,
            marginBottom: 15,
            borderRadius: 8,
            background: "#fafafa"
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
                padding: 5
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
                padding: 5
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

      <button onClick={logout} style={{ marginTop: 20 }}>
        Logout
      </button>
    </div>
  );
}
