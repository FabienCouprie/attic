// audio/arbre-disposition.ts — Où se pose chaque branche d'un arbre rythmique, et comment on le retouche.
//
// POURQUOI CECI N'EST PAS DANS LE COMPOSANT. La géométrie décide de ce qu'on clique, et les
// retouches décident de ce qu'on obtient : ce sont des calculs, et ils se vérifient. Les laisser
// dans une vue les rendrait invérifiables autrement qu'à l'œil, et c'est ainsi qu'un clavier a
// longtemps joué la touche blanche quand on visait le dièse.
//
// LES COORDONNÉES VONT DE ZÉRO À UN. La vue les multiplie par la largeur dont elle dispose ; le
// calcul, lui, ne sait rien des pixels et ne changera pas si le nœud est redimensionné.
//
// LA LARGEUR EST PROPORTIONNELLE À LA DURÉE, à tous les étages. C'est ce qui rend l'arbre lisible :
// un triolet occupe la largeur du temps qu'il divise, et ses trois parts en font chacune le tiers.
// Un dessin à parts égales mentirait sur ce qu'on entend.

import type { Mesure, NoeudRythme } from "./arbre-rythmique";

/**
 * L'adresse d'un nœud dans l'arbre : le rang de sa mesure, puis les rangs à chaque étage.
 *
 * Un chemin vide désigne la racine, qui n'est pas un nœud : elle n'est jamais rendue par la
 * disposition, et les retouches la refusent.
 */
export type Chemin = number[];

export interface Case {
  chemin: Chemin;
  /** Bord gauche, de zéro à un, sur l'étendue de tout l'arbre. */
  x: number;
  largeur: number;
  /** Étage, en commençant à zéro pour le contenu de la mesure. */
  profondeur: number;
  noeud: NoeudRythme;
  /** Vrai quand ce nœud ne se divise pas : c'est lui qui porte une note ou un silence. */
  feuille: boolean;
}

export interface Disposition {
  cases: Case[];
  /** Les mesures elles-mêmes, pour dessiner leurs bornes et leur métrique. */
  mesures: { rang: number; x: number; largeur: number; metrique: [number, number] }[];
  /** Le nombre d'étages occupés, au moins un. */
  etages: number;
}

/** Les noires que dure une mesure : c'est ce qui décide de sa largeur relative. */
const noiresDe = (m: Mesure) => (m.metrique[0] * 4) / Math.max(1, m.metrique[1]);

/** Place toutes les branches d'un arbre entre zéro et un. */
export function disposerArbre(mesures: readonly Mesure[]): Disposition {
  const cases: Case[] = [];
  const barres: Disposition["mesures"] = [];
  const total = mesures.reduce((s, m) => s + noiresDe(m), 0);
  if (total <= 0) return { cases, mesures: barres, etages: 1 };

  let x = 0;
  mesures.forEach((m, rang) => {
    const largeur = noiresDe(m) / total;
    barres.push({ rang, x, largeur, metrique: m.metrique });
    poser(m.contenu, [rang], x, largeur, 0, cases);
    x += largeur;
  });
  const etages = cases.reduce((e, c) => Math.max(e, c.profondeur + 1), 1);
  return { cases, mesures: barres, etages };
}

function poser(
  noeuds: readonly NoeudRythme[], prefixe: Chemin, x: number, largeur: number,
  profondeur: number, out: Case[],
): void {
  const somme = noeuds.reduce((s, n) => s + Math.max(0, n.valeur), 0);
  if (somme <= 0) return;
  let curseur = x;
  noeuds.forEach((n, i) => {
    const part = (largeur * Math.max(0, n.valeur)) / somme;
    const chemin = [...prefixe, i];
    const feuille = !n.enfants || n.enfants.length === 0;
    out.push({ chemin, x: curseur, largeur: part, profondeur, noeud: n, feuille });
    if (!feuille) poser(n.enfants!, chemin, curseur, part, profondeur + 1, out);
    curseur += part;
  });
}

/** La case sous un point, la plus profonde d'abord : c'est la plus précise. */
export function caseALaPosition(d: Disposition, x: number, etage: number): Case | null {
  const candidates = d.cases.filter((c) => c.profondeur === etage && x >= c.x && x < c.x + c.largeur);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

// ── Retouches ──────────────────────────────────────────────────────────

/**
 * Applique une retouche et rend un arbre NEUF, sans toucher à l'ancien.
 *
 * RIEN N'EST MODIFIÉ SUR PLACE, et ce n'est pas une préférence de style. L'arbre affiché vient d'un
 * état de composant ; le muter ferait que React ne verrait aucun changement et que le dessin
 * resterait figé sur une retouche pourtant faite.
 */
function retoucher(
  mesures: readonly Mesure[], chemin: Chemin, action: (n: NoeudRythme) => NoeudRythme | null,
): Mesure[] {
  if (chemin.length < 2) return [...mesures];
  const [rangMesure, ...reste] = chemin;
  return mesures.map((m, i) => {
    if (i !== rangMesure) return m;
    const contenu = descendre(m.contenu, reste, action);
    return { ...m, contenu };
  });
}

function descendre(
  noeuds: readonly NoeudRythme[], chemin: Chemin, action: (n: NoeudRythme) => NoeudRythme | null,
): NoeudRythme[] {
  const [i, ...reste] = chemin;
  const out: NoeudRythme[] = [];
  noeuds.forEach((n, k) => {
    if (k !== i) { out.push(n); return; }
    if (reste.length === 0) {
      const remplacant = action(n);
      if (remplacant !== null) out.push(remplacant);
      return;
    }
    out.push({ ...n, enfants: descendre(n.enfants ?? [], reste, action) });
  });
  return out;
}

/**
 * Divise une branche en parts égales.
 *
 * LES PARTS VALENT UN CHACUNE, ET LE PARENT GARDE SON POIDS. C'est la règle du procédé, et
 * l'intuition contraire — que les enfants doivent totaliser le nombre du parent — interdirait le
 * triolet : un temps vaut un, et trois parts font trois. Le poids du parent dit le temps occupé,
 * les poids des enfants disent comment il se partage.
 */
export function diviser(mesures: readonly Mesure[], chemin: Chemin, parts: number): Mesure[] {
  const n = Math.max(2, Math.min(16, Math.round(parts)));
  // UNE DIVISION NE SONNE PAS : ni silence, ni liaison. Les deux drapeaux tombent, sans quoi une
  // branche liée que l'on divise porterait une liaison que le déroulement ignore, et le dessin
  // annoncerait ce que l'oreille ne confirmerait pas.
  return retoucher(mesures, chemin, (noeud) => ({
    valeur: noeud.valeur,
    enfants: Array.from({ length: n }, () => ({ valeur: 1 })),
  }));
}

/** Supprime la division d'une branche : elle redevient une note simple. */
export function fusionner(mesures: readonly Mesure[], chemin: Chemin): Mesure[] {
  return retoucher(mesures, chemin, (noeud) => ({ valeur: noeud.valeur }));
}

/** Change le poids d'une branche, sans descendre sous un. */
export function changerPoids(mesures: readonly Mesure[], chemin: Chemin, delta: number): Mesure[] {
  return retoucher(mesures, chemin, (noeud) => ({
    ...noeud, valeur: Math.max(1, Math.min(32, noeud.valeur + Math.round(delta))),
  }));
}

/** Note, silence ou note liée : les trois états d'une feuille, l'un après l'autre. */
export type Etat = "note" | "silence" | "liee";

export function etatDe(n: NoeudRythme): Etat {
  return n.silence ? "silence" : n.liee ? "liee" : "note";
}

export function mettreEtat(mesures: readonly Mesure[], chemin: Chemin, etat: Etat): Mesure[] {
  return retoucher(mesures, chemin, (noeud) => ({
    ...noeud,
    silence: etat === "silence" ? true : undefined,
    liee: etat === "liee" ? true : undefined,
    // UNE DIVISION N'EST NI UN SILENCE NI UNE LIAISON : ces états appartiennent à ce qui sonne. La
    // division est donc défaite, sans quoi l'arbre porterait un silence qui contient des notes.
    enfants: etat === "note" ? noeud.enfants : undefined,
  }));
}

/** Ajoute une branche après celle que le chemin désigne. */
export function ajouterApres(mesures: readonly Mesure[], chemin: Chemin): Mesure[] {
  if (chemin.length < 2) return [...mesures];
  const [rangMesure, ...reste] = chemin;
  return mesures.map((m, i) => {
    if (i !== rangMesure) return m;
    return { ...m, contenu: inserer(m.contenu, reste) };
  });
}

function inserer(noeuds: readonly NoeudRythme[], chemin: Chemin): NoeudRythme[] {
  const [i, ...reste] = chemin;
  if (reste.length === 0) {
    const out = [...noeuds];
    out.splice(i + 1, 0, { valeur: 1 });
    return out;
  }
  return noeuds.map((n, k) => (k === i ? { ...n, enfants: inserer(n.enfants ?? [], reste) } : n));
}

/**
 * Retire une branche.
 *
 * LA DERNIÈRE NE SE RETIRE PAS. Une liste vide n'a pas de durée à répartir, et la mesure
 * disparaîtrait du dessin sans qu'on puisse la reprendre.
 */
export function retirer(mesures: readonly Mesure[], chemin: Chemin): Mesure[] {
  if (chemin.length < 2) return [...mesures];
  const parent = parentDe(mesures, chemin);
  if (parent.length <= 1) return [...mesures];
  return retoucher(mesures, chemin, () => null);
}

/** Combien de branches partagent le même parent que le chemin donné. */
function parentDe(mesures: readonly Mesure[], chemin: Chemin): readonly NoeudRythme[] {
  const [rangMesure, ...reste] = chemin;
  let liste: readonly NoeudRythme[] = mesures[rangMesure]?.contenu ?? [];
  for (let k = 0; k < reste.length - 1; k++) liste = liste[reste[k]]?.enfants ?? [];
  return liste;
}
