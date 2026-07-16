// audio/effets-montage.ts — Effets (issus du découpage de effets.ts).
import { type PositionZone } from "./commun";

export function extraireZone(buffer: AudioBuffer, debutSec: number, dureeSec: number): AudioBuffer {
  const debutEch = Math.max(0, Math.min(buffer.length, Math.floor(debutSec * buffer.sampleRate)));
  const longueur = Math.max(1, Math.min(buffer.length - debutEch, Math.floor(dureeSec * buffer.sampleRate)));
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: longueur,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < longueur; i++) dst[i] = src[debutEch + i];
  }
  return resultat;
}

// Génère une piste silencieuse de `dureeTotaleSec` secondes dans laquelle une
// copie du son `son` est mixée, centrée sur le milieu de chaque zone (debut +
// duree/2). Les chevauchements s'additionnent, les débordements sont coupés aux
// bords. Sortie stéréo, à la fréquence d'échantillonnage du son.


export function placerSonSurZones(
  son: AudioBuffer,
  dureeTotaleSec: number,
  zones: PositionZone[]
): AudioBuffer {
  const sampleRate = son.sampleRate;
  const longueurSortie = Math.max(1, Math.round(dureeTotaleSec * sampleRate));
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: longueurSortie, sampleRate });
  const sonLen = son.length;
  for (const zone of zones) {
    const centreSec = zone.debut + zone.duree / 2;
    const debutEch = Math.round(centreSec * sampleRate - sonLen / 2);
    for (let c = 0; c < 2; c++) {
      const src = son.getChannelData(c % son.numberOfChannels);
      const dst = resultat.getChannelData(c);
      for (let i = 0; i < sonLen; i++) {
        const pos = debutEch + i;
        if (pos < 0 || pos >= longueurSortie) continue;
        dst[pos] += src[i];
      }
    }
  }
  return resultat;
}



export function reinsererZone(
  pisteOriginale: AudioBuffer,
  zoneTraitee: AudioBuffer,
  debutSec: number,
  fonduMs: number
): AudioBuffer {
  const sampleRate = pisteOriginale.sampleRate;
  const debutEch = Math.max(0, Math.min(pisteOriginale.length, Math.round(debutSec * sampleRate)));
  const fonduEch = Math.max(1, Math.round((fonduMs / 1000) * sampleRate));
  const resultat = new AudioBuffer({
    numberOfChannels: pisteOriginale.numberOfChannels,
    length: pisteOriginale.length,
    sampleRate,
  });

  for (let c = 0; c < resultat.numberOfChannels; c++) {
    const original = pisteOriginale.getChannelData(c % pisteOriginale.numberOfChannels);
    const zone = zoneTraitee.getChannelData(c % zoneTraitee.numberOfChannels);
    const dst = resultat.getChannelData(c);
    dst.set(original);

    for (let i = 0; i < zone.length; i++) {
      const posGlobale = debutEch + i;
      if (posGlobale >= dst.length) break;
      let poidsZone = 1;
      if (i < fonduEch) poidsZone = i / fonduEch;
      else if (i >= zone.length - fonduEch) poidsZone = (zone.length - 1 - i) / fonduEch;
      const poidsOriginal = 1 - poidsZone;
      dst[posGlobale] = zone[i] * poidsZone + original[posGlobale] * poidsOriginal;
    }
  }

  return resultat;
}



export async function melangerPistes(entrees: AudioBuffer[], niveauDb: number): Promise<AudioBuffer> {
  const canaux = Math.max(...entrees.map((e) => e.numberOfChannels), 1);
  const dureeMax = Math.max(...entrees.map((e) => e.duration));
  const frequence = entrees[0].sampleRate;
  const offline = new OfflineAudioContext(canaux, Math.ceil(dureeMax * frequence), frequence);

  const gainSortie = offline.createGain();
  gainSortie.gain.value = Math.pow(10, niveauDb / 20);
  gainSortie.connect(offline.destination);

  for (const buffer of entrees) {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(gainSortie);
    source.start(0);
  }

  return offline.startRendering();
}



export async function fusionnerPistes(
  buffer1: AudioBuffer,
  buffer2: AudioBuffer,
  chevauchementSec: number
): Promise<AudioBuffer> {  const sr = buffer1.sampleRate;
  const dur1 = buffer1.duration;
  const dur2 = buffer2.duration;
  const chev = Math.max(0, Math.min(chevauchementSec, dur1, dur2));
  const nbCanaux = Math.max(buffer1.numberOfChannels, buffer2.numberOfChannels);
  const duree = dur1 + dur2 - chev;
  const offline = new OfflineAudioContext(nbCanaux, Math.ceil(duree * sr), sr);

  const src1 = offline.createBufferSource();
  src1.buffer = buffer1;
  const gain1 = offline.createGain();
  gain1.gain.setValueAtTime(1, 0);
  if (chev > 0) {
    const tDebutFondu = dur1 - chev;
    gain1.gain.setValueAtTime(1, tDebutFondu);
    gain1.gain.linearRampToValueAtTime(0, dur1);
  }
  src1.connect(gain1);
  gain1.connect(offline.destination);
  src1.start(0);

  const tDepart = dur1 - chev;
  const src2 = offline.createBufferSource();
  src2.buffer = buffer2;
  const gain2 = offline.createGain();
  if (chev > 0) {
    gain2.gain.setValueAtTime(0, tDepart);
    gain2.gain.linearRampToValueAtTime(1, dur1);
  } else {
    gain2.gain.setValueAtTime(1, tDepart);
  }
  src2.connect(gain2);
  gain2.connect(offline.destination);
  src2.start(tDepart);

  return offline.startRendering();
}



export interface CentreCoteResult {
  centre: AudioBuffer;
  cote: AudioBuffer;
}



export function echangerCanaux(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels < 2) return buffer;
  const sampleRate = buffer.sampleRate;
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate });
  sortie.getChannelData(0).set(buffer.getChannelData(1));
  sortie.getChannelData(1).set(buffer.getChannelData(0));
  return sortie;
}



export function extraireCentreCote(buffer: AudioBuffer): CentreCoteResult {
  const sampleRate = buffer.sampleRate;
  const centre = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate });
  const cote = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate });
  const chL = buffer.getChannelData(0);
  const chR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : chL;
  for (let i = 0; i < buffer.length; i++) {
    const mid = (chL[i] + chR[i]) / 2;
    const side = (chL[i] - chR[i]) / 2;
    centre.getChannelData(0)[i] = mid;
    centre.getChannelData(1)[i] = mid;
    cote.getChannelData(0)[i] = side;
    cote.getChannelData(1)[i] = -side;
  }
  return { centre, cote };
}

// --- STFT réutilisable (analyse/synthèse à recouvrement) -----------------
// Utilisé par le séparateur IA, factorisé depuis le vocodeur de phase.



export function inverserAudio(buffer: AudioBuffer): AudioBuffer {
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) dst[i] = src[buffer.length - 1 - i];
  }
  return resultat;
}

// --- Aligneur de piste : ajuste une piste à la longueur d'une référence ---
// Si la piste est trop courte : ajoute du silence (avant ou après).
// Si la piste est trop longue : applique un fade (avant ou après).
// La référence passe inchangée sur la sortie 0, la piste alignée sur la sortie 1.

export function alignerPiste(
  reference: AudioBuffer,
  piste: AudioBuffer,
  position: "avant" | "apres",
): AudioBuffer[] {
  const sr = reference.sampleRate;
  const refLen = reference.length;
  const pisteLen = piste.length;
  const nbCanaux = Math.max(reference.numberOfChannels, piste.numberOfChannels);
  const dureeFade = Math.min(0.1, reference.duration * 0.05); // 100ms ou 5% de la réf
  const fadeEch = Math.floor(dureeFade * sr);

  const pisteAlignee = new AudioBuffer({ numberOfChannels: nbCanaux, length: refLen, sampleRate: sr });

  for (let c = 0; c < nbCanaux; c++) {
    const src = piste.getChannelData(Math.min(c, piste.numberOfChannels - 1));
    const dst = pisteAlignee.getChannelData(c);

    if (pisteLen < refLen) {
      // Piste trop courte : ajouter du silence
      if (position === "avant") {
        // Silence au début, piste à la fin
        const offset = refLen - pisteLen;
        for (let i = 0; i < pisteLen; i++) dst[offset + i] = src[i];
      } else {
        // Piste au début, silence à la fin
        for (let i = 0; i < pisteLen; i++) dst[i] = src[i];
      }
    } else if (pisteLen > refLen) {
      // Piste trop longue : fade
      const copieLen = refLen;
      if (position === "avant") {
        // Fade d'ouverture au début (on garde le début, fade out à la fin)
        for (let i = 0; i < copieLen; i++) {
          let echantillon = src[i];
          const distFin = copieLen - i;
          if (distFin < fadeEch) {
            const t = distFin / fadeEch;
            echantillon *= 0.5 * (1 - Math.cos(Math.PI * t));
          }
          dst[i] = echantillon;
        }
      } else {
        // Fade de fermeture à la fin (on garde la fin, fade in au début)
        const offset = pisteLen - refLen;
        for (let i = 0; i < copieLen; i++) {
          let echantillon = src[offset + i];
          if (i < fadeEch) {
            const t = i / fadeEch;
            echantillon *= 0.5 * (1 - Math.cos(Math.PI * t));
          }
          dst[i] = echantillon;
        }
      }
    } else {
      // Piste de même longueur : copie exacte, aucune déformation
      for (let i = 0; i < pisteLen; i++) dst[i] = src[i];
    }
  }

  return [reference, pisteAlignee];
}


