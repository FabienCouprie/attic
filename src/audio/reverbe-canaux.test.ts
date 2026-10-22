// audio/reverbe-canaux.test.ts — Les deux réverbérations à convolution, et la pièce qu'elles
// partagent, à tout nombre de canaux.
//
// `traiterParPaires` est éprouvée ici plutôt qu'avec le reste de `multicanal.ts` : elle travaille
// sur des `AudioBuffer`, donc elle demande le polyfill, que les cas de géométrie n'ont pas besoin
// de payer.
//
// CE QUE CE FICHIER GARDE, ET POURQUOI IL EXISTE. Un `ConvolverNode` n'accepte une réponse
// impulsionnelle qu'à un, deux ou quatre canaux. Les deux réverbérations fabriquaient la leur avec
// le nombre de canaux de l'ENTRÉE : un son à trois, cinq, six ou huit canaux les faisait donc
// tomber sur « the convolution buffer must consist of 1, 2 or 4 channels », l'erreur brute du
// moteur audio, en anglais. Six est la disposition 5.1, que le reste du dépôt porte.
//
// MESURÉ D'UN À HUIT CANAUX avant de corriger quoi que ce soit : un, deux et quatre passaient et
// ressortaient tous leurs canaux remplis ; trois, cinq, six et huit jetaient. Ce n'était donc pas
// une histoire de canaux muets — le cas du banc multicanal qui cherche cela ne pouvait rien voir,
// puisque rien ne revenait.
//
// UN, DEUX ET QUATRE CANAUX GARDENT LE CHEMIN D'ORIGINE, et ce fichier ne le vérifie pas : ce sont
// les empreintes enregistrées du dépôt qui le tiennent, et elles comparent au bit près, ce qu'une
// assertion écrite ici ne saurait pas faire.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { appliquerReverberation } from "./effets-reverbe";
import { appliquerReverbeProgressive } from "./effets-etirement";
import { traiterParPaires } from "./multicanal";

const SR = 48000;
const DUREE = 0.25;
/** Une fréquence par canal : on sait lequel survit et lequel a été jeté. */
const FREQ = [110, 165, 220, 330, 440, 550, 660, 770];

function entree(canaux: number): AudioBuffer {
  const n = Math.round(SR * DUREE);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * FREQ[c % FREQ.length] * (i / SR));
  }
  return b;
}

/** Les rangs des canaux qui portent quelque chose. */
function vivants(b: AudioBuffer): number[] {
  const out: number[] = [];
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    let max = 0;
    for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i]));
    if (max > 1e-6) out.push(c);
  }
  return out;
}

const TOUS_LES_COMPTES = [1, 2, 3, 4, 5, 6, 8];

describe("le traitement par paires", () => {
  it("rend autant de canaux qu'il en reçoit, et les remplit tous", async () => {
    for (const canaux of TOUS_LES_COMPTES) {
      const r = await traiterParPaires(entree(canaux), (p) => p);
      expect(r.numberOfChannels, `${canaux} canaux`).toBe(canaux);
      expect(vivants(r), `${canaux} canaux`).toEqual([...Array(canaux).keys()]);
    }
  });

  it("UN CANAL IMPAIR EN FIN DE LISTE N'EST PAS PERDU, et ne reçoit pas son voisin", async () => {
    // Le dernier canal d'un compte impair se double pour former sa paire ; c'est sa PREMIÈRE voie
    // qu'il faut reprendre. Prendre la seconde lui donnerait la copie de lui-même faite pour le
    // moteur, ce qui est juste par accident ici, mais faux dès que le traitement n'est pas neutre.
    const trois = await traiterParPaires(entree(3), (p) => p);
    const attendu = entree(3);
    for (let c = 0; c < 3; c++) {
      expect(trois.getChannelData(c)[100], `canal ${c}`)
        .toBeCloseTo(attendu.getChannelData(c)[100], 6);
    }
  });

  it("la longueur rendue est la plus courte des paires", async () => {
    let appel = 0;
    const r = await traiterParPaires(entree(6), (p) => {
      // La deuxième paire rend un tampon plus court : la sortie doit s'aligner sur elle.
      const n = appel++ === 1 ? Math.floor(p.length / 2) : p.length;
      const court = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: p.sampleRate });
      for (let c = 0; c < 2; c++) court.copyToChannel(p.getChannelData(c).slice(0, n), c);
      return court;
    });
    expect(r.length).toBe(Math.floor(Math.round(SR * DUREE) / 2));
    expect(r.numberOfChannels).toBe(6);
  });
});

describe("la réverbération, à tout nombre de canaux", () => {
  it("NE TOMBE JAMAIS, et rend tous ses canaux remplis", async () => {
    for (const canaux of TOUS_LES_COMPTES) {
      const r = await appliquerReverberation(entree(canaux), 30, 1, 50, () => 0.5);
      expect(r.numberOfChannels, `${canaux} canaux`).toBe(canaux);
      expect(vivants(r), `${canaux} canaux`).toEqual([...Array(canaux).keys()]);
      expect([...r.getChannelData(0)].every((v) => Number.isFinite(v)), `${canaux} canaux`).toBe(true);
    }
  }, 120000);
});

describe("la réverbération progressive, à tout nombre de canaux", () => {
  it("NE TOMBE JAMAIS, et rend tous ses canaux remplis", async () => {
    for (const canaux of TOUS_LES_COMPTES) {
      const r = await appliquerReverbeProgressive(entree(canaux), 30, 0, 50, 1, () => 0.5);
      expect(r.numberOfChannels, `${canaux} canaux`).toBe(canaux);
      expect(vivants(r), `${canaux} canaux`).toEqual([...Array(canaux).keys()]);
    }
  }, 120000);
});
