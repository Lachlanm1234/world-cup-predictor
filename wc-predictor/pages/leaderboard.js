import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    const { data, error } = await supabase.rpc("leaderboard");

    console.log(data, error);

    if (data) {
      setLeaders(data);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Leaderboard</h1>

      
<button onClick={() => (window.location.href = "/dashboard")}>
  Back to Dashboard
</button>


      {leaders.map((player, index) => (
        <div key={index}>
          {index + 1}. {player.email} — {player.total_points} pts
        </div>
      ))}
    </div>
  );
}
