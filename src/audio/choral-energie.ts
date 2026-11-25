// audio/choral-energie.ts — Ce que coûte une colonne, et ce que coûte le passage de l'une à la suivante.
//
// LES RÈGLES SONT CELLES DU VÉRIFICATEUR, par les mêmes prédicats (`audio/choral-regles.ts`) : ce que
// le juge appelle erreur coûte cher, ce qu'il appelle avis coûte peu, et la conduite des voix, à
// défaut de règle, coûte à proportion du chemin parcouru.
//
// LES POIDS SONT DES CONSTANTES, ET NON DES RÉGLAGES. Ils hiérarchisent : une faute du juge vaut plus
// qu'aucune somme de mouvements qu'on ferait pour l'éviter. Une quinte parallèle coûte 12 ; éviter
// une quinte demande rarement plus de quelques demi-tons de mouvement, à 0,15 le demi-ton. Les rendre
// réglables ferait de chacun un réglage qu'aucune entrée d'essai ne ferait tous agir.

import { avantDernierePermise, consecutive, directe, sautFautif, sensibleDe, type ModeChoral } from "./choral-regles";
import type { AccordCandidat, Disposition } from "./choral-candidats";

export const POIDS = {
  /** Deux voix en quintes ou en octaves parallèles. */
  paralleles: 12,
  /** Les mêmes par mouvement contraire. */
  consecutivesContraires: 2,
  /** Quinte ou octave directe aux voix extrêmes, le soprano sautant. */
  directes: 1.5,
  /** Une voix qui dépasse la note que sa voisine tenait. */
  depassement: 1,
  /** Chaque demi-ton parcouru par l'alto, le ténor et la basse. */
  mouvement: 0.15,
  /** Un saut de plus d'une quarte dans une voix intérieure. */
  sautInterieur: 0.8,
  /** Saut de plus d'une octave, ou seconde augmentée. */
  sautInterdit: 10,
  /** Saut de triton ou de septième. */
  sautDifficile: 2,
  /** La sensible doublée dans la dominante. */
  sensibleDoublee: 8,
  /** La sensible de la basse qui ne monte pas à la tonique. */
  sensibleExterieure: 5,
  /** Une sensible intérieure ni résolue ni descendue à la quinte. */
  sensibleInterieure: 1.5,
  /** Une septième que la voix ne résout pas en descendant. */
  septieme: 6,
  /** Un accord sans sa quinte, et un accord majeur à la tierce doublée. */
  quinteOmise: 0.5,
  tierceDoublee: 0.5,
  /** La tierce, la quinte ou la septième à la basse. */
  premierRenversement: 0.4,
  quarteEtSixte: 2.5,
  septiemeALaBasse: 1.5,
  /** Une dominante secondaire ou un accord emprunté. */
  repli: 3,
  /** Le coût d'un degré, multiplié par l'opposé du logarithme de sa fréquence chez Bach. */
  degre: 1,
  /** Le même degré deux fois de suite. */
  repetition: 0.3,
  /** La dominante à sensible suivie de la sous-dominante. */
  retrogradation: 2,
  /** Une fin qui n'est pas la tonique à l'état fondamental, une avant-dernière que le mode ne permet pas. */
  cadence: 20,
  avantDerniere: 2,
} as const;

/**
 * LA FRÉQUENCE DE CHAQUE DEGRÉ CHEZ BACH, en pour cent des temps reconnus, relevée le 2026-11-22 sur
 * les 370 chorals de Sapp chacun dans sa tonalité (`audio/corpus-chorals-releve.test.ts`) : 7 136
 * temps en majeur, 5 786 en mineur. Sans elle, l'harmoniseur ne préférait aucun degré, et le soprano
 * du choral 175 recevait iii et vii° plus souvent que IV. Le III du mineur est fréquent parce que
 * Bach y module au relatif majeur.
 *
 * LES TROIS MODES DE CHORALS, relevés le 2026-11-24 par le même relevé, décision de Fabien du même
 * jour : chaque choral modal dans son mode, le v et le V d'un même degré comptés ensemble ; 1 233 temps
 * sur les 37 chorals que Sapp écrit dorien, 1 100 sur 24 phrygiens, les deux qu'il écrit et 22 lus par
 * l'armure et la finale, et 298 seulement sur les 9 qu'il écrit mixolydiens. Le phrygien de Bach est
 * fait de la mineur vu de mi : iv avant i.
 */
const FREQUENCES_BACH: Record<ModeChoral, readonly number[]> = {
  majeur: [34.2, 10.1, 3.9, 11.2, 25.7, 12.4, 2.5],
  mineur: [29.9, 6.7, 23.1, 11.9, 17.4, 8.5, 2.5],
  dorien: [31.1, 2.2, 17.1, 5.9, 28.2, 3.1, 12.4],
  phrygien: [20.6, 10.5, 13.4, 22.1, 4.2, 16.8, 12.5],
  mixolydien: [28.9, 9.1, 3.0, 20.8, 20.1, 8.7, 9.4],
};

/** Ce que coûte un degré : l'opposé du logarithme de sa fréquence chez Bach, rapportée à la plus haute. */
export const coutDuDegre = (mode: ModeChoral, degre: number): number =>
  -Math.log(FREQUENCES_BACH[mode][degre] / Math.max(...FREQUENCES_BACH[mode]));

const pc = (h: number) => ((Math.round(h) % 12) + 12) % 12;

export interface ColonneChoisie { accord: AccordCandidat; voix: Disposition }

export interface Contexte { tonique: number; mode: ModeChoral }

/**
 * La dominante ou le vii° qui portent la sensible, là où elle se juge : en majeur et en mineur, ces
 * deux degrés la portent toujours ; en dorien et en mixolydien, seulement quand elle est ajoutée ; en
 * phrygien, jamais.
 */
const portantLaSensible = (a: AccordCandidat) => !a.repli && (a.degre === 4 || a.degre === 6) && a.sensible;

/** Ce que coûte une colonne seule ; `rang` dit si elle est la dernière ou l'avant-dernière. */
export function energieColonne(c: ColonneChoisie, ctx: Contexte, rang: "derniere" | "avant-derniere" | "autre"): number {
  const { accord, voix } = c;
  const pcs = voix.map(pc);
  let e = accord.repli ? POIDS.repli : POIDS.degre * coutDuDegre(ctx.mode, accord.degre);
  if (portantLaSensible(accord) && pcs.filter((p) => p === sensibleDe(ctx.tonique)).length >= 2) e += POIDS.sensibleDoublee;
  if (!pcs.includes(accord.quinte)) e += POIDS.quinteOmise;
  if (pc(accord.tierce - accord.racine) === 4 && pcs.filter((p) => p === accord.tierce).length >= 2) e += POIDS.tierceDoublee;
  const basse = pcs[3];
  if (basse === accord.tierce) e += POIDS.premierRenversement;
  else if (basse === accord.quinte) e += POIDS.quarteEtSixte;
  else if (basse === accord.septieme) e += POIDS.septiemeALaBasse;
  if (rang === "derniere" && (accord.repli || accord.degre !== 0 || basse !== accord.racine)) e += POIDS.cadence;
  if (rang === "avant-derniere" && (accord.repli || !avantDernierePermise(accord, ctx.mode))) e += POIDS.avantDerniere;
  return e;
}

/** Ce que coûte le passage d'une colonne à la suivante. */
export function energiePassage(c1: ColonneChoisie, c2: ColonneChoisie, ctx: Contexte): number {
  const [p, q] = [c1.voix, c2.voix];
  let e = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const c = consecutive(p[i], q[i], p[j], q[j]);
      if (c === "quintes" || c === "octaves") e += POIDS.paralleles;
      else if (c) e += POIDS.consecutivesContraires;
    }
  }
  if (directe(p[0], q[0], p[3], q[3])) e += POIDS.directes;
  for (let v = 1; v < 4; v++) {
    if (q[v] > p[v - 1] || (v < 3 && q[v] < p[v + 1])) e += POIDS.depassement;
    const d = Math.abs(q[v] - p[v]);
    e += POIDS.mouvement * d;
    if (v < 3 && d > 5) e += POIDS.sautInterieur;
    const s = sautFautif(p[v], q[v], ctx.tonique, ctx.mode);
    if (s === "plus-d-une-octave" || s === "seconde-augmentee") e += POIDS.sautInterdit;
    else if (s) e += POIDS.sautDifficile;
  }
  const [a1, a2] = [c1.accord, c2.accord];
  const sensible = sensibleDe(ctx.tonique);
  if (portantLaSensible(a1) && !a2.repli && a2.degre === 0) {
    for (let v = 1; v < 4; v++) {
      if (pc(p[v]) !== sensible || q[v] - p[v] === 1) continue;
      const versLaQuinte = pc(q[v]) === pc(ctx.tonique + 7) && p[v] - q[v] >= 3 && p[v] - q[v] <= 4;
      e += v === 3 ? POIDS.sensibleExterieure : versLaQuinte ? 0 : POIDS.sensibleInterieure;
    }
  }
  const changement = a1.degre !== a2.degre || a1.repli !== a2.repli || a1.racine !== a2.racine;
  // UNE SEPTIÈME TENUE QUAND L'ACCORD CHANGE N'EST PAS RÉSOLUE (décision D15 du 2026-11-25). La note
  // répétée est tenue à l'écriture, et le juge lit la septième sur la note qui suit la tenue, que cette
  // chaîne d'une colonne à la suivante ne voit pas. Comptée résolue, elle laissait 839 septièmes non
  // résolues au juge sur les 360 sopranos du corpus livré sous « Toutes », 23 sous « Dominante » ; elle
  // en laisse 28 et 10 depuis qu'elle coûte.
  if (a1.septieme !== null && changement) {
    for (let v = 0; v < 4; v++) {
      if (pc(p[v]) !== a1.septieme) continue;
      const d = q[v] - p[v];
      if (d !== -1 && d !== -2) e += POIDS.septieme;
    }
  }
  if (!changement) e += POIDS.repetition;
  // LA RÉTROGRADATION EST CELLE DE LA DOMINANTE À SENSIBLE : le v sans sensible suivi de IV est un
  // enchaînement du mode, en dorien et en mixolydien, comme le v° suivi de iv en phrygien.
  if (portantLaSensible(a1) && a1.degre === 4 && !a2.repli && a2.degre === 3) e += POIDS.retrogradation;
  return e;
}
