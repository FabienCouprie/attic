// audio/cercle-film.ts — L'état de l'image à un instant, et son dessin sur un canevas.
//
// POURQUOI UNE SECONDE FONCTION DE RENDU, et non un portage. Le cercle pulsant n'écrit AUCUNE
// image : il émet des clés d'animation en SMIL et laisse le navigateur interpoler. Il n'y a donc
// rien à convertir. Un film demande l'état à un instant donné, ce qui est une autre question, et
// c'est cette question-là qui ouvre les effets que le SVG déclaratif ne sait pas rendre : la
// rémanence, les particules, la composition additive.
//
// CE QUE LA MESURE AUTORISE. Sur le moteur de l'application, encoder une image de 1280 par 720
// coûte 10,7 ms, dont **0,2 ms de dessin** : l'encodeur prend 98 % du temps, et la richesse de la
// figure est donc à peu près gratuite. Le plafond n'est pas le nombre de formes, c'est le nombre
// d'images. Quarante formes par image tiennent dans deux dixièmes de milliseconde.
//
// L'ÉTAT EST SÉPARÉ DU DESSIN, et c'est ce qui le rend vérifiable. `etatALInstant` ne touche aucun
// canevas : il rend des nombres, que l'on éprouve sans peindre. `dessiner` ne décide de rien, il
// pose ce qu'on lui donne.

import type { Pulsation } from "./cercle-pulsant";
import { couleurVersCamelot } from "./cercle-pulsant";
import { FIGURES, melangerFigures, pointsSuperforme, type Superforme } from "./superforme";
import { styleNomme } from "./styles-film";

export interface OptionsFilm {
  /** Durée du film, en secondes. */
  dureeSec: number;
  /** Combien de temps un anneau met à s'ouvrir et s'éteindre, en secondes. */
  vieAnneau: number;
  /** Combien de particules part de chaque pulsation. Zéro : aucune. */
  particules: number;
  /** Durée de vie d'une particule, en secondes. */
  vieParticule: number;
  /** Part du rayon que le noyau garde entre deux frappes, de 0 à 1. */
  creux: number;
  /** La figure de départ. Toutes les formes sont des réglages de la même équation. */
  figureA: Superforme;
  /** La figure d'arrivée. Le film passe de l'une à l'autre. */
  figureB: Superforme;
  /** Quelle part du trajet de A vers B est parcourue sur la durée, de 0 à 1. */
  morphing: number;
  /** La main qui trace : un des douze styles. */
  style: string;
  /** Les trois couleurs tirées du prompt. Vide : la teinte des pulsations décide seule. */
  palette: readonly string[];
}

export const OPTIONS_FILM: OptionsFilm = {
  dureeSec: 20, vieAnneau: 1.6, particules: 14, vieParticule: 1.1, creux: 0.22,
  figureA: FIGURES.Cercle, figureB: FIGURES.Étoile, morphing: 1,
  style: "Style 5", palette: [],
};

export interface Anneau { rayon: number; opacite: number; teinte: number }
export interface Particule { x: number; y: number; opacite: number; teinte: number }

export interface EtatImage {
  /** Rayon du noyau, en part du rayon maximal. */
  noyau: number;
  teinte: number;
  saturation: number;
  clarte: number;
  anneaux: Anneau[];
  particules: Particule[];
  /** Sommets du polygone : la tonalité, rendue visible. */
  sommets: number;
  /** Angle du polygone, en radians. */
  angle: number;
  /** La figure de l'instant, quelque part entre celle de départ et celle d'arrivée. */
  figure: Superforme;
}

/** La dernière pulsation frappée à cet instant, ou null avant la première. */
function derniere(p: readonly Pulsation[], t: number): { pulse: Pulsation; rang: number } | null {
  let rang = -1;
  for (let i = 0; i < p.length; i++) {
    if (p[i].temps > t) break;
    rang = i;
  }
  return rang < 0 ? null : { pulse: p[rang], rang };
}

/**
 * L'enveloppe d'une frappe : une attaque brève, puis une retombée vers le creux.
 *
 * ELLE N'EST PAS LINÉAIRE, à la différence de l'interpolation que le SVG impose. Une frappe monte
 * en vingt millisecondes et retombe en exponentielle : c'est ce qui fait qu'une pulsation se lit
 * comme une percussion et non comme une respiration.
 */
export function enveloppe(depuis: number, creux: number): number {
  const ATTAQUE = 0.02;
  if (depuis < 0) return creux;
  if (depuis < ATTAQUE) return creux + (1 - creux) * (depuis / ATTAQUE);
  return creux + (1 - creux) * Math.exp(-(depuis - ATTAQUE) * 2.2);
}

/** Un tirage reproductible, pour que deux rendus du même film donnent la même image. */
const tirage = (graine: number) => {
  let g = (graine | 0) || 1;
  return () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
};

/**
 * L'état de l'image à l'instant `t`.
 *
 * LES ANNEAUX ET LES PARTICULES SONT RECALCULÉS, JAMAIS ACCUMULÉS. L'état à un instant ne dépend que
 * des pulsations et de cet instant : le film se rend donc par tranches, se reprend, et deux calculs
 * de la même image donnent la même image. Accumuler aurait lié chaque image à la précédente, et
 * rendu tout découpage impossible.
 */
export function etatALInstant(p: readonly Pulsation[], t: number, o: OptionsFilm): EtatImage {
  const d = derniere(p, t);
  const ref = d?.pulse ?? p[0] ?? { temps: 0, rayon: 0.5, teinte: 0, saturation: 0.6, clarte: 0.5 };
  const noyau = d ? ref.rayon * enveloppe(t - ref.temps, o.creux) : o.creux * 0.5;

  const anneaux: Anneau[] = [];
  const particules: Particule[] = [];
  for (const pulse of p) {
    const age = t - pulse.temps;
    if (age < 0) break;
    if (age < o.vieAnneau) {
      const u = age / o.vieAnneau;
      anneaux.push({ rayon: 0.15 + u * (0.95 - 0.15), opacite: (1 - u) * (1 - u), teinte: pulse.teinte });
    }
    if (o.particules > 0 && age < o.vieParticule) {
      const u = age / o.vieParticule;
      const alea = tirage(Math.round(pulse.temps * 1000) + 1);
      for (let k = 0; k < o.particules; k++) {
        const angle = alea() * Math.PI * 2;
        const vitesse = 0.25 + alea() * 0.7 * pulse.rayon;
        const r = u * vitesse;
        particules.push({
          x: Math.cos(angle) * r, y: Math.sin(angle) * r,
          opacite: (1 - u) * (1 - u) * 0.9, teinte: pulse.teinte,
        });
      }
    }
  }

  // LE POLYGONE DIT LA TONALITÉ. Le code Camelot d'une couleur donne un nombre de 1 à 12, qui
  // devient le nombre de sommets : la figure change de forme quand la musique change de case, et
  // l'on voit la modulation avant de l'entendre nommer.
  const camelot = Number.parseInt(couleurVersCamelot(ref.teinte, ref.saturation), 10) || 1;
  return {
    noyau, teinte: ref.teinte, saturation: ref.saturation, clarte: ref.clarte,
    anneaux, particules,
    sommets: 2 + camelot,
    angle: (t / Math.max(0.1, o.dureeSec)) * Math.PI * 2 + (d?.rang ?? 0) * 0.08,
    // LA FIGURE SE DÉFORME AU FIL DE LA PIÈCE, comme la couleur tourne : le trajet de A vers B est
    // parcouru sur la durée, et « Morphing » dit quelle part en est faite. À zéro, la figure de
    // départ tient tout le film.
    figure: melangerFigures(o.figureA, o.figureB,
      (t / Math.max(0.1, o.dureeSec)) * Math.min(1, Math.max(0, o.morphing))),
  };
}

const hsl = (t: number, s: number, l: number, a = 1) =>
  `hsl(${((t % 360) + 360) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}% / ${a.toFixed(3)})`;

/**
 * Peint un état sur un canevas.
 *
 * LA RÉMANENCE EST LE PREMIER EFFET, et le moins cher : au lieu d'effacer, on couvre d'un fond
 * translucide, et ce qui précède s'efface tout seul en quelques images. Une traînée apparaît, que
 * le SVG déclaratif ne pouvait pas donner.
 *
 * LA COMPOSITION ADDITIVE EST LE SECOND : deux formes qui se croisent s'éclaircissent au lieu de se
 * masquer. C'est ce qui fait qu'un amas de particules brille, et non qu'il empile des disques.
 */
export function dessinerImage(
  cx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  etat: EtatImage, largeur: number, hauteur: number, remanence = 0.24,
  style = "Style 5", palette: readonly string[] = [],
): void {
  const main = styleNomme(style);
  let g = 12345;
  const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
  const centre = { x: largeur / 2, y: hauteur / 2 };
  const rayonMax = Math.min(largeur, hauteur) * 0.42;

  cx.globalCompositeOperation = "source-over";
  cx.fillStyle = `rgb(8 8 14 / ${remanence})`;
  cx.fillRect(0, 0, largeur, hauteur);

  cx.globalCompositeOperation = "lighter";

  // LA FIGURE SE CALCULE UNE FOIS PAR IMAGE, et non une fois par anneau : elle est la même pour
  // tous, seule l'échelle change. Dix anneaux à deux cent quarante points feraient deux mille
  // quatre cents évaluations là où deux cent quarante suffisent.
  // LA ROTATION EST APPLIQUÉE UNE FOIS, AUX POINTS, et non à chaque tracé : les styles reçoivent
  // une figure déjà tournée et n'ont pas à connaître l'angle. Sans cela, une étoile resterait
  // plantée droite pendant que tout le reste tourne.
  const cos = Math.cos(etat.angle), sin = Math.sin(etat.angle);
  const tourne = pointsSuperforme(etat.figure, 240)
    .map((q) => ({ x: q.x * cos - q.y * sin, y: q.x * sin + q.y * cos }));
  const tracer = (rayon: number) => {
    cx.beginPath();
    for (let i = 0; i <= tourne.length; i++) {
      const q = tourne[i % tourne.length];
      if (i === 0) cx.moveTo(centre.x + q.x * rayon, centre.y + q.y * rayon);
      else cx.lineTo(centre.x + q.x * rayon, centre.y + q.y * rayon);
    }
    cx.closePath();
  };

  // CHAQUE CONTOUR PASSE PAR LE STYLE, et c'est le seul point de passage : changer de main change
  // l'aspect de tout, sans que les anneaux aient à connaître les douze manières.
  for (const a of etat.anneaux) {
    main({
      cx, centre, forme: tourne, rayon: a.rayon * rayonMax,
      couleur: palette.length > 0 ? palette[1 + (etat.sommets % Math.max(1, palette.length - 1))] ?? palette[0]
        : hsl(a.teinte, 0.8, 0.55),
      opacite: a.opacite * 0.85, epaisseur: 1 + a.opacite * 5, alea, palette,
    });
  }

  for (const q of etat.particules) {
    cx.fillStyle = hsl(q.teinte + 30, 0.9, 0.7, q.opacite);
    cx.beginPath();
    cx.arc(centre.x + q.x * rayonMax, centre.y + q.y * rayonMax, 1.5 + q.opacite * 3, 0, Math.PI * 2);
    cx.fill();
  }

  // Le polygone de la tonalité, tracé en sens inverse : il contredit la figure au lieu de la
  // doubler, et c'est ce qui donne le moiré quand les deux se croisent.
  cx.strokeStyle = hsl(etat.teinte + 180, 0.7, 0.62, 0.55);
  cx.lineWidth = 2;
  cx.beginPath();
  const r = rayonMax * (0.5 + etat.noyau * 0.45);
  for (let k = 0; k <= etat.sommets; k++) {
    const a = -etat.angle * 0.6 + (k / etat.sommets) * Math.PI * 2;
    const x = centre.x + Math.cos(a) * r, y = centre.y + Math.sin(a) * r;
    if (k === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
  }
  cx.stroke();

  // Le noyau prend la forme de la figure, et non plus celle d'un disque.
  cx.fillStyle = hsl(etat.teinte, etat.saturation, Math.min(0.9, etat.clarte + 0.2), 0.5);
  tracer(etat.noyau * rayonMax);
  cx.fill();

  const rn = etat.noyau * rayonMax;
  const halo = cx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, Math.max(1, rn * 1.8));
  halo.addColorStop(0, hsl(etat.teinte, etat.saturation, Math.min(0.92, etat.clarte + 0.25), 0.95));
  halo.addColorStop(0.45, hsl(etat.teinte, etat.saturation, etat.clarte, 0.5));
  halo.addColorStop(1, hsl(etat.teinte, etat.saturation, etat.clarte, 0));
  cx.fillStyle = halo;
  cx.beginPath();
  cx.arc(centre.x, centre.y, Math.max(1, rn * 1.8), 0, Math.PI * 2);
  cx.fill();

  cx.globalCompositeOperation = "source-over";
}
