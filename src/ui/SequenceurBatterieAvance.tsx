// ui/SequenceurBatterieAvance.tsx — Grille cliquable du séquenceur de batterie avancé.
// L'état du motif est encodé dans une chaîne (paramètre « Motif ») : 8 lignes de
// pas séparées par « | », chaque pas est un chiffre 0 (off) à 9 (velocity max).
// La grille lit/écrit cette chaîne via onChange → le nœud la stocke en paramètre.
import type { CSSProperties, MouseEvent } from "react";
import { useI18n } from "../i18n";
import { decoderMotifVelocite, encoderMotifVelocite } from "../audio";

const PISTES = [
  { nom: "Kick", coul: "#e9a13b" },
  { nom: "Snare", coul: "#e76f51" },
  { nom: "Hat C", coul: "#2a9d8f" },
  { nom: "Hat O", coul: "#4cc9c0" },
  { nom: "Clap", coul: "#8e6fce" },
  { nom: "Crash", coul: "#f4a261" },
  { nom: "Tom L", coul: "#6a4c93" },
  { nom: "Tom H", coul: "#118ab2" },
];

export function SequenceurBatterieAvance({ motif, nbPas, onChange }: { motif: string; nbPas: number; onChange: (m: string) => void }) {
  const { t } = useI18n();
  const grille = decoderMotifVelocite(motif, PISTES.length, nbPas);

  const modifier = (r: number, c: number, decrement: boolean) => {
    const g = grille.map((row) => row.slice());
    g[r][c] = Math.max(0, Math.min(9, g[r][c] + (decrement ? -1 : 1)));
    onChange(encoderMotifVelocite(g));
  };

  const cell = (vel: number, coul: string, debutTemps: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 6,
    height: 18,
    cursor: "pointer",
    borderRadius: 2,
    background: vel > 0 ? coul : "rgba(255,255,255,0.06)",
    opacity: vel > 0 ? 0.35 + (vel / 9) * 0.65 : 1,
    boxShadow: vel > 0 ? `0 0 ${2 + vel * 0.5}px ${coul}` : "none",
    marginLeft: debutTemps ? 3 : 0,
    border: "none",
    padding: 0,
  });

  return (
    <div className="nodrag" style={{ padding: "4px 2px", display: "flex", flexDirection: "column", gap: 3 }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {PISTES.map((p, r) => (
        <div key={p.nom} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 46, fontSize: 10, color: p.coul, flexShrink: 0, fontWeight: 600 }}>{p.nom}</span>
          <div style={{ display: "flex", flex: 1, gap: 1 }}>
            {grille[r].map((vel, c) => (
              <button
                key={c}
                title={`${t("seq.pas")} ${c + 1}${vel > 0 ? ` — velocity ${vel}` : ""}`}
                style={cell(vel, p.coul, c % 4 === 0 && c > 0)}
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  modifier(r, c, e.shiftKey);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
