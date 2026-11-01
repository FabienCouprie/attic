// audio/effets-sibilance.ts — Sibilances, quantification, porte et expandeur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { poserParam } from "./automation";
import { coefficientSuiveur, valeurA, valeurTransformee } from "./courbe";
import { versDb, depuisDb } from "./decibels";

export async function deEsser(
  buffer: AudioBuffer,
  frequenceCentrale: number | Float32Array,
  largeur: number | Float32Array,
  seuilDb: number | Float32Array,
  ratio: number | Float32Array,
  attaqueMs: number | Float32Array,
  relachementMs: number | Float32Array,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const nch = buffer.numberOfChannels;
  // Même aide que le gate, plus bas dans ce fichier : un nombre garde son exponentielle unique.
  const attaqueCoeff = coefficientSuiveur(attaqueMs, sr);
  const relachementCoeff = coefficientSuiveur(relachementMs, sr);

  const ctx = new OfflineAudioContext(nch, buffer.length, sr);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  const duree = buffer.length / sr;
  poserParam(bp.frequency, frequenceCentrale, duree,
    (v) => Math.max(500, Math.min(16000, v)));
  // LE Q DÉPEND DES DEUX RÉGLAGES À LA FOIS, `fréquence / largeur`, et `poserParam` ne transforme
  // qu'une valeur. Le quotient est donc calculé ici, point par point quand l'un des deux est une
  // courbe, une seule fois quand les deux sont des nombres : c'est le même partage que partout
  // ailleurs, et le chemin du nombre ne bouge pas d'un bit.
  const qFixe = (f: number, l: number) => Math.max(0.1, f / Math.max(10, l));
  const n = Math.max(
    typeof frequenceCentrale === "number" ? 0 : frequenceCentrale.length,
    typeof largeur === "number" ? 0 : largeur.length,
  );
  const q = n === 0
    ? qFixe(frequenceCentrale as number, largeur as number)
    : Float32Array.from({ length: n }, (_, i) => qFixe(valeurA(frequenceCentrale, i), valeurA(largeur, i)));
  poserParam(bp.Q, q, duree);
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
      const coeff = niveau > env ? attaqueCoeff(i) : relachementCoeff(i);
      env = coeff * env + (1 - coeff) * niveau;
      const envDb = env > 1e-9 ? versDb(env) : -180;
      const seuil = valeurA(seuilDb, i);
      let gainDb = 0;
      if (envDb > seuil) gainDb = (seuil - envDb) * (1 - 1 / Math.max(1, valeurA(ratio, i)));
      dst[i] = src[i] * depuisDb(gainDb);
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
  /**
   * La fréquence d'échantillonnage simulée, en hertz. Un tableau la fait varier.
   *
   * ELLE NE SE LIT PAS PAR ÉCHANTILLON MAIS PAR PALIER, et c'est ce qui la rend exacte : elle fixe
   * la longueur d'un maintien, et c'est au moment de prendre un nouvel échantillon qu'on demande
   * combien de temps le garder. Un son de trois minutes à vingt-deux kilohertz ne paie donc pas
   * une division par échantillon, mais une par palier.
   */
  frequenceEch: number | Float32Array,
  mix: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const niveauBits = Math.max(1, Math.min(16, Math.round(bits)));
  const niveaux = Math.pow(2, niveauBits) - 1;
  // `valeurTransformee` garde UN SEUL calcul au scalaire. Le pas reste un nombre ENTIER d'échantillons
  // des deux côtés, ce qui est la condition de l'exactitude : une phase accumulée en fraction
  // dériverait, et le palier tomberait un échantillon plus loin qu'avant sur un son non modulé.
  const pasA = valeurTransformee(frequenceEch, (f) => Math.max(1, Math.round(sr / Math.max(1000, f))));

  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sr,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let dernierEch = 0;
    // LE PROCHAIN PALIER EST COMPTÉ, et non déduit d'un modulo. Avec un pas constant les deux
    // disent la même chose, aux mêmes indices : zéro, le pas, deux fois le pas. Avec un pas qui
    // change, le modulo déplacerait tous les paliers d'un coup, alors que le compte garde ceux
    // déjà pris et n'applique le nouveau pas qu'au suivant.
    let prochain = 0;

    for (let i = 0; i < src.length; i++) {
      if (i >= prochain) {
        prochain = i + pasA(i);
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
// Expandeur : réduit progressivement le signal sous le seuil selon le ratio.
// Les deux partagent le même moteur de suivi d'enveloppe que le compresseur.

export function gateExpandeur(
  buffer: AudioBuffer,
  mode: "gate" | "expandeur",
  seuilDb: number | Float32Array,
  ratio: number | Float32Array,
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
  // Expandeur : le ratio atténue progressivement sous le seuil (comme un compresseur inversé).
  const plancherLin = depuisDb(-Math.max(0, attenuationDb));

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

    const envDb = env > 1e-9 ? versDb(env) : -180;

    let gain: number;
    // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
    const seuil = valeurA(seuilDb, i);
    if (mode === "gate") {
      // Gate : si le signal est sous le seuil, atténuer vers le plancher.
      if (envDb < seuil) {
        gain = plancherLin;
      } else {
        gain = 1;
      }
    } else {
      // Expandeur : sous le seuil, atténuer selon le ratio.
      // gainDb = (seuilDb - envDb) * (1 - ratio) — ratio > 1 = expansion.
      const ratioSafe = Math.max(1, valeurA(ratio, i));
      if (envDb < seuil) {
        const gainDb = (seuil - envDb) * (1 - 1 / ratioSafe);
        // Limiter l'atténuation maximale au plancher
        const gainDbLimite = Math.max(gainDb, -attenuationDb);
        gain = depuisDb(gainDbLimite);
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

