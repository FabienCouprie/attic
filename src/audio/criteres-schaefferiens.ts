// audio/criteres-schaefferiens.ts — La masse, la dynamique et l'allure, au sens du Traité.
//
// D'après Pierre Schaeffer, « Traité des objets musicaux », Seuil, 1966 ; et Michel Chion, « Guide
// des objets sonores : Pierre Schaeffer et la recherche musicale », INA-GRM / Buchet-Chastel, 1983,
// entrées MASSE p. 141, DYNAMIQUE p. 83, ALLURE p. 40.
//
// LES SEPT CRITÈRES MORPHOLOGIQUES SE RANGENT EN TROIS FAMILLES, et ce module en porte trois, un par
// famille :
//
//   · critères de MATIÈRE : masse, timbre harmonique, GRAIN ;
//   · critères de FORME : DYNAMIQUE, ALLURE ;
//   · critères de VARIATION : profil mélodique, profil de masse.
//
// Le grain est ailleurs, dans `grain-schaefferien.ts`, dont ce module réemploie l'enveloppe et le
// spectre de modulation. Les trois qui restent ne sont pas faits.
//
// ET « FACTURE » N'EST PAS UN CRITÈRE, ce qu'il faut dire puisque c'est le mot du relevé qui a
// ouvert ce chantier. Chez Schaeffer la facture est l'un des deux pôles de l'analyse, en regard de
// la matière : elle désigne la façon dont un son est façonné dans le temps, et ce sont les critères
// de FORME qui la lisent. Le critère retenu ici est donc la DYNAMIQUE, qui est celui par où la
// facture se relève, et il est nommé comme le Traité le nomme.
//
// CE QUE CE MODULE NE DIT PAS. Comme pour le grain, rien ici ne prétend nommer la CAUSE du son :
// Schaeffer observe que des causes différentes donnent la même masse, et c'est de là qu'il tire
// l'écoute réduite. Les espèces décrivent ce qui est perçu, non ce qui l'a produit.
import { enveloppe, spectreDeModulation } from "./grain-schaefferien";
import { partVoisee, suivreHauteur } from "./hauteur";
import { fft } from "./fft";

// ── La masse ──

/**
 * Les degrés de l'échelle des masses, du plus tonique au plus complexe.
 *
 * Schaeffer range les masses sur une échelle continue dont il nomme les paliers : le son PUR n'a
 * qu'une partielle et donc aucun timbre ; le son TONIQUE porte une hauteur franche et son timbre ;
 * le GROUPE tonique en porte plusieurs qu'on distingue ; le groupe NODAL occupe une zone du champ
 * sans y poser de hauteur ; le bruit BLANC occupe tout le champ.
 */
export const MASSES = ["pur", "tonique", "groupe", "nodal", "blanc", "aucune"] as const;
export type EspeceMasse = (typeof MASSES)[number];

/**
 * Le degré d'une masse sur l'échelle, de 0 pour le son pur à 4 pour le bruit blanc.
 *
 * L'ÉCHELLE DU TRAITÉ EST ORDONNÉE, et c'est ce qui permet de ranger des objets par leur masse : du
 * plus tonique au plus complexe est un geste de composition, non une commodité de tri. « aucune »
 * n'est pas un degré, et reçoit un rang au-delà des cinq pour se ranger d'un seul côté.
 */
export const degreDeMasse = (espece: EspeceMasse): number => MASSES.indexOf(espece);

/** Le degré d'une allure, de 0 pour la mécanique à 2 pour la désordonnée. */
export const degreDAllure = (espece: EspeceAllure): number => ALLURES.indexOf(espece);

export interface Masse {
  /** Le degré de l'échelle. « aucune » pour un son trop faible ou trop court. */
  espece: EspeceMasse;
  /** La part du champ des hauteurs où il y a de l'énergie, de 0 à 1. */
  occupation: number;
  /** Combien de hauteurs franches et distinctes le spectre porte. */
  hauteurs: number;
  /** La masse se déplace-t-elle au cours du son ? */
  variee: boolean;
  /** De combien, en demi-tons, relevé sur la hauteur suivie. */
  etendueDemiTons: number;
}

/**
 * Le pas visé du spectre des hauteurs, en hertz, et les bornes de la transformée qui le rend.
 *
 * LA RÉSOLUTION EST TENUE CONSTANTE, ET NON LA TAILLE DE LA TRANSFORMÉE, et c'est un défaut corrigé.
 * À taille fixe, le pas du spectre suit la cadence : 7,8 Hz à 16 kHz mais 23,4 à 48. Or le voisinage
 * sur lequel une raie se juge se compte en POINTS, puisqu'il doit valoir quelques lobes de la
 * fenêtre : dix points font donc 78 Hz à 16 kHz et 234 Hz à 48. Relevé : à 48 kHz, les deux
 * fondamentales d'un accord de 220 et 311 Hz tombent chacune dans le voisinage de l'autre, de sorte
 * qu'un GROUPE ressortait TONIQUE, une seule des deux raies survivant.
 *
 * La transformée s'allonge donc avec la cadence, et tout ce qui se mesure sur ce spectre devient
 * indépendant d'elle : le voisinage, l'occupation du champ, le test harmonique.
 */
const PAS_SPECTRE_HZ = 8;
const TAILLE_SPECTRE_MIN = 1024;
const TAILLE_SPECTRE_MAX = 16384;

/** La taille de la transformée pour cette cadence : une puissance de deux, pas plus grossière que le pas visé. */
function tailleSpectre(sampleRate: number): number {
  const vise = sampleRate / PAS_SPECTRE_HZ;
  const taille = Math.pow(2, Math.ceil(Math.log2(Math.max(2, vise))));
  return Math.max(TAILLE_SPECTRE_MIN, Math.min(TAILLE_SPECTRE_MAX, taille));
}

/**
 * Sous ce rapport au sommet, un point du spectre est tenu pour vide, en décibels.
 *
 * C'est lui qui définit l'occupation du champ : la part des points qui portent quelque chose. À
 * −40 dB, la jupe d'une raie fenêtrée ne compte pas et un bruit à bande compte sur toute sa largeur.
 */
const PLANCHER_OCCUPATION_DB = -40;

/**
 * Le relief LOCAL qu'une raie doit avoir sur son voisinage pour être une hauteur, et la largeur de
 * ce voisinage en points.
 *
 * LE RELIEF DOIT ÊTRE LOCAL, ET NON GLOBAL, et c'est ce qui sépare une hauteur d'une bande de bruit.
 * Mesuré sur la médiane de tout le spectre, le sommet d'un bruit à bande étroite ressort très haut,
 * puisque le reste du champ est vide : la bande serait prise pour une hauteur. Mesuré sur son propre
 * voisinage, il ne ressort pas, une bande de cent vingt hertz étant large de quinze points là où une
 * raie en occupe deux.
 */
const RELIEF_LOCAL = 6;
const VOISINAGE = 10;

/** Sous ce rapport au sommet du spectre, une raie est trop faible pour compter, en décibels. */
const PLANCHER_RAIE_DB = -50;

/** L'écart toléré pour qu'une raie soit tenue pour l'harmonique d'une fondamentale. */
const TOLERANCE_HARMONIQUE = 0.03;

/**
 * Le champ des hauteurs où l'occupation est mesurée, en hertz.
 *
 * ELLE SE MESURE SUR UN CHAMP FIXE, ET NON SUR TOUTE LA BANDE DU SON, et c'est un défaut corrigé.
 * Rapportée au demi de la cadence, l'occupation DÉPEND DE LA CADENCE : une bande de bruit occupe
 * 0,0075 du champ à 16 kHz et 0,0027 à 44,1 kHz, soit presque trois fois moins, pour le même son.
 * Les seuils posés sur une cadence devenaient faux sur une autre, et le relevé dans l'application
 * l'a montré : un bruit à bande étroite, rangé « nodal » à 16 kHz, ressortait « pur » à 44,1 kHz.
 *
 * QUATRE MILLE HERTZ, ET NON HUIT, parce qu'un champ doit être atteignable à toute cadence servie :
 * à 8 kHz, Nyquist est à 4000 et un plafond de 8000 ne peut pas être honoré, de sorte que
 * l'occupation se mesurait sur un champ deux fois plus étroit et DOUBLAIT. Relevé : une bande de
 * trois cents hertz ressortait à 0,5205 d'occupation à 8 kHz, donc rangée « blanc ».
 *
 * Quatre mille hertz couvrent le champ où les hauteurs se jugent, le dernier la du piano étant à
 * 4186 ; tout ce qui est au-dessus est de la brillance plutôt que de la masse.
 */
const CHAMP_MAX = 4000;

/** Au-delà de cette étendue, la masse est déclarée variée, en demi-tons. */
export const ETENDUE_VARIEE = 2;

/**
 * Au-dessus de cette occupation du champ, la masse est le bruit blanc.
 *
 * LA FRONTIÈRE EST AFFAIRE DE DEGRÉ, et c'est l'échelle du Traité qui est ainsi : une bande se
 * referme continûment sur le bruit blanc, et une bande de trois mille hertz dans un champ de quatre
 * mille EST un bruit blanc. Relevé sur la même bande à six cadences, de 8 à 48 kHz : trente hertz de
 * large donnent de 0,06 à 0,08 d'occupation, cent vingt de 0,18 à 0,30, trois cents de 0,45 à 0,52,
 * huit cents de 0,65 à 0,89, mille cinq cents de 0,85 à 0,99, trois mille de 0,97 à 1,00. Un bruit
 * blanc donne de 0,998 à 1,000. Le seuil est posé là où le champ est PLEIN.
 */
export const OCCUPATION_BLANC = 0.95;

/**
 * Sous cette occupation du champ, une masse à une seule raie est un son PUR.
 *
 * UNE SEULE RAIE NE SUFFIT PAS À DIRE « PUR », et c'est la mesure qui l'a montré : un bruit de bande
 * ÉTROITE, soixante hertz autour de 1200, survit au moyennage des trames comme une raie et ne porte
 * donc qu'une hauteur. Il ressortait « pur », ce qu'il n'est pas : un son pur occupe un POINT du
 * champ, une bande étroite en occupe un intervalle. Relevé : un sinus occupe de 0,003 à 0,006 du
 * champ, cette bande en occupe 0,049, soit huit fois plus.
 */
export const OCCUPATION_PUR = 0.02;

/**
 * Le spectre d'amplitude du milieu du son, et son pas en hertz.
 *
 * UNE SEULE TRAME, APRÈS EN AVOIR MOYENNÉ HUIT. Le moyennage avait été posé sur ce raisonnement :
 * une raie est à la même place dans toutes les trames et survit à la moyenne, un sommet de bruit se
 * déplace et s'y efface. Il a été retiré parce qu'il ne servait à rien, les deux conditions de
 * `raies` suffisant : le plancher global et le relief local.
 *
 * ET LE CHIFFRE QUI SEMBLAIT LE JUSTIFIER ÉTAIT FAUX, ce qu'il faut dire. Un relevé sur douze
 * graines comptait les fausses hauteurs trouvées dans du bruit, et il en trouvait sept sur douze
 * bruits blancs. Elles étaient RÉELLES : le générateur congruentiel écrit sur place dans le banc
 * ajoutait des raies à 4000 et 8000 Hz par ses bits de poids faible, et le motif était déterministe,
 * les quatre sons d'une même graine donnant exactement le même compte. Le banc tiré avec le
 * générateur commun du dépôt n'en trouve AUCUNE, sur quarante-huit sons de bruit.
 */
function spectre(x: Float32Array, sampleRate: number): { bins: Float64Array; parBin: number } {
  const taille = tailleSpectre(sampleRate);
  const n = Math.min(taille, x.length);
  const de = Math.max(0, Math.floor((x.length - n) / 2));
  const re = new Float64Array(taille);
  const im = new Float64Array(taille);
  for (let k = 0; k < n; k++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / n);
    re[k] = (x[de + k] ?? 0) * w;
  }
  fft(re, im, false);
  const bins = new Float64Array(taille / 2);
  for (let k = 0; k < bins.length; k++) bins[k] = Math.hypot(re[k], im[k]);
  return { bins, parBin: sampleRate / taille };
}

/**
 * Les raies franches du spectre, en rangs, du plus bas au plus haut.
 *
 * DEUX CONDITIONS, ET LES DEUX SONT NÉCESSAIRES. Le PLANCHER GLOBAL écarte ce qui est trop faible
 * pour compter dans le son, le bruit numérique au premier chef : sans lui, un sinus pur portait six
 * hauteurs, attrapées soixante décibels sous sa raie. Le RELIEF LOCAL écarte ce qui n'est pas une
 * raie mais une bosse, c'est-à-dire une bande de bruit.
 */
function raies(bins: Float64Array, haut: number): number[] {
  const trouvees: number[] = [];
  let crete = 0;
  for (let k = 1; k <= haut; k++) if (bins[k] > crete) crete = bins[k];
  const plancher = crete * Math.pow(10, PLANCHER_RAIE_DB / 20);
  for (let k = VOISINAGE; k <= Math.min(haut, bins.length - VOISINAGE - 1); k++) {
    if (bins[k] < plancher) continue;
    if (bins[k] < bins[k - 1] || bins[k] < bins[k + 1]) continue;
    // La médiane du voisinage, le point lui-même écarté : une raie se juge sur ce qui l'entoure.
    const autour: number[] = [];
    for (let j = k - VOISINAGE; j <= k + VOISINAGE; j++) if (Math.abs(j - k) > 2) autour.push(bins[j]);
    autour.sort((p, q) => p - q);
    const mediane = autour[Math.floor(autour.length / 2)];
    if (mediane > 0 && bins[k] / mediane >= RELIEF_LOCAL) trouvees.push(k);
  }
  return trouvees;
}

/**
 * Combien de hauteurs distinctes ces fréquences portent.
 *
 * LE TEST PORTE SUR DES FRÉQUENCES ET NON SUR DES RANGS, et il a d'abord porté sur des rangs, ce qui
 * était faux : à taille de transformée fixe, le pas du spectre vaut 7,8 Hz à 16 kHz mais 21,5 à
 * 44,1, de sorte qu'une série de 330, 660 et 990 Hz tombait sur les rangs 15, 31 et 46, dont les
 * rapports valent 2,067 et 3,067 au lieu de 2 et 3. La série n'était plus reconnue et un son
 * TONIQUE ressortait en GROUPE, ce que seul le passage dans l'application a montré, les cas tournant
 * alors tous à 16 kHz.
 *
 * ET AFFINER CHAQUE RAIE ENTRE SES TROIS POINTS N'Y AJOUTE RIEN, ce qui a été éprouvé plutôt que
 * supposé : la parabole avait été posée pour cela, mais la cause était la résolution, non
 * l'arrondi. Depuis que `tailleSpectre` la tient constante, le rang entier suffit, et le défaut
 * replanté ne tombe sur aucun cas, de 8 à 192 kHz.
 *
 * LA PLUS BASSE NON EXPLIQUÉE EST UNE FONDAMENTALE, et toutes celles qui en sont des harmoniques lui
 * appartiennent. Ce qui reste après est une autre hauteur. C'est ce qui sépare une série harmonique,
 * qui est UNE hauteur portant son timbre, d'un groupe, qui en porte plusieurs.
 */
function compterHauteurs(rangs: readonly number[]): number {
  const restants = [...rangs];
  let combien = 0;
  while (restants.length > 0) {
    const f0 = restants[0];
    combien++;
    for (let i = restants.length - 1; i >= 0; i--) {
      const rapport = restants[i] / f0;
      const proche = Math.round(rapport);
      if (proche >= 1 && Math.abs(rapport - proche) <= TOLERANCE_HARMONIQUE * proche) restants.splice(i, 1);
    }
  }
  return combien;
}

export interface OptionsMasse {
  /** Au-dessus de cette occupation du champ, la masse est le bruit blanc. */
  occupationBlanc?: number;
  /** Sous cette occupation, une masse à une seule raie est un son pur. */
  occupationPur?: number;
  /** Au-delà de cette étendue, la masse est variée, en demi-tons. */
  etendueVariee?: number;
}

export function masse(x: Float32Array, sampleRate: number, o: OptionsMasse = {}): Masse {
  const vide: Masse = { espece: "aucune", occupation: 0, hauteurs: 0, variee: false, etendueDemiTons: 0 };
  if (x.length < sampleRate / 10) return vide;
  let somme = 0;
  for (let i = 0; i < x.length; i++) somme += x[i] * x[i];
  if (Math.sqrt(somme / x.length) < 1e-6) return vide;

  const { bins, parBin } = spectre(x, sampleRate);
  // Le champ est borné en HERTZ, pour que l'occupation ne dépende pas de la cadence du son.
  const haut = Math.min(bins.length - 1, Math.max(2, Math.floor(CHAMP_MAX / parBin)));
  let sommet = 1;
  for (let k = 1; k <= haut; k++) if (bins[k] > bins[sommet]) sommet = k;
  if (bins[sommet] <= 0) return vide;

  const plancher = bins[sommet] * Math.pow(10, PLANCHER_OCCUPATION_DB / 20);
  let pleins = 0;
  for (let k = 1; k <= haut; k++) if (bins[k] >= plancher) pleins++;
  const occupation = pleins / haut;

  const rangs = raies(bins, haut);
  const hauteurs = compterHauteurs(rangs.map((k) => k * parBin));

  // LA VARIATION SE LIT SUR LA HAUTEUR SUIVIE, non sur le spectre, qui est pris en un seul endroit
  // du son : un glissando y donnerait une raie franche comme une tenue.
  const suivi = suivreHauteur(x, sampleRate, { fMin: 55, fMax: 4000, cadence: 100 });
  const voisees = suivi.hauteurs.filter((f, i) => f > 0 && suivi.confiances[i] > 0.5);
  let etendueDemiTons = 0;
  if (voisees.length >= 4) {
    const triees = [...voisees].sort((p, q) => p - q);
    // Les déciles, et non les extrêmes : un seul relevé aberrant ne doit pas faire une variation.
    const bas = triees[Math.floor(0.1 * triees.length)];
    const haut = triees[Math.min(triees.length - 1, Math.floor(0.9 * triees.length))];
    if (bas > 0) etendueDemiTons = 12 * Math.log2(haut / bas);
  }
  const variee = etendueDemiTons >= (o.etendueVariee ?? ETENDUE_VARIEE);

  // L'ÉCHELLE SE PARCOURT DU PLUS TONIQUE AU PLUS COMPLEXE, et les deux axes y servent tour à tour :
  // le compte de hauteurs range les trois premiers degrés, l'occupation du champ les deux derniers.
  // Il faut les deux, aucun ne donnant les cinq : une bande étroite et un son pur occupent tous deux
  // peu de place, un bruit blanc et une bande étroite ne portent tous deux aucune hauteur.
  const espece: EspeceMasse = hauteurs === 0
    ? (occupation >= (o.occupationBlanc ?? OCCUPATION_BLANC) ? "blanc" : "nodal")
    : hauteurs === 1
      ? (rangs.length <= 1 && occupation < (o.occupationPur ?? OCCUPATION_PUR) ? "pur" : "tonique")
      : "groupe";

  return { espece, occupation, hauteurs, variee, etendueDemiTons };
}

// ── La dynamique, par où se lit la facture ──

/**
 * Les formes dynamiques du Traité.
 *
 * L'IMPULSION n'a pas d'entretien du tout ; la TENUE est un plateau ; le CRESCENDO monte et le
 * DECRESCENDO descend d'un bout à l'autre ; la forme en DELTA monte puis redescend.
 */
export const FORMES = ["impulsion", "tenue", "crescendo", "decrescendo", "delta", "aucune"] as const;
export type FormeDynamique = (typeof FORMES)[number];

export interface Dynamique {
  forme: FormeDynamique;
  /** La durée de l'attaque, du dixième aux neuf dixièmes du sommet, en millisecondes. */
  attaqueMs: number;
  /** La durée passée au-dessus de la moitié du sommet, en millisecondes. */
  entretienMs: number;
  /** Où tombe le sommet dans le son, de 0 à 1. */
  sommet: number;
  /** La pente d'ensemble : le dernier tiers moins le premier, rapporté au sommet. */
  pente: number;
  /** Le bombement : le tiers du milieu moins la moyenne des deux bouts, rapporté au sommet. */
  bombement: number;
}

/** Sous cet entretien, le son est une impulsion : une attaque et rien derrière, en millisecondes. */
export const ENTRETIEN_IMPULSION = 120;
/** Au-delà de ce bombement, la forme est en delta. */
export const SEUIL_BOMBEMENT = 0.12;
/** Au-delà de cette pente, la forme monte ou descend d'ensemble. */
export const SEUIL_PENTE = 0.15;

export interface OptionsDynamique {
  /** Sous cet entretien, la forme est une impulsion, en millisecondes. */
  entretienImpulsion?: number;
  /** Au-delà de ce bombement, la forme est en delta. */
  seuilBombement?: number;
  /** Au-delà de cette pente, la forme monte ou descend d'ensemble. */
  seuilPente?: number;
}

export function dynamique(x: Float32Array, sampleRate: number, o: OptionsDynamique = {}): Dynamique {
  const vide: Dynamique = {
    forme: "aucune", attaqueMs: 0, entretienMs: 0, sommet: 0, pente: 0, bombement: 0,
  };
  if (x.length < sampleRate / 20) return vide;
  const { valeurs, cadence } = enveloppe(x, sampleRate);
  const n = valeurs.length;
  if (n < 6) return vide;
  let rangSommet = 0;
  for (let t = 1; t < n; t++) if (valeurs[t] > valeurs[rangSommet]) rangSommet = t;
  const crete = valeurs[rangSommet];
  if (crete < 1e-6) return vide;

  // L'ATTAQUE EST PRISE DU DIXIÈME AUX NEUF DIXIÈMES, ce qui est la convention des relevés
  // d'enveloppe : le pied et le sommet d'une montée sont tous deux noyés dans le bruit de mesure.
  const seuilBas = 0.1 * crete;
  const seuilHaut = 0.9 * crete;
  let debut = 0;
  while (debut < rangSommet && valeurs[debut] < seuilBas) debut++;
  let fin = debut;
  while (fin < rangSommet && valeurs[fin] < seuilHaut) fin++;
  const attaqueMs = ((fin - debut) / cadence) * 1000;

  let auDessus = 0;
  for (let t = 0; t < n; t++) if (valeurs[t] >= 0.5 * crete) auDessus++;
  const entretienMs = (auDessus / cadence) * 1000;

  const moyenne = (de: number, a: number) => {
    let s = 0;
    for (let t = de; t < a; t++) s += valeurs[t];
    return s / Math.max(1, a - de);
  };
  const tiers = Math.floor(n / 3);
  const premier = moyenne(0, tiers);
  const milieu = moyenne(tiers, 2 * tiers);
  const dernier = moyenne(2 * tiers, n);
  const pente = (dernier - premier) / crete;
  const bombement = (milieu - (premier + dernier) / 2) / crete;

  // L'ORDRE DES DÉCISIONS EST CELUI DE CE QU'ELLES EXCLUENT.
  //
  // L'ENTRETIEN PASSE AVANT LA PENTE, et c'est le cas de contrôle qui l'impose : une impulsion et un
  // decrescendo ont la MÊME pente, tous deux descendant. Ce qui les sépare est qu'une impulsion n'a
  // pas d'entretien du tout, et c'est sa durée, non sa pente, qui le dit.
  //
  // ET LE BOMBEMENT PASSE AVANT LA PENTE, parce qu'une forme en delta monte autant qu'elle descend :
  // sa pente d'ensemble est nulle comme celle d'une tenue, et seule la place de son sommet la
  // désigne.
  const seuilPente = o.seuilPente ?? SEUIL_PENTE;
  const forme: FormeDynamique = entretienMs < (o.entretienImpulsion ?? ENTRETIEN_IMPULSION) ? "impulsion"
    : bombement >= (o.seuilBombement ?? SEUIL_BOMBEMENT) ? "delta"
      : pente >= seuilPente ? "crescendo"
        : pente <= -seuilPente ? "decrescendo"
          : "tenue";

  return { forme, attaqueMs, entretienMs, sommet: rangSommet / Math.max(1, n - 1), pente, bombement };
}

// ── L'allure ──

/**
 * Les espèces d'allure du Traité.
 *
 * L'allure MÉCANIQUE est celle d'une machine, de période immuable ; la VIVANTE est celle d'un
 * instrumentiste, dont la période respire ; la DÉSORDONNÉE n'en a pas.
 */
export const ALLURES = ["mecanique", "vivante", "desordonnee", "aucune"] as const;
export type EspeceAllure = (typeof ALLURES)[number];

export interface Allure {
  espece: EspeceAllure;
  /** Le débit de l'ondulation, en hertz, ou `null` quand elle n'en a pas. */
  debit: number | null;
  /** La profondeur de l'ondulation, déduite du sommet de son spectre. */
  profondeur: number;
  /**
   * L'écart relatif des périodes successives de l'ondulation : zéro pour une machine.
   *
   * ELLE EST RELEVÉE DANS LE TEMPS, ET NON SUR LE SPECTRE, et c'est une limite de résolution qui
   * l'impose. Le relief du sommet dans la bande aurait été l'instrument naturel, mais il ne SÉPARE
   * PAS : relevé sur un trémolo de 5 Hz, il vaut 5602 pour une période immuable et 4884 pour une
   * période qui s'écarte de cinq pour cent, parce que cet écart fait un quart de hertz quand le pas
   * du spectre en fait un demi. Il faudrait vingt secondes d'enveloppe pour l'y voir.
   *
   * Les périodes successives, elles, le montrent sur une poignée d'ondulations : c'est ainsi qu'on
   * entend la différence, et c'est ce que Schaeffer décrit quand il oppose la machine au vivant.
   */
  irregularite: number;
  /** Combien d'ondulations ont été comptées pour la mesurer. */
  ondulations: number;
}

/**
 * La bande de l'allure, en hertz.
 *
 * ELLE S'ARRÊTE OÙ CELLE DU GRAIN COMMENCE, et c'est la frontière que le lot du grain a posée :
 * la force de fluctuation, qui est la sensation d'une modulation qu'on SUIT, s'éteint vers 20 Hz, et
 * la rugosité, qui est celle d'une modulation devenue TEXTURE, part de là. Voir `SEUIL_ALLURE` de
 * `grain-schaefferien.ts`, qui est le même nombre lu de l'autre côté.
 *
 * SON PLANCHER N'EST PAS LE ZÉRO, et pour une raison de mesure : sous un demi-hertz on ne relèverait
 * plus une ondulation de l'entretien mais la FORME du son entier, qui est la dynamique. La résolution
 * du spectre de modulation la borne en outre par le bas, un son court ne pouvant pas montrer une
 * ondulation plus lente que lui.
 */
export const ALLURE_MIN = 0.5;
export const ALLURE_MAX = 20;

/** Sous cette profondeur d'ondulation, il n'y a pas d'allure. */
export const SEUIL_ONDULATION = 0.06;
/**
 * Sous cette irrégularité, l'allure est mécanique ; sous la seconde, vivante.
 *
 * LES DEUX SEUILS SONT POSÉS SUR UNE ÉCHELLE MESURÉE, celle d'un trémolo de 5 Hz dont la cadence
 * s'écarte d'une part croissante : 0,0024 pour une période immuable, 0,0141 à deux pour cent,
 * 0,0350 à cinq, 0,0701 à dix, 0,1407 à vingt, 0,2524 à trente-cinq. Un vibrato d'instrumentiste
 * s'écarte de quelques pour cent, non d'un cinquième.
 *
 * ET LE HAUT DE L'ÉCHELLE EST CONTRÔLÉ PAR UN SON DONT CHAQUE PÉRIODE EST TIRÉE AU SORT, ce qui est
 * la définition de l'espèce désordonnée : il donne de 0,1776 à 0,2252 selon la graine, c'est-à-dire
 * du même ordre qu'un écart de vingt pour cent. Les deux se confondent, et c'est juste : une
 * ondulation dont la cadence varie d'un cinquième ne s'entend plus comme une ondulation réglée.
 */
export const IRREGULARITE_MECANIQUE = 0.02;
export const IRREGULARITE_VIVANTE = 0.12;
/** Il faut au moins tant d'ondulations pour que leur écart veuille dire quelque chose. */
const ONDULATIONS_MIN = 4;

/**
 * Les sommets successifs d'une ondulation, en rangs de l'enveloppe.
 *
 * LA DEMI-PÉRIODE ATTENDUE SERT DE GARDE, et sans elle le relevé compterait les rides du bruit pour
 * des ondulations : deux sommets ne peuvent pas être plus proches que la moitié de la période que le
 * spectre annonce.
 */
/**
 * L'enveloppe lissée à la borne haute de la bande de l'allure, par moyenne centrée.
 *
 * SANS ELLE, LE RÉSIDU DE LA PORTEUSE DÉPLACE CHAQUE SOMMET, et c'est le même artefact que le lot du
 * grain a relevé, vu d'un autre côté : le carré d'une porteuse de 440 Hz laisse une trace à 37,6 Hz
 * dans l'enveloppe, d'amplitude infime. Près d'un sommet, la pente de l'ondulation est nulle, de
 * sorte qu'une trace même infime y déplace le maximum. Relevé sur un trémolo PARFAITEMENT régulier :
 * l'écart des périodes ressortait à 0,0229 au lieu de zéro, et affiner le sommet entre trois points
 * n'y changeait rien, puisque la trace fausse les trois points ensemble.
 *
 * La moyenne est CENTRÉE, donc sans retard : un retard déplacerait tous les sommets du même nombre
 * et ne changerait pas leurs écarts, mais la longueur de la moyenne dépend du débit et l'on ne veut
 * pas qu'elle entre dans la mesure.
 */
function lisserDansLaBande(valeurs: Float64Array, cadence: number, borneHaute: number): Float64Array {
  const demi = Math.max(1, Math.round(cadence / (4 * Math.max(1, borneHaute))));
  const sortie = new Float64Array(valeurs.length);
  for (let t = 0; t < valeurs.length; t++) {
    let s = 0, n = 0;
    for (let k = -demi; k <= demi; k++) {
      const i = t + k;
      if (i < 0 || i >= valeurs.length) continue;
      s += valeurs[i];
      n++;
    }
    sortie[t] = s / Math.max(1, n);
  }
  return sortie;
}

function sommetsDUneOndulation(valeurs: Float64Array, ecartMin: number): number[] {
  const rangs: number[] = [];
  for (let t = 1; t < valeurs.length - 1; t++) {
    if (valeurs[t] < valeurs[t - 1] || valeurs[t] <= valeurs[t + 1]) continue;
    const dernier = rangs[rangs.length - 1];
    if (dernier !== undefined && t - dernier < ecartMin) {
      // De deux sommets trop proches, on garde le plus haut : c'est lui l'ondulation.
      if (valeurs[t] > valeurs[rangs[rangs.length - 1]]) rangs[rangs.length - 1] = t;
      continue;
    }
    rangs.push(t);
  }
  // LE SOMMET EST AFFINÉ ENTRE TROIS POINTS, et sans cela la mesure aurait son propre plancher. Un
  // rang entier quantifie la période : à 5 Hz sur une enveloppe de 240 Hz, une période fait 48
  // points, de sorte qu'un trémolo PARFAITEMENT régulier ressortait à 0,0234 d'écart relatif, qui
  // est exactement un quarante-huitième. Ce plancher monte avec le débit, et il aurait fallu un
  // seuil mobile pour s'en défendre. La parabole qui passe par les trois points du sommet le place
  // au centième de point.
  return rangs.map((t) => {
    const g = valeurs[t - 1], c = valeurs[t], d = valeurs[t + 1];
    const denom = g - 2 * c + d;
    const delta = denom !== 0 ? (0.5 * (g - d)) / denom : 0;
    return t + Math.max(-0.5, Math.min(0.5, delta));
  });
}

export interface OptionsAllure {
  /** Bornes de la bande où l'ondulation est cherchée, en hertz. */
  allureMin?: number;
  allureMax?: number;
  /** Sous cette profondeur d'ondulation, il n'y a pas d'allure. */
  seuilOndulation?: number;
  /** Les deux frontières entre les espèces, sur l'écart relatif des périodes. */
  irregulariteMecanique?: number;
  irregulariteVivante?: number;
}

export function allure(x: Float32Array, sampleRate: number, o: OptionsAllure = {}): Allure {
  const vide: Allure = {
    espece: "aucune", debit: null, profondeur: 0, irregularite: 0, ondulations: 0,
  };
  if (x.length < sampleRate / 2) return vide;
  const { valeurs, cadence } = enveloppe(x, sampleRate);
  let moyenne = 0;
  for (let t = 0; t < valeurs.length; t++) moyenne += valeurs[t];
  moyenne /= Math.max(1, valeurs.length);
  if (moyenne < 1e-6) return vide;

  const { bins, parBin } = spectreDeModulation(valeurs, cadence);
  const borneBasse = o.allureMin ?? ALLURE_MIN;
  const borneHaute = o.allureMax ?? ALLURE_MAX;
  const premier = Math.max(1, Math.ceil(borneBasse / parBin));
  const dernier = Math.min(bins.length - 1, Math.floor(borneHaute / parBin));
  if (dernier <= premier) return vide;

  let sommet = premier;
  for (let k = premier; k <= dernier; k++) if (bins[k] > bins[sommet]) sommet = k;

  // LA PROFONDEUR SE DÉDUIT DU SOMMET, ET NON DES DÉCILES DE L'ENVELOPPE, et c'est ce qui la rend
  // propre à ce critère. Les déciles compteraient la FORME du son : un crescendo leur donnerait une
  // grande profondeur sans porter aucune ondulation. Le sommet, lui, est dans la bande de l'allure,
  // d'où la forme est exclue par construction.
  //
  // Le facteur huit vient de la fenêtre : une modulation d'amplitude relative `a` sur une fenêtre de
  // Hann de longueur N donne un sommet de `a·N·moyenne/8`, le gain cohérent de cette fenêtre valant
  // un demi.
  const taille = 2 * bins.length;
  const profondeur = (8 * bins[sommet]) / (taille * moyenne);
  const debit = sommet * parBin;

  // LES PÉRIODES SUCCESSIVES, RELEVÉES DANS LE TEMPS : c'est l'espèce que leur écart donne.
  const periode = cadence / debit;
  const lisse = lisserDansLaBande(valeurs, cadence, borneHaute);
  const sommets = sommetsDUneOndulation(lisse, Math.max(2, Math.round(periode / 2)));
  const ecarts: number[] = [];
  for (let i = 1; i < sommets.length; i++) ecarts.push(sommets[i] - sommets[i - 1]);
  let irregularite = 0;
  if (ecarts.length >= 2) {
    const moy = ecarts.reduce((s, v) => s + v, 0) / ecarts.length;
    const variance = ecarts.reduce((s, v) => s + (v - moy) ** 2, 0) / ecarts.length;
    irregularite = moy > 0 ? Math.sqrt(variance) / moy : 0;
  }
  const ondulations = sommets.length;

  if (profondeur < (o.seuilOndulation ?? SEUIL_ONDULATION) || ondulations < ONDULATIONS_MIN) {
    return { espece: "aucune", debit: null, profondeur, irregularite, ondulations };
  }

  const espece: EspeceAllure = irregularite <= (o.irregulariteMecanique ?? IRREGULARITE_MECANIQUE) ? "mecanique"
    : irregularite <= (o.irregulariteVivante ?? IRREGULARITE_VIVANTE) ? "vivante"
      : "desordonnee";

  return { espece, debit, profondeur, irregularite, ondulations };
}

// ── Les trois ensemble ──

export interface CriteresSchaefferiens {
  masse: Masse;
  dynamique: Dynamique;
  allure: Allure;
}

export type OptionsCriteres = OptionsMasse & OptionsDynamique & OptionsAllure;

/** Les trois critères d'un son. */
export const criteresSchaefferiens = (
  x: Float32Array, sampleRate: number, o: OptionsCriteres = {},
): CriteresSchaefferiens => ({
  masse: masse(x, sampleRate, o),
  dynamique: dynamique(x, sampleRate, o),
  allure: allure(x, sampleRate, o),
});

/** L'harmonicité de la porteuse, rendue pour mémoire : elle sert au grain et au timbre. */
export const harmonicite = (x: Float32Array, sampleRate: number): number =>
  partVoisee(suivreHauteur(x, sampleRate, { fMin: 55, fMax: 4000, cadence: 100 }));
