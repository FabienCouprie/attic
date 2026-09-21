// quiz/seance.ts — Le pont entre les réglages d'un nœud et une série de questions.
//
// POURQUOI CE FICHIER EXISTE, alors que `tour.ts` sait déjà tirer une série. Parce que DEUX
// ENDROITS doivent tirer exactement la même : le nœud, quand on le lance, pour écrire le
// questionnaire et le corrigé ; et sa vue, pour poser les questions une à une sous les yeux. S'ils
// tiraient chacun de leur côté, la vue afficherait une question et le corrigé en corrigerait une
// autre — la panne serait invisible et la correction fausse.
//
// LA SÉRIE EST DONC UNE FONCTION PURE DES RÉGLAGES, et rien d'autre : thème, niveau, longueur,
// graine. Les réponses données n'y entrent pas, ce qui est la seconde garantie : répondre ne
// déplace pas les questions suivantes.
//
// LES VALEURS DE RÉGLAGE SONT LUES TOLÉRAMMENT. Un paramètre « choix » stocke son identifiant,
// mais un projet enregistré par une version antérieure — ou à la main — peut porter le libellé
// français ou anglais. Les trois sont acceptés : la lecture d'un réglage n'est pas l'endroit où
// l'on veut être strict.

import { vivier, type ChoixNiveau, type ChoixTheme } from "./banque";
import { serie, type Posee } from "./tour";
import type { Question, ThemeQuiz } from "./types";

export interface OptionChoix {
  id: string;
  fr: string;
  en: string;
}

/** Les thèmes proposés par le nœud, « Tout » compris. */
export const OPTIONS_THEME: OptionChoix[] = [
  { id: "tout", fr: "Tout", en: "All" },
  { id: "sigles", fr: "Sigles", en: "Acronyms" },
  { id: "notions", fr: "Notions", en: "Concepts" },
  { id: "formules", fr: "Formules", en: "Formulas" },
  { id: "chiffres", fr: "Chiffres", en: "Figures" },
  { id: "sources", fr: "Sources", en: "Sources" },
  { id: "catalogue", fr: "Catalogue", en: "Catalog" },
];

export const OPTIONS_NIVEAU: OptionChoix[] = [
  { id: "tous", fr: "Tous", en: "All" },
  { id: "initie", fr: "Initié", en: "Beginner" },
  { id: "avance", fr: "Avancé", en: "Advanced" },
];

const trouver = (options: OptionChoix[], valeur: string): OptionChoix | undefined => {
  const v = String(valeur).trim();
  return options.find((o) => o.id === v || o.fr === v || o.en === v);
};

export function themeDepuis(valeur: string): ChoixTheme {
  return (trouver(OPTIONS_THEME, valeur)?.id ?? "tout") as ChoixTheme;
}

export function niveauDepuis(valeur: string): ChoixNiveau {
  const id = trouver(OPTIONS_NIVEAU, valeur)?.id ?? "tous";
  return id === "initie" ? 1 : id === "avance" ? 2 : 0;
}

export const LONGUEUR_MIN = 5;
export const LONGUEUR_MAX = 100;
export const LONGUEUR_DEFAUT = 20;
export const GRAINE_DEFAUT = 7;

export interface ReglagesQuiz {
  theme: ChoixTheme;
  niveau: ChoixNiveau;
  longueur: number;
  graine: number;
}

/** Les réglages tels qu'un nœud les porte, quelle que soit la façon de les lire. */
export function reglagesDepuis(
  lire: (nom: string, defaut: string | number) => string | number,
): ReglagesQuiz {
  return {
    theme: themeDepuis(String(lire("Thème", "tout"))),
    niveau: niveauDepuis(String(lire("Niveau", "tous"))),
    longueur: Math.max(LONGUEUR_MIN, Math.min(LONGUEUR_MAX, Math.round(Number(lire("Questions", LONGUEUR_DEFAUT)) || LONGUEUR_DEFAUT))),
    graine: Math.max(1, Math.round(Number(lire("Graine", GRAINE_DEFAUT)) || GRAINE_DEFAUT)),
  };
}

/** La série d'une séance. Même entrée, même série — c'est tout l'objet de ce module. */
export function seance(r: ReglagesQuiz, catalogue: readonly Question[] = []): Posee[] {
  return serie(vivier({ theme: r.theme, niveau: r.niveau, catalogue }), r.graine, r.longueur);
}

/** Le nom d'un thème dans la langue demandée, pour l'afficher sur une question. */
export function nomTheme(theme: ThemeQuiz, en: boolean): string {
  const o = OPTIONS_THEME.find((x) => x.id === theme);
  return o ? (en ? o.en : o.fr) : theme;
}
