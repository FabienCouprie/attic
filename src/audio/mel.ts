// audio/mel.ts — L'échelle des mels, la banque de filtres triangulaires, et le paramétrage de
// Riffusion.
//
// POURQUOI UN MODULE À PART, ALORS QUE `analyse-genre.ts` A DÉJÀ SON BANC DE MELS. Celui-là est
// soudé aux attentes de son modèle : il couvre toujours zéro à la demi-fréquence d'échantillonnage,
// sans bornes réglables, parce que c'est la forme que le réseau GTZAN a vue à l'entraînement. Le
// fusionner avec celui-ci demanderait de toucher à un composant qui marche, pour un gain nul. La
// duplication est donc déclarée ici plutôt que tue.
//
// LA BANQUE EST CREUSE, et non une matrice pleine. Un filtre triangulaire ne couvre que quelques
// cases de la transformée : stocker cinq cent douze lignes de huit mille réels demanderait
// trente-trois mégaoctets pour y écrire des zéros partout sauf sur deux cases. Chaque bande ne
// garde donc que son indice de départ et ses poids.
//
// Référence du paramétrage : `riffusion/spectrogram_params.py` de riffusion/riffusion-hobby,
// sous licence MIT.

/**
 * Hertz vers mels, formule HTK : celle de torchaudio avec `mel_scale="htk"`, comme la référence.
 *
 * CE N'EST PAS CELLE DE SLANEY, et la différence n'est pas cosmétique : celle de Slaney est une
 * DROITE sous mille hertz, donc elle y donne la même hauteur à deux intervalles de même largeur en
 * hertz, là où celle-ci est un logarithme partout. Mesuré : deux intervalles de deux cents hertz
 * pris sous mille occupent ici des hauteurs dans un rapport de 1,4023, et de 1 chez Slaney.
 *
 * Le nom de Slaney désigne aussi, chez torchaudio, une normalisation des filtres par leur aire,
 * `norm="slaney"`. La référence emploie `norm=None`, et `bancMel` ne normalise donc pas non plus.
 */
export function hzVersMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/** Mels vers hertz, l'inverse exact de la précédente. */
export function melVersHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

/**
 * Ce qui décrit entièrement un spectrogramme en mels, et donc l'image qui le porte.
 *
 * Les durées sont en millisecondes parce que c'est ainsi que Riffusion les écrit, et qu'un réglage
 * en millisecondes se lit sans connaître la fréquence d'échantillonnage.
 */
export interface ParametresMel {
  /** Fréquence d'échantillonnage du signal, en hertz. */
  echantillonnage: number;
  /** Avance entre deux trames, en millisecondes : elle fixe la largeur de l'image. */
  pasMs: number;
  /** Durée de la fenêtre d'analyse, en millisecondes : elle fixe la résolution en fréquence. */
  fenetreMs: number;
  /** Durée de la trame une fois complétée de zéros, en millisecondes. */
  bourrageMs: number;
  /** Nombre de bandes de mels : la hauteur de l'image. */
  bandes: number;
  /** Fréquence de la bande la plus grave, en hertz. */
  fMin: number;
  /** Fréquence de la bande la plus aiguë, en hertz. */
  fMax: number;
}

/** Le paramétrage de Riffusion, valeur pour valeur. Une image de 512 cases de large fait 5,12 s. */
export const PARAMETRES_RIFFUSION: ParametresMel = {
  echantillonnage: 44100,
  pasMs: 10,
  fenetreMs: 100,
  bourrageMs: 400,
  bandes: 512,
  fMin: 0,
  fMax: 10000,
};

const enEchantillons = (ms: number, sr: number) => Math.max(1, Math.round((ms / 1000) * sr));

/** La fenêtre d'analyse, en échantillons. */
export const fenetreDe = (p: ParametresMel) => enEchantillons(p.fenetreMs, p.echantillonnage);

/** L'avance entre deux trames, en échantillons. */
export const sautDe = (p: ParametresMel) => enEchantillons(p.pasMs, p.echantillonnage);

/**
 * La taille de la transformée : une puissance de deux, la plus proche de ce que demande le bourrage.
 *
 * POURQUOI PAS LA VALEUR EXACTE DE RIFFUSION. Son bourrage de quatre cents millisecondes fait
 * 17 640 échantillons à 44,1 kHz, et la transformée d'Attic est en base deux. Compléter de zéros
 * ne change pas le spectre du son : cela l'échantillonne seulement sur une grille plus fine, la
 * résolution réelle restant celle de la fenêtre. Passer de 17 640 à 16 384 épaissit la grille de
 * 2,50 à 2,69 hertz, sept pour cent, ce que le regroupement en bandes de mels efface. L'arrondi se
 * fait au plus proche et jamais sous la fenêtre, sans quoi la trame serait tronquée.
 */
export function tailleTransformee(p: ParametresMel): number {
  const voulu = Math.max(enEchantillons(p.bourrageMs, p.echantillonnage), fenetreDe(p));
  const basse = 1 << Math.floor(Math.log2(voulu));
  const haute = basse << 1;
  if (basse >= voulu) return basse;
  const choisie = voulu - basse <= haute - voulu ? basse : haute;
  return Math.max(choisie, 1 << Math.ceil(Math.log2(fenetreDe(p))));
}

/** Le nombre de cases utiles d'une transformée réelle. */
export const casesDe = (taille: number) => taille / 2 + 1;

/** Une bande de la banque : ses poids, et la case où ils commencent. */
export interface BandeMel {
  debut: number;
  poids: Float64Array;
}

/**
 * La banque de filtres triangulaires, creuse.
 *
 * LES BANDES DU BAS PEUVENT ÊTRE VIDES, et ce n'est pas un défaut d'ici. Cinq cent douze bandes
 * entre zéro et dix mille hertz donnent une première bande large de trois hertz et demi, plus
 * étroite qu'une case de la transformée : son triangle tombe alors entre deux cases et ne récolte
 * rien. torchaudio émet le même avertissement sur le même paramétrage. `bandesVides` les compte
 * pour que le composant puisse le dire.
 */
export function bancMel(p: ParametresMel, taille: number): BandeMel[] {
  const cases = casesDe(taille);
  const mMin = hzVersMel(Math.max(0, p.fMin));
  const mMax = hzVersMel(Math.min(p.fMax, p.echantillonnage / 2));
  // Les bords : `bandes + 2` fréquences, chaque bande occupant trois bords consécutifs.
  const bords = new Float64Array(p.bandes + 2);
  for (let i = 0; i < bords.length; i++) {
    bords[i] = melVersHz(mMin + ((mMax - mMin) * i) / (p.bandes + 1));
  }
  const parCase = p.echantillonnage / taille;
  const banque: BandeMel[] = [];
  for (let m = 0; m < p.bandes; m++) {
    const [gauche, centre, droite] = [bords[m], bords[m + 1], bords[m + 2]];
    const premiere = Math.max(0, Math.ceil(gauche / parCase));
    const derniere = Math.min(cases - 1, Math.floor(droite / parCase));
    if (derniere < premiere) {
      banque.push({ debut: premiere, poids: new Float64Array(0) });
      continue;
    }
    const poids = new Float64Array(derniere - premiere + 1);
    for (let k = premiere; k <= derniere; k++) {
      const f = k * parCase;
      poids[k - premiere] = f <= centre
        ? (f - gauche) / Math.max(1e-12, centre - gauche)
        : (droite - f) / Math.max(1e-12, droite - centre);
    }
    banque.push({ debut: premiere, poids });
  }
  return banque;
}

/** Le nombre de bandes qu'aucune case de la transformée ne nourrit. */
export function bandesVides(banque: readonly BandeMel[]): number {
  let n = 0;
  for (const b of banque) {
    let somme = 0;
    for (let i = 0; i < b.poids.length; i++) somme += b.poids[i];
    if (somme <= 0) n++;
  }
  return n;
}
