// audio/hauteur.ts — Suivre la hauteur d'un son, et en faire une courbe.
//
// D'après Alain de Cheveigné et Hideki Kawahara, « YIN, a fundamental frequency estimator for
// speech and music », Journal of the Acoustical Society of America 111(4), 2002, p. 1917-1930 ;
// et Matthias Mauch et Simon Dixon, « pYIN: a fundamental frequency estimator using probabilistic
// threshold distributions », ICASSP 2014 —
// https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2014/MauchDixon-PYIN-ICASSP2014.pdf
//
// CE QUI MANQUAIT. Le suiveur de caractéristique livré avec les effets adaptatifs extrait
// l'énergie, la brillance, la platitude et la variation — pas la HAUTEUR. C'est le manque le plus
// voyant de ce lot : l'article de Verfaille cite la hauteur en premier parmi les caractéristiques
// qui pilotent, et c'est celle qui donne les effets qu'on cite toujours — un filtre qui suit la
// mélodie, un délai accordé sur la note jouée. Attic sait détecter des accords et analyser une
// harmonie, mais aucun nœud ne rendait la hauteur INSTANT PAR INSTANT.
//
// POURQUOI pYIN PLUTÔT QUE YIN. YIN rend UNE estimation par trame : le premier minimum de sa
// fonction de différence qui passe sous un seuil. Le défaut est connu et s'entend — sur une trame
// où le fondamental est faible, ce minimum est celui de l'octave, et la courbe saute d'une octave
// le temps d'une trame. Aucun lissage ne répare cela, puisque la valeur juste n'a jamais été
// produite. pYIN garde donc PLUSIEURS candidats par trame, pondérés par une loi a priori sur le
// seuil, et choisit ensuite le CHEMIN le plus probable sur tout le son : une trame ambiguë est
// tranchée par ses voisines. Le nœud laisse les deux décodages accessibles, ce qui permet de
// mesurer ce que le second apporte plutôt que de l'affirmer.
import { fft } from "./fft";
import { CADENCE, type Courbe } from "./courbe";

export interface OptionsHauteur {
  /** Hauteur la plus grave cherchée, en Hz. Fixe la longueur de fenêtre. */
  fMin?: number;
  fMax?: number;
  /** Trames par seconde. */
  cadence?: number;
  /** Borne des seuils explorés : au-delà, un minimum n'est plus un candidat crédible. */
  seuilMax?: number;
  /** Pas de la grille de hauteurs du décodage, en cents. */
  centsParPas?: number;
  /** Écart maximal entre deux trames, en demi-tons. */
  sautMaxDemiTons?: number;
  /** Probabilité de basculer entre voisé et non voisé d'une trame à l'autre. */
  pBascule?: number;
  /** Faux : on garde le seul minimum de YIN, sans décodage. Sert de témoin. */
  viterbi?: boolean;
  /** Seuil de YIN, utilisé quand `viterbi` est faux. */
  seuil?: number;
}

export interface SuiviHauteur {
  /**
   * Hauteur en Hz, une valeur par trame. Elle CONTINUE pendant les passages non voisés, au lieu
   * de retomber à zéro : c'est tout l'intérêt du double état de pYIN, et c'est ce qui permet à un
   * effet piloté par la mélodie de traverser un silence sans se refermer d'un coup.
   */
  hauteurs: Float32Array;
  /** Probabilité de voisement, entre 0 et 1. C'est elle qui dit où il n'y avait pas de note. */
  confiances: Float32Array;
  cadence: number;
}

/** Un candidat de hauteur dans une trame. */
export interface Candidat {
  /** Période en échantillons, affinée entre deux échantillons. */
  tau: number;
  hertz: number;
  /** Masse de probabilité tirée de la loi a priori sur le seuil. */
  poids: number;
}

const prochainePuissanceDeDeux = (n: number): number => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/**
 * La fonction de différence de YIN, normalisée par sa moyenne cumulée (les étapes 1 à 3 de
 * l'article).
 *
 * `d(τ)` mesure à quel point le signal ressemble à lui-même décalé de τ : elle s'annule à la
 * période. Elle est calculée par TRANSFORMÉE plutôt que terme à terme —
 * `d(τ) = P(0) + P(τ) − 2·r(τ)` où r est la corrélation — sans quoi une seconde de son à 44,1 kHz
 * demanderait le milliard d'opérations qui rend la chose inutilisable dans un navigateur.
 *
 * La NORMALISATION par la moyenne cumulée est ce qui distingue YIN d'une simple autocorrélation :
 * sans elle, `d` est petite aussi aux multiples de la période, et rien ne départage la période de
 * son double. Divisée par la moyenne des différences déjà vues, la vraie période garde une valeur
 * basse tandis que ses multiples remontent.
 */
export function differenceNormalisee(
  x: Float32Array, debut: number, fenetre: number, tauMax: number,
): Float64Array {
  const portee = fenetre + tauMax;
  const n = prochainePuissanceDeDeux(portee + 1);
  const reA = new Float64Array(n), imA = new Float64Array(n);
  const reB = new Float64Array(n), imB = new Float64Array(n);
  // Sommes partielles des carrés, pour obtenir P(τ) sans le recalculer à chaque τ.
  const cumul = new Float64Array(portee + 1);
  for (let i = 0; i < portee; i++) {
    const v = debut + i < x.length ? x[debut + i] : 0;
    if (i < fenetre) reA[i] = v;
    reB[i] = v;
    cumul[i + 1] = cumul[i] + v * v;
  }
  fft(reA, imA, false);
  fft(reB, imB, false);
  for (let i = 0; i < n; i++) {
    // Corrélation : conjuguée de A multipliée par B.
    const re = reA[i] * reB[i] + imA[i] * imB[i];
    const im = reA[i] * imB[i] - imA[i] * reB[i];
    reA[i] = re; imA[i] = im;
  }
  fft(reA, imA, true);

  const d = new Float64Array(tauMax + 1);
  const p0 = cumul[fenetre];
  for (let tau = 0; tau <= tauMax; tau++) {
    const pTau = cumul[tau + fenetre] - cumul[tau];
    d[tau] = Math.max(0, p0 + pTau - 2 * reA[tau]);
  }

  const dPrime = new Float64Array(tauMax + 1);
  dPrime[0] = 1;
  let somme = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    somme += d[tau];
    dPrime[tau] = somme > 1e-20 ? (d[tau] * tau) / somme : 1;
  }
  return dPrime;
}

/** Interpolation parabolique autour d'un minimum : la période au sous-échantillon près. */
export function affinerTau(d: Float64Array, tau: number): number {
  if (tau <= 0 || tau >= d.length - 1) return tau;
  const a = d[tau - 1], b = d[tau], c = d[tau + 1];
  const den = a - 2 * b + c;
  if (Math.abs(den) < 1e-20) return tau;
  const decalage = (0.5 * (a - c)) / den;
  return tau + Math.max(-1, Math.min(1, decalage));
}

/** Densité de la loi Beta(2, 18), à une constante près. C'est la loi a priori de l'article. */
const densiteSeuil = (s: number): number => s * Math.pow(1 - s, 17);

/** Nombre de seuils échantillonnés dans la loi a priori. */
const SEUILS = 50;

/**
 * Les candidats d'une trame, avec leur masse de probabilité.
 *
 * C'est la contribution de pYIN, et elle se lit ici : au lieu d'un seuil unique choisi à la main,
 * on parcourt une loi a priori de seuils. Pour chaque seuil, YIN retiendrait le PREMIER minimum
 * qui passe dessous ; la masse de ce seuil va donc à ce minimum-là. Un minimum très marqué gagne
 * pour presque tous les seuils, un minimum douteux pour quelques-uns seulement, et la masse qui ne
 * va à personne — aucun minimum sous le seuil — mesure le NON-VOISEMENT.
 */
export function candidats(
  dPrime: Float64Array, tauMin: number, tauMax: number, sampleRate: number, seuilMax: number,
): { liste: Candidat[]; voisement: number } {
  const minima: number[] = [];
  for (let tau = Math.max(1, tauMin); tau < Math.min(tauMax, dPrime.length - 1); tau++) {
    if (dPrime[tau] < dPrime[tau - 1] && dPrime[tau] <= dPrime[tau + 1]) minima.push(tau);
  }
  const poids = new Map<number, number>();
  let total = 0, retenu = 0;
  for (let i = 0; i < SEUILS; i++) {
    const s = ((i + 0.5) / SEUILS) * seuilMax;
    const w = densiteSeuil(s);
    total += w;
    const gagnant = minima.find((tau) => dPrime[tau] < s);
    if (gagnant === undefined) continue;
    retenu += w;
    poids.set(gagnant, (poids.get(gagnant) ?? 0) + w);
  }
  const liste: Candidat[] = [];
  for (const [tau, w] of poids) {
    const affine = affinerTau(dPrime, tau);
    liste.push({ tau: affine, hertz: sampleRate / affine, poids: w / total });
  }
  liste.sort((a, b) => b.poids - a.poids);
  return { liste, voisement: total > 0 ? retenu / total : 0 };
}

/** Le choix de YIN : le premier minimum sous le seuil, sinon le plus bas. Sert de témoin. */
function choixYin(
  dPrime: Float64Array, tauMin: number, tauMax: number, sampleRate: number, seuil: number,
): { hertz: number; voisement: number } {
  let meilleur = -1;
  const borne = Math.min(tauMax, dPrime.length - 1);
  for (let tau = Math.max(1, tauMin); tau < borne; tau++) {
    if (dPrime[tau] < seuil && dPrime[tau] <= dPrime[tau + 1]) { meilleur = tau; break; }
  }
  if (meilleur < 0) {
    let bas = Infinity;
    for (let tau = Math.max(1, tauMin); tau < borne; tau++) {
      if (dPrime[tau] < bas) { bas = dPrime[tau]; meilleur = tau; }
    }
  }
  if (meilleur < 0) return { hertz: 0, voisement: 0 };
  const affine = affinerTau(dPrime, meilleur);
  return { hertz: sampleRate / affine, voisement: Math.max(0, 1 - dPrime[meilleur]) };
}

const PLANCHER = 1e-9;

/**
 * Décodage de Viterbi sur une grille de hauteurs doublée — voisé et non voisé.
 *
 * Le double état est ce qui permet à la hauteur de CONTINUER pendant un silence : le chemin passe
 * par l'état non voisé d'une hauteur, garde donc le fil de la mélodie, et ressort à la note
 * suivante sans avoir eu à sauter d'un bout à l'autre de la grille. La transition est triangulaire
 * en écart de hauteur : rester sur la même note est le plus probable, un saut au-delà de
 * `sautMaxDemiTons` est impossible d'une trame à l'autre.
 */
function decoder(
  trames: { liste: Candidat[]; voisement: number }[],
  fMin: number, centsParPas: number, bins: number,
  sautMaxBins: number, pBascule: number,
): { bin: number; voise: boolean }[] {
  const nEtats = bins * 2;
  const hertzDuBin = (b: number) => fMin * Math.pow(2, (b * centsParPas) / 1200);
  const binDuHertz = (f: number) =>
    Math.round((1200 * Math.log2(Math.max(1e-6, f) / fMin)) / centsParPas);

  const logTransitionMeme = Math.log(1 - pBascule);
  const logTransitionBascule = Math.log(pBascule);
  // Poids triangulaire de l'écart de hauteur, normalisé.
  const poidsSaut = new Float64Array(sautMaxBins + 1);
  let sommeSaut = 0;
  for (let d = 0; d <= sautMaxBins; d++) { poidsSaut[d] = 1 - d / (sautMaxBins + 1); sommeSaut += d === 0 ? poidsSaut[d] : 2 * poidsSaut[d]; }
  const logSaut = Float64Array.from(poidsSaut, (w) => Math.log(w / sommeSaut));

  let precedent = new Float64Array(nEtats).fill(-Infinity);
  const chemins: Int32Array[] = [];
  const emission = (t: number, b: number, voise: boolean): number => {
    const tr = trames[t];
    let masse = 0;
    for (const c of tr.liste) if (binDuHertz(c.hertz) === b) masse += c.poids;
    const part = voise ? tr.voisement : 1 - tr.voisement;
    return Math.log(masse * part + PLANCHER);
  };

  for (let b = 0; b < bins; b++) {
    precedent[b] = emission(0, b, true) + Math.log(0.5 / bins);
    precedent[bins + b] = emission(0, b, false) + Math.log(0.5 / bins);
  }

  for (let t = 1; t < trames.length; t++) {
    const courant = new Float64Array(nEtats).fill(-Infinity);
    const venant = new Int32Array(nEtats).fill(-1);
    for (let b = 0; b < bins; b++) {
      const emV = emission(t, b, true), emN = emission(t, b, false);
      const bDebut = Math.max(0, b - sautMaxBins), bFin = Math.min(bins - 1, b + sautMaxBins);
      for (let bp = bDebut; bp <= bFin; bp++) {
        const ls = logSaut[Math.abs(b - bp)];
        for (const vp of [0, 1]) {
          const source = vp * bins + bp;
          const base = precedent[source] + ls;
          if (base === -Infinity) continue;
          // Vers voisé.
          const versV = base + (vp === 0 ? logTransitionMeme : logTransitionBascule) + emV;
          if (versV > courant[b]) { courant[b] = versV; venant[b] = source; }
          // Vers non voisé.
          const versN = base + (vp === 1 ? logTransitionMeme : logTransitionBascule) + emN;
          if (versN > courant[bins + b]) { courant[bins + b] = versN; venant[bins + b] = source; }
        }
      }
    }
    chemins.push(venant);
    precedent = courant;
  }

  let etat = 0;
  for (let e = 1; e < nEtats; e++) if (precedent[e] > precedent[etat]) etat = e;
  const sortie: { bin: number; voise: boolean }[] = new Array(trames.length);
  for (let t = trames.length - 1; t >= 0; t--) {
    sortie[t] = { bin: etat % bins, voise: etat < bins };
    if (t > 0) etat = chemins[t - 1][etat];
  }
  void hertzDuBin;
  return sortie;
}

/**
 * Suit la hauteur d'un signal, trame par trame.
 *
 * Le coût est celui d'une transformée par trame : à cadence 100 et 44,1 kHz, quelques dizaines de
 * millisecondes par seconde de son. La cadence est donc un réglage qui compte, et pas seulement
 * une finesse d'affichage.
 */
export function suivreHauteur(
  x: Float32Array, sampleRate: number, o: OptionsHauteur = {},
): SuiviHauteur {
  const fMin = Math.max(20, o.fMin ?? 55);
  const fMax = Math.min(sampleRate / 2 - 1, o.fMax ?? 1760);
  const cadence = Math.max(10, o.cadence ?? 100);
  const seuilMax = Math.min(0.95, Math.max(0.05, o.seuilMax ?? 0.6));
  const centsParPas = Math.max(5, o.centsParPas ?? 20);
  const tauMin = Math.max(2, Math.floor(sampleRate / fMax));
  const tauMax = Math.max(tauMin + 2, Math.ceil(sampleRate / fMin));
  // La fenêtre doit couvrir deux périodes de la plus grave des hauteurs cherchées : en dessous,
  // la différence ne peut pas voir la période se répéter.
  const fenetre = 2 * tauMax;
  const saut = Math.max(1, Math.round(sampleRate / cadence));
  const nTrames = Math.max(1, Math.ceil(x.length / saut));

  const mesures: { liste: Candidat[]; voisement: number }[] = [];
  const temoins: { hertz: number; voisement: number }[] = [];
  const avecViterbi = o.viterbi !== false;
  for (let t = 0; t < nTrames; t++) {
    const dPrime = differenceNormalisee(x, t * saut, fenetre, tauMax);
    if (avecViterbi) mesures.push(candidats(dPrime, tauMin, tauMax, sampleRate, seuilMax));
    else temoins.push(choixYin(dPrime, tauMin, tauMax, sampleRate, o.seuil ?? 0.15));
  }

  const hauteurs = new Float32Array(nTrames);
  const confiances = new Float32Array(nTrames);

  if (!avecViterbi) {
    for (let t = 0; t < nTrames; t++) {
      hauteurs[t] = temoins[t].hertz;
      confiances[t] = temoins[t].voisement;
    }
    return { hauteurs, confiances, cadence };
  }

  const bins = Math.max(2, Math.ceil((1200 * Math.log2(fMax / fMin)) / centsParPas) + 1);
  const sautMaxBins = Math.max(1, Math.round((100 * (o.sautMaxDemiTons ?? 12)) / centsParPas));
  const chemin = decoder(mesures, fMin, centsParPas, bins, sautMaxBins, o.pBascule ?? 0.01);

  for (let t = 0; t < nTrames; t++) {
    const attendu = fMin * Math.pow(2, (chemin[t].bin * centsParPas) / 1200);
    // La grille est à vingt cents : on rend la hauteur du CANDIDAT le plus proche du bin décodé,
    // et non celle du bin, pour ne pas jeter la précision gagnée par l'interpolation parabolique.
    let meilleur = attendu, ecartMin = Infinity;
    for (const c of mesures[t].liste) {
      const ecart = Math.abs(Math.log2(c.hertz / attendu));
      if (ecart < ecartMin && ecart < 0.05) { ecartMin = ecart; meilleur = c.hertz; }
    }
    hauteurs[t] = meilleur;
    confiances[t] = chemin[t].voise ? mesures[t].voisement : 0;
  }
  return { hauteurs, confiances, cadence };
}

/**
 * Traduit un suivi de hauteur en courbe de modulation.
 *
 * L'échelle est LOGARITHMIQUE, et ce n'est pas un détail : une octave doit valoir le même
 * intervalle de courbe où qu'elle se trouve, sans quoi une mélodie jouée deux octaves plus bas ne
 * bougerait presque plus la courbe alors qu'elle parcourt les mêmes notes.
 */
export function courbeDepuisHauteur(
  s: SuiviHauteur, fMin: number, fMax: number,
): Courbe {
  const etendue = Math.max(1e-6, Math.log2(fMax / fMin));
  const valeurs = Float32Array.from(s.hauteurs, (f) =>
    f <= 0 ? 0 : Math.min(1, Math.max(0, Math.log2(f / fMin) / etendue)));
  return { valeurs, cadence: s.cadence };
}

/** La confiance en tant que courbe : de quoi ne laisser un effet agir que sur les notes tenues. */
export function courbeDeConfiance(s: SuiviHauteur): Courbe {
  return { valeurs: Float32Array.from(s.confiances), cadence: s.cadence };
}

/** Médiane des hauteurs voisées — ce qu'on affiche sur le nœud, robuste à une trame fautive. */
export function hauteurMediane(s: SuiviHauteur): number {
  const voisees = [...s.hauteurs].filter((f, i) => f > 0 && s.confiances[i] > 0.5).sort((a, b) => a - b);
  if (voisees.length === 0) return 0;
  return voisees[Math.floor(voisees.length / 2)];
}

/** Part des trames voisées, entre 0 et 1. */
export const partVoisee = (s: SuiviHauteur): number =>
  s.confiances.length === 0 ? 0 : [...s.confiances].filter((c) => c > 0.5).length / s.confiances.length;

export { CADENCE };
