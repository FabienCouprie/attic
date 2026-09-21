// audio/courbe-trace.ts — Regarder une courbe, puisque rien ne le permettait.
//
// CE QUI MANQUAIT, ET IL A FALLU UNE QUESTION POUR S'EN APERCEVOIR : « avec quel nœud lit-on les
// sorties courbes ? » Aucun. Le type `courbe` comptait huit sorties et huit entrées, et les huit
// consommateurs étaient des EFFETS : filtre, trémolo, spatialisation, amplificateur, retard
// spectral, partitions Csound, rotation ambisonique. On pouvait donc piloter un effet par une
// courbe sans jamais voir la courbe — et l'ajuster à l'aveugle, en écoutant le résultat et en
// devinant ce qui, du pilote ou de l'effet, n'allait pas.
//
// C'est d'autant plus gênant que l'intérêt du dispositif, d'après Verfaille, Zölzer et Arfib
// (« Adaptive Digital Audio Effects », IEEE TASLP 14(5), 2006), est qu'une courbe peut venir DU SON
// LUI-MÊME — la brillance qui ouvre son propre filtre, l'énergie qui allonge son propre délai.
// Une courbe fabriquée se devine ; une courbe extraite d'un son ne se devine pas.
//
// DEUX DÉCISIONS DE TRACÉ, ET AUCUNE N'EST COSMÉTIQUE.
//
//  1. L'ÉCHELLE VERTICALE EST FIXÉE À 0–1, JAMAIS AJUSTÉE AU CONTENU. C'est la convention du type
//     (cf. `courbe.ts`) : le producteur rend des valeurs entre zéro et un, le consommateur décide
//     de ce que zéro et un veulent dire chez lui. Une courbe qui ne va que de 0,48 à 0,52 DOIT
//     donc paraître plate, parce que c'est exactement ce que l'effet en fera — un tracé
//     auto-ajusté la montrerait ample et mentirait sur l'effet qu'elle produira. Et deux courbes
//     dessinées à la même échelle se comparent.
//  2. LA RÉDUCTION GARDE LE MINIMUM ET LE MAXIMUM DE CHAQUE COLONNE, et non une valeur sur n. Une
//     courbe porte deux cents valeurs par seconde : une minute en fait douze mille, pour six cents
//     colonnes de dessin. Prendre une valeur sur vingt ferait disparaître une pointe brève — celle
//     d'un transitoire suivi par un suiveur de caractéristique, précisément ce qu'on vient
//     regarder. Une bande entre les deux extrêmes ne perd rien.

import { estCourbe, type Courbe } from "./courbe";

export interface MesureCourbe {
  /** Nombre de valeurs. */
  nombre: number;
  /** Valeurs par seconde. */
  cadence: number;
  dureeSec: number;
  min: number;
  max: number;
  moyenne: number;
  /**
   * De combien la courbe bouge, en unités par seconde.
   *
   * C'est le chiffre qui distingue une courbe qui dort d'une courbe qui s'agite sans aller
   * nulle part : une rampe de zéro à un sur dix secondes vaut 0,10 ; un bruit qui parcourt toute
   * l'étendue dix fois par seconde vaut des dizaines, pour un minimum et un maximum identiques.
   */
  agitation: number;
}

/** Une colonne du tracé : ce que la courbe a fait de plus bas et de plus haut pendant ce temps-là. */
export interface Colonne {
  min: number;
  max: number;
}

const MESURE_VIDE: MesureCourbe = {
  nombre: 0, cadence: 0, dureeSec: 0, min: 0, max: 0, moyenne: 0, agitation: 0,
};

export function mesurerCourbe(courbe: unknown): MesureCourbe {
  if (!estCourbe(courbe)) return MESURE_VIDE;
  const v = courbe.valeurs;
  const n = v.length;
  if (n === 0) return { ...MESURE_VIDE, cadence: courbe.cadence };
  let min = v[0], max = v[0], somme = 0, pas = 0;
  for (let i = 0; i < n; i++) {
    if (v[i] < min) min = v[i];
    if (v[i] > max) max = v[i];
    somme += v[i];
    if (i > 0) pas += Math.abs(v[i] - v[i - 1]);
  }
  const cadence = courbe.cadence > 0 ? courbe.cadence : 1;
  return {
    nombre: n, cadence: courbe.cadence, dureeSec: n / cadence,
    min, max, moyenne: somme / n,
    agitation: n > 1 ? (pas / (n - 1)) * cadence : 0,
  };
}

/**
 * La courbe réduite à `colonnes` couples (min, max).
 *
 * Moins de valeurs que de colonnes : chaque valeur a la sienne, et le tracé reste juste — il est
 * seulement moins dense que la place disponible.
 */
export function enveloppe(courbe: unknown, colonnes: number): Colonne[] {
  if (!estCourbe(courbe) || courbe.valeurs.length === 0 || colonnes < 1) return [];
  const v = courbe.valeurs;
  const k = Math.min(Math.floor(colonnes), v.length);
  const out: Colonne[] = [];
  for (let c = 0; c < k; c++) {
    const debut = Math.floor((c * v.length) / k);
    const fin = Math.max(debut + 1, Math.floor(((c + 1) * v.length) / k));
    let min = v[debut], max = v[debut];
    for (let i = debut; i < fin; i++) {
      if (v[i] < min) min = v[i];
      if (v[i] > max) max = v[i];
    }
    out.push({ min, max });
  }
  return out;
}

export interface OptionsTrace {
  largeur?: number;
  hauteur?: number;
}

const arrondi = (x: number) => (Math.round(x * 10) / 10).toString();

/**
 * Le tracé, en SVG autonome — ni police extérieure, ni script, ni ressource à charger.
 *
 * Même palette que le goniomètre, parce que les deux nœuds font le même métier : montrer une
 * mesure plutôt que la raconter.
 */
export function genererSvgCourbe(
  mesure: MesureCourbe, colonnes: readonly Colonne[], o: OptionsTrace = {},
): string {
  const largeur = Math.max(120, Math.round(o.largeur ?? 640));
  const hauteur = Math.max(80, Math.round(o.hauteur ?? 200));
  const marge = { g: 34, d: 10, h: 12, b: 26 };
  const aireL = largeur - marge.g - marge.d;
  const aireH = hauteur - marge.h - marge.b;
  const y = (valeur: number) => marge.h + (1 - Math.min(1, Math.max(0, valeur))) * aireH;
  const x = (i: number) => marge.g + (colonnes.length > 1 ? (i / (colonnes.length - 1)) * aireL : aireL / 2);

  // La bande va du maximum de chaque colonne à son minimum, aller puis retour : un seul polygone.
  const haut = colonnes.map((c, i) => `${arrondi(x(i))},${arrondi(y(c.max))}`);
  const bas = colonnes.map((c, i) => `${arrondi(x(i))},${arrondi(y(c.min))}`).reverse();
  const bande = [...haut, ...bas].join(" ");
  const grilles = [0, 0.25, 0.5, 0.75, 1]
    .map((g) => `<line x1="${marge.g}" y1="${arrondi(y(g))}" x2="${largeur - marge.d}" y2="${arrondi(y(g))}" stroke="#2e2e3a" stroke-width="1"/>`)
    .join("\n  ");
  const vide = colonnes.length === 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">
  <rect width="${largeur}" height="${hauteur}" fill="#12121a"/>
  ${grilles}
  <text x="${marge.g - 6}" y="${arrondi(y(1) + 4)}" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="end">1</text>
  <text x="${marge.g - 6}" y="${arrondi(y(0.5) + 4)}" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="end">0.5</text>
  <text x="${marge.g - 6}" y="${arrondi(y(0) + 4)}" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="end">0</text>
${vide ? "" : `  <polygon points="${bande}" fill="#2a9d8f" fill-opacity="0.55" stroke="#2a9d8f" stroke-width="1"/>
  <line x1="${marge.g}" y1="${arrondi(y(mesure.moyenne))}" x2="${largeur - marge.d}" y2="${arrondi(y(mesure.moyenne))}" stroke="#e9c46a" stroke-width="1" stroke-dasharray="4 3"/>`}
  <text x="${marge.g}" y="${hauteur - 8}" fill="#6b6b7b" font-family="system-ui" font-size="10">0 s</text>
  <text x="${largeur - marge.d}" y="${hauteur - 8}" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="end">${mesure.dureeSec.toFixed(1)} s</text>
  <text x="${marge.g + aireL / 2}" y="${hauteur - 8}" fill="#9a9aae" font-family="system-ui" font-size="10" text-anchor="middle">min ${mesure.min.toFixed(2)} · max ${mesure.max.toFixed(2)} · moy ${mesure.moyenne.toFixed(2)}</text>
</svg>`;
}
