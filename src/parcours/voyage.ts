// parcours/voyage.ts — L'ordre du voyage, et la mémoire de ce qui est accompli.
//
// CE QUI EST ACCOMPLI VIT DANS UN PARAMÈTRE DU NŒUD, et c'est la même décision que pour le quiz,
// pour la même raison : un paramètre se sauvegarde avec le projet. On ferme l'application au
// milieu du troisième chapitre et on la rouvre là où on l'avait laissée. Un état de vue se serait
// évaporé au premier rechargement, et un parcours qu'il faut recommencer n'est pas un parcours.
//
// LE VOYAGE N'EST PAS VERROUILLÉ. La tentation était de n'ouvrir un chapitre qu'une fois le
// précédent fini — c'est l'usage, et c'est une erreur ici : quelqu'un qui vient pour la
// spatialisation n'a pas à refaire douze exercices de branchement pour y accéder, et il partira
// plutôt que de les faire. L'ordre est donc une PROPOSITION, tenue par le réglage « Au fil du
// parcours » qui mène toujours au premier exercice non accompli ; choisir un chapitre y va
// directement. La progression, elle, reste comptée sur tout.
//
// LES TITRES SE GAGNENT AUX ÉPREUVES, PAS AUX EXERCICES. Un exercice se réussit en posant les bons
// nœuds ; une épreuve exige un son qui tienne une mesure, et c'est la seule chose qui prouve qu'on
// a compris ce que le chapitre enseignait. Dix titres pour dix épreuves, d'« Oreille neuve » à
// « Compagnon du son » : ils ne servent à rien, et c'est précisément ce qui les rend agréables à
// obtenir.

import type { Chapitre, Exercice } from "./types";

/** Les identifiants accomplis, lus d'un champ de texte. Tout ce qui n'est pas un id est ignoré. */
export function lireProgres(texte: string | undefined | null): string[] {
  return String(texte ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Les identifiants accomplis, écrits dans le champ — sans doublon, dans l'ordre d'arrivée. */
export const ecrireProgres = (ids: readonly string[]): string => [...new Set(ids)].join(",");

/** Le champ augmenté d'un accomplissement, sans doublon. */
export const noter = (texte: string | undefined | null, id: string): string =>
  ecrireProgres([...lireProgres(texte), id]);

/** Le champ privé d'un accomplissement — on peut toujours refaire un exercice. */
export const oublier = (texte: string | undefined | null, id: string): string =>
  ecrireProgres(lireProgres(texte).filter((x) => x !== id));

/** Les chapitres effectivement représentés, dans l'ordre où les exercices les rencontrent. */
export function chapitresDu(exercices: readonly Exercice[], chapitres: readonly Chapitre[]): Chapitre[] {
  const vus: Chapitre[] = [];
  for (const x of exercices) {
    if (vus.some((c) => c.id === x.chapitre)) continue;
    const c = chapitres.find((k) => k.id === x.chapitre);
    if (c) vus.push(c);
  }
  return vus;
}

/** Les exercices d'un chapitre, ou tous si aucun n'est demandé. */
export const exercicesDu = (exercices: readonly Exercice[], chapitre?: string): Exercice[] =>
  chapitre ? exercices.filter((x) => x.chapitre === chapitre) : [...exercices];

/**
 * Où l'on en est : le rang du premier exercice non accompli.
 *
 * Quand tout est accompli, on rend le dernier plutôt que rien : le voyage terminé montre alors sa
 * dernière épreuve, et non un écran vide qui aurait l'air d'une panne.
 */
export function rangCourant(liste: readonly Exercice[], accomplis: readonly string[]): number {
  if (liste.length === 0) return 0;
  const faits = new Set(accomplis);
  const i = liste.findIndex((x) => !faits.has(x.id));
  return i < 0 ? liste.length - 1 : i;
}

/** Ce qui est accompli, compté par chapitre et en tout. */
export interface Bilan {
  accomplis: number;
  total: number;
  epreuvesReussies: number;
  epreuvesTotal: number;
  parChapitre: { chapitre: string; accomplis: number; total: number }[];
}

export function bilan(
  exercices: readonly Exercice[], chapitres: readonly Chapitre[], accomplis: readonly string[],
): Bilan {
  const faits = new Set(accomplis);
  const parChapitre = chapitresDu(exercices, chapitres).map((c) => {
    const liste = exercices.filter((x) => x.chapitre === c.id);
    return { chapitre: c.id, accomplis: liste.filter((x) => faits.has(x.id)).length, total: liste.length };
  });
  const epreuves = exercices.filter((x) => x.epreuve);
  return {
    accomplis: exercices.filter((x) => faits.has(x.id)).length,
    total: exercices.length,
    epreuvesReussies: epreuves.filter((x) => faits.has(x.id)).length,
    epreuvesTotal: epreuves.length,
    parChapitre,
  };
}

/**
 * Les titres du voyage, gagnés aux épreuves.
 *
 * Le premier s'obtient à la première épreuve et non à zéro : un titre donné pour rien ne vaut
 * rien, et le nom d'« Oreille neuve » doit se mériter d'un son qu'on a fait tenir.
 */
export const TITRES: { epreuves: number; fr: string; en: string }[] = [
  { epreuves: 1, fr: "Oreille neuve", en: "New ear" },
  { epreuves: 2, fr: "Arpenteur de mesures", en: "Surveyor of measures" },
  { epreuves: 3, fr: "Apprenti du niveau", en: "Level apprentice" },
  { epreuves: 4, fr: "Tailleur de spectre", en: "Spectrum cutter" },
  { epreuves: 5, fr: "Maître du temps", en: "Master of time" },
  { epreuves: 6, fr: "Architecte de l'espace", en: "Architect of space" },
  { epreuves: 7, fr: "Accordeur", en: "Tuner" },
  { epreuves: 8, fr: "Forgeron de matière", en: "Matter smith" },
  { epreuves: 9, fr: "Compositeur de motifs", en: "Pattern composer" },
  { epreuves: 10, fr: "Compagnon du son", en: "Journeyman of sound" },
];

/** Le titre gagné, ou rien tant qu'aucune épreuve n'est passée. */
export function titreGagne(epreuvesReussies: number, en: boolean): string {
  let gagne = "";
  for (const t of TITRES) if (epreuvesReussies >= t.epreuves) gagne = en ? t.en : t.fr;
  return gagne;
}

/** Le prochain titre à gagner, et ce qu'il reste d'épreuves pour l'atteindre. */
export function prochainTitre(epreuvesReussies: number, en: boolean): { titre: string; reste: number } | null {
  const t = TITRES.find((x) => x.epreuves > epreuvesReussies);
  return t ? { titre: en ? t.en : t.fr, reste: t.epreuves - epreuvesReussies } : null;
}
