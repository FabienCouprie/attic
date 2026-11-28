// audio/soundhelix-arrangement.ts — Tirer la matrice d'activité d'un morceau : combien de voix jouent
// à chaque section, puis lesquelles, sous les contraintes de chaque voix.
//
// D'APRÈS SoundHelix 0.9 (Thomas Schürger), réécrit depuis la description de son modèle, sans rien en
// recopier : décision D1 du chantier, 2026-11-28. Le tirage n'est pas celui du programme, tirage
// pour tirage ; ce qu'il garantit est éprouvé par la loi dans `audio/soundhelix-arrangement.test.ts`.
//
// LE NOMBRE DE VOIX. Les premières sections prennent les comptes d'« Entrée » (1, 2, 3, 4 : la forme
// qui s'ouvre), les dernières ceux de « Sortie » ; entre les deux, chaque section tire un compte
// entre le minimum et le maximum, à au plus « Changement » du précédent, et le même compte que la
// section d'avant n'est gardé qu'une fois sur dix quand un autre est possible.
//
// LES VOIX. Chaque section part des voix de la précédente et en allume ou en éteint au hasard pour
// atteindre son compte ; à compte égal, une fois sur deux, elle en échange une. RECHERCHE EXACTE :
// chaque section essaie plusieurs propositions, garde la première qui tient les contraintes déjà
// décidables, et revient à la section d'avant quand aucune ne tient ; le plafond d'« Essais » borne
// la recherche, et la contrainte qui a le plus souvent bloqué est rendue. RECHERCHE GLOUTONNE :
// chaque section garde, parmi ses propositions, celle qui viole le moins, sans retour ; les
// contraintes n'y sont qu'approchées, et le compte des écarts est rendu.
//
// DES COMPTES SANS ISSUE SE RETIRENT. Les comptes se tirent avant les voix, et certains rendent les
// contraintes intenables : une part minimale qu'aucune place ne laisse atteindre. Relevé sur la graine
// 25 de l'essai du test, où la recherche exacte épuisait 200 000 essais sur la part de « accomp ».
// La recherche exacte reprend donc, jusqu'à dix fois, sur des comptes tirés à neuf, chaque reprise
// recevant un dixième des essais.

import { type Recherche, rechercherMatrice } from "./soundhelix-recherche";

/** Un intervalle fermé de nombres entiers. */
export interface Borne { min: number; max: number }

/** Les contraintes d'une voix, en sections ; `part` en pour cent des sections. */
export interface ContraintesVoix {
  nom: string;
  part: Borne;
  /** La section de la première entrée, comptée depuis 1. */
  entree: Borne;
  /** La section de la dernière sortie, comptée depuis la fin : 1 est la dernière section. */
  sortie: Borne;
  segments: Borne;
  longueur: Borne;
  pause: Borne;
  muette: boolean;
  debut: number;
  fin: number;
}

/** Une faute de description de voix, en français et en anglais. */
export class FauteArrangement extends Error {
  readonly en: string;
  constructor(message: string, en: string) {
    super(message);
    this.en = en;
  }
}

const INFINI = 1_000_000;

/** Lit une borne `a-b`, `a-` ou `-b` ; un nombre seul fixe les deux. */
function lireBorne(texte: string, cle: string, ligne: string): Borne {
  const m = /^(\d*)(-?)(\d*)$/.exec(texte);
  if (!m || (m[1] === "" && m[3] === "")) {
    throw new FauteArrangement(`borne illisible « ${cle}=${texte} » dans « ${ligne} »`, `unreadable bound « ${cle}=${texte} » in « ${ligne} »`);
  }
  if (m[2] === "") return { min: Number(m[1]), max: Number(m[1]) };
  return { min: m[1] === "" ? 0 : Number(m[1]), max: m[3] === "" ? INFINI : Number(m[3]) };
}

type Cle = "part" | "entree" | "sortie" | "segments" | "longueur" | "pause";

/**
 * LES MOTS-CLÉS S'ÉCRIVENT DANS LES DEUX LANGUES, et c'est ce qui permet à la notice anglaise de les
 * écrire en anglais : `share`, `entry`, `exit`, `length`, `silent` valent `part`, `entree`, `sortie`,
 * `longueur`, `muette`. Les décalages gardent `debut` et `fin`, ceux de la matrice rendue.
 */
const CLES: Record<string, Cle> = {
  part: "part", share: "part", entree: "entree", entry: "entree", sortie: "sortie", exit: "sortie",
  segments: "segments", longueur: "longueur", length: "longueur", pause: "pause",
};

/** Le mot-clé anglais de chaque contrainte, pour les messages. */
export const CLES_EN: Record<Cle | "muette", string> = {
  part: "share", entree: "entry", sortie: "exit", segments: "segments", longueur: "length", pause: "pause", muette: "silent",
};

/** Lit les voix, une par ligne : `nom  part=10-35 entree=4- sortie=-1 segments=2-4 longueur=2- pause=1- muette debut=-2`. */
export function lireVoix(texte: string): ContraintesVoix[] {
  const out: ContraintesVoix[] = [];
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const [nom, ...mots] = ligne.split(/\s+/);
    if (out.some((v) => v.nom === nom)) {
      throw new FauteArrangement(`la voix « ${nom} » est écrite deux fois`, `the voice « ${nom} » is written twice`);
    }
    const v: ContraintesVoix = {
      nom, part: { min: 0, max: 100 }, entree: { min: 1, max: INFINI }, sortie: { min: 1, max: INFINI },
      segments: { min: 1, max: INFINI }, longueur: { min: 1, max: INFINI }, pause: { min: 1, max: INFINI },
      muette: false, debut: 0, fin: 0,
    };
    for (const mot of mots) {
      if (mot === "muette" || mot === "silent") { v.muette = true; continue; }
      const m = /^(\w+)=(.*)$/.exec(mot);
      const cle = m?.[1];
      if (m && (cle === "debut" || cle === "fin") && /^-?\d+$/.test(m[2])) { v[cle] = Number(m[2]); continue; }
      if (m && Object.hasOwn(CLES, cle!)) { v[CLES[cle!]] = lireBorne(m[2], cle!, ligne); continue; }
      throw new FauteArrangement(`« ${mot} » illisible dans « ${ligne} »`, `« ${mot} » unreadable in « ${ligne} »`);
    }
    out.push(v);
  }
  return out;
}

export interface OptionsComptes {
  sections: number;
  voix: number;
  min: number;
  max: number;
  changement: number;
  entree: readonly number[];
  sortie: readonly number[];
}

/** Le nombre de voix actives à chaque section. */
export function tirerComptes(o: OptionsComptes, alea: () => number): number[] {
  const borne = (c: number) => Math.max(0, Math.min(o.voix, c));
  const c = new Array<number>(o.sections).fill(0);
  const fixes = new Array<boolean>(o.sections).fill(false);
  o.sortie.forEach((v, k) => { const s = o.sections - o.sortie.length + k; if (s >= 0) { c[s] = borne(v); fixes[s] = true; } });
  o.entree.forEach((v, k) => { if (k < o.sections) { c[k] = borne(v); fixes[k] = true; } });
  const bas = borne(Math.min(o.min, o.max));
  const haut = borne(Math.max(o.min, o.max));
  for (let s = 0; s < o.sections; s++) {
    if (fixes[s]) continue;
    const avant = s > 0 ? c[s - 1] : bas;
    const de = Math.max(bas, avant - o.changement);
    const a = Math.min(haut, avant + o.changement);
    const possibles: number[] = [];
    for (let k = Math.min(de, a); k <= Math.max(de, a); k++) possibles.push(k);
    const autres = possibles.filter((k) => k !== avant);
    if (autres.length === 0 || (possibles.includes(avant) && alea() < 0.1)) c[s] = possibles.includes(avant) ? avant : possibles[0];
    else c[s] = autres[Math.floor(alea() * autres.length)];
  }
  return c;
}

/** Combien de fois la recherche exacte reprend sur des comptes neufs. */
export const REPRISES = 10;

export interface Arrangement extends Recherche {
  /** Les comptes de la recherche rendue : la dernière tentée, ou celle qui a trouvé. */
  comptes: number[];
  reprises: number;
}

/** Les comptes, puis les voix ; en recherche exacte, des comptes neufs tant qu'aucune matrice ne tient. */
export function arranger(o: {
  voix: readonly ContraintesVoix[]; comptes: Omit<OptionsComptes, "voix">; exacte: boolean; essais: number; aleatoire: () => number;
}): Arrangement {
  const options = { ...o.comptes, voix: o.voix.length };
  if (!o.exacte) {
    const comptes = tirerComptes(options, o.aleatoire);
    return { ...rechercherMatrice({ voix: o.voix, comptes, exacte: false, essais: o.essais, aleatoire: o.aleatoire }), comptes, reprises: 0 };
  }
  const part = Math.max(1, Math.floor(o.essais / REPRISES));
  let essais = 0;
  let dernier: Arrangement | null = null;
  for (let k = 0; k < REPRISES; k++) {
    const comptes = tirerComptes(options, o.aleatoire);
    const r = rechercherMatrice({ voix: o.voix, comptes, exacte: true, essais: part, aleatoire: o.aleatoire });
    essais += r.essais;
    dernier = { ...r, comptes, reprises: k, essais };
    if (r.matrice) break;
  }
  return dernier!;
}
