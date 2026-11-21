// audio/gamme-banc-releve.ts — Le relevé du banc des gammes : mener les lancers, et l'écrire.
//
// CE QUE LE RELEVÉ FAIT, pour chaque réglage de gamme d'un nœud et chaque gamme qu'il offre : il lance
// le nœud en mi bémol et en mi, sous plusieurs graines, lit ce que chaque sortie a rendu, et juge P1 à
// P4 (`gamme-banc-proprietes.ts`). Un nœud sans tonique est lancé à la sienne, et sa tonique est
// inférée de ce qu'il a joué : P3 n'a alors pas d'objet.
//
// IL REND LES PREUVES, ET NON UN VERDICT : les premières notes fautives nommées dans la clé, l'accord
// joué contre l'accord attendu. C'est sur elles que Fabien décide de ce qui est un défaut.

import { alterationDe } from "./cles";
import type { FicheLancable, Reglages } from "./lancer-fiche";
import { lancerSousGamme, type ReglageDeGamme } from "./gamme-banc-lancer";
import { lireSorties, type PortDeSortie, type SortieLue } from "./gamme-banc-hauteurs";
import { UN_CENT, accordsSurLesDegres, couverture, horsDeLaGamme, toniqueInferee, transposition } from "./gamme-banc-proprietes";

const DIESES = ["Do", "Do♯", "Ré", "Ré♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
const BEMOLS = ["Do", "Ré♭", "Ré", "Mi♭", "Mi", "Fa", "Sol♭", "Sol", "La♭", "La", "Si♭", "Si"];

/** Une hauteur nommée dans la graphie de la tonique, octave comprise ; une fraction reste en nombre. */
export function nomNote(n: number, tonique: number): string {
  if (Math.abs(n - Math.round(n)) > 0.01) return n.toFixed(2);
  const m = Math.round(n);
  const noms = alterationDe(tonique) === "bemol" ? BEMOLS : DIESES;
  return `${noms[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Ce qu'une sortie a rendu sous une gamme, et ce que les propriétés en disent. */
export interface ReleveDeSortie {
  sortie: string;
  notes: number;
  hors: number;
  exemplesHors: string[];
  manquants: number[];
  plusRare: number;
  transposition: string | null;
  accords: number;
  accordsFautifs: string[];
  accordsNommes: string;
}

/** Le relevé d'une gamme sur un réglage de gamme. */
export interface ReleveDeGamme {
  fiche: string;
  reglage: string;
  gamme: string;
  degres: number;
  lancers: number;
  echecs: string[];
  ms: number;
  tonique: number | null;
  toniqueInferee: boolean;
  sorties: ReleveDeSortie[];
  nonLues: string[];
}

/** Ce que le relevé d'une paire reçoit de son appelant. */
export interface OptionsReleve {
  ports: readonly PortDeSortie[];
  graines: readonly number[];
  degresDe: (gamme: string) => readonly number[] | undefined;
  /**
   * Les degrés sur lesquels un accord se bâtit, sans les degrés de passage : la bebop dominante bâtit
   * ses accords sur ses sept degrés de mixolydien. Par défaut, ceux de `degresDe`.
   */
  degresDesAccords?: (gamme: string) => readonly number[] | undefined;
  /** Les toniques des lancers, en demi-tons ; mi bémol et mi par défaut, mi bémol seul pour un garde. */
  toniques?: readonly number[];
  lireNotation?: (texte: string) => Promise<unknown>;
  /**
   * Ce qu'il faut lire à la place des sorties, pour un nœud qui ne rend que du son : le MIDI qu'il a
   * remis à son moteur de rendu, capté au passage. `ports` décrit alors ces valeurs.
   */
  capture?: (valeurs: readonly unknown[]) => unknown[] | Promise<unknown[]>;
  /** La tolérance d'appartenance en demi-tons, plus large pour une hauteur mesurée dans le son. */
  tolerance?: number;
  /**
   * Pourquoi la clé ne peut pas transposer le rendu, quand c'est le cas : un nœud qui corrige ou
   * ramène une entrée fixe la rend dans une autre clé sans la déplacer. P3 est alors sans objet.
   */
  sansTransposition?: string;
  /** Des réglages posés en plus, pour que la gamme se lise : la richesse à un pour des sinus purs. */
  autres?: Reglages;
  /**
   * Le nœud ne bâtit pas d'accords sur les degrés, et P4 est sans objet : les notes qui sonnent ensemble
   * y sont des voix qui se rencontrent, les trois niveaux d'un flocon ou les cellules d'un automate.
   */
  sansAccords?: boolean;
}

const cleDe = (s: SortieLue) => (s.canal === undefined ? s.port : `${s.port}, canal ${s.canal + 1}`);
const resume = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(", ");

/** Mène le relevé d'une gamme sur un réglage de gamme d'une fiche. */
export async function releverUneGamme(fiche: FicheLancable, paire: ReglageDeGamme, gamme: string, o: OptionsReleve): Promise<ReleveDeGamme> {
  const degres = o.degresDe(gamme);
  const base = { fiche: fiche.id, reglage: paire.gamme, gamme, lancers: 0, ms: 0, sorties: [], nonLues: [] };
  if (!degres) return { ...base, degres: 0, echecs: [`« ${gamme} » n'est pas une gamme de la table`], tonique: null, toniqueInferee: false };
  const toniques: (number | undefined)[] = paire.tonique ? [...(o.toniques ?? [3, 4])] : [undefined];
  const degresAccords = o.degresDesAccords?.(gamme) ?? degres;
  const echecs = new Set<string>();
  const nonLues = new Set<string>();
  // Les sorties lues, par graine et par tonique, rangées par sortie.
  const lues = new Map<string, Map<string, SortieLue>>();
  let lancers = 0, ms = 0;
  for (const graine of o.graines) {
    for (const demiTon of toniques) {
      const l = await lancerSousGamme(fiche, paire, gamme, { graine, ...(demiTon !== undefined ? { demiTon } : {}), ...(o.autres ? { autres: o.autres } : {}) });
      lancers++; ms += l.ms;
      if (l.echec || !l.lancer) { echecs.add(l.echec ?? "aucun lancer"); continue; }
      const valeurs = o.capture ? await o.capture(l.lancer.valeurs) : l.lancer.valeurs;
      const { lues: s, nonLues: n } = await lireSorties(o.ports, valeurs, o.lireNotation);
      for (const x of n) nonLues.add(`${x.port} : ${x.raison}`);
      for (const x of s) {
        const cle = cleDe(x);
        const m = lues.get(cle) ?? new Map<string, SortieLue>();
        m.set(`${graine}|${demiTon ?? ""}`, x);
        lues.set(cle, m);
      }
    }
  }
  const toutes = [...lues.values()].flatMap((m) => [...m.values()].flatMap((s) => s.hauteurs));
  const inferee = !paire.tonique;
  // LA PREMIÈRE TONIQUE PORTE LA COUVERTURE ; la transposition se juge entre chaque tonique et celle
  // d'un demi-ton plus haut, quand les deux sont lancées : mi bémol et mi au garde, les douze à la passe
  // profonde, où si et do se comparent aussi, la classe montant d'un demi-ton par-dessus l'octave.
  const premiere = typeof toniques[0] === "number" ? toniques[0] : 3;
  const tonique = paire.tonique ? premiere : toutes.length ? toniqueInferee(toutes, degres) : null;
  const sorties: ReleveDeSortie[] = [];
  for (const [cle, m] of lues) {
    const tdl = (k: string) => (paire.tonique ? Number(k.split("|")[1]) : tonique ?? 0);
    const tol = o.tolerance ?? UN_CENT;
    const hors = [...m.entries()].flatMap(([k, s]) => horsDeLaGamme(s.hauteurs, degres, tdl(k), tol).map((h) => ({ h, t: tdl(k) })));
    const enLaPremiere = [...m.entries()].filter(([k]) => !paire.tonique || k.endsWith(`|${premiere}`)).flatMap(([, s]) => s.hauteurs);
    const cv = couverture(enLaPremiere, degres, tonique ?? 0, tol);
    let p3: string | null = null;
    if (paire.tonique && !o.sansTransposition) {
      for (const graine of o.graines) {
        for (const t of toniques) {
          if (t === undefined || !toniques.includes((t + 1) % 12)) continue;
          const bas = m.get(`${graine}|${t}`), haut = m.get(`${graine}|${(t + 1) % 12}`);
          if (!bas || !haut) { p3 = p3 ?? `graine ${graine}, de ${t} à ${t + 1} : la sortie manque sous une des deux clés`; continue; }
          const r = transposition(bas, haut, 1, tol);
          if (r.raison) { p3 = p3 ?? `graine ${graine}, de ${t} à ${(t + 1) % 12} : ${r.raison}`; }
        }
      }
    }
    let accords = 0;
    const fautifs: string[] = [];
    const nommes = new Map<string, number>();
    for (const [k, s] of o.sansAccords ? [] : m) {
      const a = accordsSurLesDegres(s.hauteurs, degresAccords, tdl(k));
      accords += a.accords;
      for (const [n, c] of a.nommes) nommes.set(n, (nommes.get(n) ?? 0) + c);
      for (const f of a.fautifs) if (fautifs.length < 5) fautifs.push(`${nomNote(f.fondamentale, tdl(k))} ${f.joue} au lieu de ${f.attendu} (${f.debut.toFixed(2)} s)`);
    }
    sorties.push({
      sortie: cle, notes: [...m.values()].reduce((a, s) => a + s.hauteurs.length, 0),
      hors: hors.length, exemplesHors: hors.slice(0, 5).map(({ h, t }) => `${nomNote(h.note, t)} à ${h.debut.toFixed(2)}`),
      manquants: cv.manquants, plusRare: cv.plusRare, transposition: p3,
      accords, accordsFautifs: fautifs, accordsNommes: resume(nommes),
    });
  }
  return { ...base, degres: degres.length, lancers, ms, echecs: [...echecs], tonique, toniqueInferee: inferee, sorties, nonLues: [...nonLues] };
}

/** Le relevé en texte : une table par nœud, puis le détail de ce qui ne tient pas. */
export function releveEnMarkdown(releves: readonly ReleveDeGamme[]): string {
  const lignes: string[] = [];
  const parReglage = new Map<string, ReleveDeGamme[]>();
  for (const r of releves) parReglage.set(`${r.fiche}·${r.reglage}`, [...(parReglage.get(`${r.fiche}·${r.reglage}`) ?? []), r]);
  lignes.push(
    "Chaque colonne compte les gammes où la propriété tombe sur au moins une sortie. P2, la couverture, n'est qu'une information : seuls les nœuds qui tirent leurs notes de toute la gamme la promettent, et leur liste reste à décider.",
    "",
    "| Réglage | Gammes | Lancers | ms par lancer | P1 hors gamme | P2 couverture incomplète | P3 la clé ne transpose pas | P4 accords fautifs | Échecs |", "|---|---|---|---|---|---|---|---|---|",
  );
  for (const [cle, rs] of parReglage) {
    const lancers = rs.reduce((a, r) => a + r.lancers, 0), ms = rs.reduce((a, r) => a + r.ms, 0);
    const n = (f: (r: ReleveDeGamme) => boolean) => rs.filter(f).length;
    lignes.push(`| ${cle} | ${rs.length} | ${lancers} | ${lancers ? Math.round(ms / lancers) : 0} | ${n((r) => r.sorties.some((s) => s.hors > 0))} | ${n((r) => r.sorties.some((s) => s.manquants.length > 0))} | ${n((r) => r.sorties.some((s) => s.transposition !== null))} | ${n((r) => r.sorties.some((s) => s.accordsFautifs.length > 0))} | ${n((r) => r.echecs.length > 0 || r.sorties.length === 0)} |`);
  }
  for (const [cle, rs] of parReglage) {
    lignes.push("", `## ${cle}`, "");
    const t = rs[0];
    if (t.toniqueInferee) lignes.push(`Pas de tonique déclarée : elle est inférée de ce que le nœud a joué.`, "");
    const nonLues = [...new Set(rs.flatMap((r) => r.nonLues))];
    if (nonLues.length) lignes.push(`Non lu : ${nonLues.join(" ; ")}`, "");
    for (const r of rs) {
      const defauts: string[] = [];
      if (r.echecs.length) defauts.push(`échecs : ${r.echecs.join(" ; ")}`);
      if (r.sorties.length === 0 && !r.echecs.length) defauts.push("aucune sortie lue");
      for (const s of r.sorties) {
        if (s.hors) defauts.push(`${s.sortie} : ${s.hors} notes hors gamme sur ${s.notes}, dont ${s.exemplesHors.join(", ")}`);
        if (s.manquants.length) defauts.push(`${s.sortie} : couverture, degrés jamais entendus ${s.manquants.map((i) => i + 1).join(", ")} sur ${r.degres}`);
        if (s.transposition) defauts.push(`${s.sortie} : ${s.transposition}`);
        if (s.accordsFautifs.length) defauts.push(`${s.sortie} : ${s.accordsFautifs.join(" ; ")}`);
        if (s.accords && (r.degres !== 7 || s.accordsFautifs.length)) defauts.push(`${s.sortie} : accords joués ${s.accordsNommes}`);
      }
      if (defauts.length) lignes.push(`- **${r.gamme}** (${r.degres} degrés) : ${defauts.join(" ; ")}`);
    }
  }
  return lignes.join("\n");
}
