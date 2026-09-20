// plugins/rythme-vers-midi.test.ts — Le rythme doit sortir du nœud, et sortir JUSTE.
//
// CE QUI SE VÉRIFIE ICI. Les trois nœuds rythmiques rendent maintenant deux choses : l'audio qu'ils
// synthétisent et le MIDI du même rythme. Rien ne garantit a priori que les deux racontent la même
// chose — ce sont deux chemins de code séparés, et une grille relue une seconde fois, un swing oublié
// ou un générateur pseudo-aléatoire déjà consommé donneraient deux rythmes différents sans qu'aucun
// test de forme s'en aperçoive : les deux sorties auraient le bon nombre de notes.
//
// LA MESURE EST DONC FAITE SUR L'AUDIO LUI-MÊME. Les attaques sont détectées dans le rendu, puis
// comparées aux instants du fichier MIDI. Un test de contrôle vérifie que cette comparaison a des
// dents : le MIDI d'un rythme SANS swing ne doit PAS coïncider avec l'audio du même rythme AVEC swing.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { analyserMidi } from "../audio/midi";
import { parseMidi } from "midi-file";
import { CANAL_PERCUSSION, NOTES_PERCUSSION_GM, velociteMidiDepuisNuance } from "../audio/batterie-midi";

function ctxParams(params: Record<string, string | number>) {
  return {
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { id: "n1", data: {} },
    runtime: null,
  } as any;
}

/** La fenêtre d'analyse : 4 ms, soit six fois plus courte que le pas le plus rapide employé ici. */
const FENETRE = 0.004;

/**
 * L'enveloppe d'un rendu, par fenêtres de 4 ms.
 *
 * DEUX ENVELOPPES, ET C'EST MESURÉ. L'amplitude brute voit bien la grosse caisse, mais celle-ci finit
 * sur un sinus de 30 à 40 Hz dont une fenêtre de 4 ms ne couvre qu'un huitième de période : l'enveloppe
 * y ondule d'un creux à une crête à chaque cycle, et un détecteur naïf comptait deux frappes
 * fantômes après chaque coup de grosse caisse. La dérivée première — une différence d'échantillons,
 * soit un passe-haut — supprime cette ondulation et fait ressortir les attaques, qui sont larges de
 * bande ; mais elle écrase la grosse caisse d'un facteur cent face à un charley.
 *
 * Les deux sont donc normalisées par leur propre crête et ADDITIONNÉES : chaque percussion est vue par
 * celle des deux qui la montre. Le mélange a été vérifié sur les trois nœuds, aux deux swings.
 */
function enveloppe(buf: AudioBuffer): number[] {
  const n = buf.length;
  const brut = new Float32Array(n), derivee = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 1; i < n; i++) {
      brut[i] += Math.abs(d[i]) / buf.numberOfChannels;
      derivee[i] += Math.abs(d[i] - d[i - 1]) / buf.numberOfChannels;
    }
  }
  const taille = Math.round(FENETRE * buf.sampleRate);
  const tb: number[] = [], td: number[] = [];
  for (let i = 0; i + taille <= n; i += taille) {
    let a = 0, b = 0;
    for (let j = 0; j < taille; j++) { a += brut[i + j]; b += derivee[i + j]; }
    tb.push(a / taille); td.push(b / taille);
  }
  const creteB = Math.max(...tb) || 1, creteD = Math.max(...td) || 1;
  return tb.map((v, i) => v / creteB + td[i] / creteD);
}

/**
 * Les instants d'attaque d'un rendu.
 *
 * Une attaque est une fenêtre qui dépasse un seuil relatif à la crête ET vaut 1,4 fois le maximum des
 * quatre fenêtres précédentes. Ce recul de 16 ms est ce qui distingue une frappe de la décroissance de
 * la précédente ; il ne peut pas être plus long, le rythme de Cantor swingué plaçant deux frappes à
 * 26 ms l'une de l'autre.
 */
function attaques(buf: AudioBuffer, seuil = 0.05, montee = 1.4, recul = 4): number[] {
  const env = enveloppe(buf);
  const limite = Math.max(...env) * seuil;
  const instants: number[] = [];
  // La première fenêtre n'a pas de précédente : si elle dépasse le seuil, c'est une attaque — et c'est
  // le cas courant, un rythme commençant presque toujours sur le temps.
  if (env[0] >= limite) instants.push(0);
  for (let t = 1; t < env.length; t++) {
    if (env[t] < limite) continue;
    let plafond = 0;
    for (let k = Math.max(0, t - recul); k < t; k++) plafond = Math.max(plafond, env[k]);
    if (env[t] < montee * plafond) continue;
    const instant = t * FENETRE;
    // Deux fenêtres voisines décrivent la même frappe.
    if (instants.length > 0 && instant - instants[instants.length - 1] < 0.012) continue;
    instants.push(instant);
  }
  return instants;
}

/** Les instants distincts d'un fichier MIDI — plusieurs percussions peuvent frapper ensemble. */
async function instantsMidi(f: File): Promise<number[]> {
  const notes = analyserMidi(parseMidi(new Uint8Array(await f.arrayBuffer()))).notes;
  const vus: number[] = [];
  for (const n of notes.slice().sort((a, b) => a.debut - b.debut)) {
    if (vus.length === 0 || n.debut - vus[vus.length - 1] > 1e-4) vus.push(n.debut);
  }
  return vus;
}

/**
 * Combien d'instants d'une liste tombent sur un instant de l'autre, à la fenêtre d'analyse près.
 *
 * La tolérance vaut trois fenêtres, soit 12 ms : l'attaque est datée au début de la fenêtre où la
 * montée est vue, ce qui la retarde d'une à deux fenêtres selon l'endroit où elle tombe — 8 ms au
 * pire, mesuré sur les trois nœuds. Elle reste deux fois plus courte que le plus petit écart entre
 * deux frappes (26 ms, dans le Cantor swingué), donc elle ne peut pas confondre deux frappes voisines.
 */
function apparies(instants: readonly number[], attaquesAudio: readonly number[], tolerance = 3 * FENETRE) {
  return instants.filter((t) => attaquesAudio.some((a) => Math.abs(a - t) <= tolerance)).length;
}

/**
 * Un motif de séquenceur avec des frappes À CONTRETEMPS.
 *
 * Le motif livré par défaut ne frappe que sur les pas pairs, que le swing ne déplace pas : il aurait
 * rendu muets tous les tests de swing ci-dessous. Celui-ci place le charley sur les pas impairs.
 */
const MOTIF_CONTRETEMPS = [
  "9000000090000000", // grosse caisse
  "0000900000009000", // caisse claire
  "0909090909090909", // charley, à contretemps
  ...new Array(5).fill("0000000000000000"),
].join("|");

const notesGM = new Set<number>(NOTES_PERCUSSION_GM);

describe("la boîte à rythmes", () => {
  it("déclare sa sortie MIDI en second, sans déplacer l'audio", () => {
    const fiche = registre.trouverDef("boite-rythmes")!;
    expect(fiche.sorties.map((s: any) => s.type)).toEqual(["audio", "midi"]);
  });

  it("frappe aux MÊMES instants dans son audio et dans son MIDI", async () => {
    const fiche = registre.trouverDef("boite-rythmes")!;
    const res = await fiche.executer(ctxParams({ Tempo: 120, Mesures: 2 }));
    const audio = res.valeurs[0] as AudioBuffer;
    const instants = await instantsMidi(res.valeurs[1] as File);
    const detectees = attaques(audio);
    expect(instants.length).toBeGreaterThan(8);
    // Toutes les attaques entendues sont dans le MIDI, et réciproquement.
    expect(apparies(instants, detectees)).toBe(instants.length);
    expect(apparies(detectees, instants)).toBe(detectees.length);
  });

  it("écrit ses notes sur le canal de percussion, aux numéros du General MIDI", async () => {
    const fiche = registre.trouverDef("boite-rythmes")!;
    const res = await fiche.executer(ctxParams({ Tempo: 120, Mesures: 1 }));
    const lu = analyserMidi(parseMidi(new Uint8Array(await (res.valeurs[1] as File).arrayBuffer())));
    expect(lu.notes.length).toBeGreaterThan(0);
    for (const n of lu.notes) expect(notesGM.has(n.note), `note ${n.note}`).toBe(true);
    expect(new Set(lu.notes.map((n) => n.canal))).toEqual(new Set([CANAL_PERCUSSION]));
  });

  it("porte les niveaux des pistes dans les vélocités — un MIDI n'a pas de volume", async () => {
    const fiche = registre.trouverDef("boite-rythmes")!;
    const res = await fiche.executer(ctxParams({
      Tempo: 120, Mesures: 1, Kick: 100, "Caisse claire": 50, Charley: 20,
    }));
    const notes = analyserMidi(parseMidi(new Uint8Array(await (res.valeurs[1] as File).arrayBuffer()))).notes;
    // `velociete` : le nom du champ de `NoteMidi`, coquille comprise — elle est là depuis longtemps et
    // la renommer toucherait tout le lecteur MIDI, ce qui n'a rien à faire dans ce lot.
    const velocite = (note: number) => notes.find((n) => n.note === note)?.velociete;
    expect(velocite(36)).toBe(127);
    expect(velocite(38)).toBe(velociteMidiDepuisNuance(Math.round(0.5 * 9)));
    expect(velocite(42)).toBe(velociteMidiDepuisNuance(Math.round(0.2 * 9)));
  });

  it("suit le tempo : à 60 BPM les instants doublent", async () => {
    const fiche = registre.trouverDef("boite-rythmes")!;
    const rapide = await fiche.executer(ctxParams({ Tempo: 120, Mesures: 1 }));
    const lent = await fiche.executer(ctxParams({ Tempo: 60, Mesures: 1 }));
    const a = await instantsMidi(rapide.valeurs[1] as File);
    const b = await instantsMidi(lent.valeurs[1] as File);
    expect(b.length).toBe(a.length);
    b.forEach((t, i) => expect(t).toBeCloseTo(a[i] * 2, 5));
  });
});

describe("le rythme de Cantor", () => {
  it("frappe aux mêmes instants dans son audio et dans son MIDI, swing compris", async () => {
    const fiche = registre.trouverDef("rythme-cantor")!;
    const res = await fiche.executer(ctxParams({
      Tempo: 100, Profondeur: 3, Mesures: 1, Swing: 50, Graine: 7, Volume: 90,
    }));
    const detectees = attaques(res.valeurs[0] as AudioBuffer);
    const instants = await instantsMidi(res.valeurs[1] as File);
    expect(instants.length).toBeGreaterThan(4);
    expect(apparies(instants, detectees)).toBe(instants.length);
    expect(apparies(detectees, instants)).toBe(detectees.length);
  });

  it("garde le rythme tiré au sort : la grille du MIDI est celle qui a été jouée", async () => {
    // LE CAS QUI PIÈGE. En mode « Aléatoire », la grille est tirée par le même générateur que les
    // rafales de bruit du rendu. Reconstruire la grille avec un générateur DÉJÀ CONSOMMÉ donnerait un
    // autre rythme — d'où un générateur neuf de la même graine. Ce test le vérifie par l'audio.
    const fiche = registre.trouverDef("rythme-cantor")!;
    const res = await fiche.executer(ctxParams({
      Tempo: 100, Profondeur: 4, Mesures: 1, "Partie retirée": "random", Graine: 1234, Volume: 90,
    }));
    const detectees = attaques(res.valeurs[0] as AudioBuffer);
    const instants = await instantsMidi(res.valeurs[1] as File);
    expect(instants.length).toBeGreaterThan(4);
    expect(apparies(instants, detectees)).toBe(instants.length);
    expect(apparies(detectees, instants)).toBe(detectees.length);
  });

  it("répartit sur trois percussions en mode « Tous », et sur une seule sinon", async () => {
    const fiche = registre.trouverDef("rythme-cantor")!;
    const tous = await fiche.executer(ctxParams({ Profondeur: 4, Mesures: 1, Graine: 3 }));
    const notesTous = analyserMidi(parseMidi(new Uint8Array(await (tous.valeurs[1] as File).arrayBuffer()))).notes;
    expect(new Set(notesTous.map((n) => n.note)).size).toBeGreaterThan(1);

    const seul = await fiche.executer(ctxParams({
      Profondeur: 4, Mesures: 1, Graine: 3, Instrument: "snare",
    }));
    const notesSeul = analyserMidi(parseMidi(new Uint8Array(await (seul.valeurs[1] as File).arrayBuffer()))).notes;
    expect(new Set(notesSeul.map((n) => n.note))).toEqual(new Set([38]));
    // Le même rythme, une autre voix : autant de frappes de part et d'autre.
    expect(notesSeul.length).toBe(notesTous.length);
  });
});

describe("le séquenceur de batterie avancé", () => {
  it("déclare sa sortie MIDI en second, sans déplacer l'audio", () => {
    const fiche = registre.trouverDef("sequenceur-batterie-avance")!;
    expect(fiche.sorties.map((s: any) => s.type)).toEqual(["audio", "midi"]);
  });

  it("frappe aux mêmes instants dans son audio et dans son MIDI, à contretemps et swingué", async () => {
    const fiche = registre.trouverDef("sequenceur-batterie-avance")!;
    for (const swing of [0, 60]) {
      const res = await fiche.executer(ctxParams({
        Tempo: 110, Mesures: 1, Swing: swing, Motif: MOTIF_CONTRETEMPS,
      }));
      const detectees = attaques(res.valeurs[0] as AudioBuffer);
      const instants = await instantsMidi(res.valeurs[1] as File);
      expect(instants.length, `swing ${swing}`).toBe(12);
      expect(apparies(instants, detectees), `swing ${swing}`).toBe(instants.length);
      expect(apparies(detectees, instants), `swing ${swing}`).toBe(detectees.length);
    }
  });
});

describe("la comparaison a des dents", () => {
  it("le MIDI sans swing NE coïncide PAS avec l'audio joué avec swing", async () => {
    // Sans ce contrôle, un détecteur trop tolérant ferait passer les tests ci-dessus quoi qu'il
    // arrive. Le swing décale les contretemps de 0,6 × 60 % d'un pas, soit bien plus que la tolérance.
    const fiche = registre.trouverDef("sequenceur-batterie-avance")!;
    const avec = await fiche.executer(ctxParams({
      Tempo: 110, Mesures: 1, Swing: 60, Motif: MOTIF_CONTRETEMPS }));
    const sans = await fiche.executer(ctxParams({
      Tempo: 110, Mesures: 1, Swing: 0, Motif: MOTIF_CONTRETEMPS }));
    const detecteesAvec = attaques(avec.valeurs[0] as AudioBuffer);
    const instantsSans = await instantsMidi(sans.valeurs[1] as File);
    expect(apparies(instantsSans, detecteesAvec)).toBeLessThan(instantsSans.length);
  });
});
