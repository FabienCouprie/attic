// plugins/formants-hors-fil.ts — Le décalage de formants, calculé hors du fil de l'interface.
//
// POURQUOI CE PETIT MODULE. `audio/voice-changer.ts` reçoit son décalage de formants par injection,
// pour que la couche de calcul reste libre de tout import de prise. C'est ici, du côté des prises,
// que la version hors du fil est fabriquée, et le composant la passe au moment de l'appel.
//
// LE CAS EST MIXTE, ET C'EST POURQUOI SEULE CETTE ÉTAPE PASSE. Les préréglages Robot et Phone
// enchaînent des étapes rendues par `OfflineAudioContext`, qu'un worker ne peut pas accueillir ; mais
// elles ne bloquent pas le fil principal, le rendu ayant lieu ailleurs. Le seul coût qui figeait
// était ce décalage-ci, du JavaScript pur, et c'est donc le seul qu'il faut déplacer.

import { shiftFormantsVoie, type OptionsFormants } from "../audio/formants";
import { parCanal } from "./hors-fil";

/** Le décalage de formants d'un tampon entier, chaque voie calculée hors du fil si possible. */
export async function decalerFormantsHorsFil(
  buffer: AudioBuffer, pitchSemiTons: number, formantRatio: number,
): Promise<AudioBuffer> {
  const pitchRatio = Math.pow(2, pitchSemiTons / 12);
  // Le raccourci de la version en fil : sans transposition ni décalage, rien à faire, et il serait
  // absurde de démarrer un worker pour recopier un tampon.
  if (Math.abs(pitchRatio - 1) < 0.01 && Math.abs(formantRatio - 1) < 0.01) return buffer;

  const voies = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const parVoie = await parCanal<OptionsFormants, Float32Array>(
    voies, { pitchSemiTons, formantRatio },
    {
      creerWorker: () => new Worker(new URL("../workers/formants-worker.ts", import.meta.url), { type: "module" }),
      calcul: shiftFormantsVoie,
    },
  );
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(parVoie[c]);
  return out;
}
