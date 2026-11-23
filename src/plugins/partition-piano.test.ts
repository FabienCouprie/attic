// @vitest-environment jsdom
// plugins/partition-piano.test.ts — Ce que la partition pour piano fait jouer est ce que le texte dit, et
// chaque note est sur la portée de sa main.
//
// TOUT PASSE PAR `executer`, et deux instruments relisent ce qui en sort, sans rien demander au code qui a
// partagé les notes :
//   - LE SVG GRAVÉ dit sur quelle portée chaque note est dessinée, la première sous la clé de sol, la
//     seconde sous la clé de fa, et si l'accolade les réunit ;
//   - LE MEI DONNÉ AU GRAVEUR, intercepté au chargement, est relu COMME UN MUSICIEN LE LIT : tout ce qui
//     ne se voit pas en est retiré (`accid.ges`, `pname.ges`, `oct.ges`), et la lecture des hauteurs
//     (`lireNotes`) n'a plus que l'armure, l'altération écrite et celle qui vaut jusqu'à la barre sur
//     la même portée. Les instants viennent d'un Verovio neuf, qui lit ce MEI.
// LA RÉFÉRENCE, POUR L'ABC, EST LE LECTEUR ABC D'ATTIC (`lireMorceau`), indépendant de Verovio et du
// partage : les deux portées réunies doivent jouer ses hauteurs, attaque par attaque, aux mêmes instants.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireMorceau } from "../audio/abc";
import { lireNotes, type Temps } from "../audio/guitare-hauteurs";
import { outilVerovio } from "./verovio-outil";

const charges = vi.hoisted(() => [] as string[]);
vi.mock("./verovio-lecture", async (original) => {
  const vrai = await original<typeof import("./verovio-lecture")>();
  return {
    ...vrai,
    outil: async (humdrum: boolean) => {
      const tk = await vrai.outil(humdrum);
      const charger = tk.loadData.bind(tk);
      tk.loadData = (texte: string) => { charges.push(texte); return charger(texte); };
      return tk;
    },
  };
});

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
type Reglages = Record<string, string | number>;
const classe = (e: Element) => (e.getAttribute("class") ?? "").split(" ")[0];
const glyphe = (u: Element) => (u.getAttribute("xlink:href") ?? u.getAttribute("href") ?? "").replace(/^#/, "").split("-")[0];

/** Ce que le SVG dessine : la portée de chaque note, 1 en haut, les clés, l'accolade, le nombre de systèmes. */
function lireSvg(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const tout = [...doc.getElementsByTagName("g")];
  const portee = new Map<string, number>();
  for (const mesure of tout.filter((g) => classe(g) === "measure")) {
    [...mesure.children].filter((g) => classe(g) === "staff").forEach((staff, k) => {
      for (const n of [...staff.getElementsByTagName("g")].filter((g) => classe(g) === "note")) portee.set(n.getAttribute("id") ?? "", k + 1);
    });
  }
  const cles = tout.filter((g) => classe(g) === "clef").flatMap((g) => [...g.getElementsByTagName("use")].map(glyphe));
  return { portee, cles, accolade: tout.some((g) => classe(g) === "grpSym"), systemes: tout.filter((g) => classe(g) === "system").length };
}

async function graver(notation: string, reglages: Reglages = {}) {
  charges.length = 0;
  const r = await lancerFiche(F("partition-piano"), { Notation: notation, ...reglages }, { entrees: [null] });
  const svg = String(r.valeurs[0] ?? "");
  return { ...r, svg, mei: charges[charges.length - 1] ?? "", lu: svg.includes("<svg") ? lireSvg(svg) : null };
}

/** Les instants de chaque note, selon un Verovio neuf qui lit le MEI. */
async function tempsDuMei(mei: string): Promise<Temps> {
  const tk = await outilVerovio(false);
  try {
    tk.setOptions({ inputFrom: "mei" });
    tk.loadData(mei);
    const temps: Temps = new Map();
    for (const t of tk.renderToTimemap({}) as { qstamp: number; on?: string[]; off?: string[] }[]) {
      for (const id of t.on ?? []) temps.set(id, { debut: t.qstamp, fin: t.qstamp });
      for (const id of t.off ?? []) { const n = temps.get(id); if (n) n.fin = t.qstamp; }
    }
    return temps;
  } finally {
    tk.destroy?.();
  }
}

type Attaques = { debuts: number[]; hauteurs: number[][] };
/** Les attaques, les instants rapportés au dernier et les hauteurs triées. */
function attaques(notes: { debut: number; midi: number }[]): Attaques {
  const parDebut = new Map<number, number[]>();
  for (const n of notes) parDebut.set(n.debut, [...(parDebut.get(n.debut) ?? []), n.midi]);
  const triees = [...parDebut].sort((a, b) => a[0] - b[0]);
  const dernier = triees[triees.length - 1]?.[0] || 1;
  return { debuts: triees.map(([d]) => Math.round((d / dernier) * 1e6) / 1e6), hauteurs: triees.map(([, m]) => m.sort((a, b) => a - b)) };
}

/** Le MEI relu comme un musicien : les attaques des deux portées réunies, et chaque note avec sa portée. */
async function relire(mei: string) {
  const temps = await tempsDuMei(mei);
  const doc = new DOMParser().parseFromString(mei, "application/xml");
  for (const e of [...doc.getElementsByTagName("*")]) for (const a of ["accid.ges", "pname.ges", "oct.ges"]) e.removeAttribute(a);
  const notes = ["1", "2"].flatMap((p) => lireNotes(doc, p, temps, 0).notes.map((n) => ({ ...n, portee: Number(p) })));
  return { ...attaques(notes), notes, doc };
}

const selonLeLecteurAbc = (abc: string) => attaques(lireMorceau(abc).voix[0].notes);

/** Les hauteurs de chaque portée, dans l'ordre du temps. */
async function parPortee(mei: string) {
  const { notes } = await relire(mei);
  const de = (p: number) => notes.filter((n) => n.portee === p).sort((a, b) => a.debut - b.debut || a.midi - b.midi).map((n) => n.midi);
  return { droite: de(1), gauche: de(2) };
}

const MENUET = "X:1\nT:Menuet\nM:3/4\nL:1/4\nK:G\n[G,,B,,D,] d c | [C,E,G,] B A | [D,^F,A,] G F | [G,,D,B,G]3 |]";

const AIRS: [string, string][] = [
  ["le menuet en sol de l'exemple", MENUET],
  ["une altération portée qui change de main dans la mesure : le sol♯ 3 de la ligne, puis celui de l'accord", "X:1\nT:Portee\nM:5/4\nL:1/8\nK:C\nG F E D C B, A, ^G, [E,G,B,]2 | A,8 z2 |]"],
  ["si bémol majeur, une basse et une mélodie à bécarres", "X:1\nT:SiBemol\nM:4/4\nL:1/8\nK:Bb\n[B,,,F,,]2 d=e f2 =e2 | [F,,C,]2 c=B A2 B2 | [B,,,F,,D,]8 |]"],
  ["une liaison par-dessus la barre, puis la même note sans dièse", "X:1\nT:Liaison\nM:4/4\nL:1/4\nK:C\n[C,E,G,]2 ^c2- | c2 [C,c]2 |]"],
  ["un triolet et des silences", "X:1\nT:Triolet\nM:4/4\nL:1/8\nK:D\n(3DFA d2 z2 [D,,A,,]2 | z2 [A,,E,]2 (3ceg a2 | [D,,A,,F,d]8 |]"],
  ["un accord de dix notes", "X:1\nT:Dix\nM:4/4\nL:1/4\nK:C\n[C,,E,,G,,_B,,C,CEG_Bc]4 |]"],
];

describe("les deux portées jouent ce que lit le lecteur ABC", () => {
  it.each(AIRS)("%s", async (_nom, abc) => {
    const r = await graver(abc);
    expect(r.erreurRendue, r.message).toBeFalsy();
    const relu = await relire(r.mei);
    const attendu = selonLeLecteurAbc(abc);
    expect(relu.hauteurs).toEqual(attendu.hauteurs);
    expect(relu.debuts).toEqual(attendu.debuts);
  }, 60_000);

  it.each(AIRS.slice(0, 3))("%s, au point fixe", async (_nom, abc) => {
    const r = await graver(abc, { Partage: "fixe" });
    expect((await relire(r.mei)).hauteurs).toEqual(selonLeLecteurAbc(abc).hauteurs);
  }, 60_000);
});

describe("la gravure : deux portées sous accolade, chaque note sur celle de sa main", () => {
  it("l'accolade, la clé de sol en haut, la clé de fa en bas, et chaque note dessinée sur la portée de son MEI", async () => {
    const r = await graver(MENUET);
    expect(r.lu!.accolade).toBe(true);
    expect(r.lu!.cles).toEqual(["E050", "E062"]);
    const { notes } = await relire(r.mei);
    for (const n of notes) expect(r.lu!.portee.get(n.ids[0]), n.nom).toBe(n.portee);
  }, 60_000);

  it("le menuet : la mélodie à droite, les accords à gauche, l'accord final partagé", async () => {
    const r = await graver(MENUET);
    expect(await parPortee(r.mei)).toEqual({
      droite: [74, 72, 71, 69, 67, 66, 59, 67],
      gauche: [43, 47, 50, 48, 52, 55, 50, 54, 57, 43, 50],
    });
    expect(r.message).toBe("ABC · partage par la main · page 1 sur 1");
  }, 60_000);

  it("une ligne qui passe sous le do 4 reste à droite par la main, et change de portée au point fixe", async () => {
    const abc = "X:1\nM:4/4\nL:1/4\nK:C\nE D C B, | A, B, C D | E F G2 |]";
    expect((await parPortee((await graver(abc)).mei)).gauche).toEqual([]);
    const fixe = await graver(abc, { Partage: "fixe" });
    expect((await parPortee(fixe.mei)).gauche).toEqual([59, 57, 59]);
    expect(fixe.message).toBe("ABC · partage au C4 · page 1 sur 1");
    // Le point de partage descendu au sol 3 : tout est à droite.
    expect((await parPortee((await graver(abc, { Partage: "fixe", "Point de partage": 55 })).mei)).gauche).toEqual([]);
  }, 60_000);

  it("le sol♯ 3 de l'accord, à gauche, porte son dièse : celui de la ligne, qui le portait, est à droite", async () => {
    const r = await graver(AIRS[1][1]);
    expect(await parPortee(r.mei)).toEqual({ droite: [67, 65, 64, 62, 60, 59, 57, 56], gauche: [52, 56, 59, 57] });
    const { doc } = await relire(r.mei);
    const gauche = [...doc.getElementsByTagName("staff")].filter((s) => s.getAttribute("n") === "2")[0];
    const sol = [...gauche.getElementsByTagName("note")].find((n) => n.getAttribute("pname") === "g");
    expect(sol?.getAttribute("accid")).toBe("s");
  }, 60_000);

  it("une main qui se tait porte des silences, une portée muette sur une mesure un silence de mesure", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\n[C,E,G,] e d c | e d c2 |]");
    const doc = new DOMParser().parseFromString(r.mei, "application/xml");
    const portees = [...doc.getElementsByTagName("staff")];
    expect(portees.map((s) => [s.getAttribute("n"), s.getElementsByTagName("rest").length, s.getElementsByTagName("mRest").length]))
      .toEqual([["1", 1, 0], ["2", 3, 0], ["1", 0, 0], ["2", 0, 1]]);
  }, 60_000);

  it("une note d'ornement va à la main de la note qu'elle orne", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\n{^F,}G,2 {d}e2 |]");
    const doc = new DOMParser().parseFromString(r.mei, "application/xml");
    const ornements = [...doc.getElementsByTagName("note")].filter((n) => n.closest("graceGrp") || n.hasAttribute("grace"))
      .map((n) => [n.getAttribute("pname"), n.closest("staff")?.getAttribute("n")]);
    // Dans l'ordre du document : la portée du haut d'abord, dans chaque mesure.
    expect(ornements).toEqual([["d", "1"], ["f", "2"]]);
  }, 60_000);
});

describe("les autres notations, et plusieurs portées réunies", () => {
  it("le Humdrum garde l'altération d'armure : fa♯ 4 sous *k[f#], la basse en bas", async () => {
    const kern = "**kern\t**kern\n*clefF4\t*clefG2\n*k[f#]\t*k[f#]\n*M3/4\t*M3/4\n4GG\t4f#\n4D\t4g\n2GG\t2a\n==\t==\n*-\t*-\n";
    const r = await graver(kern);
    expect(r.erreurRendue, r.message).toBeFalsy();
    expect((await relire(r.mei)).hauteurs).toEqual([[43, 66], [50, 67], [43, 69]]);
    expect(await parPortee(r.mei)).toEqual({ droite: [66, 67, 69], gauche: [43, 50, 43] });
    expect(r.message).toBe("HUMDRUM · partage par la main · 2 portées réunies · page 1 sur 1");
  }, 60_000);

  it("un MusicXML de piano reste un piano", async () => {
    const r = await graver(musicXml([
      { nom: "Piano", portees: [["G", 2, [["E", 5]]], ["F", 4, [["C", 3]]]] },
    ]));
    expect(r.erreurRendue, r.message).toBeFalsy();
    expect(await parPortee(r.mei)).toEqual({ droite: [76], gauche: [48] });
  }, 60_000);

  it("un choral à quatre portées : soprano et alto à droite, ténor et basse à gauche, deux couches par portée", async () => {
    const r = await graver(musicXml([
      { nom: "S", portees: [["G", 2, [["E", 4], ["F", 4], ["G", 4]]]] },
      { nom: "A", portees: [["G", 2, [["C", 4], ["D", 4], ["E", 4]]]] },
      { nom: "T", portees: [["F", 4, [["G", 3], ["A", 3], ["B", 3]]]] },
      { nom: "B", portees: [["F", 4, [["C", 3], ["D", 3], ["E", 3]]]] },
    ], 3));
    expect(r.erreurRendue, r.message).toBeFalsy();
    expect((await relire(r.mei)).hauteurs).toEqual([[48, 55, 60, 64], [50, 57, 62, 65], [52, 59, 64, 67]]);
    const doc = new DOMParser().parseFromString(r.mei, "application/xml");
    const premiere = [...doc.getElementsByTagName("measure")][0];
    expect([...premiere.getElementsByTagName("staff")].map((s) => s.getElementsByTagName("layer").length)).toEqual([2, 2]);
    expect(r.message).toContain("4 portées réunies");
  }, 60_000);

  it("une clarinette en si♭ est lue à la hauteur réelle : son ré 5 écrit sonne do 5", async () => {
    const r = await graver(musicXml([
      { nom: "Clarinette", transpose: -2, portees: [["G", 2, [["D", 5]]]] },
      { nom: "Basson", portees: [["F", 4, [["C", 3]]]] },
    ]));
    expect(r.erreurRendue, r.message).toBeFalsy();
    expect(await parPortee(r.mei)).toEqual({ droite: [72], gauche: [48] });
  }, 60_000);

  it("une hauteur entre deux touches est refusée, nommée avec sa mesure", async () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note dur="2" pname="c" oct="5"/><note dur="2" pname="a" oct="4" accid="1qs"/></layer></staff></measure></section></score></mdiv></body></music></mei>`;
    const r = await graver(mei);
    expect(r.erreurRendue).toBeTruthy();
    expect(r.message).toBe("MEI refusée pour le piano, rien n'est gravé : A4, mesure 1 : hauteur entre deux touches");
  }, 60_000);

  it("un ABC à deux voix est refusé, comme la lecture commune le refuse", async () => {
    const r = await graver("X:1\nT:Deux\nM:4/4\nL:1/4\nK:C\nV:1\nc d e f |\nV:2\nC, D, E, F, |");
    expect(r.erreurRendue).toBeTruthy();
    expect(r.message).toContain("V:");
  }, 60_000);
});

describe("ce qui ne se joue pas est gravé, et dit", () => {
  it("un accord qu'aucune main ne tient sous un écart de quinte, et le même tenu sous une octave", async () => {
    const abc = "X:1\nM:4/4\nL:1/4\nK:C\n[C,G,Ec]4 |]";
    expect((await graver(abc)).message).toBe("ABC · partage par la main · page 1 sur 1");
    const serre = await graver(abc, { "Écart": 7 });
    expect(serre.erreurRendue, serre.message).toBeFalsy();
    expect(serre.message).toBe("ABC · partage par la main · 1 accord(s) qu'aucune main ne tient, dès la mesure 1 · page 1 sur 1");
  }, 60_000);

  it("une note sous la 0 est gravée, et dite", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\nC4 | G,,,,4 |]");
    expect(r.erreurRendue, r.message).toBeFalsy();
    expect(r.message).toBe("ABC · partage par la main · 1 note(s) hors du clavier, dès la mesure 2 · page 1 sur 1");
    expect((await relire(r.mei)).hauteurs).toEqual([[60], [19]]);
  }, 60_000);
});

describe("les réglages de page", () => {
  const LONG = `X:1\nT:Long\nM:4/4\nL:1/4\nK:C\n${Array.from({ length: 48 }, (_, i) => `[C,E,G,] ${"cdef"[i % 4]} e d`).join(" | ")} |]`;
  it("« Déroulé » met toute la pièce sur un seul système", async () => {
    expect((await graver(LONG)).lu!.systemes).toBeGreaterThan(1);
    expect((await graver(LONG, { "Déroulé": "oui" })).lu!.systemes).toBe(1);
  }, 60_000);
  it("« Page » au-delà de la dernière rend la dernière", async () => {
    const r = await graver(LONG, { Page: 200, Largeur: 900, "Échelle": 60 });
    expect(r.message).toMatch(/· page (\d+) sur \1$/);
  }, 60_000);
});

/** Un MusicXML : chaque partie, ses portées (clé, ligne, notes d'une noire), et sa transposition en demi-tons. */
function musicXml(parties: { nom: string; transpose?: number; portees: [string, number, [string, number][]][] }[], temps = 1): string {
  const liste = parties.map((p, i) => `<score-part id="P${i + 1}"><part-name>${p.nom}</part-name></score-part>`).join("");
  const corps = parties.map((p, i) => {
    const plusieurs = p.portees.length > 1;
    const cles = p.portees.map(([signe, ligne], k) => `<clef${plusieurs ? ` number="${k + 1}"` : ""}><sign>${signe}</sign><line>${ligne}</line></clef>`).join("");
    const transpose = p.transpose ? `<transpose><diatonic>-1</diatonic><chromatic>${p.transpose}</chromatic></transpose>` : "";
    const notes = p.portees.map(([, , ns], k) => {
      const duree = temps === 1 ? 4 : 1, type = temps === 1 ? "whole" : "quarter";
      const n = ns.map(([step, octave]) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duree}</duration><voice>${k + 1}</voice><type>${type}</type>${plusieurs ? `<staff>${k + 1}</staff>` : ""}</note>`).join("");
      return (k > 0 ? `<backup><duration>${duree * ns.length}</duration></backup>` : "") + n;
    }).join("");
    return `<part id="P${i + 1}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>${temps === 1 ? 4 : 3}</beats><beat-type>4</beat-type></time>${plusieurs ? `<staves>${p.portees.length}</staves>` : ""}${cles}${transpose}</attributes>${notes}</measure></part>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list>${liste}</part-list>${corps}</score-partwise>`;
}
