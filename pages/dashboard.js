import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  generateR32FromPredictions,
  advanceRoundFromPredictions,
} from "../lib/tournament";

const S = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#1e293b",
  border: "#1f2d3d",
  accent: "#3b82f6",
  accentDark: "#1d4ed8",
  success: "#22c55e",
  successDark: "#15803d",
  muted: "#64748b",
  text: "#f1f5f9",
  textSoft: "#94a3b8",
};

// Maps internal key → exact string stored in the DB's `group` column
const DB_STAGE = {
  R32:   "Round of 32",
  R16:   "Round of 16",
  QF:    "Quarter Final",   // ⚠️ update if DB uses a different string
  SF:    "Semi - Final",
  Final: "Final",
};

const STAGE_ORDER = ["group", "R32", "R16", "QF", "SF", "Final"];
const STAGE_LABELS = {
  group: "Group Stage",
  R32:   "Round of 32",
  R16:   "Round of 16",
  QF:    "Quarter-finals",
  SF:    "Semi-finals",
  Final: "Final",
};
const STAGE_SEQUENCE = [
  { from: "group", to: "R32" },
  { from: "R32",   to: "R16" },
  { from: "R16",   to: "QF" },
  { from: "QF",    to: "SF" },
  { from: "SF",    to: "Final" },
];

// A match belongs to group stage if its `group` column starts with "Group "
const isGroupMatch = (m) => m.stage?.startsWith("Group ");
const isStageMatch = (m, key) => m.stage === DB_STAGE[key];

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
  const hasPrediction = score?.home !== undefined && score?.home !== "" &&
                        score?.away !== undefined && score?.away !== "";

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${saved ? S.successDark + "88" : S.border}`,
      borderRadius: 12,
      padding: "18px 20px",
      marginBottom: 10,
      transition: "border-color 0.2s",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{ textAlign: "right" }}>
          <span style={{ color: S.text, fontWeight: 700, fontSize: 16 }}>
            {match.home_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number"
            min="0"
            value={score?.home ?? ""}
            onChange={(e) => onChange(match.id, "home", e.target.value)}
            disabled={locked || !match.home_team || match.home_team === "TBD"}
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
              opacity: (locked || !match.home_team || match.home_team === "TBD") ? 0.4 : 1,
            }}
          />
          <span style={{ color: S.muted, fontWeight: 700, fontSize: 18 }}>–</span>
          <input
            type="number"
            min="0"
            value={score?.away ?? ""}
            onChange={(e) => onChange(match.id, "away", e.target.value)}
            disabled={locked || !match.away_team || match.away_team === "TBD"}
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
              opacity: (locked || !match.away_team || match.away_team === "TBD") ? 0.4 : 1,
            }}
          />
        </div>

        <div style={{ textAlign: "left" }}>
          <span style={{ color: S.text, fontWeight: 700, fontSize: 16 }}>
            {match.away_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
          </span>
        </div>
      </div>

      {!locked && match.home_team && match.home_team !== "TBD" && (
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
            }}
          >
            {saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function StageSection({ stage, matches, scores, savedIds, locked, onChange, onSave, isComplete, isNext, advancingStage }) {
  const label = STAGE_LABELS[stage] || stage;
  const savedCount = matches.filter((m) => savedIds.has(m.id)).length;
  const total = matches.length;
  const hasTBD = matches.some((m) => !m.home_team || m.home_team === "TBD");

  // Group stage: group by letter; knockout: flat list
  const grouped = stage === "group"
    ? matches.reduce((acc, m) => {
        const g = m.stage || "Other"; // e.g. "Group A"
        if (!acc[g]) acc[g] = [];
        acc[g].push(m);
        return acc;
      }, {})
    : { all: matches };

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Stage header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 20,
      }}>
        <div>
          <h2 style={{ color: S.text, fontSize: 20, fontWeight: 800, margin: 0 }}>
            {label}
          </h2>
          <p style={{ color: S.muted, fontSize: 13, margin: "4px 0 0" }}>
            {hasTBD
              ? "Teams will be filled in once the previous round is complete"
              : isComplete
              ? `All ${total} predictions saved`
              : `${savedCount} of ${total} saved`
            }
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {isComplete && <Badge color={S.success}>✓ Complete</Badge>}
          {advancingStage === stage && <Badge color={S.accent}>Generating...</Badge>}
        </div>
      </div>

      {/* Progress bar (group stage only) */}
      {stage === "group" && !locked && total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 12,
            color: S.muted,
          }}>
            <span>Prediction progress</span>
            <span>{Math.round((savedCount / total) * 100)}%</span>
          </div>
          <div style={{ height: 4, background: S.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(savedCount / total) * 100}%`,
              background: "linear-gradient(90deg, #2563eb, #22c55e)",
              borderRadius: 99,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      )}

      {/* Matches */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([groupKey, groupMatches]) => (
        <div key={groupKey}>
          {stage === "group" && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}>
              <span style={{
                color: S.textSoft,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}>
                {groupKey}
              </span>
              <div style={{ flex: 1, height: 1, background: S.border }} />
              <span style={{ color: S.muted, fontSize: 12 }}>{groupMatches.length} matches</span>
            </div>
          )}
          {groupMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              score={scores[match.id]}
              locked={locked}
              onChange={onChange}
              onSave={onSave}
              saved={savedIds.has(match.id)}
            />
          ))}
        </div>
      ))}
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
  const [activeTab, setActiveTab] = useState("group");
  const [advancingStage, setAdvancingStage] = useState(null);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/"; return; }
    setUser(user);

    const { data: userRow } = await supabase
      .from("users")
      .select("predictions_locked")
      .eq("id", user.id)
      .single();

    setLocked(userRow?.predictions_locked ?? false);

    const { data: matchData, error: matchErr } = await supabase.from("matches").select("*");
    console.log("matches fetched:", matchData?.length, "stages:", [...new Set(matchData?.map(m => m.stage))]);
    const { data: predData } = await supabase
      .from("predictions")
      .select("*")
      .eq("user_id", user.id);

    const storedScores = {};
    const saved = new Set();
    predData?.forEach((p) => {
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
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // After any save, check if a stage just became complete and auto-advance
  const checkAndAdvance = useCallback(async (currentSavedIds, currentMatches, currentUser) => {
    for (const { from, to } of STAGE_SEQUENCE) {
      if (from === "Final") break;

      const fromMatches = currentMatches.filter((m) => {
        if (from === "group") return isGroupMatch(m);
        return isStageMatch(m, from);
      });

      if (fromMatches.length === 0) continue;

      // Stage is "complete" if every match has a real prediction saved
      const allSaved = fromMatches.every((m) => currentSavedIds.has(m.id));
      if (!allSaved) break; // Stages are sequential — stop at first incomplete

      // Check if the next stage already has teams populated (already generated)
      const toMatches = currentMatches.filter((m) => isStageMatch(m, to));
      if (toMatches.length === 0) break; // No placeholder rows — DB not set up for this stage

      const alreadyPopulated = toMatches.some((m) => m.home_team && m.home_team !== "TBD");
      if (alreadyPopulated) continue; // Already generated, move to next stage check

      // Generate / advance
      setAdvancingStage(from);
      try {
        if (from === "group") {
          await generateR32FromPredictions(currentUser.id);
        } else {
          await advanceRoundFromPredictions(currentUser.id, from, to);
        }
        // Reload matches to get updated team names
        const { data: refreshed } = await supabase.from("matches").select("*");
        setMatches(refreshed || []);
        setActiveTab(to);
      } catch (e) {
        console.error("Advance failed:", e);
      } finally {
        setAdvancingStage(null);
      }

      break; // Only advance one stage at a time
    }
  }, []);

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

    const newSavedIds = new Set([...savedIds, matchId]);
    setSavedIds(newSavedIds);

    await checkAndAdvance(newSavedIds, matches, user);
  };

  const lockPredictions = async () => {
    if (!confirm("Lock your predictions? This cannot be undone.")) return;
    await supabase.from("users").update({ predictions_locked: true }).eq("id", user.id);
    setLocked(true);
  };

  const resetAndRegenerate = async (stageKey) => {
    const dbStage = DB_STAGE[stageKey];
    if (!dbStage) return;
    if (!confirm(`Reset and regenerate ${STAGE_LABELS[stageKey]}? This will overwrite the current bracket.`)) return;
    setAdvancingStage(stageKey);
    try {
      // Clear all team names in this stage
      const stageMatches = matches.filter((m) => isStageMatch(m, stageKey));
      for (const m of stageMatches) {
        await supabase.from("matches").update({ home_team: "TBD", away_team: "TBD" }).eq("id", m.id);
      }
      // Re-run generation
      if (stageKey === "R32") {
        await generateR32FromPredictions(user.id);
      } else {
        const prev = STAGE_SEQUENCE.find((s) => s.to === stageKey);
        if (prev) await advanceRoundFromPredictions(user.id, prev.from, stageKey);
      }
      const { data: refreshed } = await supabase.from("matches").select("*");
      setMatches(refreshed || []);
    } catch (e) {
      console.error("Regenerate failed:", e);
    } finally {
      setAdvancingStage(null);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // Organise matches by stage
  const byStage = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = matches.filter((m) => {
      if (s === "group") return isGroupMatch(m);
      return isStageMatch(m, s);
    });
    return acc;
  }, {});

  // Which stages have content (populated or have placeholder rows)
  const visibleStages = STAGE_ORDER.filter((s) => byStage[s].length > 0);

  // Completion check for each stage
  const isStageComplete = (stage) => {
    const ms = byStage[stage];
    if (!ms.length) return false;
    return ms.every((m) => savedIds.has(m.id));
  };

  // Which stage is the current "active" one (first incomplete)
  const currentActiveStage = visibleStages.find((s) => {
    const ms = byStage[s];
    if (!ms.length) return false;
    // Knockout stage with all TBDs = waiting, not yet "active"
    if (s !== "group") {
      const allTBD = ms.every((m) => !m.home_team || m.home_team === "TBD");
      if (allTBD) return false;
    }
    return !isStageComplete(s);
  }) || visibleStages[visibleStages.length - 1];

  const groupSavedCount = byStage.group.filter((m) => savedIds.has(m.id)).length;
  const groupTotal = byStage.group.length;

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

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
        {/* Locked banner */}
        {locked && (
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
        )}

        {/* Action bar (only when not locked) */}
        {!locked && (
          <div style={{
            background: "#0c1a2e",
            border: `1px solid ${S.border}`,
            borderRadius: 12,
            padding: "14px 20px",
            marginBottom: 24,
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
                {isStageComplete("group")
                  ? "Group stage complete — knockout rounds will fill in automatically"
                  : `Group stage: ${groupSavedCount} of ${groupTotal} saved`}
              </div>
            </div>
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
        )}

        {/* Stage tabs */}
        <div style={{
          display: "flex",
          gap: 4,
          marginBottom: 32,
          background: S.surface,
          borderRadius: 10,
          padding: 4,
          border: `1px solid ${S.border}`,
          overflowX: "auto",
        }}>
          {visibleStages.map((stage) => {
            const complete = isStageComplete(stage);
            const isCurrent = stage === currentActiveStage;
            const isActive = stage === activeTab;
            const ms = byStage[stage];
            const allTBD = stage !== "group" && ms.every((m) => !m.home_team || m.home_team === "TBD");

            return (
              <button
                key={stage}
                onClick={() => setActiveTab(stage)}
                style={{
                  flex: "0 0 auto",
                  padding: "9px 14px",
                  border: "none",
                  borderRadius: 7,
                  cursor: allTBD ? "default" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  background: isActive ? S.accent : "transparent",
                  color: isActive ? "white" : allTBD ? S.border : complete ? S.success : isCurrent ? S.text : S.muted,
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {complete && !isActive && <span style={{ fontSize: 10 }}>✓</span>}
                {STAGE_LABELS[stage]}
              </button>
            );
          })}
        </div>

        {/* Active stage content */}
        {visibleStages.includes(activeTab) && (
          <>
            <StageSection
              stage={activeTab}
              matches={byStage[activeTab]}
              scores={scores}
              savedIds={savedIds}
              locked={locked}
              onChange={handleChange}
              onSave={savePrediction}
              isComplete={isStageComplete(activeTab)}
              isNext={activeTab === currentActiveStage}
              advancingStage={advancingStage}
            />
            {activeTab !== "group" && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button
                  onClick={() => resetAndRegenerate(activeTab)}
                  disabled={advancingStage != null}
                  style={{
                    padding: "6px 14px",
                    background: "transparent",
                    border: `1px solid ${S.border}`,
                    borderRadius: 6,
                    color: S.muted,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ↺ Reset &amp; Regenerate Bracket
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
