// audio/generation-echantillon.ts — Rendre une sequence avec un echantillon.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { type NoteEvenement } from "./midi-sequence";
import { echantillonCubique } from "./interpolation";

// ── Lecteur MIDI ────────────────────────────────────────────────────────────


export function rendreAvecEchantillon(
  notes: NoteEvenement[],
  echantillon: AudioBuffer,
  volume: number,
  noteReference: number,
): AudioBuffer {
  if (notes.length === 0 || echantillon.length === 0) {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    return ctx.startRendering() as unknown as AudioBuffer;
  }

  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), 0.5);
  const sr = echantillon.sampleRate;
  const length = Math.ceil(duree * sr);
  const resultat = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
  const gauche = resultat.getChannelData(0);
  const droite = resultat.getChannelData(1);
  const srcG = echantillon.getChannelData(0);
  const srcD = echantillon.numberOfChannels > 1 ? echantillon.getChannelData(1) : srcG;
  const srcLen = echantillon.length;
  const vol = Math.max(0, Math.min(1, volume / 100));

  for (const n of notes) {
    if (n.fin <= n.debut) continue;
    const ratio = 2 ** ((n.note - noteReference) / 12);
    const dureeEchantillon = srcLen / sr;
    const dureeJouee = dureeEchantillon / ratio;
    const dureeCible = n.fin - n.debut;
    const dureeEffective = Math.min(dureeJouee, dureeCible);
    const debutEch = Math.max(0, Math.floor(n.debut * sr));
    const finEch = Math.min(length, Math.ceil((n.debut + dureeEffective) * sr));
    const gain = (n.velocite / 127) * vol * 0.5;
    const nbEchantJoues = Math.floor(dureeEffective * sr);

    for (let j = 0; j < nbEchantJoues; j++) {
      const posSortie = debutEch + j;
      if (posSortie >= length || posSortie >= finEch) break;
      const srcPos = j * ratio;
      if (Math.floor(srcPos) + 1 >= srcLen) break;
      // ═══ CUBIQUE, ET NON PLUS LINÉAIRE : C'EST LA QUALITÉ MÊME D'UN SAMPLER ═══
      //
      // Ce chemin TRANSPOSE une note : chaque échantillon de sortie tombe entre deux échantillons de
      // source, et l'interpolateur décide de ce qu'on entend. Il était linéaire, et ce que cela
      // coûtait est mesuré dans `interpolation.test.ts` : le rapport de la raie aux parasites passe
      // de **47,3 à 66,5 dB** sur une tierce vers le bas et de **33,7 à 55,8 dB** sur une octave,
      // soit vingt décibels de parasites en moins.
      //
      // LE NOYAU EST CELUI QUE `commun.ts` EMPLOYAIT DÉJÀ. Le dépôt avait donc le bon interpolateur,
      // et ce chemin-ci s'en passait. L'accesseur borne au dernier échantillon, comme la version
      // linéaire le faisait avec son `Math.min`.
      const lireG = (i: number) => srcG[Math.min(srcLen - 1, Math.max(0, i))];
      const lireD = (i: number) => srcD[Math.min(srcLen - 1, Math.max(0, i))];
      const g = echantillonCubique(lireG, srcPos);
      const d = echantillonCubique(lireD, srcPos);
      gauche[posSortie] += g * gain;
      droite[posSortie] += d * gain;
    }
  }

  return resultat;
}


