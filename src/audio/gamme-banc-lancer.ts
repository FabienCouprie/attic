// audio/gamme-banc-lancer.ts — Lancer un nœud à gamme sous une gamme, une tonique et une graine.
//
// POURQUOI CE MODULE EXISTE. Le 2026-11-21, Fabien entendait des progressions semblables d'une gamme
// à l'autre sur le multi-réservoir, et le contrôle a montré qu'aucun test ne tenait la gamme d'un seul
// nœud par le chemin du moteur hors de do : tout était éprouvé en majeur, en do, ou pas du tout. Sa
// règle : « la musique est une chose sérieuse ». Ce module est la première pièce du banc des gammes,
// qui mesure ce que chaque nœud à gamme REND, jamais ce qu'on lui demande.
//
// IL REPREND LE BANC DE CROISEMENT, et ne le refait pas : les réglages de base bornent les durées à
// huit secondes (`reglagesDeBase`), les entrées sont assez riches pour qu'un réglage agisse
// (`entreesRiches`), et le lancer est celui du moteur (`lancerFiche`), canonisation des choix comprise.
//
// LA GAMME DOIT S'ENTENDRE, ou le banc mesure du vide. Le cercle pulsant ne joue sa mélodie qu'en mode
// « Mélodie », la série de Nørgård ne lit sa gamme qu'en lecture par degrés : ces conditions sont déjà
// déclarées au banc de croisement, comme inerties de la gamme sous leur vraie condition
// (`INERTIES_CONDITIONNEES`). Elles sont lues ici et rendues fausses, au lieu d'être recopiées.

import type { ParametreDef } from "../core/types";
import { demiTonDeCle } from "./cles";
import { lancerFiche, type FicheLancable, type Lancer, type Reglages } from "./lancer-fiche";
import { DELAI_LANCER_MS, entreesRiches, reglagesDeBase } from "./croisement-reglages";
import { INERTIES_CONDITIONNEES } from "./croisement-inscriptions";
import type { ConditionSimple } from "./croisement-registre";

/** Un réglage de gamme d'une fiche, ses identifiants offerts, et la tonique qui lui répond. */
export interface ReglageDeGamme {
  fiche: string;
  gamme: string;
  ids: string[];
  tonique?: { reglage: string; ids: string[] };
}

/** Ce que rend `reglagesANomenclature`, réduit à ce qu'il faut ici. */
export interface ReleveDeDomaine {
  fiche: string;
  reglage: string;
  domaine: { nom: string; sentinelles?: readonly { valeur: string }[] };
  ids: readonly string[];
}

const sansSentinelles = (r: ReleveDeDomaine) => {
  const sentinelles = new Set((r.domaine.sentinelles ?? []).map((s) => s.valeur));
  return r.ids.filter((x) => !sentinelles.has(x));
};

/**
 * Apparie chaque réglage de gamme à la tonique de sa fiche.
 *
 * UNE GAMME ET AU PLUS UNE TONIQUE S'APPARIENT D'ELLES-MÊMES. Deux gammes sur une fiche, celles de
 * départ et d'arrivée du glissando, s'apparient par le suffixe de leur nom : « Gamme de départ » avec
 * « Tonique de départ ». Une gamme qu'aucune règle n'apparie à l'une de plusieurs toniques est rendue
 * ambiguë, et le garde la refuse tant qu'elle n'est pas déclarée.
 */
export function apparier(releves: readonly ReleveDeDomaine[]): { paires: ReglageDeGamme[]; ambigues: string[] } {
  const parFiche = new Map<string, { gammes: ReleveDeDomaine[]; toniques: ReleveDeDomaine[] }>();
  for (const r of releves) {
    if (r.domaine.nom !== "gamme" && r.domaine.nom !== "clé") continue;
    const e = parFiche.get(r.fiche) ?? { gammes: [], toniques: [] };
    (r.domaine.nom === "gamme" ? e.gammes : e.toniques).push(r);
    parFiche.set(r.fiche, e);
  }
  const paires: ReglageDeGamme[] = [];
  const ambigues: string[] = [];
  for (const [fiche, { gammes, toniques }] of parFiche) {
    for (const g of gammes) {
      let t = gammes.length === 1 && toniques.length === 1 ? toniques[0] : undefined;
      if (gammes.length > 1) {
        const suffixe = g.reglage.replace(/^Gamme/, "");
        t = suffixe ? toniques.find((x) => x.reglage.endsWith(suffixe)) : undefined;
      }
      if (toniques.length > 0 && !t) ambigues.push(`${fiche}·${g.reglage}`);
      paires.push({ fiche, gamme: g.reglage, ids: sansSentinelles(g), ...(t ? { tonique: { reglage: t.reglage, ids: sansSentinelles(t) } } : {}) });
    }
  }
  return { paires, ambigues };
}

/** Le demi-ton d'un identifiant de tonique : un nombre de demi-tons depuis do, ou un nom de note. */
export const demiTonDeTonique = (id: string): number | undefined =>
  (/^\d+$/.test(id) ? Number(id) % 12 : demiTonDeCle(id));

/** L'identifiant d'option qui désigne une tonique, comme l'inspecteur l'écrirait. */
export const idDeTonique = (ids: readonly string[], demiTon: number): string | undefined =>
  ids.find((id) => demiTonDeTonique(id) === demiTon);

/** Ce qu'il faut poser pour que la gamme s'entende, et ce qui la met hors de portée du banc. */
export interface OuLaGammeAgit { reglages: Reglages; brancher: boolean; horsDePortee?: string }

const idsDe = (p: ParametreDef | undefined) => (p?.optionIds ?? p?.options ?? []).map(String);

/**
 * Les réglages sous lesquels la gamme d'une fiche s'entend : chaque inertie de la gamme déclarée sous
 * sa vraie condition, rendue fausse.
 *
 * UNE CONDITION « TOUS » TOMBE DÈS QU'UNE DES SIENNES EST FAUSSE, et la première suffit ; une
 * condition « UNE » demande que toutes le soient. Un port qui doit être branché fait brancher les ports
 * facultatifs ; une condition « banc » met la gamme hors de portée, avec sa raison.
 */
export function ouLaGammeAgit(fiche: FicheLancable, reglage: string): OuLaGammeAgit {
  const reglages: Reglages = {};
  let brancher = false;
  let horsDePortee: string | undefined;
  const falsifier = (c: ConditionSimple, raison: string) => {
    if ("banc" in c) { horsDePortee = raison; return; }
    if ("port" in c) { brancher = true; return; }
    const ids = idsDe(fiche.parametres.find((x) => x.nom === c.reglage));
    const v = "sauf" in c ? c.sauf[0] : ids.find((id) => !c.valeurs.includes(id));
    if (v !== undefined) reglages[c.reglage] = v;
  };
  for (const i of INERTIES_CONDITIONNEES) {
    if (i.ou !== `${fiche.id}·${reglage}`) continue;
    const q = i.quand;
    if ("une" in q) for (const c of q.une) falsifier(c, i.raison);
    else if ("tous" in q) falsifier(q.tous[0], i.raison);
    else falsifier(q, i.raison);
  }
  return { reglages, brancher, ...(horsDePortee ? { horsDePortee } : {}) };
}

/** Un lancer du banc : ce qui a été posé, ce qui a été rendu, et ce que cela a coûté. */
export interface LancerSousGamme {
  gamme: string;
  demiTon?: number;
  graine: number;
  reglages: Reglages;
  lancer?: Lancer;
  echec?: string;
  ms: number;
}

/** Ce qu'un lancer du banc fait varier, en plus de la gamme. */
export interface Variation { demiTon?: number; graine: number; autres?: Reglages }

async function borne(fiche: FicheLancable, reglages: Reglages, entrees: unknown[]): Promise<Lancer | "délai"> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<"délai">((ok) => { minuteur = setTimeout(() => ok("délai"), DELAI_LANCER_MS); });
  try {
    return await Promise.race([lancerFiche(fiche, reglages, { entrees }), delai]);
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Lance une fiche sous une gamme, une tonique et une graine.
 *
 * LA TONIQUE SE POSE PAR L'IDENTIFIANT D'OPTION, comme l'inspecteur l'écrit : « Eb » pour une clé
 * nommée, « 3 » pour une tonique comptée en demi-tons. LA GRAINE SE POSE PAR SON RÔLE, le réglage qui
 * porte `graine`, et jamais par son nom. Un lancer qui ne rend rien est relancé ports facultatifs
 * branchés, comme au banc de croisement : un nœud dont toutes les entrées sont facultatives ne rend
 * rien seul.
 */
export async function lancerSousGamme(fiche: FicheLancable, r: ReglageDeGamme, gamme: string, v: Variation): Promise<LancerSousGamme> {
  const agit = ouLaGammeAgit(fiche, r.gamme);
  const reglages: Reglages = { ...reglagesDeBase(fiche), ...agit.reglages, ...v.autres, [r.gamme]: gamme };
  if (r.tonique && v.demiTon !== undefined) {
    const id = idDeTonique(r.tonique.ids, v.demiTon);
    if (id !== undefined) reglages[r.tonique.reglage] = id;
  }
  const pGraine = fiche.parametres.find((p) => p.graine);
  if (pGraine) reglages[pGraine.nom] = v.graine;
  const t0 = performance.now();
  const base = { gamme, graine: v.graine, reglages, ...(v.demiTon !== undefined ? { demiTon: v.demiTon } : {}) };
  let r1 = await borne(fiche, reglages, entreesRiches(fiche, { facultatifs: agit.brancher }));
  if (r1 !== "délai" && !r1.levee && r1.valeurs.every((x) => x == null) && !agit.brancher) {
    r1 = await borne(fiche, reglages, entreesRiches(fiche, { facultatifs: true }));
  }
  const ms = performance.now() - t0;
  if (r1 === "délai") return { ...base, echec: `hors délai (${DELAI_LANCER_MS / 1000} s)`, ms };
  if (r1.levee) return { ...base, lancer: r1, echec: `a levé : ${r1.levee}`, ms };
  if (r1.erreurRendue) return { ...base, lancer: r1, echec: `rendu en erreur : ${r1.message.slice(0, 120)}`, ms };
  return { ...base, lancer: r1, ms };
}
