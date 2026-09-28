// audio/generation-echantillon.ts — Rendre une sequence avec un echantillon.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { type NoteEvenement } from "./midi-sequence";

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
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      if (srcIdx + 1 >= srcLen) break;
      const g = srcG[srcIdx] * (1 - frac) + srcG[Math.min(srcIdx + 1, srcLen - 1)] * frac;
      const d = srcD[srcIdx] * (1 - frac) + srcD[Math.min(srcIdx + 1, srcLen - 1)] * frac;
      gauche[posSortie] += g * gain;
      droite[posSortie] += d * gain;
    }
  }

  return resultat;
}


