// audio/choral-candidats.ts — Les accords et les dispositions qu'une note du soprano peut recevoir.
//
// CE QUI EST DUR, ET CE QUI EST SOUPLE. Ce module ne propose que des colonnes qui tiennent déjà les
// règles d'une colonne seule : chaque voix dans la tessiture usuelle de Bach (`tessitures-satb.ts`),
// aucun croisement, soprano et alto, alto et ténor dans l'octave, ténor et basse dans la douzième,
// l'accord complet de sa fondamentale et de sa tierce, sa septième s'il en a une. Tout le reste se
// juge en énergie (`choral-energie.ts`), parce que tout le reste dépend de la colonne voisine.
//
// LES ACCORDS SONT CEUX DE LA TONALITÉ (`accordsDeLaTonalite`), triades et, selon « Septièmes », la
// seule dominante ou tous les degrés avec leur septième. QUAND AUCUN NE CONTIENT LA NOTE DU SOPRANO,
// ce qui arrive à toute note chromatique, viennent les replis, décision de Fabien du 2026-11-22 : les
// dominantes secondaires, V et V7 de chaque degré qui porte un accord parfait, puis les accords du mode
// parallèle. Une colonne n'est ainsi jamais vide, et l'énergie fait payer le repli.

import { accordsDeLaTonalite, type Mode } from "./choral-regles";
import { TESSITURES_SATB } from "./tessitures-satb";

export type Septiemes = "aucune" | "dominante" | "toutes";

const pc = (h: number) => ((Math.round(h) % 12) + 12) % 12;
const ROMAINS = ["I", "II", "III", "IV", "V", "VI", "VII"];

export interface AccordCandidat {
  /** Le degré dans la tonalité, de 0 à 6 ; celui de la cible pour une dominante secondaire. */
  degre: number;
  /** Le chiffre romain, en majuscules pour un accord majeur, en minuscules pour un mineur. */
  nom: string;
  racine: number;
  tierce: number;
  quinte: number;
  septieme: number | null;
  /** Un repli : dominante secondaire ou accord emprunté. */
  repli: boolean;
}

/** Soprano, alto, ténor, basse. */
export type Disposition = [number, number, number, number];

const qualite = (racine: number, tierce: number, quinte: number) => {
  const t = pc(tierce - racine);
  const q = pc(quinte - racine);
  return { majeur: t === 4, diminue: t === 3 && q === 6, augmente: t === 4 && q === 8 };
};

const nommer = (base: string, racine: number, tierce: number, quinte: number, septieme: number | null) => {
  const q = qualite(racine, tierce, quinte);
  const chiffre = q.majeur ? base : base.toLowerCase();
  return `${chiffre}${q.diminue ? "°" : q.augmente ? "+" : ""}${septieme !== null ? "7" : ""}`;
};

/** Les accords de la tonalité, et les replis seulement si aucun ne contient la note du soprano. */
export function accordsPossibles(soprano: number, tonique: number, mode: Mode, septiemes: Septiemes): AccordCandidat[] {
  const s = pc(soprano);
  const contient = (a: AccordCandidat) => [a.racine, a.tierce, a.quinte, a.septieme].includes(s);
  const diatoniques = accordsDeLaTonalite(tonique, mode).flatMap((a): AccordCandidat[] => {
    const triade = { degre: a.degre, nom: nommer(ROMAINS[a.degre], a.racine, a.tierce, a.quinte, null), racine: a.racine, tierce: a.tierce, quinte: a.quinte, septieme: null, repli: false };
    const avecSeptieme = septiemes === "toutes" || (septiemes === "dominante" && a.degre === 4);
    return avecSeptieme ? [triade, { ...triade, nom: nommer(ROMAINS[a.degre], a.racine, a.tierce, a.quinte, a.septieme), septieme: a.septieme }] : [triade];
  }).filter(contient);
  if (diatoniques.length > 0) return diatoniques;

  const replis: AccordCandidat[] = [];
  for (const cible of accordsDeLaTonalite(tonique, mode)) {
    if (cible.degre === 0 || qualite(cible.racine, cible.tierce, cible.quinte).diminue) continue;
    const r = pc(cible.racine + 7);
    const v = { degre: cible.degre, nom: `V/${nommer(ROMAINS[cible.degre], cible.racine, cible.tierce, cible.quinte, null)}`, racine: r, tierce: pc(r + 4), quinte: pc(r + 7), septieme: null, repli: true };
    replis.push(v, { ...v, nom: `${v.nom.replace("V/", "V7/")}`, septieme: pc(r + 10) });
  }
  for (const a of accordsDeLaTonalite(tonique, mode === "majeur" ? "mineur" : "majeur")) {
    replis.push({ degre: a.degre, nom: `${nommer(ROMAINS[a.degre], a.racine, a.tierce, a.quinte, null)} emprunté`, racine: a.racine, tierce: a.tierce, quinte: a.quinte, septieme: null, repli: true });
  }
  // SOUS « AUCUNE », LA SEPTIÈME D'UNE DOMINANTE SECONDAIRE NE SERT QUE SI RIEN D'AUTRE NE PORTE LA
  // NOTE : le si bémol en la mineur n'est dans aucune triade de repli, seulement dans V7/VI, et une
  // colonne n'est jamais vide.
  const possibles = replis.filter(contient);
  const sansSeptieme = possibles.filter((a) => a.septieme === null);
  return septiemes === "aucune" && sansSeptieme.length > 0 ? sansSeptieme : possibles;
}

/**
 * Les dispositions d'un accord sous une note de soprano, dans un ordre fixe : basse, ténor, alto
 * montants. `renversements` faux ne laisse que la fondamentale à la basse.
 */
export function dispositions(accord: AccordCandidat, soprano: number, renversements: boolean): Disposition[] {
  const notes = [accord.racine, accord.tierce, accord.quinte, ...(accord.septieme !== null ? [accord.septieme] : [])];
  const dans = (h: number) => notes.includes(pc(h));
  const plage = (v: number) => {
    const [bas, haut] = TESSITURES_SATB[v].usuelle;
    return Array.from({ length: haut - bas + 1 }, (_, k) => bas + k).filter(dans);
  };
  const [altos, tenors, basses] = [plage(1), plage(2), plage(3)];
  const sortie: Disposition[] = [];
  for (const b of basses) {
    if (!renversements && pc(b) !== accord.racine) continue;
    for (const t of tenors) {
      if (t < b || t - b > 19) continue;
      for (const a of altos) {
        if (a < t || a - t > 12 || a > soprano || soprano - a > 12) continue;
        const presentes = new Set([soprano, a, t, b].map(pc));
        if (!presentes.has(accord.racine) || !presentes.has(accord.tierce)) continue;
        if (accord.septieme !== null && !presentes.has(accord.septieme)) continue;
        sortie.push([soprano, a, t, b]);
      }
    }
  }
  return sortie;
}
