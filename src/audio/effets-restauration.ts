// audio/effets-restauration.ts — Deverberer, et retirer les clics.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { fft } from "./fft";
import { valeurA } from "./courbe";
import { TAILLE_FFT, SAUT_FFT, creerFenetreHann } from "./commun";

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



/**
 * LE SEUIL DE DÉTECTION ACCEPTE UNE COURBE, et la médiane qui lui sert de référence reste globale.
 * Le seuil est un multiple de cette médiane, comparé à la dérivée en chaque point : le moduler resserre
 * ou relâche la détection au fil du son, sur un passage abîmé plutôt que sur tout le fichier.
 */
export function supprimerClics(
  buffer: AudioBuffer,
  seuil: number | Float32Array,
  fenetreMs: number,
): AudioBuffer {
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
    for (let i = 1; i < n; i++) {
      if (diff[i] > valeurA(seuil, i) * mediane) {
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
/**
 * LE SEUIL ACCEPTE UNE COURBE. C'est lui qui décide, échantillon par échantillon, de ce qui est une
 * sibilance : le faire descendre resserre l'atténuation, le faire remonter la relâche. Il est lu dans
 * la boucle par `valeurA`, comme un nombre l'était, et sans courbe branchée la sortie est celle
 * d'avant, au bit près.
 */
