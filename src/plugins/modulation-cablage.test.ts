// plugins/modulation-cablage.test.ts — Le rang qu'une fiche DÉCLARE est celui que son exécuteur LIT.
//
// CE QUE LES AUTRES NE PEUVENT PAS VOIR. `modulation-ports.test.ts` tient tout le côté DÉCLARÉ,
// sur le registre entier : un port nomme un paramètre qui existe, ses deux bornes le désignent en
// retour, deux ports ne pilotent pas le même réglage, l'audio n'est jamais poussé de son rang. Et
// `audio/modulation-melange.test.ts` et `audio/modulation-niveau.test.ts` tiennent les cœurs de
// calcul, qui savent lire une courbe. Entre les deux reste un chemin que personne ne regarde :
// celui qui va du port déclaré jusqu'à l'appel `ctx.entree(rang)` de l'exécuteur, écrit À LA MAIN
// sur chaque fiche.
//
// ET UNE FAUTE Y EST MUETTE. Un rang décalé d'un cran fait que `ctx.entree(rang)` ne rend pas la
// courbe ; `estCourbe` est faux ; le réglage fixe s'applique ; le son sort, aucun message ne
// change, et le port est simplement inerte.
//
// LA FORME DE CHAQUE CAS COMPARE LA FICHE À ELLE-MÊME, sans valeur de référence inventée :
//
//   A. sans courbe, le réglage posé à 25
//   B. une courbe PLATE à un sur le port, la borne haute à 25, et le réglage posé à 100,
//      c'est-à-dire à une valeur que A ne connaît pas
//
// Les deux doivent rendre le même son. Si le port est mal rangé, B retombe sur son réglage fixe,
// donc sur 100, et les deux sons diffèrent. Si la courbe est lue mais mal mise en forme, ils
// diffèrent aussi.
//
// VINGT-CINQ, ET NON TRENTE-TROIS. Le réglage voyage en pour cent et devient une proportion : 25
// donne 0,25, que le flottant simple tient EXACTEMENT. Une valeur comme 33 donnerait 0,33 d'un côté
// en double précision et sa version quantifiée de l'autre, et le cas mesurerait le format au lieu
// du câblage. Les fractions dyadiques sont la seule monnaie d'une comparaison au bit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { CADENCE, constante, type Courbe } from "../audio/courbe";
import { fiches as fichesArcEnCiel } from "./arc-en-ciel";
import { fiches as fichesCresson } from "./effets-cresson";
import { fiches as fichesEffets } from "./effets";
import { fiches as fichesRotatifs } from "./effets-rotatifs";
import { fiches as fichesTemporel } from "./effets-temporel";
import { fiches as fichesFdn } from "./fdn";
import { fiches as fichesFinitions } from "./finitions";
import { fiches as fichesTableOnde } from "./table-onde";
import { fiches as fichesVelours } from "./velours";
import { fiches as fichesSpectralCdp } from "./spectral-cdp";
import { fiches as fichesEffetsSpectral } from "./effets-spectral";
import { fiches as fichesConcret } from "./concret";
import { fiches as fichesRetardSpectral } from "./retard-spectral";
import { fiches as fichesDeplacement } from "./deplacement";
import { fiches as fichesModulation } from "./effets-modulation";
import { fiches as fichesMicromontage } from "./micromontage";
import type { FicheAudio } from "../audio/types-domaine";

const SR = 16000;
/** Court exprès : onze fiches lancées deux fois, dont trois réverbérations. */
const DUREE = 0.08;

/** La valeur employée par les deux passes, en pour cent. Dyadique après division par cent. */
const REGLE = 25;
/** Ce que porte le réglage fixe de la passe modulée : tout sauf ce que la courbe commande. */
const LEURRE = 100;

const TOUTES = [
  ...fichesArcEnCiel, ...fichesCresson, ...fichesEffets, ...fichesRotatifs,
  ...fichesTemporel, ...fichesFdn, ...fichesFinitions, ...fichesTableOnde, ...fichesVelours,
  ...fichesSpectralCdp, ...fichesConcret, ...fichesRetardSpectral, ...fichesDeplacement, ...fichesModulation, ...fichesEffetsSpectral,
  ...fichesMicromontage,
] as unknown as FicheAudio[];

/**
 * Une courbe qui monte de zéro à un, à la même cadence qu'une constante.
 *
 * ELLE PART DU MÊME POINT QU'UNE CONSTANTE À ZÉRO, et c'est ce qui la rend utile : comparer les
 * deux rend visible un cœur qui ne lirait que le premier point de sa courbe.
 */
const rampe = (dureeSec: number, cadence = CADENCE): Courbe => {
  const n = Math.max(2, Math.round(dureeSec * cadence));
  return { valeurs: Float32Array.from({ length: n }, (_, i) => i / (n - 1)), cadence };
};

const fiche = (id: string): FicheAudio => {
  const f = TOUTES.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function son(graine: number, canaux = 1): AudioBuffer {
  const n = Math.round(DUREE * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  let e = graine >>> 0;
  for (let c = 0; c < canaux; c++) {
    const x = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
    b.copyToChannel(x, c);
  }
  return b;
}

/**
 * Le même bruit, mais en salve : silence, fort, silence.
 *
 * UN BRUIT STATIONNAIRE NE PEUT PAS ÉPROUVER UNE CONSTANTE DE TEMPS, et c'est ce que le cas de la
 * courbe qui varie a révélé. Une attaque et un relâchement décident de la VITESSE à laquelle une
 * mesure rattrape ce qu'elle mesure ; sur un signal dont l'enveloppe ne bouge pas, il n'y a rien à
 * rattraper, et le réglage ne change pas un échantillon. Les cas concernés passaient donc défaut
 * planté, exactement comme le premier cas du de-esser.
 *
 * TROIS TIERS PLUTÔT QU'UNE RAMPE : le bord est ce qui compte, et deux bords valent mieux qu'un.
 */
function salve(graine: number, canaux = 1): AudioBuffer {
  const b = son(graine, canaux);
  const n = b.length;
  for (let c = 0; c < canaux; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < n; i++) if (i < n / 3 || i >= (2 * n) / 3) x[i] = 0;
  }
  return b;
}

function contexte(entrees: unknown[], reglages: Record<string, number | string>) {
  return {
    entree: (i: number) => entrees[i],
    sortieBranchee: () => false,
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

/**
 * Tous les canaux de toutes les sorties audio d'un run, mis à plat et RECOPIÉS.
 *
 * LA COPIE N'EST PAS UNE PRÉCAUTION DE STYLE. `getChannelData` rend une vue sur de la mémoire tenue
 * par le tampon natif de `node-web-audio-api` ; rendre la vue en gardant le tampon nulle part laisse
 * le ramasse-miettes reprendre ce qu'elle désigne. Rien ne se plaint, les valeurs changent
 * seulement, et sous charge. Un banc voisin l'a payé d'une passe complète.
 */
async function rendre(id: string, entrees: unknown[], reglages: Record<string, number | string>) {
  const res = await fiche(id).executer(contexte(entrees, reglages));
  const out: Float32Array[] = [];
  for (const v of res.valeurs ?? []) {
    if (v instanceof AudioBuffer) {
      for (let c = 0; c < v.numberOfChannels; c++) out.push(Float32Array.from(v.getChannelData(c)));
    }
  }
  expect(out.length, `${id} n'a rendu aucun son`).toBeGreaterThan(0);
  return out;
}

const memes = (a: Float32Array[], b: Float32Array[]): boolean => {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) {
    if (a[k].length !== b[k].length) return false;
    for (let i = 0; i < a[k].length; i++) if (a[k][i] !== b[k][i]) return false;
  }
  return true;
};

/**
 * Les fiches dont le chemin du port est écrit à la main, avec ce qu'il faut pour les lancer.
 *
 * `entrees` donne les entrées qui PRÉCÈDENT le port de modulation, dans l'ordre, et `undefined` y
 * tient la place d'une entrée facultative qu'on ne branche pas. Le port vient après elles, et
 * c'est précisément ce que ces cas vérifient.
 *
 * `noms` donne les bornes quand ce n'est pas le premier réglage modulé de la fiche, qui seul garde
 * « Modulation min » et « Modulation max ».
 */
/**
 * Les huit ports du multibande, qui ne diffèrent que par leur rang et par ce qu'ils éprouvent.
 *
 * LES TROIS BANDES SONT OUVERTES DANS LES RÉGLAGES COMMUNS, sans quoi un seuil éprouvé sur la
 * bande grave ne changerait rien, les deux autres ne comprimant pas. C'est la leçon du de-esser :
 * un cas qui ne change rien passe quoi qu'on fasse.
 */
const multibande = (reglage: string, rang: number, regle: number, leurre: number) => [{
  id: "compresseur-multibande", reglage, rang, regle, leurre, siOffline: true,
  noms: [`${reglage} min`, `${reglage} max`] as [string, string],
  entrees: () => [son(263, 2), ...Array.from({ length: rang - 1 }, () => undefined)],
  reglages: {
    "Seuil Low": -40, "Ratio Low": 10, "Seuil Mid": -40, "Ratio Mid": 10,
    "Seuil High": -40, "Ratio High": 10,
  },
}];

const CAS: {
  id: string; reglage: string; entrees: () => unknown[];
  noms?: [string, string]; siOffline?: boolean;
  /**
   * Les réglages à poser pour que l'effet FASSE quelque chose, en plus de celui qu'on éprouve.
   *
   * UN CAS QUI NE CHANGE RIEN PASSE QUOI QU'ON FASSE, et c'est ainsi que le premier cas du de-esser
   * est né vide : à son seuil par défaut, rien du signal d'essai ne dépasse, aucune atténuation
   * n'a lieu, et la sortie est l'entrée quelle que soit la largeur de bande. Le défaut planté ne
   * le faisait pas tomber. Ouvrir le seuil rend le cas sensible à ce qu'il prétend éprouver.
   */
  reglages?: Record<string, number | string>;
  /**
   * La valeur éprouvée et le leurre, quand 25 et 100 ne veulent rien dire dans l'unité du réglage.
   *
   * LES DEUX VALEURS PAR DÉFAUT SONT DES POUR-CENT. Sur un seuil en décibels, 25 dB est au-dessus
   * de tout ce qu'un signal d'essai atteint : rien ne déclenche, la sortie est l'entrée, et le cas
   * passerait sans rien éprouver. Sur une attaque en secondes, 25 et 100 sont tous deux assez longs
   * pour que l'enveloppe ne bouge pas du tout, et les deux rendraient la même chose.
   *
   * ELLES SE CHOISISSENT DYADIQUES, un seizième plutôt qu'un centième : seule une fraction dyadique
   * se compare exactement entre le flottant simple d'un tableau et le double d'un nombre.
   */
  regle?: number; leurre?: number;
  /**
   * Ce que vaut la borne BASSE, quand zéro n'a pas de sens pour ce réglage.
   *
   * ZÉRO EST LE PLANCHER NATUREL D'UNE BORNE BASSE : il éteint l'effet, ce qui est le repère le
   * plus sûr. Mais la fréquence basse du vocodeur est un DÉNOMINATEUR, la fréquence de chaque bande
   * valant `fMin · (fMax/fMin)^k` : à zéro, le quotient part à l'infini et le banc de filtres ne
   * rend plus rien du tout, identiquement pour toute courbe. Un réglage qui divise demande donc un
   * plancher qui ne soit pas zéro.
   */
  bas?: number;
  /** Le rang du port à éprouver, quand la fiche en porte plusieurs. Par défaut, le dernier. */
  rang?: number;
}[] = [
  // La famille « mélange ».
  { id: "tremolo-harmonique", reglage: "Mélange", entrees: () => [son(3, 2)], rang: 1 },
  { id: "haut-parleur-rotatif", reglage: "Mélange", entrees: () => [son(5, 2)], rang: 1 },
  { id: "arc-en-ciel-acoustique", reglage: "Mix", entrees: () => [son(7, 2)], rang: 1 },
  // CES DEUX RANGS SONT DÉSORMAIS ÉCRITS, et ils ne l'étaient pas : un port est arrivé derrière
  // chacun des deux, et le rang par défaut est LE DERNIER de la fiche. Sans cette ligne, les deux
  // cas du mélange éprouvaient le port neuf en croyant éprouver le leur.
  // ET SES DEUX CAS OUVRENT L'EFFET, sans quoi ils ne mesurent rien. Le signal d'essai dure
  // quatre-vingts millisecondes ; au tempo et à la taille de segment par défaut, un intervalle en
  // vaut cinq cents et le rang de la répétition ne quitte jamais zéro. Le gain de réinjection, qui
  // est ce rang en exposant, vaut alors un quoi qu'on demande, et le segment répété est l'original
  // à la même place : la sortie égale l'entrée, et les DEUX cas passaient défaut planté. Un tempo
  // de 240 et des segments au trente-deuxième font tenir trois répétitions dans l'essai.
  { id: "beat-repeat", reglage: "Mix", entrees: () => [son(11, 2)], rang: 1,
    reglages: { Tempo: 240, Intervalle: "1/8", Taille: "1/32" } },
  { id: "echo-flottant", reglage: "Mélange", entrees: () => [son(13, 2)], rang: 1 },
  { id: "reverbe-hachee", reglage: "Mix", entrees: () => [son(17)], rang: 1 },
  { id: "reverbe-reseau", reglage: "Mix", entrees: () => [son(19)], rang: 1 },
  { id: "reverberation-velours", reglage: "Mélange", entrees: () => [son(23)] },
  // SON BANC DE FILTRES PASSE PAR `OfflineAudioContext` : son cas de rendu ne tourne que là où ce
  // dernier existe, ce qui est dit par une condition écrite plutôt que par un silence.
  { id: "vocoder", reglage: "Mix", entrees: () => [son(29), son(31)], siOffline: true, rang: 2 },
  // La famille « niveau ». Le créneau porte DEUX entrées audio avant son port, et ses bornes sont
  // nommées d'après leur réglage ; l'oscillateur à table d'onde a une entrée facultative qu'on ne
  // branche pas, et c'est elle que `undefined` tient.
  { id: "creneau", reglage: "Niveau", entrees: () => [son(37, 2), son(41, 2)], noms: ["Niveau min", "Niveau max"] },
  { id: "oscillateur-table-onde", reglage: "Volume", entrees: () => [undefined], rang: 1 },
  // La famille « temps ». Le gate porte DEUX ports, donc deux entrées dans cette table : chacune
  // nomme le rang qu'elle éprouve, puisque le dernier port n'est pas celui de l'attaque.
  // UNE SALVE ET UN SEUIL OUVERT : le seuil du limiteur est à −3 dB par défaut et le signal
  // d'essai culmine à −8 dB, de sorte qu'il ne s'activait JAMAIS et que son relâchement ne
  // pouvait rien changer. Le cas passait donc défaut planté.
  { id: "limiteur", reglage: "Relâchement", entrees: () => [salve(43, 2)], rang: 1,
    reglages: { Seuil: -24 } },
  // UNE SALVE POUR LE GATE : son attaque décide de la vitesse à laquelle il s'ouvre, et sur un
  // bruit stationnaire il reste du même côté du seuil du début à la fin, sans jamais s'ouvrir.
  {
    id: "gate-expandeur", reglage: "Attaque", entrees: () => [salve(47, 2)],
    noms: ["Attaque min", "Attaque max"], rang: 1, reglages: { Seuil: -24 },
  },
  {
    id: "gate-expandeur", reglage: "Relâchement", entrees: () => [son(47, 2), undefined],
    noms: ["Relâchement min", "Relâchement max"], rang: 2,
  },
  // La famille « espace ». La vague porte deux ports, comme le gate.
  { id: "ubiquite", reglage: "Dispersion", entrees: () => [son(53, 2)] },
  {
    id: "vague", reglage: "Profondeur", entrees: () => [son(59, 2)],
    noms: ["Profondeur min", "Profondeur max"], rang: 1,
  },
  {
    id: "vague", reglage: "Ouverture", entrees: () => [son(61, 2), undefined],
    noms: ["Ouverture min", "Ouverture max"], rang: 2,
  },
  // LES CINQ « MIX » QUE LE RECENSEMENT PAR RÉGLAGE A FAIT REPARAÎTRE. Chacun portait déjà un port
  // de courbe POUR AUTRE CHOSE, d'où les `undefined` qui tiennent la place de ces ports-là. C'est
  // aussi pourquoi les cinq portent « Mix min / Mix max » et non les bornes par défaut : sur une
  // fiche qui module déjà autre chose, « Modulation min » ne dit pas de quoi il est la borne.
  { id: "phaser", reglage: "Mix", entrees: () => [son(67, 2), undefined],
    noms: ["Mix min", "Mix max"], rang: 2 },
  { id: "wahwah", reglage: "Mix", entrees: () => [son(71, 2), undefined, undefined],
    noms: ["Mix min", "Mix max"], rang: 3 },
  // CES DEUX RANGS SONT ÉCRITS pour la même raison que les autres : des ports de résonance et de
  // brillance sont arrivés derrière eux, et le rang par défaut est LE DERNIER de la fiche.
  { id: "peignes-accordes", reglage: "Mix", entrees: () => [son(73), undefined],
    noms: ["Mix min", "Mix max"], rang: 2 },
  { id: "resonateurs", reglage: "Mix", entrees: () => [son(79), undefined],
    noms: ["Mix min", "Mix max"], rang: 2 },
  {
    id: "retard-spectral", reglage: "Mix", entrees: () => [son(83), undefined],
    noms: ["Mix min", "Mix max"],
  },
  // LA FAMILLE « ESPACE ». Chacune de ces fiches porte DÉJÀ un ou plusieurs ports : le port neuf
  // vient donc après eux, et les `undefined` tiennent leur place. Les bornes du port neuf portent
  // le nom de leur réglage ; celles des ports déjà en production gardent le leur, qu'un graphe
  // enregistré désigne par son nom.
  { id: "phaser", reglage: "Profondeur", entrees: () => [son(89, 2), undefined, undefined],
    noms: ["Profondeur min", "Profondeur max"] },
  // CES DEUX RANGS SONT ÉCRITS POUR LA MÊME RAISON QUE CEUX DU MÉLANGE PLUS HAUT : un port de
  // coupure ou de résonance est arrivé derrière chacun, et le rang par défaut est LE DERNIER.
  { id: "wahwah", reglage: "Profondeur", entrees: () => [son(97, 2), undefined, undefined, undefined],
    noms: ["Profondeur min", "Profondeur max"], rang: 4 },
  { id: "tremolo-harmonique", reglage: "Profondeur", entrees: () => [son(101, 2), undefined],
    noms: ["Profondeur min", "Profondeur max"], rang: 2 },
  { id: "reverbe-reseau", reglage: "Largeur", entrees: () => [son(103), undefined],
    noms: ["Largeur min", "Largeur max"], rang: 2 },
  { id: "oscillateur-table-onde", reglage: "Position", entrees: () => [undefined, undefined],
    noms: ["Position min", "Position max"], rang: 2 },
  // LES TROIS PREMIÈRES SECONDES MODULATIONS BÂTIES PAR `effet()`. Ce socle n'en portait qu'une ;
  // ces trois cas sont le premier emploi de la seconde, et ils tiennent le rang qu'elle occupe.
  { id: "flanger", reglage: "Profondeur", entrees: () => [son(107, 2), undefined],
    noms: ["Profondeur min", "Profondeur max"] },
  { id: "chorus", reglage: "Profondeur", entrees: () => [son(109, 2), undefined],
    noms: ["Profondeur min", "Profondeur max"] },
  { id: "de-esser", reglage: "Largeur", entrees: () => [son(113, 2), undefined],
    noms: ["Largeur min", "Largeur max"], siOffline: true, rang: 2,
    // Seuil grand ouvert : sans cela, rien du signal d'essai ne dépasse et la largeur de bande ne
    // change rien, de sorte que le cas passerait sans rien éprouver.
    reglages: { Seuil: -60, Ratio: 10 } },
  // LES SIX CONSTANTES DE TEMPS DES SUIVEURS D'ENVELOPPE. Un seuil grand ouvert partout : une
  // dynamique qui ne se déclenche pas rend l'entrée telle quelle, et le cas ne prouverait rien.
  { id: "compresseur", reglage: "Attaque", entrees: () => [son(127, 2)],
    noms: ["Attaque min", "Attaque max"], rang: 1, reglages: { Seuil: -60, Ratio: 10 } },
  { id: "compresseur", reglage: "Relâchement", entrees: () => [son(131, 2), undefined],
    noms: ["Relâchement min", "Relâchement max"], rang: 2, reglages: { Seuil: -60, Ratio: 10 } },
  { id: "transient-shaper", reglage: "Temps attaque", entrees: () => [son(137, 2), undefined],
    noms: ["Temps attaque min", "Temps attaque max"], rang: 2, reglages: { Attaque: 12, Sustain: -12 } },
  { id: "transient-shaper", reglage: "Temps sustain", entrees: () => [son(139, 2), undefined, undefined],
    noms: ["Temps sustain min", "Temps sustain max"], reglages: { Attaque: 12, Sustain: -12 } },
  { id: "de-esser", reglage: "Attaque", entrees: () => [son(149, 2), undefined, undefined],
    noms: ["Attaque min", "Attaque max"], rang: 3, siOffline: true,
    reglages: { Seuil: -60, Ratio: 10 } },
  { id: "de-esser", reglage: "Relâchement", entrees: () => [son(151, 2), undefined, undefined, undefined],
    noms: ["Relâchement min", "Relâchement max"], siOffline: true, rang: 4,
    reglages: { Seuil: -60, Ratio: 10 } },
  { id: "de-esser", reglage: "Fréquence", entrees: () => [son(293, 2), undefined, undefined, undefined, undefined],
    noms: ["Fréquence min", "Fréquence max"], siOffline: true, rang: 5, regle: 4000, leurre: 12000,
    reglages: { Seuil: -60, Ratio: 10 } },
  { id: "exciter", reglage: "Fréquence", entrees: () => [son(307, 2), undefined],
    noms: ["Fréquence min", "Fréquence max"], siOffline: true, regle: 2000, leurre: 10000 },
  ...multibande("Fréq Low", 9, 100, 800), ...multibande("Fréq High", 10, 2000, 10000),
  // LA FAMILLE « DYNAMIQUE ». Un ratio de un ne comprime rien, un seuil a zero decibel n'est
  // franchi par rien : ce sont les leurres naturels de ces deux formes.
  { id: "gate-expandeur", reglage: "Seuil", entrees: () => [son(311, 2), undefined, undefined],
    noms: ["Seuil min", "Seuil max"], rang: 3, regle: -24, leurre: 0 },
  { id: "gate-expandeur", reglage: "Ratio", entrees: () => [salve(313, 2), undefined, undefined, undefined],
    // UNE SALVE : un expandeur agit SOUS son seuil, et un bruit stationnaire reste du même côté.
    noms: ["Ratio min", "Ratio max"], regle: 8, leurre: 1, reglages: { Mode: "Expandeur", Seuil: -20 } },
  { id: "limiteur", reglage: "Seuil", entrees: () => [son(317, 2), undefined],
    noms: ["Seuil min", "Seuil max"], rang: 2, regle: -24, leurre: 0 },
  { id: "limiteur", reglage: "Plafond", entrees: () => [son(331, 2), undefined, undefined],
    noms: ["Plafond min", "Plafond max"], regle: -12, leurre: 0, reglages: { Seuil: -30 } },
  { id: "de-esser", reglage: "Ratio", entrees: () => [son(337, 2), undefined, undefined, undefined, undefined, undefined],
    noms: ["Ratio min", "Ratio max"], siOffline: true, regle: 8, leurre: 1,
    reglages: { Seuil: -60 } },
  // LE RESTE DE LA FAMILLE « ESPACE ».
  { id: "haut-parleur-rotatif", reglage: "Profondeur d'amplitude", entrees: () => [son(347, 2), undefined],
    noms: ["Profondeur d'amplitude min", "Profondeur d'amplitude max"], rang: 2 },
  { id: "haut-parleur-rotatif", reglage: "Profondeur du Doppler", entrees: () => [son(349, 2), undefined, undefined],
    noms: ["Profondeur du Doppler min", "Profondeur du Doppler max"], rang: 3 },
  { id: "ambisonique", reglage: "Ouverture", entrees: () => [son(353, 2), undefined],
    noms: ["Ouverture min", "Ouverture max"], regle: 60, leurre: 180 },
  // LA POSITION EST SORTIE DU CENTRE, sans quoi ce cas ne peut rien éprouver : la trajectoire vaut
  // position × largeur, et la position par défaut est zéro. La largeur multipliait donc zéro, et
  // le cas passait défaut planté quelle que soit la courbe.
  { id: "spatialisation-stereo", reglage: "Largeur", entrees: () => [son(359, 2), undefined],
    noms: ["Largeur min", "Largeur max"], siOffline: true, reglages: { Position: 100 } },
  { id: "granular-freeze", reglage: "Position", entrees: () => [son(367, 2), undefined],
    noms: ["Position min", "Position max"], rang: 2 },
  // LE DUCKING PORTE DEUX ENTRÉES AUDIO AVANT SES QUATRE PORTS, et ses unités ne sont pas des
  // pour-cent : chaque cas choisit donc sa valeur et son leurre, en fractions dyadiques.
  { id: "ducking", reglage: "Seuil", entrees: () => [son(197), son(199)],
    noms: ["Seuil min", "Seuil max"], rang: 2, regle: -24, leurre: 0 },
  { id: "ducking", reglage: "Réduction", entrees: () => [son(211), son(223), undefined],
    noms: ["Réduction min", "Réduction max"], rang: 3, regle: 24, leurre: 0 },
  { id: "ducking", reglage: "Attaque", entrees: () => [son(227), son(229), undefined, undefined],
    noms: ["Attaque min", "Attaque max"], rang: 4, regle: 0.0625, leurre: 0.5,
    reglages: { Seuil: -40, Réduction: 24 } },
  // UNE SALVE SUR LE DÉCLENCHEUR, ET LE MAINTIEN À ZÉRO. Le relâchement décide de la vitesse à
  // laquelle le niveau remonte quand le déclencheur se tait : un déclencheur stationnaire ne se
  // tait jamais, et le maintien par défaut dure cent millisecondes, soit plus que les
  // quatre-vingts du signal d'essai, de sorte que le relâchement ne commençait jamais.
  { id: "ducking", reglage: "Relâchement", entrees: () => [son(233), salve(239), undefined, undefined, undefined],
    noms: ["Relâchement min", "Relâchement max"], regle: 0.25, leurre: 2,
    reglages: { Seuil: -40, Réduction: 24, Maintien: 0 } },
  // LE COMPRESSEUR ET LE MULTIBANDE, qui partagent la même boucle : le second n'est que trois
  // appels au premier, un par bande. Un ratio de un ne comprime rien, et c'est le leurre naturel
  // d'un ratio ; un seuil à zéro décibel n'est franchi par rien, et c'est celui d'un seuil.
  { id: "compresseur", reglage: "Seuil", entrees: () => [son(241, 2), undefined, undefined],
    rang: 3, regle: -24, leurre: 0, noms: ["Seuil min", "Seuil max"], reglages: { Ratio: 10 } },
  { id: "compresseur", reglage: "Ratio", entrees: () => [son(251, 2), undefined, undefined, undefined],
    rang: 4, regle: 8, leurre: 1, noms: ["Ratio min", "Ratio max"], reglages: { Seuil: -40 } },
  { id: "compresseur", reglage: "Gain", entrees: () => [son(257, 2), undefined, undefined, undefined, undefined],
    regle: 12, leurre: 0, noms: ["Gain min", "Gain max"] },
  ...multibande("Seuil Low", 1, -24, 0), ...multibande("Ratio Low", 2, 8, 1),
  ...multibande("Seuil Mid", 3, -24, 0), ...multibande("Ratio Mid", 4, 8, 1),
  ...multibande("Seuil High", 5, -24, 0), ...multibande("Ratio High", 6, 8, 1),
  ...multibande("Attaque", 7, 25, 100), ...multibande("Relâchement", 8, 25, 100),
  // LES RÉVERBÉRATIONS. Les unités ne sont ni des pour-cent ni des décibels partout : chaque cas
  // choisit sa valeur et son leurre, en fractions dyadiques ou en entiers.
  { id: "reverbe-hachee", reglage: "Seuil", entrees: () => [son(269), undefined],
    noms: ["Seuil min", "Seuil max"], rang: 2, regle: -24, leurre: 0 },
  { id: "reverbe-hachee", reglage: "Chute", entrees: () => [son(271), undefined, undefined],
    noms: ["Chute min", "Chute max"], regle: 0.25, leurre: 2 },
  { id: "shimmer", reglage: "Mix", entrees: () => [son(277)] },
  { id: "reverbe-reseau", reglage: "Queue", entrees: () => [son(281), undefined, undefined],
    noms: ["Queue min", "Queue max"], rang: 3, regle: 8, leurre: 0 },
  { id: "reverbe-reseau", reglage: "Fréquence de l'aigu", entrees: () => [son(283), undefined, undefined, undefined],
    noms: ["Fréquence de l'aigu min", "Fréquence de l'aigu max"], regle: 2000, leurre: 12000 },
  // LES FAMILLES « TEMPS » ET « RÉTROACTION ». Le delay stéréo porte quatre ports, et son mélange
  // entre ici bien qu'il ne soit pas neuf : trois ports arrivent derrière lui, et rien ne
  // vérifiait jusqu'à présent qu'il reste lu au rang un.
  { id: "delay-stereo", reglage: "Mix", entrees: () => [son(373, 2)], rang: 1 },
  { id: "delay-stereo", reglage: "Temps G", entrees: () => [son(379, 2), undefined],
    noms: ["Temps G min", "Temps G max"], rang: 2, regle: 250, leurre: 1000 },
  { id: "delay-stereo", reglage: "Temps D", entrees: () => [son(383, 2), undefined, undefined],
    noms: ["Temps D min", "Temps D max"], rang: 3, regle: 375, leurre: 1000 },
  { id: "delay-stereo", reglage: "Feedback", entrees: () => [son(389, 2), undefined, undefined, undefined],
    noms: ["Feedback min", "Feedback max"], regle: 64, leurre: 16 },
  // La décroissance de l'écho flottant se compte en SECONDES : un quart de seconde contre quatre,
  // deux fractions dyadiques, donc exactes des deux côtés.
  { id: "echo-flottant", reglage: "Décroissance", entrees: () => [son(397, 2), undefined],
    noms: ["Décroissance min", "Décroissance max"], regle: 0.25, leurre: 4 },
  { id: "beat-repeat", reglage: "Feedback", entrees: () => [son(401, 2), undefined],
    noms: ["Feedback min", "Feedback max"], regle: 64, leurre: 16,
    reglages: { Tempo: 240, Intervalle: "1/8", Taille: "1/32" } },
  // LA FAMILLE « FRÉQUENCE », ses coupures et ses résonances. Les unités sont des hertz et des
  // facteurs de qualité : chaque cas choisit sa valeur et son leurre, en puissances de deux, que
  // le flottant simple d'un tableau tient exactement.
  { id: "bitcrusher", reglage: "Mix", entrees: () => [son(409, 2)], rang: 1 },
  { id: "bitcrusher", reglage: "Fréquence", entrees: () => [son(419, 2), undefined],
    noms: ["Fréquence min", "Fréquence max"], regle: 2048, leurre: 16384 },
  { id: "tremolo-harmonique", reglage: "Coupure", entrees: () => [son(421, 2), undefined, undefined],
    noms: ["Coupure min", "Coupure max"], regle: 512, leurre: 2048 },
  { id: "haut-parleur-rotatif", reglage: "Coupure", entrees: () => [son(431, 2), undefined, undefined, undefined],
    noms: ["Coupure min", "Coupure max"], regle: 512, leurre: 1024 },
  { id: "wahwah", reglage: "Résonance", entrees: () => [son(433, 2), undefined, undefined, undefined, undefined],
    noms: ["Résonance min", "Résonance max"], regle: 2, leurre: 16 },
  { id: "ring-modulator", reglage: "Mix", entrees: () => [son(439, 2)], rang: 1 },
  { id: "ring-modulator", reglage: "Fréquence", entrees: () => [son(443, 2), undefined],
    noms: ["Fréquence min", "Fréquence max"], regle: 1024, leurre: 64 },
  { id: "oscillateur-table-onde", reglage: "Fréquence", entrees: () => [undefined, undefined, undefined],
    noms: ["Fréquence min", "Fréquence max"], regle: 256, leurre: 1024 },
  // LES DEUX RÉSONANCES ET LA BRILLANCE. Un T60 se compte en secondes : un quart contre deux, deux
  // fractions dyadiques. La brillance voyage en pour cent, et vingt-cinq y est exact.
  { id: "peignes-accordes", reglage: "Résonance", entrees: () => [son(449), undefined, undefined],
    noms: ["Résonance min", "Résonance max"], regle: 0.25, leurre: 2 },
  { id: "resonateurs", reglage: "Résonance", entrees: () => [son(457), undefined, undefined],
    noms: ["Résonance min", "Résonance max"], rang: 3, regle: 0.25, leurre: 2 },
  { id: "resonateurs", reglage: "Brillance", entrees: () => [son(461), undefined, undefined, undefined],
    noms: ["Brillance min", "Brillance max"], regle: 25, leurre: 100 },
  // LES DERNIERS, HORS COMBINAISONS À DEUX VARIABLES. Le micromontage porte QUATRE entrées audio
  // avant ses deux ports ; l'harmonizer quitte le fil de l'interface, et c'est son canal de
  // réglages qui a dû s'élargir pour qu'un tableau y passe.
  { id: "granular-freeze", reglage: "Pitch", entrees: () => [son(463, 2), undefined, undefined],
    noms: ["Pitch min", "Pitch max"], regle: 8, leurre: 0 },
  { id: "arc-en-ciel-acoustique", reglage: "Ouverture", entrees: () => [son(467, 2), undefined],
    noms: ["Ouverture min", "Ouverture max"] },
  { id: "micromontage", reglage: "Niveau", entrees: () => [son(479), undefined, undefined, undefined, undefined],
    noms: ["Niveau min", "Niveau max"] },
  { id: "harmonizer", reglage: "Mix 1", entrees: () => [son(487, 2)],
    noms: ["Mix 1 min", "Mix 1 max"], rang: 1 },
  { id: "harmonizer", reglage: "Mix 2", entrees: () => [son(491, 2), undefined],
    noms: ["Mix 2 min", "Mix 2 max"] },
  // LES COMBINAISONS À DEUX VARIABLES, le dernier obstacle du chantier. Les trois coupures du
  // quadrafuzz sont triées puis combinées deux à deux ; les deux bornes du vocodeur bornent un banc
  // entier. Dans les deux cas la combinaison se fait sur les tableaux avant le paramètre audio, et
  // les deux chemins passent par le MÊME calcul : c'est ce que ces cas éprouvent.
  //
  // LES DEUX FICHES RENDENT PAR `OfflineAudioContext`, d'où la condition écrite.
  { id: "quadrafuzz", reglage: "Coupure 1", entrees: () => [son(499, 2), undefined],
    noms: ["Coupure 1 min", "Coupure 1 max"], rang: 2, regle: 256, leurre: 64, siOffline: true },
  { id: "quadrafuzz", reglage: "Coupure 2", entrees: () => [son(503, 2), undefined, undefined],
    noms: ["Coupure 2 min", "Coupure 2 max"], rang: 3, regle: 1024, leurre: 2048, siOffline: true },
  { id: "quadrafuzz", reglage: "Coupure 3", entrees: () => [son(509, 2), undefined, undefined, undefined],
    noms: ["Coupure 3 min", "Coupure 3 max"], regle: 4096, leurre: 8192, siOffline: true },
  { id: "vocoder", reglage: "Fréq min", entrees: () => [son(521), son(523), undefined],
    // SON PLANCHER N'EST PAS ZÉRO : cette borne est un dénominateur, et à zéro le banc de filtres
    // ne rend plus rien, identiquement pour toute courbe.
    noms: ["Fréq min min", "Fréq min max"], rang: 3, regle: 128, leurre: 512, bas: 64,
    siOffline: true },
  { id: "vocoder", reglage: "Fréq max", entrees: () => [son(541), son(547), undefined, undefined],
    noms: ["Fréq max min", "Fréq max max"], rang: 4, regle: 4096, leurre: 8192, siOffline: true },
  { id: "vocoder", reglage: "Q", entrees: () => [son(557), son(563), undefined, undefined, undefined],
    noms: ["Q min", "Q max"], regle: 4, leurre: 1, siOffline: true },
];

describe("le rang déclaré d'un port est celui que l'exécuteur lit", () => {
  it("il y a bien quatre-vingt-dix-huit ports à éprouver", () => {
    expect(CAS).toHaveLength(98);
  });

  for (const cas of CAS) {
    const [nomMin, nomMax] = cas.noms ?? ["Modulation min", "Modulation max"];
    /** Le rang du port éprouvé : celui qu'on déclare, ou le dernier de la fiche. */
    const rangDe = (f: FicheAudio) => cas.rang ?? (f.entrees ?? []).length - 1;

    it(`${cas.id} : le port qui pilote « ${cas.reglage} » est au rang déclaré`, () => {
      // LE RANG COMPTE AUTANT QUE LA PRÉSENCE : les arêtes enregistrées désignent un port par son
      // rang, et en insérer un ailleurs qu'APRÈS les autres rebrancherait chaque arête d'un cran.
      const f = fiche(cas.id);
      const entrees = (f.entrees ?? []) as any[];
      const port = entrees[rangDe(f)];
      expect(port?.module, `${cas.id} : le port de rang ${rangDe(f)} ne pilote pas ce réglage`).toBe(cas.reglage);
      expect(port?.type, `${cas.id} : le port de rang ${rangDe(f)} n'est pas une courbe`).toBe("courbe");
      // Et aucun port de courbe ne précède une entrée audio : les audio gardent leurs rangs.
      const premiereCourbe = entrees.findIndex((e) => e.type === "courbe");
      const derniereAudio = entrees.map((e) => e.type).lastIndexOf("audio");
      expect(premiereCourbe, `${cas.id} : une courbe est déclarée avant une entrée audio`)
        .toBeGreaterThan(derniereAudio);
      const noms = (f.parametres ?? []).map((p) => p.nom);
      expect(noms, `${cas.id} : « ${nomMin} » manque`).toContain(nomMin);
      expect(noms, `${cas.id} : « ${nomMax} » manque`).toContain(nomMax);
    });

    const siRendu = cas.siOffline && typeof OfflineAudioContext === "undefined" ? it.skip : it;
    siRendu(`${cas.id} : une courbe plate commande à la place de « ${cas.reglage} »`, async () => {
      const entrees = cas.entrees();
      const rang = rangDe(fiche(cas.id));
      const plate = constante(1, 64);

      const regle = cas.regle ?? REGLE;
      const fixe = await rendre(cas.id, entrees, { ...cas.reglages, [cas.reglage]: regle });
      const modulee = await rendre(cas.id, [...entrees.slice(0, rang), plate], {
        ...cas.reglages,
        // LE LEURRE EST LE CŒUR DU CAS : si le port n'est pas lu, c'est lui qui s'applique.
        [cas.reglage]: cas.leurre ?? LEURRE,
        [nomMin]: cas.bas ?? 0,
        [nomMax]: regle,
      });

      expect(memes(fixe, modulee),
        `${cas.id} : la courbe plate ne rend pas ce que rend le réglage`).toBe(true);
    });

    siRendu(`${cas.id} : une courbe QUI VARIE ne reste pas à son premier point sur « ${cas.reglage} »`, async () => {
      // CE QU'UNE COURBE PLATE NE PEUT PAS DIRE. Les deux cas ci-dessus attrapent un port mal
      // rangé, un réglage ignoré, une mise en forme fausse. Ils n'attrapent PAS un cœur qui ne
      // lirait que le PREMIER POINT de la courbe : sur une courbe plate, lire l'indice zéro ou
      // l'indice i donne le même chiffre, et le défaut planté à cet endroit a traversé deux cas
      // du granular freeze sans les faire tomber.
      //
      // LES DEUX COURBES PARTENT DU MÊME POINT, et c'est tout le montage. L'une reste à zéro,
      // l'autre monte jusqu'à un ; un cœur qui ne lit que l'indice zéro rend donc deux fois la
      // même chose, et un cœur qui lit par échantillon rend deux sons différents.
      const entrees = cas.entrees();
      const rang = rangDe(fiche(cas.id));
      const regle = cas.regle ?? REGLE;
      const bornes = { ...cas.reglages, [cas.reglage]: cas.leurre ?? LEURRE, [nomMin]: cas.bas ?? 0, [nomMax]: regle };

      const tenue = await rendre(cas.id, [...entrees.slice(0, rang), constante(0, 64)], bornes);
      const montante = await rendre(cas.id, [...entrees.slice(0, rang), rampe(64)], bornes);

      expect(memes(tenue, montante),
        `${cas.id} : « ${cas.reglage} » ne lit que le premier point de sa courbe`).toBe(false);
    });
  }
});
