// plugins/symboles-accords.test.ts — Un symbole d'accord se lit de la même façon partout.
//
// LA REVUE DES NOTATIONS EN TEXTE, cinquième format, 2026-11-22. Les lecteurs de symboles ne se
// répondaient pas de la même façon : l'ABC lisait « Cø7 », « Cm7(b5) » et « Cm(maj7) », la Grille
// les refusait, « Accords → Notation » les perdait sans les nommer ; « CΔ7 », « Bm7♭5 » et « C7♯9 »
// n'étaient lus nulle part, alors que la table d'accords d'Attic écrit elle-même « ♭ » et « ♯ ».
// « N.C. » se taisait dans l'ABC, était refusé par la Grille, perdu par « Accords → Notation ».
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : un seul lecteur, qui lit ces écritures usuelles ; « N.C. » est
// un accord silencieux, qui prend sa place dans le temps. La table vient de l'usage, et non du code :
// chaque cas donne les classes de hauteur et la basse attendues.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { Note } from "tonal";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";
import { QUALITES } from "../audio/qualites-accords";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const PC = (m: number) => ((m % 12) + 12) % 12;
/** Ce qu'un accord fait entendre : ses classes, et sa basse. */
const lu = (h: number[]) => ({ classes: [...new Set(h.map(PC))].sort((a, b) => a - b), basse: PC(Math.min(...h)) });
const hauteursLigne = (ligne: string) => ligne.split(/\s+/)[0].split("+").map((n) => Note.midi(n)!);

async function parLaGrille(symbole: string) {
  const r = await lancerFiche(F("tonal-grille"), { Progression: symbole, Mode: "plaque" }, { entrees: [null] });
  expect(r.erreurRendue, r.message).toBe(false);
  return lu(hauteursLigne(String(r.valeurs[0]).split("\n")[1]));
}
async function parAccordsVersNotation(symbole: string) {
  const r = await lancerFiche(F("accords-vers-notation"), { Source: "accords" }, { entrees: [null, null, `${symbole} (2.0s)`] });
  expect(r.valeurs[0], r.message).toBeTruthy();
  return lu(hauteursLigne(String(r.valeurs[0]).split("\n")[1]));
}
async function parLAbc(symbole: string) {
  const r = await lancerFiche(F("abc-vers-midi"), { ABC: `X:1\nT:t\nM:4/4\nL:1/4\nQ:1/4=60\nK:C\n"${symbole}"C4|`, "Accords chiffrés": "jouer" }, { entrees: [null] });
  expect(r.erreurRendue, r.message).toBe(false);
  expect(r.message, "aucun élément ne doit être sauté").not.toMatch(/non lu/);
  const notes = (await notesDuMidi(r.valeurs[1] as File)) ?? [];
  return lu(notes.filter((n) => n.canal === 1).map((n) => n.note));
}

describe("UN SYMBOLE SE LIT DE LA MÊME FAÇON PAR LES TROIS LECTEURS, écritures usuelles comprises", () => {
  it.each([
    ["le demi-diminué en ø", "Bø7", [2, 5, 9, 11], 11],
    ["le demi-diminué entre parenthèses", "Bm7(b5)", [2, 5, 9, 11], 11],
    ["le demi-diminué en bémol d'imprimerie", "Bm7♭5", [2, 5, 9, 11], 11],
    ["le demi-diminué que le détecteur écrivait", "Bmin7b5", [2, 5, 9, 11], 11],
    ["le mineur septième majeure", "Cm(maj7)", [0, 3, 7, 11], 0],
    ["la septième majeure en triangle", "CΔ7", [0, 4, 7, 11], 0],
    ["la neuvième augmentée en dièse d'imprimerie", "C7♯9", [0, 3, 4, 7, 10], 0],
    ["une fondamentale en bémol d'imprimerie", "B♭", [2, 5, 10], 10],
    ["une fondamentale en dièse d'imprimerie", "F♯m", [1, 6, 9], 6],
    ["un renversement", "C/E", [0, 4, 7], 4],
    ["la sixte-neuvième", "C6/9", [0, 2, 4, 7, 9], 0],
  ])("%s, « %s »", async (_titre, symbole, classes, basse) => {
    const attendu = { classes, basse };
    expect(await parLaGrille(symbole), "Grille").toEqual(attendu);
    expect(await parAccordsVersNotation(symbole), "Accords → Notation").toEqual(attendu);
    expect(await parLAbc(symbole), "ABC").toEqual(attendu);
  });
});

// LA TABLE D'ACCORDS D'ATTIC ET LE LECTEUR SE RÉPONDENT. Mesuré le 2026-11-22 : sur trente-trois
// qualités, Tonal en lisait trois autrement que la table, « 7♭5♭9 » et « 7♭5♯9 » avec une quinte juste
// de trop, et « m13 » sans sa onzième ; un symbole écrit par Attic se relisait faux.
describe("CHAQUE QUALITÉ DE LA TABLE D'ATTIC SE RELIT TELLE QU'ELLE EST ÉCRITE", () => {
  it.each(QUALITES.map((q) => [q.id, q.symbole, q.intervalles] as const))("%s, « C%s »", async (_id, symbole, intervalles) => {
    const attendu = { classes: [...new Set(intervalles.map((i) => i % 12))].sort((a, b) => a - b), basse: 0 };
    expect(await parLaGrille(`C${symbole}`), "Grille").toEqual(attendu);
    expect(await parLAbc(`C${symbole}`), "ABC").toEqual(attendu);
  });
});

// DÉCISION DE FABIEN DU 2026-11-22, « A readable symbol ». Mesuré avant : « E G C » était nommé
// « E minor augmented », la première lecture de Tonal, et la sortie portait un nom long, « C major »,
// qu'aucun lecteur de symboles ne relisait.
describe("L'ACCORD REND UN SYMBOLE QUE LES LECTEURS RELISENT, les renversements par barre oblique", () => {
  const nommer = async (notes: string) => lancerFiche(F("tonal-accord"), { Notes: notes }, { entrees: [null] });
  it.each([
    ["C E G", "C"], ["A C E", "Am"], ["E G C", "C/E"], ["G C E", "C/G"], ["C E G Bb", "C7"], ["B D F A", "Bm7b5"],
    ["C Eb Gb A", "Cdim7"], ["C E G#", "Caug"], ["C D G", "Csus2"], ["C F G", "Csus4"], ["C E G A", "C6"],
    ["F A C E", "Fmaj7"], ["C4 E4 G4", "C"], ["E3 C4 G4", "C/E"], ["D F# A C", "D7"], ["Bb D F", "Bb"], ["Db F Ab", "Db"],
  ])("« %s » → « %s »", async (notes, symbole) => {
    const r = await nommer(notes);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.valeurs[0]).toBe(symbole);
  });

  it("LE NOM LONG RESTE DANS LE MESSAGE", async () => {
    const r = await nommer("E G C");
    expect(r.message).toContain("C/E");
    expect(r.message).toContain("C major over E");
  });

  it("DEUX NOTES NE FONT PAS UN ACCORD, et une note illisible est refusée", async () => {
    expect((await nommer("C E")).erreurRendue).toBe(true);
    // « Do Mi Sol » servait ici de note illisible ; les noms français se lisent partout depuis la
    // décision de Fabien du 2026-11-22, septième format de la revue, et rendent « C ».
    expect((await nommer("C H G")).erreurRendue).toBe(true);
  });

  // L'ALLER-RETOUR : chaque qualité de la table, jouée sur do, nommée par l'Accord, puis relue par la
  // Grille, doit rendre ses notes et sa basse.
  it.each(QUALITES.map((q) => [q.id, q.intervalles] as const))("la qualité « %s » se nomme et se relit", async (_id, intervalles) => {
    const notes = intervalles.map((i) => Note.fromMidi(60 + i)).join(" ");
    const r = await nommer(notes);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(await parLaGrille(String(r.valeurs[0]))).toEqual({
      classes: [...new Set(intervalles.map((i) => i % 12))].sort((a, b) => a - b), basse: 0,
    });
  });
});

// CE QUI NE SE LIT PAS EST REFUSÉ, NOMMÉ, règle de la revue. Mesuré le 2026-11-22 : le Tonnetz partait
// de do majeur pour « Cmaj7 », « Am7 », « Cdim » ou « H » ; la Progression rendait « C  G » pour
// « I X V », le X disparu ; « Accords → Notation » comptait les lignes qu'il ignorait sans les nommer.
describe("UN ACCORD OU UN CHIFFRE QUI NE SE LIT PAS EST REFUSÉ, ET NOMMÉ", () => {
  const tonnetz = (depart: string, arrivee = "E") =>
    lancerFiche(F("tonnetz"), { "Accord de départ": depart, Mode: "chemin", "Accord d'arrivée": arrivee }, { entrees: [null] });

  // Des triades AUTRES QUE DO : le défaut du réglage est do majeur, et un cas en do passerait par
  // chance sur le code qui retombait en silence sur le défaut. Le Tonnetz écrit en dièses ; les deux
  // orthographes sont équivalentes.
  it.each([["D", "D"], ["D major", "D"], ["Bb minor", "(Bbm|A#m)"], ["D/F#", "D"], ["G#m", "G#m"]])(
    "le Tonnetz lit la triade « %s »", async (depart, nom) => {
      const r = await tonnetz(depart);
      expect(r.erreurRendue, r.message).toBe(false);
      expect(String(r.valeurs[2]).split("\n")[0]).toMatch(new RegExp(`^${nom} → E `));
    });

  it.each([["Cmaj7"], ["Am7"], ["Cdim"], ["H"]])("le Tonnetz refuse « %s », qui n'est pas une triade majeure ou mineure", async (depart) => {
    const r = await tonnetz(depart);
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain(`« ${depart} »`);
  });

  it("le Tonnetz refuse un accord d'arrivée illisible", async () => {
    const r = await tonnetz("C", "Zorglub");
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain("« Zorglub »");
  });

  // « V/V » est lu depuis le sixième format (décision de Fabien du 2026-11-22) ; « V/V/V », une
  // dominante de dominante de dominante écrite d'un seul jeton, ne l'est pas.
  it.each([["I X V", "X"], ["I V/V/V V", "V/V/V"]])("la Progression refuse « %s », et nomme « %s »", async (progression, fautif) => {
    const r = await lancerFiche(F("tonal-progression"), { Progression: progression }, { entrees: [null] });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain(`« ${fautif} »`);
    const g = await lancerFiche(F("tonal-grille"), { Progression: progression }, { entrees: [null] });
    expect(g.erreurRendue).toBe(true);
    expect(g.message).toContain(`« ${fautif} »`);
  });

  it("« Accords → Notation » refuse une ligne qu'il ne lit pas, et la nomme", async () => {
    const r = await lancerFiche(F("accords-vers-notation"), { Source: "accords" }, { entrees: [null, null, "C (2.0s)\nZorglub (1.0s)\nG (1.0s)"] });
    expect(r.erreurRendue).toBe(true);
    expect(r.valeurs[0]).toBeNull();
    expect(r.message).toContain("« Zorglub »");
    const p = await lancerFiche(F("accords-vers-notation"), { Source: "progression" }, { entrees: ["C", "I X V", null] });
    expect(p.erreurRendue).toBe(true);
    expect(p.message).toContain("« X »");
  });
});

/** Des accords tenus l'un après l'autre, en sinusoïdes, comme `audio/accords.test.ts` les écrit. */
function accordsAudio(suite: number[][], dureeS: number): AudioBuffer {
  const SR = 44100, n = Math.round(suite.length * dureeS * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const notes = suite[Math.min(suite.length - 1, Math.floor(i / (dureeS * SR)))];
    for (const m of notes) x[i] += (0.2 / notes.length) * Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * (i / SR));
  }
  b.copyToChannel(x, 0);
  return b;
}

// DÉCISION DE FABIEN DU 2026-11-22, « Same symbol, both languages ». Mesuré avant : en français, le
// détecteur écrivait « A min », « G 7 », « B min7b5 », et « Accords → Notation », qui ne lit que le
// premier mot, en faisait la majeur, sol majeur et si majeur ; dans les deux langues, « (2.0s, 100%) »
// empêchait de lire la durée, et chaque accord retombait sur un temps.
describe("LE DÉTECTEUR ÉCRIT CE QUE « ACCORDS → NOTATION » RELIT, dans les deux langues", () => {
  const suite = [[60, 64, 67], [57, 60, 64], [55, 59, 62, 65], [59, 62, 65, 69]];
  const attendus = [[0, 4, 7], [0, 4, 9], [2, 5, 7, 11], [2, 5, 9, 11]];
  it.each([["fr"], ["en"]])("en « %s », du Détecteur d'accords et de l'Analyse harmonique", async (langue) => {
    (globalThis as any).localStorage = { getItem: () => langue };
    try {
      const detecte = await lancerFiche(F("detecteur-accords"), {}, { entrees: [accordsAudio(suite, 2)] });
      const analyse = await lancerFiche(F("tonal-analyse"), {}, { entrees: [accordsAudio(suite, 2)] });
      const texte = String(detecte.valeurs[1]);
      expect(String(analyse.valeurs[2])).toBe(texte);
      expect(texte.split("\n").map((l) => l.split(" ")[1])).toEqual(["C", "Am", "G7", "Bm7b5"]);
      const r = await lancerFiche(F("accords-vers-notation"), { Source: "accords", Tempo: 60 }, { entrees: [null, null, texte] });
      const lignes = String(r.valeurs[0]).split("\n").slice(1);
      expect(lignes.map((l) => lu(hauteursLigne(l)).classes)).toEqual(attendus);
      expect(lignes.map((l) => Number(l.split(/\s+/)[1]))).toEqual([2, 2, 2, 2]);
    } finally {
      delete (globalThis as any).localStorage;
    }
  });
});

describe("« N.C. » EST UN ACCORD SILENCIEUX, qui prend sa place dans le temps", () => {
  it("la Grille l'écrit en silence, de la durée d'un accord", async () => {
    const r = await lancerFiche(F("tonal-grille"), { Progression: "C N.C. G", Mode: "plaque", "Durée": 2 }, { entrees: [null] });
    expect(r.erreurRendue, r.message).toBe(false);
    const lignes = String(r.valeurs[0]).split("\n").slice(1);
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toBe("rest 2");
  });

  it("« Accords → Notation » l'écrit en silence, de sa durée mesurée", async () => {
    const r = await lancerFiche(F("accords-vers-notation"), { Source: "accords", Tempo: 60 }, { entrees: [null, null, "C (2.0s)\nN.C. (3.0s)\nG (1.0s)"] });
    const lignes = String(r.valeurs[0]).split("\n").slice(1);
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toBe("rest 3");
  });
});
