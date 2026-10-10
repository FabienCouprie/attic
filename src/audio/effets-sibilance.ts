// audio/effets-sibilance.ts — Sibilances, quantification, porte et expandeur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { coefficientSuiveur, valeurA } from "./courbe";

export async function deEsser(
  buffer: AudioBuffer,
  frequenceCentrale: number,
  largeur: number,
  seuilDb: number | Float32Array,
  ratio: number,
  attaqueMs: number,
  relachementMs: number,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const nch = buffer.numberOfChannels;
  const attaqueCoeff = Math.exp(-1 / (Math.max(0.01, attaqueMs) / 1000 * sr));
  const relachementCoeff = Math.exp(-1 / (Math.max(0.01, relachementMs) / 1000 * sr));

  const ctx = new OfflineAudioContext(nch, buffer.length, sr);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = Math.max(500, Math.min(16000, frequenceCentrale));
  bp.Q.value = Math.max(0.1, frequenceCentrale / Math.max(10, largeur));
  source.connect(bp);
  bp.connect(ctx.destination);
  source.start(0);
  const bandeBuffer = await ctx.startRendering();

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  for (let c = 0; c < nch; c++) {
    const src = buffer.getChannelData(c);
    const bande = bandeBuffer.getChannelData(Math.min(c, bandeBuffer.numberOfChannels - 1));
    const dst = resultat.getChannelData(c);
    let env = 0;
    for (let i = 0; i < buffer.length; i++) {
      const niveau = Math.abs(bande[i]);
      const coeff = niveau > env ? attaqueCoeff : relachementCoeff;
      env = coeff * env + (1 - coeff) * niveau;
      const envDb = env > 1e-9 ? 20 * Math.log10(env) : -180;
      const seuil = valeurA(seuilDb, i);
      let gainDb = 0;
      if (envDb > seuil) gainDb = (seuil - envDb) * (1 - 1 / Math.max(1, ratio));
      dst[i] = src[i] * Math.pow(10, gainDb / 20);
    }
  }
  return resultat;
}

// --- Bitcrusher : quantification + sous-échantillonnage ---------------------
// Simule la basse résolution des convertisseurs N/A anciens (8-bit, etc.).

/**
 * LE MÉLANGE ACCEPTE UNE COURBE, et le scalaire en est le cas dégénéré. `valeurA` lit la valeur de
 * l'échantillon quelle que soit sa forme, si bien qu'il n'y a qu'un seul chemin de calcul : sans
 * courbe branchée, le nœud passe un nombre et la sortie est celle d'avant, au bit près.
 */
export function bitcrusher(
  buffer: AudioBuffer,
  bits: number,
  frequenceEch: number,
  mix: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const niveauBits = Math.max(1, Math.min(16, Math.round(bits)));
  const niveaux = Math.pow(2, niveauBits) - 1;
  const pas = Math.max(1, Math.round(sr / Math.max(1000, frequenceEch)));

  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sr,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let dernierEch = 0;

    for (let i = 0; i < src.length; i++) {
      if (i % pas === 0) {
        const quantifie = Math.round(src[i] * niveaux) / niveaux;
        dernierEch = Math.max(-1, Math.min(1, quantifie));
      }
      const m = Math.max(0, Math.min(100, valeurA(mix, i))) / 100;
      dst[i] = src[i] * (1 - m) + dernierEch * m;
    }
  }

  return resultat;
}

// --- Gate / Expandeur : traitement dynamique dans le domaine temporel -------
// Gate : coupe le signal sous le seuil (attenue vers le plancher).
// Expandeur : réduit渐进ment le signal sous le seuil selon le ratio.
// Les deux partagent le même moteur de suivi d'enveloppe que le compresseur.

export function gateExpandeur(
  buffer: AudioBuffer,
  mode: "gate" | "expandeur",
  seuilDb: number,
  ratio: number,
  attaqueMs: number | Float32Array,
  relachementMs: number | Float32Array,
  attenuationDb: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  // Un scalaire garde son exponentielle unique ; une courbe en paie une par échantillon.
  const attaqueCoeff = coefficientSuiveur(attaqueMs, sr);
  const relachementCoeff = coefficientSuiveur(relachementMs, sr);
  const nch = buffer.numberOfChannels;

  // Gate : le plancher est une attenuation fixe (en dB).
  // Expandeur : le ratio atténue渐进ment sous le seuil (comme un compresseur inversé).
  const plancherLin = Math.pow(10, -Math.max(0, attenuationDb) / 20);

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  const src: Float32Array[] = [];
  const dst: Float32Array[] = [];
  for (let c = 0; c < nch; c++) {
    src.push(buffer.getChannelData(c));
    dst.push(resultat.getChannelData(c));
  }

  let env = 0;
  for (let i = 0; i < buffer.length; i++) {
    let niveau = 0;
    for (let c = 0; c < nch; c++) {
      const a = Math.abs(src[c][i]);
      if (a > niveau) niveau = a;
    }
    const coeff = niveau > env ? attaqueCoeff(i) : relachementCoeff(i);
    env = coeff * env + (1 - coeff) * niveau;

    const envDb = env > 1e-9 ? 20 * Math.log10(env) : -180;

    let gain: number;
    if (mode === "gate") {
      // Gate : si le signal est sous le seuil, atténuer vers le plancher.
      if (envDb < seuilDb) {
        gain = plancherLin;
      } else {
        gain = 1;
      }
    } else {
      // Expandeur : sous le seuil, atténuer selon le ratio.
      // gainDb = (seuilDb - envDb) * (1 - ratio) — ratio > 1 = expansion.
      const ratioSafe = Math.max(1, ratio);
      if (envDb < seuilDb) {
        const gainDb = (seuilDb - envDb) * (1 - 1 / ratioSafe);
        // Limiter l'atténuation maximale au plancher
        const gainDbLimite = Math.max(gainDb, -attenuationDb);
        gain = Math.pow(10, gainDbLimite / 20);
      } else {
        gain = 1;
      }
    }

    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain;
  }

  return resultat;
}

// --- Limiteur : compresseur avec attaque instantanée et ratio infini ----------
// Réduit les pics au-dessus du seuil avec un relâchement configurable, puis
// applique un gain de make-up pour ramener le plafond à la valeur cible.

