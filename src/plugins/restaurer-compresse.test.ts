import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

import { doser } from "./restaurer-compresse";

const { CADENCE_EXIGEE, restaurer } = createRequire(import.meta.url)("../../electron/apollo.cjs") as {
  CADENCE_EXIGEE: number;
  restaurer: (o: { audio: Uint8Array }) => Promise<{ ok: boolean; journal?: string }>;
};

const SR = 44100;

/** Un son dont chaque canal porte une valeur constante : le mélange se lit à l'œil nu. */
function plat(valeurs: number[], longueur = 100): AudioBuffer {
  const b = new AudioBuffer({
    numberOfChannels: valeurs.length, length: longueur, sampleRate: SR });
  for (let c = 0; c < valeurs.length; c++) b.getChannelData(c).fill(valeurs[c]);
  return b;
}

/** Un en-tête de WAV minimal, à la cadence demandée. */
function wav(cadence: number): Uint8Array {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(cadence, 24);
  b.write("data", 36, "ascii");
  return new Uint8Array(b);
}

describe("la cadence que le moteur exige", () => {
  it("vaut 44 100 Hz, la même que le séparateur de voix de cette famille", () => {
    expect(CADENCE_EXIGEE).toBe(44100);
  });

  it("LE PONT REFUSE UNE AUTRE CADENCE, et le dit en français avec le chiffre reçu", async () => {
    // CETTE PROPRIÉTÉ EST ICI ET NON DANS L'ÉPREUVE D'APPLICATION, et c'est une leçon : celle-ci
    // tourne à 44 100 Hz elle-même, de sorte qu'un défaut planté sur la conversion la laissait
    // VERTE. Le refus, lui, se provoque à volonté.
    //
    // ET IL TOMBE AVANT LE MODÈLE, ce qui est tout l'intérêt : le pont lit l'en-tête du WAV plutôt
    // que de laisser le moteur charger soixante-six mégaoctets de poids pour refuser ensuite.
    const r = await restaurer({ audio: wav(48000) });
    expect(r.ok).toBe(false);
    expect(r.journal).toContain("44100");
    expect(r.journal).toContain("48000");
    expect(r.journal, "le message doit être celui du dépôt, non celui du moteur en anglais")
      .toMatch(/n'accepte que du/);
    // ET CE REFUS NE DÉPEND PAS DU MODÈLE, ce qui est la propriété que ce cas a appris à exiger.
    // Écrit d'abord sans elle, il passait en local par la seule présence du fichier de poids et
    // tombait en intégration continue, où aucun modèle d'`audio.cpp` n'est présent : il y recevait
    // « Modèle absent » là où il attendait la cadence. Le pont vérifie désormais ce qui ne demande
    // rien avant ce qui demande deux giga-octets.
    expect(r.journal, "un refus d'entrée ne doit pas dépendre du modèle").not.toMatch(/Modèle absent/);
  });

  it("et il le dit aussi quand ce ne sont pas des octets de WAV", async () => {
    const r = await restaurer({ audio: new Uint8Array(Buffer.from("ceci n'est pas un fichier audio")) });
    expect(r.ok).toBe(false);
    expect(r.journal).toMatch(/cadence illisible/);
    expect(r.journal, "un refus d'entrée ne doit pas dépendre du modèle").not.toMatch(/Modèle absent/);
  });
});

describe("le dosage du rendu dans le son reçu", () => {
  it("À ZÉRO, LE SON REÇU RESSORT INCHANGÉ", () => {
    const r = doser(plat([0.2, 0.4]), plat([0.9, 0.9]), 0);
    expect(r.getChannelData(0)[10]).toBeCloseTo(0.2, 6);
    expect(r.getChannelData(1)[10]).toBeCloseTo(0.4, 6);
  });

  it("à un, le son est entièrement celui du moteur", () => {
    const r = doser(plat([0.2, 0.4]), plat([0.9, 0.1]), 1);
    expect(r.getChannelData(0)[10]).toBeCloseTo(0.9, 6);
    expect(r.getChannelData(1)[10]).toBeCloseTo(0.1, 6);
  });

  it("à la moitié, chaque canal est la moyenne des deux", () => {
    const r = doser(plat([0.2, 0.4]), plat([0.8, 0.6]), 0.5);
    expect(r.getChannelData(0)[10]).toBeCloseTo(0.5, 6);
    expect(r.getChannelData(1)[10]).toBeCloseTo(0.5, 6);
  });

  it("un dosage hors bornes est ramené dedans, sans rendre de NaN", () => {
    for (const part of [-1, 2, NaN]) {
      const r = doser(plat([0.3]), plat([0.7]), part);
      expect([...r.getChannelData(0)].every((v) => Number.isFinite(v)), String(part)).toBe(true);
    }
  });

  it("la longueur rendue est la plus courte des deux", () => {
    expect(doser(plat([0.5], 100), plat([0.5], 60), 1).length).toBe(60);
    expect(doser(plat([0.5], 40), plat([0.5], 90), 1).length).toBe(40);
  });

  it("UN CANAL QUE LE MOTEUR N'A PAS RENDU PREND LE SIEN, et non du silence", () => {
    // Le moteur rend du mono pour du mono et du stéréo pour du stéréo, mesuré ; mais rien ne le
    // garantit, et un canal manquant doit laisser passer le son reçu plutôt que de se taire.
    const r = doser(plat([0.2, 0.4, 0.6]), plat([0.8]), 1);
    expect(r.numberOfChannels).toBe(3);
    for (let c = 0; c < 3; c++) expect(r.getChannelData(c)[10]).toBeCloseTo(0.8, 6);
    const moitie = doser(plat([0.2, 0.4, 0.6]), plat([0.8]), 0.5);
    expect(moitie.getChannelData(2)[10]).toBeCloseTo(0.7, 6);
  });

  it("la cadence est celle du son reçu, puisque c'est elle qu'on rend", () => {
    expect(doser(plat([0.5]), plat([0.5]), 1).sampleRate).toBe(SR);
  });
});
