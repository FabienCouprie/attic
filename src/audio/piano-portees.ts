// audio/piano-portees.ts — Le MEI d'une partition pour piano : deux portées sous accolade, la clé de sol
// pour la main droite, la clé de fa pour la main gauche.
//
// NÉ AVEC « PARTITION PIANO », 2026-11-23. Verovio grave une double portée à partir d'un MEI : un
// `staffGrp symbol="brace" bar.thru="true"` qui porte deux `staffDef`, relevé sur la version installée,
// 6.3.0. Ce module écrit ce MEI à partir de celui que Verovio a lu et de la main de chaque note
// (`piano-mains.ts`) :
//   - TOUTES LES PORTÉES SONT RÉUNIES, décision de Fabien du 2026-11-23 : mesure par mesure, chaque
//     couche source qui a des notes pour une main devient une couche de sa portée. Ses notes de l'autre
//     main y deviennent des silences, visibles dans la première couche de la portée et des espaces dans
//     les suivantes ; un accord partagé garde ses notes de la main. Une portée sans note dans la mesure
//     reçoit un silence de mesure. Chaque voix garde ainsi sa couche, donc ses hampes ;
//   - LES CLÉS SONT FIXES, sol et fa d'un bout à l'autre, et LA HAUTEUR S'ÉCRIT RÉELLE, sans 8va,
//     décision du même jour : les changements de clé et les `octave` sont retirés, et `oct` prend la
//     hauteur réelle ;
//   - une ligature perd ses silences de tête et de queue, et se défait sous deux notes ; un n-olet reste,
//     parce qu'il donne leur durée aux notes qu'il porte ;
//   - LES ALTÉRATIONS ÉCRITES SONT RECALCULÉES PAR PORTÉE. Une note qui change de portée peut perdre
//     l'altération qui la précédait dans sa portée d'origine, ou en garder une de trop. Chacune s'écrit
//     donc selon la lecture d'un musicien : l'armure, puis l'altération portée dans la mesure, sur la
//     même portée et à la même octave ; une note liée n'en porte pas. `accid.ges` donne partout la
//     hauteur jouée ;
//   - une note d'ornement va à la main de la note qu'elle orne, et garde l'altération écrite de la
//     source : la relecture des hauteurs (`guitare-hauteurs.ts`) ne les lit pas ;
//   - une indication attachée à une note (liaison, nuance, point d'orgue) suit sa portée ; sans note,
//     elle va à la main qui joue la plupart des notes de sa portée d'origine ; un tempo et un chiffrage
//     d'accord vont au-dessus de la main droite.
// UN INSTRUMENT TRANSPOSITEUR EST ÉCRIT À LA HAUTEUR RÉELLE, par Attic et non par l'option
// `transposeToSoundingPitch` de Verovio : relevé le 2026-11-23, cette option pose sur chaque note un
// `accid.ges` de son propre calcul, et ce calcul est faux pour l'armure d'un Humdrum, pour une note
// d'accord après un dièse porté, et efface un quart de ton.
// Les identifiants restent uniques : l'original va à la première copie, celle de la main droite pour
// un accord partagé ; les autres copies n'en portent pas, et Verovio leur en donne.

import { armurePortee, CLASSES, estOrnement, porteesDe, type Armure, type Temps } from "./guitare-hauteurs";
import type { Main } from "./piano-mains";

/** Une transposition écrite : la note écrite sonne `diat` degrés et `semi` demi-tons plus loin. */
export type Transposition = { diat: number; semi: number };

export type ReglagesPiano = {
  /** La main de chaque note, par son identifiant, suites liées comprises. */
  mains: Map<string, Main>;
  /** La hauteur jouée de chaque note, en MIDI, par son identifiant. */
  hauteurs: Map<string, number>;
  /** Les suites liées : elles ne portent pas d'altération écrite. */
  suites: Set<string>;
  temps: Temps;
  /** La transposition de chaque portée d'origine qui en porte une. */
  transpositions: Map<string, Transposition>;
};

const XML = "http://www.w3.org/XML/1998/namespace";
const MAINS: readonly Main[] = ["droite", "gauche"];
const NUMERO: Record<Main, string> = { droite: "1", gauche: "2" };
const CODES: Record<number, string> = { [-3]: "tf", [-2]: "ff", [-1]: "f", 0: "n", 1: "s", 2: "ss", 3: "ts" };
const REFERENCES = ["startid", "endid", "plist"];
const SILENCES: Record<string, string> = { rest: "space", mRest: "mSpace", space: "space", mSpace: "mSpace" };
const TONALITE_METRIQUE = ["key.sig", "keysig", "key.mode", "key.pname", "key.accid", "meter.count", "meter.unit", "meter.sym"];

const NOMS = "cdefgab";

const enfants = (e: Element, nom?: string) => [...e.children].filter((c) => !nom || c.localName === nom);
const idDe = (e: Element) => e.getAttribute("xml:id") ?? "";
const sansDiese = (s: string) => s.replace(/^#/, "");
const sonne = (e: Element) => e.localName === "note" || e.localName === "chord" || e.getElementsByTagName("note").length > 0;
const hauteurEcrite = (n: Element) => (Number(n.getAttribute("oct") ?? 4) + 1) * 12 + (CLASSES[(n.getAttribute("pname") ?? "c").toLowerCase()] ?? 0);

/** La voix de chaque note : la portée et la couche d'où elle vient, « 2/1 ». */
export function voixDesNotes(doc: Document): Map<string, string> {
  const voix = new Map<string, string>();
  for (const staff of doc.getElementsByTagName("staff")) {
    for (const couche of enfants(staff, "layer")) {
      const v = `${staff.getAttribute("n")}/${couche.getAttribute("n") ?? "1"}`;
      for (const n of couche.getElementsByTagName("note")) voix.set(idDe(n), v);
    }
  }
  return voix;
}

/** Le MEI de la partition pour piano, prêt à graver. */
export function ecrirePiano(doc: Document, r: ReglagesPiano): string {
  const ns = doc.documentElement.namespaceURI;
  const creer = (nom: string, attributs: Record<string, string | number> = {}) => {
    const e = doc.createElementNS(ns, nom);
    for (const [k, v] of Object.entries(attributs)) e.setAttribute(k, String(v));
    return e;
  };
  const portees = porteesDe(doc);
  const premiere = portees[0];

  // Ce qui se lit avant de réécrire : la voix de chaque note, la main de chaque ornement, l'armure de
  // chaque mesure, la main qui joue le plus de notes de chaque portée d'origine.
  hauteursReelles(doc);
  versLeReel(doc, r.transpositions);
  const voix = voixDesNotes(doc);
  const ornements = mainsDesOrnements(doc, r.mains);
  const armures = armuresDesMesures(doc, premiere);
  const majorite = new Map<string, Main>();
  for (const p of portees) {
    const mains = [...voix].filter(([, v]) => v.startsWith(`${p}/`)).map(([id]) => r.mains.get(id));
    majorite.set(p, mains.filter((m) => m === "gauche").length > mains.filter((m) => m === "droite").length ? "gauche" : "droite");
  }
  const mainDe = (n: Element): Main | undefined => (estOrnement(n) ? ornements : r.mains).get(idDe(n));

  definitions(doc, premiere, creer);
  const pris = new Set<string>();
  for (const mesure of [...doc.getElementsByTagName("measure")]) {
    const sources = enfants(mesure, "staff").filter((s) => portees.includes(s.getAttribute("n") ?? ""));
    if (sources.length === 0) continue;
    const couches = sources.flatMap((s) => enfants(s, "layer"));
    const nouvelles = MAINS.map((main) => portee(couches, main));
    sources[0].before(...nouvelles);
    for (const s of sources) s.remove();
    for (const s of nouvelles) alterations(s, armures.get(mesure) ?? {});
  }
  rattacher(doc, majorite);
  return new XMLSerializer().serializeToString(doc);

  /** La portée d'une main dans une mesure : une couche par couche source qui a des notes pour elle. */
  function portee(couches: Element[], main: Main): Element {
    const staff = creer("staff", { n: NUMERO[main] });
    const gardees = couches.filter((c) => [...c.getElementsByTagName("note")].some((n) => mainDe(n) === main));
    if (gardees.length === 0) {
      const multi = couches.flatMap((c) => enfants(c, "multiRest"))[0];
      const couche = creer("layer", { n: 1 });
      couche.append(multi ? cloner(multi) : creer("mRest"));
      staff.append(couche);
      return staff;
    }
    gardees.forEach((c, k) => {
      const couche = creer("layer", { n: k + 1 });
      for (const e of enfants(c)) couche.append(...copie(e, main, k === 0));
      staff.append(couche);
    });
    return staff;
  }

  /** Un élément de couche pour une main : ses notes, des silences à la place des autres. */
  function copie(e: Element, main: Main, visible: boolean): Element[] {
    const nom = e.localName;
    if (nom === "note" || nom === "chord") {
      const notes = nom === "note" ? [e] : enfants(e, "note");
      const miennes = notes.filter((n) => mainDe(n) === main);
      if (miennes.length === 0) return estOrnement(e) ? [] : [creer(visible ? "rest" : "space", attributsDe(e, ["dur", "dots"]))];
      if (nom === "note") return [cloner(e)];
      const accord = coquille(e);
      for (const x of enfants(e)) if (x.localName !== "note" || miennes.includes(x)) accord.append(cloner(x));
      return [accord];
    }
    if (nom in SILENCES) return [visible ? cloner(e) : creer(SILENCES[nom], attributsDe(e, ["dur", "dots"]))];
    if (nom === "clef" || nom === "clefGrp") return [];
    const dedans = enfants(e).flatMap((x) => copie(x, main, visible));
    if (nom === "beam") {
      let debut = 0, fin = dedans.length;
      while (debut < fin && !sonne(dedans[debut])) debut++;
      while (fin > debut && !sonne(dedans[fin - 1])) fin--;
      if (dedans.slice(debut, fin).filter(sonne).length < 2) return dedans;
      const ligature = coquille(e);
      ligature.append(...dedans.slice(debut, fin));
      return [...dedans.slice(0, debut), ligature, ...dedans.slice(fin)];
    }
    if (nom === "tuplet") {
      const nolet = coquille(e);
      nolet.append(...dedans);
      if (!visible && !dedans.some(sonne)) { nolet.setAttribute("num.visible", "false"); nolet.setAttribute("bracket.visible", "false"); }
      return [nolet];
    }
    if (e.children.length === 0) return [cloner(e)];
    // Un groupe d'ornements, un trémolo : gardé s'il porte encore une note, sinon ce qu'il contient.
    if (!dedans.some(sonne)) return dedans;
    const groupe = coquille(e);
    groupe.append(...dedans);
    return [groupe];
  }

  /** Une copie entière ; ses identifiants déjà pris sont retirés. */
  function cloner(e: Element): Element {
    const c = e.cloneNode(true) as Element;
    for (const x of [c, ...c.getElementsByTagName("*")]) garderId(x);
    return c;
  }

  /** Une copie de l'élément seul, sans ses enfants. */
  function coquille(e: Element): Element {
    const c = e.cloneNode(false) as Element;
    garderId(c);
    return c;
  }

  function garderId(x: Element): void {
    const id = idDe(x);
    if (!id) return;
    if (pris.has(id)) x.removeAttributeNS(XML, "id");
    else pris.add(id);
  }

  /** Les altérations écrites d'une portée, recalculées dans l'ordre du temps. */
  function alterations(staff: Element, armure: Armure): void {
    const notes = [...staff.getElementsByTagName("note")]
      .map((n, ordre) => ({ n, ordre, debut: r.temps.get(idDe(n))?.debut ?? Infinity }))
      .filter(({ n }) => !estOrnement(n) && r.hauteurs.has(idDe(n)))
      .sort((a, b) => a.debut - b.debut || a.ordre - b.ordre);
    const portees: Record<string, number> = {};
    for (const { n } of notes) {
      const pname = (n.getAttribute("pname") ?? "c").toLowerCase(), oct = n.getAttribute("oct") ?? "4";
      const alteration = r.hauteurs.get(idDe(n))! - hauteurEcrite(n);
      n.removeAttribute("accid");
      for (const a of enfants(n, "accid")) a.remove();
      n.setAttribute("accid.ges", CODES[alteration] ?? "n");
      if (r.suites.has(idDe(n))) continue;
      const cle = `${pname}${oct}`;
      if (alteration !== (portees[cle] ?? armure[pname] ?? 0)) {
        n.setAttribute("accid", CODES[alteration] ?? "n");
        portees[cle] = alteration;
      }
    }
  }
}

/** La hauteur réelle écrite : `oct` et `pname` prennent `oct.ges` et `pname.ges` ; hampes et portées croisées oubliées. */
function hauteursReelles(doc: Document): void {
  for (const e of [...doc.getElementsByTagName("*")]) {
    if (e.localName === "note") {
      for (const [ges, ecrit] of [["oct.ges", "oct"], ["pname.ges", "pname"]]) {
        if (e.hasAttribute(ges)) { e.setAttribute(ecrit, e.getAttribute(ges)!); e.removeAttribute(ges); }
      }
    }
    if (["note", "chord", "rest", "space"].includes(e.localName)) for (const a of ["stem.dir", "staff", "layer", "dur.ppq"]) e.removeAttribute(a);
  }
}

/**
 * La transposition de chaque portée qui en porte une, lue dans la première définition. Verovio garde la
 * hauteur écrite d'un instrument transpositeur, et pose `trans.diat` et `trans.semi` sur sa portée :
 * une clarinette en si♭ écrit ré 5 et porte −1 et −2, elle joue do 5.
 */
export function transpositionsDe(doc: Document): Map<string, Transposition> {
  const transpositions = new Map<string, Transposition>();
  for (const def of doc.getElementsByTagName("scoreDef")[0]?.getElementsByTagName("staffDef") ?? []) {
    const diat = Number(def.getAttribute("trans.diat") ?? 0), semi = Number(def.getAttribute("trans.semi") ?? 0);
    if (diat !== 0 || semi !== 0) transpositions.set(def.getAttribute("n") ?? "", { diat, semi });
  }
  return transpositions;
}

/**
 * Chaque portée transpositrice écrite à la hauteur réelle : ses notes se déplacent d'autant de degrés, son
 * armure d'autant de quintes, 7 par demi-ton moins 12 par degré ; l'altération suit, recalculée.
 */
function versLeReel(doc: Document, transpositions: Map<string, Transposition>): void {
  if (transpositions.size === 0) return;
  const armure = (sig: string | null, t: Transposition) => {
    const m = /^(\d)([sf])$/.exec(sig ?? "");
    const q = Math.max(-7, Math.min(7, (m ? Number(m[1]) * (m[2] === "s" ? 1 : -1) : 0) + 7 * t.semi - 12 * t.diat));
    return q === 0 ? "0" : `${Math.abs(q)}${q > 0 ? "s" : "f"}`;
  };
  for (const def of [...doc.getElementsByTagName("staffDef")]) {
    const t = transpositions.get(def.getAttribute("n") ?? "");
    if (!t) continue;
    for (const a of ["keysig", "key.sig"]) if (def.hasAttribute(a)) def.setAttribute(a, armure(def.getAttribute(a), t));
    for (const k of enfants(def, "keySig")) k.setAttribute("sig", armure(k.getAttribute("sig"), t));
    def.removeAttribute("trans.diat");
    def.removeAttribute("trans.semi");
  }
  for (const staff of doc.getElementsByTagName("staff")) {
    const t = transpositions.get(staff.getAttribute("n") ?? "");
    if (!t) continue;
    for (const e of staff.getElementsByTagName("*")) {
      if (e.localName === "keySig") e.setAttribute("sig", armure(e.getAttribute("sig"), t));
      if (e.localName !== "note") continue;
      const rang = NOMS.indexOf((e.getAttribute("pname") ?? "c").toLowerCase()) + t.diat;
      e.setAttribute("pname", NOMS[((rang % 7) + 7) % 7]);
      e.setAttribute("oct", String(Number(e.getAttribute("oct") ?? 4) + Math.floor(rang / 7)));
    }
  }
}

/**
 * La main de chaque note d'ornement : celle de la note qu'elle orne, la suivante dans sa couche ; dans
 * un accord partagé, celle de la note la plus proche. Sans note après elle, celle de la note d'avant.
 */
function mainsDesOrnements(doc: Document, mains: Map<string, Main>): Map<string, Main> {
  const rendu = new Map<string, Main>();
  for (const couche of doc.getElementsByTagName("layer")) {
    const notes = [...couche.getElementsByTagName("note")];
    notes.forEach((n, i) => {
      if (!estOrnement(n)) return;
      const ornee = notes.slice(i + 1).find((x) => !estOrnement(x)) ?? notes.slice(0, i).reverse().find((x) => !estOrnement(x));
      if (!ornee) { rendu.set(idDe(n), hauteurEcrite(n) >= 60 ? "droite" : "gauche"); return; }
      const parent = ornee.parentElement;
      const voisines = parent?.localName === "chord" ? enfants(parent, "note") : [ornee];
      let proche = voisines[0];
      for (const v of voisines) if (Math.abs(hauteurEcrite(v) - hauteurEcrite(n)) < Math.abs(hauteurEcrite(proche) - hauteurEcrite(n))) proche = v;
      rendu.set(idDe(n), mains.get(idDe(proche)) ?? "droite");
    });
  }
  return rendu;
}

/** L'armure de chaque mesure, lue sur la première portée : ses définitions, et un changement dans la mesure. */
function armuresDesMesures(doc: Document, premiere: string): Map<Element, Armure> {
  const armures = new Map<Element, Armure>();
  let armure: Armure = {};
  const marcher = (e: Element) => {
    if (e.localName === "scoreDef" || e.localName === "staffDef") {
      const def = e.localName === "staffDef" ? (e.getAttribute("n") === premiere ? e : null)
        : [...e.getElementsByTagName("staffDef")].find((s) => s.getAttribute("n") === premiere);
      armure = (def && armurePortee(def)) ?? (e.localName === "scoreDef" ? armurePortee(e) : null) ?? armure;
      return;
    }
    if (e.localName === "measure") {
      const staff = enfants(e, "staff").find((s) => s.getAttribute("n") === premiere);
      for (const k of staff?.getElementsByTagName("keySig") ?? []) armure = armurePortee(k) ?? armure;
      armures.set(e, armure);
      return;
    }
    for (const c of e.children) marcher(c);
  };
  marcher(doc.documentElement);
  return armures;
}

/**
 * Les définitions : la première porte l'accolade et les deux portées, sol et fa ; chacune prend la
 * tonalité et la métrique de la première portée d'origine. Un changement en cours de pièce ne garde
 * qu'elles, sur les deux portées.
 */
function definitions(doc: Document, premiere: string, creer: (nom: string, a?: Record<string, string | number>) => Element): void {
  const scoreDefs = [...doc.getElementsByTagName("scoreDef")];
  const pour = (def: Element | undefined, rang: number) => {
    const groupe = creer("staffGrp", rang === 0 ? { symbol: "brace", "bar.thru": "true" } : {});
    for (const main of MAINS) {
      const d = creer("staffDef", { n: NUMERO[main], ...(rang === 0 ? { lines: 5 } : {}) });
      if (rang === 0) d.append(creer("clef", main === "droite" ? { shape: "G", line: 2 } : { shape: "F", line: 4 }));
      if (def) {
        for (const [k, v] of Object.entries(attributsDe(def, TONALITE_METRIQUE))) d.setAttribute(k, v);
        for (const s of enfants(def)) if (s.localName === "keySig" || s.localName === "meterSig") d.append(copieSansId(s));
      }
      groupe.append(d);
    }
    return groupe;
  };
  const utile = (g: Element) => [...g.children].some((d) => d.attributes.length > 1 || d.children.length > 0);
  scoreDefs.forEach((sd, rang) => {
    const def = [...sd.getElementsByTagName("staffDef")].find((s) => s.getAttribute("n") === premiere);
    const groupe = pour(def, rang);
    for (const g of enfants(sd, "staffGrp")) g.remove();
    for (const d of enfants(sd, "staffDef")) d.remove();
    if (rang === 0 || utile(groupe)) sd.append(groupe);
  });
  // Une définition hors d'un `scoreDef`, entre deux mesures : sa tonalité et sa métrique, sur les deux portées.
  for (const def of [...doc.getElementsByTagName("staffDef")]) {
    if (def.parentElement?.closest("scoreDef") || def.parentElement?.localName === "staffGrp") continue;
    if (def.getAttribute("n") === premiere) {
      const groupe = pour(def, 1);
      if (utile(groupe)) def.before(...enfants(groupe));
    }
    def.remove();
  }
}

/**
 * Ce qui se rattache aux portées : une indication suit la portée de la note où elle commence, sinon la
 * main qui joue le plus de notes de sa portée d'origine. Tempo et chiffrage d'accord au-dessus de la main
 * droite ; les lignes d'octave, retirées.
 */
function rattacher(doc: Document, majorite: Map<string, Main>): void {
  const porteeDe = new Map<string, string>();
  for (const staff of doc.getElementsByTagName("staff")) {
    for (const x of staff.getElementsByTagName("*")) if (idDe(x)) porteeDe.set(idDe(x), staff.getAttribute("n") ?? "1");
  }
  for (const mesure of [...doc.getElementsByTagName("measure")]) {
    for (const e of enfants(mesure)) {
      if (e.localName === "staff") continue;
      if (e.localName === "octave") { e.remove(); continue; }
      if (e.localName === "tempo" || e.localName === "harm") { if (e.hasAttribute("staff")) e.setAttribute("staff", "1"); continue; }
      const debut = REFERENCES.map((a) => sansDiese((e.getAttribute(a) ?? "").split(/\s+/)[0] ?? "")).find((id) => porteeDe.has(id));
      if (debut) { e.setAttribute("staff", porteeDe.get(debut)!); continue; }
      const anciennes = (e.getAttribute("staff") ?? "").split(/\s+/).filter(Boolean);
      if (anciennes.length > 0) e.setAttribute("staff", [...new Set(anciennes.map((s) => NUMERO[majorite.get(s) ?? "droite"]))].join(" "));
    }
  }
}

function attributsDe(e: Element, noms: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const n of noms) if (e.hasAttribute(n)) r[n] = e.getAttribute(n)!;
  return r;
}

/** Une copie dont les adresses sont retirées : deux éléments ne portent jamais la même. */
function copieSansId(e: Element): Element {
  const copie = e.cloneNode(true) as Element;
  for (const x of [copie, ...copie.getElementsByTagName("*")]) x.removeAttributeNS(XML, "id");
  return copie;
}
