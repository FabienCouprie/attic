// ui/SequenceurBatterie.tsx — Grille cliquable du séquenceur de batterie.
// L'état du motif est encodé dans une chaîne (paramètre « Motif ») : 5 lignes de
// pas séparées par « | », chaque pas « 1 » (actif) ou « 0 ». La grille lit/écrit
// cette chaîne via onChange → le nœud la stocke en paramètre (persisté).
import type { CSSProperties } from "react";
import { useI18n } from "../i18n";
import { decoderMotif, encoderMotif } from "../audio";

const PISTES = [
  { nom: "Kick", coul: "#e9a13b" },
  { nom: "Snare", coul: "#e76f51" },
  { nom: "Hat F.", coul: "#2a9d8f" },
  { nom: "Hat O.", coul: "#4cc9c0" },
  { nom: "Clap", coul: "#8e6fce" },
];

export function SequenceurBatterie({ motif, nbPas, onChange }: { motif: string; nbPas: number; onChange: (m: string) => void }) {
  const { t } = useI18n();
  const grille = decoderMotif(motif, PISTES.length, nbPas);
  const basculer = (r: number, c: number) => {
    const g = grille.map((x) => x.slice());
    g[r][c] = !g[r][c];
    onChange(encoderMotif(g));
  };

  const cell = (actif: boolean, coul: string, debutTemps: boolean): CSSProperties => ({
    flex: 1, minWidth: 8, height: 16, cursor: "pointer", borderRadius: 2,
    background: actif ? coul : "rgba(255,255,255,0.06)",
    boxShadow: actif ? `0 0 4px ${coul}` : "none",
    marginLeft: debutTemps ? 4 : 0,
    border: "none", padding: 0,
  });

  return (
    <div className="nodrag" style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 3 }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {PISTES.map((p, r) => (
        <div key={p.nom} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 46, fontSize: 10, color: p.coul, flexShrink: 0, fontWeight: 600 }}>{p.nom}</span>
          <div style={{ display: "flex", flex: 1, gap: 2 }}>
            {grille[r].map((actif, c) => (
              <button key={c} title={`${t("seq.pas")} ${c + 1}`} style={cell(actif, p.coul, c % 4 === 0 && c > 0)}
                onClick={(e) => { e.stopPropagation(); basculer(r, c); }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
