// audio/frequence-source.ts — Décoder un fichier à sa propre fréquence.
//
// POURQUOI. `decodeAudioData` rééchantillonne TOUJOURS vers la fréquence du contexte qui décode, et
// `contexteDecodage()` la fixe à 48 kHz. C'est juste pour un nœud d'entrée — le résultat ne dépend
// plus de la carte son —, mais c'est une faute dans un traitement par lot ou une conversion : une
// source à 44,1 kHz ressortait à 48 kHz, une conversion que personne n'avait demandée, et qu'un
// ingénieur du son découvre à la livraison. La fréquence doit être celle de la source.
//
// On la lit donc dans l'en-tête du fichier, et l'on décode avec un contexte à cette fréquence. Le
// décodage reste déterministe : il dépend du fichier, jamais du matériel. Un format dont on ne sait
// pas lire l'en-tête garde l'ancien comportement, 48 kHz — mieux vaut une conversion connue qu'un
// échec.

import { contexteDecodage } from "./commun";

const PLANCHER = 8000;
const PLAFOND = 384000;

const plausible = (f: number): number | null =>
  Number.isFinite(f) && f >= PLANCHER && f <= PLAFOND && Math.round(f) === f ? f : null;

const texte = (o: Uint8Array, a: number, n: number): string =>
  String.fromCharCode(...o.subarray(a, a + n));

/** Le flottant étendu de 80 bits de l'AIFF, grand-boutiste. */
function etendu80(o: Uint8Array, p: number): number {
  const exposant = ((o[p] & 0x7f) << 8) | o[p + 1];
  let mantisse = 0;
  for (let i = 0; i < 8; i++) mantisse = mantisse * 256 + o[p + 2 + i];
  return mantisse * Math.pow(2, exposant - 16383 - 63);
}

function wav(o: Uint8Array, v: DataView): number | null {
  for (let p = 12; p + 8 <= o.length; ) {
    const id = texte(o, p, 4), n = v.getUint32(p + 4, true);
    if (id === "fmt " && p + 16 <= o.length) return v.getUint32(p + 12, true);
    p += 8 + n + (n % 2);
  }
  return null;
}

function aiff(o: Uint8Array, v: DataView): number | null {
  for (let p = 12; p + 8 <= o.length; ) {
    const id = texte(o, p, 4), n = v.getUint32(p + 4, false);
    if (id === "COMM" && p + 26 <= o.length) return Math.round(etendu80(o, p + 16));
    p += 8 + n + (n % 2);
  }
  return null;
}

function flac(o: Uint8Array): number | null {
  // Le premier bloc de métadonnées est toujours STREAMINFO ; la fréquence y tient sur 20 bits.
  if (o.length < 8 + 13 || (o[4] & 0x7f) !== 0) return null;
  const d = 8;
  return (o[d + 10] << 12) | (o[d + 11] << 4) | (o[d + 12] >> 4);
}

function ogg(o: Uint8Array, v: DataView): number | null {
  const fin = Math.min(o.length - 16, 512);
  for (let p = 0; p < fin; p++) {
    if (o[p] === 0x01 && texte(o, p + 1, 6) === "vorbis") return v.getUint32(p + 12, true);
    // Opus se décode toujours à 48 kHz : c'est le format, et non un choix.
    if (texte(o, p, 8) === "OpusHead") return 48000;
  }
  return null;
}

const MP3_FREQUENCES = [44100, 48000, 32000];

function mp3(o: Uint8Array): number | null {
  let p = 0;
  if (texte(o, 0, 3) === "ID3" && o.length > 10) {
    p = 10 + (((o[6] & 127) << 21) | ((o[7] & 127) << 14) | ((o[8] & 127) << 7) | (o[9] & 127));
    if (o[5] & 0x10) p += 10; // pied de page
  }
  const fin = Math.min(o.length - 4, p + 65536);
  for (; p < fin; p++) {
    if (o[p] !== 0xff || (o[p + 1] & 0xe0) !== 0xe0) continue;
    const version = (o[p + 1] >> 3) & 3; // 0 : MPEG 2.5, 2 : MPEG 2, 3 : MPEG 1
    const couche = (o[p + 1] >> 1) & 3;
    const indice = (o[p + 2] >> 2) & 3;
    const debit = o[p + 2] >> 4;
    if (version === 1 || couche === 0 || indice === 3 || debit === 15) continue;
    // AAC en ADTS partage la synchronisation, couche à zéro : écarté ci-dessus, traité à part.
    const base = MP3_FREQUENCES[indice];
    return version === 3 ? base : version === 2 ? base / 2 : base / 4;
  }
  return null;
}

const ADTS_FREQUENCES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

function adts(o: Uint8Array): number | null {
  if (o[0] !== 0xff || (o[1] & 0xf6) !== 0xf0) return null;
  return ADTS_FREQUENCES[(o[2] >> 2) & 0x0f] ?? null;
}

function mp4(o: Uint8Array, v: DataView): number | null {
  // L'entrée d'échantillon audio « mp4a » porte la fréquence en virgule fixe 16.16, à 28 octets de
  // son type. Au-delà de 65 535 Hz elle ne tient plus : on renonce alors plutôt que de lire faux.
  const fin = Math.min(o.length - 32, 4 * 1024 * 1024);
  for (let p = 4; p < fin; p++) {
    if (o[p] === 0x6d && texte(o, p, 4) === "mp4a") return v.getUint16(p + 28, false) || null;
  }
  return null;
}

/** La fréquence d'échantillonnage écrite dans l'en-tête du fichier, ou null si on ne sait pas la lire. */
export function frequenceDuFichier(octets: ArrayBuffer): number | null {
  const o = new Uint8Array(octets);
  if (o.length < 12) return null;
  const v = new DataView(octets);
  const tete = texte(o, 0, 4), forme = texte(o, 8, 4);
  let f: number | null = null;
  if ((tete === "RIFF" || tete === "RF64") && forme === "WAVE") f = wav(o, v);
  else if (tete === "FORM" && (forme === "AIFF" || forme === "AIFC")) f = aiff(o, v);
  else if (tete === "fLaC") f = flac(o);
  else if (tete === "OggS") f = ogg(o, v);
  else if (texte(o, 4, 4) === "ftyp") f = mp4(o, v);
  else f = adts(o) ?? mp3(o);
  return f === null ? null : plausible(f);
}

/**
 * Décode un fichier SANS le rééchantillonner : le tampon rendu est à la fréquence de la source.
 * `decodeAudioData` détache le tableau qu'on lui passe ; la fréquence est donc lue avant.
 */
export async function decoderSansReechantillonner(octets: ArrayBuffer): Promise<AudioBuffer> {
  const f = frequenceDuFichier(octets);
  const ctx = f ? new OfflineAudioContext(1, 1, f) : contexteDecodage();
  return ctx.decodeAudioData(octets);
}
