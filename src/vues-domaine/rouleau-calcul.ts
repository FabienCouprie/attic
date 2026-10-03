// ui/rouleau-calcul.ts — Où se posent les barres d'un rouleau de séquence, et rien de ce qui se dessine.
//
// POURQUOI UN ROULEAU. Une vingtaine de nœuds rendent désormais des séquences — quantification,
// séparation de voix, solveur de contraintes, algorithme génétique, formules, matrice de
// paramètres —, et il n'existait qu'un seul moyen de voir ce qu'ils rendent : le graver. La gravure
// est un détour coûteux, elle demande un arbre rythmique pour dire quelque chose, et elle perd en
// route ce qui a justifié tout ce flux.
//
// ELLE PERD LE MICROTON, PRÉCISÉMENT. `audio/sequence.ts` existe parce qu'une hauteur qui ne tombe
// pas sur un demi-ton ne passait pas par un fichier `.mid`. Or la portée ne sait pas davantage la
// montrer : une note à 60,5 s'y écrit avec une altération, c'est-à-dire un signe posé à côté d'une
// tête placée sur la ligne du do. Sur un rouleau, l'axe des hauteurs est continu : 60,5 se pose
// entre deux rangées et chevauche les deux, et l'écart se VOIT au lieu de se lire.
//
// CE QUE LE MODULE CALCULE, EN FRACTIONS. Rien n'est en pixels ici : les abscisses et les ordonnées
// vont de zéro à un, et la vue les multiplie par ce qu'elle a. C'est la règle de
// `audio/arbre-disposition.ts` et de `ui/ligne-temps-calcul.ts`, d'où vient le pas de graduation,
// recopié nulle part.
//
// L'ORDONNÉE DESCEND. Zéro est en haut, comme partout en dessin d'écran, et l'aigu est donc en haut :
// une hauteur plus grande donne une ordonnée plus petite.

import type { Note } from "../audio/note";
import { nomNote } from "../audio/nom-note";
import type { Sequence } from "../audio/sequence";
import { dureeSequence } from "../audio/sequence";

import { estNoire } from "./clavier-disposition";
import { pasDeGraduation } from "./ligne-temps-calcul";

/** La largeur de référence du dessin, comme celle de l'arbre rythmique. */
export const L_ROULEAU = 1000;

/**
 * Combien de barres au plus.
 *
 * CE N'EST PAS UNE LIMITE DE GOÛT. Une barre est un rectangle dans le document, et une séquence
 * d'algorithme génétique ou de matrice de paramètres en compte facilement des dizaines de milliers :
 * les poser toutes figerait la fenêtre, ce que ce dépôt refuse ailleurs pour la même raison — deux
 * mille colonnes par piste dans `audio/pistes-visu.ts`. Au-delà, le compte des notes laissées de
 * côté est rendu, pour qu'il soit DIT plutôt que tu.
 */
export const BARRES_MAX = 2000;

/** Les bandes de nuance : quatre suffisent à voir un accent, et une de plus ne se distinguerait pas. */
export const NUANCES = 4;

/** Combien de demi-tons l'axe montre au minimum : moins d'une octave donnerait des barres énormes. */
export const DEMI_TONS_MIN = 12;

/** Ce qu'on laisse respirer au-dessus et au-dessous des notes. */
export const MARGE_DEMI_TONS = 2;

/** Une barre ne descend pas sous cette largeur : une attaque brève ne doit pas devenir invisible. */
export const LARGEUR_MIN = 2 / L_ROULEAU;

export interface BarreRouleau {
  /** Le bord gauche, de zéro à un. */
  x: number;
  /** La largeur, de zéro à un, jamais nulle. */
  largeur: number;
  /** Le bord haut, de zéro à un, zéro étant l'aigu. */
  y: number;
  /** La hauteur en demi-tons, telle qu'elle est arrivée, fraction comprise. */
  note: number;
  /** La voix, zéro pour la première. */
  voix: number;
  /** La bande de nuance, de zéro à `NUANCES - 1`. */
  nuance: number;
  debut: number;
  fin: number;
  /** Le nom de la hauteur, écart en cents compris : « A#4−50 ». */
  nom: string;
  /** Vrai quand la hauteur ne tombe pas sur un demi-ton, donc quand la barre chevauche deux rangées. */
  microton: boolean;
}

export interface RangeeRouleau {
  /** Le bord haut de la rangée, de zéro à un. */
  y: number;
  /** Le demi-ton de cette rangée. */
  note: number;
  /** Vrai pour une touche noire : c'est ce qui rend un rouleau lisible sans étiquettes. */
  noire: boolean;
  /** Le nom, posé sur les do seulement : douze étiquettes par octave seraient illisibles. */
  etiquette?: string;
}

export interface GraduationRouleau {
  x: number;
  secondes: number;
  etiquette: string;
}

export interface VoixRouleau {
  numero: number;
  nom?: string;
  /** Combien de notes cette voix porte, barres laissées de côté comprises. */
  notes: number;
}

export interface Rouleau {
  barres: BarreRouleau[];
  rangees: RangeeRouleau[];
  graduations: GraduationRouleau[];
  /** L'épaisseur d'une rangée, et donc d'une barre : un demi-ton, de zéro à un. */
  epaisseur: number;
  /** Le demi-ton le plus grave montré, borne comprise. */
  basse: number;
  /** Le demi-ton le plus aigu montré, borne comprise. */
  aigue: number;
  /** La longueur de l'axe, en secondes, silence final compris. */
  duree: number;
  /** Où s'arrête la dernière note, en secondes. */
  finNotes: number;
  /** Où s'arrête la dernière note, de zéro à un : au-delà, la pièce se tait sans finir. */
  xFinNotes: number;
  voix: VoixRouleau[];
  /** Combien de hauteurs ne tombent pas sur un demi-ton. */
  microtons: number;
  /** Combien de notes n'ont pas été dessinées, faute de place. */
  laissees: number;
}

/** La bande de nuance d'une vélocité, de zéro à `NUANCES - 1`. */
export function bandeDeNuance(velocite: number): number {
  if (!Number.isFinite(velocite)) return NUANCES - 1;
  const v = Math.min(127, Math.max(0, velocite));
  return Math.min(NUANCES - 1, Math.floor((v / 128) * NUANCES));
}

/**
 * Les bornes de hauteur à montrer, en demi-tons entiers.
 *
 * ELLES SONT ENTIÈRES, ET C'EST CE QUI ALIGNE LES RANGÉES. Des bornes fractionnaires — celles que
 * donneraient directement des microtons — décaleraient tout le damier des touches noires d'un
 * demi-ton fractionnaire, et le rouleau ne ressemblerait plus à un clavier.
 */
export function bornesDeHauteur(notes: readonly Note[]): { basse: number; aigue: number } {
  const hauteurs = notes.map((n) => n.note).filter((h) => Number.isFinite(h));
  // Sans note, on montre l'octave du do central : un axe vide doit rester un axe.
  if (hauteurs.length === 0) return { basse: 60, aigue: 72 };
  let basse = Math.floor(Math.min(...hauteurs)) - MARGE_DEMI_TONS;
  let aigue = Math.ceil(Math.max(...hauteurs)) + MARGE_DEMI_TONS;
  // Une seule note, ou deux voisines, laisserait une rangée haute comme le nœud : on ouvre autour.
  const manque = DEMI_TONS_MIN - (aigue - basse);
  if (manque > 0) {
    basse -= Math.floor(manque / 2);
    aigue += Math.ceil(manque / 2);
  }
  return { basse, aigue };
}

/** Les graduations du temps, aux instants ronds que la largeur permet de distinguer. */
export function graduationsDuTemps(duree: number, largeurPx: number): GraduationRouleau[] {
  const pas = pasDeGraduation(duree, largeurPx);
  const chiffres = pas >= 1 ? 0 : pas >= 0.1 ? 1 : 2;
  const out: GraduationRouleau[] = [];
  // Le `1e-9` rattrape les pas qui ne tombent pas juste en binaire : sans lui, la dernière
  // graduation d'un axe de deux secondes au pas de 0,5 manquerait une fois sur deux.
  for (let t = 0; t <= duree + 1e-9; t += pas) {
    out.push({ x: Math.min(1, t / duree), secondes: t, etiquette: t.toFixed(chiffres) });
  }
  return out;
}

/**
 * Tout ce qu'il faut pour dessiner un rouleau, et rien de plus.
 *
 * LES NOTES SONT PRISES DANS L'ORDRE DU TEMPS quand il faut en laisser. Une séquence arrive parfois
 * triée par voix : garder les deux mille premières du tableau montrerait alors la voix de basse
 * entière et rien d'autre, ce qui ment sur la pièce. Trier d'abord montre le début de tout.
 */
export function disposerRouleau(s: Sequence, largeurPx = L_ROULEAU): Rouleau {
  const notes = (s.notes ?? []).filter((n) =>
    n && Number.isFinite(n.note) && Number.isFinite(n.debut) && Number.isFinite(n.fin));
  const { basse, aigue } = bornesDeHauteur(notes);
  const etendue = aigue - basse;
  const epaisseur = 1 / etendue;

  const finNotes = notes.reduce((m, n) => Math.max(m, n.fin), 0);
  // Un axe de durée nulle — aucune note, ou toutes de longueur nulle au temps zéro — donnerait des
  // abscisses infinies. Une seconde est alors montrée, et l'axe reste un axe.
  const duree = Math.max(dureeSequence({ ...s, notes }), 1e-3) || 1;

  const triees = [...notes].sort((a, b) => a.debut - b.debut || a.note - b.note);
  const gardees = triees.slice(0, BARRES_MAX);

  const barres: BarreRouleau[] = gardees.map((n) => ({
    x: Math.max(0, Math.min(1, n.debut / duree)),
    largeur: Math.max(LARGEUR_MIN, Math.min(1, (n.fin - n.debut) / duree)),
    // L'AIGU EN HAUT : la rangée d'un demi-ton `h` a son bord haut à `(aigue - h - 1)` rangées du
    // sommet. Sur 60,5 le résultat n'est pas un multiple de l'épaisseur, et la barre chevauche.
    y: Math.max(0, Math.min(1 - epaisseur, (aigue - n.note - 1) * epaisseur)),
    note: n.note,
    voix: Math.max(0, Math.floor(n.voix ?? 0)),
    nuance: bandeDeNuance(n.velocite),
    debut: n.debut,
    fin: n.fin,
    nom: nomNote(n.note),
    microton: !Number.isInteger(n.note),
  }));

  const rangees: RangeeRouleau[] = [];
  for (let h = basse; h < aigue; h++) {
    rangees.push({
      y: (aigue - h - 1) * epaisseur,
      note: h,
      noire: estNoire(h),
      // Un do porte son nom ; les onze autres rangées de l'octave se comptent depuis lui.
      etiquette: ((h % 12) + 12) % 12 === 0 ? nomNote(h) : undefined,
    });
  }

  // LE COMPTE DES VOIX PORTE SUR TOUTES LES NOTES, non sur les barres gardées : une voix entièrement
  // laissée de côté doit rester nommée au pied du dessin, sans quoi elle disparaîtrait en silence.
  const parVoix = new Map<number, VoixRouleau>();
  for (const n of notes) {
    const numero = Math.max(0, Math.floor(n.voix ?? 0));
    const deja = parVoix.get(numero);
    if (deja) deja.notes++;
    else parVoix.set(numero, { numero, nom: s.voix?.find((v) => v.numero === numero)?.nom, notes: 1 });
  }

  return {
    barres,
    rangees,
    graduations: graduationsDuTemps(duree, largeurPx),
    epaisseur,
    basse,
    aigue,
    duree,
    finNotes,
    xFinNotes: Math.max(0, Math.min(1, finNotes / duree)),
    voix: [...parVoix.values()].sort((a, b) => a.numero - b.numero),
    microtons: notes.filter((n) => !Number.isInteger(n.note)).length,
    laissees: triees.length - gardees.length,
  };
}
