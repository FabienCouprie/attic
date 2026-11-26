// plugins/tempo-deplace-les-notes.test.ts — Le Tempo d'un générateur de notes déplace ses notes.
//
// LE DÉFAUT RELEVÉ PAR FABIEN LE 2026-11-26 : « Dans le node série de l'infini le paramètre tempo
// n'opère pas ». La durée d'une note se comptait en secondes, et le Tempo ne servait qu'à convertir
// ces secondes en ticks du fichier MIDI : à 60, 120 et 180 BPM, trois WAV identiques à l'octet, et
// des notes MIDI aux mêmes instants. La durée se compte désormais en temps, que le Tempo convertit.
// Trois autres générateurs avaient le même défaut, relevés par une sonde sur le catalogue entier le
// même jour, et réparés de la même façon à la demande de Fabien : le Tonnetz, le canon par pavage et
// les opérations sérielles. La musique fractale lisait son tempo puis l'annulait, en recalant toute
// sa mélodie sur sa durée ; sa durée est devenue une longueur maximale, décision de Fabien.
//
// POURQUOI LE CROISEMENT NE L'A PAS VU, et pourquoi ce fichier compare des INSTANTS. Le croisement
// compare le fichier MIDI à l'octet, et l'en-tête de tempo et les ticks changeaient avec le réglage :
// un fichier qui ne fait que changer d'étiquette y passait pour un fichier qui change de son. Ici,
// le son se compare par sa durée, et le MIDI par l'instant de chaque note, en secondes comme le
// relit `notesDuMidi`, et en ticks, qui disent où la note tombe sur la grille des temps.
//
// VU ROUGE sur chaque fiche en replantant sa durée en secondes dans l'exécuteur, la valeur
// multipliée par 0,5 au lieu de 60 / tempo : à 60 BPM, les notes restaient aux mêmes secondes. Et
// sur la musique fractale en replantant le recalage sur la durée.
import "node-web-audio-api/polyfill.js";
import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche, type FicheLancable, type Reglages } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";
import { fiches as theorieAvancee } from "./theorie-avancee";
import { fiches as theorieComposition } from "./theorie-composition";
import { fiches as generateursFractals } from "./generateurs-fractals";

const fiche = (id: string): FicheLancable => {
  const f = [...theorieAvancee, ...theorieComposition, ...generateursFractals].find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f as unknown as FicheLancable;
};

/** Le son rendu, et l'instant de chaque début de note du MIDI, en secondes et en ticks. */
async function instants(id: string, reglages: Reglages) {
  const r = await lancerFiche(fiche(id), reglages, { entrees: [] });
  expect(r.levee, `${id} a levé`).toBeNull();
  const midi = r.valeurs[1] as File;
  let tick = 0;
  const ticks: number[] = [];
  for (const e of parseMidi(new Uint8Array(await midi.arrayBuffer())).tracks[0]) {
    tick += e.deltaTime;
    if (e.type === "noteOn" && e.velocity > 0) ticks.push(tick);
  }
  const secondes = (await notesDuMidi(midi))!.map((n) => +n.debut.toFixed(6)).sort((a, b) => a - b);
  return { audio: r.valeurs[0] as AudioBuffer, secondes, ticks };
}

/** Chaque fiche, le réglage de sa durée en temps, et la valeur posée : 0,5 temps, 240 ticks. */
const CAS: { id: string; reglages: Reglages }[] = [
  { id: "serie-infinie", reglages: { "Notes": 8, "Valeur d'une note": 0.5 } },
  { id: "tonnetz", reglages: { "Opérations": "PLR", "Valeur d'un accord": 0.5 } },
  { id: "canon-pavage", reglages: { "Répétitions": 1, "Valeur d'un pas": 0.5 } },
  { id: "serie-dodecaphonique", reglages: { "Valeur d'une note": 0.5 } },
  { id: "generateur-fractal", reglages: { "Profondeur": 2, "Durée": 60, "Valeur d'une note": 0.5 } },
];

describe("le Tempo d'un générateur de notes déplace ses notes", () => {
  for (const { id, reglages } of CAS) {
    it(`${id.toUpperCase()} : le son ralentit avec le tempo, et le MIDI reste sur la grille`, async () => {
      const lent = await instants(id, { ...reglages, "Tempo": 60 });
      const vif = await instants(id, { ...reglages, "Tempo": 120 });
      expect(vif.secondes.length, `${id} ne rend pas plusieurs notes`).toBeGreaterThan(3);
      expect(lent.secondes, "à 60 BPM, les notes ne tombent pas deux fois plus loin")
        .toEqual(vif.secondes.map((s) => s * 2));
      expect(lent.audio.duration / vif.audio.duration, "le son ne ralentit pas avec le tempo").toBeCloseTo(2, 1);
      expect(lent.ticks, "le tempo ne déplace pas les notes sur la grille des temps").toEqual(vif.ticks);
      expect(vif.ticks.filter((t) => t % 240 !== 0), "une note tombe hors de la grille des croches").toEqual([]);
      expect(Math.max(...vif.ticks), "les notes ne s'étalent pas sur la grille").toBeGreaterThan(240);
    });
  }

  it("SÉRIE DE L'INFINI : à 120 BPM, une croche dure 0,25 s et vaut 240 ticks", async () => {
    const vif = await instants("serie-infinie", { "Notes": 8, "Valeur d'une note": 0.5, "Tempo": 120 });
    expect(vif.secondes).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    expect(vif.ticks).toEqual([0, 240, 480, 720, 960, 1200, 1440, 1680]);
  });
});
