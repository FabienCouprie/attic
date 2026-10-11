// audio/effets-dynamique.ts — Niveau et compression : les gestes de base sur la dynamique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.


import { coefficientSuiveur, valeurA, valeurTransformee } from "./courbe";

export function normaliser(buffer: AudioBuffer, cibleDb: number): AudioBuffer {
  let pic = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const donnees = buffer.getChannelData(c);
    for (let i = 0; i < donnees.length; i++) {
      const v = Math.abs(donnees[i]);
      if (v > pic) pic = v;
    }
  }
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  if (pic === 0) {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      resultat.getChannelData(c).set(buffer.getChannelData(c));
    }
    return resultat;
  }
  const gain = Math.pow(10, cibleDb / 20) / pic;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain;
  }
  return resultat;
}

// Fondu en ouverture ou fermeture. Courbe en S (cosinus surélevé) plutôt que
// linéaire : la pente est nulle aux deux extrémités, ce qui évite tout clic
// et sonne plus naturellement qu'une rampe droite à l'oreille.


export function amplifier(buffer: AudioBuffer, gainDb: number): AudioBuffer {
  const gain = Math.pow(10, gainDb / 20);
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain;
  }
  return resultat;
}

// Compresseur feed-forward : réduit la dynamique en atténuant ce qui dépasse
// le seuil, selon le ratio. L'enveloppe est suivie avec des constantes de temps
// d'attaque/relâchement, et le détecteur est « lié » entre canaux (on prend le
// niveau le plus fort des deux) pour ne pas déformer l'image stéréo. Un gain de
// compensation optionnel remonte le niveau global après compression.


export function compresser(
  buffer: AudioBuffer,
  seuilDb: number | Float32Array,
  ratio: number | Float32Array,
  attaqueMs: number | Float32Array,
  relachementMs: number | Float32Array,
  compensationDb: number | Float32Array
): AudioBuffer {
  const sr = buffer.sampleRate;
  // UNE CONSTANTE DE TEMPS NE SE LIT PAS COMME UN GAIN : elle décide de la VITESSE à laquelle
  // l'enveloppe rattrape le signal. `coefficientSuiveur` garde deux chemins : un nombre conserve
  // son exponentielle unique, calculée une fois, donc pas un bit déplacé ; une courbe en paie une
  // par échantillon, ce qui est le prix de ce qu'elle demande.
  const attaqueCoeff = coefficientSuiveur(attaqueMs, sr);
  const relachementCoeff = coefficientSuiveur(relachementMs, sr);
  // MÊME RÈGLE POUR LES TROIS AUTRES : `valeurTransformee` ne calcule qu'une fois ce qui ne bouge
  // pas. La pente `1 − 1/r` était jusqu'ici recalculée à chaque échantillon sous le seuil ; elle
  // ne l'est plus quand le ratio est un nombre.
  const compensationA = valeurTransformee(compensationDb, (v) => Math.pow(10, v / 20));
  const penteA = valeurTransformee(ratio, (v) => 1 - 1 / Math.max(1, v));
  const nch = buffer.numberOfChannels;

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
    let gainDb = 0;
    const seuil = valeurA(seuilDb, i);
    if (envDb > seuil) gainDb = (seuil - envDb) * penteA(i);
    const gain = Math.pow(10, gainDb / 20) * compensationA(i);

    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain;
  }

  return resultat;
}

// --- Débruitage par soustraction spectrale ------------------------------
// FFT radix-2 maison (le projet évite les dépendances pour ces briques,
// voir section 6 de la spécification) + analyse/synthèse à recouvrement 50 %.



