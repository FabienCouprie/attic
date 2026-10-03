// plugins/glissando-hors-fil.ts — Le glissement entre agrégats, calculé hors du fil de l'interface.
//
// POURQUOI CE PETIT MODULE. Deux composants rendent le même glissement par la même fonction, « Gamme
// vers gamme » et « Accord vers accord » : ils ne diffèrent que par la façon de choisir les deux
// agrégats. Deux appels au socle écrits deux fois auraient fini par diverger d'un réglage.

import { sonDuGlissando, SR_GLISSANDO, type OptionsSonGlissando } from "../audio/glissando";
import { parUneFois } from "./hors-lot";

/** Le glissement rendu en son, dans un ouvrier quand on en a un. */
export async function glissandoHorsFil(o: OptionsSonGlissando): Promise<AudioBuffer> {
  const { echantillons } = await parUneFois<OptionsSonGlissando, { echantillons: Float32Array }>(o, {
    creerWorker: () => new Worker(new URL("../workers/glissando-agregats-worker.ts", import.meta.url), { type: "module" }),
    calcul: sonDuGlissando,
  });
  const tampon = new AudioBuffer({
    numberOfChannels: 1, length: Math.max(1, echantillons.length), sampleRate: SR_GLISSANDO,
  });
  // `copyToChannel` et non `getChannelData().set` : le tableau revenu d'un ouvrier n'est pas celui
  // du tampon, et une plate-forme où `getChannelData` rend une copie perdrait l'écriture.
  tampon.copyToChannel(new Float32Array(echantillons), 0);
  return tampon;
}
