// ui/SequenceurMelodique.tsx — Grille piano-roll du séquenceur mélodique.
// L'état du motif est encodé dans une chaîne (paramètre « Motif ») : 13 rangées
// (du grave au aigu) de pas séparées par « | ». La grille affiche les rangées
// inversées (aigu en haut, grave en bas, comme un piano-roll).
import type { CSSProperties } from "react";
import {
  decoderMotifMelodique, encoderMotifMelodique, NB_RANGEES_MELO, nomNotePourRangee,
} from "../audio";

interface Props {
  motif: string;
  nbPas: number;
  cle: string;
  gamme: string;
  octave: number;
  onChange: (m: string) => void;
}

export function SequenceurMelodique({ motif, nbPas, cle, gamme, octave, onChange }: Props) {
  const grille = decoderMotifMelodique(motif, NB_RANGEES_MELO, nbPas);

  const basculer = (r: number, c: number) => {
    const g = grille.map((x) => x.slice());
    g[r][c] = !g[r][c];
    onChange(encoderMotifMelodique(g));
  };

  const cellule = (actif: boolean, debutTemps: boolean): CSSProperties => ({
    flex: 1, minWidth: 8, height: 13, cursor: "pointer", borderRadius: 2,
    background: actif ? "#2a9d8f" : "rgba(255,255,255,0.06)",
    boxShadow: actif ? "0 0 4px #2a9d8f" : "none",
    marginLeft: debutTemps ? 4 : 0,
    border: "none", padding: 0,
  });

  // Affiche les rangées inversées : aigu en haut (NB_RANGEES-1), grave en bas (0).
  const rangeesAffichees = [...grille].map((row, i) => ({ row, rangee: i }))
    .reverse();

  return (
    <div className="nodrag" style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 2 }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {rangeesAffichees.map(({ row, rangee }) => {
        const nom = nomNotePourRangee(rangee, cle, gamme, octave);
        const estFondamentale = nom.replace(/[0-9]/g, "") === cle;
        return (
          <div key={rangee} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 32, fontSize: 9, flexShrink: 0, fontWeight: 600,
              color: estFondamentale ? "#e9a13b" : "var(--text-secondary)",
            }}>{nom}</span>
            <div style={{ display: "flex", flex: 1, gap: 2 }}>
              {row.map((actif, c) => (
                <button key={c} title={`${nom} · pas ${c + 1}`} style={cellule(actif, c % 4 === 0 && c > 0)}
                  onClick={(e) => { e.stopPropagation(); basculer(rangee, c); }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
