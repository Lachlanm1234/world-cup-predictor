import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const S = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#1e293b",
  border: "#1f2d3d",
  accent: "#3b82f6",
  text: "#f1f5f9",
  textSoft: "#94a3b8",
  muted: "#64748b",
};

const MEDALS = ["🥇", "🥈", "🥉"];

function rankColor(index) {
  if (index === 0) return "#fbbf24";
  if (index === 1) return "#94a3b8";
  if (index === 2) return "#cd7c3a";
  return S.muted;
}

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    const { data } = await supabase.rpc("leaderboard");
    if (data) setLeaders(data);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: S.bg,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: S.text,
    }}>
      {/* Header */}
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
        <button
          onClick={() => window.location.href = "/dashboard"}
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
          ← Back to Predictions
        </button>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>
        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            🏆 Leaderboard
          </h1>
          <p style={{ color: S.muted, marginTop: 8, fontSize: 15 }}>
            Rankings based on prediction accuracy
          </p>
        </div>

        {loading ? (
          <div style={{ color: S.muted, textAlign: "center", padding: "60px 0" }}>
            Loading rankings...
          </div>
        ) : leaders.length === 0 ? (
          <div style={{
            background: S.card,
            border: `1px solid ${S.border}`,
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: S.muted,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            No scores yet — check back once matches begin.
          </div>
        ) : (
          <div>
            {/* Top 3 podium */}
            {leaders.length >= 3 && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 24,
              }}>
                {[leaders[1], leaders[0], leaders[2]].map((player, i) => {
                  const actualIndex = i === 0 ? 1 : i === 1 ? 0 : 2;
                  const heights = ["160px", "190px", "140px"];
                  return (
                    <div key={actualIndex} style={{
                      background: S.card,
                      border: `1px solid ${rankColor(actualIndex)}44`,
                      borderRadius: 12,
                      padding: "20px 16px",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      minHeight: heights[i],
                      boxShadow: actualIndex === 0 ? `0 0 30px ${rankColor(0)}22` : "none",
                    }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>
                        {MEDALS[actualIndex]}
                      </div>
                      <div style={{
                        color: S.text,
                        fontWeight: 700,
                        fontSize: 14,
                        marginBottom: 4,
                        wordBreak: "break-all",
                      }}>
                        {player?.email?.split("@")[0]}
                      </div>
                      <div style={{
                        color: rankColor(actualIndex),
                        fontWeight: 800,
                        fontSize: 22,
                      }}>
                        {player?.total_points ?? 0}
                        <span style={{ fontSize: 12, fontWeight: 500, color: S.muted, marginLeft: 4 }}>pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full table */}
            <div style={{
              background: S.card,
              border: `1px solid ${S.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 80px",
                padding: "12px 20px",
                background: S.surface,
                borderBottom: `1px solid ${S.border}`,
                color: S.muted,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                <span>Rank</span>
                <span>Player</span>
                <span style={{ textAlign: "right" }}>Points</span>
              </div>

              {leaders.map((player, index) => (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 80px",
                    padding: "14px 20px",
                    borderBottom: index < leaders.length - 1 ? `1px solid ${S.border}` : "none",
                    alignItems: "center",
                    background: index < 3 ? `${rankColor(index)}08` : "transparent",
                  }}
                >
                  <span style={{
                    fontSize: index < 3 ? 20 : 14,
                    color: rankColor(index),
                    fontWeight: 700,
                  }}>
                    {index < 3 ? MEDALS[index] : `#${index + 1}`}
                  </span>
                  <div>
                    <div style={{ color: S.text, fontWeight: 600, fontSize: 14 }}>
                      {player.email?.split("@")[0]}
                    </div>
                    <div style={{ color: S.muted, fontSize: 12 }}>
                      {player.email}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      color: index < 3 ? rankColor(index) : S.textSoft,
                      fontWeight: 800,
                      fontSize: 18,
                    }}>
                      {player.total_points ?? 0}
                    </span>
                    <span style={{ color: S.muted, fontSize: 12, marginLeft: 4 }}>pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
