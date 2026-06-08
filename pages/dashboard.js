import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scores, setScores] = useState({});

  useEffect(() => {
    getUser();
    fetchMatches();
  }, []);

  // Get logged in user
  const getUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
  };

  // Fetch matches from database
 const fetchMatches = async () => {
  const { data: matchData } = await supabase.from("matches").select("*");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: predictionData } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", user.id);

  // Convert predictions into lookup object
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

  // Handle score input changes
const handleChange = (matchId, field, value) => {
  setScores((prev) => ({
    ...prev,
    [matchId]: {
      ...prev[matchId],
      [field]: value,
    },
  }));
};
``

  // Save prediction to Supabase
  const savePrediction = async (matchId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const matchScore = scores[matchId];

    await supabase.from("predictions").upsert({
      user_id: user.id,
      match_id: matchId,
      predicted_home_score: parseInt(matchScore?.home || 0),
      predicted_away_score: parseInt(matchScore?.away || 0),
    });

    alert("Prediction saved!");
  };

  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

return (
  <div style={{ padding: 40, fontFamily: "Arial" }}>
    <h1 style={{ marginBottom: 20 }}>World Cup Predictor</h1>

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
          border: "1px solid #ccc",
          padding: 15,
          marginBottom: 15,
          borderRadius: 8
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
            style={{ width: 60, marginRight: 10 }}
          />

          <input
            type="number"
            placeholder="Away"
            value={scores[match.id]?.away ?? ""}
            onChange={(e) =>
              handleChange(match.id, "away", e.target.value)
            }
            style={{ width: 60, marginRight: 10 }}
          />

          <button onClick={() => savePrediction(match.id)}>
            Save
          </button>
        </div>
      </div>
    ))}

    <button onClick={logout}>Logout</button>
  </div>
);
``
