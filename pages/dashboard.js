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
    <div style={{ padding: 40 }}>
      <h1>Dashboard</h1>

      <button onClick={() => (window.location.href = "/leaderboard")}>
  View Leaderboard
</button>

      {user && <p>Logged in as: {user.email}</p>}

      <h2>Matches</h2>

      {matches.length === 0 && <p>No matches found...</p>}

      {matches.map((match) => (
        <div key={match.id} style={{ marginBottom: 20 }}>
          <strong>
            {match.home_team} vs {match.away_team}
          </strong>

          <div>
            <input
  type="number"
  placeholder="Home"
  value={scores[match.id]?.home ?? ""}
  onChange={(e) =>
    handleChange(match.id, "home", e.target.value)
  }
  style={{ width: 50, marginRight: 5 }}
/>

<input
  type="number"
  placeholder="Away"
  value={scores[match.id]?.away ?? ""}
  onChange={(e) =>
    handleChange(match.id, "away", e.target.value)
  }
  style={{ width: 50, marginRight: 5 }}
/>

            <button onClick={() => savePrediction(match.id)}>
              Save
            </button>
          </div>
        </div>
      ))}

      <br />
      <button onClick={logout}>Logout</button>
    </div>
  );
}
