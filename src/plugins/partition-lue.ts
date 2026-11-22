// plugins/partition-lue.ts — Ce qu'un musicien lit sur une partition gravée par Verovio.
//
// LA REVUE DES NOTATIONS EN TEXTE, quatrième format, 2026-11-22. Le graveur rend un SVG, et rien ne
// regardait ce qui y est dessiné. Ce module le relit comme on lit une partition, sans rien demander
// au moteur qui l'a gravée :
//   - la hauteur à la position de la tête sur la portée, selon la clé, l'armure, et les altérations
//     dessinées, qui valent pour la même ligne jusqu'à la barre ;
//   - la durée à la tête, aux crochets ou aux barres de ligature qui passent sur la hampe, aux points,
//     et au chiffre du n-olet, lu selon l'usage : trois pour deux, cinq pour quatre ;
//   - une liaison prolonge la note sans la refrapper ; une reprise et ses fins se déroulent.
// Il ne sert qu'aux gardes : c'est l'instrument qui mesure la gravure.
//
// LES GLYPHES SONT CEUX DE SMuFL, que Verovio cite par leur point de code : E050 la clé de sol,
// E0A4 la tête noire, E262 le dièse… Un glyphe que ce module ne connaît pas est rendu dans
// `inconnus`, pour qu'une lecture incomplète ne passe pas pour juste.

import { lireNomDeNote } from "../audio/noms-de-notes";

const LETTRES = "CDEFGAB";
/** La classe de chaque lettre naturelle, que porte déjà le lecteur des noms de notes. */
const DEMI = [...LETTRES].map((l) => lireNomDeNote(l)!.classe);
const di = (l: string, o: number) => o * 7 + LETTRES.indexOf(l);
/** La note que porte la ligne où chaque clé est posée. */
const CLES: Record<string, number> = {
  E050: di("G", 4), E07A: di("G", 4), E052: di("G", 3), E053: di("G", 5),
  E062: di("F", 3), E07C: di("F", 3), E05C: di("C", 4), E07B: di("C", 4),
};
const ALTERATIONS: Record<string, number> = { E260: -1, E261: 0, E262: 1, E263: 2, E264: -2 };
const TETES: Record<string, number> = { E0A0: 8, E0A2: 4, E0A3: 2, E0A4: 1 };
const CROCHETS: Record<string, number> = { E240: 1, E241: 1, E242: 2, E243: 2, E244: 3, E245: 3, E246: 4, E247: 4 };
const SILENCES: Record<string, number> = { E4E3: 4, E4E4: 2, E4E5: 1, E4E6: 0.5, E4E7: 0.25, E4E8: 0.125 };
/** Un n-olet marqué de son seul chiffre se lit selon l'usage : n notes dans le temps de… */
const USAGE: Record<number, number> = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 8: 6, 9: 8 };

const glyphe = (u: Element) => (u.getAttribute("xlink:href") ?? u.getAttribute("href") ?? "").replace(/^#/, "").split("-")[0];
function pos(u: Element) {
  const m = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)(?:\s*scale\(([\d.]+))?/.exec(u.getAttribute("transform") ?? "");
  return m ? { x: +m[1], y: +m[2], s: +(m[3] ?? 1) } : { x: 0, y: 0, s: 1 };
}
const classe = (e: Element) => (e.getAttribute("class") ?? "").split(" ")[0];
const uses = (e: Element) => [...e.getElementsByTagName("use")];
const enfants = (e: Element, c: string) => [...e.children].filter((x) => classe(x) === c);
/** Les chiffres d'une métrique (E080 à E089) ou d'un n-olet (E880 à E889), lus en nombre. */
const chiffres = (e: Element) => Number(uses(e).map(glyphe).filter((g) => /^E[08]8[0-9]$/.test(g)).map((g) => g[3]).join("")) || 0;
const points = (e: Element) => new Set([...e.querySelectorAll("g.dots ellipse")].map((d) => d.getAttribute("cx"))).size;
const abscisse = (chemin: Element | null) => Number(/M(-?[\d.]+)/.exec(chemin?.getAttribute("d") ?? "")?.[1]);

type Tete = { x: number; y: number; midi: number; debut: number; duree: number; systeme: Element | null };
type Mesure = { longueur: number; notes: Tete[]; reprise: boolean; debutReprise: boolean; fin?: number };
export type NoteLue = [midi: number, debut: number, fin: number];
export type PartitionLue = { notes: NoteLue[]; graces: number; inconnus: string[]; tempo: string[]; portees: number; titres: string[] };

/** La durée dessinée d'une note ou d'un accord, en noires, n-olet compris. */
function dureeDessinee(e: Element, inconnus: string[]): number {
  const tete = e.querySelector("g.notehead use")!;
  if (!(glyphe(tete) in TETES)) inconnus.push(glyphe(tete));
  let barres = CROCHETS[uses(e).map(glyphe).find((g) => g in CROCHETS) ?? ""] ?? 0;
  const ligature = e.closest("g.beam");
  if (ligature) {
    const x = abscisse(e.querySelector("g.stem path"));
    barres = enfants(ligature, "").filter((b) => b.tagName === "polygon").filter((b) => {
      const xs = (b.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => Number(p.split(",")[0]));
      return x >= Math.min(...xs) - 5 && x <= Math.max(...xs) + 5;
    }).length;
  }
  let duree = ((TETES[glyphe(tete)] ?? NaN) / 2 ** barres) * (2 - 1 / 2 ** points(e));
  const nolet = e.closest("g.tuplet");
  if (nolet) {
    const n = chiffres(nolet.querySelector("g.tupletNum") ?? nolet);
    duree *= (USAGE[n] ?? n) / n;
  }
  return duree;
}

export function lireGravure(svg: string): PartitionLue {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const mesures: Mesure[] = [];
  const tetes: Tete[] = [];
  const inconnus: string[] = [];
  const etat = new Map<number, { cle: { d: number; y: number }; armure: Map<number, number> }>();
  let metrique = 4, graces = 0;
  const echelleTete = Math.max(0, ...[...doc.querySelectorAll("g.notehead use")].map((u) => pos(u).s));
  // Une fin alternative est un jalon : elle s'ouvre à son groupe, et se ferme au jalon qui la nomme.
  let finCourante: { id: string; n: number } | null = null;
  for (const m of doc.querySelectorAll("g.measure, g.ending, g.systemMilestoneEnd")) {
    if (classe(m) === "ending") { finCourante = { id: m.getAttribute("id") ?? "", n: Number((m.textContent ?? "").match(/\d/)?.[0] ?? 0) }; continue; }
    if (classe(m) === "systemMilestoneEnd") { if (finCourante && (m.getAttribute("class") ?? "").includes(finCourante.id)) finCourante = null; continue; }
    const ici: Mesure = { longueur: 0, notes: [], reprise: false, debutReprise: false, fin: finCourante?.n || undefined };
    const systeme = m.closest("g.system");
    enfants(m, "staff").forEach((portee, p) => {
      const lignes = [...portee.children].filter((e) => e.tagName === "path").map((e) => Number(/M-?[\d.]+ (-?[\d.]+)/.exec(e.getAttribute("d") ?? "")?.[1]));
      const pas = (Math.max(...lignes) - Math.min(...lignes)) / 8;
      const s = etat.get(p) ?? { cle: { d: di("G", 4), y: Math.max(...lignes) - 2 * pas }, armure: new Map() };
      etat.set(p, s);
      const degre = (y: number) => s.cle.d + Math.round((s.cle.y - y) / pas);
      const portees = new Map<number, number>();
      /** Clé, armure et métrique, où qu'elles soient posées ; rend la classe des autres éléments. */
      const signe = (e: Element) => {
        const c = classe(e);
        const u = uses(e)[0];
        if (c === "clef" && u) { if (!(glyphe(u) in CLES)) inconnus.push(glyphe(u)); s.cle = { d: CLES[glyphe(u)] ?? NaN, y: pos(u).y }; return; }
        if (c === "keySig") { s.armure = new Map(uses(e).map((a) => [((degre(pos(a).y) % 7) + 7) % 7, ALTERATIONS[glyphe(a)] ?? 0])); return; }
        if (c === "meterSig") { const [n, d] = uses(e).map((g) => Number(glyphe(g)[3])); if (n && d) metrique = (n * 4) / d; return; }
        return c;
      };
      for (const e of portee.children) signe(e);
      for (const couche of enfants(portee, "layer")) {
        let t = 0;
        const parcourir = (e: Element) => {
          const c = signe(e);
          if (c === undefined) return;
          if (c === "note" || c === "chord") {
            if (pos(e.querySelector("g.notehead use")!).s < echelleTete * 0.9) { graces++; return; }
            const duree = dureeDessinee(e, inconnus);
            for (const n of c === "chord" ? [...e.querySelectorAll("g.note")] : [e]) {
              const u = pos(n.querySelector("g.notehead use")!);
              const d = degre(u.y);
              const a = n.querySelector("g.accid use");
              if (a) portees.set(d, ALTERATIONS[glyphe(a)] ?? 0);
              const alteration = portees.get(d) ?? s.armure.get(((d % 7) + 7) % 7) ?? 0;
              const lue: Tete = { x: u.x, y: u.y, midi: 12 * (Math.floor(d / 7) + 1) + DEMI[((d % 7) + 7) % 7] + alteration, debut: t, duree, systeme };
              tetes.push(lue); ici.notes.push(lue);
            }
            t += duree;
          } else if (c === "rest") {
            const u = uses(e)[0];
            if (!(glyphe(u) in SILENCES)) inconnus.push(glyphe(u));
            t += (SILENCES[glyphe(u)] ?? NaN) * (2 - 1 / 2 ** points(e));
          } else if (c === "mRest") t += metrique;
          else if (c === "multiRest") t += metrique * chiffres(e);
          else for (const x of e.children) parcourir(x);
        };
        for (const e of couche.children) parcourir(e);
        ici.longueur = Math.max(ici.longueur, t);
      }
    });
    // Une barre à points : à droite des traits, la reprise commence ; à gauche, elle renvoie.
    for (const b of enfants(m, "barLine")) {
      const traits = [...b.getElementsByTagName("path")].map(abscisse);
      const pts = uses(b).filter((u) => glyphe(u) === "E044").map((u) => pos(u).x);
      if (pts.length) { if (pts[0] > Math.max(...traits)) ici.debutReprise = true; else ici.reprise = true; }
    }
    mesures.push(ici);
  }
  // Une liaison va du bord droit d'une tête au bord gauche de la suivante, à la même hauteur ; les têtes
  // d'un accord partagent leur abscisse, d'où la plus proche en x, puis la plus proche en y.
  const liees = new Map<Tete, Tete>();
  for (const l of doc.querySelectorAll("g.tie path")) {
    const nombres = (l.getAttribute("d") ?? "").match(/-?[\d.]+/g)!.map(Number);
    const [x1, y1] = nombres, [x2, y2] = nombres.slice(6, 8);
    const systeme = l.closest("g.system");
    const pres = (y: number) => (a: Tete, b: Tete) => Math.abs(a.y - y) - Math.abs(b.y - y);
    const avant = tetes.filter((h) => h.systeme === systeme && h.x < x1 && Math.abs(h.y - y1) < 200)
      .sort((a, b) => Math.round((b.x - a.x) / 50) || pres(y1)(a, b))[0];
    const apres = tetes.filter((h) => h.systeme === systeme && h.x > x1 && h.x >= x2 - 150 && Math.abs(h.y - y2) < 200)
      .sort((a, b) => Math.round((a.x - b.x) / 50) || pres(y2)(a, b))[0];
    if (avant && apres) liees.set(apres, avant);
  }
  // Le déroulé d'un musicien : à la barre de reprise, retour au début de la reprise, une seule fois ; à
  // la seconde passe, la fin qui porte son numéro.
  const ordre: number[] = [];
  const faites = new Set<number>();
  const derniere = Math.max(-1, ...mesures.map((m, k) => (m.reprise ? k : -1)));
  for (let i = 0, debut = 0, passe = 1; i < mesures.length && ordre.length < 10_000;) {
    const m = mesures[i];
    if (m.debutReprise) debut = i;
    if (m.fin && m.fin !== passe) { i++; continue; }
    if (!m.fin && i > derniere) passe = 1;
    ordre.push(i);
    if (m.reprise && !faites.has(i)) { faites.add(i); passe++; i = debut; continue; }
    i++;
  }
  const jouees: { midi: number; debut: number; fin: number; tete: Tete }[] = [];
  let t = 0;
  for (const k of ordre) {
    for (const h of mesures[k].notes) {
      const source = liees.get(h);
      const tenue = source && [...jouees].reverse().find((n) => n.tete === source);
      if (tenue) { tenue.fin = t + h.debut + h.duree; tenue.tete = h; continue; }
      jouees.push({ midi: h.midi, debut: t + h.debut, fin: t + h.debut + h.duree, tete: h });
    }
    t += mesures[k].longueur;
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return {
    notes: jouees.map((n): NoteLue => [n.midi, r(n.debut), r(n.fin)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]),
    graces,
    inconnus,
    tempo: [...doc.querySelectorAll("g.tempo")].map((g) => (g.textContent ?? "").trim()),
    portees: Math.max(0, ...[...doc.querySelectorAll("g.measure")].map((m) => enfants(m, "staff").length)),
    titres: [...doc.querySelectorAll("g.pgHead text, g.title text")].map((g) => (g.textContent ?? "").trim()).filter(Boolean),
  };
}
