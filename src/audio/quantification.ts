// audio/quantification.ts — Des durées jouées vers un rythme écrit.
//
// CE QUE C'EST, ET POURQUOI C'EST DIFFICILE. Une suite de durées n'a pas UNE écriture juste : elle
// en a plusieurs, qui se valent autrement. Une note tombée à 0,51 temps peut s'écrire sur la croche,
// ce qui est simple et faux de dix millièmes, ou sur un triolet de doubles, ce qui est exact et
// illisible. Le problème n'est donc pas de trouver la bonne réponse mais de régler un COMPROMIS, et
// c'est pour cela qu'il est réputé le plus difficile du domaine.
//
// D'OÙ VIENT LA MÉTHODE. De la lignée publiée par l'équipe Représentations musicales de l'IRCAM :
// Kant en 1994, puis la bibliothèque RQ en 2015, puis qparse. Son principe tient en trois lignes :
// subdiviser récursivement un segment en parts égales, aligner les points d'entrée sur la frontière
// la plus proche, et classer les arbres obtenus par deux nombres, la DISTANCE à ce qui a été joué et
// la COMPLEXITÉ de l'écriture. Voir `QUANTIFICATION-RYTHMIQUE.md` pour l'état de l'art, les
// licences — tout ce code est en copyleft, donc réimplémenté d'après les publications et non
// traduit — et ce que la littérature neuronale récente résout, qui n'est pas notre problème.
//
// CE QUE GTTM APPORTE, ET CE QU'IL N'APPORTE PAS. La théorie de Lerdahl et Jackendoff dit ce qu'il
// faut peser : une attaque préfère un niveau métrique élevé, une note longue préfère un temps fort.
// Elle ne donne aucun nombre, ses auteurs écrivant eux-mêmes qu'elle ne fournit pas de procédure
// calculable. Les nombres sont donc ici, exposés et réglables, plutôt que cachés dans le code.
//
// L'APPROXIMATION ASSUMÉE. Le meilleur arbre est cherché par programmation dynamique, chaque segment
// étant résolu indépendamment de ses voisins. Les solutions de rechange, elles, ne font varier que
// la division du PREMIER étage, les étages inférieurs restant à leur optimum : un k-best exact sur
// tout l'arbre demanderait une file de priorité sur les hypergraphes, et les solutions qu'il
// ajouterait diffèrent de la meilleure par un détail qu'on ne choisit pas à la main.

import { ecrireArbre, type Mesure, type NoeudRythme } from "./arbre-rythmique";
import type { Note } from "./note";

export interface PoidsQuantification {
  /** Coût d'une division, par nombre de parts. Une part non listée prend `divisionAutre`. */
  division: Record<number, number>;
  divisionAutre: number;
  /** Multiplie le coût d'une division à chaque étage supplémentaire. */
  parEtage: number;
  /**
   * Coût d'une attaque, selon la profondeur du niveau métrique où elle tombe.
   *
   * C'EST ICI QUE GTTM ENTRE. Une attaque sur un temps fort ne coûte rien ; la même sur une
   * subdivision profonde coûte, parce qu'elle demande au lecteur de compter. Sans ce terme, deux
   * écritures de complexité égale en divisions seraient jugées équivalentes alors que l'une place
   * ses notes sur la pulsation et l'autre entre les temps.
   */
  attaqueParEtage: number;
  /** Coût d'un silence, qui alourdit la lecture sans rien ajouter. */
  silence: number;
  /** Coût d'une liaison. */
  liaison: number;
}

export const POIDS_DEFAUT: PoidsQuantification = {
  // Les puissances de deux sont l'ordinaire de la notation ; trois se lit encore d'un coup d'œil ;
  // au-delà, chaque part supplémentaire demande de compter.
  division: { 2: 1, 4: 1.6, 8: 2.2, 3: 2.4, 6: 3.2, 5: 4, 7: 5 },
  divisionAutre: 6,
  parEtage: 1.6,
  attaqueParEtage: 0.35,
  silence: 0.5,
  liaison: 1.4,
};

export interface OptionsQuantification {
  metrique?: [number, number];
  tempo?: number;
  /** Les nombres de parts autorisés dans une division. */
  divisions?: number[];
  /** Étages de subdivision permis sous le premier découpage de la mesure. */
  profondeur?: number;
  /**
   * De zéro à un : la part donnée à la lisibilité contre la fidélité.
   *
   * À ZÉRO, LE RÉSULTAT EST EXACT ET ILLISIBLE ; à un, il est simple et faux. Le réglage n'a pas de
   * bonne valeur dans l'absolu : il dépend de ce qu'on transcrit, et c'est pourquoi il est exposé
   * plutôt que fixé.
   */
  compromis?: number;
  /** Combien de solutions rendre, classées. */
  combien?: number;
  /**
   * La durée à écrire, en secondes, quand elle dépasse la fin de la dernière note.
   *
   * UN SILENCE FINAL N'EST PAS RIEN. Déduire la durée de la dernière note le ferait disparaître de
   * la partition, comme il avait disparu du son avant que la séquence ne porte sa durée.
   */
  duree?: number;
  /**
   * La part de l'intervalle entre deux attaques qu'un vide doit occuper pour s'écrire en silence.
   *
   * UN VIDE N'EST PAS TOUJOURS UN SILENCE. Une noire jouée aux quatre cinquièmes de sa valeur est
   * détachée, non suivie d'un silence : l'écrire en croche plus soupir trahirait l'intention autant
   * que le jeu. Le seuil sépare les deux, et il ne peut pas être déduit du signal seul, c'est
   * pourquoi il est exposé. À un, aucun vide ne devient un silence ; à zéro, le moindre détaché en
   * produit un.
   */
  seuilSilence?: number;
  poids?: PoidsQuantification;
}

export interface Solution {
  mesures: Mesure[];
  /** Écart moyen entre une attaque jouée et sa place écrite, en secondes. */
  distance: number;
  /** Somme des coûts de notation. */
  complexite: number;
  /** Le compromis des deux, ce qui a servi à classer. */
  cout: number;
}

/** Ce qu'une branche coûte et ce qu'elle vaut, pendant la recherche. */
interface Candidat {
  noeud: NoeudRythme;
  /** Somme des écarts, en fraction de mesure. */
  distance: number;
  complexite: number;
}

/** Un instant qui doit retomber sur une frontière : une attaque, ou le début d'un silence. */
interface Point {
  t: number;
  silence: boolean;
}

/**
 * Les instants qu'une écriture doit placer.
 *
 * LE DÉBUT D'UN SILENCE EST UN ÉVÉNEMENT, AU MÊME TITRE QU'UNE ATTAQUE. Sans lui, rien dans le
 * calcul ne dit qu'une note s'arrête : une noire suivie de trois temps vides s'écrivait alors en
 * une ronde, puisque seules les attaques étaient pesées et qu'une seule feuille les plaçait toutes.
 * C'est ainsi que la lignée de Kant reçoit son entrée, une suite d'événements où un silence en est
 * un, et non une simple liste d'attaques.
 *
 * MAIS TOUT VIDE N'EST PAS UN SILENCE, et c'est à quoi sert le seuil : un détaché laisse un vide
 * que la partition n'écrit pas. Voir `seuilSilence`.
 */
function pointsDeSegmentation(notes: readonly Note[], finEcrite: number, seuil: number): Point[] {
  const cle = (t: number) => Math.round(t * 1e6);
  const par = new Map<number, Point>();
  for (const n of notes) par.set(cle(n.debut), { t: n.debut, silence: false });
  for (const n of notes) {
    // Au-delà de ce qu'on écrit, il n'y a rien à placer.
    if (n.fin >= finEcrite - 1e-9) continue;
    // Une autre note sonne encore à cet instant : il n'y a pas de vide.
    if (notes.some((a) => a.debut < n.fin + 1e-9 && a.fin > n.fin + 1e-9)) continue;
    // Le vide se juge sur l'intervalle jusqu'au prochain départ, ou jusqu'à la fin de l'écriture.
    const suivant = notes.reduce((m, a) => (a.debut > n.fin + 1e-9 ? Math.min(m, a.debut) : m), finEcrite);
    const intervalle = suivant - n.debut;
    if (intervalle <= 0 || (suivant - n.fin) / intervalle < seuil) continue;
    if (!par.has(cle(n.fin))) par.set(cle(n.fin), { t: n.fin, silence: true });
  }
  return [...par.values()].sort((x, y) => x.t - y.t);
}

/**
 * La meilleure écriture d'un segment, et ce qu'elle coûte.
 *
 * LES ÉVÉNEMENTS SONT COMPTÉS À LA FRONTIÈRE LA PLUS PROCHE, celle de gauche ou celle de droite :
 * une attaque à 0,99 d'un temps n'est pas en retard d'un temps entier, elle est en avance d'un
 * centième sur le suivant. Compter depuis la gauche seule biaiserait tout vers la subdivision.
 */
function meilleurSegment(
  points: readonly Point[], tenues: readonly { debut: number; fin: number }[],
  a: number, b: number, etage: number,
  o: Required<Pick<OptionsQuantification, "divisions" | "profondeur" | "compromis">>,
  poids: PoidsQuantification,
): Candidat {
  const largeur = b - a;
  // CHAQUE ÉVÉNEMENT EST COMPTÉ PAR LE SEGMENT QUI LE CONTIENT, ET UNE SEULE FOIS. Une première
  // écriture le donnait au segment dont le début est le plus proche, ce qui est plus juste en
  // théorie et faux en pratique : un segment pouvait n'en réclamer aucun alors qu'il en contenait,
  // la recherche s'y arrêtait, et les attaques disparaissaient sans coûter — d'où des solutions qui
  // perdaient la moitié des notes en paraissant excellentes.
  const dans = points.filter((p) => p.t >= a && p.t < b);

  // L'ÉCART SE MESURE AU BORD LE PLUS PROCHE, celui de gauche ou celui de droite : une attaque à
  // 0,99 d'un temps n'est pas en retard d'un temps, elle est en avance d'un centième sur le suivant.
  const distanceFeuille = dans.reduce((s, p) => s + Math.min(p.t - a, b - p.t), 0);
  let complexiteFeuille: number;
  if (dans.length > 0) {
    const attaques = dans.filter((p) => !p.silence).length;
    complexiteFeuille = poids.attaqueParEtage * etage * attaques
      + poids.silence * (dans.length - attaques);
  } else {
    // LA LIAISON COÛTE, ET ELLE NE COÛTAIT RIEN. Sans ce terme, écrire un triolet en quatre
    // doubles dont deux liées sortait moins cher que le triolet lui-même : la recherche préférait
    // une écriture que personne ne lit, parce que le prix des liaisons n'entrait pas dans son
    // calcul. Une feuille muette sur une note qui sonne encore est une liaison ; sinon un silence.
    const tenue = tenues.some((n) => n.debut < a - 1e-9 && n.fin > a + 1e-9);
    complexiteFeuille = tenue ? poids.liaison : poids.silence;
  }
  let meilleur: Candidat = {
    noeud: { valeur: 1 },
    distance: distanceFeuille,
    complexite: complexiteFeuille,
  };

  // DEUX ÉVÉNEMENTS DANS UNE MÊME FEUILLE SONT UNE PERTE, NON UN COMPROMIS : l'écriture rendue
  // compte alors moins de notes que ce qui a été joué, et aucun réglage de lisibilité ne vaut
  // cela. Tant qu'il reste un étage à ouvrir, cette feuille n'est donc pas une réponse admissible ;
  // le compromis ne porte que sur LAQUELLE des divisions choisir. Quand la profondeur est épuisée,
  // la fusion redevient permise et l'écart la chiffre, comme il le fait chez Kant. Sans cette
  // borne, une attaque tombée à un vingtième du début de la mesure disparaissait sans bruit : son
  // écart était trop petit pour peser contre le prix d'une division.
  const fusion = dans.length > 1 && etage < o.profondeur;
  let meilleurCout = fusion ? Infinity : cout(meilleur, o.compromis);

  if (etage >= o.profondeur || dans.length === 0) return meilleur;

  for (const k of o.divisions) {
    if (k < 2) continue;
    const enfants: Candidat[] = [];
    for (let i = 0; i < k; i++) {
      const ai = a + (largeur * i) / k;
      const bi = a + (largeur * (i + 1)) / k;
      enfants.push(meilleurSegment(points, tenues, ai, bi, etage + 1, o, poids));
    }
    const coutDivision = (poids.division[k] ?? poids.divisionAutre) * Math.pow(poids.parEtage, etage);
    const candidat: Candidat = {
      noeud: { valeur: 1, enfants: enfants.map((e) => e.noeud) },
      distance: enfants.reduce((s, e) => s + e.distance, 0),
      complexite: coutDivision + enfants.reduce((s, e) => s + e.complexite, 0),
    };
    const c = cout(candidat, o.compromis);
    if (c < meilleurCout) { meilleur = candidat; meilleurCout = c; }
  }
  return meilleur;
}

/**
 * Le compromis, en un nombre.
 *
 * LA DISTANCE EST RAMENÉE À LA MESURE pour que les deux termes soient comparables : une distance en
 * fractions de mesure et une complexité en points de notation n'ont pas la même échelle, et les
 * additionner telles quelles ferait dépendre le réglage du tempo, ce qui n'aurait aucun sens.
 */
function cout(c: Candidat, compromis: number): number {
  // LA DISTANCE EST EN FRACTIONS DE MESURE, LA MÊME UNITÉ PARTOUT. Elle était ramenée au nombre de
  // notes au moment du classement final et pas pendant la recherche : les deux étages comparaient
  // donc des grandeurs différentes, et le classement contredisait le choix.
  return (1 - compromis) * (c.distance * 100) + compromis * c.complexite;
}

/** Les instants où commence chaque feuille d'un arbre, en fraction de mesure. */
function frontieres(noeud: NoeudRythme, a: number, b: number, out: number[]): void {
  if (!noeud.enfants || noeud.enfants.length === 0) { out.push(a); return; }
  const somme = noeud.enfants.reduce((s, n) => s + Math.max(0, n.valeur), 0) || 1;
  let t = a;
  for (const e of noeud.enfants) {
    const part = ((b - a) * Math.max(0, e.valeur)) / somme;
    frontieres(e, t, t + part, out);
    t += part;
  }
}

/**
 * Décide, feuille par feuille, si l'on écrit une note, un silence ou une liaison.
 *
 * C'EST UNE PASSE À PART, APRÈS LE CHOIX DE LA FORME. La recherche compare des formes ; savoir si
 * une feuille sonne dépend de ce que les attaques sont devenues, donc d'un alignement global qui
 * ne se décide qu'une fois la forme connue. Les mêler aurait rendu la recherche dépendante de son
 * propre résultat.
 *
 * UNE FEUILLE MUETTE EST UNE LIAISON SI LA NOTE PRÉCÉDENTE SONNE ENCORE, et un silence sinon. C'est
 * la distinction que le lecteur attend, et elle ne demande que les fins de notes, dont nous
 * disposons.
 */
function marquer(
  racine: NoeudRythme[], notes: readonly { debut: number; fin: number }[],
  debutMesure: number, largeurMesure: number,
): void {
  const bornes: number[] = [];
  for (const n of racine) bornes.push(0);
  bornes.length = 0;
  const faux: NoeudRythme = { valeur: 1, enfants: [...racine] };
  frontieres(faux, 0, 1, bornes);
  bornes.push(1);

  const feuilles: NoeudRythme[] = [];
  const collecter = (n: NoeudRythme) => {
    if (!n.enfants || n.enfants.length === 0) { feuilles.push(n); return; }
    n.enfants.forEach(collecter);
  };
  racine.forEach(collecter);

  // Chaque attaque rejoint la frontière la plus proche, y compris la fin de la mesure.
  const occupees = new Set<number>();
  for (const note of notes) {
    const t = (note.debut - debutMesure) / largeurMesure;
    if (t < -1e-9 || t >= 1 - 1e-12) continue;
    let meilleur = 0, ecart = Infinity;
    bornes.forEach((x, i) => { const e = Math.abs(x - t); if (e < ecart) { ecart = e; meilleur = i; } });
    if (meilleur < feuilles.length) occupees.add(meilleur);
  }

  feuilles.forEach((f, i) => {
    if (occupees.has(i)) { f.silence = undefined; f.liee = undefined; return; }
    // Muette : liée si une note sonne encore à cet instant, silence sinon.
    const t = debutMesure + bornes[i] * largeurMesure;
    const tenue = notes.some((n) => n.debut < t - 1e-9 && n.fin > t + 1e-9);
    f.silence = tenue ? undefined : true;
    f.liee = tenue ? true : undefined;
  });
}

/** Les noires que dure une mesure. */
const noiresDe = (m: readonly [number, number]) => (m[0] * 4) / Math.max(1, m[1]);

/**
 * Quantifie une suite de notes en arbres rythmiques, du meilleur compromis au moins bon.
 *
 * LA MEILLEURE SOLUTION CHOISIT SON DÉCOUPAGE MESURE PAR MESURE ; les solutions de rechange, elles,
 * imposent le même découpage de premier étage à toute la pièce. C'est l'apport propre de la
 * bibliothèque RQ, et la raison en est musicale autant que technique : ce qu'un compositeur veut
 * pouvoir choisir, c'est « cette pièce en quatre ou en trois », pas le détail d'une subdivision de
 * troisième rang.
 */
export function quantifier(notes: readonly Note[], options: OptionsQuantification = {}): Solution[] {
  const metrique = options.metrique ?? [4, 4];
  const tempo = Math.max(1, options.tempo ?? 120);
  const divisions = (options.divisions ?? [2, 3, 4, 5, 6, 7]).filter((d) => d >= 2);
  const profondeur = Math.max(1, Math.round(options.profondeur ?? 2));
  const compromis = Math.max(0, Math.min(1, options.compromis ?? 0.5));
  const combien = Math.max(1, Math.round(options.combien ?? 3));
  const seuilSilence = Math.max(0, Math.min(1, options.seuilSilence ?? 0.5));
  const poids = options.poids ?? POIDS_DEFAUT;
  if (notes.length === 0) return [];

  const dureeMesure = (noiresDe(metrique) * 60) / tempo;
  const fin = Math.max(options.duree ?? 0, notes.reduce((m, n) => Math.max(m, n.fin), 0));
  const nbMesures = Math.max(1, Math.ceil((fin - 1e-9) / dureeMesure));
  const o = { divisions, profondeur, compromis };
  // CE QU'ON ÉCRIT VA JUSQU'À LA BARRE, non jusqu'à la dernière note : une noire au premier temps
  // laisse trois temps de silence, qui s'écrivent.
  const tousPoints = pointsDeSegmentation(notes, nbMesures * dureeMesure, seuilSilence);

  // Le premier étage de chaque mesure : un découpage en `parts`, essayé pour chaque valeur permise.
  // UN SEUL MORCEAU EN FAIT PARTIE, et il manquait : sans lui, une note qui tient toute la mesure
  // ne pouvait pas s'écrire en une ronde, et sortait en deux blanches liées.
  const partsPremierEtage = [...new Set([1, metrique[0], ...divisions])].filter((p) => p >= 1);

  /** Une mesure écrite sous un découpage de premier étage donné, et ce qu'elle coûte. */
  const unePasse = (m: number, parts: number) => {
    const t0 = m * dureeMesure;
    // Les événements sont ramenés à la mesure ; ceux des mesures voisines restent visibles, une
    // attaque juste avant une barre pouvant revenir à la mesure suivante.
    const points = tousPoints
      .map((p) => ({ t: (p.t - t0) / dureeMesure, silence: p.silence }))
      .filter((p) => p.t > -0.5 && p.t < 1.5);
    const tenues = notes.map((n) => ({
      debut: (n.debut - t0) / dureeMesure, fin: (n.fin - t0) / dureeMesure,
    }));
    const contenu: NoeudRythme[] = [];
    let distance = 0, complexite = 0;
    for (let i = 0; i < parts; i++) {
      const c = meilleurSegment(points, tenues, i / parts, (i + 1) / parts, 1, o, poids);
      contenu.push(c.noeud);
      distance += c.distance * dureeMesure;
      complexite += c.complexite;
    }
    // UN SEUL MORCEAU N'EST PAS UNE DIVISION, DONC NE COÛTE RIEN. Il payait `divisionAutre`,
    // faute d'une entrée à un dans le tableau des poids, et une note tenant la mesure entière en
    // devenait plus chère que deux blanches liées.
    if (parts >= 2 && parts !== metrique[0]) {
      complexite += (poids.division[parts] ?? poids.divisionAutre);
    }
    marquer(contenu, notes, t0, dureeMesure);
    return {
      mesure: { metrique, contenu } as Mesure, distance, complexite,
      cout: (1 - compromis) * ((distance / dureeMesure) * 100) + compromis * complexite,
    };
  };

  const parMesure = Array.from({ length: nbMesures },
    (_, m) => partsPremierEtage.map((parts) => unePasse(m, parts)));

  const assembler = (choix: readonly number[]): Solution => {
    const pieces = choix.map((k, m) => parMesure[m][k]);
    const secondes = pieces.reduce((s, p) => s + p.distance, 0);
    return {
      mesures: pieces.map((p) => p.mesure),
      complexite: pieces.reduce((s, p) => s + p.complexite, 0),
      // L'écart RAPPORTÉ est une moyenne par attaque, en secondes : c'est ce qui se lit. Le coût,
      // lui, emploie la même unité que la recherche, faute de quoi le classement contredirait le
      // choix qui l'a produit.
      distance: secondes / Math.max(1, notes.length),
      cout: pieces.reduce((s, p) => s + p.cout, 0),
    };
  };

  // CHAQUE MESURE CHOISIT SON DÉCOUPAGE, elle ne le subit pas de ses voisines. Un découpage unique
  // imposé à toute la pièce écrivait une mesure vide en quatre pauses de noire parce que la mesure
  // d'avant se divisait en quatre. Le coût étant une somme de termes indépendants par mesure, le
  // minimum de la somme est la somme des minimums, et cet assemblage est donc bien le meilleur.
  const meilleurParMesure = parMesure.map(
    (cs) => cs.reduce((best, c, i) => (c.cout < cs[best].cout ? i : best), 0));
  const candidats = [
    assembler(meilleurParMesure),
    // LES SOLUTIONS DE RECHANGE IMPOSENT UN MÊME DÉCOUPAGE PARTOUT, ce qui donne des lectures
    // franchement différentes plutôt que des variantes de détail : c'est « toute la pièce en trois »
    // contre « toute la pièce en quatre », le choix qu'un compositeur veut faire à la main.
    ...partsPremierEtage.map((_, k) => assembler(parMesure.map(() => k))),
  ];

  // Deux assemblages peuvent aboutir à la même écriture ; une seule est rendue.
  const vues = new Set<string>();
  return candidats.sort((x, y) => x.cout - y.cout).filter((s) => {
    const texte = ecrireArbre(s.mesures);
    if (vues.has(texte)) return false;
    vues.add(texte);
    return true;
  }).slice(0, combien);
}
