// audio/particules.ts — L'orchestre Csound du modèle unifié de Brandtsegg, écrit argument par
// argument.
//
// POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST FAIT AINSI. L'opcode `partikkel` prend QUARANTE
// arguments obligatoires — et deux facultatifs par-dessus, qu'on ne donne pas ici. Trois
// tentatives passées ont été refusées par le compilateur avant qu'on renonce à le publier, et la
// trace en est restée dans `csound-opcodes.ts`. Le défaut n'était pas la difficulté du procédé
// mais l'écriture de sa liste : une virgule de trop, un taux qui ne tombe pas juste, et Csound
// répond « Unable to find opcode entry for 'partikkel' with matching argument types » sans dire
// lequel des quarante est en cause.
//
// La liste est donc écrite ICI comme une suite de paires nom-valeur, dans l'ordre exact du manuel,
// et un test la compare à cet ordre. Une erreur de rang ne peut plus passer en silence : elle
// devient un échec de test qui nomme l'argument fautif.
//
// LES DEUX PIÈGES, POUR QUE PERSONNE NE LES REDÉCOUVRE.
//
//  1. SIX ARGUMENTS SONT À TAUX AUDIO — `async`, `awavfm` et les quatre `asamplepos`. Une
//     constante y est refusée : il faut une variable a-rate, d'où le `azero init 0`. La fréquence
//     de grains, elle, se convertit du taux de contrôle par `interp`.
//  2. LES TABLES DE MASQUES COMMENCENT À L'INDICE 2. L'indice 0 porte le début de boucle et
//     l'indice 1 la FIN, c'est-à-dire le rang de la dernière valeur ; les valeurs suivent. Deux
//     mesures fausses sont sorties de ces deux nombres. Sans les bornes, deux mélanges de formes
//     d'onde supposés opposés rendaient exactement le même son. Avec une fin à 1 sur une table
//     d'une seule valeur, un grain sur deux lisait le remplissage — donc zéro — et le centroïde
//     d'un glisson MONTANT descendait comme celui d'un glisson descendant.
//
// CE QUE LE MODÈLE UNIFIÉ APPORTE, et qui justifie un nœud plutôt que six : grains, pulsars,
// glissons, trainlets et granulation d'un son enregistré — sur une grille ou calée sur sa période
// — sont le MÊME générateur, réglé autrement.
// On passe de l'un à l'autre en changeant un choix, et l'on entend ce qui les sépare — ce qu'une
// collection de cinq nœuds séparés ne montre jamais.
//
// ET L'ESPACE SE RÈGLE AU GRAIN, ce qu'aucun autre nœud du catalogue ne fait : l'ampleur, la
// largeur stéréo et l'ambisonique traitent le son entier, là où le masque de canal donne à chaque
// grain sa propre place. C'est la différence entre un nuage et une direction.
//
// D'après Øyvind Brandtsegg, Sigurd Saue et Thom Johansen, « Particle synthesis — a unified model
// for granular synthesis », Linux Audio Conference, 2011.

import { creerAleatoire } from "../core/hasard";

/** Les six espèces de particules que le même générateur sait produire. */
export const ESPECES = [
  { id: "grains", fr: "Grains", en: "Grains" },
  { id: "pulsars", fr: "Pulsars", en: "Pulsars" },
  { id: "glissons", fr: "Glissons", en: "Glissons" },
  { id: "trainlets", fr: "Trainlets", en: "Trainlets" },
  { id: "granulation", fr: "Granulation d'un son", en: "Granulating a sound" },
  { id: "synchrone", fr: "Granulation synchrone", en: "Pitch-synchronous granulation" },
] as const;

export type Espece = (typeof ESPECES)[number]["id"];

export const EST_ESPECE = (x: string): x is Espece => ESPECES.some((e) => e.id === x);

export interface ReglagesParticules {
  espece: Espece;
  /** Grains par seconde. */
  densite: number;
  /** Durée d'un grain, en pour-cent de la période qui sépare deux grains. */
  dureeGrainPc: number;
  /** Fréquence de la forme d'onde dans le grain, en hertz. Le formant, pour un pulsar. */
  frequenceHz: number;
  /** Demi-tons : le balayage d'un glisson, la transposition d'une granulation. */
  transposition: number;
  /** Partiels d'un trainlet. */
  partiels: number;
  /** Désordre des instants, en pour-cent de la période. */
  dispersionPc: number;
  /** Éparpillement des grains entre les deux canaux, en pour-cent. Zéro les met tous au centre. */
  largeurPc: number;
  /** Où lire dans le son branché, en pour-cent de sa durée. */
  positionPc: number;
  /** Vitesse d'avance de la tête de lecture : 0 fige le son, 1 le lit à sa vitesse. */
  vitesse: number;
  dureeSec: number;
  volumePc: number;
  graine: number;
  /** Vrai quand un son est branché et écrit sous « entree1.wav ». */
  avecSource: boolean;
  /**
   * Les hauteurs du son branché, en hertz, une par case, déjà comblées — voir `hauteursPourTable`.
   * L'analyse se fait dans le nœud, avec le suiveur du catalogue ; ce module ne fait que l'écrire.
   */
  hauteurs?: readonly number[];
}

/** Combien de hauteurs la table porte. Une case pour vingt millisecondes sur un son de cinq secondes. */
export const CASES_HAUTEUR = 256;

/** La hauteur employée quand le son n'en tient aucune, en hertz. */
export const HAUTEUR_DEFAUT = 110;

/** Le nom du fichier que le nœud Csound écrit pour l'entrée audio. */
export const FICHIER_SOURCE = "entree1.wav";

/**
 * Les quarante arguments obligatoires de `partikkel`, dans l'ordre du manuel.
 *
 * Exporté pour que le test puisse vérifier l'ordre et le compte sans relire une chaîne : c'est
 * cette liste, et elle seule, qui a coûté trois tentatives.
 */
export const NOMS_ARGUMENTS = [
  "agrainfreq", "kdistribution", "idisttab", "async", "kenv2amt", "ienv2tab", "ienv_attack",
  "ienv_decay", "ksustain_amount", "ka_d_ratio", "kduration", "kamp", "igainmasks", "kwavfreq",
  "ksweepshape", "iwavfreqstarttab", "iwavfreqendtab", "awavfm", "ifmamptab", "kfmenv", "icosine",
  "ktraincps", "knumpartials", "kchroma", "ichannelmasks", "krandommask", "kwaveform1",
  "kwaveform2", "kwaveform3", "kwaveform4", "iwaveamptab", "asamplepos1", "asamplepos2",
  "asamplepos3", "asamplepos4", "kwavekey1", "kwavekey2", "kwavekey3", "kwavekey4", "imax_grains",
] as const;

/** Les arguments qui exigent une variable à taux audio, et refusent une constante. */
export const ARGUMENTS_AUDIO = ["agrainfreq", "async", "awavfm", "asamplepos1", "asamplepos2", "asamplepos3", "asamplepos4"] as const;

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const nombre = (v: number, defaut = 0) => (Number.isFinite(v) ? v : defaut);

/** Un nombre écrit pour Csound : point décimal, jamais de notation exponentielle. */
export function csNombre(v: number): string {
  const x = nombre(v);
  return (Math.round(x * 1e6) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
}

/**
 * Une table de masque : deux bornes de boucle, puis les valeurs.
 *
 * `-2` en numéro de générateur veut dire « ces valeurs, telles quelles, sans normalisation » — une
 * normalisation ramènerait le plus grand à un et changerait tous les rapports.
 *
 * LA BORNE DE FIN EST LE RANG DE LA DERNIÈRE VALEUR, ET CE DÉTAIL A COÛTÉ UNE MESURE FAUSSE. Écrite
 * à 1 sur une table qui ne porte qu'une valeur, la boucle allait lire le rang 1 — c'est-à-dire le
 * remplissage, donc zéro. Un grain sur deux balayait alors vers rien : dans l'application, le
 * centroïde d'un glisson montant DESCENDAIT, exactement comme celui d'un glisson descendant.
 * `tailleGroupe` sert aux tables dont les valeurs vont par paquets — cinq pour les amplitudes,
 * quatre formes d'onde et un trainlet —, où la borne compte les paquets et non les valeurs.
 */
export function tableMasque(nom: string, valeurs: number[], tailleGroupe = 1): string {
  const taille = Math.max(8, 2 ** Math.ceil(Math.log2(valeurs.length + 2)));
  const remplissage = new Array(taille - valeurs.length - 2).fill(0);
  const fin = Math.max(0, Math.ceil(valeurs.length / tailleGroupe) - 1);
  return `${nom} ftgen 0, 0, ${taille}, -2, 0, ${fin}, ${[...valeurs, ...remplissage].map(csNombre).join(", ")}`;
}

/**
 * Où tombe chaque grain entre les deux canaux.
 *
 * LE MASQUE DE CANAL EST LU AU RYTHME DES GRAINS : un grain par valeur, puis la table recommence.
 * Seize positions suffisent à donner l'impression d'un éparpillement sans période audible — à
 * soixante grains par seconde, le cycle dure un quart de seconde et se perd dans la densité.
 *
 * Zéro met tout le monde au centre, et c'est la seule façon honnête de dire « pas de largeur » :
 * un masque absent enverrait tous les grains sur la sortie 1, c'est-à-dire à gauche.
 *
 * LES POSITIONS VONT PAR PAIRES MIROIR, et ce n'est pas un ornement. Un tirage libre laisse un
 * résidu : mesuré dans l'application, seize positions tirées indépendamment donnaient **0,72 dB
 * d'écart entre les canaux** à pleine ouverture — un déséquilibre qui s'entend comme un défaut de
 * réglage et non comme un espace. À chaque grain placé à gauche répond donc son jumeau à droite,
 * et l'équilibre est nul par construction plutôt que par chance.
 *
 * LA LOI DU TIRAGE POUSSE VERS LES BORDS. Un tirage uniforme laisse la plupart des grains près du
 * centre — l'écart moyen ne vaut que le quart de la largeur — et la largeur promise n'arrive
 * jamais. La racine carrée redresse la loi : son écart moyen vaut les deux tiers, ce qui rend le
 * réglage lisible d'un bout à l'autre de sa course.
 *
 * Les valeurs vont de 0 à 1 pour deux sorties, la fraction mélangeant les deux voisines — c'est la
 * convention de l'opcode, où le nombre dit le rang du canal.
 */
export const POSITIONS_SPATIALES = 16;

export function positionsSpatiales(largeurPc: number, graine: number): number[] {
  const largeur = borne(nombre(largeurPc, 0), 0, 100) / 100;
  if (largeur <= 0) return new Array(POSITIONS_SPATIALES).fill(0.5);
  const tirage = creerAleatoire(Math.max(1, Math.round(nombre(graine, 42))));
  const positions: number[] = [];
  for (let i = 0; i < POSITIONS_SPATIALES / 2; i++) {
    const ecart = Math.sqrt(tirage()) * largeur / 2;
    // Les jumeaux se suivent : deux grains consécutifs partent de part et d'autre, ce qui
    // décorrèle davantage que deux voisins du même côté.
    positions.push(borne(0.5 - ecart, 0, 1), borne(0.5 + ecart, 0, 1));
  }
  return positions;
}

/**
 * De combien baisser l'amplitude pour que la largeur ne fasse pas monter le niveau.
 *
 * LA LOI DE PANORAMIQUE EST LINÉAIRE EN AMPLITUDE : un grain posé en p rend 1−p à gauche et p à
 * droite, dont la puissance totale vaut (1−p)² + p². Au centre cela fait un demi ; sur un bord,
 * un. Un éparpillement fait donc monter l'énergie sans qu'on ait rien demandé — **mesuré dans
 * l'application : +1,8 dB entre largeur nulle et pleine ouverture**, ce qui suffit à faire juger le
 * réglage « meilleur » pour la seule raison qu'il est plus fort. C'est la faute la plus commune
 * des effets de largeur, et celle que le nœud « Ampleur » avait déjà dû corriger.
 *
 * La compensation se calcule sur les positions elles-mêmes, et non sur une approximation du
 * réglage : elle vaut exactement un à largeur nulle, et la racine du rapport des puissances
 * ailleurs.
 */
export function compensationLargeur(positions: readonly number[]): number {
  if (positions.length === 0) return 1;
  const puissance = positions.reduce((s, p) => s + (1 - p) * (1 - p) + p * p, 0) / positions.length;
  return puissance > 0 ? Math.sqrt(0.5 / puissance) : 1;
}

/**
 * La courbe de hauteur, préparée pour Csound : comblée, puis ramenée à un nombre fixe de cases.
 *
 * COMBLER LES TROUS N'EST PAS UNE COMMODITÉ. Un suiveur de hauteur rend zéro partout où il ne tient
 * rien — les consonnes, les silences, les attaques —, et un zéro passé à un phaseur de
 * synchronisation ne le fait jamais reboucler : aucun grain ne serait déclenché, et ces passages
 * disparaîtraient purement du résultat. La dernière hauteur tenue est donc prolongée, et le début
 * emprunte la première qui vienne. Sans aucune hauteur du tout, on retombe sur une valeur écrite.
 */
export function hauteursPourTable(
  hauteurs: readonly number[], cases = CASES_HAUTEUR, defaut = HAUTEUR_DEFAUT,
): number[] {
  const utiles = [...hauteurs].map((h) => (Number.isFinite(h) && h > 0 ? h : 0));
  if (utiles.length === 0 || utiles.every((h) => h <= 0)) return new Array(cases).fill(defaut);
  // Prolonger la dernière hauteur tenue, puis remonter pour combler le début.
  let derniere = 0;
  for (let i = 0; i < utiles.length; i++) {
    if (utiles[i] > 0) derniere = utiles[i]; else utiles[i] = derniere;
  }
  let premiere = utiles.find((h) => h > 0) ?? defaut;
  for (let i = 0; i < utiles.length && utiles[i] <= 0; i++) utiles[i] = premiere;
  // Ramener à la taille de la table : une moyenne par case, ce qui lisse les trames fautives.
  const parCase = utiles.length / cases;
  return Array.from({ length: cases }, (_, i) => {
    const debut = Math.floor(i * parCase);
    const fin = Math.max(debut + 1, Math.floor((i + 1) * parCase));
    let somme = 0, n = 0;
    for (let j = debut; j < Math.min(fin, utiles.length); j++) { somme += utiles[j]; n++; }
    return n > 0 ? somme / n : defaut;
  });
}

/** Le rapport de fréquences d'un écart en demi-tons. */
export const rapportDemiTons = (demiTons: number): number => Math.pow(2, nombre(demiTons) / 12);

/** L'espèce effectivement jouable : sans son branché, la granulation n'a rien à granuler. */
export const especeTenable = (r: ReglagesParticules): Espece =>
  (r.espece === "granulation" || r.espece === "synchrone") && !r.avecSource ? "grains" : r.espece;

/** Ce que chaque espèce demande au générateur. */
interface Reglage { amplitudes: number[]; partiels: number; balayage: boolean; source: boolean }

function reglageEspece(espece: Espece): Reglage {
  switch (espece) {
    // Les amplitudes vont par cinq : les quatre formes d'onde, puis le trainlet.
    case "trainlets": return { amplitudes: [0, 0, 0, 0, 1], partiels: 1, balayage: false, source: false };
    case "glissons": return { amplitudes: [1, 0, 0, 0, 0], partiels: 0, balayage: true, source: false };
    case "granulation":
    case "synchrone": return { amplitudes: [1, 0, 0, 0, 0], partiels: 0, balayage: false, source: true };
    default: return { amplitudes: [1, 0, 0, 0, 0], partiels: 0, balayage: false, source: false };
  }
}

/**
 * L'orchestre complet.
 *
 * La durée du grain se compte en pour-cent de la période pour les grains et les trainlets — c'est
 * le recouvrement qui fait la texture. Pour un PULSAR, elle se compte en cycles de la forme d'onde,
 * et c'est toute la différence : la durée du pulsaret fixe alors le formant, indépendamment de la
 * cadence qui fixe la fondamentale. Régler les deux séparément est précisément ce qu'aucun
 * instrument acoustique ne permet.
 */
export function orchestreParticules(r: ReglagesParticules): string {
  const espece = especeTenable(r);
  const e = reglageEspece(espece);
  const densite = borne(nombre(r.densite, 60), 0.1, 2000);
  const frequence = borne(nombre(r.frequenceHz, 440), 1, 20000);
  const dureePc = borne(nombre(r.dureeGrainPc, 50), 1, 800);
  const dispersion = borne(nombre(r.dispersionPc, 0), 0, 100) / 100;
  const volume = borne(nombre(r.volumePc, 70), 0, 100) / 100;

  const tables = [
    "giSinus ftgen 0, 0, 65537, 10, 1",
    // Le cosinus des trainlets : le manuel exige au moins 2048 points et un générateur 9.
    "giCosinus ftgen 0, 0, 8193, 9, 1, 1, 90",
    // Une distribution uniforme pour le désordre des instants.
    "giDispersion ftgen 0, 0, 4096, 21, 1",
    tableMasque("giAmplitudes", e.amplitudes, 5),
  ];
  if (e.balayage) {
    tables.push(tableMasque("giDebut", [1]));
    tables.push(tableMasque("giFin", [rapportDemiTons(r.transposition)]));
  }
  if (e.source) {
    // Taille zéro : la table prend la longueur du fichier. Le canal 1 suffit, le nœud écrit du mono.
    tables.push(`giSource ftgen 0, 0, 0, 1, "${FICHIER_SOURCE}", 0, 0, 1`);
  }
  const positions = positionsSpatiales(r.largeurPc, r.graine);
  tables.push(tableMasque("giCanaux", positions));
  if (espece === "synchrone") {
    tables.push(`giHauteurs ftgen 0, 0, ${CASES_HAUTEUR}, -2, ${hauteursPourTable(r.hauteurs ?? []).map(csNombre).join(", ")}`);
  }

  const lignes: string[] = [
    "instr 1",
    `  kdensite = ${csNombre(densite)}`,
    "  agrainfreq interp kdensite",
    "  azero init 0",
  ];

  if (espece === "pulsars") {
    lignes.push(`  kduree = ${csNombre(dureePc / 100)} * 1000 / ${csNombre(frequence)}`);
  } else if (espece !== "synchrone") {
    // Le synchrone tire la sienne de la hauteur du son, plus bas, une fois celle-ci connue.
    lignes.push(`  kduree = ${csNombre(dureePc / 100)} * 1000 / kdensite`);
  }

  if (espece === "synchrone") {
    // LA CADENCE VIENT DU SON, ET NON D'UNE GRILLE. Le phaseur reboucle une fois par période et
    // rend une impulsion à chaque tour ; l'opcode déclenche un grain à chacune d'elles. La
    // fréquence de grains est alors mise à zéro, ce qui, dit le manuel, remet toute la cadence au
    // signal de synchronisation.
    lignes.push(`  kcase line 0, p3, ${CASES_HAUTEUR - 2}`);
    lignes.push("  khauteur tablei kcase, giHauteurs");
    lignes.push("  aphase, asynchro syncphasor khauteur, azero");
    lignes.push(`  kduree = ${csNombre(dureePc / 100)} * 1000 / khauteur`);
  }

  if (e.source) {
    lignes.push(`  idureeSource = ftlen(giSource) / sr`);
    lignes.push(`  idebut = ${csNombre(borne(nombre(r.positionPc, 0), 0, 100) / 100)}`);
    lignes.push(`  ifin limit idebut + ${csNombre(borne(nombre(r.vitesse, 1), -4, 4))} * p3 / idureeSource, 0, 1`);
    lignes.push("  asamplepos1 line idebut, p3, ifin");
    // Une table échantillonnée se lit une fois par seconde à la fréquence 1/durée : c'est là sa
    // hauteur d'origine, que la clé transpose ensuite.
    lignes.push("  kfrequence = 1 / idureeSource");
    lignes.push(`  kcle = ${csNombre(rapportDemiTons(r.transposition))}`);
  } else {
    lignes.push(`  kfrequence = ${csNombre(frequence)}`);
    lignes.push("  asamplepos1 = azero");
    lignes.push("  kcle = 1");
  }

  const source = e.source ? "giSource" : "giSinus";
  const valeurs: Record<string, string> = {
    agrainfreq: espece === "synchrone" ? "azero" : "agrainfreq",
    kdistribution: csNombre(dispersion),
    idisttab: dispersion > 0 ? "giDispersion" : "-1",
    async: espece === "synchrone" ? "asynchro" : "azero",
    kenv2amt: "0",
    ienv2tab: "-1",
    ienv_attack: "-1",
    ienv_decay: "-1",
    ksustain_amount: "0.5",
    ka_d_ratio: "0.5",
    kduration: "kduree",
    kamp: csNombre(volume * compensationLargeur(positions)),
    igainmasks: "-1",
    kwavfreq: "kfrequence",
    ksweepshape: e.balayage ? "0.5" : "0",
    iwavfreqstarttab: e.balayage ? "giDebut" : "-1",
    iwavfreqendtab: e.balayage ? "giFin" : "-1",
    awavfm: "azero",
    ifmamptab: "-1",
    kfmenv: "-1",
    icosine: "giCosinus",
    ktraincps: "kfrequence",
    knumpartials: csNombre(espece === "trainlets" ? borne(Math.round(nombre(r.partiels, 5)), 1, 40) : 1),
    kchroma: "1",
    ichannelmasks: "giCanaux",
    krandommask: "0",
    kwaveform1: source,
    kwaveform2: source,
    kwaveform3: source,
    kwaveform4: source,
    iwaveamptab: "giAmplitudes",
    asamplepos1: "asamplepos1",
    asamplepos2: "azero",
    asamplepos3: "azero",
    asamplepos4: "azero",
    kwavekey1: "kcle",
    kwavekey2: "kcle",
    kwavekey3: "kcle",
    kwavekey4: "kcle",
    imax_grains: "1000",
  };

  const arguments_ = NOMS_ARGUMENTS.map((nom) => valeurs[nom]).join(", ");
  // DEUX SORTIES, TOUJOURS. L'opcode en accepte jusqu'à huit, et c'est le masque de canal qui
  // distribue les grains entre elles ; rendre du mono reviendrait à jeter la moitié du travail.
  // À largeur nulle, les deux canaux sortent identiques, ce que la corrélation confirme.
  lignes.push(`  aGauche, aDroite partikkel ${arguments_}`);
  lignes.push("  outs aGauche, aDroite");
  lignes.push("endin");

  return [...tables, "", ...lignes].join("\n");
}

/** La partition : une seule note, de la durée demandée. */
export function partitionParticules(r: ReglagesParticules): string {
  return `i1 0 ${csNombre(borne(nombre(r.dureeSec, 4), 0.1, 300))}`;
}

/** La graine du tirage, pour que deux rendus du même réglage donnent le même son. */
export const graineParticules = (r: ReglagesParticules): number =>
  Math.max(1, Math.round(nombre(r.graine, 42)));
