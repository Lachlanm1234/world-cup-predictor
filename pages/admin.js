import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const S = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#1e293b",
  border: "#1f2d3d",
  accent: "#3b82f6",
  success: "#22c55e",
  successDark: "#15803d",
  danger: "#ef4444",
  muted: "#64748b",
  text: "#f1f5f9",
  textSoft: "#94a3b8",
};

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const STAGE_ORDER = [
  "Group A","Group B","Group C","Group D","Group E","Group F",
  "Group G","Group H","Group I","Group J","Group K","Group L",
  "Round of 32","Round of 16","Quarter Final","Semi - Final","Final",
];

function stageSort(a, b) {
  const ai = STAGE_ORDER.indexOf(a.stage);
  const bi = STAGE_ORDER.indexOf(b.stage);
  if (ai !== bi) return ai - bi;
  return a.id > b.id ? 1 : -1;
}

export default function Admin() {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [edits, setEdits] = useState({});   // { matchId: { home, away, finished } }
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState("all");
  const [filterFinished, setFilterFinished] = useState("all");
  const [saveAllStatus, setSaveAllStatus] = useState(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      window.location.href = "/";
      return;
    }
    setUser(user);
    await loadMatches();
  };

  const loadMatches = async () => {
    const { data } = await supabase
      .from("matches")
      .select("id, stage, home_team, away_team, home_score, away_score, is_finished");
    if (data) {
      setMatches(data.sort(stageSort));
      // Seed edits from current DB values
      const e = {};
      data.forEach((m) => {
        e[m.id] = {
          home: m.home_score ?? "",
          away: m.away_score ?? "",
          finished: m.is_finished ?? false,
        };
      });
      setEdits(e);
    }
    setLoading(false);
  };

  const handleEdit = (id, field, value) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const saveMatch = async (matchId) => {
    setSaving((p) => ({ ...p, [matchId]: true }));
    const e = edits[matchId];
    const { error } = await supabase
      .from("matches")
      .update({
        home_score: e.home === "" ? null : Number(e.home),
        away_score: e.away === "" ? null : Number(e.away),
        is_finished: e.finished,
      })
      .eq("id", matchId);
    setSaving((p) => ({ ...p, [matchId]: false }));
    if (!error) {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? { ...m, home_score: e.home === "" ? null : Number(e.home), away_score: e.away === "" ? null : Number(e.away), is_finished: e.finished }
            : m
        )
      );
    }
  };

  const saveAllVisible = async () => {
    setSaveAllStatus("saving");
    const visible = filteredMatches.map((m) => m.id);
    await Promise.all(visible.map((id) => saveMatch(id)));
    setSaveAllStatus("done");
    setTimeout(() => setSaveAllStatus(null), 2000);
  };

  const isDirty = (m) => {
    const e = edits[m.id];
    if (!e) return false;
    return (
      String(e.home) !== String(m.home_score ?? "") ||
      String(e.away) !== String(m.away_score ?? "") ||
      e.finished !== (m.is_finished ?? false)
    );
  };

  const stages = ["all", ...STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s))];

  const filteredMatches = matches.filter((m) => {
    if (filterStage !== "all" && m.stage !== filterStage) return false;
    if (filterFinished === "finished" && !m.is_finished) return false;
    if (filterFinished === "pending" && m.is_finished) return false;
    return true;
  });

  const finishedCount = matches.filter((m) => m.is_finished).length;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", color: S.textSoft, fontFamily: "system-ui" }}>
      Loading...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: S.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: S.text }}>
      {/* Header */}
      <header style={{
        background: S.surface, borderBottom: `1px solid ${S.border}`,
        padding: "0 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 64,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚙️</span>
          <span style={{ fontWeight: 800, fontSize: 17 }}>Admin — Match Results</span>
          <span style={{ background: S.accent + "22", color: S.accent, border: `1px solid ${S.accent}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
            {finishedCount}/{matches.length} finished
          </span>
        </div>
        <button
          onClick={() => window.location.href = "/dashboard"}
          style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${S.border}`, borderRadius: 8, color: S.textSoft, fontSize: 13, cursor: "pointer" }}
        >
          ← Dashboard
        </button>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            style={{
              background: S.card, border: `1px solid ${S.border}`, borderRadius: 8,
              color: S.text, padding: "8px 12px", fontSize: 13, cursor: "pointer",
            }}
          >
            {stages.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All stages" : s}</option>
            ))}
          </select>

          <select
            value={filterFinished}
            onChange={(e) => setFilterFinished(e.target.value)}
            style={{
              background: S.card, border: `1px solid ${S.border}`, borderRadius: 8,
              color: S.text, padding: "8px 12px", fontSize: 13, cursor: "pointer",
            }}
          >
            <option value="all">All matches</option>
            <option value="pending">Pending only</option>
            <option value="finished">Finished only</option>
          </select>

          <span style={{ color: S.muted, fontSize: 13 }}>{filteredMatches.length} matches</span>

          <button
            onClick={saveAllVisible}
            disabled={saveAllStatus === "saving"}
            style={{
              marginLeft: "auto", padding: "8px 20px",
              background: saveAllStatus === "done" ? S.successDark : S.accent,
              border: "none", borderRadius: 8, color: "white",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              opacity: saveAllStatus === "saving" ? 0.7 : 1,
            }}
          >
            {saveAllStatus === "saving" ? "Saving..." : saveAllStatus === "done" ? "✓ Saved" : "Save All Visible"}
          </button>
        </div>

        {/* Match table */}
        <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "140px 1fr 100px 1fr 100px 80px",
            padding: "10px 16px", background: S.surface,
            borderBottom: `1px solid ${S.border}`,
            color: S.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            <span>Stage</span>
            <span style={{ textAlign: "right" }}>Home</span>
            <span style={{ textAlign: "center" }}>Score</span>
            <span>Away</span>
            <span style={{ textAlign: "center" }}>Finished</span>
            <span style={{ textAlign: "center" }}>Save</span>
          </div>

          {filteredMatches.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", color: S.muted }}>No matches found</div>
          )}

          {filteredMatches.map((match, idx) => {
            const e = edits[match.id] || {};
            const dirty = isDirty(match);
            const isSaving = saving[match.id];

            return (
              <div
                key={match.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 100px 1fr 100px 80px",
                  padding: "10px 16px",
                  borderBottom: idx < filteredMatches.length - 1 ? `1px solid ${S.border}` : "none",
                  alignItems: "center",
                  background: e.finished ? "#0f1e0f" : "transparent",
                  borderLeft: dirty ? `3px solid ${S.accent}` : "3px solid transparent",
                }}
              >
                {/* Stage */}
                <span style={{ color: S.muted, fontSize: 11, fontWeight: 600 }}>
                  {match.stage}
                </span>

                {/* Home team */}
                <span style={{ color: S.text, fontSize: 13, fontWeight: 600, textAlign: "right", paddingRight: 8 }}>
                  {match.home_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
                </span>

                {/* Score inputs */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <input
                    type="number" min="0"
                    value={e.home ?? ""}
                    onChange={(ev) => handleEdit(match.id, "home", ev.target.value)}
                    placeholder="–"
                    style={{
                      width: 38, height: 32, textAlign: "center",
                      background: "#0a1020", border: `1.5px solid ${e.home !== "" && e.home !== undefined ? S.success : S.border}`,
                      borderRadius: 6, color: S.text, fontSize: 15, fontWeight: 700, outline: "none",
                    }}
                  />
                  <span style={{ color: S.muted, fontWeight: 700, fontSize: 13 }}>:</span>
                  <input
                    type="number" min="0"
                    value={e.away ?? ""}
                    onChange={(ev) => handleEdit(match.id, "away", ev.target.value)}
                    placeholder="–"
                    style={{
                      width: 38, height: 32, textAlign: "center",
                      background: "#0a1020", border: `1.5px solid ${e.away !== "" && e.away !== undefined ? S.success : S.border}`,
                      borderRadius: 6, color: S.text, fontSize: 15, fontWeight: 700, outline: "none",
                    }}
                  />
                </div>

                {/* Away team */}
                <span style={{ color: S.text, fontSize: 13, fontWeight: 600, paddingLeft: 8 }}>
                  {match.away_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
                </span>

                {/* Finished toggle */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => handleEdit(match.id, "finished", !e.finished)}
                    style={{
                      padding: "4px 10px",
                      background: e.finished ? S.successDark : "transparent",
                      border: `1px solid ${e.finished ? S.success : S.border}`,
                      borderRadius: 6, color: e.finished ? S.success : S.muted,
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {e.finished ? "✓ Done" : "Pending"}
                  </button>
                </div>

                {/* Save button */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => saveMatch(match.id)}
                    disabled={isSaving || !dirty}
                    style={{
                      padding: "5px 12px",
                      background: dirty ? S.accent : "transparent",
                      border: `1px solid ${dirty ? S.accent : S.border}`,
                      borderRadius: 6, color: dirty ? "white" : S.muted,
                      fontSize: 12, fontWeight: 600,
                      cursor: dirty && !isSaving ? "pointer" : "default",
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    {isSaving ? "..." : dirty ? "Save" : "✓"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
