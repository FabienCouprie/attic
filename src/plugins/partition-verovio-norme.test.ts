// @vitest-environment jsdom
// plugins/partition-verovio-norme.test.ts — Ce qu'un musicien lit sur la partition gravée, contre les normes.
//
// LA REVUE DES NOTATIONS EN TEXTE, quatrième format, 2026-11-22. La Partition gravée rendait un SVG,
// et rien ne regardait ce qui y est dessiné. `partition-lue.ts` le relit comme un musicien, et ce
// qu'il lit doit être ce que dit la norme du texte gravé : la table ABC est celle du garde
// d'ABC → MIDI (`abc-vers-midi-norme.test.ts`), tirée de la norme ABC 2.1 ; les cas MusicXML et MEI
// sont écrits d'après MusicXML 4.0 et MEI 5. Les temps sont comptés en noires.
//
// CE QUE LE LECTEUR ABC D'ATTIC REFUSE, LE GRAVEUR LE REFUSE, sans alternative sous la règle
// « refuser, nommé » : il gravait en vert douze des treize fautes du garde d'ABC → MIDI, et tombait
// sur l'erreur brute « divide by zero » pour la treizième. Les lignes du message sont les mêmes.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { lireGravure } from "./partition-lue";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const graver = (texte: string) => lancerFiche(F("partition-verovio"), { Notation: texte }, { entrees: [null] });
const T = (corps: string, entete = "M:4/4\nL:1/4") => `X:1\nT:Essai\n${entete}\nQ:1/4=60\n${corps}`;
const XML = (mesures: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1">${mesures}</part></score-partwise>`;
const ATTRIBUTS = "<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>";
const N = (step: string, oct: number, dur: number, type: string, plus = "") => `<note>${plus.includes("<chord/>") ? "<chord/>" : ""}<pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration><voice>${plus.includes("v2") ? 2 : 1}</voice><type>${type}</type>${plus.replace(/<chord\/>|v2/g, "")}</note>`;

describe("CE QU'UN MUSICIEN LIT SUR LA PARTITION EST CE QUE DIT LA NORME", () => {
  it.each([
    ["hauteurs et octaves", T("K:C\nC D E F | G A B c | c' C, z2 |"),
      [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4], [67, 4, 5], [69, 5, 6], [71, 6, 7], [72, 7, 8], [84, 8, 9], [48, 9, 10]]],
    ["L par défaut, M:4/4 donne 1/8", "X:1\nT:E\nM:4/4\nQ:1/4=60\nK:C\nC D|", [[60, 0, 0.5], [62, 0.5, 1]]],
    ["L par défaut, M:2/4 donne 1/16", "X:1\nT:E\nM:2/4\nQ:1/4=60\nK:C\nC D|", [[60, 0, 0.25], [62, 0.25, 0.5]]],
    ["durées", T("K:C\nC2 C/2 C/ C// C3/2 C3 |", "M:4/4\nL:1/8"),
      [[60, 0, 1], [60, 1, 1.25], [60, 1.25, 1.5], [60, 1.5, 1.625], [60, 1.625, 2.375], [60, 2.375, 3.875]]],
    ["rythmes pointés", T("K:C\nC>D E<F G>>A |", "M:4/4\nL:1/8"),
      [[60, 0, 0.75], [62, 0.75, 1], [64, 1, 1.25], [65, 1.25, 2], [67, 2, 2.875], [69, 2.875, 3]]],
    ["triolet", T("K:C\n(3CDE F2 |", "M:4/4\nL:1/8"), [[60, 0, 0.333], [62, 0.333, 0.667], [64, 0.667, 1], [65, 1, 2]]],
    ["duolet en mesure composée", T("K:C\n(2CD E|", "M:6/8\nL:1/8"), [[60, 0, 0.75], [62, 0.75, 1.5], [64, 1.5, 2]]],
    ["quadruplet en mesure composée", T("K:C\n(4CDEF z3|", "M:6/8\nL:1/8"), [[60, 0, 0.375], [62, 0.375, 0.75], [64, 0.75, 1.125], [65, 1.125, 1.5]]],
    ["altérations portées dans la mesure, rendues à la barre", T("K:C\n^F F =F F | F _B B z | ^^C __D z2 |"),
      [[66, 0, 1], [66, 1, 2], [65, 2, 3], [65, 3, 4], [65, 4, 5], [70, 5, 6], [70, 6, 7], [62, 8, 9], [60, 9, 10]]],
    ["armure de sol", T("K:G\nF G |"), [[66, 0, 1], [67, 1, 2]]],
    ["armure de ré mixolydien", T("K:Dmix\nF C |"), [[66, 0, 1], [60, 1, 2]]],
    ["armure de fa dièse mineur", T("K:F#m\nE F G |"), [[64, 0, 1], [66, 1, 2], [68, 2, 3]]],
    ["armure de si bémol", T("K:Bb\nB E |"), [[70, 0, 1], [63, 1, 2]]],
    ["armure de do dièse, si dièse", T("K:C#\nB |"), [[72, 0, 1]]],
    ["armure de do bémol, do bémol", T("K:Cb\nC |"), [[59, 0, 1]]],
    ["liaison de prolongation, à travers la barre", T("K:C\nC2-C2 | C2-|C2 D2 |"), [[60, 0, 4], [60, 4, 8], [62, 8, 10]]],
    ["une liaison porte le dièse à travers la barre", T("K:C\n^F2-|F2 G2|"), [[66, 0, 4], [67, 4, 6]]],
    ["l'altération portée ne vaut que pour la note liée", T("K:C\n^F2-|F2 F2|"), [[66, 0, 4], [65, 4, 6]]],
    ["accord, durées dans les crochets", T("K:C\n[C2E2G2] |"), [[60, 0, 2], [64, 0, 2], [67, 0, 2]]],
    ["silences, et la pause de plusieurs mesures", T("K:C\nz2 C2 | Z2 | D4 |"), [[60, 2, 4], [62, 12, 16]]],
    ["reprise", T("K:C\n|: C D :| E |"), [[60, 0, 1], [62, 1, 2], [60, 2, 3], [62, 3, 4], [64, 4, 5]]],
    ["ornements sans effet sur le temps", T("K:C\n!trill!C .D ~E F |"), [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]]],
    ["notes d'ornement sautées", T("K:C\n{g}A B |"), [[69, 0, 1], [71, 1, 2]]],
    ["clé de fa", T("K:C clef=bass\nC, D, E, F, |"), [[48, 0, 1], [50, 1, 2], [52, 2, 3], [53, 3, 4]]],
    ["MusicXML : deux voix par backup", XML(`<measure number="1">${ATTRIBUTS}${N("C", 5, 4, "half")}${N("D", 5, 4, "half")}<backup><duration>8</duration></backup>${N("C", 4, 8, "whole", "v2")}</measure>`),
      [[60, 0, 4], [72, 0, 2], [74, 2, 4]]],
    ["MusicXML : reprise et fins", XML(`<measure number="1">${ATTRIBUTS}<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>${N("C", 4, 8, "whole")}</measure><measure number="2"><barline location="left"><ending number="1" type="start"/></barline>${N("D", 4, 8, "whole")}<barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure><measure number="3"><barline location="left"><ending number="2" type="start"/></barline>${N("E", 4, 8, "whole")}<barline location="right"><ending number="2" type="discontinue"/></barline></measure>`),
      [[60, 0, 4], [62, 4, 8], [60, 8, 12], [64, 12, 16]]],
    ["MEI", `<?xml version="1.0" encoding="UTF-8"?>\n<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score><scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef><section><measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/><note pname="e" oct="4" dur="4" accid="s"/><note pname="g" oct="4" dur="2"/></layer></staff></measure></section></score></mdiv></body></music></mei>`,
      [[60, 0, 1], [65, 1, 2], [67, 2, 4]]],
  ])("%s", async (_titre, texte, attendu) => {
    const r = await graver(texte);
    expect(r.erreurRendue, r.message).toBe(false);
    const lu = lireGravure(String(r.valeurs[0]));
    expect(lu.inconnus).toEqual([]);
    expect(lu.notes).toEqual(attendu);
  }, 60_000);
});

// LA DURÉE QUI SUIT LE CROCHET D'UN ACCORD vaut pour chacune de ses notes (ABC 2.1, §4.17). Verovio
// gravait « [CEG]2 » à l'unité, et c'est la forme qu'écrit « MIDI → ABC » : deux blanches y devenaient
// deux croches. `abcPourGravure` l'écrit dans chaque note avant la gravure.
describe("UN ACCORD ABC DONT LA DURÉE SUIT LE CROCHET SE GRAVE À SA DURÉE", () => {
  it.each([
    ["accords", T("K:C\n[CEG]2 [C2E2G2] |"), [[60, 0, 2], [64, 0, 2], [67, 0, 2], [60, 2, 4], [64, 2, 4], [67, 2, 4]]],
    ["accord pointé, puis accord à la croche", T("K:C\n[CE]3/2 [CE]/2 D2 |"), [[60, 0, 1.5], [64, 0, 1.5], [60, 1.5, 2], [64, 1.5, 2], [62, 2, 4]]],
    ["en L:1/8", T("K:C\n[CE] [DF]3 [EG]4 |", "M:4/4\nL:1/8"), [[60, 0, 0.5], [64, 0, 0.5], [62, 0.5, 2], [65, 0.5, 2], [64, 2, 4], [67, 2, 4]]],
  ])("%s", async (_titre, abc, attendu) => {
    const r = await graver(abc);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(lireGravure(String(r.valeurs[0])).notes).toEqual(attendu);
  }, 60_000);

  it("par la chaîne MIDI → ABC → Partition gravée, deux accords de blanches restent des blanches", async () => {
    const notes = [[60, 0, 2], [64, 0, 2], [67, 0, 2], [62, 2, 4], [65, 2, 4], [69, 2, 4]];
    const midi = notesVersFichierMidi(notes.map(([note, debut, fin]) => ({ note, debut, fin, velocite: 100 })), 60);
    const abc = await lancerFiche(F("midi-vers-abc"), {}, { entrees: [midi] });
    expect(String(abc.valeurs[0])).toContain("[CEG]4");
    const r = await lancerFiche(F("partition-verovio"), {}, { entrees: [String(abc.valeurs[0])] });
    expect(lireGravure(String(r.valeurs[0])).notes).toEqual(notes);
  }, 60_000);
});

// CE QUE VEROVIO NE SAIT PAS GRAVER EST REFUSÉ, ET NOMMÉ. Décision de Fabien du 2026-11-22, « Refuse
// them, named ». Relu sur la gravure ce jour-là, sous toutes les écritures que la norme permet : deux
// voix bout à bout sur une portée, des fins sans crochet, un K: gravé comme une clé, des liaisons
// d'accord perdues, des n-olets que leur chiffre fait lire deux à quatre fois trop longs.
describe("CE QUE LE GRAVEUR NE SAIT PAS DESSINER EST REFUSÉ, et le message nomme la tournure et sa ligne", () => {
  it.each([
    ["deux voix déclarées", T("V:1\nV:2\nK:C\nV:1\nC D |\nV:2\nE F |"), 7, "V:2"],
    ["deux voix en ligne", T("K:C\n[V:1] C D |\n[V:2] E F |"), 8, "[V:2]"],
    ["une fin alternative", T("K:C\n|: C |1 D :|2 E |]"), 7, "|1"],
    ["une fin alternative entre crochets", T("K:C\n|: C [1 D :|[2 E |]"), 7, "[1"],
    ["un changement de tonalité en ligne", T("K:C\nF [K:G] F |"), 7, "[K:G]"],
    ["un changement de tonalité sur sa ligne", T("K:C\nF F |\nK:G\nF F |"), 8, "K:G"],
    ["la liaison d'une seule note d'un accord", T("K:C\n[C-E]2 [CG]2 |"), 7, "[C-E]2"],
    ["un accord lié", T("K:C\nz2 [CE]2- | [CE]2 D2 |"), 7, "[CE]2-"],
    ["un quintolet en mesure simple", T("K:C\n(5CDEFG z3|", "M:4/4\nL:1/8"), 7, "(5"],
    ["un quintolet au rapport écrit, cinq pour deux", T("K:C\n(5:2:5CDEFG z3|", "M:4/4\nL:1/8"), 7, "(5:2:5"],
    ["un sextolet", T("K:C\n(6CDEFGA z3|", "M:4/4\nL:1/8"), 7, "(6"],
    ["un septolet", T("K:C\n(7CDEFGAB z3|", "M:4/4\nL:1/8"), 7, "(7"],
    ["un nonolet", T("K:C\n(9CDEFGABcd z3|", "M:4/4\nL:1/8"), 7, "(9"],
    ["un quintolet en mesure composée", T("K:C\n(5CDEFG z3|", "M:6/8\nL:1/8"), 7, "(5"],
  ])("%s", async (_titre, abc, ligne, fragment) => {
    const r = await graver(abc);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toMatch(/rien n'est gravé|nothing is engraved/);
    expect(r.message).toMatch(new RegExp(`(ligne|line) ${ligne} `));
    expect(r.message).toContain(`« ${fragment} »`);
  }, 60_000);

  it("par la chaîne MIDI → ABC → Partition gravée, une basse tenue sous la mélodie est refusée, ses voix nommées", async () => {
    const notes = [[48, 0, 4], [60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]];
    const midi = notesVersFichierMidi(notes.map(([note, debut, fin]) => ({ note, debut, fin, velocite: 100 })), 60);
    const abc = await lancerFiche(F("midi-vers-abc"), {}, { entrees: [midi] });
    const r = await lancerFiche(F("partition-verovio"), {}, { entrees: [String(abc.valeurs[0])] });
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain("1, 2");
  }, 60_000);

  it.each([
    ["un quintolet au rapport de l'usage, cinq pour quatre", T("K:C\n(5:4:5CDEFG z3|", "M:4/4\nL:1/8"),
      [[60, 0, 0.4], [62, 0.4, 0.8], [64, 0.8, 1.2], [65, 1.2, 1.6], [67, 1.6, 2]]],
    ["un quadruplet en mesure simple, quatre pour trois", T("K:C\n(4CDEF z|", "M:4/4\nL:1/8"),
      [[60, 0, 0.375], [62, 0.375, 0.75], [64, 0.75, 1.125], [65, 1.125, 1.5]]],
    ["une seule voix déclarée", T("V:1\nK:C\nV:1\nC D E F |"), [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]]],
    ["un changement de clé seule", T("K:C\nC D [K:clef=bass] C, D, |"), [[48, 2, 3], [50, 3, 4], [60, 0, 1], [62, 1, 2]].sort((a, b) => a[1] - b[1])],
  ])("ce qu'il sait dessiner reste gravé : %s", async (_titre, abc, attendu) => {
    const r = await graver(abc);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(lireGravure(String(r.valeurs[0])).notes).toEqual(attendu);
  }, 60_000);
});

// LE TEMPO SE GRAVE. Décision de Fabien du 2026-11-22, « Engrave the tempo » : « Q:1/4=60 » se gravait
// en texte vide, et « Q:"Allegro" 1/4=60 » ne gravait que « Allegro ».
describe("LE TEMPO SE GRAVE, comme le dit Q:", () => {
  const air = (q: string, entete = "M:4/4\nL:1/4") => `X:1\nT:Essai\n${entete}\n${q}\nK:C\nC D E F |`;
  it.each([
    ["une noire", air("Q:1/4=60"), ["\u2669 = 60"]],
    ["une noire pointée", air("Q:3/8=50", "M:6/8\nL:1/8"), ["\u266A. = 50"]],
    ["une blanche", air("Q:1/2=80"), ["\u{1D15E} = 80"]],
    ["un mouvement nommé avant", air("Q:\"Allegro\" 1/4=120"), ["Allegro \u2669 = 120"]],
    ["un mouvement nommé après", air("Q:1/4=120 \"Allegro\""), ["Allegro \u2669 = 120"]],
    ["l'ancienne forme, en unités L", air("Q:120", "M:4/4\nL:1/8"), ["\u266A = 120"]],
    ["un mouvement sans chiffre", air("Q:\"Andante\""), ["Andante"]],
    ["sans Q:", "X:1\nT:Essai\nM:4/4\nL:1/4\nK:C\nC D E F |", []],
  ])("%s", async (_titre, abc, attendu) => {
    const r = await graver(abc);
    expect(r.erreurRendue, r.message).toBe(false);
    const lu = lireGravure(String(r.valeurs[0]));
    expect(lu.tempo).toEqual(attendu);
    expect(lu.notes).toEqual([[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]].map(([m, a, b]) => [m, a * (abc.includes("L:1/8") ? 0.5 : 1), b * (abc.includes("L:1/8") ? 0.5 : 1)]));
  }, 60_000);

  it("un tempo en cours de morceau", async () => {
    const r = await graver("X:1\nT:Essai\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\nC D E F | [Q:1/4=90] G A B c |");
    expect(lireGravure(String(r.valeurs[0])).tempo).toEqual(["\u2669 = 60", "\u2669 = 90"]);
  }, 60_000);
});

// LE HUMDRUM SE LIT. Décision de Fabien du 2026-11-22, « Load the Humdrum module » : le module chargé,
// `verovio/wasm`, ne le connaît pas, et un fichier `**kern` correct était refusé comme une faute du texte.
// Les cas suivent la référence de **kern : une hauteur s'écrit absolue, « f » est un fa naturel
// quelle que soit l'armure, « f# » un fa dièse, « fn » un fa naturel dont le bécarre se dessine.
describe("LE HUMDRUM SE GRAVE", () => {
  it.each([
    ["**kern, une colonne", "**kern\n*clefG2\n*M4/4\n4c\n4d\n4e\n4f\n=\n2g\n2a\n==\n*-",
      [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4], [67, 4, 6], [69, 6, 8]]],
    ["**kern, les hauteurs absolues sous une armure", "**kern\n*clefG2\n*k[f#]\n*M4/4\n4f\n4fn\n4f#\n4g\n==\n*-",
      [[65, 0, 1], [65, 1, 2], [66, 2, 3], [67, 3, 4]]],
    ["**kern, deux colonnes", "**kern\t**kern\n*clefF4\t*clefG2\n*M4/4\t*M4/4\n1C\t2c\n.\t2d\n==\t==\n*-\t*-",
      [[48, 0, 4], [60, 0, 2], [62, 2, 4]]],
  ])("%s", async (_titre, kern, attendu) => {
    const r = await graver(kern);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toMatch(/^HUMDRUM/);
    expect(lireGravure(String(r.valeurs[0])).notes).toEqual(attendu);
  }, 60_000);
});

describe("CE QUE LE LECTEUR ABC REFUSE, LE GRAVEUR LE REFUSE, avec les mêmes fautes nommées", () => {
  it.each([
    ["une durée divisée par zéro", T("K:C\nC/0 D|")],
    ["une durée nulle", T("K:C\nC0 D|")],
    ["une durée nulle dans un accord", T("K:C\n[C0E] D|")],
    ["un silence de durée nulle", T("K:C\nC z0 D|")],
    ["une unité nulle en ligne", T("K:C\nC [L:1/0] D|")],
    ["un accord jamais refermé", T("K:C\n[CEG D E|")],
    ["une liaison entre deux hauteurs", T("K:C\nC-D E F|")],
    ["une liaison vers un silence", T("K:C\nC2- z2 |")],
    ["une liaison dont la note suivante écrit une autre altération", T("K:C\n^F2-|=F2 G2|")],
    ["une liaison qui finit le morceau", T("K:C\nC2 D2-|")],
    ["un n-olet inachevé à la fin du morceau", T("K:C\n(3CD|")],
    ["un n-olet coupé par un autre", T("K:C\n(3CD(3EFG A|")],
    ["une unité nulle dans l'en-tête", T("K:C\nC D|", "M:4/4\nL:1/0")],
  ])("%s", async (_titre, abc) => {
    const r = await graver(abc);
    const lecteur = await lancerFiche(F("abc-vers-midi"), { ABC: abc }, { entrees: [null] });
    expect(lecteur.erreurRendue, lecteur.message).toBe(true);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toMatch(/rien n'est gravé|nothing is engraved/);
    // Les fautes, ligne par ligne, sont celles que nomme ABC → MIDI.
    expect(r.message.split("\n").slice(1)).toEqual(lecteur.message.split("\n").slice(1));
  }, 60_000);
});

describe("UN TEXTE QUI N'EST PAS UNE PARTITION N'EST PAS GRAVÉ, et le refus le nomme", () => {
  it("un ABC dont le titre cite « **kern » reste un ABC", async () => {
    const r = await graver("X:1\nT:Etude **kern\nM:4/4\nL:1/4\nK:C\nC D E F |");
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toMatch(/^ABC/);
    expect(lireGravure(String(r.valeurs[0])).notes).toEqual([[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]]);
  }, 60_000);

  it.each([
    ["un SVG", `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`, "svg"],
    ["un opus MusicXML, qui ne fait que citer des partitions", `<?xml version="1.0"?><opus><title>O</title><score xlink:href="a.musicxml"/></opus>`, "opus"],
  ])("%s", async (_titre, xml, racine) => {
    const r = await graver(xml);
    expect(r.erreurRendue).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain(`« ${racine} »`);
  }, 60_000);
});
