// audio/grain-schaefferien.ts — Le grain au sens du Traité, mesuré sur l'entretien.
//
// D'après Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966, et sa figure des types de
// grain, p. 553 ; et Michel Chion, « Guide des objets sonores : Pierre Schaeffer et la recherche
// musicale », INA-GRM / Buchet-Chastel, 1983, entrée GRAIN, p. 95.
//
// CE QUE LE CRITÈRE EST. Schaeffer part des trois manières dont un corps entretient sa vibration —
// pas du tout, constamment, par percussions répétées — et en tire trois espèces de grain : la
// RÉSONANCE donne le grain harmonique, dont la qualité est le scintillement ; le FROTTEMENT donne
// le grain compact ; l'ITÉRATION donne le grain discontinu, dont la qualité est le frappement. Les
// combinaisons en donnent les hybrides, frottements résonants et frappements résonants.
//
// ET CE QUE CE MODULE NE DIT PAS, parce que Schaeffer en fait un principe. Il observe que des
// causes différentes donnent le même grain, et c'est précisément de là qu'il tire l'écoute réduite.
// Rien ici ne prétend nommer la cause : l'espèce décrit la microstructure PERÇUE de l'entretien, et
// un nœud qui annoncerait « ceci est un frottement » commettrait l'erreur que le critère existe
// pour éviter. Les noms des espèces sont donc ceux du grain, non ceux du geste.
//
// LES DEUX AXES SONT LA PROFONDEUR DE MODULATION ET L'HARMONICITÉ, et ils suivent les trois modes
// d'entretien plutôt qu'une grandeur commode :
//
//   · la PROFONDEUR de la modulation de l'enveloppe sépare l'entretien PAR PERCUSSIONS RÉPÉTÉES des
//     deux entretiens continus : entre deux chocs l'enveloppe retombe, entre deux instants d'un
//     frottement ou d'une résonance elle se tient.
//   · l'HARMONICITÉ de la porteuse sépare ensuite les deux continus, relevée par le suiveur de
//     hauteur du dépôt plutôt que réinventée. Une résonance la porte, un frottement n'en a pas.
//
// ET LE PREMIER AXE A ÉTÉ LA NETTETÉ DU SPECTRE DE MODULATION, ce qui était faux et ne tenait que
// par accident. Relevé sur les trois sons d'essai : la netteté vaut 2,91 pour un frottement, 11,27
// pour une itération et 24,17 pour une résonance — elle met donc la RÉSONANCE PLUS HAUT que
// l'itération, et ne sépare pas dans le sens qu'on lui demandait. Le classement ne marchait que
// parce que l'harmonicité passait d'abord et attrapait la résonance avant elle. La profondeur, elle,
// vaut 0,145, 1,000 et 0,150 : un facteur sept de marge, et le sens de Schaeffer. La netteté reste
// rendue, mais comme ce qu'elle est, la franchise du débit relevé.
//
// IL FAUT LES DEUX, ET C'EST CE QUE LES DEUX CAS DE CONTRÔLE ÉTABLISSENT. L'harmonicité seule
// confond le frottement et l'itération, tous deux sans hauteur ; la profondeur seule confond le
// frottement et la résonance, tous deux d'entretien continu. Un seul axe donnerait deux classes là
// où le Traité en compte trois, et le descripteur ne serait qu'une grandeur unique déguisée.
//
// LE RELEVÉ PORTE SUR L'ENTRETIEN, NON SUR L'ATTAQUE, le grain étant par définition la
// microstructure de ce qui se tient. Le premier dixième et le dernier dixième du son sont donc
// écartés : une attaque placée devant ne doit pas déplacer l'espèce.
import { partVoisee, suivreHauteur } from "./hauteur";
import { fft } from "./fft";

export const ESPECES = ["harmonique", "compact", "discontinu", "aucun"] as const;
export type Espece = (typeof ESPECES)[number];

export interface GrainSchaefferien {
  /**
   * L'espèce du grain, au sens de la figure du Traité.
   *
   * « aucun » n'en est pas une : c'est ce que rend un son trop faible ou trop court pour qu'un
   * entretien s'y observe, et le dire vaut mieux que de tirer une espèce au hasard.
   */
  espece: Espece;
  /** Le débit de la modulation dominante, en hertz : le serré et le lâche de Schaeffer. */
  debit: number;
  /** La profondeur de cette modulation, de 0 à 1 : le calibre du grain. */
  profondeur: number;
  /** La concentration du spectre de modulation autour de son sommet. */
  nettete: number;
  /** L'harmonicité de la porteuse, de 0 à 1. */
  harmonicite: number;
}

/** Les bornes du spectre de modulation retenues, en hertz. */
export const DEBIT_MIN = 2;
export const DEBIT_MAX = 120;

/** Au-delà de cette profondeur de modulation, l'entretien est tenu pour une suite de percussions. */
export const SEUIL_PROFOND = 0.5;
/** Au-dessus de ce seuil d'harmonicité, un entretien continu est tenu pour une résonance. */
export const SEUIL_HARMONIQUE = 0.5;

/**
 * L'enveloppe du son, en valeur efficace par courte trame.
 *
 * LA CADENCE DOIT COUVRIR LE DÉBIT CHERCHÉ : à deux fois `DEBIT_MAX`, le spectre de modulation
 * s'arrête juste où le relevé s'arrête, ce qui est la condition de Nyquist appliquée à l'enveloppe
 * et non au son.
 */
export function enveloppe(x: Float32Array, sampleRate: number): { valeurs: Float64Array; cadence: number } {
  const cadence = 2 * DEBIT_MAX;
  const saut = Math.max(1, Math.round(sampleRate / cadence));
  const n = Math.floor(x.length / saut);
  const valeurs = new Float64Array(Math.max(1, n));
  for (let t = 0; t < n; t++) {
    let s = 0;
    for (let k = 0; k < saut; k++) {
      const v = x[t * saut + k] ?? 0;
      s += v * v;
    }
    valeurs[t] = Math.sqrt(s / saut);
  }
  return { valeurs, cadence: sampleRate / saut };
}

/**
 * Le spectre de modulation d'une enveloppe, de `DEBIT_MIN` à `DEBIT_MAX`.
 *
 * LA MOYENNE EST RETIRÉE AVANT LA TRANSFORMÉE : sans cela le continu de l'enveloppe, qui est le
 * niveau du son, écraserait tout le reste et le sommet tomberait toujours au premier point.
 */
export function spectreDeModulation(
  valeurs: Float64Array, cadence: number,
): { bins: Float64Array; parBin: number } {
  let taille = 1;
  while (taille * 2 <= valeurs.length) taille *= 2;
  taille = Math.max(16, taille);
  let moyenne = 0;
  for (let t = 0; t < Math.min(taille, valeurs.length); t++) moyenne += valeurs[t];
  moyenne /= Math.min(taille, valeurs.length);
  const re = new Float64Array(taille);
  const im = new Float64Array(taille);
  for (let t = 0; t < taille; t++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / taille);
    re[t] = ((valeurs[t] ?? moyenne) - moyenne) * w;
  }
  fft(re, im, false);
  const bins = new Float64Array(taille / 2);
  for (let k = 0; k < bins.length; k++) bins[k] = Math.hypot(re[k], im[k]);
  return { bins, parBin: cadence / taille };
}

/**
 * Le grain d'un son : son espèce, son débit, sa profondeur.
 *
 * Le coût est celui d'une transformée sur l'enveloppe, soit quelques centaines de points, et d'un
 * suivi de hauteur sur l'entretien.
 */
export interface OptionsGrain {
  /** Au-delà de cette profondeur, l'entretien est tenu pour une suite de percussions. */
  seuilProfond?: number;
  /** Au-dessus de ce seuil d'harmonicité, un entretien continu est tenu pour une résonance. */
  seuilHarmonique?: number;
  /** Bornes du spectre de modulation relevé, en hertz. */
  debitMin?: number;
  debitMax?: number;
  /** Part écartée à chaque bout du son, de 0 à 0,4 : l'attaque n'est pas l'entretien. */
  entretien?: number;
}

export function grainSchaefferien(
  x: Float32Array, sampleRate: number, o: OptionsGrain = {},
): GrainSchaefferien {
  const vide: GrainSchaefferien = {
    espece: "aucun", debit: 0, profondeur: 0, nettete: 0, harmonicite: 0,
  };
  // L'ENTRETIEN, NON L'ATTAQUE : un dixième écarté de chaque bout.
  const marge = Math.min(0.4, Math.max(0, o.entretien ?? 0.1));
  const de = Math.floor(x.length * marge);
  const a = Math.ceil(x.length * (1 - marge));
  if (a - de < sampleRate / 10) return vide;
  const tenu = x.subarray(de, a);

  const { valeurs, cadence } = enveloppe(tenu, sampleRate);
  let moyenne = 0;
  for (let t = 0; t < valeurs.length; t++) moyenne += valeurs[t];
  moyenne /= Math.max(1, valeurs.length);
  if (moyenne < 1e-6) return vide;

  const { bins, parBin } = spectreDeModulation(valeurs, cadence);
  const premier = Math.max(1, Math.ceil((o.debitMin ?? DEBIT_MIN) / parBin));
  const dernier = Math.min(bins.length - 1, Math.floor((o.debitMax ?? DEBIT_MAX) / parBin));
  if (dernier <= premier) return vide;

  let sommet = premier;
  let total = 0;
  for (let k = premier; k <= dernier; k++) {
    if (bins[k] > bins[sommet]) sommet = k;
    total += bins[k];
  }
  const moyenneBins = total / (dernier - premier + 1);
  const nettete = moyenneBins > 0 ? bins[sommet] / moyenneBins : 0;

  // LE DÉBIT EST LE PLUS BAS SOMMET FRANC, ET NON LE PLUS HAUT. Un roulement est un train
  // d'impulsions brèves : son spectre de modulation porte le débit ET TOUS SES HARMONIQUES à des
  // hauteurs voisines, jusqu'à ce que le spectre d'un choc décline. Le plus haut sommet tombe donc
  // sur n'importe lequel d'entre eux : relevé sur huit chocs par seconde, il rendait 15,9 Hz,
  // c'est-à-dire le second. Le plus bas qui atteigne sept dixièmes du maximum est le débit lui-même.
  let rang = sommet;
  for (let k = premier; k <= dernier; k++) {
    if (bins[k] < 0.7 * bins[sommet]) continue;
    if (k > premier && bins[k] < bins[k - 1]) continue;
    if (k < dernier && bins[k] < bins[k + 1]) continue;
    rang = k;
    break;
  }
  const debit = rang * parBin;

  // LA PROFONDEUR EST LE CREUX SUR LA CRÊTE DE L'ENVELOPPE, pris sur ses déciles.
  //
  // UNE PREMIÈRE VERSION PRENAIT L'ÉCART TYPE SUR LA MOYENNE, BORNÉ À UN, et le plafond détruisait
  // la mesure : un train aéré donne un rapport de 2,7 et un train serré de 0,33, mais les deux
  // ressortaient à 1,00 et le cas ne séparait plus rien. Le creux sur la crête tient dans zéro à un
  // par construction, sans plafond à poser : une enveloppe qui retombe à zéro entre deux chocs est
  // pleinement modulée, une enveloppe qui ne retombe pas l'est moins.
  const tries = Float64Array.from(valeurs).sort();
  const decile = (p: number) => tries[Math.min(tries.length - 1, Math.floor(p * tries.length))];
  const bas = decile(0.1);
  const haut = decile(0.9);
  const profondeur = haut + bas > 0 ? (haut - bas) / (haut + bas) : 0;

  const harmonicite = partVoisee(suivreHauteur(tenu, sampleRate, { fMin: 55, fMax: 4000, cadence: 100 }));

  // LES DEUX AXES DÉCIDENT, ET DANS CET ORDRE, qui est celui des trois modes d'entretien. La
  // profondeur sépare d'abord l'entretien par percussions répétées des deux continus ; l'harmonicité
  // sépare ensuite ces deux-là.
  const espece: Espece = profondeur >= (o.seuilProfond ?? SEUIL_PROFOND) ? "discontinu"
    : harmonicite >= (o.seuilHarmonique ?? SEUIL_HARMONIQUE) ? "harmonique"
    : "compact";

  return { espece, debit, profondeur, nettete, harmonicite };
}
