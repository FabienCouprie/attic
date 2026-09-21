// parcours/seance.ts — Ce que la vue et l'exécution partagent, pour qu'elles ne puissent pas
// diverger.
//
// C'EST LA LEÇON DU QUIZ, REPRISE TELLE QUELLE. Là-bas, si la vue avait tiré sa propre série, elle
// aurait posé une question pendant que le corrigé en corrigeait une autre — un désaccord qu'on ne
// découvre qu'en comptant les points à la main. Ici, le risque est le même à un détail près : la
// vue montre l'exercice courant, et la feuille de route qu'on imprime doit être celle-là. Les deux
// passent donc par les mêmes fonctions, et il n'y a pas de seconde façon de calculer « où j'en
// suis ».
//
// LA FEUILLE DE ROUTE ET LE BULLETIN SORTENT EN TEXTE, ce qui n'est pas un détail : branchés sur
// une « Sortie texte », ils s'exportent, s'impriment, se donnent à quelqu'un d'autre. Un formateur
// peut ainsi distribuer le parcours sur papier et garder l'application pour la correction.

import { CHAPITRES, EXERCICES } from "./exercices";
import type { Chapitre, Exercice, Point } from "./types";
import { bilan, exercicesDu, lireProgres, prochainTitre, rangCourant, titreGagne } from "./voyage";

/** Le réglage « Chapitre » : le fil du voyage, ou l'un des chapitres. */
export const AU_FIL = "fil";

export const OPTIONS_CHAPITRE: { id: string; fr: string; en: string }[] = [
  { id: AU_FIL, fr: "Au fil du parcours", en: "Along the journey" },
  ...CHAPITRES.map((c) => ({ id: c.id, fr: c.titre, en: c.titreEn })),
];

export interface Reglages {
  /** L'identifiant d'un chapitre, ou `AU_FIL`. */
  chapitre: string;
  /** Les exercices accomplis, lus du champ. */
  accomplis: string[];
}

/** Les réglages, lus d'où qu'ils viennent — des paramètres du nœud ou de la vue. */
export function reglagesDepuis(lire: (nom: string, defaut: string) => string | number): Reglages {
  const chapitre = String(lire("Chapitre", AU_FIL));
  return {
    chapitre: OPTIONS_CHAPITRE.some((o) => o.id === chapitre) ? chapitre : AU_FIL,
    accomplis: lireProgres(String(lire("Accomplis", ""))),
  };
}

/** La liste parcourue : celle du chapitre choisi, ou le voyage entier. */
export const listeCourante = (r: Reglages): Exercice[] =>
  exercicesDu(EXERCICES, r.chapitre === AU_FIL ? undefined : r.chapitre);

/** Le rang où l'on en est dans cette liste. */
export const rangDans = (r: Reglages): number => rangCourant(listeCourante(r), r.accomplis);

/** L'exercice courant, ou rien si la liste est vide. */
export function exerciceCourant(r: Reglages): Exercice | null {
  const liste = listeCourante(r);
  return liste[rangDans(r)] ?? null;
}

/** Le chapitre d'un exercice. */
export const chapitreDe = (x: Exercice | null): Chapitre | null =>
  CHAPITRES.find((c) => c.id === x?.chapitre) ?? null;

/** Le nom d'un chapitre dans la langue lue. */
export function nomChapitre(id: string, en: boolean): string {
  const o = OPTIONS_CHAPITRE.find((x) => x.id === id);
  return o ? (en ? o.en : o.fr) : id;
}

/** L'épreuve que l'on est en train de passer : celle du chapitre courant. */
export function epreuveCourante(r: Reglages): Exercice | null {
  const courant = exerciceCourant(r);
  const chapitre = courant?.chapitre ?? (r.chapitre === AU_FIL ? CHAPITRES[0].id : r.chapitre);
  return EXERCICES.find((x) => x.chapitre === chapitre && x.epreuve) ?? null;
}

const coche = (fait: boolean) => (fait ? "[x]" : "[ ]");

/**
 * La feuille de route : ce qu'il y a à faire, et ce qui est fait.
 *
 * Les leçons n'y sont pas, et c'est voulu : elles se gagnent en réussissant, et les imprimer
 * d'avance reviendrait à donner le corrigé avec l'énoncé.
 */
export function feuilleDeRoute(r: Reglages, en: boolean): string {
  const faits = new Set(r.accomplis);
  const lignes: string[] = [];
  lignes.push(en ? "JOURNEY THROUGH SOUND" : "VOYAGE À TRAVERS LE SON");
  lignes.push("");
  let chapitreEcrit = "";
  for (const x of listeCourante(r)) {
    if (x.chapitre !== chapitreEcrit) {
      chapitreEcrit = x.chapitre;
      const c = CHAPITRES.find((k) => k.id === x.chapitre);
      if (c) {
        lignes.push("");
        lignes.push(`── ${en ? c.titreEn : c.titre} ──`);
        lignes.push(en ? c.promesseEn : c.promesse);
        lignes.push("");
      }
    }
    lignes.push(`${coche(faits.has(x.id))} ${en ? x.titreEn : x.titre}`);
    lignes.push(`    ${en ? x.enonceEn : x.enonce}`);
    for (const cible of x.cibles ?? []) lignes.push(`    · ${en ? cible.exigenceEn : cible.exigence}`);
  }
  return lignes.join("\n");
}

/** Le bulletin : où l'on en est, ce qu'on a gagné, et ce que l'épreuve du moment dit. */
export function bulletin(r: Reglages, en: boolean, verdicts: Point[] = []): string {
  const b = bilan(EXERCICES, CHAPITRES, r.accomplis);
  const lignes: string[] = [];
  lignes.push(en ? "REPORT CARD" : "BULLETIN");
  lignes.push("");
  lignes.push(en
    ? `${b.accomplis} of ${b.total} steps done, ${b.epreuvesReussies} of ${b.epreuvesTotal} trials passed.`
    : `${b.accomplis} étapes accomplies sur ${b.total}, ${b.epreuvesReussies} épreuves réussies sur ${b.epreuvesTotal}.`);
  const titre = titreGagne(b.epreuvesReussies, en);
  if (titre) lignes.push(en ? `Title held: ${titre}.` : `Titre porté : ${titre}.`);
  const suivant = prochainTitre(b.epreuvesReussies, en);
  if (suivant) {
    lignes.push(en
      ? `${suivant.reste} trial(s) to become ${suivant.titre}.`
      : `${suivant.reste} épreuve(s) pour devenir ${suivant.titre}.`);
  }
  lignes.push("");
  for (const c of b.parChapitre) {
    lignes.push(`${coche(c.accomplis === c.total)} ${nomChapitre(c.chapitre, en)} — ${c.accomplis}/${c.total}`);
  }
  const epreuve = epreuveCourante(r);
  if (epreuve && verdicts.length > 0) {
    lignes.push("");
    lignes.push(`── ${en ? epreuve.titreEn : epreuve.titre} ──`);
    for (const v of verdicts) lignes.push(`${coche(v.satisfait)} ${en ? v.texteEn : v.texte}`);
  }
  return lignes.join("\n");
}
