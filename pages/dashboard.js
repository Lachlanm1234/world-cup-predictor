import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { generateKnockout } from "../lib/tournament";

const S = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#1e293b",
  cardHover: "#243447",
  border: "#1f2d3d",
  accent: "#3b82f6",
  accentDark: "#1d4ed8",
  success: "#22c55e",
  successDark: "#15803d",
  muted: "#64748b",
  text: "#f1f5f9",
  textSoft: "#94a3b8",
};

function Badge({ children, color = S.accent }) {
  return (
    <span style={{
      background: color + "22",
      color,
      border: `1px solid ${color}44`,
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

function MatchCard({ match, score, locked, onChange, onSave, saved }) {
  return (
    <div style={{
      background: S.card,
      border: `1px solid ${S.border}`,
      borderRadius: 12,
      padding: "18px 20px",
      marginBottom: 10,
      transition: "border-color 0.2s",
    }}>
      {/* Group badge */}
      {match.group && (
        <div style={{ marginBottom: 10 }}>
          <Badge color={S.muted}>Group {match.group}</Badge>
        </div>
      )}

      {/* Teams + score row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 16,
      }}>
        {/* Home team */}
        <div style={{ textAlign: "right" }}>
          <span style={{ color: S.text, fontWeight: 700, fontSize: 16 }}>
            {match.home_team}
          </span>
        </div>

        {/* Score inputs */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <input
            type="number"
            min="0"
            value={score?.home ?? ""}
            onChange={(e) => onChange(match.id, "home", e.target.value)}
            disabled={locked}
            placeholder="0"
            style={{
              width: 52,
              height: 44,
              textAlign: "center",
              background: locked ? "#0d1829" : "#0f172a",
              border: `1.5px solid ${score?.home !== undefined && score?.home !== "" ? S.accent : S.border}`,
              borderRadius: 8,
              color: S.text,
              fontSize: 20,
              fontWeight: 700,
              outline: "none",
              opacity: locked ? 0.6 : 1,
            }}
          />
          <span style={{ color: S.muted, fontWeight: 700, fontSize: 18 }}>–</span>
          <input
            type="number"
            min="0"
            value={score?.away ?? ""}
            onChange={(e) => onChange(match.id, "away", e.target.value)}
            disabled={locked}
            placeholder="0"
            style={{
              width: 52,
              height: 44,
              textAlign: "center",
              background: locked ? "#0d1829" : "#0f172a",
              border: `1.5px solid ${score?.away !== undefined && score?.away !== "" ? S.accent : S.border}`,
              borderRadius: 8,
              color: S.text,
              fontSize: 20,
              fontWeight: 700,
              outline: "none",
              opacity: locked ? 0.6 : 1,
            }}
          />
        </div>

        {/* Away team */}
        <div style={{ textAlign: "left" }}>
          <span style={{ color: S.text, fontWeight: 700, fontSize: 16 }}>
            {match.away_team}
          </span>
        </div>
      </div>

      {/* Save button row */}
      {!locked && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button
            onClick={() => onSave(match.id)}
            style={{
              padding: "7px 20px",
              background: saved ? S.successDark : S.accentDark,
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scores, setScores] = useState({});
  const [locked, setLocked] = useState(false);
  const [savedIds, setSavedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserAndData();
  }, []);

  const loadUserAndData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/"; return; }
    setUser(user);

    const { data: userRow } = await supabase
      .from("users")
      .select("predictions_locked")
      .eq("id", user.id)
      .single();

    setLocked(userRow?.predictions_locked ?? false);

    const { data: matchData } = await supabase.from("matches").select("*");
    const { data: predictionData } = await supabase
      .from("predictions")
      .select("*")
      .eq("user_id", user.id);

    const storedScores = {};
    const saved = new Set();
    predictionData?.forEach((p) => {
      storedScores[p.match_id] = {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
      };
      saved.add(p.match_id);
    });

    setMatches(matchData || []);
    setScores(storedScores);
    setSavedIds(saved);
    setLoading(false);
  };

  const handleChange = (matchId, field, value) => {
    if (locked) return;
    setSavedIds((prev) => { const n = new Set(prev); n.delete(matchId); return n; });
    setScores((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  };

  const savePrediction = async (matchId) => {
    if (locked) return;
    const matchScore = scores[matchId];
    await supabase.from("predictions").upsert({
      user_id: user.id,
      match_id: matchId,
      predicted_home_score: parseInt(matchScore?.home ?? 0),
      predicted_away_score: parseInt(matchScore?.away ?? 0),
    });
    setSavedIds((prev) => new Set([...prev, matchId]));
  };

  const lockPredictions = async () => {
    if (!confirm("Lock your predictions? This cannot be undone.")) return;
    await supabase.from("users").update({ predictions_locked: true }).eq("id", user.id);
    setLocked(true);
  };

  const runKnockout = async () => {
    const { data: matches } = await supabase.from("matches").select("*");
    const { data: { user } } = await supabase.auth.getUser();
    const { data: predictions } = await supabase
      .from("predictions").select("*").eq("user_id", user.id);

    const predictionMap = {};
    predictions.forEach((p) => { predictionMap[p.match_id] = p; });

    const groups = {};
    matches.forEach((match) => {
      if (!match.group) return;
      if (!groups[match.group]) groups[match.group] = {};
      const home = match.home_team;
      const away = match.away_team;
      const prediction = predictionMap[match.id];
      if (!prediction) return;
      const homeGoals = prediction.predicted_home_score;
      const awayGoals = prediction.predicted_away_score;
      if (!groups[match.group][home]) groups[match.group][home] = { pts: 0, gd: 0, gf: 0 };
      if (!groups[match.group][away]) groups[match.group][away] = { pts: 0, gd: 0, gf: 0 };
      groups[match.group][home].gf += homeGoals;
      groups[match.group][home].gd += homeGoals - awayGoals;
      groups[match.group][away].gf += awayGoals;
      groups[match.group][away].gd += awayGoals - homeGoals;
      if (homeGoals > awayGoals) { groups[match.group][home].pts += 3; }
      else if (awayGoals > homeGoals) { groups[match.group][away].pts += 3; }
      else { groups[match.group][home].pts += 1; groups[match.group][away].pts += 1; }
    });

    const groupWinners = {};
    const groupRunners = {};
    const thirdPlace = [];

    Object.keys(groups).forEach((groupKey) => {
      const ranked = Object.entries(groups[groupKey]).sort((a, b) => {
        if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
        if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
        return b[1].gf - a[1].gf;
      });
      groupWinners[groupKey] = ranked[0][0];
      groupRunners[groupKey] = ranked[1][0];
      thirdPlace.push({ group: groupKey, team: ranked[2][0], stats: ranked[2][1] });
    });

    thirdPlace.sort((a, b) => {
      if (b.stats.pts !== a.stats.pts) return b.stats.pts - a.stats.pts;
      if (b.stats.gd !== a.stats.gd) return b.stats.gd - a.stats.gd;
      return b.stats.gf - a.stats.gf;
    });

    await generateKnockout(groupWinners, groupRunners, thirdPlace.slice(0, 8));
    alert("Knockout stage generated!");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // Group matches by group
  const groupedMatches = matches.reduce((acc, match) => {
    const key = match.group || match.stage || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});

  const savedCount = savedIds.size;
  const totalCount = matches.length;

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: S.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: S.textSoft,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        fontSize: 16,
      }}>
        Loading your predictions...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: S.bg,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: S.text,
    }}>
      {/* Top nav */}
      <header style={{
        background: S.surface,
        borderBottom: `1px solid ${S.border}`,
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 64,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚽</span>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.3px" }}>
            World Cup Predictor
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => window.location.href = "/leaderboard"}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: `1px solid ${S.border}`,
              borderRadius: 8,
              color: S.textSoft,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🏆 Leaderboard
          </button>
          <div style={{
            padding: "6px 12px",
            background: "#0f172a",
            border: `1px solid ${S.border}`,
            borderRadius: 8,
            color: S.muted,
            fontSize: 12,
          }}>
            {user?.email}
          </div>
          <button
            onClick={logout}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: `1px solid ${S.border}`,
              borderRadius: 8,
              color: S.muted,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        {/* Status banner */}
        {locked ? (
          <div style={{
            background: "#052e16",
            border: "1px solid #16a34a",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <span style={{ fontSize: 22 }}>🔒</span>
            <div>
              <div style={{ color: "#86efac", fontWeight: 700, fontSize: 15 }}>
                Predictions locked — you&apos;re in!
              </div>
              <div style={{ color: "#4ade80", fontSize: 13, marginTop: 2 }}>
                Your predictions have been submitted. Good luck!
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: "#0c1a2e",
            border: `1px solid ${S.border}`,
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}>
            <div>
              <div style={{ color: S.text, fontWeight: 700, fontSize: 15 }}>
                Make your predictions
              </div>
              <div style={{ color: S.muted, fontSize: 13, marginTop: 2 }}>
                {savedCount} of {totalCount} matches saved
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={runKnockout}
                style={{
                  padding: "9px 18px",
                  background: "transparent",
                  border: `1px solid ${S.border}`,
                  borderRadius: 8,
                  color: S.textSoft,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Generate Knockout
              </button>
              <button
                onClick={lockPredictions}
                style={{
                  padding: "9px 20px",
                  background: "linear-gradient(135deg, #16a34a, #22c55e)",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(34,197,94,0.25)",
                }}
              >
                🔒 Lock Predictions
              </button>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {!locked && totalCount > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              fontSize: 12,
              color: S.muted,
            }}>
              <span>Prediction progress</span>
              <span>{Math.round((savedCount / totalCount) * 100)}%</span>
            </div>
            <div style={{
              height: 4,
              background: S.border,
              borderRadius: 99,
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${(savedCount / totalCount) * 100}%`,
                background: "linear-gradient(90deg, #2563eb, #22c55e)",
                borderRadius: 99,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        )}

        {/* Matches grouped by group */}
        {Object.entries(groupedMatches).sort(([a], [b]) => a.localeCompare(b)).map(([group, groupMatches]) => (
          <div key={group} style={{ marginBottom: 32 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
            }}>
              <h2 style={{
                color: S.text,
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                margin: 0,
              }}>
                Group {group}
              </h2>
              <div style={{ flex: 1, height: 1, background: S.border }} />
              <span style={{ color: S.muted, fontSize: 12 }}>
                {groupMatches.length} matches
              </span>
            </div>

            {groupMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                score={scores[match.id]}
                locked={locked}
                onChange={handleChange}
                onSave={savePrediction}
                saved={savedIds.has(match.id)}
              />
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
