// @vitest-environment jsdom
// plugins/partition-guitare.test.ts — Ce que la tablature gravée fait jouer est ce que le texte dit.
//
// TOUT PASSE PAR `executer`, et la gravure est relue par `tablature-lue.ts`, comme un guitariste la lit :
// la corde à la ligne, la case au chiffre. Rien n'est demandé au code qui a placé les notes.
//
// LA RÉFÉRENCE, POUR L'ABC, EST LE LECTEUR ABC D'ATTIC (`lireMorceau`), un lecteur indépendant de Verovio
// et du doigté, tenu à la norme ABC 2.1 par son propre garde : la hauteur que joue chaque case, corde à
// vide plus capodastre plus case, doit être la sienne, attaque par attaque. Pour le Humdrum, c'est le
// texte du kern lu à la main : Verovio y perd l'altération d'armure. Pour le MusicXML de guitare, la
// hauteur écrite dans `<pitch>`.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireMorceau } from "../audio/abc";
import { accordageDe, cordesMidi } from "../audio/guitare-doigte";
import { hauteurJouee, lireTablature } from "./tablature-lue";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
type Reglages = Record<string, string | number>;

async function graver(notation: string, reglages: Reglages = {}) {
  const r = await lancerFiche(F("partition-guitare"), { Notation: notation, ...reglages }, { entrees: [null] });
  const svg = String(r.valeurs[0] ?? "");
  return { ...r, svg, lu: svg.includes("<svg") ? lireTablature(svg) : null };
}

/** Les hauteurs jouées, attaque par attaque, chaque groupe trié. */
async function joue(notation: string, reglages: Reglages = {}) {
  const r = await graver(notation, reglages);
  expect(r.erreurRendue, r.message).toBeFalsy();
  const cordes = cordesMidi(accordageDe(String(reglages.Accordage ?? "standard"))).map((c) => c + Number(reglages.Capodastre ?? 0));
  return r.lu!.groupes.map((g) => g.cases.map((c) => hauteurJouee(c, cordes)).sort((a, b) => a - b));
}

/** Les hauteurs du lecteur ABC, attaque par attaque. */
function selonLeLecteurAbc(abc: string, octave = 0): number[][] {
  const parDebut = new Map<number, number[]>();
  for (const n of lireMorceau(abc).voix[0].notes) parDebut.set(n.debut, [...(parDebut.get(n.debut) ?? []), n.midi + 12 * octave]);
  return [...parDebut].sort((a, b) => a[0] - b[0]).map(([, m]) => m.sort((a, b) => a - b));
}

const AIRS: [string, string][] = [
  ["une gamme en sol, l'armure", "X:1\nT:Sol\nM:4/4\nL:1/4\nK:G\nG, A, B, C | D E F G | B A G2 |]"],
  ["les altérations portées jusqu'à la barre", "X:1\nT:Portees\nM:4/4\nL:1/4\nK:C\n^C D ^C =C | _B, B, C2 | ^F G F G |]"],
  ["un triolet et des croches en ré", "X:1\nT:Triolet\nM:3/4\nL:1/8\nK:D\n(3DEF G2 A2 | B2 c2 d2 | f2 e2 d2 |]"],
  ["des accords de do, sol et la mineur", "X:1\nT:Accords\nM:4/4\nL:1/4\nK:C\n[C,E,G,C]2 [G,,B,,D,G,]2 | [A,,E,A,C]4 |]"],
  ["des silences, en la mineur", "X:1\nT:Silences\nM:4/4\nL:1/4\nK:Am\nA z c z | e2 z2 | ^G2 A2 |]"],
  ["si bémol majeur, deux bémols à l'armure", "X:1\nT:SiBemol\nM:4/4\nL:1/8\nK:Bb\nB,CDE FGAB | cBAG FEDC | B,8 |]"],
  // L'import ABC de Verovio pose accid.ges="f" sur le second si, que l'altération portée laisse bécarre.
  ["un bécarre porté sous l'armure de si bémol", "X:1\nT:Becarre\nM:4/4\nL:1/8\nK:Bb\nc=B A2 B2 B,2 |]"],
];

describe("la tablature joue ce que lit le lecteur ABC", () => {
  it.each(AIRS)("%s", async (_nom, abc) => {
    expect(await joue(abc)).toEqual(selonLeLecteurAbc(abc));
  }, 60_000);
  it.each(AIRS.slice(0, 3))("%s, en Drop D, capodastre en case 2, sous « Tablature »", async (_nom, abc) => {
    expect(await joue(abc, { Accordage: "drop-d", Capodastre: 2, Affichage: "tablature" })).toEqual(selonLeLecteurAbc(abc));
  }, 60_000);
  it.each(AIRS.slice(0, 2))("%s, sur une sept cordes, une octave plus bas", async (_nom, abc) => {
    expect(await joue(abc, { Accordage: "standard-7", Octave: -1 })).toEqual(selonLeLecteurAbc(abc, -1));
  }, 60_000);
});

describe("les cases relues, là où la réponse se calcule à la main", () => {
  it("la gamme de do 3 à do 4 se grave en première position", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\nC, D, E, F, | G, A, B, C |]");
    expect(r.lu!.groupes.map((g) => g.cases.map((c) => [c.corde, c.frette]))).toEqual(
      [[[5, 3]], [[4, 0]], [[4, 2]], [[4, 3]], [[3, 0]], [[3, 2]], [[2, 0]], [[2, 1]]]);
  }, 60_000);
  it("si 4, ré 4, sol 4 en septième position", async () => {
    const r = await graver("X:1\nM:3/4\nL:1/4\nK:C\nB D G |]");
    expect(r.lu!.groupes.map((g) => g.cases.map((c) => [c.corde, c.frette]))).toEqual([[[1, 7]], [[3, 7]], [[2, 8]]]);
  }, 60_000);
  it("une note liée garde sa hauteur et sa place au-delà de la barre, et la note suivante non liée retrouve l'armure", async () => {
    const abc = "X:1\nM:4/4\nL:1/4\nK:C\nC D E F | ^c4- | c2 c2 |]";
    const r = await graver(abc);
    const cases = r.lu!.groupes.map((g) => g.cases[0]);
    expect(await joue(abc)).toEqual([[60], [62], [64], [65], [73], [73], [72]]);
    expect([cases[5].corde, cases[5].frette]).toEqual([cases[4].corde, cases[4].frette]);
    // Le lecteur ABC joue la liaison d'un seul trait : la suite n'est pas une seconde attaque.
    expect(selonLeLecteurAbc(abc)).toEqual([[60], [62], [64], [65], [73], [72]]);
  }, 60_000);
  it("le Humdrum garde l'altération d'armure que Verovio perd : 4f# sous *k[f#] est un fa dièse", async () => {
    const kern = "**kern\n*clefG2\n*k[f#]\n*M4/4\n4f#\n4f\n4g\n4a\n=\n4b\n4cc#\n2dd\n==\n*-\n";
    expect(await joue(kern)).toEqual([[66], [65], [67], [69], [71], [73], [74]]);
  }, 60_000);
  it("un MEI en si bémol, sans altération sonnante écrite : l'armure fait les bémols, un bécarre écrit vaut jusqu'à la barre", async () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4" keysig="2f"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note dur="4" pname="b" oct="3"/><note dur="4" pname="e" oct="4"/><note dur="4" pname="e" oct="4" accid="n"/><note dur="4" pname="e" oct="4"/></layer></staff></measure>
<measure n="2"><staff n="1"><layer n="1"><note dur="2" pname="e" oct="4"/><note dur="2" pname="b" oct="4"/></layer></staff></measure></section></score></mdiv></body></music></mei>`;
    expect(await joue(mei)).toEqual([[58], [63], [64], [64], [63], [70]]);
  }, 60_000);
  it("un MusicXML de guitare en clé de sol à 8 en bas garde sa hauteur : do 4 en case 1 de la deuxième corde", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitare</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note></measure></part></score-partwise>`;
    const r = await graver(xml);
    expect(r.lu!.groupes.map((g) => g.cases.map((c) => [c.corde, c.frette]))).toEqual([[[2, 1]], [[1, 0]]]);
  }, 60_000);
});

const PIANO = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>
<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type><staff>2</staff></note>
</measure></part></score-partwise>`;
const DO = "X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G4 |]";

describe("chaque réglage agit sur la gravure", () => {
  it("« Affichage » : la portée en clé de sol à 8 en bas et la tablature sans hampes, ou la tablature seule avec ses hampes", async () => {
    const deux = (await graver(DO)).lu!, seule = (await graver(DO, { Affichage: "tablature" })).lu!;
    expect(deux.portees).toBe(2);
    expect(deux.cles).toEqual(expect.arrayContaining(["E052", "E06D"]));
    expect(deux.groupes.every((g) => !g.hampe)).toBe(true);
    expect(seule.portees).toBe(1);
    expect(seule.cles).toEqual(["E06D"]);
    expect(seule.groupes.every((g) => g.hampe)).toBe(true);
  }, 60_000);
  it("« Accordage » : sept lignes pour la sept cordes, et l'accordage gravé au-dessus", async () => {
    const r = await graver(DO, { Accordage: "standard-7" });
    expect(r.lu!.lignes).toBe(7);
    expect((await graver(DO, { Accordage: "drop-d" })).lu!.indications).toEqual(["Drop D (D A D G B E)"]);
    expect((await graver(DO)).lu!.indications).toEqual([]);
  }, 60_000);
  it("« Capodastre » : les cases se comptent depuis lui, et « Capo 3 » est gravé", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\nG4 |]", { Capodastre: 3 });
    expect(r.lu!.groupes[0].cases.map((c) => [c.corde, c.frette])).toEqual([[1, 0]]);
    expect(r.lu!.indications).toEqual(["Capo 3"]);
  }, 60_000);
  it("« Dernière case » : un do 6 se joue en case 20, et se refuse sous une dernière case 19", async () => {
    expect((await graver("X:1\nM:4/4\nL:1/4\nK:C\nc'4 |]")).erreurRendue).toBeFalsy();
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\nc'4 |]", { "Dernière case": 19 });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain("C6, mesure 1 : hors de la tessiture de l'accordage, de E2 à B5");
  }, 60_000);
  it("« Écart » : sol 2 et si 4 ensemble se refusent sous 4 et se jouent sous 5", async () => {
    const accord = "X:1\nM:4/4\nL:1/4\nK:C\n[G,,B]4 |]";
    const r = await graver(accord);
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain("accord G2 B4, mesure 1 : plus large que l'écart de 4 cases");
    const large = (await graver(accord, { "Écart": 5 })).lu!.groupes[0].cases.map((c) => [c.corde, c.frette]);
    expect(large.sort((a, b) => a[0] - b[0])).toEqual([[1, 7], [6, 3]]);
  }, 60_000);
  it("« Octave » : la guitare joue une octave plus bas, et le message le dit", async () => {
    const r = await graver(DO, { Octave: -1 });
    expect(r.message).toContain("transposée de −1 octave(s)");
    expect(r.lu!.groupes[0].cases.map((c) => [c.corde, c.frette])).toEqual([[5, 3]]);
  }, 60_000);
  it("« Portée » : la première ou la seconde d'une partition de piano, et au-delà la dernière", async () => {
    const haut = await graver(PIANO), bas = await graver(PIANO, { "Portée": 2 }), loin = await graver(PIANO, { "Portée": 9 });
    expect(haut.lu!.groupes[0].cases.map((c) => [c.corde, c.frette])).toEqual([[1, 0]]);
    expect(haut.message).toContain("portée 1 sur 2");
    expect(bas.lu!.groupes[0].cases.map((c) => [c.corde, c.frette])).toEqual([[5, 3]]);
    expect(loin.message).toContain("portée 2 sur 2");
    expect(loin.lu!.groupes.map((g) => g.cases.map((c) => [c.corde, c.frette]))).toEqual(bas.lu!.groupes.map((g) => g.cases.map((c) => [c.corde, c.frette])));
  }, 60_000);
  it("« Format » : imposer le MEI à un texte ABC le fait refuser", async () => {
    expect((await graver(DO, { Format: "mei" })).erreurRendue).toBe(true);
  }, 60_000);
  it("« Largeur », « Échelle », « Déroulé » et « Page » changent la page", async () => {
    const long = `X:1\nM:4/4\nL:1/4\nK:C\n${"C D E F | G A B c | ".repeat(24)}|]`;
    const base = await graver(long);
    for (const reglages of [{ Largeur: 3000 }, { "Échelle": 80 }, { "Déroulé": "oui" }, { Page: 2 }] as Reglages[]) {
      const autre = await graver(long, reglages);
      expect(autre.erreurRendue, JSON.stringify(reglages)).toBeFalsy();
      expect(autre.svg, JSON.stringify(reglages)).not.toBe(base.svg);
    }
    expect(base.message).toMatch(/page 1 sur [2-9]/);
  }, 120_000);
});

describe("ce qui ne se joue pas ou ne se grave pas est dit", () => {
  it("une note sous la corde la plus grave est refusée, nommée avec sa mesure et la tessiture", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\nC D E F | C,,4 |]");
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toBe("Partition ABC refusée pour la guitare, rien n'est gravé : C2, mesure 2 : hors de la tessiture de l'accordage, de E2 à C6");
  }, 60_000);
  it("un accord qui exige deux fois la sixième corde est refusé", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\n[E,,F,,]4 |]");
    expect(r.message).toContain("accord E2 F2, mesure 1 : deux notes exigent la même corde");
  }, 60_000);
  it("une hauteur entre deux cases est refusée", async () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note dur="1" pname="a" oct="4" accid="1qs"/></layer></staff></measure></section></score></mdiv></body></music></mei>`;
    expect((await graver(mei)).message).toContain("A4, mesure 1 : hauteur entre deux cases");
  }, 60_000);
  it("une note d'ornement reste sur la portée, absente de la tablature, et le message la compte", async () => {
    const r = await graver("X:1\nM:4/4\nL:1/4\nK:C\n{g}A2 B2 |]");
    expect(r.erreurRendue).toBeFalsy();
    expect(r.message).toContain("1 note(s) d'ornement absente(s) de la tablature");
    expect(r.lu!.groupes.map((g) => g.cases.length)).toEqual([1, 1]);
  }, 60_000);
  it("ce que la lecture ABC refuse, elle le refuse comme la gravure, avec le même message", async () => {
    const abc = "X:1\nM:4/4\nL:1/4\nK:C\nV:1\nC D E F |\nV:2\nE F G A |]";
    const gravee = await lancerFiche(F("partition-verovio"), { Notation: abc }, { entrees: [null] });
    const guitare = await graver(abc);
    expect(guitare.erreurRendue).toBe(true);
    expect(guitare.message).toBe(gravee.message);
  }, 60_000);
});
