import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { computeFullBracket, calculateGroupStandings, DB_STAGE } from "../lib/tournament";

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

function computeGroupTable(groupMatches, scores) {
  const table = {};
  groupMatches.forEach((m) => {
    [m.home_team, m.away_team].forEach((t) => {
      if (t && !table[t]) table[t] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    });
    const s = scores[m.id];
    if (!s || s.home === "" || s.home === undefined || s.away === "" || s.away === undefined) return;
    const hg = Number(s.home), ag = Number(s.away);
    if (!table[m.home_team] || !table[m.away_team]) return;
    table[m.home_team].p++;  table[m.away_team].p++;
    table[m.home_team].gf += hg; table[m.home_team].ga += ag;
    table[m.away_team].gf += ag; table[m.away_team].ga += hg;
    if (hg > ag)      { table[m.home_team].w++; table[m.away_team].l++; table[m.home_team].pts += 3; }
    else if (ag > hg) { table[m.away_team].w++; table[m.home_team].l++; table[m.away_team].pts += 3; }
    else              { table[m.home_team].d++; table[m.away_team].d++; table[m.home_team].pts++; table[m.away_team].pts++; }
  });
  return Object.entries(table)
    .sort(([,a],[,b]) => b.pts - a.pts || (b.gf-b.ga) - (a.gf-a.ga) || b.gf - a.gf)
    .map(([team, s]) => ({ team, ...s, gd: s.gf - s.ga }));
}

function GroupPanel({ groupKey, groupMatches, scores, savedIds, locked, onChange, onSaveGroup }) {
  const table = computeGroupTable(groupMatches, scores);
  const allSaved = groupMatches.every((m) => savedIds.has(m.id));
  const anyUnsaved = groupMatches.some((m) => !savedIds.has(m.id));

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${allSaved ? S.successDark + "66" : S.border}`,
      borderRadius: 14,
      marginBottom: 20,
      overflow: "hidden",
    }}>
      {/* Group header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 18px",
        background: "#161f2e",
        borderBottom: `1px solid ${S.border}`,
      }}>
        <span style={{ color: S.text, fontWeight: 700, fontSize: 14, letterSpacing: "0.5px" }}>
          {groupKey}
        </span>
        {!locked && (
          <button
            onClick={() => onSaveGroup(groupMatches.map(m => m.id))}
            style={{
              padding: "5px 14px",
              background: allSaved ? S.successDark : anyUnsaved ? S.accentDark : S.successDark,
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {allSaved ? "✓ Saved" : "Save Group"}
          </button>
        )}
      </div>

      {/* Two-column body */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 0,
      }}>
        {/* Left: matches */}
        <div style={{ padding: "14px 16px", borderRight: `1px solid ${S.border}` }}>
          {groupMatches.map((match) => (
            <div key={match.id} style={{ marginBottom: 10 }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{
                  color: S.text, fontWeight: 600, fontSize: 13, textAlign: "right",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {match.home_team}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <input
                    type="number" min="0"
                    value={scores[match.id]?.home ?? ""}
                    onChange={(e) => onChange(match.id, "home", e.target.value)}
                    disabled={locked}
                    placeholder="–"
                    style={{
                      width: 40, height: 36, textAlign: "center",
                      background: locked ? "#0d1829" : "#0a1020",
                      border: `1.5px solid ${scores[match.id]?.home !== undefined && scores[match.id]?.home !== "" ? S.accent : S.border}`,
                      borderRadius: 6, color: S.text, fontSize: 16, fontWeight: 700,
                      outline: "none", opacity: locked ? 0.5 : 1,
                    }}
                  />
                  <span style={{ color: S.muted, fontSize: 14, fontWeight: 700 }}>:</span>
                  <input
                    type="number" min="0"
                    value={scores[match.id]?.away ?? ""}
                    onChange={(e) => onChange(match.id, "away", e.target.value)}
                    disabled={locked}
                    placeholder="–"
                    style={{
                      width: 40, height: 36, textAlign: "center",
                      background: locked ? "#0d1829" : "#0a1020",
                      border: `1.5px solid ${scores[match.id]?.away !== undefined && scores[match.id]?.away !== "" ? S.accent : S.border}`,
                      borderRadius: 6, color: S.text, fontSize: 16, fontWeight: 700,
                      outline: "none", opacity: locked ? 0.5 : 1,
                    }}
                  />
                </div>
                <span style={{
                  color: S.text, fontWeight: 600, fontSize: 13, textAlign: "left",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {match.away_team}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: standings table */}
        <div style={{ padding: "14px 16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: S.muted }}>
                <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 600 }}>Team</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>P</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>W</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>D</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>L</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 28 }}>GF</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 28 }}>GA</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 30 }}>GD</th>
                <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 700, width: 30, color: S.accent }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.team} style={{
                  borderTop: `1px solid ${S.border}`,
                  background: i < 2 ? "#1a2d1a" : i === 2 ? "#1a1a2d" : "transparent",
                }}>
                  <td style={{
                    padding: "5px 0",
                    color: i < 2 ? S.success : i === 2 ? S.accent : S.textSoft,
                    fontWeight: i < 2 ? 700 : 400,
                    fontSize: 12,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: 80,
                  }}>{row.team}</td>
                  {["p","w","d","l","gf","ga","gd","pts"].map((k) => (
                    <td key={k} style={{
                      textAlign: "center", padding: "5px 0",
                      color: k === "pts" ? (i < 2 ? S.success : S.text) : S.textSoft,
                      fontWeight: k === "pts" ? 700 : 400,
                    }}>{row[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 10, color: S.muted }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#1a2d1a", display: "inline-block" }} /> Advances
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#1a1a2d", display: "inline-block" }} /> Possible 3rd
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match, score, locked, onChange, onSave, saved }) {
  return (
    <div style={{
      background: S.card,
      border: `1px solid ${saved ? S.successDark + "88" : S.border}`,
      borderRadius: 12,
      padding: "18px 20px",
      marginBottom: 10,
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
            type="number" min="0"
            value={score?.home ?? ""}
            onChange={(e) => onChange(match.id, "home", e.target.value)}
            disabled={locked || !match.home_team || match.home_team === "TBD"}
            placeholder="0"
            style={{
              width: 52, height: 44, textAlign: "center",
              background: locked ? "#0d1829" : "#0f172a",
              border: `1.5px solid ${score?.home !== undefined && score?.home !== "" ? S.accent : S.border}`,
              borderRadius: 8, color: S.text, fontSize: 20, fontWeight: 700, outline: "none",
              opacity: (locked || !match.home_team || match.home_team === "TBD") ? 0.4 : 1,
            }}
          />
          <span style={{ color: S.muted, fontWeight: 700, fontSize: 18 }}>–</span>
          <input
            type="number" min="0"
            value={score?.away ?? ""}
            onChange={(e) => onChange(match.id, "away", e.target.value)}
            disabled={locked || !match.away_team || match.away_team === "TBD"}
            placeholder="0"
            style={{
              width: 52, height: 44, textAlign: "center",
              background: locked ? "#0d1829" : "#0f172a",
              border: `1.5px solid ${score?.away !== undefined && score?.away !== "" ? S.accent : S.border}`,
              borderRadius: 8, color: S.text, fontSize: 20, fontWeight: 700, outline: "none",
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
              color: "white", border: "none", borderRadius: 6,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}


function Best3rdTable({ groupMatches, predMap }) {
  const allThirds = useMemo(() => {
    const groups = {};
    groupMatches.forEach((match) => {
      const g = match.stage?.replace("Group ", "").trim();
      if (!g || g.length > 1) return;
      const pred = predMap[match.id];
      if (!pred) return;
      const home = match.home_team, away = match.away_team;
      const hg = Number(pred.predicted_home_score), ag = Number(pred.predicted_away_score);
      if (!groups[g]) groups[g] = {};
      if (!groups[g][home]) groups[g][home] = { pts: 0, gd: 0, gf: 0, ga: 0, p: 0, w: 0, d: 0, l: 0 };
      if (!groups[g][away]) groups[g][away] = { pts: 0, gd: 0, gf: 0, ga: 0, p: 0, w: 0, d: 0, l: 0 };
      groups[g][home].p++; groups[g][away].p++;
      groups[g][home].gf += hg; groups[g][home].ga += ag;
      groups[g][away].gf += ag; groups[g][away].ga += hg;
      groups[g][home].gd = groups[g][home].gf - groups[g][home].ga;
      groups[g][away].gd = groups[g][away].gf - groups[g][away].ga;
      if (hg > ag)      { groups[g][home].w++; groups[g][away].l++; groups[g][home].pts += 3; }
      else if (ag > hg) { groups[g][away].w++; groups[g][home].l++; groups[g][away].pts += 3; }
      else              { groups[g][home].d++; groups[g][away].d++; groups[g][home].pts++; groups[g][away].pts++; }
    });
    const thirds = [];
    Object.keys(groups).forEach((g) => {
      const ranked = Object.entries(groups[g]).sort((a, b) =>
        b[1].pts - a[1].pts || b[1].gd - a[1].gd || b[1].gf - a[1].gf
      );
      if (ranked[2]) thirds.push({ group: g, team: ranked[2][0], ...ranked[2][1] });
    });
    return thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }, [groupMatches, predMap]);

  if (allThirds.length === 0) return null;

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${S.border}`,
      borderRadius: 14,
      overflow: "hidden",
      marginTop: 32,
      marginBottom: 8,
    }}>
      <div style={{
        padding: "12px 18px",
        background: "#161f2e",
        borderBottom: `1px solid ${S.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ color: S.text, fontWeight: 700, fontSize: 14 }}>Best 3rd Place Finishes</span>
        <span style={{ color: S.muted, fontSize: 12 }}>Top 8 advance to Round of 32</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: S.muted, background: S.surface }}>
            <th style={{ textAlign: "left", padding: "8px 18px", fontWeight: 600, width: 30 }}>#</th>
            <th style={{ textAlign: "left", padding: "8px 4px", fontWeight: 600 }}>Team</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 32 }}>Grp</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 28 }}>P</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 28 }}>W</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 28 }}>D</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 28 }}>L</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 32 }}>GF</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 32 }}>GA</th>
            <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 600, width: 36 }}>GD</th>
            <th style={{ textAlign: "center", padding: "8px 18px 8px 4px", fontWeight: 700, width: 40, color: S.accent }}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {allThirds.map((row, i) => {
            const qualifies = i < 8;
            const borderColor = qualifies ? S.success + "44" : S.border;
            return (
              <tr key={row.group} style={{
                borderTop: `1px solid ${S.border}`,
                background: qualifies ? "#1a2d1a" : i === 8 ? "#1f1a10" : "transparent",
              }}>
                <td style={{ padding: "7px 18px", color: qualifies ? S.success : S.muted, fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: "7px 4px", color: qualifies ? S.text : S.textSoft, fontWeight: qualifies ? 600 : 400 }}>{row.team}</td>
                <td style={{ padding: "7px 4px", textAlign: "center", color: S.muted }}>{row.group}</td>
                {["p","w","d","l","gf","ga","gd"].map((k) => (
                  <td key={k} style={{ padding: "7px 4px", textAlign: "center", color: S.textSoft }}>{row[k]}</td>
                ))}
                <td style={{ padding: "7px 18px 7px 4px", textAlign: "center", color: qualifies ? S.success : S.text, fontWeight: 700 }}>{row.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${S.border}`, display: "flex", gap: 16, fontSize: 11, color: S.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#1a2d1a", display: "inline-block" }} /> Advances to R32
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#1f1a10", display: "inline-block" }} /> 9th (eliminated)
        </span>
      </div>
    </div>
  );
}

function StageSection({ stage, matches, scores, predMap, savedIds, locked, onChange, onSave, onSaveGroup, isComplete, isNext, advancingStage }) {
  const label = STAGE_LABELS[stage] || stage;
  const savedCount = matches.filter((m) => savedIds.has(m.id)).length;
  const total = matches.length;
  const hasTBD = matches.some((m) => !m.home_team || m.home_team === "TBD");

  if (stage === "group") {
    const grouped = matches.reduce((acc, m) => {
      const g = m.stage || "Other";
      if (!acc[g]) acc[g] = [];
      acc[g].push(m);
      return acc;
    }, {});

    return (
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ color: S.text, fontSize: 20, fontWeight: 800, margin: 0 }}>
              {label}
            </h2>
            <p style={{ color: S.muted, fontSize: 13, margin: "4px 0 0" }}>
              {isComplete ? `All ${total} predictions saved` : `${savedCount} of ${total} saved`}
            </p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            {isComplete && <Badge color={S.success}>✓ Complete</Badge>}
          </div>
        </div>

        {!locked && total > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: S.muted }}>
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

        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([groupKey, groupMatches]) => (
          <GroupPanel
            key={groupKey}
            groupKey={groupKey}
            groupMatches={groupMatches}
            scores={scores}
            savedIds={savedIds}
            locked={locked}
            onChange={onChange}
            onSaveGroup={onSaveGroup}
          />
        ))}

        <Best3rdTable groupMatches={matches} predMap={predMap} />
      </div>
    );
  }

  // Knockout stage
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
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
      {matches.map((match) => (
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

  // Build predMap from scores (includes both saved and unsaved changes)
  const predMap = useMemo(() => {
    const map = {};
    Object.entries(scores).forEach(([matchId, s]) => {
      map[matchId] = {
        match_id: matchId,
        predicted_home_score: s.home ?? 0,
        predicted_away_score: s.away ?? 0,
      };
    });
    return map;
  }, [scores]);

  // Compute the full bracket client-side — no DB writes
  const bracket = useMemo(() => computeFullBracket(matches, predMap), [matches, predMap]);

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

    // Auto-advance tab when a stage becomes complete
    for (const { from, to } of STAGE_SEQUENCE) {
      const fromMatches = bracket[from === "group" ? "group" : from] || [];
      if (!fromMatches.length) continue;
      const newSaved = new Set([...savedIds, matchId]);
      const allSaved = fromMatches.every((m) => newSaved.has(m.id));
      if (allSaved) { setActiveTab(to); break; }
      break;
    }
  };

  const saveGroup = async (matchIds) => {
    if (locked) return;
    await Promise.all(matchIds.map((matchId) => {
      const s = scores[matchId];
      return supabase.from("predictions").upsert({
        user_id: user.id,
        match_id: matchId,
        predicted_home_score: parseInt(s?.home ?? 0),
        predicted_away_score: parseInt(s?.away ?? 0),
      });
    }));
    setSavedIds((prev) => new Set([...prev, ...matchIds]));
  };

  const lockPredictions = async () => {
    if (!confirm("Lock your predictions? This cannot be undone.")) return;
    await supabase.from("users").update({ predictions_locked: true }).eq("id", user.id);
    setLocked(true);
  };

  // keep resetAndRegenerate only as a debug escape hatch — no-op now
  const resetAndRegenerate = async (stageKey) => {
    if (!confirm(`Clear saved predictions for ${STAGE_LABELS[stageKey]}?`)) return;
    // Bracket is now purely client-side — nothing to regenerate in DB
    setAdvancingStage(null);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // Use computed bracket — each user sees their own personal knockout bracket
  const byStage = {
    group: bracket.group || [],
    R32:   bracket.R32   || [],
    R16:   bracket.R16   || [],
    QF:    bracket.QF    || [],
    SF:    bracket.SF    || [],
    Final: bracket.Final || [],
  };

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
              predMap={predMap}
              savedIds={savedIds}
              locked={locked}
              onChange={handleChange}
              onSave={savePrediction}
              onSaveGroup={saveGroup}
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
