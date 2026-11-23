// audio/guitare-hauteurs.ts — Ce que sonne chaque note d'une portée, lu dans le MEI que Verovio écrit.
//
// NÉ AVEC « PARTITION GUITARE », 2026-11-23. Le graveur lit l'ABC, le MusicXML, le MEI et le Humdrum,
// et rend la partition lue en MEI par `getMEI()`. Placer une note sur le manche demande sa hauteur
// réelle, et celle que Verovio calcule lui-même est fausse en deux cas, relevés le même jour :
//   - un Humdrum perd l'altération d'armure : `4f#` sous `*k[f#]` arrive sans `accid` ni `accid.ges`,
//     et Verovio le joue fa naturel ;
//   - une note liée, dans la mesure, après un dièse : `^d2- d2` se joue ré dièse, puis ré.
// La hauteur se lit donc ici, selon les règles de l'écriture, dans cet ordre :
//   1. `pname.ges` et `oct.ges`, s'il y en a, à la place de `pname` et `oct` ;
//   2. `accid.ges`, l'altération sonnante, qui l'emporte ;
//   3. `accid`, l'altération écrite, en attribut ou en élément enfant ; elle vaut ensuite pour la même
//      note à la même octave jusqu'à la barre, dans l'ordre du temps et non du document, puisque deux
//      voix d'une même portée se lisent ensemble ;
//   4. l'altération portée plus tôt dans la mesure ;
//   5. l'armure courante, d'un `scoreDef`, d'un `staffDef` ou d'un `keySig`.
// Une note liée prend la hauteur de la note où la liaison commence, et sa place sur le manche avec.
//
// SUR UNE CLÉ OCTAVIÉE, `oct` EST LA HAUTEUR RÉELLE pour Verovio, relevé le même jour : un do 4 sous la
// clé de sol à 8 en bas se joue 60 et se dessine au troisième interligne. Rien n'est donc ajouté ici.
// Les notes d'ornement sont mises à part : Verovio ne les dessine pas dans une tablature.

import type { NoteAPlacer } from "./guitare-doigte";
import { nomAnglais } from "./noms-de-notes";

/** Les altérations de MEI, en demi-tons ; un quart de ton n'est pas un nombre entier. */
const ALTERATIONS: Record<string, number> = {
  n: 0, s: 1, f: -1, ss: 2, x: 2, ff: -2, xs: 3, sx: 3, ts: 3, tf: -3, ns: 1, nf: -1,
  "1qs": 0.5, "3qs": 1.5, "1qf": -0.5, "3qf": -1.5, su: 1.5, sd: 0.5, fu: -0.5, fd: -1.5, nu: 0.5, nd: -0.5,
};
const CLASSES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DIESES = "fcgdaeb", BEMOLS = "beadgcf";

/** Une armure : l'altération de chaque nom de note. */
type Armure = Record<string, number>;

/** L'armure d'un `sig` de MEI, « 3s » ou « 2f » ; vide pour « 0 » ou une valeur inconnue. */
export function armureDe(sig: string | null): Armure {
  const m = /^(\d)([sf])$/.exec(sig ?? "");
  const armure: Armure = {};
  if (!m) return armure;
  const ordre = m[2] === "s" ? DIESES : BEMOLS;
  for (const p of ordre.slice(0, Number(m[1]))) armure[p] = m[2] === "s" ? 1 : -1;
  return armure;
}

const enfants = (e: Element, nom: string) => [...e.children].filter((c) => c.localName === nom);

/** L'armure que porte un `scoreDef`, un `staffDef` ou un `keySig`, ou null s'il n'en porte pas. */
function armurePortee(e: Element): Armure | null {
  if (e.localName === "keySig") {
    const accids = enfants(e, "keyAccid");
    if (accids.length > 0) {
      const armure: Armure = {};
      for (const k of accids) armure[k.getAttribute("pname") ?? ""] = ALTERATIONS[k.getAttribute("accid") ?? "n"] ?? 0;
      return armure;
    }
    return armureDe(e.getAttribute("sig"));
  }
  const attr = e.getAttribute("keysig") ?? e.getAttribute("key.sig");
  if (attr !== null) return armureDe(attr);
  const ks = enfants(e, "keySig")[0];
  return ks ? armurePortee(ks) : null;
}

/** Les numéros des portées, dans l'ordre du premier `scoreDef`. */
export function porteesDe(doc: Document): string[] {
  const premier = doc.getElementsByTagName("scoreDef")[0];
  return premier ? [...premier.getElementsByTagName("staffDef")].map((s) => s.getAttribute("n") ?? "").filter(Boolean) : [];
}

/** Une note d'ornement : marquée `grace`, elle ou son accord, ou dans un `graceGrp`. */
export function estOrnement(note: Element): boolean {
  for (let e: Element | null = note; e && e.localName !== "layer"; e = e.parentElement) {
    if (e.hasAttribute("grace") || e.localName === "graceGrp") return true;
  }
  return false;
}

/** L'altération écrite d'une note : son attribut, ou celui d'un élément `accid` enfant. */
function accidEcrite(note: Element, ges: boolean): string | null {
  const nom = ges ? "accid.ges" : "accid";
  if (note.hasAttribute(nom)) return note.getAttribute(nom);
  for (const a of enfants(note, "accid")) if (a.hasAttribute(nom)) return a.getAttribute(nom);
  return null;
}

export type Temps = Map<string, { debut: number; fin: number }>;
export type FauteHauteur = { raison: "microton" | "sans-temps"; nom: string; mesure: number };
export type NotesLues = { notes: NoteAPlacer[]; ornements: number; fautes: FauteHauteur[] };

/**
 * Les notes d'une portée, avec leur hauteur réelle déplacée de `octave` octaves, leurs temps pris à la
 * `timemap` de Verovio, et leur mesure ; les suites liées réunies à leur première note.
 */
export function lireNotes(doc: Document, portee: string, temps: Temps, octave: number): NotesLues {
  const fautes: FauteHauteur[] = [];
  let ornements = 0, mesure = 0;
  let armure: Armure = {};
  const lues: Lue[] = [];
  const portees = (e: Element) => enfants(e, "staff").filter((s) => s.getAttribute("n") === portee);

  const marcher = (e: Element) => {
    if (e.localName === "scoreDef") {
      const def = [...e.getElementsByTagName("staffDef")].find((s) => s.getAttribute("n") === portee);
      armure = (def && armurePortee(def)) ?? armurePortee(e) ?? armure;
      return;
    }
    if (e.localName === "measure") { lireMesure(e); return; }
    for (const c of e.children) marcher(c);
  };

  const lireMesure = (m: Element) => {
    mesure++;
    const ici: { note: Element; explicite: number | null; pname: string; oct: number; debut: number; ordre: number }[] = [];
    for (const staff of portees(m)) {
      for (const e of staff.getElementsByTagName("*")) {
        if (e.localName === "keySig") { armure = armurePortee(e) ?? armure; continue; }
        if (e.localName !== "note") continue;
        if (estOrnement(e)) { ornements++; continue; }
        const pname = (e.getAttribute("pname.ges") ?? e.getAttribute("pname") ?? "c").toLowerCase();
        const oct = Number(e.getAttribute("oct.ges") ?? e.getAttribute("oct") ?? 4);
        const ges = accidEcrite(e, true), ecrite = accidEcrite(e, false);
        const explicite = ges !== null ? ALTERATIONS[ges] ?? 0 : ecrite !== null ? ALTERATIONS[ecrite] ?? 0 : null;
        const t = temps.get(e.getAttribute("xml:id") ?? "");
        ici.push({ note: e, explicite, pname, oct, debut: t?.debut ?? Infinity, ordre: ici.length });
      }
    }
    // L'ALTÉRATION PORTÉE VA DANS L'ORDRE DU TEMPS : la seconde voix est écrite après la première dans
    // le document, et une altération de son troisième temps ne vaut pas pour le premier de l'autre.
    ici.sort((a, b) => a.debut - b.debut || a.ordre - b.ordre);
    const reportees: Record<string, number> = {};
    for (const n of ici) {
      const cle = `${n.pname}${n.oct}`;
      const alteration = n.explicite ?? reportees[cle] ?? armure[n.pname] ?? 0;
      const ecrite = accidEcrite(n.note, false);
      if (ecrite !== null) reportees[cle] = ALTERATIONS[ecrite] ?? 0;
      const midi = (n.oct + 1 + octave) * 12 + (CLASSES[n.pname] ?? 0) + alteration;
      // Un quart de ton se nomme par la note qu'il hausse ou baisse : A4 pour un la haussé d'un quart.
      const nom = nomAnglais({ lettre: n.pname.toUpperCase(), alteration: Math.trunc(alteration), octave: n.oct + octave, classe: 0 });
      const id = n.note.getAttribute("xml:id") ?? "";
      if (!Number.isInteger(alteration)) { fautes.push({ raison: "microton", nom, mesure }); continue; }
      const t = temps.get(id);
      if (!t) { fautes.push({ raison: "sans-temps", nom, mesure }); continue; }
      lues.push({
        id, midi, debut: t.debut, fin: Math.max(t.fin, t.debut + 1e-3), mesure, nom, pname: n.pname, oct: n.oct,
        tie: n.note.getAttribute("tie"), explicite: n.explicite !== null,
      });
    }
  };
  for (const c of doc.documentElement.children) marcher(c);
  return { notes: reunirLiaisons(doc, lues), ornements, fautes };
}

type Lue = {
  id: string; midi: number; debut: number; fin: number; mesure: number; nom: string;
  pname: string; oct: number; tie: string | null; explicite: boolean;
};

/**
 * Les suites liées réunies à leur première note : la note sonne de la première attaque à la fin de la
 * dernière suite, à la hauteur de la première, et chacune de ses notes prend la même place.
 *
 * LA SUITE PREND LA HAUTEUR DE LA PREMIÈRE NOTE, même au-delà de la barre où l'altération écrite
 * cesse de valoir : c'est ce que dit une liaison, une seule note tenue. Seule une altération écrite sur
 * la suite elle-même, et qui la change, en fait une autre note : la liaison n'en est plus une, et les
 * deux notes restent attaquées. Deux noms ou deux octaves différents ne se lient pas davantage.
 *
 * Deux écritures de la liaison : l'élément `<tie startid endid>`, que l'import ABC écrit sans le `#`
 * de l'adresse, et l'attribut `@tie` (i, m, t), qui lie à la note précédente de même nom et d'octave.
 */
function reunirLiaisons(doc: Document, lues: Lue[]): NoteAPlacer[] {
  const parId = new Map(lues.map((n) => [n.id, n]));
  const suite = new Map<string, string>();
  const lier = (a: Lue | undefined, b: Lue | undefined) => {
    if (a && b && a !== b && a.pname === b.pname && a.oct === b.oct && !(b.explicite && b.midi !== a.midi)) suite.set(a.id, b.id);
  };
  const sansDiese = (s: string | null) => (s ?? "").replace(/^#/, "");
  for (const t of doc.getElementsByTagName("tie")) lier(parId.get(sansDiese(t.getAttribute("startid"))), parId.get(sansDiese(t.getAttribute("endid"))));
  const ouvertes = new Map<string, Lue>();
  const parTemps = [...lues].sort((a, b) => a.debut - b.debut);
  for (const n of parTemps) {
    const cle = `${n.pname}${n.oct}`;
    if (n.tie === "m" || n.tie === "t") lier(ouvertes.get(cle), n);
    if (n.tie === "i" || n.tie === "m") ouvertes.set(cle, n); else ouvertes.delete(cle);
  }
  const suivies = new Set(suite.values());
  const notes: NoteAPlacer[] = [];
  for (const n of parTemps) {
    if (suivies.has(n.id)) continue;
    const ids = [n.id];
    let fin = n.fin;
    for (let s = suite.get(n.id); s && !ids.includes(s); s = suite.get(s)) {
      ids.push(s);
      fin = Math.max(fin, parId.get(s)!.fin);
    }
    notes.push({ ids, midi: n.midi, debut: n.debut, fin, mesure: n.mesure, nom: n.nom });
  }
  return notes;
}
