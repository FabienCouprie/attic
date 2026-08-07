// src/workers/tts-utils.js — Utilitaires partagés pour les workers TTS.
// Découpage intelligent du texte et fusion douce des buffers audio.

// Abréviations courantes à ne pas confondre avec une fin de phrase.
// La liste couvre l'anglais, le français, l'allemand, l'espagnol et le russe translittéré.
const ABBREVIATIONS = new Set([
  // Anglais
  "m", "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "ave", "blvd", "rd",
  "etc", "eg", "ie", "no", "n", "vol", "vols", "inc", "ltd", "co", "corp", "plc",
  "llc", "lp", "llp", "pvt", "ltda", "esq", "bros", "phd", "md",
  // Français
  "mme", "mlle", "me", "prof", "pr", "dr", "ex", "no", "n°", "vol", "p", "pp",
  "cie", "sa", "sarl", "scs", "sca", "eurl", "sas", "scs", "sca", "sci",
  // Espagnol
  "sr", "sra", "srta", "d", "dra", "prof", "p", "pp", "vol", "vols",
  // Allemand
  "str", "hr", "fr", "dr", "prof", "dipl", "ing", "mag", "bsc", "msc",
  // Russe (translittéré latin)
  "mr", "mrs", "dr",
]);

const BOUNDARY_PLACEHOLDER = "\x00";
const DECIMAL_PLACEHOLDER = "\x01";

/**
 * Remplace temporairement les points des abréviations et des nombres décimaux
 * par des caractères de contrôle pour éviter les faux découpages de phrases.
 */
function protectBoundaries(text) {
  return text
    .replace(/(\d)\.(\d)/g, `$1${DECIMAL_PLACEHOLDER}$2`)
    .replace(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)\.(\s|$)/g, (match, word, space) => {
      const lower = word.toLowerCase();
      if (ABBREVIATIONS.has(lower)) {
        return `${word}${BOUNDARY_PLACEHOLDER}${space}`;
      }
      return match;
    });
}

/**
 * Restaure les caractères de contrôle en points réels.
 */
function restoreBoundaries(text) {
  return text.replace(new RegExp(BOUNDARY_PLACEHOLDER, "g"), ".").replace(new RegExp(DECIMAL_PLACEHOLDER, "g"), ".");
}

/**
 * Regroupe les phrases en chunks de longueur maximale `maxChars` sans couper de phrase.
 * Si une phrase dépasse, elle est découpée aux mots.
 */
function packSentences(sentences, maxChars) {
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      // Découpe sur les espaces et les tirets (y compris cadratin, demi-cadratin)
      // pour éviter les mots géants collés par de la ponctuation.
      const words = sentence.split(/[\s\-—–_/]+/).filter(Boolean);
      for (const word of words) {
        if (current.length + word.length + 1 > maxChars) {
          if (current) chunks.push(current.trim());
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      continue;
    }

    if (current.length + sentence.length + 1 > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  const result = chunks.length ? chunks : [sentences.join(" ")];
  // Sécurité : si un mot seul dépasse la limite, on le coupe brutalement.
  return result.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const parts = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      parts.push(chunk.slice(i, i + maxChars));
    }
    return parts;
  });
}

/**
 * Découpe un texte en morceaux de longueur maximale `maxChars`.
 * Préfère les frontières de phrases, puis les espaces, pour éviter de couper au milieu des mots.
 * Gère les abréviations et les nombres décimaux.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
export function splitText(text, maxChars = 250) {
  const normalized = text?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= maxChars) return [normalized];

  const protectedText = protectBoundaries(normalized);
  const rawSegments = protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [protectedText];
  const sentences = rawSegments.map(restoreBoundaries).filter(Boolean);

  return packSentences(sentences, maxChars);
}

/**
 * Supprime les silences de début et de fin d'un buffer audio mono, en gardant
 * une petite marge pour préserver les attaques et les fins naturelles.
 *
 * @param {Float32Array} buffer
 * @param {number} sampleRate
 * @param {Object} options
 * @param {number} options.threshold — amplitude en dessous de laquelle un échantillon est considéré comme du silence (défaut : 0.005)
 * @param {number} options.leadingMs — marge conservée avant le signal, en ms (défaut : 25)
 * @param {number} options.trailingMs — marge conservée après le signal, en ms (défaut : 25)
 * @param {number} options.minSilenceMs — silence minimum à détecter, en ms (défaut : 20)
 * @returns {Float32Array}
 */
export function trimSilence(buffer, sampleRate, { threshold = 0.005, leadingMs = 25, trailingMs = 25 } = {}) {
  if (!buffer || buffer.length === 0) return buffer;

  const leadingSamples = Math.round((leadingMs / 1000) * sampleRate);
  const trailingSamples = Math.round((trailingMs / 1000) * sampleRate);

  let start = 0;
  while (start < buffer.length && Math.abs(buffer[start]) < threshold) {
    start++;
  }
  // Si tout le buffer est silencieux, on le conserve tel quel pour éviter de supprimer une pause voulue.
  if (start === buffer.length) return buffer;

  let end = buffer.length;
  while (end > start && Math.abs(buffer[end - 1]) < threshold) {
    end--;
  }

  start = Math.max(0, start - leadingSamples);
  end = Math.min(buffer.length, end + trailingSamples);

  if (start >= end) return buffer;

  return buffer.subarray(start, end);
}

/**
 * Fusionne plusieurs buffers audio mono en un seul, avec un court crossfade
 * cosinus entre chaque chunk pour atténuer les clics et les coupures prosodiques.
 *
 * @param {Float32Array[]} buffers
 * @param {Object} options
 * @param {number} options.crossfadeMs — durée du crossfade en millisecondes (défaut : 12)
 * @param {number} options.sampleRate — fréquence d'échantillonnage en Hz (défaut : 24000)
 * @returns {Float32Array | null}
 */
export function mergeAudioBuffers(buffers, { crossfadeMs = 12, sampleRate = 24000 } = {}) {
  if (!buffers || buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];

  const crossfadeSamples = Math.max(0, Math.round((crossfadeMs / 1000) * sampleRate));

  // Pas assez d'échantillons pour un crossfade utile : concaténation simple.
  if (crossfadeSamples < 2) {
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const b of buffers) {
      result.set(b, offset);
      offset += b.length;
    }
    return result;
  }

  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0) - (buffers.length - 1) * crossfadeSamples;
  if (totalLength <= 0) {
    // Buffers trop courts : fallback simple.
    const fallbackLength = buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Float32Array(fallbackLength);
    let offset = 0;
    for (const b of buffers) {
      result.set(b, offset);
      offset += b.length;
    }
    return result;
  }

  const result = new Float32Array(totalLength);
  let outOffset = 0;

  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i];
    if (i === 0) {
      result.set(buf, outOffset);
      outOffset += buf.length;
    } else {
      const prevEnd = result.subarray(outOffset - crossfadeSamples, outOffset);
      const currStart = buf.subarray(0, crossfadeSamples);
      // Fenêtre cosine : 0 → 1, plus douce qu'une rampe linéaire.
      for (let j = 0; j < crossfadeSamples; j++) {
        const alpha = j / (crossfadeSamples - 1);
        const eased = 0.5 - 0.5 * Math.cos(alpha * Math.PI);
        result[outOffset - crossfadeSamples + j] = prevEnd[j] * (1 - eased) + currStart[j] * eased;
      }
      result.set(buf.subarray(crossfadeSamples), outOffset);
      outOffset += buf.length - crossfadeSamples;
    }
  }

  return result;
}
