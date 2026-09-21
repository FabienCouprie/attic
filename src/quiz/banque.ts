// quiz/banque.ts — La banque assemblée, et le choix du vivier.
//
// CINQ THÈMES ÉCRITS À LA MAIN, UN ENGENDRÉ. Les cinq premiers sont la substance — ce qu'on
// voudrait qu'un utilisateur d'Attic sache au bout de quelques mois. Le sixième, le catalogue, est
// calculé sur le registre vivant, et c'est lui qui donne le volume.
//
// LE MÉLANGE EST DÉLIBÉRÉMENT DÉSÉQUILIBRÉ EN TAILLE, et cela ne se voit pas à l'usage : le
// tirage prend à tour de rôle dans chaque thème (cf. `tour.ts`), si bien que six ou sept cents
// questions de catalogue ne noient pas les cent soixante autres. Sans cette mécanique, une série
// de vingt questions aurait été une série de dix-huit questions de catalogue, et le quiz aurait
// enseigné l'arborescence du logiciel plutôt que le métier.

import { CHIFFRES } from "./chiffres";
import { FORMULES } from "./formules";
import { NOTIONS } from "./notions";
import { SIGLES } from "./sigles";
import { SOURCES } from "./sources";
import type { NiveauQuiz, Question, ThemeQuiz } from "./types";

/** Les questions écrites à la main — tout sauf le catalogue, qui est calculé. */
export const BANQUE: Question[] = [...SIGLES, ...NOTIONS, ...FORMULES, ...CHIFFRES, ...SOURCES];

export { CHIFFRES, FORMULES, NOTIONS, SIGLES, SOURCES };

/** « tout » vaut tous les thèmes, catalogue compris. */
export type ChoixTheme = "tout" | ThemeQuiz;

/** 0 vaut tous les niveaux. */
export type ChoixNiveau = 0 | NiveauQuiz;

export interface OptionsVivier {
  theme?: ChoixTheme;
  niveau?: ChoixNiveau;
  /** Les questions engendrées par `questionsCatalogue`, quand le registre est disponible. */
  catalogue?: readonly Question[];
}

/**
 * Le vivier dans lequel une série sera tirée.
 *
 * SI LE FILTRE NE LAISSE RIEN, on rend la banque entière plutôt qu'un vivier vide : un quiz qui
 * n'affiche aucune question parce qu'un thème est vide au niveau demandé serait une panne
 * silencieuse, et l'utilisateur n'aurait aucun moyen de comprendre laquelle de ses deux options
 * est en cause.
 */
export function vivier(o: OptionsVivier = {}): Question[] {
  const theme = o.theme ?? "tout";
  const niveau = o.niveau ?? 0;
  const tout = [...BANQUE, ...(o.catalogue ?? [])];
  const choisi = tout.filter((q) =>
    (theme === "tout" || q.theme === theme) && (niveau === 0 || q.niveau === niveau));
  return choisi.length > 0 ? choisi : tout;
}
