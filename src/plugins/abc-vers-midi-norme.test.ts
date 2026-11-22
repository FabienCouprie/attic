// plugins/abc-vers-midi-norme.test.ts — Le lecteur ABC contre la norme ABC 2.1, par ce que le nœud rend.
//
// LA REVUE DES NOTATIONS EN TEXTE, deuxième format, 2026-11-22. La table vient de la norme, et non du
// code : chaque cas donne ses notes attendues, en hauteur, départ et fin, comptés en temps, le tempo étant
// fixé à soixante la noire. Mesurée le jour même, elle passait entière.
//
// ET LES QUATRE FAUTES QUI FAISAIENT JOUER FAUX EN SILENCE, décision de Fabien du 2026-11-22 : une durée
// nulle, un accord jamais refermé, une liaison entre deux hauteurs, un n-olet inachevé. Le morceau est
// refusé, et le message nomme la faute. Ce que le lecteur saute sans changer ce qu'on entend, les notes
// d'ornement, une directive %%MIDI, une tonalité inconnue, reste un avertissement.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";

const fiche = registre.trouverDef("abc-vers-midi") as unknown as FicheLancable;
const T = (corps: string, entete = "M:4/4\nL:1/4") => `X:1\nT:Essai\n${entete}\nQ:1/4=60\n${corps}`;

async function rendu(abc: string) {
  const r = await lancerFiche(fiche, { ABC: abc, "Accords chiffrés": "ignorer" }, { entrees: [null] });
  const midi = r.valeurs[1];
  const notes = midi instanceof File ? (await notesDuMidi(midi)) ?? [] : [];
  const arrondi = (x: number) => Math.round(x * 1000) / 1000;
  return {
    r,
    notes: notes.map((n) => [n.note, arrondi(n.debut), arrondi(n.fin)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]),
  };
}

describe("la norme ABC 2.1, cas par cas", () => {
  const t = 1 / 3;
  it.each([
    ["hauteurs et octaves", T("K:C\nC D E F | G A B c | c' C, z2 |"),
      [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4], [67, 4, 5], [69, 5, 6], [71, 6, 7], [72, 7, 8], [84, 8, 9], [48, 9, 10]]],
    ["L par défaut, M:4/4 donne 1/8", "X:1\nT:E\nM:4/4\nQ:1/4=60\nK:C\nC D|", [[60, 0, 0.5], [62, 0.5, 1]]],
    ["L par défaut, M:2/4 donne 1/16", "X:1\nT:E\nM:2/4\nQ:1/4=60\nK:C\nC D|", [[60, 0, 0.25], [62, 0.25, 0.5]]],
    ["L par défaut, M:3/4 donne 1/8", "X:1\nT:E\nM:3/4\nQ:1/4=60\nK:C\nC D|", [[60, 0, 0.5], [62, 0.5, 1]]],
    ["durées", T("K:C\nC2 C/2 C/ C// C3/2 C3 |", "M:4/4\nL:1/8"),
      [[60, 0, 1], [60, 1, 1.25], [60, 1.25, 1.5], [60, 1.5, 1.625], [60, 1.625, 2.375], [60, 2.375, 3.875]]],
    ["rythmes pointés", T("K:C\nC>D E<F G>>A |", "M:4/4\nL:1/8"),
      [[60, 0, 0.75], [62, 0.75, 1], [64, 1, 1.25], [65, 1.25, 2], [67, 2, 2.875], [69, 2.875, 3]]],
    ["triolet", T("K:C\n(3CDE F2 |", "M:4/4\nL:1/8"), [[60, 0, 0.333], [62, 0.333, 0.667], [64, 0.667, 1], [65, 1, 2]]],
    ["quintolet en mesure simple", T("K:C\n(5CDEFG z3|", "M:4/4\nL:1/8"),
      [[60, 0, 0.2], [62, 0.2, 0.4], [64, 0.4, 0.6], [65, 0.6, 0.8], [67, 0.8, 1]]],
    ["duolet en mesure composée", T("K:C\n(2CD E|", "M:6/8\nL:1/8"), [[60, 0, 0.75], [62, 0.75, 1.5], [64, 1.5, 2]]],
    ["altérations portées dans la mesure, rendues à la barre", T("K:C\n^F F =F F | F _B B z | ^^C __D z2 |"),
      [[66, 0, 1], [66, 1, 2], [65, 2, 3], [65, 3, 4], [65, 4, 5], [70, 5, 6], [70, 6, 7], [62, 8, 9], [60, 9, 10]]],
    ["armure de sol", T("K:G\nF G |"), [[66, 0, 1], [67, 1, 2]]],
    ["armure de ré mixolydien", T("K:Dmix\nF C |"), [[66, 0, 1], [60, 1, 2]]],
    ["armure de fa dièse mineur", T("K:F#m\nE F G |"), [[64, 0, 1], [66, 1, 2], [68, 2, 3]]],
    ["armure de si bémol", T("K:Bb\nB E |"), [[70, 0, 1], [63, 1, 2]]],
    ["armure de do dièse, si dièse", T("K:C#\nB |"), [[72, 0, 1]]],
    ["armure de do bémol, do bémol", T("K:Cb\nC |"), [[59, 0, 1]]],
    ["liaison de prolongation, à travers la barre", T("K:C\nC2-C2 | C2-|C2 D2 |"), [[60, 0, 4], [60, 4, 8], [62, 8, 10]]],
    ["accords", T("K:C\n[CEG]2 [C2E2G2] |"), [[60, 0, 2], [64, 0, 2], [67, 0, 2], [60, 2, 4], [64, 2, 4], [67, 2, 4]]],
    ["silences, et la pause de plusieurs mesures", T("K:C\nz2 C2 | Z2 | D4 |"), [[60, 2, 4], [62, 12, 16]]],
    ["reprise", T("K:C\n|: C D :| E |"), [[60, 0, 1], [62, 1, 2], [60, 2, 3], [62, 3, 4], [64, 4, 5]]],
    ["fins alternatives", T("K:C\n|: C |1 D :|2 E |]"), [[60, 0, 1], [62, 1, 2], [60, 2, 3], [64, 3, 4]]],
    ["champ en ligne", T("K:C\nF [K:G] F | [L:1/8] F F |"), [[65, 0, 1], [66, 1, 2], [66, 2, 2.5], [66, 2.5, 3]]],
    ["tempo en noire pointée", "X:1\nT:E\nM:6/8\nL:1/8\nQ:3/8=60\nK:C\nC D E|", [[60, 0, 0.333], [62, 0.333, 0.667], [64, 0.667, 1]]],
    ["deux voix", T("V:1\nV:2\nK:C\nV:1\nC D |\nV:2\nE F |"), [[60, 0, 1], [64, 0, 1], [62, 1, 2], [65, 1, 2]]],
    ["ornements sans effet sur le temps", T("K:C\n!trill!C .D ~E F |"), [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]]],
    ["notes d'ornement sautées", T("K:C\n{g}A B |"), [[69, 0, 1], [71, 1, 2]]],
    ["commentaire et suite de ligne", T("K:C\nC D % un commentaire\nE F |"), [[60, 0, 1], [62, 1, 2], [64, 2, 3], [65, 3, 4]]],
  ])("%s", async (_titre, abc, attendu) => {
    void t;
    const { r, notes } = await rendu(abc);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(notes).toEqual(attendu);
  });
});

describe("UNE FAUTE QUI FERAIT JOUER FAUX REFUSE LE MORCEAU, et le message la nomme", () => {
  // La ligne fautive est la septième du morceau, après X:, T:, M:, L:, Q: et K:.
  it.each([
    ["une durée divisée par zéro", T("K:C\nC/0 D|"), "C/0"],
    ["une durée nulle", T("K:C\nC0 D|"), "C0"],
    ["une durée nulle dans un accord", T("K:C\n[C0E] D|"), "C0"],
    ["un silence de durée nulle", T("K:C\nC z0 D|"), "z0"],
    ["une unité nulle en ligne", T("K:C\nC [L:1/0] D|"), "L:1/0"],
    ["un accord jamais refermé", T("K:C\n[CEG D E|"), "[CEG D E|"],
    ["une liaison entre deux hauteurs", T("K:C\nC-D E F|"), "C-"],
    ["une liaison vers un silence", T("K:C\nC2- z2 |"), "C2-"],
    ["une liaison d'accord dont une hauteur s'arrête", T("K:C\n[CE]2-[CG]2 |"), "[CE]2-"],
    ["une liaison qui finit le morceau", T("K:C\nC2 D2-|"), "D2-"],
    ["un n-olet inachevé à la fin du morceau", T("K:C\n(3CD|"), "(3"],
    ["un n-olet coupé par un autre", T("K:C\n(3CD(3EFG A|"), "(3"],
  ])("%s", async (_titre, abc, fautif) => {
    const { r, notes } = await rendu(abc);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(notes).toEqual([]);
    expect(r.message).toContain(`« ${fautif} »`);
    expect(r.message).toMatch(/ligne 7 /);
  });

  it.each([["L:1/0"], ["L:0"]])("une unité nulle dans l'en-tête, %s, à sa ligne", async (unite) => {
    const { r, notes } = await rendu(T("K:C\nC D|", `M:4/4\n${unite}`));
    expect(r.erreurRendue, r.message).toBe(true);
    expect(notes).toEqual([]);
    expect(r.message).toContain(`ligne 4 « ${unite} » : durée nulle`);
  });

  it("LE MESSAGE NOMME CHAQUE FAUTE, et non la première seulement", async () => {
    const { r } = await rendu(T("K:C\nC0 D|\n[CE F|"));
    expect(r.message).toMatch(/2 faute/);
    expect(r.message).toContain("ligne 7 « C0 D| »");
    expect(r.message).toContain("ligne 8 « [CE F| »");
  });
});

describe("CE QUE LA NORME PERMET N'EST PAS REFUSÉ", () => {
  it.each([
    ["une liaison à travers la barre", T("K:C\nC2-|C2 D2|"), [[60, 0, 4], [62, 4, 6]]],
    ["une liaison vers un accord qui garde la hauteur", T("K:C\nC2-[CE]2 |"), [[60, 0, 4], [64, 2, 4]]],
    ["une liaison vers la première fin, que la seconde ne prolonge pas", T("K:C\n|: C2- |1 C2 :|2 D2 |]"),
      [[60, 0, 4], [60, 4, 6], [62, 6, 8]]],
    ["une liaison qui garde l'altération écrite à nouveau", T("K:C\n^F2-|^F2 G2|"), [[66, 0, 4], [67, 4, 6]]],
    ["un n-olet à travers la barre", T("K:C\n(3CD|E F|"), [[60, 0, 0.667], [62, 0.667, 1.333], [64, 1.333, 2], [65, 2, 3]]],
    ["un n-olet coupé par la fin de ligne", T("K:C\n(3CD\nE F|"), [[60, 0, 0.667], [62, 0.667, 1.333], [64, 1.333, 2], [65, 2, 3]]],
  ])("%s", async (_titre, abc, attendu) => {
    const { r, notes } = await rendu(abc);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(notes).toEqual(attendu);
  });
});

describe("ce que le lecteur saute sans changer ce qu'on entend reste un avertissement", () => {
  it.each([
    ["des notes d'ornement", T("K:C\n{g}A B|")],
    ["une directive %%MIDI", T("%%MIDI program 40\nK:C\nC D|")],
    ["une tonalité inconnue", T("K:Hx\nC D|")],
    ["un caractère inconnu", T("K:C\nC D @ E|")],
  ])("%s", async (_titre, abc) => {
    const { r, notes } = await rendu(abc);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(notes.length).toBeGreaterThan(0);
    expect(r.message).toMatch(/non lu/);
  });
});
