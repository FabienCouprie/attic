// audio/croisement-registre.ts — Confronter le relevé de croisement aux inerties et coïncidences
// inscrites, et le rendre lisible.
//
// LA DÉCISION DE FABIEN DU 2026-11-14 : une inertie légitime est DÉCLARÉE, dans la documentation du
// réglage et dans une liste que le garde consulte, et une inertie qui est un défaut se répare. Au
// lot 1, rien n'est encore tranché : tout ce que la passe relève entre dans une dette, qui ne peut
// que décroître ; le lot 3 en sort chaque ligne, déclarée avec sa raison ou réparée.
//
// UNE INSCRIPTION VAUT DANS LES DEUX SENS. Une inertie relevée qui n'est inscrite nulle part fait
// tomber le garde ; une inscription qui n'est plus vraie aussi, sans quoi elle couvrirait la
// réapparition d'une inertie au même endroit. La confrontation est une fonction pure, éprouvée sur
// des relevés d'essai, de sorte que le garde n'a pas à relancer la passe pour être prouvé.

import type { Coincidence, Inertie, RapportCroisement } from "./croisement-reglages";

/** Une inertie inscrite : un réglage, le réglage à nomenclature qui le gouverne, et sous quelles valeurs. */
export interface InertieInscrite { ou: string; sous: string; valeurs: readonly string[] | "toutes"; raison?: string }

/** Une coïncidence inscrite : des valeurs d'un réglage qui rendent les mêmes sorties. */
export interface CoincidenceInscrite { ou: string; valeurs: readonly string[]; raison?: string }

/**
 * Une condition simple : un autre réglage qui prend, ou ne prend pas, certaines valeurs ; un port
 * d'entrée laissé libre ; ou le banc lui-même, qui ne sait pas la mesurer.
 */
export type ConditionSimple =
  | { reglage: string; valeurs: readonly string[] }
  | { reglage: string; sauf: readonly string[] }
  | { port: string }
  | { banc: true };

/**
 * La vraie condition d'une inertie : une condition simple, ou plusieurs qui doivent toutes tenir
 * (`tous`), ou dont une suffit (`une`). LE LOT 3d-2 EN A MONTRÉ LE BESOIN : la graine de la
 * granulation spectrale ne tire rien quand l'extraction n'est pas aléatoire ET que la dispersion est à
 * zéro, et une condition sur un seul réglage n'aurait dit que la moitié de la vérité.
 */
export type ConditionInertie = ConditionSimple | { tous: readonly ConditionSimple[] } | { une: readonly ConditionSimple[] };

/** Les conditions simples d'une condition, pour qui doit les nommer. */
export const conditionsSimples = (c: ConditionInertie): readonly ConditionSimple[] =>
  "tous" in c ? c.tous : "une" in c ? c.une : [c];

/**
 * Une inertie déclarée par sa VRAIE CONDITION, et non par le gouverneur sous lequel la passe l'a vue.
 *
 * POURQUOI CETTE FORME, ajoutée au lot 3d (décision de Fabien du 2026-11-14). La passe fait varier un
 * gouverneur à la fois, et relève donc la même inertie sous chacun : la règle personnalisée de
 * l'automate était inscrite sous la gamme, sous la clé et sous le mode de voix, quand sa seule cause
 * est la « Règle ». Une déclaration par condition couvre chaque lancer où la condition tient, quel que
 * soit le gouverneur, et tombe dès que le réglage agit dans un lancer où elle tient.
 *
 * « non mesurable au banc » : `{ banc: true }`, pour ce qu'aucune entrée d'essai ne peut faire agir,
 * un SoundFont absent par exemple. Elle tombe dès que le réglage agit.
 */
export interface InertieConditionnee { ou: string; quand: ConditionInertie; raison: string }

/** La raison commune des bornes de modulation, déclarées par `conditionsDesBornes`. */
export const BORNE_SANS_COURBE = "une borne de modulation dit ce que vaut le zéro ou le un d'une courbe branchée sur son port, et ne sert pas sans elle ; dit dans sa documentation";

/**
 * Les inerties de chaque borne de modulation d'une fiche, sous la vraie condition de toutes : son
 * port libre.
 *
 * UNE RÈGLE ET NON TRENTE LIGNES (lot 3d-2). Une borne (`modulationDe`) ne se lit que sous une courbe
 * branchée sur le port qui module le même réglage (`module`), et la passe ne branche jamais une
 * modulation : la dette en portait trente-quatre lignes, sur sept fiches, toutes de cette nature. Le
 * lien entre une borne et son port est tenu par `plugins/modulation-ports.test.ts`. Une borne qui
 * agirait port libre ferait tomber sa déclaration, comme toute autre.
 */
export function conditionsDesBornes(fiche: {
  id: string; parametres: readonly { nom: string; modulationDe?: string }[]; entrees?: readonly { nom?: string; module?: string }[];
}): InertieConditionnee[] {
  return fiche.parametres.flatMap((p) => {
    const port = p.modulationDe ? (fiche.entrees ?? []).find((e) => e.module === p.modulationDe)?.nom : undefined;
    return port ? [{ ou: cle(fiche.id, p.nom), quand: { port }, raison: BORNE_SANS_COURBE }] : [];
  });
}

export interface Inscriptions {
  inerties: readonly InertieInscrite[];
  coincidences: readonly CoincidenceInscrite[];
  conditionnees?: readonly InertieConditionnee[];
}

/** La condition tient-elle dans le lancer où `gouverneur` vaut `valeur`, tout le reste à sa base ? */
export function conditionTient(c: ConditionInertie, r: RapportCroisement, gouverneur: string, valeur: string): boolean {
  if ("tous" in c) return c.tous.every((x) => conditionTient(x, r, gouverneur, valeur));
  if ("une" in c) return c.une.some((x) => conditionTient(x, r, gouverneur, valeur));
  if ("banc" in c) return true;
  if ("port" in c) return (r.portsLibres ?? []).includes(c.port);
  const v = c.reglage === gouverneur ? valeur : r.defauts?.[c.reglage];
  if (v === undefined) return false;
  return "valeurs" in c ? c.valeurs.includes(v) : !c.sauf.includes(v);
}

const cle = (fiche: string, reglage: string) => `${fiche}·${reglage}`;
const memeEnsemble = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Les inerties d'un relevé, regroupées par réglage et gouverneur, « toutes » quand chaque valeur offerte y est. */
export function regrouperInerties(rapports: readonly RapportCroisement[]): InertieInscrite[] {
  const groupes = new Map<string, { ou: string; sous: string; valeurs: string[]; offertes: string[] }>();
  for (const r of rapports) {
    for (const i of r.inerties) {
      const k = `${cle(i.fiche, i.reglage)}|${i.gouverneur}`;
      const g = groupes.get(k) ?? { ou: cle(i.fiche, i.reglage), sous: i.gouverneur, valeurs: [], offertes: r.valeurs[i.gouverneur] ?? [] };
      g.valeurs.push(i.valeur);
      groupes.set(k, g);
    }
  }
  return [...groupes.values()].map((g) => ({
    ou: g.ou, sous: g.sous,
    valeurs: g.offertes.length > 0 && g.offertes.every((v) => g.valeurs.includes(v)) ? "toutes" : g.valeurs,
  }));
}

/**
 * Le relevé confronté aux inscriptions : ce qui n'est inscrit nulle part, et ce qui est inscrit sans
 * plus être vrai. Seules les fiches du relevé sont jugées, une passe bornée par `CROISEMENT_FICHES`
 * ne disant rien des autres.
 */
export function confronter(rapports: readonly RapportCroisement[], inscrites: Inscriptions): { nonInscrites: string[]; perimees: string[] } {
  const lancees = new Set(rapports.map((r) => r.fiche));
  const offertes = new Map<string, string[]>();
  for (const r of rapports) for (const [g, v] of Object.entries(r.valeurs)) offertes.set(`${r.fiche}|${g}`, v);
  const inertes = new Map<string, Set<string>>();
  for (const r of rapports) {
    for (const i of r.inerties) {
      const k = `${cle(i.fiche, i.reglage)}|${i.gouverneur}`;
      inertes.set(k, (inertes.get(k) ?? new Set()).add(i.valeur));
    }
  }
  const couvre = (ins: InertieInscrite, valeur: string) => ins.valeurs === "toutes" || ins.valeurs.includes(valeur);
  const conditionnees = inscrites.conditionnees ?? [];
  const nonInscrites: string[] = [];
  const perimees: string[] = [];

  for (const r of rapports) {
    for (const i of r.inerties) {
      const ou = cle(i.fiche, i.reglage);
      const parGouverneur = inscrites.inerties.some((ins) => ins.ou === ou && ins.sous === i.gouverneur && couvre(ins, i.valeur));
      const parCondition = conditionnees.some((c) => c.ou === ou && conditionTient(c.quand, r, i.gouverneur, i.valeur));
      if (!parGouverneur && !parCondition) nonInscrites.push(`inertie : ${ou} sous ${i.gouverneur} = ${i.valeur}`);
    }
    // UNE CONDITION DÉMENTIE TOMBE : le réglage a agi dans un lancer où elle tenait.
    for (const c of conditionnees) {
      if (c.ou.split("·")[0] !== r.fiche) continue;
      for (const a of r.agissants ?? []) {
        if (cle(r.fiche, a.reglage) !== c.ou || !conditionTient(c.quand, r, a.gouverneur, a.valeur)) continue;
        perimees.push(`inertie conditionnée : ${c.ou} agit sous ${a.gouverneur} = ${a.valeur}, où sa condition tient`);
      }
    }
    for (const c of r.coincidences) {
      if (!inscrites.coincidences.some((ins) => ins.ou === cle(c.fiche, c.reglage) && memeEnsemble(ins.valeurs, c.valeurs))) {
        nonInscrites.push(`coïncidence : ${cle(c.fiche, c.reglage)} = ${c.valeurs.join(", ")}`);
      }
    }
  }
  for (const ins of inscrites.inerties) {
    const fiche = ins.ou.split("·")[0];
    if (!lancees.has(fiche)) continue;
    const vues = inertes.get(`${ins.ou}|${ins.sous}`) ?? new Set<string>();
    const attendues = ins.valeurs === "toutes" ? (offertes.get(`${fiche}|${ins.sous}`) ?? []) : ins.valeurs;
    const plusInertes = attendues.filter((v) => !vues.has(v));
    if (plusInertes.length > 0) perimees.push(`inertie : ${ins.ou} sous ${ins.sous} agit désormais sous ${plusInertes.join(", ")}`);
  }
  for (const ins of inscrites.coincidences) {
    const [fiche, reglage] = ins.ou.split("·");
    if (!lancees.has(fiche)) continue;
    const vue = rapports.some((r) => r.coincidences.some((c: Coincidence) => c.fiche === fiche && c.reglage === reglage && memeEnsemble(c.valeurs, ins.valeurs)));
    if (!vue) perimees.push(`coïncidence : ${ins.ou} = ${ins.valeurs.join(", ")} ne coïncide plus`);
  }
  return { nonInscrites, perimees };
}

/** Le relevé en texte, nœud par nœud : ce qu'on lit pour trancher. */
export function releveEnTexte(rapports: readonly RapportCroisement[]): string {
  const lignes: string[] = [];
  const lancers = rapports.reduce((s, r) => s + r.lancers, 0);
  lignes.push(`# Croisement des nomenclatures : ${rapports.length} nœuds, ${lancers} lancers`, "");
  const parReglage = regrouperInerties(rapports);
  for (const r of rapports) {
    const inerties = parReglage.filter((i) => i.ou.startsWith(`${r.fiche}·`));
    if (inerties.length === 0 && r.coincidences.length === 0 && r.echecs.length === 0) continue;
    lignes.push(`## ${r.fiche}`, "");
    for (const i of inerties) {
      lignes.push(`- inerte : ${i.ou.split("·")[1]} sous ${i.sous} = ${i.valeurs === "toutes" ? "toutes" : i.valeurs.join(", ")}`);
    }
    for (const c of r.coincidences) lignes.push(`- coïncident : ${c.reglage} = ${c.valeurs.join(", ")}${c.avecLeDefaut ? " (avec le défaut)" : ""}`);
    const raisons = new Map<string, number>();
    for (const e of r.echecs) raisons.set(e.raison.slice(0, 90), (raisons.get(e.raison.slice(0, 90)) ?? 0) + 1);
    for (const [raison, n] of raisons) lignes.push(`- échec ×${n} : ${raison}`);
    lignes.push("");
  }
  return lignes.join("\n");
}

/** Une inertie relevée, sous sa forme d'inscription. */
export const inscriptionDe = (i: Inertie): InertieInscrite => ({ ou: cle(i.fiche, i.reglage), sous: i.gouverneur, valeurs: [i.valeur] });
