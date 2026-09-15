// ui/ScoreEsthetique.tsx — Vues des nœuds « Score esthétique » et « Comparaison esthétique ».
//
// Échelle fixe de 1 à 10 sur tous les graphiques, jamais ajustée aux valeurs : deux
// morceaux, ou deux versions, doivent se lire sur la même règle.
import { useState, type CSSProperties } from "react";
import { useI18n } from "../i18n";
import {
  AXES_ESTHETIQUES, formaterHorodatage, type AnalyseEsthetique, type AxeEsthetique,
} from "../audio/esthetique";

export const COULEURS_AXES: Record<AxeEsthetique, string> = {
  CE: "#e9a13b", CU: "#2a9d8f", PC: "#8e6fce", PQ: "#4c9aff",
};

const MIN = 1, MAX = 10;
const part = (v: number) => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));

const cadre: CSSProperties = { padding: "4px 2px", fontSize: 11, color: "var(--text-primary, #cbd5e1)" };

function Barre({ valeur, couleur, hauteur = 8 }: { valeur: number; couleur: string; hauteur?: number }) {
  return (
    <div style={{ flex: 1, height: hauteur, background: "var(--bg-input, #161b22)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${part(valeur) * 100}%`, height: "100%", background: couleur }} />
    </div>
  );
}

function Courbes({ analyse }: { analyse: AnalyseEsthetique }) {
  const { t } = useI18n();
  const [masques, setMasques] = useState<Set<AxeEsthetique>>(new Set());
  const L = 400, H = 130, g = 22, d = 6, h = 6, b = 16;
  const duree = Math.max(analyse.dureeSec, 1e-6);
  const x = (s: number) => g + (s / duree) * (L - g - d);
  const y = (v: number) => h + (1 - part(v)) * (H - h - b);
  const basculer = (axe: AxeEsthetique) => setMasques((m) => {
    const n = new Set(m);
    if (n.has(axe)) n.delete(axe); else n.add(axe);
    return n;
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 2px" }}>
        <span style={{ color: "var(--text-secondary, #94a3b8)" }}>{t("esthetique.vue.courbes")}</span>
        <span style={{ display: "flex", gap: 4 }}>
          {AXES_ESTHETIQUES.map((axe) => (
            <button key={axe} title={t(`esthetique.axe.${axe}`)}
              onClick={(e) => { e.stopPropagation(); basculer(axe); }}
              style={{
                fontSize: 10, padding: "0 5px", borderRadius: 3, cursor: "pointer",
                border: `1px solid ${COULEURS_AXES[axe]}`,
                background: masques.has(axe) ? "transparent" : COULEURS_AXES[axe],
                color: masques.has(axe) ? COULEURS_AXES[axe] : "#0d1117",
              }}>{axe}</button>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${L} ${H}`} style={{ width: "100%", display: "block", background: "var(--bg-input, #0d1117)", borderRadius: 4 }}>
        {[2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={g} x2={L - d} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={g - 4} y={y(v) + 3} fontSize={9} textAnchor="end" fill="currentColor" fillOpacity={0.5}>{v}</text>
          </g>
        ))}
        <text x={g} y={H - 3} fontSize={9} fill="currentColor" fillOpacity={0.5}>0:00</text>
        <text x={L - d} y={H - 3} fontSize={9} textAnchor="end" fill="currentColor" fillOpacity={0.5}>{formaterHorodatage(analyse.dureeSec)}</text>
        {AXES_ESTHETIQUES.filter((axe) => !masques.has(axe)).map((axe) => {
          const points = analyse.tranches.map((tr) => [x((tr.debutSec + tr.finSec) / 2), y(tr.scores[axe])] as const);
          return (
            <g key={axe}>
              {points.length > 1 && (
                <polyline points={points.map((p) => p.join(",")).join(" ")} fill="none"
                  stroke={COULEURS_AXES[axe]} strokeWidth={1.6} strokeLinejoin="round" />
              )}
              {analyse.tranches.map((tr, i) => (
                <circle key={i} cx={points[i][0]} cy={points[i][1]} r={points.length > 40 ? 1.4 : 2.2} fill={COULEURS_AXES[axe]}>
                  <title>{`${formaterHorodatage(tr.debutSec)}–${formaterHorodatage(tr.finSec)} · ${axe} ${tr.scores[axe].toFixed(2)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function VueScoreEsthetique({ analyse }: { analyse?: AnalyseEsthetique }) {
  const { t } = useI18n();
  if (!analyse) return null;
  return (
    <div className="nodrag" style={cadre} onPointerDown={(e) => e.stopPropagation()}>
      {AXES_ESTHETIQUES.map((axe) => (
        <div key={axe} style={{ display: "flex", alignItems: "center", gap: 6, margin: "3px 0" }}>
          <span style={{ width: 88, whiteSpace: "nowrap" }}>
            <b style={{ color: COULEURS_AXES[axe] }}>{axe}</b> {t(`esthetique.axe.${axe}`)}
          </span>
          <Barre valeur={analyse.global[axe]} couleur={COULEURS_AXES[axe]} />
          <span style={{ width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{analyse.global[axe].toFixed(2)}</span>
        </div>
      ))}
      <Courbes analyse={analyse} />
    </div>
  );
}

export function VueComparaisonEsthetique({ a, b }: { a?: AnalyseEsthetique; b?: AnalyseEsthetique }) {
  const { t } = useI18n();
  if (!a || !b) return null;
  return (
    <div className="nodrag" style={cadre} onPointerDown={(e) => e.stopPropagation()}>
      {AXES_ESTHETIQUES.map((axe) => {
        const ecart = b.global[axe] - a.global[axe];
        return (
          <div key={axe} style={{ margin: "5px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span><b style={{ color: COULEURS_AXES[axe] }}>{axe}</b> {t(`esthetique.axe.${axe}`)}</span>
              <span title={t("esthetique.vue.ecart")} style={{
                fontVariantNumeric: "tabular-nums", fontWeight: 700,
                // PC compte des composantes : plus n'est pas mieux. Un Bitcrusher 8 bits la fait
                // monter de 0,6 sur une annonce parlée — son bruit compte comme une composante.
                // Seuls les trois autres axes ont un bon sens, et donc une couleur.
                color: axe === "PC" || Math.abs(ecart) < 0.005 ? "var(--text-secondary, #94a3b8)" : ecart > 0 ? "#40c057" : "#fa5252",
              }}>{ecart >= 0 ? "+" : "−"}{Math.abs(ecart).toFixed(2)}</span>
            </div>
            {([["A", a, "#8b949e"], ["B", b, COULEURS_AXES[axe]]] as const).map(([nom, analyse, couleur]) => (
              <div key={nom} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ width: 12, color: "var(--text-secondary, #94a3b8)" }}>{nom}</span>
                <Barre valeur={analyse.global[axe]} couleur={couleur} hauteur={6} />
                <span style={{ width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{analyse.global[axe].toFixed(2)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
