// ui/CercleDessin.tsx — Le disque, ses pastilles et le polygone qu'elles inscrivent.
//
// POURQUOI CE FICHIER EXISTE. Deux composants montrent désormais un cercle et ne le tiennent pas du
// même endroit : l'un le déduit de ses propres réglages, l'autre le reçoit de son entrée. Le dessin,
// lui, est le même, et un dessin écrit deux fois ne reste pas d'accord. Ce qui change d'un cas à
// l'autre est ce qu'on lui DONNE : le nombre de places, celles qui sonnent, et le nom de chacune.
//
// LE POLYGONE N'EST PAS UN ORNEMENT. Son aire est une des mesures du rythme, maximale exactement
// quand les attaques se répartissent également ; ses cordes sont ce sur quoi la régularité se
// calcule. Tracer les cordes, c'est donc montrer la quantité, non l'illustrer.
//
// AUCUNE GÉOMÉTRIE ICI, AUCUNE COULEUR NON PLUS. La première vit dans `ui/cercle-disposition.ts`
// avec ses tests, les secondes dans `atelier.css`, qui lit les variables du thème.

import { useMemo, useState } from "react";

import { disposerCercle, nomsTiennent, placeSousLePoint, TAILLE_NOM } from "./cercle-disposition";

/** Le carré du document. Les coordonnées du calcul vont de moins un à un ; on les y ramène. */
export const C = 1000;
export const MARGE = 0.82;

export const versDocument = (v: number) => C / 2 + v * (C / 2) * MARGE;

export interface CercleDessinProps {
  /** Le nombre de places du tour. */
  positions: number;
  /** Les places qui sonnent, dans n'importe quel ordre. */
  sonnent: readonly number[];
  /**
   * Le nom de chaque place qui sonne, dans l'ordre croissant des places.
   *
   * Vide quand il n'y a rien à écrire, par exemple sur un cercle de percussion où un seul son vaut
   * pour tout le tour et où le nom serait le même partout.
   */
  noms?: readonly string[];
  /** Ce qu'un clic sur une place déclenche. Sans lui, le dessin se regarde et ne se touche pas. */
  surPlace?: (place: number) => void;
}

/**
 * Le cercle dessiné, et rien d'autre.
 *
 * LES NOMS PARAISSENT TOUS OU AUCUN, et la décision se prend sur le plus long d'entre eux. À
 * quarante-huit places un dièse déborde de sa pastille et touche sa voisine ; à moitié écrits,
 * l'œil prendrait les sommets sans nom pour des sommets d'une autre sorte. Voir `nomsTiennent`.
 */
export function CercleDessin({ positions, sonnent, noms = [], surPlace }: CercleDessinProps) {
  const [survol, setSurvol] = useState<number | null>(null);
  const places = useMemo(() => [...sonnent].sort((a, b) => a - b), [sonnent]);
  const disposition = useMemo(() => disposerCercle(positions, places), [positions, places]);
  const r = disposition.rayonPastille * (C / 2) * MARGE;

  const nomsVisibles = noms.length > 0 && nomsTiennent(r, Math.max(...noms.map((n) => n.length)));

  const surClic = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!surPlace) return;
    const boite = e.currentTarget.getBoundingClientRect();
    // Du pixel vers le cercle unité : c'est la seule conversion que la vue fait elle-même.
    const x = ((e.clientX - boite.left) / boite.width * C - C / 2) / ((C / 2) * MARGE);
    const y = ((e.clientY - boite.top) / boite.height * C - C / 2) / ((C / 2) * MARGE);
    const place = placeSousLePoint(x, y, positions);
    if (place !== null) surPlace(place);
  };

  return (
    <svg className="cercle-svg" viewBox={`0 0 ${C} ${C}`} onClick={surClic}>
      <circle className="cercle-piste" cx={C / 2} cy={C / 2} r={(C / 2) * MARGE} />

      {/* LE POLYGONE INSCRIT, tracé avant les pastilles pour passer dessous. Deux sommets ne font
          qu'une corde, et un seul ne fait rien : le tracé n'a de sens qu'à partir de deux. */}
      {disposition.polygone.length >= 2 && (
        <polygon className="cercle-polygone"
          points={disposition.polygone.map((p) => `${versDocument(p.x)},${versDocument(p.y)}`).join(" ")} />
      )}

      {disposition.pastilles.map((p) => {
        const rang = places.indexOf(p.place);
        // Le nom reste dans l'infobulle même quand il ne tient pas dans la pastille : on le lit
        // alors en survolant, plutôt que de devoir agrandir le nœud pour savoir ce qui sonne.
        const nom = rang >= 0 ? noms[rang] : undefined;
        return (
          <g key={p.place} onMouseEnter={() => setSurvol(p.place)} onMouseLeave={() => setSurvol(null)}>
            <circle
              className={`cercle-pastille${p.sonne ? " sonne" : ""}${survol === p.place ? " survolee" : ""}`}
              cx={versDocument(p.x)} cy={versDocument(p.y)} r={r} />
            {nom !== undefined && nomsVisibles && (
              <text className="cercle-nom" fontSize={TAILLE_NOM}
                x={versDocument(p.x)} y={versDocument(p.y)}
                textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                {nom}
              </text>
            )}
            <title>{nom !== undefined ? `${p.place} · ${nom}` : String(p.place)}</title>
          </g>
        );
      })}

      {/* La place zéro est en haut : un repère le dit, sans quoi un motif tourné serait illisible. */}
      <line className="cercle-repere" x1={C / 2} y1={C / 2 - (C / 2) * MARGE - r - 6}
        x2={C / 2} y2={C / 2 - (C / 2) * MARGE + r + 6} />
    </svg>
  );
}
