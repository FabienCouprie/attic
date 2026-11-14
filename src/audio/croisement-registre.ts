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

export interface Inscriptions { inerties: readonly InertieInscrite[]; coincidences: readonly CoincidenceInscrite[] }

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
  const nonInscrites: string[] = [];
  const perimees: string[] = [];

  for (const r of rapports) {
    for (const i of r.inerties) {
      if (!inscrites.inerties.some((ins) => ins.ou === cle(i.fiche, i.reglage) && ins.sous === i.gouverneur && couvre(ins, i.valeur))) {
        nonInscrites.push(`inertie : ${cle(i.fiche, i.reglage)} sous ${i.gouverneur} = ${i.valeur}`);
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
