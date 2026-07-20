// audio/effets-dynamique.ts — Effets (issus du découpage de effets.ts).
import { fft } from "./fft";
import { TAILLE_FFT, SAUT_FFT, creerFenetreHann } from "./commun";

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
  seuilDb: number,
  ratio: number,
  attaqueMs: number,
  relachementMs: number,
  compensationDb: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const attaqueCoeff = Math.exp(-1 / (Math.max(0.01, attaqueMs) / 1000 * sr));
  const relachementCoeff = Math.exp(-1 / (Math.max(0.01, relachementMs) / 1000 * sr));
  const compensation = Math.pow(10, compensationDb / 20);
  const ratioSafe = Math.max(1, ratio);
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
    const coeff = niveau > env ? attaqueCoeff : relachementCoeff;
    env = coeff * env + (1 - coeff) * niveau;

    const envDb = env > 1e-9 ? 20 * Math.log10(env) : -180;
    let gainDb = 0;
    if (envDb > seuilDb) gainDb = (seuilDb - envDb) * (1 - 1 / ratioSafe);
    const gain = Math.pow(10, gainDb / 20) * compensation;

    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain;
  }

  return resultat;
}

// --- Débruitage par soustraction spectrale ------------------------------
// FFT radix-2 maison (le projet évite les dépendances pour ces briques,
// voir section 6 de la spécification) + analyse/synthèse à recouvrement 50 %.



export function calculerProfilBruit(buffer: AudioBuffer): Float32Array {
  const fenetre = creerFenetreHann(TAILLE_FFT);
  const nbBins = TAILLE_FFT / 2 + 1;
  const somme = new Float64Array(nbBins);
  let nbTrames = 0;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const donnees = buffer.getChannelData(c);
    for (let debut = 0; debut + TAILLE_FFT <= donnees.length; debut += SAUT_FFT) {
      const re = new Float64Array(TAILLE_FFT);
      const im = new Float64Array(TAILLE_FFT);
      for (let i = 0; i < TAILLE_FFT; i++) re[i] = donnees[debut + i] * fenetre[i];
      fft(re, im, false);
      for (let b = 0; b < nbBins; b++) somme[b] += Math.hypot(re[b], im[b]);
      nbTrames++;
    }
  }

  const profil = new Float32Array(nbBins);
  if (nbTrames > 0) for (let b = 0; b < nbBins; b++) profil[b] = somme[b] / nbTrames;
  return profil;
}



export function reduireBruit(buffer: AudioBuffer, profil: Float32Array, force: number): AudioBuffer {
  const fenetre = creerFenetreHann(TAILLE_FFT);
  const nbBins = TAILLE_FFT / 2 + 1;
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  // Lissage temporel de la décision de gain (pas du signal lui-même) : une
  // trame de bruit isolée a une magnitude qui varie beaucoup d'une trame à
  // l'autre. Sans lissage, des trames voisines qui se recouvrent reçoivent des
  // gains très différents, et leur addition (overlap-add) peut recréer par
  // endroits un signal plus fort qu'à l'origine (« bruit musical »). On lisse
  // donc l'estimation servant à calculer le gain, puis on applique ce gain à
  // l'amplitude réelle de la trame.
  const LISSAGE = 0.85;
  const PLANCHER_RELATIF = 0.15;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const entree = buffer.getChannelData(c);
    const sortie = new Float64Array(buffer.length);
    const enveloppe = new Float64Array(buffer.length);
    const magnitudeLissee = new Float64Array(nbBins);
    let premiereTrame = true;

    for (let debut = 0; debut + TAILLE_FFT <= entree.length; debut += SAUT_FFT) {
      const re = new Float64Array(TAILLE_FFT);
      const im = new Float64Array(TAILLE_FFT);
      for (let i = 0; i < TAILLE_FFT; i++) re[i] = entree[debut + i] * fenetre[i];
      fft(re, im, false);

      for (let b = 0; b < nbBins; b++) {
        const magnitude = Math.hypot(re[b], im[b]);
        if (premiereTrame) magnitudeLissee[b] = magnitude;
        else magnitudeLissee[b] = LISSAGE * magnitudeLissee[b] + (1 - LISSAGE) * magnitude;

        const phase = Math.atan2(im[b], re[b]);
        const seuil = (profil[b] ?? 0) * force;
        const plancher = magnitudeLissee[b] * PLANCHER_RELATIF;
        const magnitudeCible = Math.max(magnitudeLissee[b] - seuil, plancher);
        const gain = magnitudeLissee[b] > 1e-9 ? magnitudeCible / magnitudeLissee[b] : 0;
        const nouvelleMagnitude = magnitude * gain;

        re[b] = nouvelleMagnitude * Math.cos(phase);
        im[b] = nouvelleMagnitude * Math.sin(phase);
        if (b > 0 && b < TAILLE_FFT - b) {
          re[TAILLE_FFT - b] = re[b];
          im[TAILLE_FFT - b] = -im[b];
        }
      }
      premiereTrame = false;

      fft(re, im, true);
      for (let i = 0; i < TAILLE_FFT; i++) {
        sortie[debut + i] += re[i] * fenetre[i];
        enveloppe[debut + i] += fenetre[i] * fenetre[i];
      }
    }

    const canalSortie = resultat.getChannelData(c);
    for (let i = 0; i < sortie.length; i++) {
      canalSortie[i] = enveloppe[i] > 1e-6 ? sortie[i] / enveloppe[i] : 0;
    }
  }

  return resultat;
}



// Défauts recalibrés (2026-07-18) : avec memoireSec = 1, la mémoire de crête
// décroissait de 60 dB/s — PLUS VITE qu'une traîne de réverb réelle (20 à
// 50 dB/s selon le RT60). Le rapport magnitude/crête restait donc ≈ 1 et le
// gain valait 1 partout : l'effet était un passe-plat exact (mesuré :
// réduction de traîne = 1,00). À 3 s (20 dB/s), une traîne typique passe
// sous la crête mémorisée et se fait atténuer ; un son tenu (orgue) garde
// sa crête et reste intact. Seuil relevé à 50 % (−6 dB) en cohérence.
// Ajustement 2026-07-19 : mémoire portée à 5 s pour rester au-dessus des
// réverbérations longues (RT60 jusqu'à ~3 s). Ainsi le rapport magnitude/crête
// descend suffisamment pour que la traîne soit atténuée, sans toucher aux
// notes tenues proches de la crête.
export function dererverberer(
  entree: AudioBuffer,
  force: number,
  seuil: number = 50,
  memoireSec: number = 5,
): AudioBuffer {
  const fenetre = creerFenetreHann(TAILLE_FFT);
  const nbBins = TAILLE_FFT / 2 + 1;
  const sr = entree.sampleRate;
  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: entree.length,
    sampleRate: sr,
  });

  const decroissance = Math.pow(0.001, SAUT_FFT / (Math.max(0.1, memoireSec) * sr));
  const LISSAGE = 0.85;
  const PLANCHER = 0.01;
  const forceReelle = Math.max(0, Math.min(100, force)) / 100;
  const seuilReel = Math.max(0.01, Math.min(100, seuil)) / 100;

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const entreeCan = entree.getChannelData(c);
    const sortie = new Float64Array(entree.length);
    const enveloppeNorm = new Float64Array(entree.length);
    const magnitudeLissee = new Float64Array(nbBins);
    const pic = new Float64Array(nbBins);
    let premiereTrame = true;

    for (let debut = 0; debut + TAILLE_FFT <= entreeCan.length; debut += SAUT_FFT) {
      const re = new Float64Array(TAILLE_FFT);
      const im = new Float64Array(TAILLE_FFT);
      for (let i = 0; i < TAILLE_FFT; i++) re[i] = entreeCan[debut + i] * fenetre[i];
      fft(re, im, false);

      for (let b = 0; b < nbBins; b++) {
        const magnitude = Math.hypot(re[b], im[b]);
        if (premiereTrame) magnitudeLissee[b] = magnitude;
        else magnitudeLissee[b] = LISSAGE * magnitudeLissee[b] + (1 - LISSAGE) * magnitude;

        if (premiereTrame) pic[b] = magnitudeLissee[b];
        else pic[b] = Math.max(magnitudeLissee[b], pic[b] * decroissance);

        const rapport = pic[b] > 1e-9 ? magnitudeLissee[b] / pic[b] : 1;
        let gain = 1;
        if (rapport < seuilReel) {
          const facteur = Math.max(0, rapport / seuilReel);
          gain = Math.max(PLANCHER, Math.pow(facteur, forceReelle * 2 + 0.5));
        }

        const phase = Math.atan2(im[b], re[b]);
        const nouvelleMagnitude = magnitude * gain;

        re[b] = nouvelleMagnitude * Math.cos(phase);
        im[b] = nouvelleMagnitude * Math.sin(phase);
        if (b > 0 && b < TAILLE_FFT - b) {
          re[TAILLE_FFT - b] = re[b];
          im[TAILLE_FFT - b] = -im[b];
        }
      }
      premiereTrame = false;

      fft(re, im, true);
      for (let i = 0; i < TAILLE_FFT; i++) {
        sortie[debut + i] += re[i] * fenetre[i];
        enveloppeNorm[debut + i] += fenetre[i] * fenetre[i];
      }
    }

    const canalSortie = resultat.getChannelData(c);
    for (let i = 0; i < sortie.length; i++) {
      canalSortie[i] = enveloppeNorm[i] > 1e-6 ? sortie[i] / enveloppeNorm[i] : 0;
    }
  }

  return resultat;
}
// Méthode classique en deux passes : on étire d'abord la durée du signal sans
// changer sa hauteur (vocodeur de phase : on corrige la phase de chaque bande
// de fréquence d'une trame à l'autre pour respecter sa fréquence instantanée
// réelle, même quand l'espacement de synthèse diffère de celui d'analyse),
// puis on rééchantillonne ce résultat étiré pour lui rendre sa durée
// d'origine — ce second rééchantillonnage change la hauteur perçue.
// Combiner les deux change la hauteur sans changer la durée globale.
//
// Un simple recouvrement-addition sans correction de phase distord la
// hauteur des sons toniques dès que l'espacement change (vérifié : un ton
// pur à 220 Hz étiré ainsi dérivait vers ~239 Hz). Le vocodeur de phase
// corrige précisément ce défaut.



export function supprimerClics(buffer: AudioBuffer, seuil: number, fenetreMs: number): AudioBuffer {
  const fenetre = Math.max(1, Math.round((fenetreMs / 1000) * buffer.sampleRate));
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const entree = buffer.getChannelData(c);
    const sortie = resultat.getChannelData(c);
    const n = entree.length;

    // Dérivée première absolue
    const diff = new Float32Array(n);
    let somme = 0;
    for (let i = 1; i < n; i++) {
      diff[i] = Math.abs(entree[i] - entree[i - 1]);
      somme += diff[i];
    }
    const mediane = somme / n;

    // Marquage : seuil est un multiple de la médiane (seuil > 1 = moins sensible)
    const marque = new Uint8Array(n);
    const seuilAbsolu = seuil * mediane;
    for (let i = 1; i < n; i++) {
      if (diff[i] > seuilAbsolu) {
        const debut = Math.max(0, i - fenetre);
        const fin = Math.min(n - 1, i + fenetre);
        for (let j = debut; j <= fin; j++) marque[j] = 1;
      }
    }

    // Correction par interpolation cosinusoïdale sur chaque zone marquée
    let i = 0;
    while (i < n) {
      if (marque[i]) {
        const debut = i;
        while (i < n && marque[i]) i++;
        const fin = i - 1;
        const avant = Math.max(0, debut - 1);
        const apres = Math.min(n - 1, fin + 1);
        const longueur = apres - avant;
        if (longueur < 2) { i++; continue; }
        const valAvant = entree[avant];
        const valApres = entree[apres];
        for (let j = avant; j <= apres; j++) {
          const t = (j - avant) / longueur;
          const poids = 0.5 * (1 - Math.cos(Math.PI * t));
          sortie[j] = valAvant * (1 - poids) + valApres * poids;
        }
      } else {
        sortie[i] = entree[i];
        i++;
      }
    }
  }

  return resultat;
}

// --- Boîte à rythmes (synthèse percussive) ----------------------------------

// --- De-esser : compression dynamique des sibilances ------------------------
export async function deEsser(
  buffer: AudioBuffer,
  frequenceCentrale: number,
  largeur: number,
  seuilDb: number,
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
      let gainDb = 0;
      if (envDb > seuilDb) gainDb = (seuilDb - envDb) * (1 - 1 / Math.max(1, ratio));
      dst[i] = src[i] * Math.pow(10, gainDb / 20);
    }
  }
  return resultat;
}

// --- Bitcrusher : quantification + sous-échantillonnage ---------------------
// Simule la basse résolution des convertisseurs N/A anciens (8-bit, etc.).

export function bitcrusher(
  buffer: AudioBuffer,
  bits: number,
  frequenceEch: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const niveauBits = Math.max(1, Math.min(16, Math.round(bits)));
  const niveaux = Math.pow(2, niveauBits) - 1;
  const pas = Math.max(1, Math.round(sr / Math.max(1000, frequenceEch)));
  const mixVal = Math.max(0, Math.min(100, mix)) / 100;

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
      dst[i] = src[i] * (1 - mixVal) + dernierEch * mixVal;
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
  attaqueMs: number,
  relachementMs: number,
  attenuationDb: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const attaqueCoeff = Math.exp(-1 / (Math.max(0.01, attaqueMs) / 1000 * sr));
  const relachementCoeff = Math.exp(-1 / (Math.max(0.01, relachementMs) / 1000 * sr));
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
    const coeff = niveau > env ? attaqueCoeff : relachementCoeff;
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


