// audio/midi-soundfont.ts — Le rendu par echantillons d'un SoundFont.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import type { StructureSF2 } from "./soundfont";
import { chercherZonesInstrument } from "./soundfont";
import type { NoteEvenement } from "./midi-sequence";

export function rendreAvecSF2(
  sf: StructureSF2,
  notes: NoteEvenement[],
  volume: number,
  programme = 0,
  banque = 0,
): AudioBuffer {
  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    return ctx.startRendering() as unknown as AudioBuffer;
  }

  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), 0.5);
  const sr = 44100;
  const length = Math.ceil(duree * sr);
  const resultat = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
  const gauche = resultat.getChannelData(0);
  const droite = resultat.getChannelData(1);
  const vol = Math.max(0, Math.min(1, volume / 100));

  for (const n of notes) {
    const dureeNote = n.fin - n.debut;
    if (dureeNote <= 0.001) continue;

    const matches = chercherZonesInstrument(sf, n.note, n.velocite, programme, banque);
    if (matches.length === 0) continue;
    if (notes.indexOf(n) < 5) {
      const first = matches[0];
      const ech = first.echantillon;
      const zone = first.zone;
      const root = zone.rootKey ?? ech.noteOriginale;
      const effPan = (ech.type === 2 || ech.type === 0x8002) ? 1 : (ech.type === 4 || ech.type === 0x8004) ? -1 : (zone.pan ?? 0) / 500;
      console.log(`[attic] SF2 note ${n.note} vel=${n.velocite} -> inst=${first.instrumentIdx} zones=${matches.length} sample="${ech.nom}" root=${root} sr=${ech.taux || 44100} loop=${zone.boucleActive} att=${zone.attenuation ?? 0} type=${ech.type} pan=${zone.pan ?? 0} effPan=${effPan.toFixed(2)}`);
    }

    for (const match of matches) {
      const ech = match.echantillon;
      const zone = match.zone;
      const donnees = match.donnees;
      const srcDebut = match.debutSample;
      const srcFin = match.finSample;
      const srcLen = srcFin - srcDebut;
      if (srcLen < 2) continue;

      const rootNote = zone.rootKey ?? ech.noteOriginale;
      const noteDiff = n.note - rootNote + (zone.coarseTune ?? 0) + (ech.correction + (zone.fineTune ?? 0)) / 100;
      const sampleRate = ech.taux || sr;
      const ratio = (sampleRate / sr) * (2 ** (noteDiff / 12));
      const attenuation = zone.attenuation ?? 0;
      const gain = (n.velocite / 127) * vol * 0.8 * Math.pow(10, -attenuation / 200);
      const pan = (ech.type === 2 || ech.type === 0x8002) ? 1
                  : (ech.type === 4 || ech.type === 0x8004) ? -1
                  : (zone.pan ?? 0) / 500;
      const gainGauche = Math.sqrt((1 - pan) / 2);
      const gainDroite = Math.sqrt((1 + pan) / 2);

      const debutEch = Math.max(0, Math.floor(n.debut * sr));
      const boucleActive = zone.boucleActive && ech.debutBoucle < ech.finBoucle && ech.finBoucle > 0;
      const nbEchantJoues = Math.floor((boucleActive ? dureeNote : Math.min(dureeNote, srcLen / ratio)) * sr);
      const releaseSamples = Math.max(1, Math.min(Math.floor(0.005 * sr), nbEchantJoues));
      const fadeOutStart = nbEchantJoues - releaseSamples;

      const debutBoucle = (ech.debutBoucle - ech.debut);
      const finBoucle = (ech.finBoucle - ech.debut);
      const longueurBoucle = finBoucle - debutBoucle;

      for (let j = 0; j < nbEchantJoues; j++) {
        const posSortie = debutEch + j;
        if (posSortie >= length) break;

        let srcPos = j * ratio;
        let srcIdx: number;
        let frac: number;

        if (boucleActive && longueurBoucle > 0 && srcPos >= debutBoucle + longueurBoucle) {
          const posBoucle = ((srcPos - debutBoucle) % longueurBoucle);
          srcPos = debutBoucle + posBoucle;
        }

        srcIdx = srcDebut + Math.floor(srcPos);
        frac = srcPos - Math.floor(srcPos);

        if (!boucleActive && srcIdx + 1 >= srcDebut + srcLen) {
          break;
        }

        let idx2 = srcIdx + 1;
        if (boucleActive && longueurBoucle > 0 && idx2 >= srcDebut + finBoucle) {
          idx2 = srcDebut + debutBoucle + ((idx2 - srcDebut - finBoucle) % longueurBoucle);
        }
        if (idx2 >= srcDebut + srcLen) {
          idx2 = srcDebut + srcLen - 1;
        }
        const g = donnees[srcIdx] * (1 - frac) + donnees[idx2] * frac;
        const fadeOut = j >= fadeOutStart ? Math.max(0, (nbEchantJoues - j) / releaseSamples) : 1;
        const mono = (g / 32768) * gain * fadeOut;
        gauche[posSortie] += mono * gainGauche;
        droite[posSortie] += mono * gainDroite;
      }
    }
  }

  normaliserBuffer(resultat);
  return resultat;
}


export function normaliserBuffer(buffer: AudioBuffer, ceiling = 1): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak > ceiling) {
    const s = ceiling / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] *= s;
    }
  }
}



