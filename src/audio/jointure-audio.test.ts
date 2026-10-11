// audio/jointure-audio.test.ts — Deux pistes bout à bout, et où est la vraie borne du chevauchement.
//
// CE FICHIER N'EXISTAIT PAS, et c'est ce qui a rendu possible le défaut qu'il garde. `fusionnerPistes`
// ramène déjà le chevauchement au plus court des deux pistes, ce qui est la seule borne que ce
// traitement puisse avoir : on ne recouvre pas plus de son qu'il n'y en a. Mais rien ne le prouvait,
// de sorte que la fiche portait un plafond de trente secondes POUR SE DÉFENDRE d'un cœur dont elle ne
// savait rien.
//
// Le plafond est donc ôté, et ces cas sont ce qui le remplace.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fusionnerPistes } from "./effets-montage";

const SR = 44100;

/** Un signal constant : tout écart à sa valeur dans le résultat vient du fondu, et de rien d'autre. */
function constant(dureeS: number, valeur = 1): AudioBuffer {
  const n = Math.round(SR * dureeS);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.getChannelData(0).fill(valeur);
  return b;
}

describe("la jointure de deux pistes", () => {
  it("SANS CHEVAUCHEMENT, LES DEUX DURÉES S'AJOUTENT, ce qui est une concaténation franche", async () => {
    const out = await fusionnerPistes(constant(2), constant(3), 0);
    expect(out.duration, `${out.duration.toFixed(4)} s`).toBeCloseTo(5, 2);
  });

  it("ET LE CHEVAUCHEMENT RACCOURCIT D'AUTANT", async () => {
    for (const chev of [0.5, 1, 2]) {
      const out = await fusionnerPistes(constant(3), constant(4), chev);
      expect(out.duration, `chevauchement ${chev} s : ${out.duration.toFixed(4)} s`)
        .toBeCloseTo(7 - chev, 2);
    }
  });

  it("LE CHEVAUCHEMENT EST RAMENÉ AU PLUS COURT DES DEUX PISTES, et c'est la seule borne qui existe", () => {
    // C'EST LE CAS QUI REMPLACE LE PLAFOND DE LA FICHE. On ne recouvre pas plus de son qu'il n'y en
    // a : demander trois cents secondes de fondu entre deux pistes de trois et cinq secondes donne
    // le même résultat que d'en demander trois, et la sortie ne descend jamais sous la plus longue
    // des deux.
    const demandes = [10, 30, 100, 300, 3600];
    return Promise.all(demandes.map(async (chev) => {
      const out = await fusionnerPistes(constant(3), constant(5), chev);
      // 3 + 5 − 3 = 5 secondes, quel que soit le chevauchement demandé.
      expect(out.duration, `chevauchement demandé ${chev} s : ${out.duration.toFixed(4)} s`)
        .toBeCloseTo(5, 2);
    }));
  });

  it("ET IL NE DESCEND PAS SOUS ZÉRO, un chevauchement négatif valant zéro", async () => {
    const out = await fusionnerPistes(constant(2), constant(3), -10);
    expect(out.duration, `${out.duration.toFixed(4)} s`).toBeCloseTo(5, 2);
  });

  it("LE FONDU EST ENCHAÎNÉ ET NON ADDITIF : deux signaux identiques gardent leur niveau", async () => {
    // Les deux rampes sont linéaires et complémentaires : à chaque instant du recouvrement, ce qui
    // sort de la première et ce qui entre dans la seconde font un. Sur deux signaux IDENTIQUES, le
    // niveau doit donc se tenir d'un bout à l'autre, sans bosse ni creux au raccord.
    const out = await fusionnerPistes(constant(2), constant(2), 1);
    const d = out.getChannelData(0);
    // Le recouvrement va de 1 s à 2 s : on le lit en son milieu, à l'écart des bords.
    let bas = Infinity, haut = -Infinity;
    for (let i = Math.round(1.1 * SR); i < Math.round(1.9 * SR); i++) {
      bas = Math.min(bas, d[i]);
      haut = Math.max(haut, d[i]);
    }
    expect(bas, `le creux du recouvrement : ${bas.toFixed(4)}`).toBeGreaterThan(0.98);
    expect(haut, `la bosse du recouvrement : ${haut.toFixed(4)}`).toBeLessThan(1.02);
  });

  it("UN CHEVAUCHEMENT PLUS LONG QUE L'ANCIEN PLAFOND FAIT CE QU'IL DIT, sur des pistes assez longues", async () => {
    // C'est ce que le plafond de trente secondes interdisait de demander : un fondu très lent entre
    // deux pièces, qui est un geste de composition à part entière.
    const out = await fusionnerPistes(constant(60), constant(60), 45);
    expect(out.duration, `${out.duration.toFixed(4)} s`).toBeCloseTo(75, 1);
    const d = out.getChannelData(0);
    // Au milieu du recouvrement, qui va de 15 s à 60 s, le niveau se tient.
    const i = Math.round(37.5 * SR);
    expect(d[i], `au milieu du fondu : ${d[i].toFixed(4)}`).toBeGreaterThan(0.98);
  });
});
