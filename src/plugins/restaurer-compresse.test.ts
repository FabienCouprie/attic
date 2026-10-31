import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

import { doser, fiches, messageDEchec } from "./restaurer-compresse";

const {
  CADENCE_EXIGEE, CONTEXTE_BORD, TRANCHE_DEFAUT, memoireRefusee, optionsDeTranche, restaurer,
} = createRequire(import.meta.url)("../../electron/apollo.cjs") as {
  CADENCE_EXIGEE: number;
  CONTEXTE_BORD: number;
  TRANCHE_DEFAUT: number;
  memoireRefusee: (journal: string) => { peripherique: string | null; octets: number | null } | null;
  optionsDeTranche: (tranche: unknown, recouvrement?: number) => string[];
  restaurer: (o: { audio: Uint8Array }) => Promise<{ ok: boolean; journal?: string }>;
};

/** Les options de requête passées au moteur, en table. */
function requete(args: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] !== "--request-option") continue;
    const [cle, valeur] = args[i + 1].split("=");
    out[cle] = Number(valeur);
  }
  return out;
}

/** Ce que le moteur demande par trame de dix millisecondes, relevé de 195 à 205 s le 2026-10-31. */
const OCTETS_PAR_TRAME = 2068284;

/** La sortie que Fabien a collée, telle quelle, le début de sa première ligne manquant. */
const JOURNAL_DE_FABIEN = [
  "on of size 1589985280 failed.",
  "ggml_vulkan: vk::Device::allocateMemory: ErrorOutOfDeviceMemory",
  "ggml_gallocr_reserve_n_impl: failed to allocate Vulkan1 buffer of size 40143349760",
  "audiocpp_cli failed: Apollo shared graph allocation failed",
].join("\n");

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

describe("la mémoire que le moteur demande, qui suit la tranche et non le morceau", () => {
  // LE DÉFAUT QUE CES CAS GARDENT : le fichier entier passait en un seul graphe, de sorte que la
  // mémoire suivait la durée du morceau. 194 s demandaient 40 143 349 760 octets à une carte de six.
  // Ils tiennent sans modèle ni carte, donc en intégration continue ; l'épreuve d'application,
  // `tests-e2e/restaurer-dans-application.spec.ts`, fait passer le morceau entier pour de bon.

  it("LE MOTEUR REÇOIT TOUJOURS UNE TRANCHE, MÊME D'UN PROJET QUI PORTE « TRANCHE » À ZÉRO", () => {
    // Zéro était l'ancien défaut, et il est ENREGISTRÉ dans le projet de quiconque a posé le nœud
    // avant la correction : c'est le nœud que Fabien a lancé. Le moteur lit zéro comme « le
    // fichier entier », et il ne doit donc jamais le recevoir.
    for (const reglage of [undefined, 0, -3, Number.NaN, "", null]) {
      const r = requete(optionsDeTranche(reglage));
      expect(r.audio_chunk_duration_sec, `réglage ${String(reglage)}`).toBe(TRANCHE_DEFAUT);
    }
    expect(TRANCHE_DEFAUT).toBeGreaterThan(0);
    expect(requete(optionsDeTranche(25)).audio_chunk_duration_sec, "une tranche donnée passe telle quelle").toBe(25);
  });

  it("CHAQUE TRANCHE PORTE SON CONTEXTE DE BORD, sans quoi les coutures s'entendent", () => {
    // Sans contexte, des tranches de 5 s s'écartaient du rendu entier de −16,1 dB, autant que
    // l'effet lui-même ; une demi-seconde suffit à tomber au plancher du seize bits (−114 dB).
    for (const reglage of [0, 5, 10, 60]) {
      const r = requete(optionsDeTranche(reglage));
      expect(r.edge_pad_duration_sec, `tranche ${reglage}`).toBeGreaterThanOrEqual(0.5);
      expect(r.edge_pad_duration_sec).toBe(CONTEXTE_BORD);
      expect(r.audio_chunk_overlap_sec, "le fondu ne dépasse pas la moitié de la tranche")
        .toBeLessThanOrEqual(r.audio_chunk_duration_sec / 2);
    }
  });

  it("LE DÉFAUT DÉCLARÉ EST CELUI DU PONT, et il tient sur une carte de six giga-octets", () => {
    const tranche = fiches[0].parametres.find((p) => p.nom === "Tranche");
    expect(tranche?.defaut, "l'inspecteur et le pont doivent dire la même tranche").toBe(TRANCHE_DEFAUT);
    // La pente vaut pour les grands graphes ; aux petits, le moteur demande moins (1 933 020 688
    // octets mesurés pour 12 s). C'est donc un majorant, et il doit laisser de la place à côté.
    const trames = (Number(tranche?.defaut) + 2 * CONTEXTE_BORD) * 100 + 1;
    expect(trames * OCTETS_PAR_TRAME, "le défaut doit tenir dans la moitié d'une carte de six giga-octets")
      .toBeLessThan(3 * 2 ** 30);
  });

  it("LE REFUS DE MÉMOIRE SE LIT DANS LE JOURNAL QUE FABIEN A REÇU, et dans sa forme sans taille", () => {
    expect(memoireRefusee(JOURNAL_DE_FABIEN)).toEqual({ peripherique: "Vulkan1", octets: 40143349760 });
    // 31 s en un graphe : la réservation passe, l'allocation tombe, et le moteur ne dit plus de taille.
    expect(memoireRefusee("audiocpp_cli failed: vk::Device::allocateMemory: ErrorOutOfDeviceMemory"))
      .toEqual({ peripherique: null, octets: null });
    expect(memoireRefusee("audiocpp_cli failed: Apollo requires 44.1 kHz input audio"),
      "un autre échec n'est pas un refus de mémoire").toBe(null);
  });

  it("ET IL SE DIT AVEC SES CHIFFRES ET LE NOM DU RÉGLAGE, et non par le journal en anglais", () => {
    const message = messageDEchec({
      ok: false, tranche: 10, journal: JOURNAL_DE_FABIEN, memoire: memoireRefusee(JOURNAL_DE_FABIEN) });
    expect(message).toContain("Vulkan1");
    expect(message, "40 143 349 760 octets sont 37,4 Gio").toContain("37,4");
    expect(message).toContain("10 s");
    expect(message, "le réglage qui lève le refus doit être nommé tel qu'à l'écran").toContain("« Tranche »");
    expect(message).not.toContain("gallocr");
    // Un autre échec garde la fin du journal, qui est ce qu'on a de plus précis.
    expect(messageDEchec({ ok: false, journal: "x".repeat(300) + "fin" })).toMatch(/fin$/);
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
