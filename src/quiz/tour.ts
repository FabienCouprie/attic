// quiz/tour.ts — Tirer une série, la corriger, l'imprimer. Aucune question ici : de la mécanique.
//
// LE PROBLÈME À RÉSOUDRE EST LA LASSITUDE, et il a deux causes distinctes qu'on confond
// volontiers.
//
//  1. LA RÉPÉTITION. Tirer chaque question au hasard indépendamment — le réflexe — redonne la
//     même question au bout de quelques tirages : sur une banque de cent questions, la
//     probabilité de revoir une question déjà vue dépasse un sur deux dès la douzième
//     (paradoxe des anniversaires). La série est donc une PERMUTATION de la banque, et non une
//     suite de tirages : on ne revoit rien avant d'avoir tout vu. C'est la garantie que le test
//     `aucune répétition avant épuisement` vérifie.
//
//  2. LA MONOTONIE DE THÈME. Une permutation uniforme d'une banque où un thème pèse les deux
//     tiers donne des séries qui parlent du même sujet six fois de suite — techniquement sans
//     répétition, et pourtant lassantes. Le tirage prend donc À TOUR DE RÔLE dans chaque thème
//     présent, l'ordre des thèmes étant lui-même retiré à chaque tour. Une série de vingt
//     questions sur six thèmes en donne trois ou quatre de chacun, quelle que soit la taille
//     des banques — et le thème « Catalogue », qui compte à lui seul plusieurs centaines de
//     questions, ne peut plus noyer les cinq autres.
//
// L'ORDRE DES PROPOSITIONS EST TIRÉ AU SORT LUI AUSSI, et pas par coquetterie : la banque écrit
// toujours la bonne réponse en premier (cf. `types.ts`), donc sans ce tirage la réponse serait
// toujours A. Le tirage dépend de la graine ET de l'identifiant de la question, de sorte que
// deux questions voisines ne partagent pas leur permutation.
//
// TOUT EST REPRODUCTIBLE À PARTIR DE LA GRAINE. C'est ce qui permet de refaire exactement le même
// questionnaire — pour le corriger, pour le donner à quelqu'un d'autre, ou simplement pour
// reprendre là où l'on s'était arrêté après avoir fermé l'application.

import { creerAleatoire } from "../core/hasard";
import { THEMES, choixLangue, enonceLangue, pourquoiLangue, NOM_THEME, type Question, type ThemeQuiz } from "./types";

/** Une question posée : la question, et l'ordre dans lequel ses propositions sont montrées. */
export interface Posee {
  question: Question;
  /** `ordre[i]` est l'indice, dans `question.choix`, de la proposition montrée en position i. */
  ordre: number[];
}

/** Fisher-Yates, en place sur une copie. */
export function melanger<T>(xs: readonly T[], alea: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Une empreinte entière d'un identifiant, pour que chaque question ait son propre tirage. */
function empreinte(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Un tour complet : toutes les questions du vivier, une fois chacune, thèmes alternés.
 *
 * Exporté pour que le test puisse vérifier la propriété qui compte — c'est bien une permutation
 * du vivier, pas un échantillon.
 */
export function tourComplet(vivier: readonly Question[], graine: number): Question[] {
  const alea = creerAleatoire(graine);
  const files = new Map<ThemeQuiz, Question[]>();
  for (const t of THEMES) {
    const groupe = vivier.filter((q) => q.theme === t);
    if (groupe.length > 0) files.set(t, melanger(groupe, alea));
  }
  const out: Question[] = [];
  while (files.size > 0) {
    // L'ordre des thèmes est retiré à chaque tour : sans cela, la série alternerait selon un
    // cycle fixe (sigles, notions, formules…) qui s'apprend au bout de deux tours.
    for (const t of melanger([...files.keys()], alea)) {
      const file = files.get(t);
      if (!file) continue;
      const q = file.pop();
      if (q) out.push(q);
      if (file.length === 0) files.delete(t);
    }
  }
  return out;
}

/**
 * La série de `longueur` questions posées.
 *
 * Au-delà de la taille du vivier, un nouveau tour commence — avec une graine dérivée, donc un
 * ordre différent du premier. On ne revoit donc une question qu'après avoir vu toutes les
 * autres, ce qui est le mieux qu'on puisse faire une fois la banque épuisée.
 */
export function serie(vivier: readonly Question[], graine: number, longueur: number): Posee[] {
  const out: Posee[] = [];
  if (vivier.length === 0 || longueur <= 0) return out;
  for (let cycle = 0; out.length < longueur; cycle++) {
    const graineCycle = (graine + cycle * 7919) >>> 0;
    for (const q of tourComplet(vivier, graineCycle)) {
      if (out.length >= longueur) break;
      const rangs = q.choix.map((_, i) => i);
      out.push({ question: q, ordre: melanger(rangs, creerAleatoire((graineCycle + empreinte(q.id)) >>> 0)) });
    }
  }
  return out;
}

/** A, B, C, D… */
export const lettre = (i: number): string => String.fromCharCode(65 + i);

/** La position à laquelle la bonne réponse est montrée. */
export const positionJuste = (p: Posee): number => p.ordre.indexOf(0);

/** Les propositions telles qu'elles sont montrées, dans la langue demandée. */
export function propositions(p: Posee, en: boolean): string[] {
  const choix = choixLangue(p.question, en);
  return p.ordre.map((i) => choix[i] ?? "");
}

/**
 * Lit les réponses données, écrites comme une suite de lettres.
 *
 * TOLÉRANTE PAR NÉCESSITÉ : le champ est tapé à la main, et l'on y trouvera des minuscules, des
 * espaces, des virgules ou des retours à la ligne. Tout ce qui n'est pas une lettre de
 * proposition est ignoré ; un point ou un tiret vaut « sautée », ce qui permet de ne pas
 * répondre à une question sans décaler toutes les suivantes.
 */
export function lireReponses(texte: string, nbChoix = 4): number[] {
  const out: number[] = [];
  for (const c of texte.toUpperCase()) {
    if (c >= "A" && c < String.fromCharCode(65 + nbChoix)) out.push(c.charCodeAt(0) - 65);
    else if (c === "." || c === "-" || c === "_") out.push(-1);
  }
  return out;
}

/** Les réponses, réécrites comme la suite de lettres qu'on stocke. */
export function ecrireReponses(reponses: readonly number[]): string {
  return reponses.map((r) => (r >= 0 ? lettre(r) : ".")).join("");
}

export interface Bilan {
  repondues: number;
  justes: number;
  total: number;
  /** Par thème rencontré : justes sur répondues. */
  parTheme: { theme: ThemeQuiz; justes: number; repondues: number }[];
  /** Les questions manquées, avec la réponse donnée — de quoi faire la révision. */
  manquees: { rang: number; posee: Posee; donnee: number }[];
}

export function corriger(s: readonly Posee[], reponses: readonly number[]): Bilan {
  const parTheme = new Map<ThemeQuiz, { justes: number; repondues: number }>();
  const manquees: Bilan["manquees"] = [];
  let justes = 0, repondues = 0;
  for (let i = 0; i < s.length && i < reponses.length; i++) {
    const donnee = reponses[i];
    if (donnee < 0) continue;
    repondues++;
    const theme = s[i].question.theme;
    const compte = parTheme.get(theme) ?? { justes: 0, repondues: 0 };
    compte.repondues++;
    if (donnee === positionJuste(s[i])) { justes++; compte.justes++; }
    else manquees.push({ rang: i, posee: s[i], donnee });
    parTheme.set(theme, compte);
  }
  return {
    repondues, justes, total: s.length,
    parTheme: THEMES.filter((t) => parTheme.has(t)).map((t) => ({ theme: t, ...parTheme.get(t)! })),
    manquees,
  };
}

const rang = (i: number, n: number) => String(i + 1).padStart(String(n).length, " ");

/**
 * Le questionnaire, sans les réponses : celui qu'on exporte, imprime ou donne à quelqu'un.
 *
 * Le thème est écrit devant chaque question, parce qu'on ne révise pas de la même façon un sigle
 * et une formule, et que savoir de quoi on parle fait partie de la question.
 */
export function feuille(s: readonly Posee[], en: boolean, graine?: number): string {
  const lignes: string[] = [];
  lignes.push(en ? `ATTIC QUIZ — ${s.length} question(s)` : `QUIZ ATTIC — ${s.length} question(s)`);
  if (graine !== undefined) lignes.push(en ? `Seed ${graine} — the same seed gives the same order.` : `Graine ${graine} — la même graine redonne le même ordre.`);
  lignes.push("");
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    lignes.push(`${rang(i, s.length)}. [${NOM_THEME[p.question.theme][en ? "en" : "fr"]}] ${enonceLangue(p.question, en)}`);
    const props = propositions(p, en);
    for (let j = 0; j < props.length; j++) lignes.push(`     ${lettre(j)}. ${props[j]}`);
    lignes.push("");
  }
  return lignes.join("\n");
}

/**
 * Le corrigé : la bonne réponse, l'explication, et le relevé de ce qui a été répondu.
 *
 * Il tient dans un seul texte plutôt que deux, parce que réviser demande de voir ensemble la
 * question, ce qu'on a répondu et pourquoi c'était faux — les séparer oblige à faire l'aller-retour.
 */
export function corrige(s: readonly Posee[], reponses: readonly number[], en: boolean): string {
  const bilan = corriger(s, reponses);
  const lignes: string[] = [];
  lignes.push(en ? "ANSWER KEY" : "CORRIGÉ");
  if (bilan.repondues > 0) {
    const pc = Math.round((bilan.justes / bilan.repondues) * 100);
    lignes.push(en
      ? `Score: ${bilan.justes} / ${bilan.repondues} answered (${pc} %) — ${s.length} question(s) in the series.`
      : `Score : ${bilan.justes} / ${bilan.repondues} répondues (${pc} %) — ${s.length} question(s) dans la série.`);
    for (const t of bilan.parTheme) {
      lignes.push(`  ${NOM_THEME[t.theme][en ? "en" : "fr"]} : ${t.justes} / ${t.repondues}`);
    }
  }
  lignes.push("");
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    const juste = positionJuste(p);
    const donnee = i < reponses.length ? reponses[i] : -1;
    const marque = donnee < 0 ? " " : donnee === juste ? "+" : "x";
    lignes.push(`${marque} ${rang(i, s.length)}. ${lettre(juste)} — ${propositions(p, en)[juste]}`);
    if (donnee >= 0 && donnee !== juste) {
      lignes.push(en ? `      answered ${lettre(donnee)} — ${propositions(p, en)[donnee]}` : `      répondu ${lettre(donnee)} — ${propositions(p, en)[donnee]}`);
    }
    lignes.push(`      ${pourquoiLangue(p.question, en)}`);
    lignes.push("");
  }
  return lignes.join("\n");
}
