// ui/SequenceurAccords.tsx — Grille pas-à-pas du séquenceur d'accords.
// 21 rangées = 7 degrés × 3 extensions (triade, 7e, 6e). Chaque colonne active
// un seul accord à la fois. Les étiquettes sont les noms d'accords dans la
// tonalité choisie (ex. C, Cmaj7, C6, Dm, Dm7, Dm6…).
import type { CSSProperties } from "react";
import { useI18n } from "../i18n";
import {
  decoderMotifAccords, encoderMotifAccords, NB_LIGNES_ACCORDS, nomAccordPourLigne,
} from "../audio";

interface Props {
  motif: string;
  nbPas: number;
  cle: string;
  gamme: string;
  onChange: (m: string) => void;
}

const COULEURS = ["#9b59b6", "#3498db", "#2ecc71"];

export function SequenceurAccords({ motif, nbPas, cle, gamme, onChange }: Props) {
  const { t } = useI18n();
  const grille = decoderMotifAccords(motif, nbPas);

  const basculer = (r: number, c: number) => {
    const g = grille.map((row) => row.slice());
    if (g[r][c]) {
      g[r][c] = false;
    } else {
      for (let rr = 0; rr < NB_LIGNES_ACCORDS; rr++) g[rr][c] = false;
      g[r][c] = true;
    }
    onChange(encoderMotifAccords(g));
  };

  const cellule = (actif: boolean, extIdx: number, debutTemps: boolean): CSSProperties => ({
    flex: 1, minWidth: 8, height: 12, cursor: "pointer", borderRadius: 2,
    background: actif ? COULEURS[extIdx] : "rgba(255,255,255,0.06)",
    boxShadow: actif ? `0 0 4px ${COULEURS[extIdx]}` : "none",
    marginLeft: debutTemps ? 4 : 0,
    border: "none", padding: 0,
  });

  return (
    <div className="nodrag" style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 1 }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {grille.map((row, r) => {
        const nom = nomAccordPourLigne(r, cle, gamme);
        const extIdx = r % 3;
        const finGroupe = (r + 1) % 3 === 0;
        return (
          <div key={r} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: finGroupe ? 3 : 0 }}>
            <span style={{
              width: 52, fontSize: 9, flexShrink: 0, fontWeight: 600, color: "var(--text-secondary)",
            }}>
              {nom}
            </span>
            <div style={{ display: "flex", flex: 1, gap: 2 }}>
              {row.map((actif, c) => (
                <button key={c} title={`${nom} · ${t("seq.pas")} ${c + 1}`} style={cellule(actif, extIdx, c % 4 === 0 && c > 0)}
                  onClick={(e) => { e.stopPropagation(); basculer(r, c); }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
