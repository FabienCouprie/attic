// audio/appariement-reference.ts — Donner à un son le niveau, le spectre et la largeur d'un autre.
//
// CE QUE FAIT CE MODULE. Il prend une CIBLE et une RÉFÉRENCE, et rend la cible dotée du niveau
// efficace, de la réponse en fréquence, de la largeur stéréo et de la crête de la référence. C'est
// la démarche d'un ingénieur qui pose un disque qu'il aime à côté du sien et rapproche l'un de
// l'autre, mesure par mesure.
//
// POURQUOI LA PHASE N'EST PAS TOUCHÉE. La correction se fait sur les MAGNITUDES d'une transformée à
// court terme, la phase d'origine étant remise telle quelle. C'est une correction à phase nulle :
// elle ne décale rien dans le temps, là où un filtre à réponse impulsionnelle en décalerait le
// grave par rapport à l'aigu. La transformée et sa reconstruction viennent de
// `spectrogramme-fenetre.ts`, employées déjà par la continuation spectrale.
//
// LA BORNE EST LE CŒUR DU PROCÉDÉ, ET NON UNE PRUDENCE. Le rapport entre deux spectres moyens
// explose là où la cible n'a rien : une piste qui s'arrête à 10 kHz, comparée à une référence qui
// monte à 18, demande un gain de quarante décibels dans l'aigu. Appliqué, il ne ferait pas
// apparaître d'aigu — il amplifierait le bruit de quantification et le souffle, puisqu'on ne peut
// pas créer ce qui n'a pas été enregistré. La correction est donc bornée, et le relevé dit combien
// de bandes ont buté sur cette borne : c'est ce chiffre qui annonce une référence hors de portée.
//
// LE LISSAGE EST EN OCTAVES ET NON EN CASES. Une case de transformée vaut quelques hertz dans le
// grave et quelques hertz dans l'aigu, alors que l'oreille entend par rapports. Moyenner sur un
// nombre fixe de cases corrigerait l'aigu au scalpel et le grave à la louche ; moyenner sur une
// fraction d'octave traite les deux comme on les entend.
import { creerFenetreHann, mixdownMono } from "./commun";
import { analyserSpectrogramme, synthetiserSpectrogramme } from "./spectrogramme-fenetre";
import { versDb, depuisDb } from "./decibels";

export interface OptionsAppariement {
  /** Recopier le niveau efficace de la référence. */
  niveau: boolean;
  /** Recopier la réponse en fréquence de la référence. */
  spectre: boolean;
  /** Recopier la largeur stéréo de la référence. */
  largeur: boolean;
  /** Recopier la crête de la référence, une fois le reste appliqué. */
  crete: boolean;
  /** Finesse du lissage de la correction spectrale, en bandes par octave. */
  bandesParOctave: number;
  /** Correction spectrale maximale, en décibels, dans les deux sens. */
  correctionMaxDb: number;
  /** Taille de la transformée. */
  fftSize: number;
}

export interface ReleveAppariement {
  /** Gain de niveau appliqué, en décibels. */
  gainNiveauDb: number;
  /** Correction spectrale la plus basse et la plus haute effectivement appliquées. */
  correctionBasseDb: number;
  correctionHauteDb: number;
  /** Nombre de bandes qui ont buté sur la borne, et leur part du spectre. */
  bandesBornees: number;
  partBorneePct: number;
  /** Largeur stéréo avant et après, en rapport côté sur milieu. */
  largeurAvant: number;
  largeurApres: number;
  /** Crête finale, en décibels, et ce que l'appariement de crête a coûté au niveau. */
  creteDb: number;
  cesseNiveauDb: number;
}

const EPS = 1e-12;
const enDb = (x: number) => versDb(Math.max(EPS, x));

function efficace(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

function crete(b: AudioBuffer): number {
  let c = 0;
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const x = b.getChannelData(ch);
    for (let i = 0; i < x.length; i++) c = Math.max(c, Math.abs(x[i]));
  }
  return c;
}

/**
 * Le spectre moyen d'un signal, en magnitude par case.
 *
 * Moyenné sur des trames espacées : on cherche la COULEUR d'un morceau, pas son détail, et prendre
 * une trame sur quatre suffit tout en divisant le travail d'autant.
 */
export function spectreMoyen(x: Float32Array, fftSize: number): Float64Array {
  const fenetre = creerFenetreHann(fftSize);
  const spec = analyserSpectrogramme(x, fftSize, fftSize, fenetre);
  const nbBins = Math.floor(fftSize / 2) + 1;
  const moyen = new Float64Array(nbBins);
  if (spec.frames.length === 0) return moyen;
  for (const trame of spec.frames) {
    for (let k = 0; k < nbBins; k++) moyen[k] += trame.mag[k];
  }
  for (let k = 0; k < nbBins; k++) moyen[k] /= spec.frames.length;
  return moyen;
}

/**
 * Lisse une courbe en décibels sur une fraction d'octave.
 *
 * La demi-largeur de la fenêtre croît avec la fréquence, de sorte qu'une bande vaut partout la même
 * fraction d'octave. La case zéro, qui est la composante continue, garde sa valeur.
 */
export function lisserParOctave(db: Float64Array, bandesParOctave: number): Float64Array {
  const n = db.length;
  const sortie = new Float64Array(n);
  const facteur = Math.pow(2, 1 / (2 * Math.max(0.25, bandesParOctave)));
  sortie[0] = db[0];
  for (let k = 1; k < n; k++) {
    const bas = Math.max(1, Math.floor(k / facteur));
    const haut = Math.min(n - 1, Math.ceil(k * facteur));
    let somme = 0;
    for (let j = bas; j <= haut; j++) somme += db[j];
    sortie[k] = somme / (haut - bas + 1);
  }
  return sortie;
}

/** Applique un gain par case, en décibels, à un canal, phase conservée. */
function appliquerCourbe(x: Float32Array, gainDb: Float64Array, fftSize: number): Float32Array {
  const fenetre = creerFenetreHann(fftSize);
  const hop = Math.floor(fftSize / 4);
  const spec = analyserSpectrogramme(x, fftSize, hop, fenetre);
  if (spec.frames.length === 0) return x.slice();
  for (const trame of spec.frames) {
    for (let k = 0; k < trame.mag.length; k++) trame.mag[k] *= depuisDb(gainDb[k]);
  }
  const rendu = synthetiserSpectrogramme(spec.frames, fftSize, hop, fenetre, x.length);
  return Float32Array.from(rendu);
}

/** Le rapport du côté au milieu, qui est la largeur stéréo telle qu'on la mesure. */
export function largeurStereo(b: AudioBuffer): number {
  if (b.numberOfChannels < 2) return 0;
  const g = b.getChannelData(0), d = b.getChannelData(1);
  const n = Math.min(g.length, d.length);
  let milieu = 0, cote = 0;
  for (let i = 0; i < n; i++) {
    const m = (g[i] + d[i]) / 2, c = (g[i] - d[i]) / 2;
    milieu += m * m;
    cote += c * c;
  }
  return Math.sqrt(cote / Math.max(EPS, milieu));
}

export const OPTIONS_PAR_DEFAUT: OptionsAppariement = {
  niveau: true, spectre: true, largeur: true, crete: true,
  bandesParOctave: 3, correctionMaxDb: 12, fftSize: 4096,
};

/**
 * Donne à la cible le niveau, le spectre, la largeur et la crête de la référence.
 *
 * Les deux doivent partager leur fréquence d'échantillonnage : rapprocher deux spectres relevés sur
 * des grilles différentes n'aurait pas de sens, et rééchantillonner ici cacherait à l'appelant une
 * opération qui s'entend.
 */
export function apparierSurReference(
  cible: AudioBuffer,
  reference: AudioBuffer,
  options: Partial<OptionsAppariement> = {},
): { audio: AudioBuffer; releve: ReleveAppariement } {
  const o = { ...OPTIONS_PAR_DEFAUT, ...options };
  if (cible.sampleRate !== reference.sampleRate) {
    throw new Error(
      `La cible est à ${cible.sampleRate} Hz et la référence à ${reference.sampleRate} Hz : `
      + "les deux doivent partager leur fréquence d'échantillonnage.");
  }
  const canaux = cible.numberOfChannels;
  const sortie = new AudioBuffer({
    numberOfChannels: canaux, length: cible.length, sampleRate: cible.sampleRate,
  });
  const voies: Float32Array[] = [];
  for (let c = 0; c < canaux; c++) voies.push(cible.getChannelData(c).slice());

  // ── 1. Le niveau ────────────────────────────────────────────────────────────────────────────
  const monoCible = mixdownMono(cible);
  const monoRef = mixdownMono(reference);
  let gainNiveau = 1;
  if (o.niveau) {
    gainNiveau = efficace(monoRef) / Math.max(EPS, efficace(monoCible));
    for (const v of voies) for (let i = 0; i < v.length; i++) v[i] *= gainNiveau;
  }

  // ── 2. Le spectre ───────────────────────────────────────────────────────────────────────────
  let correctionBasse = 0, correctionHaute = 0, bornees = 0, nbBins = 0;
  if (o.spectre) {
    const specCible = spectreMoyen(
      Float32Array.from(monoCible, (v) => v * gainNiveau), o.fftSize);
    const specRef = spectreMoyen(monoRef, o.fftSize);
    nbBins = specCible.length;
    const brut = new Float64Array(nbBins);
    for (let k = 0; k < nbBins; k++) {
      brut[k] = enDb(specRef[k]) - enDb(specCible[k]);
    }
    const lisse = lisserParOctave(brut, o.bandesParOctave);
    const borne = Math.abs(o.correctionMaxDb);
    correctionBasse = Infinity;
    correctionHaute = -Infinity;
    for (let k = 0; k < nbBins; k++) {
      if (Math.abs(lisse[k]) > borne) bornees++;
      lisse[k] = Math.max(-borne, Math.min(borne, lisse[k]));
      correctionBasse = Math.min(correctionBasse, lisse[k]);
      correctionHaute = Math.max(correctionHaute, lisse[k]);
    }
    for (let c = 0; c < canaux; c++) voies[c] = appliquerCourbe(voies[c], lisse, o.fftSize);
  }

  // ── 3. La largeur ───────────────────────────────────────────────────────────────────────────
  const largeurAvant = largeurStereo(cible);
  if (o.largeur && canaux >= 2) {
    const voulue = largeurStereo(reference);
    // UNE CIBLE MONO NE S'ÉLARGIT PAS ICI : son côté vaut zéro, et multiplier zéro donne zéro.
    // C'est un autre travail, celui des premières réflexions.
    if (largeurAvant > EPS) {
      const facteur = voulue / largeurAvant;
      const g = voies[0], d = voies[1];
      for (let i = 0; i < g.length; i++) {
        const m = (g[i] + d[i]) / 2, c = ((g[i] - d[i]) / 2) * facteur;
        g[i] = m + c;
        d[i] = m - c;
      }
    }
  }

  // `copyToChannel` veut un tableau adossé à un `ArrayBuffer` et non à un `SharedArrayBuffer` :
  // la copie explicite le lui garantit, là où le type rendu par la transformée ne le dit pas.
  for (let c = 0; c < canaux; c++) sortie.copyToChannel(new Float32Array(voies[c]), c);

  // ── 4. La crête ─────────────────────────────────────────────────────────────────────────────
  let cesse = 0;
  if (o.crete) {
    const voulue = crete(reference);
    const obtenue = crete(sortie);
    if (obtenue > EPS && voulue > EPS) {
      const facteur = voulue / obtenue;
      cesse = enDb(facteur);
      for (let c = 0; c < canaux; c++) {
        const x = sortie.getChannelData(c);
        for (let i = 0; i < x.length; i++) x[i] *= facteur;
      }
    }
  }

  return {
    audio: sortie,
    releve: {
      gainNiveauDb: enDb(gainNiveau),
      correctionBasseDb: Number.isFinite(correctionBasse) ? correctionBasse : 0,
      correctionHauteDb: Number.isFinite(correctionHaute) ? correctionHaute : 0,
      bandesBornees: bornees,
      partBorneePct: nbBins > 0 ? (bornees / nbBins) * 100 : 0,
      largeurAvant,
      largeurApres: largeurStereo(sortie),
      creteDb: enDb(crete(sortie)),
      cesseNiveauDb: cesse,
    },
  };
}
