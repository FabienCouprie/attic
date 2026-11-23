// audio/guitare-tablature.ts — Le MEI d'une partition pour guitare : la portée choisie en clé de sol
// octaviée, et sa tablature.
//
// NÉ AVEC « PARTITION GUITARE », 2026-11-23. Verovio grave une tablature de guitare à partir d'un MEI :
// une portée `notationtype="tab.guitar"` dont chaque note porte sa corde (`tab.course`, 1 la plus
// aiguë) et sa case (`tab.fret`), groupées par instant dans un `tabGrp` qui porte la durée. Relevé dans
// l'application le même jour, sur la version installée, 6.3.0 : il grave les cases sur six ou sept
// lignes, la clé TAB, les hampes de durée par `tabDurSym`, les ligatures, les n-olets, les silences,
// la liaison et deux voix. Il ignore un `tabGrp` dans un `graceGrp`.
//
// CE QUE CE MODULE ÉCRIT, à partir du MEI que Verovio a lu et des places du doigté :
//   - la seule portée choisie, renumérotée ; les autres et ce qui s'y rattache sont retirés ;
//   - la portée de guitare en clé de sol à 8 en bas, sans changement de clé, ses notes déplacées des
//     octaves demandées. Verovio lit `oct` comme la hauteur réelle et l'écrit une octave plus haut ;
//   - la tablature, couche par couche en miroir de la portée : une note ou un accord devient un
//     `tabGrp` ; les ligatures et les n-olets restent ; les notes d'ornement sont retirées ;
//   - avec la portée, la tablature n'a que les cases : le rythme se lit sur la portée, et un silence y
//     devient un espace. Seule, elle porte ses hampes, ses silences et les indications de la portée ;
//   - « Capo n » et un accordage autre que le standard, gravés au-dessus de la première mesure.
//
// DÉCISIONS DE FABIEN du 2026-11-23 : l'affichage, « Portée et tablature » ou « Tablature » ; une
// seule portée transcrite, choisie par le réglage « Portée » ; les notes d'ornement absentes de la
// tablature, et dites.

import type { Place } from "./guitare-doigte";
import { lireNomDeNote } from "./noms-de-notes";
import { nomNoteRond } from "./nom-note";

export type ReglagesTablature = {
  /** Le numéro, dans le MEI lu, de la portée transcrite. */
  portee: string;
  places: Map<string, Place>;
  /** Les cordes à vide sous le capodastre, du grave à l'aigu, en hauteurs MIDI. */
  cordesSonnantes: readonly number[];
  tablatureSeule: boolean;
  octave: number;
  /** Le texte gravé au-dessus de la première mesure, ou null. */
  indication: string | null;
};

const XML = "http://www.w3.org/XML/1998/namespace";
const enfants = (e: Element, nom?: string) => [...e.children].filter((c) => !nom || c.localName === nom);
const idDe = (e: Element) => e.getAttribute("xml:id") ?? "";
const sansDiese = (s: string) => s.replace(/^#/, "");
/** Les attributs qui désignent d'autres éléments par leur adresse. */
const REFERENCES = ["startid", "endid", "plist"];
/** Les éléments de couche que la tablature recopie à l'identique, ou en espace quand la portée est là. */
const SILENCES: Record<string, string> = { rest: "space", mRest: "mSpace", space: "space", mSpace: "mSpace", multiRest: "multiRest" };

/** Le MEI de la partition pour guitare, prêt à graver. */
export function ecrireTablature(doc: Document, r: ReglagesTablature): string {
  const ns = doc.documentElement.namespaceURI;
  const creer = (nom: string, attributs: Record<string, string | number> = {}, id?: string) => {
    const e = doc.createElementNS(ns, nom);
    for (const [k, v] of Object.entries(attributs)) e.setAttribute(k, String(v));
    if (id) e.setAttributeNS(XML, "xml:id", id);
    return e;
  };
  const guitare = "1", tab = r.tablatureSeule ? "1" : "2";

  garderLaPortee(doc, r.portee);
  for (const def of [...doc.getElementsByTagName("staffDef")]) preparerPorteeGuitare(def, creer);
  for (const staff of [...doc.getElementsByTagName("staff")]) {
    for (const e of [...staff.getElementsByTagName("*")]) {
      if (e.localName === "clef" || e.localName === "clefGrp") e.remove();
      if (e.localName === "note" && r.octave !== 0) {
        for (const a of ["oct", "oct.ges"]) if (e.hasAttribute(a)) e.setAttribute(a, String(Number(e.getAttribute(a)) + r.octave));
      }
    }
  }

  // La portée de tablature, à côté de la portée de guitare, dans chaque définition qui la nomme.
  const scoreDefs = [...doc.getElementsByTagName("scoreDef")];
  scoreDefs.forEach((sd, rang) => {
    for (const def of [...sd.getElementsByTagName("staffDef")]) {
      const tabDef = rang === 0 ? definitionTablature(def, r.cordesSonnantes, tab, creer) : changementTablature(def, tab, creer);
      if (!tabDef) continue;
      def.after(tabDef);
      if (r.tablatureSeule) def.remove();
      else if (def.parentElement?.localName === "staffGrp") def.parentElement.setAttribute("symbol", "bracket");
    }
  });

  // Chaque mesure : la tablature en miroir de la portée, puis ce qui s'y rattache.
  const nouveaux = new Map<string, string>();
  for (const mesure of [...doc.getElementsByTagName("measure")]) {
    const staff = enfants(mesure, "staff").find((s) => s.getAttribute("n") === guitare);
    if (!staff) continue;
    const staffTab = creer("staff", { n: tab });
    for (const couche of enfants(staff, "layer")) {
      const coucheTab = creer("layer", { n: couche.getAttribute("n") ?? "1" });
      for (const e of enfants(couche)) for (const m of miroir(e)) coucheTab.append(m);
      staffTab.append(coucheTab);
    }
    staff.after(staffTab);
    if (r.tablatureSeule) staff.remove();
  }
  for (const mesure of [...doc.getElementsByTagName("measure")]) rattacher(mesure);
  if (r.indication) {
    const premiere = doc.getElementsByTagName("measure")[0];
    const dir = creer("dir", { place: "above", staff: "1", tstamp: "1" }, "indication-guitare");
    dir.textContent = r.indication;
    premiere?.append(dir);
  }
  return new XMLSerializer().serializeToString(doc);

  /** Une note ou un accord en `tabGrp`, un silence recopié ou en espace ; les ornements retirés. */
  function miroir(e: Element): Element[] {
    if (e.hasAttribute("grace") || e.localName === "graceGrp") return [];
    if (e.localName === "note" || e.localName === "chord") {
      const notes = e.localName === "note" ? [e] : enfants(e, "note");
      const grp = creer("tabGrp", duree(e), `tg-${idDe(e)}`);
      nouveaux.set(idDe(e), `tg-${idDe(e)}`);
      if (r.tablatureSeule) grp.append(creer("tabDurSym"));
      for (const n of notes) {
        const p = r.places.get(idDe(n));
        if (!p) continue;
        const attributs: Record<string, string | number> = { "tab.course": p.corde, "tab.fret": p.frette };
        if (n.hasAttribute("tie")) attributs.tie = n.getAttribute("tie")!;
        grp.append(creer("note", attributs, `t-${idDe(n)}`));
        nouveaux.set(idDe(n), `t-${idDe(n)}`);
      }
      // Un groupe sans note placée garde sa durée, en espace : la mesure doit rester entière.
      if (grp.getElementsByTagName("note").length === 0) { nouveaux.delete(idDe(e)); return [creer("space", duree(e))]; }
      return [grp];
    }
    if (e.localName in SILENCES) {
      const nom = r.tablatureSeule ? e.localName : SILENCES[e.localName];
      const copie = creer(nom, duree(e), `t-${idDe(e)}`);
      if (e.hasAttribute("num")) copie.setAttribute("num", e.getAttribute("num")!);
      nouveaux.set(idDe(e), `t-${idDe(e)}`);
      return [copie];
    }
    if (e.localName === "beam" || e.localName === "tuplet") {
      const enfantsTab = enfants(e).flatMap(miroir);
      // Avec la portée, la tablature ne porte pas de rythme : ni ligature, ni chiffre de n-olet. Le
      // n-olet reste, invisible, parce qu'il donne leur durée aux notes qu'il porte.
      if (e.localName === "beam" && !r.tablatureSeule) return enfantsTab;
      const groupe = creer(e.localName, attributsDe(e, ["num", "numbase", "num.place", "bracket.place"]));
      if (!r.tablatureSeule) { groupe.setAttribute("num.visible", "false"); groupe.setAttribute("bracket.visible", "false"); }
      groupe.append(...enfantsTab);
      return [groupe];
    }
    // Un trémolo ou tout autre groupe : ses notes, sans lui. Clés, armures et barres de couche : rien.
    return enfants(e).flatMap(miroir);
  }

  /** Les liaisons doublées sur la tablature ; seule, la tablature prend tout ce qui se rattachait à la portée. */
  function rattacher(mesure: Element): void {
    for (const e of enfants(mesure)) {
      if (e.localName === "staff") continue;
      const refs = REFERENCES.filter((a) => e.hasAttribute(a));
      const traduit = (a: string) => (e.getAttribute(a) ?? "").split(/\s+/).filter(Boolean)
        .map((v) => nouveaux.get(sansDiese(v))).map((v) => v && `#${v}`);
      const complet = refs.every((a) => traduit(a).every(Boolean));
      if (!r.tablatureSeule) {
        if (e.localName !== "tie" || refs.length === 0 || !complet) continue;
        const copie = creer("tie", { staff: tab });
        for (const a of refs) copie.setAttribute(a, traduit(a).join(" "));
        mesure.append(copie);
        continue;
      }
      if (!complet) { e.remove(); continue; }
      for (const a of refs) e.setAttribute(a, traduit(a).join(" "));
      if (e.hasAttribute("staff")) e.setAttribute("staff", tab);
    }
  }
}

/** La durée d'une note, d'un accord ou d'un silence. */
const duree = (e: Element) => attributsDe(e, ["dur", "dots"]);

function attributsDe(e: Element, noms: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const n of noms) if (e.hasAttribute(n)) r[n] = e.getAttribute(n)!;
  return r;
}

/**
 * Ne garde que la portée transcrite, renumérotée 1, et ce qui s'y rattache. Un tempo désigné sur une
 * portée retirée passe sur celle-ci : il vaut pour toute la pièce. Le reste, qui ne désigne qu'une
 * portée retirée ou une de ses notes, part avec elle.
 */
function garderLaPortee(doc: Document, portee: string): void {
  const retires = new Set<string>();
  for (const def of [...doc.getElementsByTagName("staffDef")]) {
    if (def.getAttribute("n") === portee) def.setAttribute("n", "1"); else def.remove();
  }
  for (const grp of [...doc.getElementsByTagName("staffGrp")].reverse()) {
    if (grp.getElementsByTagName("staffDef").length === 0) grp.remove();
  }
  for (const staff of [...doc.getElementsByTagName("staff")]) {
    if (staff.getAttribute("n") === portee) { staff.setAttribute("n", "1"); continue; }
    for (const e of staff.getElementsByTagName("*")) if (idDe(e)) retires.add(idDe(e));
    staff.remove();
  }
  for (const mesure of [...doc.getElementsByTagName("measure")]) {
    for (const e of enfants(mesure)) {
      if (e.localName === "staff") continue;
      const designe = REFERENCES.flatMap((a) => (e.getAttribute(a) ?? "").split(/\s+/).filter(Boolean).map(sansDiese));
      if (designe.some((id) => retires.has(id))) { e.remove(); continue; }
      const portees = (e.getAttribute("staff") ?? "").split(/\s+/).filter(Boolean);
      if (portees.length === 0) continue;
      if (portees.includes(portee) || e.localName === "tempo") e.setAttribute("staff", "1");
      else e.remove();
    }
  }
}

/** La portée de guitare : clé de sol à 8 en bas, sans transposition écrite. */
function preparerPorteeGuitare(def: Element, creer: (nom: string, a?: Record<string, string | number>) => Element): void {
  for (const a of [...def.getAttributeNames()]) if (a.startsWith("clef.") || a.startsWith("trans.")) def.removeAttribute(a);
  for (const c of enfants(def)) if (c.localName === "clef" || c.localName === "clefGrp") c.remove();
  const premiere = def.parentElement?.closest("scoreDef") === def.ownerDocument.getElementsByTagName("scoreDef")[0];
  if (premiere) def.prepend(creer("clef", { shape: "G", line: 2, dis: 8, "dis.place": "below" }));
}

/** La définition de la tablature : ses lignes, sa clé, l'accordage de ses cordes, la métrique de la portée. */
function definitionTablature(def: Element, cordes: readonly number[], n: string, creer: (nom: string, a?: Record<string, string | number>) => Element): Element {
  const tabDef = creer("staffDef", { n, lines: cordes.length, notationtype: "tab.guitar", ...attributsDe(def, ["meter.count", "meter.unit", "meter.sym"]) });
  tabDef.append(creer("clef", { shape: "TAB", line: cordes.length - 1 }));
  const tuning = creer("tuning");
  cordes.forEach((midi, i) => {
    const nom = lireNomDeNote(nomNoteRond(midi))!;
    const course = creer("course", { n: cordes.length - i, pname: nom.lettre.toLowerCase(), oct: Math.floor(midi / 12) - 1 });
    if (nom.alteration !== 0) course.setAttribute("accid", "s");
    tuning.append(course);
  });
  tabDef.append(tuning);
  for (const m of enfants(def, "meterSig")) tabDef.append(copieSansId(m));
  return tabDef;
}

/** Une copie dont les adresses sont retirées : deux éléments ne portent jamais la même. */
function copieSansId(e: Element): Element {
  const copie = e.cloneNode(true) as Element;
  for (const x of [copie, ...copie.getElementsByTagName("*")]) x.removeAttributeNS(XML, "id");
  return copie;
}

/** Dans un changement de définition, la tablature ne reprend que la métrique. */
function changementTablature(def: Element, n: string, creer: (nom: string, a?: Record<string, string | number>) => Element): Element | null {
  const metre = attributsDe(def, ["meter.count", "meter.unit", "meter.sym"]);
  const signes = enfants(def, "meterSig");
  if (Object.keys(metre).length === 0 && signes.length === 0) return null;
  const tabDef = creer("staffDef", { n, ...metre });
  for (const m of signes) tabDef.append(copieSansId(m));
  return tabDef;
}
