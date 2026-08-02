// audio/effets-dynamique.ts — Effets (issus du découpage de effets.ts).
import { fft } from "./fft";
import { TAILLE_FFT, SAUT_FFT, TAILLE_FFT_BRUIT, SAUT_FFT_BRUIT, creerFenetreHann } from "./commun";

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
  const fenetre = creerFenetreHann(TAILLE_FFT_BRUIT);
  const nbBins = TAILLE_FFT_BRUIT / 2 + 1;
  const somme = new Float64Array(nbBins);
  let nbTrames = 0;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    // On pad avec des zéros pour que les très courts extraits de bruit
    // (moins d'une trame FFT) produisent quand même un profil non vide.
    const donnees = canal.length < TAILLE_FFT_BRUIT
      ? (() => {
          const p = new Float32Array(TAILLE_FFT_BRUIT);
          p.set(canal);
          return p;
        })()
      : canal;
    for (let debut = 0; debut + TAILLE_FFT_BRUIT <= donnees.length; debut += SAUT_FFT_BRUIT) {
      const re = new Float64Array(TAILLE_FFT_BRUIT);
      const im = new Float64Array(TAILLE_FFT_BRUIT);
      for (let i = 0; i < TAILLE_FFT_BRUIT; i++) re[i] = donnees[debut + i] * fenetre[i];
      fft(re, im, false);
      for (let b = 0; b < nbBins; b++) somme[b] += Math.hypot(re[b], im[b]);
      nbTrames++;
    }
  }

  const profil = new Float32Array(nbBins);
  if (nbTrames > 0) for (let b = 0; b < nbBins; b++) profil[b] = somme[b] / nbTrames;
  return profil;
}



export function reduireBruit(buffer: AudioBuffer, profil: Float32Array, force: number, plancherRelatif = 0.01): AudioBuffer {
  const fenetre = creerFenetreHann(TAILLE_FFT_BRUIT);
  const nbBins = TAILLE_FFT_BRUIT / 2 + 1;
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  // Soustraction spectrale en puissance (standard) : on estime le bruit par le
  // profil et on soustrait sa puissance à celle du signal bruité. Le plancher
  // est un pourcentage de la puissance du signal bruité, donc il ne peut pas
  // amplifier quand le profil surestime le bruit local.
  const plancher = Math.max(0, Math.min(1, plancherRelatif));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    // Pour les extraits courts on centre le signal dans une trame FFT :
    // évite l'amplification dangereuse aux bords de la fenêtre Hann
    // (overlap-add) quand le signal ne couvre pas une trame complète.
    const estCourt = canal.length < TAILLE_FFT_BRUIT;
    const entree = estCourt ? new Float32Array(TAILLE_FFT_BRUIT) : canal;
    const offsetCourt = estCourt ? Math.floor((TAILLE_FFT_BRUIT - canal.length) / 2) : 0;
    if (estCourt) entree.set(canal, offsetCourt);

    const sortie = new Float64Array(estCourt ? TAILLE_FFT_BRUIT : buffer.length);
    const enveloppe = new Float64Array(estCourt ? TAILLE_FFT_BRUIT : buffer.length);
    for (let debut = 0; debut + TAILLE_FFT_BRUIT <= entree.length; debut += SAUT_FFT_BRUIT) {
      const re = new Float64Array(TAILLE_FFT_BRUIT);
      const im = new Float64Array(TAILLE_FFT_BRUIT);
      for (let i = 0; i < TAILLE_FFT_BRUIT; i++) re[i] = entree[debut + i] * fenetre[i];
      fft(re, im, false);

      for (let b = 0; b < nbBins; b++) {
        const magnitude = Math.hypot(re[b], im[b]);

        const phase = Math.atan2(im[b], re[b]);
        const profilBin = profil[b] ?? 0;
        // On soustrait le bruit de la magnitude de la trame courante, pas de la
        // version lissée, pour un débruitage plus efficace sur le bruit blanc.
        const power = magnitude * magnitude;
        const noisePower = profilBin * profilBin;
        const cleanPower = Math.max(power - noisePower * force, power * plancher);
        const gain = power > 1e-9 ? Math.sqrt(cleanPower / power) : 0;
        const nouvelleMagnitude = magnitude * gain;

        re[b] = nouvelleMagnitude * Math.cos(phase);
        im[b] = nouvelleMagnitude * Math.sin(phase);
        if (b > 0 && b < TAILLE_FFT_BRUIT - b) {
          re[TAILLE_FFT_BRUIT - b] = re[b];
          im[TAILLE_FFT_BRUIT - b] = -im[b];
        }
      }

      fft(re, im, true);
      for (let i = 0; i < TAILLE_FFT_BRUIT; i++) {
        sortie[debut + i] += re[i] * fenetre[i];
        enveloppe[debut + i] += fenetre[i] * fenetre[i];
      }
    }

    const canalSortie = resultat.getChannelData(c);
    if (estCourt) {
      for (let i = 0; i < canal.length; i++) {
        const j = offsetCourt + i;
        canalSortie[i] = enveloppe[j] > 1e-6 ? sortie[j] / enveloppe[j] : 0;
      }
    } else {
      for (let i = 0; i < sortie.length; i++) {
        canalSortie[i] = enveloppe[i] > 1e-6 ? sortie[i] / enveloppe[i] : 0;
      }
    }
  }

  return resultat;
}

function appliquerNotch(signal: Float32Array, sr: number, f: number, Q: number): void {
  const w0 = (2 * Math.PI * f) / sr;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);
  const a0 = 1 + alpha;
  const a1 = (-2 * cosw0) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = 1 / a0;
  const b1 = (-2 * cosw0) / a0;
  const b2 = 1 / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    signal[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
}

export function reduireBruitNotches(buffer: AudioBuffer, profil: Float32Array, seuilMult = 2, maxNotches = 50, Q = 10): AudioBuffer {
  const sr = buffer.sampleRate;
  const df = sr / TAILLE_FFT_BRUIT;
  const moy = profil.reduce((a, b) => a + b, 0) / profil.length;
  const seuil = Math.max(1e-9, moy * seuilMult);
  const candidats: { bin: number; f: number; mag: number }[] = [];
  for (let i = 0; i < profil.length; i++) {
    const f = i * df;
    if (f > 50 && f < sr / 2 - 100 && profil[i] > seuil) {
      candidats.push({ bin: i, f, mag: profil[i] });
    }
  }
  candidats.sort((a, b) => b.mag - a.mag);
  const notches = candidats.slice(0, maxNotches).map((c) => c.f);

  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sr,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    dst.set(src);
    for (const f of notches) {
      appliquerNotch(dst, sr, f, Q);
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

// --- Limiteur : compresseur avec attaque instantanée et ratio infini ----------
// Réduit les pics au-dessus du seuil avec un relâchement configurable, puis
// applique un gain de make-up pour ramener le plafond à la valeur cible.

export function limiter(
  buffer: AudioBuffer,
  seuilDb: number,
  relachementMs: number,
  plafondDb: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const seuil = Math.pow(10, seuilDb / 20);
  const plafond = Math.pow(10, plafondDb / 20);
  const relachementCoeff = Math.exp(-1 / (Math.max(0.01, relachementMs) / 1000 * sr));
  const nch = buffer.numberOfChannels;

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  const src: Float32Array[] = [];
  const dst: Float32Array[] = [];
  for (let c = 0; c < nch; c++) {
    src.push(buffer.getChannelData(c));
    dst.push(resultat.getChannelData(c));
  }

  let gain = 1;
  const makeup = seuil > 0 ? plafond / seuil : 1;
  for (let i = 0; i < buffer.length; i++) {
    let pic = 0;
    for (let c = 0; c < nch; c++) {
      const a = Math.abs(src[c][i]);
      if (a > pic) pic = a;
    }
    const gainCible = pic > seuil ? seuil / pic : 1;
    if (gainCible < gain) {
      gain = gainCible; // attaque instantanée
    } else {
      gain = relachementCoeff * gain + (1 - relachementCoeff) * gainCible;
    }
    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain * makeup;
  }

  return resultat;
}

// --- Transient shaper : contrôle indépendant de l'attaque et du sustain ------
// Deux détecteurs d'enveloppe (rapide pour les attaques, lent pour le corps) sont
// comparés. Leur différence donne une mesure « attaque / sustain » ; un gain en
// dB est appliqué selon la force de cette composante.

export function transientShaper(
  buffer: AudioBuffer,
  attaqueDb: number,
  sustainDb: number,
  tempsAttaqueMs: number,
  tempsSustainMs: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const coeffAttaque = Math.exp(-1 / (Math.max(0.01, tempsAttaqueMs) / 1000 * sr));
  const coeffSustain = Math.exp(-1 / (Math.max(0.01, tempsSustainMs) / 1000 * sr));
  const nch = buffer.numberOfChannels;

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  const src: Float32Array[] = [];
  const dst: Float32Array[] = [];
  for (let c = 0; c < nch; c++) {
    src.push(buffer.getChannelData(c));
    dst.push(resultat.getChannelData(c));
  }

  let envAttaque = 0;
  let envSustain = 0;
  for (let i = 0; i < buffer.length; i++) {
    let pic = 0;
    for (let c = 0; c < nch; c++) {
      const a = Math.abs(src[c][i]);
      if (a > pic) pic = a;
    }
    envAttaque = coeffAttaque * envAttaque + (1 - coeffAttaque) * pic;
    envSustain = coeffSustain * envSustain + (1 - coeffSustain) * pic;

    const maxEnv = Math.max(envAttaque, envSustain, 1e-9);
    const force = (envAttaque - envSustain) / maxEnv;
    const attaqueGain = Math.pow(10, attaqueDb / 20);
    const sustainGain = Math.pow(10, sustainDb / 20);
    const gain = force > 0
      ? attaqueGain * force + sustainGain * (1 - force)
      : sustainGain;

    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain;
  }

  return resultat;
}

// --- Largeur stéréo / Mid-Side : contrôle du champ stéréo ------------------
// Décode le signal en Mid/Side (centre = (L+R)/2, côtés = (L-R)/2), ajuste
// le gain de chaque composante, puis recode en L/R. Permet de passer au mono
// (Largeur=0), de conserver l'image stéréo d'origine (Largeur=100) ou de
// l'élargir (Largeur>100). Le gain Mid agit sur le centre indépendamment.

export function ajusterLargeurStereo(
  buffer: AudioBuffer,
  largeurPct: number,
  midPct: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const nch = buffer.numberOfChannels;
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  const dstL = resultat.getChannelData(0);
  const dstR = resultat.getChannelData(1);
  const srcL = buffer.getChannelData(0);
  const srcR = nch > 1 ? buffer.getChannelData(1) : srcL;

  const width = largeurPct / 100;
  const midGain = midPct / 100;

  for (let i = 0; i < buffer.length; i++) {
    const l = srcL[i];
    const r = srcR[i];
    const mid = (l + r) * 0.5 * midGain;
    const side = (l - r) * 0.5 * width;
    dstL[i] = mid + side;
    dstR[i] = mid - side;
  }

  return resultat;
}

// Helper : filtre Biquad via OfflineAudioContext.
async function filtreBiquadDynamique(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  frequency: number,
  Q = 0.707,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  source.connect(filter);
  filter.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

function soustraireBuffers(a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: a.length, sampleRate: a.sampleRate });
  for (let c = 0; c < a.numberOfChannels; c++) {
    const srcA = a.getChannelData(c);
    const srcB = b.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < a.length; i++) dst[i] = srcA[i] - srcB[i];
  }
  return resultat;
}

// --- Compresseur multibande : 3 bandes (low / mid / high) ----------------------
// Split par crossover lowpass / highpass, mid = original - low - high, puis
// compression indépendante de chaque bande avec ses seuil/ratio propres.

export async function compresserMultiBande(
  buffer: AudioBuffer,
  seuilLow: number,
  ratioLow: number,
  seuilMid: number,
  ratioMid: number,
  seuilHigh: number,
  ratioHigh: number,
  attaqueMs: number,
  relachementMs: number,
  freqLow: number,
  freqHigh: number,
): Promise<AudioBuffer> {
  const low = await filtreBiquadDynamique(buffer, "lowpass", freqLow);
  const high = await filtreBiquadDynamique(buffer, "highpass", freqHigh);
  const mid = soustraireBuffers(soustraireBuffers(buffer, low), high);

  const lowComp = compresser(low, seuilLow, ratioLow, attaqueMs, relachementMs, 0);
  const midComp = compresser(mid, seuilMid, ratioMid, attaqueMs, relachementMs, 0);
  const highComp = compresser(high, seuilHigh, ratioHigh, attaqueMs, relachementMs, 0);

  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const dst = resultat.getChannelData(c);
    const l = lowComp.getChannelData(c);
    const m = midComp.getChannelData(c);
    const h = highComp.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) dst[i] = l[i] + m[i] + h[i];
  }
  return resultat;
}

// --- Exciter / Aural enhancer : distorsion asymétrique + passe-haut -----------
// Génère des harmoniques par saturation douce, ne garde que les hautes
// fréquences, puis mixe avec le signal original pour ajouter de la présence.

export async function exciter(
  buffer: AudioBuffer,
  amount: number,
  frequency: number,
  mix: number,
): Promise<AudioBuffer> {
  const dist = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = dist.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const x = src[i];
      dst[i] = x > 0 ? Math.tanh(amount * x) : Math.tanh(x);
    }
  }
  const wet = await filtreBiquadDynamique(dist, "highpass", frequency);
  const mixVal = mix / 100;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const wetCh = wet.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) dst[i] = src[i] * (1 - mixVal) + wetCh[i] * mixVal;
  }
  return resultat;
}


