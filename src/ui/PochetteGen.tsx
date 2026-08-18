// ui/PochetteGen.tsx — Aperçu du Générateur de pochette (SVG).
// Le rendu procédural est identique à celui du plugin (sortie image chaînable).
// Hors-ligne, instantané, sans GPU.

import { useMemo, useState, useEffect } from "react";
import { genererPochetteSVG } from "../plugins/pochette";

interface Props {
  prompt: string;
  titre: string;
  artiste: string;
  style: string;
  palette: string;
  complexite: number;
  bordure: string;
  typographie: string;
  largeur: number;
  hauteur: number;
  graine: number;
}

export function PochetteGen({
  prompt, titre, artiste, style, palette, complexite, bordure, typographie,
  largeur, hauteur, graine,
}: Props) {
  const [tentative, setTentative] = useState(0);
  const svg = useMemo(() => {
    void tentative; // permet de forcer le recalcul si besoin
    return genererPochetteSVG({
      prompt, titre, artiste, style, palette,
      complexite, bordure, typographie,
      largeur, hauteur, graine,
    });
  }, [tentative, prompt, titre, artiste, style, palette, complexite, bordure, typographie, largeur, hauteur, graine]);

  // Création ET révocation dans le MÊME effect (pas un useMemo séparé) : sous
  // StrictMode, React double-invoque les effects en dev (setup → cleanup →
  // setup). Avec une URL mémoïsée à part, la 1ʳᵉ révocation cassait l'unique
  // URL partagée par les deux passes — l'image restait éternellement cassée
  // (naturalWidth=0). Ici chaque passe crée SA PROPRE URL, donc la révocation
  // de la 1ʳᵉ n'affecte jamais celle affichée après la 2ᵉ passe.
  const [url, setUrl] = useState("");
  useEffect(() => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => { URL.revokeObjectURL(objUrl); };
  }, [svg]);

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: 4 }}>
      {/* L'URL d'objet n'existe qu'après le premier effect. Tant qu'elle manque,
          on ne rend PAS ces éléments plutôt que de leur passer une chaîne vide :
          `src=""` et `href=""` sont résolus par le navigateur en l'URL de la
          page elle-même, ce qui déclenche un rechargement complet et inutile du
          document (React l'avertit d'ailleurs en console). Le conteneur, lui,
          reste en place pour que le cadre du nœud ne sursaute pas. */}
      <div style={{ width: "100%", maxWidth: 260, margin: "0 auto", borderRadius: 4, overflow: "hidden", background: "#111" }}>
        {url && <img src={url} alt="Pochette" style={{ width: "100%", height: "auto", display: "block" }} />}
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
        {url && (
          <a href={url} download="pochette.svg"
            style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
            ⬇ SVG
          </a>
        )}
        <button
          onClick={() => setTentative((v) => v + 1)}
          title="Regénérer"
          style={{ fontSize: 11, color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}>
          ↻
        </button>
      </div>
    </div>
  );
}
