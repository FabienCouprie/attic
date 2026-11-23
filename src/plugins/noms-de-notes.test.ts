// plugins/noms-de-notes.test.ts — Un nom de note se lit de la même façon partout, et ce qui ne se lit pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, septième format, 2026-11-22. Sept lecteurs lisaient les noms de
// notes, chacun avec sa table, son octave par défaut et sa façon d'échouer. Mesuré par `executer` :
//   - « E#4 », « Fb4 » et « Cb4 » sonnaient la 4 par `lireNote`, la table n'ayant pas ces noms ;
//   - « C##4 », « C♯4 » ou « Do4 » y sonnaient la note par défaut, sans un mot ;
//   - les Classes de hauteurs jetaient « Fb », « B# », « do# » et « C♯ », le Contrepoint « X4 » ;
//   - le Transposer rendait une sortie vide sans erreur, les synthétiseurs Tone.js l'erreur brute de
//     la bibliothèque, et le Générateur de fréquence refusait en vert.
// Le mot juste est donc d'usage : les orthographes E#, Fb, B#, Cb, ##, bb, ♯ et ♭ se lisent.
// DÉCISIONS DE FABIEN DU 2026-11-22 : les noms français, Do à Si, se lisent partout ; une note sans
// octave est refusée là où une hauteur est attendue.
//
// LA HAUTEUR SE MESURE DANS LE SON, pour les synthétiseurs : c'est ce qu'on entend qui doit être juste.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;

/** La ressemblance d'un signal à lui-même décalé de `tau` échantillons, de -1 à 1. */
function correlation(x: Float32Array, tau: number): number {
  const i = Math.floor(tau), f = tau - i;
  let xy = 0, xx = 0, yy = 0;
  for (let n = 0; n + i + 1 < x.length; n++) {
    const y = x[n + i] * (1 - f) + x[n + i + 1] * f;
    xy += x[n] * y; xx += x[n] * x[n]; yy += y * y;
  }
  return xy / Math.sqrt(xx * yy || 1);
}

/**
 * La hauteur entendue, en demi-tons MIDI : celle dont la période se répète le mieux dans le son,
 * cherchée à six demi-tons de part et d'autre de l'attendue, au vingtième de demi-ton.
 *
 * UN SUIVEUR DE HAUTEUR NE SUFFISAIT PAS : sur la Voyelle FOF, le premier formant du « a », vers
 * 750 Hz, renforce le troisième partiel d'un si 3, et le suiveur rendait 748 Hz ; sur la Corde pincée,
 * il ne trouvait aucune trame voisée sous le la 4. Une note fausse de moins de six demi-tons y place
 * son propre maximum ; une note plus fausse encore y place celui d'un de ses sous-harmoniques.
 *
 * L'OCTAVE SE VÉRIFIE À PART, et c'est délibéré : un son une octave trop haut se répète aussi à la
 * période de l'attendue, deux fois. Vu sur une faute plantée, l'octave comptée une fois de trop : les
 * 84 cas passaient. Une période qui se répète déjà à sa moitié est donc celle d'un son une octave
 * plus haut, et la mesure monte d'autant. Relevé sur les six synthétiseurs : à sa moitié, une période
 * juste se ressemble à 0,87 au plus (la Voyelle FOF en sol 4, dont le deuxième partiel domine), celle
 * d'un son une octave trop haut à 0,987 au moins ; le seuil est entre les deux.
 */
function entendue(v: unknown, attendue: number): number {
  const b = v as AudioBuffer, sr = b.sampleRate;
  const x = b.getChannelData(0).subarray(Math.floor(0.1 * sr), Math.floor(Math.min(b.duration, 0.6) * sr));
  const periode = (m: number) => sr / (440 * 2 ** ((m - 69) / 12));
  let meilleure = attendue, rMax = -Infinity;
  for (let m = attendue - 6; m <= attendue + 6; m += 0.05) {
    const r = correlation(x, periode(m));
    if (r > rMax) { rMax = r; meilleure = m; }
  }
  while (meilleure < 127 && correlation(x, periode(meilleure) / 2) > 0.95) meilleure += 12;
  return meilleure;
}

const LUES: [string, number][] = [
  ["A4", 69], ["E#4", 65], ["Fb4", 64], ["B#3", 60], ["Cb4", 59], ["C##4", 62], ["Dbb4", 60], ["C♯4", 61], ["D♭4", 61],
  ["Do4", 60], ["Ré#3", 51], ["Sib3", 58], ["sol4", 67], ["La4", 69],
];
const REFUSEES = ["A", "X4", "H4", "Do"];

const SYNTHES: [string, Record<string, string>][] = [
  ["vent-guide-onde", {}], ["barre-modale", {}], ["voyelle-fof", {}], ["generateur-frequence", { Saisie: "note" }], ["fm-synth", {}],
  ["pluck-synth", { Graine: "7" }],
];
// La Membrane chute de plusieurs octaves et le Métal est inharmonique : leur hauteur ne se mesure pas
// d'une médiane. Leur son se compare donc à celui du nom anglais, échantillon pour échantillon.
const SANS_HAUTEUR_MESURABLE = ["membrane-synth", "metal-synth"];

const memeSon = (a: unknown, b: unknown) => {
  const x = (a as AudioBuffer).getChannelData(0), y = (b as AudioBuffer).getChannelData(0);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

describe("LA MEMBRANE, LE MÉTAL ET LE POLYPHONIQUE SONNENT LE NOM FRANÇAIS COMME LE NOM ANGLAIS", () => {
  for (const id of SANS_HAUTEUR_MESURABLE) {
    it.each([["Do2", "C2"], ["Ré#3", "D#3"], ["Sib2", "Bb2"], ["E#3", "F3"]])(`${id} : « %s » comme « %s »`, async (ecrit, anglais) => {
      const a = await lancerFiche(F(id), { Note: ecrit }, { entrees: [null] });
      const b = await lancerFiche(F(id), { Note: anglais }, { entrees: [null] });
      expect(a.erreurRendue, a.message).toBe(false);
      expect(memeSon(a.valeurs[0], b.valeurs[0])).toBe(true);
    });
  }

  it("le Polyphonique : « Do4,Mi4,Sol4 » comme « C4,E4,G4 »", async () => {
    const a = await lancerFiche(F("poly-synth"), { Notes: "Do4,Mi4,Sol4" }, { entrees: [null] });
    const b = await lancerFiche(F("poly-synth"), { Notes: "C4,E4,G4" }, { entrees: [null] });
    expect(a.erreurRendue, a.message).toBe(false);
    expect(memeSon(a.valeurs[0], b.valeurs[0])).toBe(true);
  });

  it.each(["C4,X4,G4", "C4,E,G4"])("le Polyphonique refuse « %s », et nomme la note fautive", async (notes) => {
    const r = await lancerFiche(F("poly-synth"), { Notes: notes }, { entrees: [null] });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain(notes.includes("X4") ? "« X4 »" : "« E »");
    expect(r.message).not.toMatch(/setValueAtTime|Invalid/);
    expect(r.valeurs[0]).toBe(null);
  });
});

describe("UN SYNTHÉTISEUR JOUE LA NOTE ÉCRITE, quelle qu'en soit l'orthographe d'usage", () => {
  for (const [id, reglages] of SYNTHES) {
    it.each(LUES)(`${id} : « %s »`, async (nom, attendue) => {
      const r = await lancerFiche(F(id), { ...reglages, Note: nom }, { entrees: [null] });
      expect(r.erreurRendue, r.message).toBe(false);
      expect(Math.abs(entendue(r.valeurs[0], attendue) - attendue), `${nom} devait sonner ${attendue}`).toBeLessThan(0.3);
    });
  }
});

describe("UN NOM ILLISIBLE, OU SANS OCTAVE LÀ OÙ IL EN FAUT UNE, EST REFUSÉ, ET NOMMÉ", () => {
  for (const id of [...SYNTHES.map(([i]) => i), ...SANS_HAUTEUR_MESURABLE, "synthese-scanning", "terrain-onde", "csound-instruments-physiques"]) {
    it.each(REFUSEES)(`${id} : « %s »`, async (nom) => {
      const reglages: Record<string, string> = id === "generateur-frequence" ? { Saisie: "note", Note: nom } : { Note: nom };
      const r = await lancerFiche(F(id), reglages, { entrees: [null] });
      expect(r.erreurRendue, r.message).toBe(true);
      expect(r.message).toContain(`« ${nom} »`);
      expect(r.message).not.toMatch(/setValueAtTime|RuntimeError/);
      expect(r.valeurs.every((v) => v === null), "aucune sortie ne doit porter de son").toBe(true);
    });
  }
});

describe("LES NŒUDS DE THÉORIE LISENT LES MÊMES NOMS", () => {
  it.each([["Ré#3", "2M", "E#3"], ["Do", "2M", "D"], ["Sib2", "3m", "Db3"]])("le Transposer : « %s » + %s → « %s »", async (note, intervalle, attendu) => {
    const r = await lancerFiche(F("tonal-transposer"), { Note: note, Intervalle: intervalle }, { entrees: [null] });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.valeurs[0]).toBe(attendu);
  });

  it("le Transposer refuse un nom illisible, et le nomme", async () => {
    const r = await lancerFiche(F("tonal-transposer"), { Note: "X4", Intervalle: "2M" }, { entrees: [null] });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain("« X4 »");
  });

  it.each([["Do Mi Sol", "C"], ["Ré Fa# La", "D"], ["Sib Ré Fa", "Bb"]])("l'Accord : « %s » → « %s »", async (notes, symbole) => {
    const r = await lancerFiche(F("tonal-accord"), { Notes: notes }, { entrees: [null] });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.valeurs[0]).toBe(symbole);
  });

  it.each([["C Fb G B#", "[0,3,7]"], ["Do# Mi Sol#", "[0,3,7]"], ["C♯ E G#", "[0,3,7]"]])("les Classes de hauteurs : « %s »", async (notes, forme) => {
    const r = await lancerFiche(F("classes-hauteurs"), { Notes: notes }, { entrees: [null] });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toContain(forme);
  });

  it.each([["classes-hauteurs", "Notes"], ["serie-dodecaphonique", "Série"]])("%s refuse un nom illisible, et le nomme", async (id, reglage) => {
    const r = await lancerFiche(F(id), { [reglage]: "C X E G" }, { entrees: [null] });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toContain("« X »");
  });

  it("le Contrepoint lit les noms français comme les lettres, et refuse un nom illisible ou sans octave", async () => {
    const lire = (grave: string) => lancerFiche(F("contrepoint-especes"), { "Voix grave": grave, "Voix aiguë": "G4 A4 G4 A4" }, { entrees: [null] });
    const lettres = await lire("C4 D4 E4 F4");
    const francais = await lire("Do4 Ré4 Mi4 Fa4");
    expect(francais.erreurRendue, francais.message).toBe(false);
    expect(francais.valeurs).toEqual(lettres.valeurs);
    const illisible = await lire("C4 X4 E4 F4");
    expect(illisible.erreurRendue).toBe(true);
    expect(illisible.message).toContain("« X4 »");
    const sansOctave = await lire("C D E F");
    expect(sansOctave.erreurRendue).toBe(true);
    expect(sansOctave.message).toContain("« C »");
  });
});
