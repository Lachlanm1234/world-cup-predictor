import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { supabaseAdmin } from "../lib/supabase-admin";

const S = {
  bg: "#0a0f1e",
  surface: "#111827",
  card: "#1e293b",
  border: "#1f2d3d",
  accent: "#3b82f6",
  success: "#22c55e",
  successDark: "#15803d",
  muted: "#64748b",
  text: "#f1f5f9",
  textSoft: "#94a3b8",
};

const STAGE_ORDER = [
  "Group A","Group B","Group C","Group D","Group E","Group F",
  "Group G","Group H","Group I","Group J","Group K","Group L",
  "Round of 32","Round of 16","Quarter Final","Semi - Final","Final",
];

const KNOCKOUT_STAGES = ["Round of 32","Round of 16","Quarter Final","Semi - Final","Final"];

function stageSort(a, b) {
  const ai = STAGE_ORDER.indexOf(a.stage);
  const bi = STAGE_ORDER.indexOf(b.stage);
  if (ai !== bi) return ai - bi;
  return a.id > b.id ? 1 : -1;
}

function TeamInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Team name"}
      style={{
        width: "100%", height: 40, padding: "0 10px",
        background: "#0a1020",
        border: `1.5px solid ${value ? S.accent : S.border}`,
        borderRadius: 7, color: S.text, fontSize: 13, fontWeight: 600,
        outline: "none",
      }}
    />
  );
}

function ScoreInput({ value, onChange }) {
  return (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="–"
      style={{
        width: 52, height: 48, textAlign: "center",
        background: "#0a1020",
        border: `2px solid ${value !== "" && value !== undefined && value !== null ? S.success : S.border}`,
        borderRadius: 8, color: S.text, fontSize: 20, fontWeight: 700,
        outline: "none", WebkitAppearance: "none",
      }}
    />
  );
}

export default function Admin() {
  const [matches, setMatches] = useState([]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState("all");
  const [filterFinished, setFilterFinished] = useState("all");
  const [saveAllStatus, setSaveAllStatus] = useState(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      window.location.href = "/";
      return;
    }
    await loadMatches();
  };

  const loadMatches = async () => {
    const { data } = await supabase
      .from("matches")
      .select("id, stage, home_team, away_team, home_score, away_score, is_finished");
    if (data) {
      setMatches(data.sort(stageSort));
      const e = {};
      data.forEach((m) => {
        e[m.id] = {
          home: m.home_score ?? "", away: m.away_score ?? "", finished: m.is_finished ?? false,
          homeTeam: m.home_team ?? "", awayTeam: m.away_team ?? "",
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
    const match = matches.find((m) => m.id === matchId);
    const isKnockout = KNOCKOUT_STAGES.includes(match?.stage);

    const updatePayload = {
      home_score: e.home === "" ? null : Number(e.home),
      away_score: e.away === "" ? null : Number(e.away),
      is_finished: e.finished,
    };
    if (isKnockout) {
      updatePayload.home_team = e.homeTeam || null;
      updatePayload.away_team = e.awayTeam || null;
    }

    const client = isKnockout ? supabaseAdmin : supabase;
    const { error } = await client.from("matches").update(updatePayload).eq("id", matchId);

    setSaving((p) => ({ ...p, [matchId]: false }));
    if (!error) {
      setMatches((prev) => prev.map((m) =>
        m.id === matchId
          ? { ...m, ...updatePayload }
          : m
      ));
    }
  };

  const saveAllVisible = async () => {
    setSaveAllStatus("saving");
    await Promise.all(filteredMatches.map((m) => saveMatch(m.id)));
    setSaveAllStatus("done");
    setTimeout(() => setSaveAllStatus(null), 2000);
  };

  const isDirty = (m) => {
    const e = edits[m.id];
    if (!e) return false;
    const isKnockout = KNOCKOUT_STAGES.includes(m.stage);
    return (
      String(e.home) !== String(m.home_score ?? "") ||
      String(e.away) !== String(m.away_score ?? "") ||
      e.finished !== (m.is_finished ?? false) ||
      (isKnockout && (e.homeTeam !== (m.home_team ?? "") || e.awayTeam !== (m.away_team ?? "")))
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
      <header style={{
        background: S.surface, borderBottom: `1px solid ${S.border}`,
        padding: "0 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 56,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>⚙️ Admin</span>
          <span style={{
            background: S.accent + "22", color: S.accent,
            border: `1px solid ${S.accent}44`, borderRadius: 6,
            padding: "2px 7px", fontSize: 11, fontWeight: 700,
          }}>
            {finishedCount}/{matches.length}
          </span>
        </div>
        <button
          onClick={() => window.location.href = "/dashboard"}
          style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${S.border}`, borderRadius: 8, color: S.textSoft, fontSize: 13, cursor: "pointer" }}
        >
          ← Back
        </button>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            style={{
              flex: "1 1 140px", background: S.card, border: `1px solid ${S.border}`,
              borderRadius: 8, color: S.text, padding: "9px 10px", fontSize: 13,
            }}
          >
            {stages.map((s) => <option key={s} value={s}>{s === "all" ? "All stages" : s}</option>)}
          </select>

          <select
            value={filterFinished}
            onChange={(e) => setFilterFinished(e.target.value)}
            style={{
              flex: "1 1 130px", background: S.card, border: `1px solid ${S.border}`,
              borderRadius: 8, color: S.text, padding: "9px 10px", fontSize: 13,
            }}
          >
            <option value="all">All matches</option>
            <option value="pending">Pending</option>
            <option value="finished">Finished</option>
          </select>

          <button
            onClick={saveAllVisible}
            disabled={saveAllStatus === "saving"}
            style={{
              flex: "1 1 120px", padding: "9px 14px",
              background: saveAllStatus === "done" ? S.successDark : S.accent,
              border: "none", borderRadius: 8, color: "white",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              opacity: saveAllStatus === "saving" ? 0.7 : 1,
            }}
          >
            {saveAllStatus === "saving" ? "Saving…" : saveAllStatus === "done" ? "✓ Saved" : "Save All"}
          </button>
        </div>

        <div style={{ color: S.muted, fontSize: 12, marginBottom: 14, paddingLeft: 2 }}>
          {filteredMatches.length} match{filteredMatches.length !== 1 ? "es" : ""}
        </div>

        {filteredMatches.length === 0 && (
          <div style={{ textAlign: "center", color: S.muted, padding: "48px 0" }}>No matches found</div>
        )}

        {filteredMatches.map((match) => {
          const e = edits[match.id] || {};
          const dirty = isDirty(match);
          const isSaving = saving[match.id];

          return (
            <div
              key={match.id}
              style={{
                background: S.card,
                border: `1px solid ${dirty ? S.accent + "88" : e.finished ? S.success + "44" : S.border}`,
                borderRadius: 12,
                marginBottom: 10,
                overflow: "hidden",
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 14px",
                background: "#161f2e",
                borderBottom: `1px solid ${S.border}`,
              }}>
                <span style={{ color: S.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {match.stage}
                </span>
                <button
                  onClick={() => handleEdit(match.id, "finished", !e.finished)}
                  style={{
                    padding: "3px 10px",
                    background: e.finished ? S.successDark : "transparent",
                    border: `1px solid ${e.finished ? S.success : S.border}`,
                    borderRadius: 20, color: e.finished ? S.success : S.muted,
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {e.finished ? "✓ Finished" : "Pending"}
                </button>
              </div>

              {KNOCKOUT_STAGES.includes(match.stage) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, padding: "10px 14px 0" }}>
                  <TeamInput
                    value={e.homeTeam}
                    onChange={(v) => handleEdit(match.id, "homeTeam", v)}
                    placeholder="Home team"
                  />
                  <span style={{ color: S.muted, fontSize: 12, alignSelf: "center" }}>vs</span>
                  <TeamInput
                    value={e.awayTeam}
                    onChange={(v) => handleEdit(match.id, "awayTeam", v)}
                    placeholder="Away team"
                  />
                </div>
              )}

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 12,
                padding: "14px 14px",
              }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span style={{
                    color: S.text, fontWeight: 700, fontSize: 14,
                    textAlign: "right", wordBreak: "break-word",
                  }}>
                    {e.homeTeam || match.home_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
                  </span>
                  <ScoreInput value={e.home} onChange={(v) => handleEdit(match.id, "home", v)} />
                </div>

                <span style={{ color: S.muted, fontWeight: 800, fontSize: 18 }}>:</span>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                  <span style={{
                    color: S.text, fontWeight: 700, fontSize: 14,
                    wordBreak: "break-word",
                  }}>
                    {e.awayTeam || match.away_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
                  </span>
                  <ScoreInput value={e.away} onChange={(v) => handleEdit(match.id, "away", v)} />
                </div>
              </div>

              {dirty && (
                <div style={{ padding: "0 14px 12px" }}>
                  <button
                    onClick={() => saveMatch(match.id)}
                    disabled={isSaving}
                    style={{
                      width: "100%", padding: "11px",
                      background: S.accent, border: "none",
                      borderRadius: 8, color: "white",
                      fontSize: 14, fontWeight: 700, cursor: "pointer",
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    {isSaving ? "Saving…" : "Save Result"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
