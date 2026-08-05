// ui/SaisieCouleurs.tsx — Sélecteur de palette de couleurs pour l'inspecteur.
// Stocke une liste de couleurs sous forme de chaîne hexadécimale séparée par
// des virgules, compatible avec les nœuds audio (color-looper, etc.).

import { useEffect, useState } from "react";

interface Props {
  valeur: string;
  onChange: (v: string) => void;
}

const SEPARATEURS = /[,;|]/;

function parseCouleursListe(v: string): string[] {
  return v.split(SEPARATEURS).map((c) => c.trim()).filter(Boolean);
}

function rgbToHex(v: string): string | null {
  const m = v.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 10));
  if ([r, g, b].some((x) => Number.isNaN(x) || x < 0 || x > 255)) return null;
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function couleurToHex(v: string): string {
  const t = v.trim().toLowerCase();
  if (t.startsWith("#")) {
    if (/^#[0-9a-f]{6}$/.test(t)) return t;
    if (/^#[0-9a-f]{3}$/.test(t)) {
      return "#" + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
    }
  }
  return rgbToHex(t) ?? "#888888";
}

function normaliser(valeur: string): string[] {
  return parseCouleursListe(valeur).map(couleurToHex);
}

export function SaisieCouleurs({ valeur, onChange }: Props) {
  const [texte, setTexte] = useState(valeur);

  // Synchronise le champ texte quand la valeur est modifiée de l'extérieur
  useEffect(() => {
    setTexte(valeur);
  }, [valeur]);

  const couleurs = normaliser(valeur);

  const mettreAJourTexte = (nouveauTexte: string) => {
    setTexte(nouveauTexte);
    onChange(nouveauTexte);
  };

  const mettreAJourCouleurs = (next: string[]) => {
    const liste = next.length > 0 ? next : ["#888888"];
    onChange(liste.join(","));
  };

  const modifierCouleur = (idx: number, hex: string) => {
    const next = [...couleurs];
    next[idx] = hex.toLowerCase();
    mettreAJourCouleurs(next);
  };

  const supprimer = (idx: number) => {
    const next = couleurs.filter((_, i) => i !== idx);
    mettreAJourCouleurs(next);
  };

  const ajouter = () => {
    mettreAJourCouleurs([...couleurs, "#888888"]);
  };

  return (
    <div className="saisie-couleurs">
      <input
        type="text"
        className="saisie-couleurs-texte"
        value={texte}
        onChange={(e) => mettreAJourTexte(e.target.value)}
        placeholder="#e63946,#2a9d8f,#e9c46a,#8e6fce"
        title="Liste de couleurs (hex ou rgb), séparées par des virgules"
      />
      <div className="saisie-couleurs-grille">
        {couleurs.map((c, i) => (
          <div key={i} className="saisie-couleur-puce">
            <input
              type="color"
              value={c}
              onChange={(e) => modifierCouleur(i, e.target.value)}
              className="saisie-couleur-input"
              title={c}
            />
            <button
              type="button"
              onClick={() => supprimer(i)}
              className="saisie-couleur-suppr"
              title="Supprimer cette couleur"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={ajouter}
          className="saisie-couleur-ajouter"
          title="Ajouter une couleur"
        >
          +
        </button>
      </div>
    </div>
  );
}
