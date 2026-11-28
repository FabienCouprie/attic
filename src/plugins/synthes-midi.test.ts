// plugins/synthes-midi.test.ts — Les cinq synthétiseurs de la famille jouent un MIDI, note par note.
//
// DEMANDÉ PAR FABIEN LE 2026-11-28, pour la cohérence de la famille : la corde de Karplus-Strong
// prenait un MIDI, et « Membrane Synth », « Metal Synth », « Poly Synth », « FM / AM Synth » et
// « Pluck Synth » ne jouaient qu'une note réglée en texte.
//
// LA PRÉDICTION EST ÉCRITE ICI, SANS LA FONCTION ÉPROUVÉE. Chaque note du MIDI est rendue seule par le
// générateur du composant, aux réglages de la fiche, puis posée à son début, multipliée par sa
// vélocité sur 127 et additionnée ; le rendu de la fiche doit l'égaler au millionième. Les noms des
// notes sont des littéraux : une table MIDI décalée d'une octave tomberait ici, et la hauteur mesurée
// le dit aussi.

// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches as fichesSynths } from "./tone-synths";
import { fiches as fichesFm } from "./tone-synths-fm";
import { lancerFiche, type FicheLancable, type Reglages } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { notesDuMidi } from "../audio/midi";
import {
  genererMembraneSynth, genererMetalSynth, genererModulationSynth, genererPluckSynth, genererPolySynth,
} from "../audio/tone-synths";
import { centsEntre, raieLaPlusForte } from "../audio/mesure-raie";
import { creerAleatoire } from "../core/hasard";

const SR = 44100;
const fiche = (id: string) => [...fichesSynths, ...fichesFm].find((f) => f.id === id) as unknown as FicheLancable;

/** Trois notes séparées, à trois vélocités : la3, do4, mi4. */
const NOTES = [
  { note: 57, nom: "A3", velocite: 100, debut: 0, fin: 0.3 },
  { note: 60, nom: "C4", velocite: 64, debut: 0.5, fin: 0.8 },
  { note: 64, nom: "E4", velocite: 127, debut: 1, fin: 1.3 },
];
const midi = () => notesVersFichierMidi(NOTES.map(({ nom: _nom, ...n }) => n), 120);

type Rendu = (nom: string, tenue: number, aleatoire: () => number) => Promise<AudioBuffer>;

/** Ce que chaque composant rend pour une note seule, aux réglages par défaut de sa fiche. */
const RENDUS: Record<string, { reglages: Reglages; rendre: Rendu; accorde: boolean }> = {
  "membrane-synth": { reglages: {}, accorde: true, rendre: (note, tenue) => genererMembraneSynth({
    note, duree: Math.max(0.1, tenue), volume: 80, pitchDecay: 0.05, octaves: 4, decay: 0.4, release: 1.4, sampleRate: SR }) },
  "metal-synth": { reglages: {}, accorde: false, rendre: (note, tenue) => genererMetalSynth({
    note, duree: Math.max(0.1, tenue), volume: 80, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
    attack: 0.001, decay: 1.4, release: 0.2, sampleRate: SR }) },
  "poly-synth": { reglages: {}, accorde: true, rendre: (note, tenue) => genererPolySynth({
    notes: [note], dureeNote: Math.max(0.05, tenue), volume: 80, waveform: "triangle", attack: 0.01, decay: 0.1,
    sustain: 0.3, release: 1, sampleRate: SR }) },
  "fm-synth": { reglages: {}, accorde: true, rendre: (note, tenue) => genererModulationSynth({
    note, duree: Math.max(0.05, tenue) + 0.5, volume: 80, mode: "FM", harmonicity: 3, modulationIndex: 10,
    attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5, sampleRate: SR }) },
  "pluck-synth": { reglages: { Graine: 77 }, accorde: true, rendre: (note, tenue, aleatoire) => genererPluckSynth({
    note, duree: Math.max(0.05, tenue) + 1, volume: 80, attackNoise: 1, dampening: 4000, resonance: 0.7, release: 1,
    sampleRate: SR, aleatoire }) },
};

/**
 * La somme attendue : chaque note seule, à son début, à sa vélocité ; plafonnée à 0,99 de crête.
 *
 * LES INSTANTS SONT CEUX QUE LE FICHIER REND À LA LECTURE, et non les littéraux : une demi-seconde
 * relue en ticks peut tomber un échantillon plus tôt, et c'est le fichier que la fiche reçoit.
 */
async function attendu(rendre: Rendu, graine: number): Promise<Float32Array[]> {
  const aleatoire = creerAleatoire(graine);
  const relues = (await notesDuMidi(midi()))!;
  const poses = [];
  for (const [k, r] of relues.entries()) {
    const n = { ...r, nom: NOTES[k].nom };
    poses.push({ n, b: await rendre(n.nom, n.fin - n.debut, aleatoire) });
  }
  const longueur = Math.max(...poses.map(({ n, b }) => Math.floor(n.debut * SR) + b.length));
  const canaux = [new Float32Array(longueur), new Float32Array(longueur)];
  for (const { n, b } of poses) {
    for (let c = 0; c < 2; c++) {
      const x = b.getChannelData(Math.min(c, b.numberOfChannels - 1)), d = Math.floor(n.debut * SR);
      for (let i = 0; i < x.length; i++) canaux[c][d + i] += x[i] * (n.velocite / 127);
    }
  }
  let crete = 0;
  for (const c of canaux) for (const v of c) crete = Math.max(crete, Math.abs(v));
  if (crete > 0.99) for (const c of canaux) for (let i = 0; i < c.length; i++) c[i] *= 0.99 / crete;
  return canaux;
}

describe("les synthétiseurs de la famille jouent un MIDI", () => {
  for (const [id, { reglages, rendre, accorde }] of Object.entries(RENDUS)) {
    it(`${id} : CHAQUE NOTE À SON DÉBUT, À SA VÉLOCITÉ, RENDUE PAR LE GÉNÉRATEUR DU COMPOSANT`, async () => {
      const r = await lancerFiche(fiche(id), reglages, { entrees: [midi()] });
      expect(r.levee, "le nœud a levé").toBeNull();
      expect(r.erreurRendue, r.message).toBe(false);
      expect(r.message).toContain("3");
      const b = r.valeurs[0] as AudioBuffer;
      const prevu = await attendu(rendre, Number(reglages.Graine ?? 0));
      expect(b.length).toBe(prevu[0].length);
      let ecart = 0;
      for (let c = 0; c < 2; c++) {
        const x = b.getChannelData(c);
        for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(x[i] - prevu[c][i]));
      }
      expect(ecart, `${id} : écart le plus grand au mélange prévu`).toBeLessThan(1e-6);
      if (!accorde) return;
      // LA HAUTEUR DE CHAQUE NOTE, mesurée sur le rendu : la raie la plus forte à un demi-ton de la note.
      for (const n of NOTES) {
        const f = 440 * 2 ** ((n.note - 69) / 12);
        const jouee = raieLaPlusForte(b.getChannelData(0), SR, n.debut + 0.1, n.debut + 0.3, f / 2 ** (1 / 12), f * 2 ** (1 / 12));
        expect(Math.abs(centsEntre(jouee, f)), `${id}, note ${n.nom} : ${centsEntre(jouee, f).toFixed(2)} cents`).toBeLessThan(3);
      }
    });
  }

  it("SANS MIDI, CHAQUE COMPOSANT REND SA NOTE COMME AVANT, celle de son générateur", async () => {
    const seul = (await lancerFiche(fiche("fm-synth"), {}, { entrees: [null] })).valeurs[0] as AudioBuffer;
    const direct = await genererModulationSynth({ note: "C4", duree: 1.5, volume: 80, mode: "FM", harmonicity: 3,
      modulationIndex: 10, attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5, sampleRate: SR });
    expect(Array.from(seul.getChannelData(0))).toEqual(Array.from(direct.getChannelData(0)));
  });

  it("LE MÉLANGE EST PLAFONNÉ À 0,99, et une seule note à 127 garde son niveau", async () => {
    const accord = [0, 4, 7, 12, 16, 19].map((d) => ({ note: 48 + d, velocite: 127, debut: 0, fin: 1 }));
    const fort = (await lancerFiche(fiche("poly-synth"), { Volume: 100 }, { entrees: [notesVersFichierMidi(accord, 120)] })).valeurs[0] as AudioBuffer;
    let crete = 0;
    for (let c = 0; c < 2; c++) for (const v of fort.getChannelData(c)) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeLessThanOrEqual(0.99 + 1e-6);
    const fichier = notesVersFichierMidi([{ note: 60, velocite: 127, debut: 0, fin: 0.5 }], 120);
    const relue = (await notesDuMidi(fichier))![0];
    const une = (await lancerFiche(fiche("poly-synth"), {}, { entrees: [fichier] })).valeurs[0] as AudioBuffer;
    const directe = await genererPolySynth({ notes: ["C4"], dureeNote: relue.fin - relue.debut, volume: 80, waveform: "triangle", attack: 0.01,
      decay: 0.1, sustain: 0.3, release: 1, sampleRate: SR });
    const [a, d] = [une.getChannelData(0), directe.getChannelData(0)];
    let ecart = 0, ou = -1;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - d[i]) > ecart) { ecart = Math.abs(a[i] - d[i]); ou = i; }
    expect(ecart, `écart ${ecart} à l'échantillon ${ou}, ${relue.debut} → ${relue.fin}`).toBe(0);
  });
});
