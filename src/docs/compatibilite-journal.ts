// src/docs/compatibilite-journal.ts — Le journal des ruptures déclarées, et ce qu'il doit être.
//
// ═══ POURQUOI UN JOURNAL, ET NON UNE EXEMPTION ═══
//
// Quatre ruptures ont une migration dans le code, et la poser les rend compatibles : `nomsHerites`
// pour un réglage renommé, `optionsHeritees` pour une valeur de choix retirée, `anciensReglages`
// pour un réglage que l'exécuteur relit encore, la table `ALIAS` pour un composant retiré. Les
// autres n'en ont aucune et n'en auront pas : un défaut changé, un type changé, un port déplacé.
// Celles-là ne se réparent pas, elles se DÉCIDENT, et le journal est l'endroit où la décision est
// écrite, avec ce qu'un graphe enregistré y perd.
//
// UNE DÉCLARATION FAIT MONTER LA VERSION DE CONTRAT DU COMPOSANT. C'est ce qui donne un sens au
// numéro : la version 3 d'un composant est celle qui a connu deux ruptures acceptées, et le journal
// dit lesquelles. Une déclaration n'est jamais retirée : la version redescendrait, et un graphe qui
// la porte mentirait.
//
// UNE DÉCLARATION EST « EN ATTENTE » tant que le manifeste versionné porte une version plus basse :
// elle doit alors couvrir EXACTEMENT les ruptures que le garde trouve, ni moins, ni plus. Régénérer
// le manifeste la fait passer à l'histoire.
import type { Ecart } from "./compatibilite-ecarts";
import type { Manifeste } from "./compatibilite";

export interface Declaration {
  composant: string;
  /** La version de contrat que cette rupture ouvre : deux pour la première. */
  version: number;
  /** AAAA-MM-JJ. */
  date: string;
  /** Les ruptures, chacune sous le texte exact que le garde lui donne. */
  ruptures: string[];
  /** Ce qu'un graphe enregistré y perd ou y change, et pourquoi c'est accepté. */
  raison: string;
}

export interface Journal { forme: 1; declarations: Declaration[] }

/** Le plus court d'une raison : une raison de vingt caractères n'en dit pas assez pour être relue. */
export const RAISON_MINIMALE = 40;

/** Ce que le modèle de déclaration propose, et qu'une déclaration recopiée sans être écrite garderait. */
export const RAISON_A_ECRIRE = "ce qu'un graphe enregistré y perd ou y change, et pourquoi c'est accepté";

/** Lit le journal, et refuse une forme qu'il ne connaît pas plutôt que de la deviner. */
export function lireJournal(texte: string): Journal {
  const brut = JSON.parse(texte) as Partial<Journal>;
  if (brut.forme !== 1 || !Array.isArray(brut.declarations)) {
    throw new Error("ruptures-declarees.json : forme inconnue, il faut { \"forme\": 1, \"declarations\": [] }");
  }
  return brut as Journal;
}

/** La dernière version déclarée de chaque composant que le journal nomme. */
export function versionsDuJournal(journal: Journal): Map<string, number> {
  const versions = new Map<string, number>();
  for (const d of journal.declarations) {
    if (Number.isInteger(d.version)) versions.set(d.composant, Math.max(versions.get(d.composant) ?? 1, d.version));
  }
  return versions;
}

export interface VerdictDuJournal {
  /** Les ruptures qu'aucune déclaration en attente ne couvre. */
  nonDeclarees: Ecart[];
  /** Ce que le journal a de faux : forme, versions, déclaration sans objet. */
  problemes: string[];
}

function fauteDeForme(d: Declaration): string | null {
  if (typeof d.composant !== "string" || d.composant === "") return "sans composant";
  if (!Number.isInteger(d.version) || d.version < 2) return "version absente, ou inférieure à deux";
  if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return "date absente, ou hors de la forme AAAA-MM-JJ";
  if (!Array.isArray(d.ruptures) || d.ruptures.length === 0 || d.ruptures.some((r) => typeof r !== "string")) {
    return "sans liste de ruptures";
  }
  if (typeof d.raison !== "string" || d.raison.trim().length < RAISON_MINIMALE) {
    return `raison absente, ou de moins de ${RAISON_MINIMALE} caractères`;
  }
  if (d.raison.trim() === RAISON_A_ECRIRE) return "la raison est celle du modèle, recopiée sans être écrite";
  return null;
}

/**
 * Le journal confronté au manifeste versionné et aux ruptures que le garde vient de trouver.
 *
 * `fichier` est le manifeste versionné, celui que les ruptures séparent du registre.
 */
export function verifierJournal(journal: Journal, fichier: Manifeste, ruptures: Ecart[]): VerdictDuJournal {
  const problemes: string[] = [];
  const versionDuFichier = (id: string) => fichier.composants[id]?.version ?? fichier.retires[id]?.version;
  const derniere = new Map<string, number>();
  const enAttente = new Map<string, Declaration>();
  journal.declarations.forEach((d, i) => {
    const nom = `déclaration ${i + 1} (« ${String(d.composant)} », version ${String(d.version)})`;
    const forme = fauteDeForme(d);
    if (forme) { problemes.push(`${nom} : ${forme}`); return; }
    const attendue = (derniere.get(d.composant) ?? 1) + 1;
    if (d.version !== attendue) problemes.push(`${nom} : la version attendue était ${attendue}, les versions d'un composant se suivent`);
    derniere.set(d.composant, d.version);
    const v = versionDuFichier(d.composant);
    if (v === undefined) {
      problemes.push(`${nom} : le manifeste versionné ne connaît pas ce composant, et un composant neuf n'a rien à rompre`);
      return;
    }
    if (d.version <= v) return;
    if (enAttente.has(d.composant)) problemes.push(`${nom} : une seule déclaration en attente par composant, réunir les ruptures dans la première`);
    else enAttente.set(d.composant, d);
  });
  for (const id of [...Object.keys(fichier.composants), ...Object.keys(fichier.retires)]) {
    const v = versionDuFichier(id)!;
    const max = derniere.get(id) ?? 1;
    if (v > max) {
      problemes.push(`« ${id} » est à la version ${v} dans le manifeste, et le journal s'arrête à ${max} : une déclaration en a été retirée`);
    }
  }
  const nonDeclarees: Ecart[] = [];
  const parComposant = new Map<string, Ecart[]>();
  for (const r of ruptures) parComposant.set(r.composant, [...(parComposant.get(r.composant) ?? []), r]);
  for (const [id, liste] of parComposant) {
    const d = enAttente.get(id);
    for (const r of liste) if (!d?.ruptures.includes(r.texte)) nonDeclarees.push(r);
  }
  for (const [id, d] of enAttente) {
    const textes = new Set((parComposant.get(id) ?? []).map((r) => r.texte));
    for (const t of d.ruptures) {
      if (!textes.has(t)) problemes.push(`la déclaration version ${d.version} de « ${id} » nomme une rupture qui n'a pas lieu : « ${t} »`);
    }
  }
  return { nonDeclarees, problemes };
}

/** La déclaration à recopier dans le journal pour les ruptures d'un composant, à compléter de sa raison. */
export function modeleDeDeclaration(id: string, version: number, ruptures: string[], date: string): string {
  return JSON.stringify({ composant: id, version, date, ruptures, raison: RAISON_A_ECRIRE }, null, 1);
}
