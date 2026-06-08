import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { computeFullBracket, DB_STAGE } from "../lib/tournament";

const BRACKET_PTS = {
  [DB_STAGE.R32]: 1,
  [DB_STAGE.R16]: 2,
  [DB_STAGE.QF]: 4,
  [DB_STAGE.SF]: 6,
  [DB_STAGE.Final]: 10,
  winner: 20,
};

const S = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#1e293b",
  border: "#1f2d3d",
  accent: "#3b82f6",
  text: "#f1f5f9",
  textSoft: "#94a3b8",
  muted: "#64748b",
  success: "#22c55e",
  gold: "#fbbf24",
  silver: "#94a3b8",
  bronze: "#cd7c3a",
};

const MEDALS = ["🥇", "🥈", "🥉"];

function rankColor(i) {
  if (i === 0) return "#fbbf24";
  if (i === 1) return "#94a3b8";
  if (i === 2) return "#cd7c3a";
  return S.muted;
}

function calcPoints(predHome, predAway, actualHome, actualAway) {
  if (predHome === actualHome && predAway === actualAway) return 3;
  const predResult = Math.sign(predHome - predAway);
  const actualResult = Math.sign(actualHome - actualAway);
  if (predResult === actualResult) return 1;
  return 0;
}

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [finishedCount, setFinishedCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);

    const { data: allMatches } = await supabase
      .from("matches")
      .select("id, stage, home_team, away_team, home_score, away_score, is_finished");

    const finished = (allMatches || []).filter((m) => m.is_finished);
    setFinishedCount(finished.length);

    const { data: userData } = await supabase.from("users").select("id, email");
    const emailMap = {};
    userData?.forEach((u) => { if (u.email) emailMap[u.id] = u.email; });

    if ((allMatches || []).length === 0) {
      setLeaders((userData || []).map((u) => ({
        uid: u.id, email: u.email || "unknown", total_points: 0, bracket_pts: 0, match_pts: 0, live_pts: 0, exact: 0, result: 0,
      })));
      setLoading(false);
      return;
    }

    const scoreMap = {};
    finished.forEach((m) => { scoreMap[m.id] = m; });

    const { data: preds } = await supabase
      .from("predictions")
      .select("user_id, match_id, predicted_home_score, predicted_away_score");

    const { data: livePreds } = await supabase
      .from("live_predictions")
      .select("user_id, match_id, predicted_home_score, predicted_away_score");

    const predsByUser = {};
    (preds || []).forEach((p) => {
      if (!predsByUser[p.user_id]) predsByUser[p.user_id] = {};
      predsByUser[p.user_id][p.match_id] = {
        match_id: p.match_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
      };
    });

    const actualTeamsByStage = {};
    (allMatches || []).forEach((m) => {
      if (m.stage && m.home_team && m.away_team && m.home_team !== "TBD" && m.away_team !== "TBD") {
        if (!actualTeamsByStage[m.stage]) actualTeamsByStage[m.stage] = new Set();
        actualTeamsByStage[m.stage].add(m.home_team);
        actualTeamsByStage[m.stage].add(m.away_team);
      }
    });

    const finalMatch = finished.find((m) => m.stage === DB_STAGE.Final);
    let actualWinner = null;
    if (finalMatch) {
      actualWinner = finalMatch.home_score > finalMatch.away_score
        ? finalMatch.home_team
        : finalMatch.away_team;
    }

    const matchPtsMap = {};
    const exactMap = {};
    const resultMap = {};

    (preds || []).forEach((p) => {
      const m = scoreMap[p.match_id];
      if (!m || !m.stage?.startsWith("Group ")) return;
      const pts = calcPoints(
        Number(p.predicted_home_score), Number(p.predicted_away_score),
        Number(m.home_score), Number(m.away_score)
      );
      if (!matchPtsMap[p.user_id]) { matchPtsMap[p.user_id] = 0; exactMap[p.user_id] = 0; resultMap[p.user_id] = 0; }
      matchPtsMap[p.user_id] += pts;
      if (pts === 3) exactMap[p.user_id]++;
      else if (pts === 1) resultMap[p.user_id]++;
    });

    const livePtsMap = {};
    const liveExactMap = {};
    const liveResultMap = {};
    (livePreds || []).forEach((p) => {
      const m = scoreMap[p.match_id];
      if (!m) return;
      const pts = calcPoints(
        Number(p.predicted_home_score), Number(p.predicted_away_score),
        Number(m.home_score), Number(m.away_score)
      );
      if (!livePtsMap[p.user_id]) { livePtsMap[p.user_id] = 0; liveExactMap[p.user_id] = 0; liveResultMap[p.user_id] = 0; }
      livePtsMap[p.user_id] += pts;
      if (pts === 3) liveExactMap[p.user_id]++;
      else if (pts === 1) liveResultMap[p.user_id]++;
    });

    const bracketPtsMap = {};
    Object.keys(predsByUser).forEach((uid) => {
      const bracket = computeFullBracket(allMatches, predsByUser[uid]);
      let bpts = 0;
      const knockoutKeys = ["R32", "R16", "QF", "SF", "Final"];
      const stageMap = {
        R32: DB_STAGE.R32, R16: DB_STAGE.R16, QF: DB_STAGE.QF, SF: DB_STAGE.SF, Final: DB_STAGE.Final,
      };
      knockoutKeys.forEach((key) => {
        const stageMatches = bracket[key] || [];
        const dbStage = stageMap[key];
        const actualTeams = actualTeamsByStage[dbStage] || new Set();
        stageMatches.forEach((m) => {
          if (m.home_team && m.home_team !== "TBD" && actualTeams.has(m.home_team)) bpts += BRACKET_PTS[dbStage] || 0;
          if (m.away_team && m.away_team !== "TBD" && actualTeams.has(m.away_team)) bpts += BRACKET_PTS[dbStage] || 0;
        });
        if (key === "Final" && actualWinner) {
          const finalBracket = bracket.Final?.[0];
          if (finalBracket) {
            const userFinalPred = predsByUser[uid]?.[finalBracket.id];
            if (userFinalPred && finalBracket.home_team && finalBracket.away_team) {
              const predWin = Number(userFinalPred.predicted_home_score) >= Number(userFinalPred.predicted_away_score)
                ? finalBracket.home_team : finalBracket.away_team;
              if (predWin === actualWinner) bpts += BRACKET_PTS.winner;
            }
          }
        }
      });
      bracketPtsMap[uid] = bpts;
    });

    const allUserIds = new Set([
      ...Object.keys(matchPtsMap),
      ...Object.keys(livePtsMap),
      ...Object.keys(bracketPtsMap),
      ...(userData?.map((u) => u.id) || []),
    ]);

    const rows = [...allUserIds].map((uid) => {
      const mp = matchPtsMap[uid] ?? 0;
      const lp = livePtsMap[uid] ?? 0;
      const bp = bracketPtsMap[uid] ?? 0;
      return {
        uid,
        email: emailMap[uid] || "unknown",
        match_pts: mp,
        live_pts: lp,
        bracket_pts: bp,
        total_points: mp + lp + bp,
        exact: (exactMap[uid] ?? 0) + (liveExactMap[uid] ?? 0),
        result: (resultMap[uid] ?? 0) + (liveResultMap[uid] ?? 0),
      };
    });

    rows.sort((a, b) => b.total_points - a.total_points || b.exact - a.exact);
    setLeaders(rows);
    setLoading(false);
  };

  const syncResults = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync-results", {
        method: "POST",
        headers: { "x-sync-secret": process.env.NEXT_PUBLIC_SYNC_SECRET || "" },
      });
      const data = await res.json();
      if (data.ok) {
        setSyncMsg(`✓ Synced ${data.updated} result${data.updated !== 1 ? "s" : ""}`);
        await load();
      } else {
        setSyncMsg(`Error: ${data.error}`);
      }
    } catch (e) {
      setSyncMsg(`Error: ${e.message}`);
    }
    setSyncing(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: S.bg,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: S.text,
    }}>
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
            padding: "8px 16px", background: "transparent",
            border: `1px solid ${S.border}`, borderRadius: 8,
            color: S.textSoft, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          ← Back to Predictions
        </button>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>🏆 Leaderboard</h1>
            <p style={{ color: S.muted, marginTop: 6, fontSize: 14 }}>
              {finishedCount > 0
                ? `${finishedCount} match${finishedCount !== 1 ? "es" : ""} played · 3pts exact score · 1pt correct result`
                : "Points will appear once matches kick off"}
            </p>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <button
                onClick={syncResults}
                disabled={syncing}
                style={{
                  padding: "8px 18px",
                  background: syncing ? S.surface : S.accent,
                  border: `1px solid ${S.border}`,
                  borderRadius: 8, color: "white",
                  fontSize: 13, fontWeight: 600,
                  cursor: syncing ? "default" : "pointer",
                  opacity: syncing ? 0.7 : 1,
                }}
              >
                {syncing ? "Syncing..." : "↻ Sync Results"}
              </button>
              {syncMsg && (
                <span style={{ fontSize: 12, color: syncMsg.startsWith("✓") ? S.success : "#f87171" }}>
                  {syncMsg}
                </span>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ color: S.muted, textAlign: "center", padding: "60px 0" }}>Loading rankings...</div>
        ) : leaders.length === 0 ? (
          <div style={{
            background: S.card, border: `1px solid ${S.border}`,
            borderRadius: 12, padding: "48px 24px", textAlign: "center", color: S.muted,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            No scores yet — check back once matches begin.
          </div>
        ) : (
          <div>
            {leaders.length >= 3 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                {[leaders[1], leaders[0], leaders[2]].map((player, i) => {
                  const ai = i === 0 ? 1 : i === 1 ? 0 : 2;
                  const heights = ["160px", "190px", "140px"];
                  return (
                    <div key={ai} style={{
                      background: S.card,
                      border: `1px solid ${rankColor(ai)}44`,
                      borderRadius: 12, padding: "20px 16px", textAlign: "center",
                      display: "flex", flexDirection: "column", justifyContent: "flex-end",
                      minHeight: heights[i],
                      boxShadow: ai === 0 ? `0 0 30px ${rankColor(0)}22` : "none",
                    }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>{MEDALS[ai]}</div>
                      <div style={{ color: S.text, fontWeight: 700, fontSize: 14, marginBottom: 4, wordBreak: "break-all" }}>
                        {player?.email?.split("@")[0]}
                      </div>
                      <div style={{ color: rankColor(ai), fontWeight: 800, fontSize: 22 }}>
                        {player?.total_points ?? 0}
                        <span style={{ fontSize: 12, fontWeight: 500, color: S.muted, marginLeft: 4 }}>pts</span>
                      </div>
                      <div style={{ color: S.muted, fontSize: 11, marginTop: 4 }}>
                        {player?.exact ?? 0} exact · {player?.result ?? 0} result
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 64px 64px 64px 80px",
                padding: "12px 20px",
                background: S.surface,
                borderBottom: `1px solid ${S.border}`,
                color: S.muted, fontSize: 12, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                <span>Rank</span>
                <span>Player</span>
                <span style={{ textAlign: "center" }}>Bracket</span>
                <span style={{ textAlign: "center" }}>Group</span>
                <span style={{ textAlign: "center" }}>Live</span>
                <span style={{ textAlign: "right" }}>Total</span>
              </div>

              {leaders.map((player, index) => (
                <div key={player.uid} style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr 64px 64px 64px 80px",
                  padding: "14px 20px",
                  borderBottom: index < leaders.length - 1 ? `1px solid ${S.border}` : "none",
                  alignItems: "center",
                  background: index < 3 ? `${rankColor(index)}08` : "transparent",
                }}>
                  <span style={{ fontSize: index < 3 ? 20 : 14, color: rankColor(index), fontWeight: 700 }}>
                    {index < 3 ? MEDALS[index] : `#${index + 1}`}
                  </span>
                  <div>
                    <div style={{ color: S.text, fontWeight: 600, fontSize: 14 }}>{player.email?.split("@")[0]}</div>
                    <div style={{ color: S.muted, fontSize: 12 }}>{player.email}</div>
                  </div>
                  <div style={{ textAlign: "center", color: "#a78bfa", fontWeight: 600, fontSize: 13 }}>
                    {player.bracket_pts ?? 0}
                    <span style={{ color: S.muted, fontSize: 10, marginLeft: 2 }}>pts</span>
                  </div>
                  <div style={{ textAlign: "center", color: S.success, fontWeight: 600, fontSize: 13 }}>
                    {player.match_pts ?? 0}
                    <span style={{ color: S.muted, fontSize: 10, marginLeft: 2 }}>pts</span>
                  </div>
                  <div style={{ textAlign: "center", color: S.accent, fontWeight: 600, fontSize: 13 }}>
                    {player.live_pts ?? 0}
                    <span style={{ color: S.muted, fontSize: 10, marginLeft: 2 }}>pts</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: index < 3 ? rankColor(index) : S.textSoft, fontWeight: 800, fontSize: 18 }}>
                      {player.total_points}
                    </span>
                    <span style={{ color: S.muted, fontSize: 12, marginLeft: 4 }}>pts</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 16, fontSize: 12, color: S.muted, justifyContent: "center", flexWrap: "wrap" }}>
              <span><span style={{ color: "#a78bfa", fontWeight: 700 }}>Bracket</span> — correct team in stage</span>
              <span><span style={{ color: S.success, fontWeight: 700 }}>Group</span> — group match scores</span>
              <span><span style={{ color: S.accent, fontWeight: 700 }}>Live</span> — live round predictions</span>
              <span><span style={{ color: S.text, fontWeight: 700 }}>3pts</span> exact · <span style={{ color: S.text, fontWeight: 700 }}>1pt</span> result</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
