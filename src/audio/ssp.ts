// audio/ssp.ts — La synthèse non standard : composer la forme d'onde comme on compose une pièce.
//
// D'après Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institut de sonologie
// d'Utrecht, années 1970, et les principes de sélection de ses programmes Projet 1 (1964) et
// Projet 2 (1966). Voir aussi Luc Döbereiner, « Models of Constructed Sound : Nonstandard Synthesis
// as an Aesthetic Perspective », Computer Music Journal 35(3), 2011.
//
// CE QUE « NON STANDARD » VEUT DIRE, ET POURQUOI C'EST RADICAL. Toute la synthèse ordinaire part
// d'un modèle : un oscillateur, une forme d'onde, un spectre, une enveloppe, un instrument. Ici il
// n'y a rien de tout cela. Le compositeur donne deux ensembles de nombres — des amplitudes et des
// durées — et des principes pour y puiser. Les couples ainsi tirés sont des POINTS, et le son est
// le trait qui les relie. Pas d'oscillateur, pas de forme d'onde, pas de note, pas de hauteur : la
// hauteur qu'on entendra est une conséquence des durées choisies, jamais un réglage.
//
// LA THÈSE DE KOENIG : LES MÊMES PRINCIPES À TOUTES LES ÉCHELLES. Ce qui ordonne les points d'une
// forme d'onde ordonne aussi les sections d'une pièce. Composer un son et composer une forme sont
// la même activité, menée sur des nombres différents. C'est pourquoi le même choix de principes est
// offert ici pour les amplitudes, pour les durées, et pour l'ordre des sections.
//
// CE MODULE N'IMPORTAIT RIEN, ET IL IMPORTE MAINTENANT UNE SEULE FONCTION. `periodeDesNotes` est une
// recherche de période sur une suite d'entiers, écrite pour le nœud des suites d'entières et sans
// aucun rapport avec lui : la recopier ici aurait été la dixième copie d'une arithmétique, ce que le
// chantier du hasard privé a appris à ne pas faire. Elle mériterait un foyer neutre, et le déplacer
// touche deux nœuds qui n'ont rien demandé ; c'est signalé plutôt que glissé ici.
//
// L'AVERTISSEMENT QUI DOIT ACCOMPAGNER CE NŒUD. SSP a la réputation d'être impossible à diriger :
// l'écrasante majorité des réglages rend du bruit, et Koenig lui-même a constaté que le programme
// résistait à l'intention musicale. Un nœud qui rendrait du bruit quoi qu'on fasse serait un
// générateur de bruit affublé d'une bibliographie. Les tests mesurent donc ce que les réglages
// commandent VRAIMENT — et ils commandent deux choses, l'échelle de temps et la répartition des
// amplitudes —, faute de quoi il n'y aurait pas lieu de publier ce nœud.

import { periodeDesNotes } from "./suites-entieres";
import { creerAleatoire } from "../core/hasard";
import { versDb } from "./decibels";

/** Les principes de sélection de Koenig, ceux de Projet 1 et 2 portés à l'échelle de l'onde. */
export const PRINCIPES = [
  { id: "alea", fr: "Aléa", en: "Alea" },
  { id: "serie", fr: "Série", en: "Series" },
  { id: "sequence", fr: "Séquence", en: "Sequence" },
  { id: "groupe", fr: "Groupe", en: "Group" },
  { id: "tendance", fr: "Tendance", en: "Tendency" },
] as const;

export type Principe = (typeof PRINCIPES)[number]["id"];

export const EST_PRINCIPE = (x: string): x is Principe => PRINCIPES.some((p) => p.id === x);

export const nomPrincipe = (p: Principe, en: boolean): string =>
  (PRINCIPES.find((x) => x.id === p) ?? PRINCIPES[0])[en ? "en" : "fr"];

/** Un générateur à graine : sans reproductibilité, aucun de ces principes ne se vérifierait. */
export function alea(graine: number): () => number {
  return creerAleatoire(graine);
}

/**
 * Le tirage d'une suite d'indices dans un ensemble, selon un principe.
 *
 * C'est le cœur de SSP, et c'est tout ce qu'il y a : les cinq principes ci-dessous sont l'entièreté
 * du pouvoir de composition offert au compositeur. Ils ne décrivent aucun son — ils décrivent
 * seulement une façon de parcourir une liste.
 */
export function selectionner(principe: Principe, taille: number, combien: number, r: () => number): number[] {
  const n = Math.max(1, Math.round(taille));
  const k = Math.max(0, Math.round(combien));
  const out: number[] = [];

  if (principe === "sequence") {
    // SÉQUENCE : l'ordre donné, répété. Le seul principe entièrement déterminé.
    for (let i = 0; i < k; i++) out.push(i % n);
    return out;
  }

  if (principe === "serie") {
    // SÉRIE : une permutation, épuisée avant d'en tirer une nouvelle. Chaque élément sert donc
    // exactement une fois par tour — c'est la différence exacte d'avec l'aléa, qui peut répéter.
    let sac: number[] = [];
    for (let i = 0; i < k; i++) {
      if (sac.length === 0) {
        sac = Array.from({ length: n }, (_, j) => j);
        for (let j = sac.length - 1; j > 0; j--) {
          const m = Math.floor(r() * (j + 1));
          [sac[j], sac[m]] = [sac[m], sac[j]];
        }
      }
      out.push(sac.pop()!);
    }
    return out;
  }

  if (principe === "groupe") {
    // GROUPE : un élément tiré, puis répété un petit nombre de fois avant d'en changer. C'est ce
    // qui fait entendre des paliers là où l'aléa ne fait entendre qu'un grésillement.
    while (out.length < k) {
      const valeur = Math.floor(r() * n);
      const combienDeFois = 2 + Math.floor(r() * 4);
      for (let i = 0; i < combienDeFois && out.length < k; i++) out.push(valeur);
    }
    return out;
  }

  if (principe === "tendance") {
    // TENDANCE : le masque de Koenig. La fenêtre où l'on a le droit de puiser se déplace d'un bout
    // à l'autre de l'ensemble au cours de la suite. Le tirage reste au hasard, mais son domaine
    // dérive — c'est ainsi qu'une forme se dessine sans qu'aucune valeur soit écrite.
    for (let i = 0; i < k; i++) out.push(tirerDansLaFenetre(n, i / k, r));
    return out;
  }

  for (let i = 0; i < k; i++) out.push(Math.floor(r() * n));
  return out;
}

/**
 * La fenêtre du masque de tendance quand on en est à `avance` (de 0 à 1) de la course.
 *
 * UN TIERS DE LA LISTE, ET JAMAIS MOINS DE DEUX ÉLÉMENTS. Une fenêtre d'un seul élément ne tire plus
 * rien : à l'échelle de la forme, la tendance de quatre sections rendait l'ordre de la séquence ; à celle
 * de l'onde, « -1, 1 » en tendance rendait −1 d'un bout à l'autre, et trois ou quatre amplitudes des
 * paliers constants. Avec deux éléments, la fenêtre couvre toute la liste et tire comme l'aléa : c'est
 * le prix du principe, non un défaut. Décision de Fabien du 2026-11-27, « aux deux échelles ».
 *
 * CHAQUE POSITION DE LA FENÊTRE TIENT UNE PART ÉGALE DE LA COURSE. L'ancien calcul arrondissait vers le
 * bas `avance × (n − largeur)`, si bien que la dernière position ne tenait qu'au tout dernier rang : sur
 * 3 419 tirages parmi six, le sixième élément ne sortait jamais. `masqueTendance` lit cette même fonction,
 * pour que le test et le tirage ne puissent pas diverger.
 */
export function fenetreTendance(n: number, avance: number): { bas: number; largeur: number } {
  const largeur = Math.min(n, Math.max(2, Math.round(n / 3)));
  const etapes = n - largeur + 1;
  return { bas: Math.min(n - largeur, Math.floor(Math.max(0, avance) * etapes)), largeur };
}

/** Un rang tiré dans la fenêtre de tendance. */
export function tirerDansLaFenetre(n: number, avance: number, r: () => number): number {
  const { bas, largeur } = fenetreTendance(n, avance);
  return Math.min(n - 1, bas + Math.floor(r() * largeur));
}

/** Les bornes du masque de tendance à un instant donné — de quoi vérifier qu'on les respecte. */
export function masqueTendance(taille: number, combien: number, rang: number): [number, number] {
  const n = Math.max(1, Math.round(taille));
  const { bas, largeur } = fenetreTendance(n, combien <= 0 ? 0 : rang / combien);
  return [bas, Math.min(n - 1, bas + largeur - 1)];
}

/**
 * Lit une liste de nombres écrite à la main, séparés par des virgules ou des espaces.
 *
 * CE QUI NE SE LIT PAS EST REFUSÉ, ET NOMMÉ, et une liste vide aussi, `refus` valant alors la chaîne vide :
 * un jeton illisible était jeté, et une saisie vide ou illisible retombait sur la liste d'origine. Décision
 * de Fabien du 2026-11-22, « Refuse it, named », revue des notations en texte.
 */
export function lireEnsemble(texte: string): { valeurs: number[] } | { refus: string } {
  // Les morceaux vides sont écartés AVANT la conversion : `Number("")` vaut zéro, et non « pas un nombre ».
  const jetons = (texte ?? "").split(/[\s,;]+/).filter((m) => m.trim().length > 0);
  if (jetons.length === 0) return { refus: "" };
  const fautif = jetons.find((m) => !/^[-+−]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(m));
  if (fautif !== undefined) return { refus: fautif };
  return { valeurs: jetons.map((m) => Number(m.replace("−", "-"))) };
}

export const AMPLITUDES_DEFAUT = [-1, -0.6, -0.2, 0.2, 0.6, 1];
export const TEMPS_DEFAUT = [5, 9, 17, 33, 65];

export interface Point {
  /** Rang du premier échantillon du point. */
  echantillon: number;
  amplitude: number;
  /** Nombre d'échantillons jusqu'au point suivant. */
  duree: number;
}

export interface OptionsSegment {
  amplitudes: readonly number[];
  temps: readonly number[];
  principeAmplitudes: Principe;
  principeTemps: Principe;
  longueur: number;
  /** Vrai pour relier les points par un trait, faux pour des marches. */
  interpole: boolean;
}

/**
 * Un segment : des points tirés, puis reliés.
 *
 * LE TRAIT ENTRE DEUX POINTS EST TOUT CE QU'IL Y A. Aucune table d'onde n'est consultée, aucune
 * sinusoïde n'est calculée. Relier les points par un trait ou les laisser en marches change le son
 * plus sûrement que bien des réglages d'effet, et c'est la seule décision de « timbre » que SSP
 * connaisse.
 */
export function construireSegment(o: OptionsSegment, r: () => number): { son: Float32Array; points: Point[] } {
  const longueur = Math.max(1, Math.round(o.longueur));
  const son = new Float32Array(longueur);
  const points: Point[] = [];
  const amplitudes = o.amplitudes.length > 0 ? o.amplitudes : AMPLITUDES_DEFAUT;
  const temps = o.temps.length > 0 ? o.temps : TEMPS_DEFAUT;

  // On tire large : le nombre de points nécessaires dépend des durées tirées, qu'on ignore avant.
  const estimation = Math.ceil(longueur / Math.max(1, Math.min(...temps.map((t) => Math.max(1, Math.round(t)))))) + 8;
  // LA TENDANCE SE TIRE POINT PAR POINT, SUR LA POSITION DANS LE SEGMENT. Tirée d'avance sur `estimation`
  // rangs, elle faisait dériver son masque sur un nombre de points qui suppose chaque écart égal à la plus
  // courte durée : avec les listes d'origine, 17 648 rangs pour 3 408 points posés, et les amplitudes
  // restaient entre −1 et −0,6, à −0,80 de composante continue. La position, elle, va toujours de 0 à la
  // longueur, et les deux tendances avancent ensemble quand les durées s'allongent. Les autres principes
  // tirent d'avance comme avant, amplitudes puis durées : sans tendance, le son ne change pas d'un
  // échantillon. Décision de Fabien du 2026-11-27, « par position ».
  const indicesAmp = o.principeAmplitudes === "tendance" ? null : selectionner(o.principeAmplitudes, amplitudes.length, estimation, r);
  const indicesTemps = o.principeTemps === "tendance" ? null : selectionner(o.principeTemps, temps.length, estimation, r);

  let position = 0;
  for (let rang = 0; position < longueur && rang < estimation; rang++) {
    const it = indicesTemps ? indicesTemps[rang] : tirerDansLaFenetre(temps.length, position / longueur, r);
    const ia = indicesAmp ? indicesAmp[rang] : tirerDansLaFenetre(amplitudes.length, position / longueur, r);
    const duree = Math.max(1, Math.round(temps[it]));
    points.push({ echantillon: position, amplitude: amplitudes[ia], duree });
    position += duree;
  }

  for (let p = 0; p < points.length; p++) {
    const ici = points[p];
    const suivant = points[p + 1];
    const fin = Math.min(longueur, ici.echantillon + ici.duree);
    if (!o.interpole || !suivant) {
      for (let i = ici.echantillon; i < fin; i++) son[i] = ici.amplitude;
      continue;
    }
    const pas = (suivant.amplitude - ici.amplitude) / ici.duree;
    for (let i = ici.echantillon; i < fin; i++) son[i] = ici.amplitude + pas * (i - ici.echantillon);
  }

  return { son, points };
}

export interface OptionsComposition extends Omit<OptionsSegment, "longueur"> {
  frequence: number;
  duree: number;
  /** Combien de segments distincts composer, avant de les ordonner. */
  sections: number;
  /** Le principe qui ordonne les sections — le même vocabulaire, à l'échelle de la forme. */
  principeForme: Principe;
  graine: number;
}

/** Ce qu'une section puise dans les deux listes. */
export interface Selection {
  amplitudes: number[];
  temps: number[];
}

/** Une section composée : sa sélection, ses points, et ce qu'elle fait entendre. */
export interface Section extends Selection {
  points: Point[];
  tenue: Tenue;
}

export interface Composition {
  son: Float32Array;
  /** L'ordre dans lequel les sections ont été posées. */
  ordre: number[];
  /** Les sections composées, posées ou non, dans l'ordre où elles ont été composées. */
  sections: Section[];
  /** Les points que le son porte : les sections dans l'ordre posé, répétitions comprises, la dernière coupée. */
  pointsPoses: number;
  /** Durée moyenne entre deux de ces points, en échantillons. */
  dureeMoyenne: number;
}

/** `combien` rangs tirés sans remise parmi `rangs`. */
function tirerParmi(rangs: readonly number[], combien: number, r: () => number): number[] {
  const sac = [...rangs];
  for (let j = sac.length - 1; j > 0; j--) {
    const m = Math.floor(r() * (j + 1));
    [sac[j], sac[m]] = [sac[m], sac[j]];
  }
  return sac.slice(0, combien);
}

/**
 * La sélection d'une section : ce qu'elle puise dans les deux listes, dans l'ordre écrit.
 *
 * C'EST CE QUI FAIT QUE LES SECTIONS DIFFÈRENT. Elles puisaient toutes dans les listes entières, avec
 * les mêmes principes : sous les défauts, quatre tirages du même bruit, et en « Séquence », où rien ne
 * se tire, quatre fois la même section à l'échantillon. La graine et le principe de la forme ne
 * changeaient alors rien qu'on entende. Décision de Fabien du 2026-11-27, « sélection par section ».
 *
 * LA PLUS BASSE ET LA PLUS HAUTE DES AMPLITUDES SONT TOUJOURS GARDÉES, avec une part tirée au hasard
 * des autres ; des durées, une part non vide. Sans cette contrainte, une section pouvait ne garder que
 * des amplitudes d'un même signe : 0,80 de composante continue au pire sur cinquante graines, contre
 * 0,24 ainsi. Décision de Fabien du 2026-11-27, « P4, les extrêmes ».
 */
export function selectionDeSection(amplitudes: readonly number[], temps: readonly number[], r: () => number): Selection {
  let bas = 0, haut = 0;
  for (let i = 1; i < amplitudes.length; i++) {
    if (amplitudes[i] < amplitudes[bas]) bas = i;
    if (amplitudes[i] > amplitudes[haut]) haut = i;
  }
  const autres = amplitudes.map((_, i) => i).filter((i) => i !== bas && i !== haut);
  const gardees = new Set([bas, haut, ...tirerParmi(autres, Math.floor(r() * (autres.length + 1)), r)]);
  const durees = new Set(tirerParmi(temps.map((_, i) => i), 1 + Math.floor(r() * temps.length), r));
  return {
    amplitudes: amplitudes.filter((_, i) => gardees.has(i)),
    temps: temps.filter((_, i) => durees.has(i)),
  };
}

/**
 * La pièce entière : des sections composées, puis ordonnées par le même vocabulaire.
 *
 * C'EST ICI QUE LA THÈSE DE KOENIG SE VÉRIFIE PLUTÔT QUE DE SE PROCLAMER. Le principe qui ordonne
 * les sections est choisi dans la même liste que celui qui ordonne les amplitudes d'une forme
 * d'onde. Une « série » à l'échelle de la forme veut dire que chaque section passe une fois avant
 * qu'aucune ne repasse — exactement ce qu'elle veut dire à l'échelle de l'échantillon.
 *
 * UNE SECTION SEULE GARDE LES LISTES ENTIÈRES, et ne tire aucune sélection : un graphe réglé sur une
 * section sonne comme avant le 2026-11-27, ce que fige `ssp-sections.test.ts`.
 */
export function composer(o: OptionsComposition): Composition {
  const r = alea(o.graine);
  const total = Math.max(1, Math.round(o.duree * o.frequence));
  const sections = Math.max(1, Math.round(o.sections));
  const longueurSection = Math.max(2, Math.floor(total / sections));
  const amplitudes = o.amplitudes.length > 0 ? o.amplitudes : AMPLITUDES_DEFAUT;
  const temps = o.temps.length > 0 ? o.temps : TEMPS_DEFAUT;

  const composees: Section[] = [];
  const sons: Float32Array[] = [];
  for (let s = 0; s < sections; s++) {
    const selection = sections === 1
      ? { amplitudes: [...amplitudes], temps: [...temps] }
      : selectionDeSection(amplitudes, temps, r);
    const segment = construireSegment({ ...o, ...selection, longueur: longueurSection }, r);
    sons.push(segment.son);
    composees.push({ ...selection, points: segment.points, tenue: tenueDesPoints(segment.points, o.frequence) });
  }

  const combienDePoses = Math.ceil(total / longueurSection);
  const ordre = selectionner(o.principeForme, sections, combienDePoses, r);

  const son = new Float32Array(total);
  let position = 0, pointsPoses = 0, sommeDurees = 0;
  for (const rang of ordre) {
    // LES POINTS COMPTÉS SONT CEUX QUE LE SON PORTE : une section posée deux fois compte deux fois, une
    // section jamais posée ne compte pas, et la dernière s'arrête où s'arrête la pièce.
    for (const p of composees[rang].points) {
      if (position + p.echantillon < total) { pointsPoses++; sommeDurees += p.duree; }
    }
    const source = sons[rang];
    for (let i = 0; i < source.length && position < total; i++, position++) son[position] = source[i];
    if (position >= total) break;
  }

  return {
    son,
    ordre,
    sections: composees,
    pointsPoses,
    dureeMoyenne: pointsPoses > 0 ? sommeDurees / pointsPoses : 0,
  };
}

export interface Tenue {
  /** Au bout de combien de points la suite se répète, ou 0 si elle ne se répète pas. */
  points: number;
  /** La période de l'onde, en échantillons, ou 0. */
  echantillons: number;
  /** La fréquence de l'onde, en hertz, ou `null` quand l'onde n'est pas périodique. */
  hertz: number | null;
  /** L'amplitude unique d'une section dont le signal ne bouge pas, ou `null`. */
  constante: number | null;
}

/**
 * Le son est-il TENU ou BRUITÉ, et à quelle fréquence.
 *
 * RELEVÉ PAR FABIEN : « il sort quelque chose qui s'apparente à du bruit blanc quel que soit le
 * paramétrage ». La mesure a montré que ce n'était pas le cas, et surtout que la cause n'était pas
 * celle qu'on croirait.
 *
 * CE N'EST PAS LA TAILLE DE L'ENSEMBLE DES DURÉES, et c'est la première hypothèse que la mesure a
 * réfutée : à principes égaux, une onde sort de cinq ensembles de durées, des plus serrés aux plus
 * étalés, avec une part voisée de 0,980 à 0,987.
 *
 * C'EST UNE CONJONCTION, ET DEUX RÉGLAGES Y ENTRENT. « Séquence » aux amplitudes est NÉCESSAIRE :
 * sans lui l'ordre des amplitudes est rebattu à chaque passage et rien ne se répète. Il n'est
 * SUFFISANT que si les durées ne sont pas rebattues non plus, c'est-à-dire si « Séquence » est mis
 * aux durées aussi, ou s'il n'y a qu'une seule durée écrite, auquel cas il n'y a rien à rebattre.
 * Sur les vingt-cinq couples de principes et les durées par défaut, UN SEUL tient ; avec une durée
 * unique, cinq tiennent. J'avais d'abord écrit que le principe des amplitudes décidait seul, parce
 * que tous mes cas bougeaient les deux principes ensemble ; c'est l'application qui l'a démenti, et
 * le cas du coin mixte est maintenant permanent.
 *
 * ET LES DEUX DÉFAUTS DU NŒUD SONT « ALÉA », de sorte qu'à l'ouverture il ne peut pas être tenu :
 * c'est ce qui a fait croire à un bruit quoi qu'on touche, alors que la notice envoyait vers les
 * durées, qui commandent le REGISTRE et non la périodicité.
 *
 * LA PÉRIODE SE CALCULE SUR LA SUITE DES POINTS, ET NON SUR LE SON. C'est exact, gratuit, et sans
 * plancher de fréquence : un suiveur de hauteur aurait rendu « bruité » pour une onde dont la
 * période descend sous son plancher. La prédiction tombe d'ailleurs sur la mesure : six amplitudes
 * en séquence sur une durée de 50 donnent 300 échantillons, soit 147,0 Hz, et le suiveur en relève
 * 147,0 ; sur les durées par défaut, 774 échantillons, soit 57,0 Hz, et il en relève 57,0.
 *
 * ELLE PORTE SUR CHAQUE SECTION, et le rapport les juge toutes : c'est la périodicité LOCALE qui
 * s'entend comme une hauteur. Elle ne portait que sur la première, et cela tombait juste parce que les
 * sections étaient identiques chaque fois qu'une onde tenait ; elles diffèrent depuis le 2026-11-27, et
 * une section qui n'a tiré qu'une durée tient même quand le principe des durées n'est pas la séquence.
 *
 * UNE SEULE AMPLITUDE N'EST PAS UNE ONDE TENUE. Sa suite de points se répète à chaque point, et elle était
 * annoncée « tenue à 882 Hz » pour un signal constant à 0,5. Décision de Fabien du 2026-11-27, « le dire
 * constant » plutôt que la refuser.
 */
export function tenueDesPoints(points: readonly Point[], frequence: number): Tenue {
  // Le couple amplitude-durée de chaque point, encodé en un seul nombre pour chercher la période de
  // la SUITE : deux points ne se répètent que si leurs deux composantes se répètent ensemble.
  const amplitudes = [...new Set(points.map((p) => p.amplitude))];
  if (amplitudes.length === 1) return { points: 0, echantillons: 0, hertz: null, constante: amplitudes[0] };
  const couples = points.map((p) => amplitudes.indexOf(p.amplitude) * 1e6 + p.duree);
  const periode = periodeDesNotes(couples);
  if (periode === 0) return { points: 0, echantillons: 0, hertz: null, constante: null };
  let echantillons = 0;
  for (let i = 0; i < periode; i++) echantillons += points[i].duree;
  return {
    points: periode,
    echantillons,
    hertz: echantillons > 0 ? frequence / echantillons : null,
    constante: null,
  };
}

/**
 * Le centre de gravité du spectre, en hertz.
 *
 * C'est la mesure qui dit si les réglages commandent quelque chose : dans un procédé sans notion de
 * fréquence, ce sont les durées choisies qui décident de l'aigu, et le centroïde le montre.
 */
export function centroideHz(x: Float32Array, frequence: number): number {
  // Les passages par zéro suffisent ici, et ne demandent aucune transformée : un signal fait de
  // traits entre des points tirés n'a pas de partiels à résoudre, seulement une vitesse.
  let passages = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) passages++;
  return x.length > 1 ? (passages * frequence) / (2 * (x.length - 1)) : 0;
}

/** Le facteur de crête, en décibels : ce que la répartition des amplitudes produit. */
export function creteDb(x: Float32Array): number {
  let pire = 0, somme = 0;
  for (const v of x) { pire = Math.max(pire, Math.abs(v)); somme += v * v; }
  const efficace = Math.sqrt(somme / Math.max(1, x.length));
  return efficace > 1e-12 ? versDb(pire / efficace) : 0;
}

/** La longueur moyenne des répétitions d'une suite — ce qui sépare « groupe » d'« aléa ». */
export function longueurMoyenneDesPlages(suite: readonly number[]): number {
  if (suite.length === 0) return 0;
  let plages = 1;
  for (let i = 1; i < suite.length; i++) if (suite[i] !== suite[i - 1]) plages++;
  return suite.length / plages;
}
