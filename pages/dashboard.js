import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { computeFullBracket, calculateGroupStandings, DB_STAGE } from "../lib/tournament";

const KNOCKOUT_STAGES = [DB_STAGE.R32, DB_STAGE.R16, DB_STAGE.QF, DB_STAGE.SF, DB_STAGE.Final];

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

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

function Badge({ children, color = S.accent }) {
  return (
    <span style={{
      background: color + "22", color,
      border: `1px solid ${color}44`, borderRadius: 6,
      padding: "2px 8px", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.5px", textTransform: "uppercase",
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
    table[m.home_team].p++; table[m.away_team].p++;
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

function GroupPanel({ groupKey, groupMatches, scores, savedIds, locked, onChange, onSaveGroup, isMobile }) {
  const table = computeGroupTable(groupMatches, scores);
  const allSaved = groupMatches.every((m) => savedIds.has(m.id));

  const standings = (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ color: S.muted }}>
          <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 600 }}>Team</th>
          <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>P</th>
          <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>W</th>
          <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>D</th>
          <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 22 }}>L</th>
          {!isMobile && <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 28 }}>GF</th>}
          {!isMobile && <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600, width: 28 }}>GA</th>}
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
              fontWeight: i < 2 ? 700 : 400, fontSize: 12,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: isMobile ? 90 : 80,
            }}>{row.team}</td>
            <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.p}</td>
            <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.w}</td>
            <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.d}</td>
            <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.l}</td>
            {!isMobile && <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.gf}</td>}
            {!isMobile && <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.ga}</td>}
            <td style={{ textAlign: "center", padding: "5px 0", color: S.textSoft }}>{row.gd}</td>
            <td style={{ textAlign: "center", padding: "5px 0", color: i < 2 ? S.success : S.text, fontWeight: 700 }}>{row.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${allSaved ? S.successDark + "66" : S.border}`,
      borderRadius: 14, marginBottom: 16, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", background: "#161f2e", borderBottom: `1px solid ${S.border}`,
      }}>
        <span style={{ color: S.text, fontWeight: 700, fontSize: 14 }}>{groupKey}</span>
        {!locked && (
          <button
            onClick={() => onSaveGroup(groupMatches.map(m => m.id))}
            style={{
              padding: "5px 14px",
              background: allSaved ? S.successDark : S.accentDark,
              color: "white", border: "none", borderRadius: 6,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            {allSaved ? "✓ Saved" : "Save Group"}
          </button>
        )}
      </div>

      {isMobile ? (
        <div>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${S.border}` }}>
            {groupMatches.map((match) => (
              <div key={match.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
                  <span style={{ color: S.text, fontWeight: 600, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {match.home_team}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number" min="0" inputMode="numeric"
                      value={scores[match.id]?.home ?? ""}
                      onChange={(e) => onChange(match.id, "home", e.target.value)}
                      disabled={locked} placeholder="–"
                      style={{
                        width: 44, height: 40, textAlign: "center",
                        background: locked ? "#0d1829" : "#0a1020",
                        border: `1.5px solid ${scores[match.id]?.home !== undefined && scores[match.id]?.home !== "" ? S.accent : S.border}`,
                        borderRadius: 6, color: S.text, fontSize: 17, fontWeight: 700,
                        outline: "none", opacity: locked ? 0.5 : 1,
                      }}
                    />
                    <span style={{ color: S.muted, fontSize: 14, fontWeight: 700 }}>:</span>
                    <input
                      type="number" min="0" inputMode="numeric"
                      value={scores[match.id]?.away ?? ""}
                      onChange={(e) => onChange(match.id, "away", e.target.value)}
                      disabled={locked} placeholder="–"
                      style={{
                        width: 44, height: 40, textAlign: "center",
                        background: locked ? "#0d1829" : "#0a1020",
                        border: `1.5px solid ${scores[match.id]?.away !== undefined && scores[match.id]?.away !== "" ? S.accent : S.border}`,
                        borderRadius: 6, color: S.text, fontSize: 17, fontWeight: 700,
                        outline: "none", opacity: locked ? 0.5 : 1,
                      }}
                    />
                  </div>
                  <span style={{ color: S.text, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {match.away_team}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 14px" }}>
            {standings}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ padding: "14px 16px", borderRight: `1px solid ${S.border}` }}>
            {groupMatches.map((match) => (
              <div key={match.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
                  <span style={{ color: S.text, fontWeight: 600, fontSize: 13, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {match.home_team}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <input
                      type="number" min="0"
                      value={scores[match.id]?.home ?? ""}
                      onChange={(e) => onChange(match.id, "home", e.target.value)}
                      disabled={locked} placeholder="–"
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
                      disabled={locked} placeholder="–"
                      style={{
                        width: 40, height: 36, textAlign: "center",
                        background: locked ? "#0d1829" : "#0a1020",
                        border: `1.5px solid ${scores[match.id]?.away !== undefined && scores[match.id]?.away !== "" ? S.accent : S.border}`,
                        borderRadius: 6, color: S.text, fontSize: 16, fontWeight: 700,
                        outline: "none", opacity: locked ? 0.5 : 1,
                      }}
                    />
                  </div>
                  <span style={{ color: S.text, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {match.away_team}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "14px 16px" }}>
            {standings}
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
      )}
    </div>
  );
}

function MatchCard({ match, score, locked, onChange, onSave, saved, isMobile }) {
  const isTBD = !match.home_team || match.home_team === "TBD";
  return (
    <div style={{
      background: S.card,
      border: `1px solid ${saved ? S.successDark + "88" : S.border}`,
      borderRadius: 12, padding: isMobile ? "14px" : "18px 20px", marginBottom: 10,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: isMobile ? 8 : 16 }}>
        <div style={{ textAlign: "right" }}>
          <span style={{ color: S.text, fontWeight: 700, fontSize: isMobile ? 13 : 16, wordBreak: "break-word" }}>
            {match.home_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 5 : 8 }}>
          <input
            type="number" min="0" inputMode="numeric"
            value={score?.home ?? ""}
            onChange={(e) => onChange(match.id, "home", e.target.value)}
            disabled={locked || isTBD}
            placeholder="0"
            style={{
              width: isMobile ? 46 : 52, height: isMobile ? 42 : 44, textAlign: "center",
              background: locked ? "#0d1829" : "#0f172a",
              border: `1.5px solid ${score?.home !== undefined && score?.home !== "" ? S.accent : S.border}`,
              borderRadius: 8, color: S.text, fontSize: isMobile ? 18 : 20, fontWeight: 700,
              outline: "none", opacity: (locked || isTBD) ? 0.4 : 1,
            }}
          />
          <span style={{ color: S.muted, fontWeight: 700, fontSize: isMobile ? 15 : 18 }}>–</span>
          <input
            type="number" min="0" inputMode="numeric"
            value={score?.away ?? ""}
            onChange={(e) => onChange(match.id, "away", e.target.value)}
            disabled={locked || isTBD}
            placeholder="0"
            style={{
              width: isMobile ? 46 : 52, height: isMobile ? 42 : 44, textAlign: "center",
              background: locked ? "#0d1829" : "#0f172a",
              border: `1.5px solid ${score?.away !== undefined && score?.away !== "" ? S.accent : S.border}`,
              borderRadius: 8, color: S.text, fontSize: isMobile ? 18 : 20, fontWeight: 700,
              outline: "none", opacity: (locked || isTBD) ? 0.4 : 1,
            }}
          />
        </div>
        <div style={{ textAlign: "left" }}>
          <span style={{ color: S.text, fontWeight: 700, fontSize: isMobile ? 13 : 16, wordBreak: "break-word" }}>
            {match.away_team || <span style={{ color: S.muted, fontStyle: "italic" }}>TBD</span>}
          </span>
        </div>
      </div>
      {!locked && !isTBD && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            onClick={() => onSave(match.id)}
            style={{
              padding: isMobile ? "9px 0" : "7px 20px",
              width: isMobile ? "100%" : "auto",
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

function Best3rdTable({ groupMatches, predMap, isMobile }) {
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

  const cols = isMobile
    ? ["p", "w", "d", "l", "gd", "pts"]
    : ["p", "w", "d", "l", "gf", "ga", "gd", "pts"];

  return (
    <div style={{
      background: S.card, border: `1px solid ${S.border}`,
      borderRadius: 14, overflow: "hidden", marginTop: 24, marginBottom: 8,
    }}>
      <div style={{
        padding: "10px 14px", background: "#161f2e",
        borderBottom: `1px solid ${S.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: S.text, fontWeight: 700, fontSize: 13 }}>Best 3rd Place Finishes</span>
        <span style={{ color: S.muted, fontSize: 11 }}>Top 8 advance</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: S.muted, background: S.surface }}>
              <th style={{ textAlign: "left", padding: "7px 14px", fontWeight: 600, width: 28 }}>#</th>
              <th style={{ textAlign: "left", padding: "7px 4px", fontWeight: 600 }}>Team</th>
              <th style={{ textAlign: "center", padding: "7px 4px", fontWeight: 600, width: 30 }}>Grp</th>
              {cols.map((k) => (
                <th key={k} style={{ textAlign: "center", padding: "7px 4px", fontWeight: k === "pts" ? 700 : 600, width: 28, color: k === "pts" ? S.accent : undefined }}>
                  {k.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allThirds.map((row, i) => (
              <tr key={row.group} style={{
                borderTop: `1px solid ${S.border}`,
                background: i < 8 ? "#1a2d1a" : i === 8 ? "#1f1a10" : "transparent",
              }}>
                <td style={{ padding: "6px 14px", color: i < 8 ? S.success : S.muted, fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: "6px 4px", color: i < 8 ? S.text : S.textSoft, fontWeight: i < 8 ? 600 : 400, whiteSpace: "nowrap" }}>{row.team}</td>
                <td style={{ padding: "6px 4px", textAlign: "center", color: S.muted }}>{row.group}</td>
                {cols.map((k) => (
                  <td key={k} style={{ padding: "6px 4px", textAlign: "center", color: k === "pts" ? (i < 8 ? S.success : S.text) : S.textSoft, fontWeight: k === "pts" ? 700 : 400 }}>
                    {row[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StageSection({ stage, matches, scores, predMap, savedIds, locked, onChange, onSave, onSaveGroup, isComplete, advancingStage, isMobile }) {
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ color: S.text, fontSize: isMobile ? 17 : 20, fontWeight: 800, margin: 0 }}>{label}</h2>
            <p style={{ color: S.muted, fontSize: 12, margin: "3px 0 0" }}>
              {isComplete ? `All ${total} predictions saved` : `${savedCount} of ${total} saved`}
            </p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            {isComplete && <Badge color={S.success}>✓ Complete</Badge>}
          </div>
        </div>

        {!locked && total > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12, color: S.muted }}>
              <span>Progress</span>
              <span>{Math.round((savedCount / total) * 100)}%</span>
            </div>
            <div style={{ height: 4, background: S.border, borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${(savedCount / total) * 100}%`,
                background: "linear-gradient(90deg, #2563eb, #22c55e)",
                borderRadius: 99, transition: "width 0.4s ease",
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
            isMobile={isMobile}
          />
        ))}

        <Best3rdTable groupMatches={matches} predMap={predMap} isMobile={isMobile} />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ color: S.text, fontSize: isMobile ? 17 : 20, fontWeight: 800, margin: 0 }}>{label}</h2>
          <p style={{ color: S.muted, fontSize: 12, margin: "3px 0 0" }}>
            {hasTBD ? "Teams fill in once previous round is complete"
              : isComplete ? `All ${total} predictions saved`
              : `${savedCount} of ${total} saved`}
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
          isMobile={isMobile}
        />
      ))}
    </div>
  );
}

function LiveMatchCard({ match, livePred, onSave, saved, isMobile }) {
  const [home, setHome] = useState(livePred?.home ?? "");
  const [away, setAway] = useState(livePred?.away ?? "");
  const isFinished = match.is_finished;
  const hasPred = livePred != null;

  let resultBadge = null;
  if (isFinished && hasPred) {
    const ph = Number(livePred.home), pa = Number(livePred.away);
    const ah = Number(match.home_score), aa = Number(match.away_score);
    if (ph === ah && pa === aa) {
      resultBadge = <span style={{ fontSize: 11, fontWeight: 700, color: S.success, background: S.success + "22", border: `1px solid ${S.success}44`, borderRadius: 6, padding: "2px 7px" }}>+3 Exact</span>;
    } else if (Math.sign(ph - pa) === Math.sign(ah - aa)) {
      resultBadge = <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "#f59e0b22", border: "1px solid #f59e0b44", borderRadius: 6, padding: "2px 7px" }}>+1 Result</span>;
    } else {
      resultBadge = <span style={{ fontSize: 11, fontWeight: 700, color: S.muted, background: S.muted + "22", border: `1px solid ${S.muted}44`, borderRadius: 6, padding: "2px 7px" }}>0 pts</span>;
    }
  }

  const scoreDisplay = isFinished
    ? <span style={{ color: S.success, fontWeight: 800, fontSize: 18, minWidth: 40, textAlign: "center" }}>{match.home_score}–{match.away_score}</span>
    : null;

  const handleSave = async () => {
    await onSave(match.id, home, away);
  };

  return (
    <div style={{
      background: S.card,
      border: `1px solid ${isFinished ? S.success + "44" : saved ? S.accentDark + "88" : S.border}`,
      borderRadius: 12, padding: isMobile ? "12px" : "16px 20px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ color: S.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{match.stage}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {resultBadge}
          {isFinished && <span style={{ fontSize: 11, color: S.muted, background: S.muted + "22", border: `1px solid ${S.muted}44`, borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>Final</span>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: isMobile ? 8 : 16 }}>
        <span style={{ color: S.text, fontWeight: 700, fontSize: isMobile ? 13 : 15, textAlign: "right", wordBreak: "break-word" }}>{match.home_team}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {isFinished
            ? scoreDisplay
            : (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={home}
                  onChange={(e) => setHome(e.target.value)}
                  placeholder="0"
                  style={{
                    width: isMobile ? 44 : 50, height: isMobile ? 40 : 44, textAlign: "center",
                    background: "#0a1020", border: `1.5px solid ${home !== "" ? S.accent : S.border}`,
                    borderRadius: 7, color: S.text, fontSize: 18, fontWeight: 700, outline: "none",
                  }}
                />
                <span style={{ color: S.muted, fontWeight: 700 }}>–</span>
                <input
                  type="number" min="0" inputMode="numeric"
                  value={away}
                  onChange={(e) => setAway(e.target.value)}
                  placeholder="0"
                  style={{
                    width: isMobile ? 44 : 50, height: isMobile ? 40 : 44, textAlign: "center",
                    background: "#0a1020", border: `1.5px solid ${away !== "" ? S.accent : S.border}`,
                    borderRadius: 7, color: S.text, fontSize: 18, fontWeight: 700, outline: "none",
                  }}
                />
              </div>
            )
          }
        </div>
        <span style={{ color: S.text, fontWeight: 700, fontSize: isMobile ? 13 : 15, wordBreak: "break-word" }}>{match.away_team}</span>
      </div>
      {!isFinished && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button
            onClick={handleSave}
            style={{
              padding: isMobile ? "9px 0" : "7px 24px",
              width: isMobile ? "100%" : "auto",
              background: saved ? S.successDark : S.accentDark,
              color: "white", border: "none", borderRadius: 6,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {saved ? "✓ Saved" : "Save Prediction"}
          </button>
        </div>
      )}
    </div>
  );
}

function LiveTournamentTab({ userId, isMobile }) {
  const [liveMatches, setLiveMatches] = useState([]);
  const [livePreds, setLivePreds] = useState({});
  const [savedLive, setSavedLive] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("id, stage, home_team, away_team, home_score, away_score, is_finished")
        .in("stage", KNOCKOUT_STAGES)
        .not("home_team", "is", null)
        .not("away_team", "is", null)
        .neq("home_team", "TBD")
        .neq("away_team", "TBD");

      const { data: preds } = await supabase
        .from("live_predictions")
        .select("match_id, predicted_home_score, predicted_away_score")
        .eq("user_id", userId);

      const predMap = {};
      const savedSet = new Set();
      preds?.forEach((p) => {
        predMap[p.match_id] = { home: p.predicted_home_score, away: p.predicted_away_score };
        savedSet.add(p.match_id);
      });

      setLiveMatches(matches || []);
      setLivePreds(predMap);
      setSavedLive(savedSet);
      setLoading(false);
    };
    load();
  }, [userId]);

  const saveLivePred = async (matchId, home, away) => {
    await supabase.from("live_predictions").upsert({
      user_id: userId, match_id: matchId,
      predicted_home_score: parseInt(home ?? 0),
      predicted_away_score: parseInt(away ?? 0),
    });
    setLivePreds((prev) => ({ ...prev, [matchId]: { home, away } }));
    setSavedLive((prev) => new Set([...prev, matchId]));
  };

  if (loading) return (
    <div style={{ color: S.muted, textAlign: "center", padding: "40px 0" }}>Loading live fixtures...</div>
  );

  if (liveMatches.length === 0) return (
    <div style={{
      background: S.card, border: `1px solid ${S.border}`, borderRadius: 14,
      padding: "40px 24px", textAlign: "center",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
      <div style={{ color: S.text, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No live fixtures yet</div>
      <div style={{ color: S.muted, fontSize: 13 }}>Knockout fixtures will appear here once the group stage is complete and admin enters the teams.</div>
    </div>
  );

  const byStage = {};
  KNOCKOUT_STAGES.forEach((s) => { byStage[s] = []; });
  liveMatches.forEach((m) => { if (byStage[m.stage]) byStage[m.stage].push(m); });

  const stageLabelMap = {
    [DB_STAGE.R32]: "Round of 32",
    [DB_STAGE.R16]: "Round of 16",
    [DB_STAGE.QF]: "Quarter-finals",
    [DB_STAGE.SF]: "Semi-finals",
    [DB_STAGE.Final]: "Final",
  };

  return (
    <div>
      <div style={{ background: "#0c1a2e", border: `1px solid ${S.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ color: S.text, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Live Round-by-Round Predictions</div>
        <div style={{ color: S.muted, fontSize: 12 }}>Predict each knockout round as fixtures are confirmed. Points count alongside your initial bracket predictions.</div>
      </div>

      {KNOCKOUT_STAGES.map((stage) => {
        const ms = byStage[stage];
        if (!ms.length) return null;
        return (
          <div key={stage} style={{ marginBottom: 32 }}>
            <h2 style={{ color: S.text, fontSize: isMobile ? 16 : 19, fontWeight: 800, margin: "0 0 14px" }}>{stageLabelMap[stage]}</h2>
            {ms.map((match) => (
              <LiveMatchCard
                key={match.id}
                match={match}
                livePred={livePreds[match.id] ?? null}
                onSave={saveLivePred}
                saved={savedLive.has(match.id)}
                isMobile={isMobile}
              />
            ))}
          </div>
        );
      })}
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
  const [topMode, setTopMode] = useState("predictions");
  const isMobile = useIsMobile();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/"; return; }
    setUser(user);

    const { data: userRow } = await supabase
      .from("users").select("predictions_locked").eq("id", user.id).single();
    setLocked(userRow?.predictions_locked ?? false);

    const { data: matchData } = await supabase.from("matches").select("*");
    const { data: predData } = await supabase.from("predictions").select("*").eq("user_id", user.id);

    const storedScores = {};
    const saved = new Set();
    predData?.forEach((p) => {
      storedScores[p.match_id] = { home: p.predicted_home_score, away: p.predicted_away_score };
      saved.add(p.match_id);
    });

    setMatches(matchData || []);
    setScores(storedScores);
    setSavedIds(saved);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const predMap = useMemo(() => {
    const map = {};
    Object.entries(scores).forEach(([matchId, s]) => {
      map[matchId] = { match_id: matchId, predicted_home_score: s.home ?? 0, predicted_away_score: s.away ?? 0 };
    });
    return map;
  }, [scores]);

  const bracket = useMemo(() => computeFullBracket(matches, predMap), [matches, predMap]);

  const handleChange = (matchId, field, value) => {
    if (locked) return;
    setSavedIds((prev) => { const n = new Set(prev); n.delete(matchId); return n; });
    setScores((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [field]: value } }));
  };

  const savePrediction = async (matchId) => {
    if (locked) return;
    const matchScore = scores[matchId];
    await supabase.from("predictions").upsert({
      user_id: user.id, match_id: matchId,
      predicted_home_score: parseInt(matchScore?.home ?? 0),
      predicted_away_score: parseInt(matchScore?.away ?? 0),
    });
    setSavedIds((prev) => new Set([...prev, matchId]));
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
        user_id: user.id, match_id: matchId,
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

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const byStage = {
    group: bracket.group || [],
    R32: bracket.R32 || [],
    R16: bracket.R16 || [],
    QF:  bracket.QF  || [],
    SF:  bracket.SF  || [],
    Final: bracket.Final || [],
  };

  const visibleStages = STAGE_ORDER.filter((s) => byStage[s].length > 0);

  const isStageComplete = (stage) => {
    const ms = byStage[stage];
    return ms.length > 0 && ms.every((m) => savedIds.has(m.id));
  };

  const currentActiveStage = visibleStages.find((s) => {
    const ms = byStage[s];
    if (!ms.length) return false;
    if (s !== "group" && ms.every((m) => !m.home_team || m.home_team === "TBD")) return false;
    return !isStageComplete(s);
  }) || visibleStages[visibleStages.length - 1];

  const groupSavedCount = byStage.group.filter((m) => savedIds.has(m.id)).length;
  const groupTotal = byStage.group.length;
  const isAdmin = user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: S.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      color: S.textSoft, fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 16,
    }}>
      Loading your predictions...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: S.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: S.text }}>
      <header style={{
        background: S.surface, borderBottom: `1px solid ${S.border}`,
        padding: isMobile ? "0 12px" : "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: isMobile ? 52 : 64, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: isMobile ? 18 : 22 }}>⚽</span>
          {!isMobile && (
            <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.3px" }}>
              World Cup Predictor
            </span>
          )}
          {isMobile && (
            <span style={{ fontWeight: 800, fontSize: 15 }}>WC Predictor</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12 }}>
          {isAdmin && (
            <button onClick={() => window.location.href = "/admin"} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "transparent", border: `1px solid ${S.border}`,
              borderRadius: 8, color: S.muted, fontSize: isMobile ? 12 : 13, cursor: "pointer",
            }}>
              ⚙️{!isMobile && " Admin"}
            </button>
          )}
          <button onClick={() => window.location.href = "/leaderboard"} style={{
            padding: isMobile ? "6px 10px" : "8px 16px",
            background: "transparent", border: `1px solid ${S.border}`,
            borderRadius: 8, color: S.textSoft, fontSize: isMobile ? 12 : 13, fontWeight: 600, cursor: "pointer",
          }}>
            🏆{!isMobile && " Leaderboard"}
          </button>
          {!isMobile && (
            <div style={{
              padding: "6px 12px", background: "#0f172a",
              border: `1px solid ${S.border}`, borderRadius: 8, color: S.muted, fontSize: 12,
            }}>
              {user?.email}
            </div>
          )}
          <button onClick={logout} style={{
            padding: isMobile ? "6px 10px" : "8px 14px",
            background: "transparent", border: `1px solid ${S.border}`,
            borderRadius: 8, color: S.muted, fontSize: isMobile ? 12 : 13, cursor: "pointer",
          }}>
            {isMobile ? "↩" : "Sign out"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "14px 10px" : "32px 24px" }}>
        {/* Top mode toggle */}
        <div style={{
          display: "flex", gap: 3, marginBottom: 20,
          background: S.surface, borderRadius: 10, padding: 3,
          border: `1px solid ${S.border}`,
        }}>
          {["predictions", "live"].map((mode) => (
            <button
              key={mode}
              onClick={() => setTopMode(mode)}
              style={{
                flex: 1, padding: isMobile ? "10px 8px" : "11px 16px",
                border: "none", borderRadius: 7,
                background: topMode === mode ? S.accent : "transparent",
                color: topMode === mode ? "white" : S.muted,
                fontWeight: 700, fontSize: isMobile ? 13 : 14, cursor: "pointer",
              }}
            >
              {mode === "predictions" ? "🎯 My Predictions" : "⚡ Live Tournament"}
            </button>
          ))}
        </div>

        {topMode === "live" && user && (
          <LiveTournamentTab userId={user.id} isMobile={isMobile} />
        )}

        {topMode === "predictions" && (
          <>
        {locked && (
          <div style={{
            background: "#052e16", border: "1px solid #16a34a", borderRadius: 12,
            padding: isMobile ? "12px 14px" : "16px 20px", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div>
              <div style={{ color: "#86efac", fontWeight: 700, fontSize: 14 }}>Predictions locked — you&apos;re in!</div>
              <div style={{ color: "#4ade80", fontSize: 12, marginTop: 2 }}>Your predictions have been submitted. Good luck!</div>
            </div>
          </div>
        )}

        {!locked && (
          <div style={{
            background: "#0c1a2e", border: `1px solid ${S.border}`, borderRadius: 12,
            padding: isMobile ? "12px 14px" : "14px 20px", marginBottom: 16,
            display: "flex", alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between", gap: 10,
          }}>
            <div>
              <div style={{ color: S.text, fontWeight: 700, fontSize: 14 }}>Make your predictions</div>
              <div style={{ color: S.muted, fontSize: 12, marginTop: 2 }}>
                {isStageComplete("group")
                  ? "Group stage complete — knockout rounds fill in automatically"
                  : `Group stage: ${groupSavedCount} of ${groupTotal} saved`}
              </div>
            </div>
            <button
              onClick={lockPredictions}
              style={{
                padding: "10px 20px",
                background: "linear-gradient(135deg, #16a34a, #22c55e)",
                border: "none", borderRadius: 8, color: "white",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 4px 12px rgba(34,197,94,0.25)",
              }}
            >
              🔒 Lock Predictions
            </button>
          </div>
        )}

        <div style={{
          display: "flex", gap: 3, marginBottom: isMobile ? 16 : 28,
          background: S.surface, borderRadius: 10, padding: 3,
          border: `1px solid ${S.border}`, overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}>
          {visibleStages.map((stage) => {
            const complete = isStageComplete(stage);
            const isActive = stage === activeTab;
            const isCurrent = stage === currentActiveStage;
            const ms = byStage[stage];
            const allTBD = stage !== "group" && ms.every((m) => !m.home_team || m.home_team === "TBD");

            return (
              <button
                key={stage}
                onClick={() => setActiveTab(stage)}
                style={{
                  flex: "0 0 auto",
                  padding: isMobile ? "8px 10px" : "9px 14px",
                  border: "none", borderRadius: 7,
                  cursor: allTBD ? "default" : "pointer",
                  fontWeight: 600, fontSize: isMobile ? 12 : 13,
                  background: isActive ? S.accent : "transparent",
                  color: isActive ? "white" : allTBD ? S.border : complete ? S.success : isCurrent ? S.text : S.muted,
                  whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                {complete && !isActive && <span style={{ fontSize: 9 }}>✓</span>}
                {isMobile ? STAGE_LABELS[stage].replace("Quarter-finals", "QF").replace("Semi-finals", "SF").replace("Group Stage", "Groups").replace("Round of ", "R") : STAGE_LABELS[stage]}
              </button>
            );
          })}
        </div>

        {visibleStages.includes(activeTab) && (
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
            isMobile={isMobile}
          />
        )}
          </>
        )}
      </main>
    </div>
  );
}
