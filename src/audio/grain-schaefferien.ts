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
// vaut 0,089, 1,000 et 0,112 : le sens de Schaeffer, et une marge qui tient. La netteté reste
// rendue, mais comme ce qu'elle est.
//
// IL FAUT LES DEUX, ET C'EST CE QUE LES DEUX CAS DE CONTRÔLE ÉTABLISSENT. L'harmonicité seule
// confond le frottement et l'itération, tous deux sans hauteur ; la profondeur seule confond le
// frottement et la résonance, tous deux d'entretien continu. Un seul axe donnerait deux classes là
// où le Traité en compte trois, et le descripteur ne serait qu'une grandeur unique déguisée.
//
// LE RELEVÉ PORTE SUR L'ENTRETIEN, NON SUR L'ATTAQUE, le grain étant par définition la
// microstructure de ce qui se tient. Le premier dixième et le dernier dixième du son sont donc
// écartés : une attaque placée devant ne doit pas déplacer l'espèce.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
//
// ET IL Y AVAIT QUATRE CHOSES QU'UN GRAIN N'EST PAS, que ce module rangeait pourtant en espèces.
// Elles ont toutes été trouvées en mesurant, et aucune ne se voyait sur les trois sons d'essai,
// qui sont tous les trois des grains : un témoin ne montre pas ce qu'on ne lui a pas demandé.
//
//   1. UNE TENUE LISSE. Un son harmonique dont l'enveloppe ne module pas n'a pas de grain, c'est
//      le grain nul du Traité. Il ressortait « harmonique », avec un débit de 18,7 Hz. `SEUIL_TENUE`.
//
//   2. UN GRAIN COMPACT N'A PAS DE DÉBIT. Le sommet d'un spectre de modulation PLAT n'est que le
//      hasard du bruit : le frottement témoin annonçait 2,80 Hz. Schaeffer tient justement le grain
//      compact pour celui dont on ne compte pas les grains. `SEUIL_RELIEF`, et `debit` vaut
//      désormais `null`.
//
//   3. UNE ALLURE. La fluctuation lente d'un entretien continu est une ALLURE, critère de FORME,
//      quand le grain est un critère de MATIÈRE. Le témoin de l'espèce harmonique était lui-même
//      un battement à 6 Hz, c'est-à-dire une allure prise pour un grain. `SEUIL_ALLURE`.
//
//   4. LE RÉSIDU DE LA PORTEUSE. C'est le plus grave, et il touchait tout un registre : de 110 à
//      180 Hz, une NOTE TENUE recevait un grain fabriqué, dont le débit était le repliement de sa
//      propre fondamentale. `PORTEUSE_SUR_DEBIT`.
//
//      ET SA TRACE FAUSSAIT ENCORE LE DÉBIT au-dessus de cette frontière, là où elle ne pouvait plus
//      fabriquer d'espèce : un peigne de modulation à 25, 30, 40 ou 60 Hz sur une porteuse de 220
//      ressortait tout entier à 18,7 Hz. L'enveloppe est donc relevée une SECONDE fois, à une
//      cadence haussée d'un quart, et seuls les sommets qui ne bougent pas d'une cadence à l'autre
//      sont retenus : une modulation est dans le son, un repliement est dans la décimation.
//      `HAUSSE_TEMOIN`.
//
// LES QUATRE SE DISENT, ET SÉPARÉMENT : `absence` nomme lequel des quatre cas on tient, plutôt que
// de les confondre sous un seul « aucun » où trois défauts passaient pour un silence.
//
// ET L'ENVELOPPE ELLE-MÊME A ÉTÉ REFAITE, parce qu'elle était la racine du quatrième. Elle était la
// valeur efficace de trames jointives, qui ondule dès que la trame ne couvre pas un nombre entier
// de périodes de la porteuse ; elle est maintenant le carré du son suivi d'un passe-bas, où la
// porteuse se FILTRE au lieu de se moyenner. Le détail est sur `enveloppe`, avec le prix mesuré.
import { partVoisee, suivreHauteur } from "./hauteur";
import { fenetreHann } from "./stft";
import { fft } from "./fft";

export const ESPECES = ["harmonique", "compact", "discontinu", "aucun"] as const;
export type Espece = (typeof ESPECES)[number];

/**
 * Pourquoi il n'y a pas de grain, quand il n'y en a pas.
 *
 * LES QUATRE CAS SONT DE NATURES DIFFÉRENTES, et les confondre sous un seul « aucun » faisait
 * passer trois défauts pour un silence :
 *
 *   · `silence` — le son est trop faible ou trop court pour qu'un entretien s'y observe ;
 *   · `porteuse` — la porteuse est trop grave pour qu'un grain s'y mesure, voir `porteuseSuffisante` ;
 *   · `tenue` — l'entretien ne module pas : c'est la tenue lisse, le grain nul du Traité ;
 *   · `allure` — il module, mais trop lentement pour un grain : c'est une ALLURE, qui est un critère
 *     de forme et non de matière, et qui se relève ailleurs.
 */
export const ABSENCES = ["silence", "porteuse", "tenue", "allure"] as const;
export type Absence = (typeof ABSENCES)[number];

export interface GrainSchaefferien {
  /**
   * L'espèce du grain, au sens de la figure du Traité.
   *
   * « aucun » n'en est pas une : c'est ce que rend un son où aucun grain ne se relève, et `absence`
   * dit alors lequel des quatre cas on tient. Le dire vaut mieux que de tirer une espèce au hasard.
   */
  espece: Espece;
  /**
   * Le débit de la modulation dominante, en hertz : le serré et le lâche de Schaeffer. `null` quand
   * le spectre de modulation ne porte AUCUN pic franc, ce qui est le cas du grain compact.
   *
   * IL VALAIT UN NOMBRE DANS TOUS LES CAS, ET C'ÉTAIT UN DÉFAUT. Le frottement témoin du dépôt, qui
   * est un bruit à bande, ressortait avec un débit de 2,80 Hz : le sommet d'un spectre plat, c'est-
   * à-dire le hasard du bruit. Schaeffer tient justement le grain compact pour celui dont on ne
   * compte pas les grains, et un débit y est une invention.
   */
  debit: number | null;
  /** La profondeur de cette modulation, de 0 à 1 : le calibre du grain. */
  profondeur: number;
  /** La concentration du spectre de modulation autour de son sommet. */
  nettete: number;
  /**
   * Le relief du sommet sur le fond du spectre de modulation : son rapport à la MÉDIANE des points
   * de la bande, là où `nettete` le rapporte à leur moyenne.
   *
   * C'EST LUI QUI DÉCIDE SI UN DÉBIT EXISTE, et la netteté ne pouvait pas le faire : un train
   * d'impulsions porte son débit ET tous ses harmoniques, qui relèvent la moyenne autant que le
   * sommet. Relevé sur les témoins, la netteté ne laisse qu'un facteur 1,9 entre un bruit à bande
   * (3,04) et le roulement le plus lent (8,14) ; le relief en laisse 11,3, de 5,12 à 57,72.
   */
  relief: number;
  /** L'harmonicité de la porteuse, de 0 à 1. */
  harmonicite: number;
  /** Quand `espece` vaut « aucun », lequel des quatre cas. `null` sinon. */
  absence: Absence | null;
}

/** Les bornes du spectre de modulation retenues, en hertz. */
export const DEBIT_MIN = 2;
export const DEBIT_MAX = 120;

/** Au-delà de cette profondeur de modulation, l'entretien est tenu pour une suite de percussions. */
export const SEUIL_PROFOND = 0.5;
/** Au-dessus de ce seuil d'harmonicité, un entretien continu est tenu pour une résonance. */
export const SEUIL_HARMONIQUE = 0.5;

/**
 * Le relief minimal d'un sommet pour qu'on en déclare le débit.
 *
 * POSÉ SUR UNE MARGE MESURÉE : les deux entretiens sans pic du relevé donnent 3,66 pour le
 * frottement et 5,12 pour un souffle à bande mouvante, et le roulement le plus lent, à huit chocs
 * par seconde, donne 57,72. Le seuil est la moyenne géométrique de 5,12 et 57,72, soit un facteur
 * trois de chaque côté.
 */
export const SEUIL_RELIEF = 16;

/**
 * Sous cette profondeur de modulation, un entretien harmonique est une TENUE LISSE : le grain nul.
 *
 * POSÉ SUR UNE MARGE MESURÉE, et c'est la plus étroite des trois : les tenues sans grain montent à
 * 0,0307 pour une dent de scie, et la plus faible scintillation qu'on veuille encore tenir pour un
 * grain, un battement à 100 Hz, descend à 0,062. Le facteur n'est que de deux, parce que le suiveur
 * d'enveloppe atténue les débits qui approchent sa coupure. Le seuil se règle.
 *
 * IL NE S'APPLIQUE QU'AUX ENTRETIENS HARMONIQUES, et c'est la raison même : le grain compact ne
 * vient pas d'une modulation d'enveloppe mais du bruit de la matière, de sorte que la profondeur
 * n'en dit rien. Un bruit presque blanc descend à 0,0491, soit à un dixième au-dessus du seuil : il
 * n'y a donc PAS de marge de ce côté, et l'exemption de l'harmonicité n'est pas un confort mais ce
 * qui tient le grain compact hors d'atteinte du seuil.
 */
export const SEUIL_TENUE = 0.045;

/**
 * Sous ce débit, la modulation d'un entretien continu est une ALLURE et non un grain, en hertz.
 *
 * SCHAEFFER NE DONNE AUCUN CHIFFRE, et il faut le dire : la frontière retenue est celle que la
 * psychoacoustique mesure à la même place. La force de fluctuation de Zwicker et Fastl, qui est la
 * sensation d'une modulation qu'on SUIT, culmine vers 4 Hz et s'éteint vers 20 ; la rugosité, qui
 * est la sensation d'une modulation devenue TEXTURE, part de là et culmine vers 70. Les deux
 * critères du Traité se partagent donc la même bande que ces deux sensations, et au même endroit.
 *
 * CE SEUIL NE TOUCHE PAS LE GRAIN D'ITÉRATION, qui reste mesuré jusqu'à `DEBIT_MIN` : un roulement
 * lâche à huit chocs par seconde est bien une itération, parce qu'entre deux chocs l'enveloppe
 * RETOMBE. C'est la profondeur qui le dit, et elle passe avant.
 */
export const SEUIL_ALLURE = 20;

/**
 * L'ordre du passe-bas qui suit l'enveloppe : quatre cellules d'ordre un en cascade.
 *
 * Une seule cellule ne suffit pas. Le carré d'une porteuse à `f` porte un résidu à `2f`, qu'il faut
 * éteindre sans toucher aux débits cherchés, c'est-à-dire sur l'écart de `DEBIT_MAX` à `2f`
 * seulement. Pour la porteuse la plus basse qu'on veuille servir, cet écart ne fait pas deux
 * octaves : un ordre un y laisserait un quart du résidu.
 */
const ORDRE_SUIVEUR = 4;

/**
 * L'enveloppe du son : le carré, suivi d'un passe-bas, puis décimé.
 *
 * LA CADENCE DOIT COUVRIR LE DÉBIT CHERCHÉ : à deux fois `DEBIT_MAX`, le spectre de modulation
 * s'arrête juste où le relevé s'arrête, ce qui est la condition de Nyquist appliquée à l'enveloppe
 * et non au son.
 *
 * CE N'EST PLUS UNE VALEUR EFFICACE PAR TRAME, ET C'EST UN DÉFAUT CORRIGÉ. La première version
 * prenait la valeur efficace sur des trames jointives de la longueur du pas, soit 4,1 ms à 16 kHz.
 * Une telle moyenne ONDULE dès que la trame ne couvre pas un nombre entier de périodes de la
 * porteuse, et l'ondulation n'est pas petite : un SINUS PUR À 55 Hz, qui n'a aucun grain,
 * ressortait avec une profondeur de 0,3715 quand le frottement témoin est à 0,1453. Le son le plus
 * lisse du relevé s'annonçait comme le plus grainé.
 *
 * ALLONGER LA TRAME NE LE CORRIGEAIT PAS, et c'est ce que la mesure a tranché : à quatre pas de
 * long, le faux grain du sinus de 55 Hz tombe à 0,0163, mais un vrai battement à 100 Hz tombe à
 * 0,012 — le faux reste au-dessus du vrai. Une moyenne glissante atténue les deux ensemble, parce
 * qu'elle ne distingue pas la porteuse de sa modulation.
 *
 * LE FILTRE, LUI, LES DISTINGUE, parce que le carré les sépare en fréquence : la modulation reste
 * où elle est, la porteuse part à `2f`. Il suffit alors de couper au-dessus de `DEBIT_MAX`. La
 * limite devient celle de la méthode, et elle se dit : UN GRAIN NE SE MESURE QUE SOUS LA PORTEUSE
 * QUI LE PORTE. Une porteuse à 220 Hz laisse son résidu à 440 Hz, soit près de deux octaves
 * au-dessus de la coupure ; une porteuse à 55 Hz le laisse à 110 Hz, c'est-à-dire DANS la bande des
 * débits, et aucun filtrage ne l'en sortira. `porteuseSuffisante` donne ce seuil, et le relevé le
 * déclare au lieu de rendre un chiffre faux.
 */
export function enveloppe(
  x: Float32Array, sampleRate: number, coupure = DEBIT_MAX,
): { valeurs: Float64Array; cadence: number } {
  const cadence = 2 * coupure;
  const saut = Math.max(1, Math.round(sampleRate / cadence));
  // Le coefficient d'une cellule d'ordre un coupant à la coupure, posé sur la cadence du son.
  const a = 1 - Math.exp((-2 * Math.PI * coupure) / sampleRate);
  const etats = new Float64Array(ORDRE_SUIVEUR);
  const n = Math.floor(x.length / saut);
  const valeurs = new Float64Array(Math.max(1, n));
  // LE FILTRE TOURNE SUR TOUT LE SON, LA DÉCIMATION NE PREND QUE LA SORTIE : décimer avant de
  // filtrer replierait le résidu de la porteuse dans la bande au lieu de l'en sortir.
  for (let i = 0; i < x.length; i++) {
    let v = x[i] * x[i];
    for (let c = 0; c < ORDRE_SUIVEUR; c++) {
      etats[c] += a * (v - etats[c]);
      v = etats[c];
    }
    const t = i / saut;
    if (Number.isInteger(t) && t < n) valeurs[t] = Math.sqrt(Math.max(0, v));
  }
  return { valeurs, cadence: sampleRate / saut };
}

/**
 * Combien de fois la porteuse doit passer `debitMax` pour qu'un grain s'y mesure.
 *
 * LE FACTEUR EST RELEVÉ, NON CALCULÉ, et c'est la seule honnête façon de le poser. Le carré d'un
 * son harmonique porte les différences entre ses partiels, dont la plus basse est `f0` lui-même ;
 * repliée par la décimation, elle tombe TOUJOURS dans la bande des débits, quelle que soit `f0`.
 * Ce n'est donc pas sa place qui protège, c'est l'atténuation que le suiveur lui applique, laquelle
 * ne dépend que de l'écart de `f0` à la coupure.
 *
 * Relevé sur un son de cinq partiels, la profondeur de cet artefact passe sous le seuil de tenue
 * entre `f0` de 180 Hz, où elle vaut 0,0495, et 220 Hz, où elle vaut 0,0274 ; le seuil est à 0,045.
 * La frontière est donc à 1,6 fois la coupure, soit 192 Hz pour une bande de 120.
 */
export const PORTEUSE_SUR_DEBIT = 1.6;

/**
 * La porteuse est-elle assez haute pour qu'un grain s'y mesure, pour cette bande de débits ?
 *
 * UNE PREMIÈRE VERSION DEMANDAIT SEULEMENT QUE `2f` PASSE LA CADENCE, et c'était faux de tout son
 * harmonique : elle ne regardait que le résidu d'un SINUS, qui est à `2f`, et laissait passer celui
 * de `f0`, qui est plus bas donc moins atténué. Un la₂ de cinq partiels, à 110 Hz, ressortait ainsi
 * avec un grain harmonique de débit 110,1 Hz, qui est le repliement de sa propre fondamentale. De
 * 110 à 180 Hz, toute note tenue recevait un grain fabriqué.
 */
export const porteuseSuffisante = (porteuse: number, debitMax = DEBIT_MAX): boolean =>
  porteuse > PORTEUSE_SUR_DEBIT * debitMax;

/** La taille de la transformée qui cherche la partielle dominante. */
const TAILLE_PARTIELLE = 4096;

/**
 * La partielle la plus forte du son, en hertz, ou zéro si le son est trop court.
 *
 * ELLE SERT À DÉMASQUER UN FAUX GRAIN, et c'est le suiveur de hauteur qui ne pouvait pas le faire :
 * son plancher est à 55 Hz, et il ne peut pas descendre. Relevé à `fMin` de 30, il range un bruit à
 * bande comme voisé à 0,525, c'est-à-dire au-dessus du seuil d'harmonicité — le frottement témoin
 * deviendrait une résonance. Une porteuse de 55 Hz ou moins lui est donc invisible, et c'est
 * exactement celle dont le résidu tombe dans la bande des débits.
 *
 * La partielle dominante, elle, se lit sans plancher. Le relevé est pris au milieu du son, sur une
 * seule transformée : il ne s'agit pas de décrire le spectre mais de savoir où est le gros de
 * l'énergie.
 */
export function partielleDominante(x: Float32Array, sampleRate: number): number {
  if (x.length < TAILLE_PARTIELLE) return 0;
  const de = Math.floor((x.length - TAILLE_PARTIELLE) / 2);
  const re = new Float64Array(TAILLE_PARTIELLE);
  const im = new Float64Array(TAILLE_PARTIELLE);
  const w = fenetreHann(TAILLE_PARTIELLE);
  for (let k = 0; k < TAILLE_PARTIELLE; k++) re[k] = x[de + k] * w[k];
  fft(re, im, false);
  let sommet = 1;
  for (let k = 1; k < TAILLE_PARTIELLE / 2; k++) {
    if (Math.hypot(re[k], im[k]) > Math.hypot(re[sommet], im[sommet])) sommet = k;
  }
  return (sommet * sampleRate) / TAILLE_PARTIELLE;
}

/**
 * Le débit relevé n'est-il que le résidu de la porteuse, c'est-à-dire un faux grain ?
 *
 * LE CARRÉ D'UNE PORTEUSE À `f` TOMBE À `2f` : si la porteuse est trop grave pour que le suiveur
 * l'écarte, c'est ce résidu qu'on relève et on l'annonce comme un grain. Un SINUS PUR À 55 Hz, qui
 * n'a par construction aucun grain, ressortait ainsi avec une profondeur de 0,1435 — du même ordre
 * que le frottement témoin.
 *
 * La reconnaissance tient en deux conditions jointes : la porteuse ne passe pas `porteuseSuffisante`,
 * ET le débit relevé vaut le double de cette porteuse. Les deux sont nécessaires. Sans la seconde,
 * on refuserait un grain porté par un bruit grave, qui est légitime ; sans la première, on
 * refuserait une modulation qui se trouve valoir deux fois une partielle, par coïncidence.
 */
export const residuDePorteuse = (
  debit: number, porteuse: number, cadence: number, debitMax = DEBIT_MAX, tolerance = 3,
): boolean =>
  !porteuseSuffisante(porteuse, debitMax)
  && porteuse > 0
  && Math.abs(debit - residuReplie(porteuse, cadence)) <= tolerance;

/**
 * Où le résidu d'une porteuse apparaît DANS LA BANDE, une fois l'enveloppe décimée, en hertz.
 *
 * LE RÉSIDU NE RESTE PAS À `2f`, ET LE CROIRE A FAIT PASSER LA GARDE À CÔTÉ. L'enveloppe est
 * décimée à `2 × debitMax`, de sorte qu'un résidu au-dessus de cette cadence s'y REPLIE. Un sinus
 * pur à 70 Hz laisse son résidu à 140 Hz, qui se replie à 240 − 140 = 100 : le débit relevé valait
 * 98,9 Hz, et la garde, qui cherchait 140, ne reconnaissait rien.
 *
 * La formule se vérifie porteuse par porteuse, et elle tombe juste à chaque fois : 40 Hz donne 80,
 * 55 donne 110, 70 donne 100, 90 donne 60, 110 donne 20, 150 donne 60, 220 donne 40.
 */
export const residuReplie = (porteuse: number, cadence: number): number =>
  imagesDePorteuse(porteuse, cadence)[1] ?? 0;

/**
 * Ce que le suiveur laisse passer d'une modulation à ce débit, de 0 à 1.
 *
 * LA PROFONDEUR RELEVÉE EST CELLE QUE LE FILTRE A LAISSÉE, non celle du son, et il faut en tenir
 * compte quelque part. Les quatre cellules coupent à `debitMax` : une modulation à 70 Hz pour une
 * bande de 120 ne ressort qu'à 0,56 de sa profondeur, et une à 100 Hz à 0,35.
 *
 * C'EST LE SEUIL QUI SUIT CETTE RÉPONSE, ET NON LA PROFONDEUR QUI EST CORRIGÉE. Corriger la
 * profondeur la ferait passer un, et le creux sur la crête tient dans zéro à un par construction :
 * c'est précisément ce qui l'a fait choisir contre l'écart type, qu'un plafond détruisait. Le seuil,
 * lui, n'a pas de borne à respecter.
 *
 * LES CAS NE POUVAIENT PAS LE VOIR : ils éprouvaient le plancher sur des tenues lisses et sur des
 * scintillations à 25 et 40 Hz, où la réponse vaut encore 0,92 et 0,81. Relevé à quinze pour cent
 * de profondeur de modulation, qui est le régime où le plancher décide : 0,0750 à 10 Hz et 0,0609 à
 * 40, mais 0,0427 à 70 et 0,0276 à 100, c'est-à-dire sous un plancher nu de 0,045. Deux vrais
 * grains annoncés comme des tenues lisses.
 *
 * ET LE CHIFFRE QUI M'A MIS SUR LA PISTE NE PROUVAIT RIEN, ce qu'il faut dire : un essai dans
 * l'application donnait 0,04 à 70 Hz, mais sa formule avait une crête de 1,83, donc elle ÉCRÊTAIT,
 * et l'écrêtage aplatit l'enveloppe autant que le filtre. C'est le relevé propre ci-dessus qui
 * établit la correction, non celui-là.
 */
export const gainDuSuiveur = (debit: number, debitMax = DEBIT_MAX): number =>
  Math.pow(1 / Math.sqrt(1 + (debit / debitMax) ** 2), ORDRE_SUIVEUR);

/**
 * De combien la seconde enveloppe hausse sa coupure, donc sa cadence.
 *
 * C'EST LE DISCRIMINANT EXACT ENTRE UNE MODULATION ET UN RÉSIDU, et il a fallu deux tentatives
 * manquées pour le trouver. Une vraie modulation de l'enveloppe est à la MÊME fréquence quelle que
 * soit la cadence à laquelle on relève cette enveloppe : c'est une propriété du son. Un résidu de
 * porteuse, lui, n'est pas dans l'enveloppe du tout, il y est REPLIÉ par la décimation, et la place
 * où il retombe dépend de la cadence. Relever deux fois à deux cadences et ne garder que ce qui ne
 * bouge pas sépare donc les deux par construction.
 *
 * Exemple du cas qui résistait : une porteuse harmonique de 220 Hz laisse sa plus basse trace à
 * 18,8 Hz pour une cadence de 238,8, et à 80 Hz pour une cadence de 300. Une modulation réelle à
 * 40 Hz est à 40 dans les deux.
 *
 * LE FACTEUR EST UN QUART, et il n'est pas quelconque. Il doit déplacer les images sans sortir les
 * débits cherchés de la bande de la seconde enveloppe, dont la coupure monte d'autant ; et il ne
 * doit pas être un rapport simple comme deux, qui replierait certaines images à la même place.
 */
const HAUSSE_TEMOIN = 1.25;

/** Combien de multiples de la porteuse on replie dans la bande. */
const IMAGES_DE_PORTEUSE = 4;

/**
 * Toutes les places où une porteuse laisse une trace dans la bande des débits, en hertz.
 *
 * `residuReplie` NE SUFFIT PAS, ET LE RELEVÉ L'A MONTRÉ. Elle replie `2f`, ce qui est juste d'un
 * SINUS : son carré ne contient que du continu et du `2f`. Mais le carré d'un son HARMONIQUE
 * contient en outre toutes les différences entre ses partiels, c'est-à-dire tous les multiples de
 * `f0`, et le plus bas d'entre eux est `f0` lui-même.
 *
 * C'est ce que la mesure a trouvé : une dent de scie et cinq harmoniques à 220 Hz annonçaient tous
 * deux un débit de 18,7 Hz, qui est le repliement de 220 à la cadence de 240, soit 20 Hz, au bin
 * près. Un sinus pur à 220 Hz, lui, annonçait 37,3 Hz, qui est le repliement de 440. Les deux
 * familles de trace existent donc, et les deux doivent être écartées.
 */
export function imagesDePorteuse(porteuse: number, cadence: number): number[] {
  if (!(porteuse > 0) || !(cadence > 0)) return [];
  const images: number[] = [];
  for (let k = 1; k <= IMAGES_DE_PORTEUSE; k++) {
    const r = (k * porteuse) % cadence;
    images.push(r > cadence / 2 ? cadence - r : r);
  }
  return images;
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
  /** Relief minimal du sommet sur la médiane de la bande pour qu'un débit soit déclaré. */
  seuilRelief?: number;
  /** Sous cette profondeur, un entretien harmonique est une tenue lisse. */
  seuilTenue?: number;
  /** Sous ce débit, la modulation d'un entretien continu est une allure, en hertz. */
  seuilAllure?: number;
}

export function grainSchaefferien(
  x: Float32Array, sampleRate: number, o: OptionsGrain = {},
): GrainSchaefferien {
  const vide: GrainSchaefferien = {
    espece: "aucun", debit: null, profondeur: 0, nettete: 0, relief: 0, harmonicite: 0,
    absence: "silence",
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

  // LE RELIEF EST PRIS SUR LA MÉDIANE DE LA BANDE, et c'est lui qui dira si un débit existe. La
  // médiane se moque des harmoniques du débit, qui sont peu nombreux ; la moyenne, non.
  const bande = Array.from(bins.subarray(premier, dernier + 1)).sort((p, q) => p - q);
  const mediane = bande[Math.floor(bande.length / 2)];
  const relief = mediane > 0 ? bins[sommet] / mediane : 0;

  // LE DÉBIT EST LE PLUS BAS SOMMET FRANC, ET NON LE PLUS HAUT. Un roulement est un train
  // d'impulsions brèves : son spectre de modulation porte le débit ET TOUS SES HARMONIQUES à des
  // hauteurs voisines, jusqu'à ce que le spectre d'un choc décline. Le plus haut sommet tombe donc
  // sur n'importe lequel d'entre eux : relevé sur huit chocs par seconde, il rendait 15,9 Hz,
  // c'est-à-dire le second. Le plus bas qui atteigne sept dixièmes du maximum est le débit lui-même.
  // ET LA TRACE DE LA PORTEUSE EST ÉCARTÉE PAR UN SECOND RELEVÉ, à une autre cadence. Deux
  // tentatives ont manqué avant celle-là, et les trois valent d'être dites, parce qu'elles disent ce
  // que le défaut est.
  //
  // LE PROBLÈME. Le carré d'un son harmonique porte toutes les différences entre ses partiels, qui
  // se replient dans la bande : une porteuse de 218,75 Hz à la cadence de 238,806 laisse sa plus
  // basse trace à 20,06 Hz. Comme la recherche prend le PLUS BAS sommet franc, cette trace peut la
  // gagner : un peigne de modulation à 40 Hz ressortait à 18,7 Hz.
  //
  // PREMIÈRE TENTATIVE, ÉCARTER LES IMAGES PAR LEUR FRÉQUENCE : elle coûte plus que le défaut. Les
  // images d'une porteuse sont un PEIGNE de pas égal à la plus basse, 20,06, 40,11, 60,17, 80,22, et
  // ce pas est du même ordre que les débits cherchés. Relevé : sur ce même peigne à 40 Hz,
  // l'exclusion écartait le VRAI sommet à 40,11 Hz comme une trace.
  //
  // SECONDE, LAISSER FAIRE EN BORNANT LE DÉFAUT : la trace ne peut pas FABRIQUER un grain, sa
  // profondeur de 0,0274 sur cinq harmoniques à 220 Hz restant sous le seuil de tenue de 0,045. Mais
  // elle fausse le débit d'une modulation dont la profondeur est juste au-dessus du seuil.
  //
  // CE QUI TRANCHE : UNE MODULATION NE DÉPEND PAS DE LA CADENCE, UN REPLIEMENT SI. Une vraie
  // modulation de l'enveloppe est à la même fréquence quelle que soit la cadence à laquelle on
  // relève cette enveloppe, parce qu'elle est dans le son. Un résidu de porteuse n'est pas dans
  // l'enveloppe du tout : il y est replié par la décimation, et sa place dépend de la cadence. La
  // trace de 220 Hz est à 18,8 Hz pour une cadence de 238,8 et à 80 Hz pour une cadence de 300 ; une
  // modulation à 40 Hz est à 40 dans les deux. Le second relevé ne sert qu'à CONFIRMER, de sorte que
  // les grandeurs publiées restent celles du premier.
  const temoin = spectreDeModulation(
    ...((e) => [e.valeurs, e.cadence] as const)(enveloppe(tenu, sampleRate, (o.debitMax ?? DEBIT_MAX) * HAUSSE_TEMOIN)),
  );
  const confirme = (hz: number): boolean => {
    const t = Math.round(hz / temoin.parBin);
    if (t < 1 || t >= temoin.bins.length) return false;
    // À un point près de chaque côté, les deux spectres n'ayant pas le même pas.
    let crete = 0;
    for (let k = 1; k < temoin.bins.length; k++) if (temoin.bins[k] > crete) crete = temoin.bins[k];
    for (let k = Math.max(1, t - 1); k <= Math.min(temoin.bins.length - 1, t + 1); k++) {
      if (temoin.bins[k] >= 0.3 * crete) return true;
    }
    return false;
  };

  let rang = sommet;
  let confirmeUnSommet = false;
  for (let k = premier; k <= dernier; k++) {
    if (bins[k] < 0.7 * bins[sommet]) continue;
    if (k > premier && bins[k] < bins[k - 1]) continue;
    if (k < dernier && bins[k] < bins[k + 1]) continue;
    if (!confirme(k * parBin)) continue;
    rang = k;
    confirmeUnSommet = true;
    break;
  }
  const debitBrut = rang * parBin;

  const porteuse = partielleDominante(tenu, sampleRate);

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

  const socle = { profondeur, nettete, relief, harmonicite };

  // LES DEUX AXES DÉCIDENT, ET DANS CET ORDRE, qui est celui des trois modes d'entretien. La
  // profondeur sépare d'abord l'entretien par percussions répétées des deux continus ; l'harmonicité
  // sépare ensuite ces deux-là.
  //
  // LA PROFONDEUR PASSE AVANT TOUT CE QUI SUIT, et ce n'est pas un détail d'ordre : les quatre
  // refus ne valent que pour un entretien CONTINU. Un roulement lâche à huit chocs par seconde est
  // une itération quoi qu'il arrive, parce qu'entre deux chocs l'enveloppe retombe ; ni la lenteur
  // de son débit, ni la gravité de sa matière n'en font autre chose.
  //
  // ET SON DÉBIT EST DÉCLARÉ SANS CONDITION DE RELIEF, ce qui est le second enseignement du relevé.
  // Le relief d'un train d'impulsions S'ÉCROULE quand son débit baisse, parce que son peigne
  // d'harmoniques se resserre dans la bande et relève la médiane : 59,5 à huit chocs par seconde,
  // 18,2 à six, 7,9 à quatre, 4,3 à deux. Une garde de relief posée là aurait donc étouffé le débit
  // le plus franc qui soit, celui d'un roulement qu'on compte à l'oreille. Une profondeur de un dit
  // que l'enveloppe retombe entre deux événements : il y a donc des événements, donc un débit.
  if (profondeur >= (o.seuilProfond ?? SEUIL_PROFOND)) {
    return { ...socle, debit: debitBrut, espece: "discontinu", absence: null };
  }

  // SUR UN ENTRETIEN CONTINU, LE DÉBIT N'EXISTE QUE S'IL Y A UN SOMMET, et deux conditions le
  // disent. Sans RELIEF, le « sommet » d'un spectre plat est le hasard du bruit : le frottement
  // témoin rendait ainsi 2,80 Hz. Et sans CONFIRMATION à l'autre cadence, le sommet est un
  // repliement et non une modulation : une tenue lisse rendait ainsi 18,66 Hz, qui est la trace de
  // sa propre porteuse.
  const debit = relief >= (o.seuilRelief ?? SEUIL_RELIEF) && confirmeUnSommet ? debitBrut : null;
  const mesures = { ...socle, debit };

  const harmonique = harmonicite >= (o.seuilHarmonique ?? SEUIL_HARMONIQUE);
  const assez = porteuseSuffisante(porteuse, o.debitMax ?? DEBIT_MAX);

  // UNE PORTEUSE TROP GRAVE NE PORTE PAS DE GRAIN MESURABLE, ET DEUX ROUTES LE DISENT.
  //
  // LA PREMIÈRE EST L'HARMONICITÉ, et elle vaut du cas le plus courant : un son harmonique dont la
  // fondamentale est trop basse. Sa propre fondamentale se replie dans la bande, et la mesure n'est
  // plus que cet artefact. De 110 à 180 Hz, toute note tenue ressortait grainée.
  //
  // LA SECONDE EST LA COÏNCIDENCE DU DÉBIT AVEC UNE IMAGE, et elle est nécessaire parce que la
  // première ne voit pas tout : le suiveur de hauteur a un plancher à 55 Hz, et un sinus de 55 Hz
  // lui est donc INVISIBLE, son harmonicité ressortant à zéro. Il reste reconnaissable à ceci que
  // son débit relevé, 110,1 Hz, tombe sur le repliement de sa porteuse à 0,1 Hz près.
  if (!assez && (harmonique || (debit !== null && residuDePorteuse(debit, porteuse, cadence, o.debitMax ?? DEBIT_MAX)))) {
    return { ...mesures, espece: "aucun", absence: "porteuse" };
  }

  // LA TENUE LISSE EST LE GRAIN NUL, et le seuil ne porte que sur l'entretien harmonique : le grain
  // compact ne vient pas d'une modulation d'enveloppe mais du bruit de la matière.
  //
  // ET LE SEUIL SUIT LA RÉPONSE DU SUIVEUR AU DÉBIT RELEVÉ, sans quoi il mord sur les débits
  // rapides, que le filtre atténue : voir `gainDuSuiveur`.
  const plancher = (o.seuilTenue ?? SEUIL_TENUE)
    * (debit === null ? 1 : gainDuSuiveur(debit, o.debitMax ?? DEBIT_MAX));
  if (harmonique && profondeur < plancher) {
    return { ...mesures, espece: "aucun", absence: "tenue" };
  }

  // ET UNE MODULATION TROP LENTE EST UNE ALLURE, qui est un critère de forme et non de matière.
  if (debit !== null && debit < (o.seuilAllure ?? SEUIL_ALLURE)) {
    return { ...mesures, espece: "aucun", absence: "allure" };
  }

  return { ...mesures, espece: harmonique ? "harmonique" : "compact", absence: null };
}
