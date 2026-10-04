// ui/axe-temps.ts — L'arithmétique d'un axe de temps qu'on zoome, qu'on fait défiler, et que suit
// une tête de lecture.
//
// POURQUOI CE MODULE EXISTE. Deux lignes de temps vivaient dans l'application. Celle du sélecteur
// multizones avait tout : un zoom à la molette, une barre de défilement, une tête de lecture qui suit
// la musique et ramène la vue quand elle en sort. Celle du montage n'avait rien de cela, et son
// commentaire de tête disait déjà que la première était « utilisée uniquement par
// selecteur-multi-zones ». Ces règles sont donc sorties là, pour que les deux s'en servent.
//
// ET ELLES SONT PURES, SANS REACT NI CANEVAS, pour une raison précise : ce sont les seules parties
// dont la justesse se démontre. Qu'une tête de lecture soit ramenée dans la vue au bon moment et au
// bon endroit ne se vérifie pas à l'œil sur un enregistrement de cinquante secondes ; cela se
// vérifie sur des nombres.
//
// LES INSTANTS SONT COMPTÉS DEPUIS LE DÉBUT DE L'ÉTENDUE, et non depuis zéro. Le montage accepte un
// début négatif, jusqu'à moins six cents secondes : sa ligne de temps commence donc avant zéro, et
// la part d'une piste qui précède zéro est celle qui ne sonnera pas. C'est à l'appelant de retrancher
// l'origine de son étendue avant d'appeler ces fonctions, et de la rajouter pour lire un instant
// absolu. Le faire ici demanderait de passer cette origine à chaque appel pour un seul soustraction.

/** La part de la vue que l'on garde DEVANT la tête de lecture quand on la rattrape. */
const AVANCE = 0.3;
/** La marge avant le bord droit à partir de laquelle on considère que la tête sort. */
const MARGE_BORD_S = 0.5;

/** Les bornes du zoom, en pourcentage de l'ajustement à la largeur. 100 % montre tout. */
export const ZOOM_MIN = 100;
export const ZOOM_MAX = 50000;
/** Ce qu'un cran de molette multiplie ou divise. */
export const FACTEUR_MOLETTE = 1.3;

export interface Fenetre {
  /** Première seconde visible. */
  debutVisible: number;
  /** Dernière seconde visible, jamais au-delà de la durée. */
  finVisible: number;
  /** Combien de secondes tiennent dans la largeur. */
  largeurVisible: number;
  /** Le défilement maximal : au-delà, on montrerait du vide après la fin. */
  maxDefilement: number;
}

/** Les pixels par seconde, pour une largeur utile et un zoom en pourcentage. 100 % ajuste. */
export function zoomAjuste(largeurPx: number, duree: number, pourcent: number): number {
  if (largeurPx <= 0 || duree <= 0) return 1;
  return (largeurPx / duree) * (pourcent / 100);
}

/** Ce que l'on voit, une fois le défilement ramené dans ses bornes. */
export function fenetre(largeurPx: number, zoom: number, duree: number, defilement: number): Fenetre {
  const largeurVisible = zoom > 0 ? largeurPx / zoom : duree;
  const maxDefilement = Math.max(0, duree - largeurVisible);
  const debutVisible = Math.max(0, Math.min(defilement, maxDefilement));
  return {
    debutVisible,
    finVisible: Math.min(duree, debutVisible + largeurVisible),
    largeurVisible,
    maxDefilement,
  };
}

/** L'instant que désigne une abscisse, comptée depuis le bord gauche de la zone dessinée. */
export function tempsDepuisX(x: number, debutVisible: number, zoom: number): number {
  return debutVisible + (zoom > 0 ? x / zoom : 0);
}

/** L'abscisse d'un instant, dans la même zone. */
export function xDepuisTemps(s: number, debutVisible: number, zoom: number): number {
  return (s - debutVisible) * zoom;
}

/**
 * Où faire défiler pour que la tête de lecture reste visible, ou `null` s'il n'y a rien à faire.
 *
 * LA TÊTE N'EST PAS RECENTRÉE : elle est ramenée à trois dixièmes de la largeur, donc près du bord
 * gauche. C'est ce qui donne à voir ce qui ARRIVE plutôt que ce qui vient de passer, et c'est ce que
 * fait le sélecteur multizones depuis toujours. Recentrer gaspillerait la moitié de la vue à montrer
 * du son déjà entendu.
 *
 * Le rattrapage se déclenche un demi-seconde AVANT le bord droit, et non au bord : atteindre le bord
 * exactement voudrait dire que la tête disparaît une image avant de revenir.
 */
export function defilementPourSuivre(pos: number, f: Fenetre): number | null {
  const sort = pos > f.finVisible - MARGE_BORD_S || pos < f.debutVisible;
  if (!sort) return null;
  return Math.max(0, Math.min(f.maxDefilement, pos - f.largeurVisible * AVANCE));
}

/** Le zoom ramené dans ses bornes. */
export function zoomBorne(pourcent: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(pourcent)));
}

/**
 * Le zoom qu'une position de curseur désigne, et réciproquement.
 *
 * LE CURSEUR EST GÉOMÉTRIQUE, ET C'EST TOUTE LA QUESTION — relevé par Fabien : « on peut zoomer mais
 * ce n'est pas pratique, une fois le zoom fait on ne peut plus dézoomer ». Un curseur LINÉAIRE sur
 * une plage de cinq cents fois donne 102 unités par pixel sur la largeur d'un nœud : mesuré, toute
 * la plage utile, de une à dix fois, tenait dans les NEUF PREMIERS PIXELS d'une piste de 489. On ne
 * pouvait donc que sauter d'un extrême à l'autre, et revenir demandait de viser le pixel de gauche.
 *
 * Un zoom est une échelle, pas une quantité : ce qui compte est le RAPPORT entre deux niveaux, non
 * leur différence. Un même déplacement multiplie donc toujours par le même facteur, comme le fait
 * déjà la molette avec son facteur constant. La fraction va de zéro à un.
 */
export function zoomDepuisFraction(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return zoomBorne(ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** f);
}

export function fractionDepuisZoom(pourcent: number): number {
  const p = zoomBorne(pourcent);
  return Math.log(p / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
}

/**
 * Le défilement qui centre la vue sur un instant, compté depuis l'origine de l'étendue.
 *
 * C'EST CE QUE FAIT LA BARRE DE DÉFILEMENT, au clic comme au glissement : l'instant désigné vient
 * au milieu de la vue. Centrer plutôt que poser le bord gauche rend le clic et le glissement
 * identiques — le curseur suit le pointeur sans sauter au premier contact.
 */
export function defilementPourCentrer(instant: number, f: Fenetre): number {
  return Math.max(0, Math.min(f.maxDefilement, instant - f.largeurVisible / 2));
}

/**
 * Où poser le curseur de la barre de défilement, et quelle part de la piste il couvre.
 *
 * SA LARGEUR DIT COMBIEN L'ON VOIT, ce qui est la moitié de ce qu'une barre de défilement apprend :
 * un curseur qui couvre tout dit qu'il n'y a rien à faire défiler, et un curseur mince dit de
 * combien la pièce dépasse. Les deux nombres sont des fractions de la piste, de zéro à un.
 */
export function curseurDefilement(f: Fenetre, duree: number): { debut: number; largeur: number } {
  if (duree <= 0) return { debut: 0, largeur: 1 };
  const largeur = Math.min(1, f.largeurVisible / duree);
  return { debut: Math.max(0, Math.min(1 - largeur, f.debutVisible / duree)), largeur };
}

/** Ce que devient le zoom à un cran de molette. Vers le bas éloigne, vers le haut rapproche. */
export function zoomMolette(pourcent: number, deltaY: number): number {
  return zoomBorne(pourcent * (deltaY > 0 ? 1 / FACTEUR_MOLETTE : FACTEUR_MOLETTE));
}

/**
 * Le défilement qui garde un instant sous le pointeur quand le zoom change.
 *
 * SANS CELA, ZOOMER DÉPLACE CE QU'ON REGARDE. Le sélecteur multizones zoome sans en tenir compte :
 * la vue garde son début, donc l'endroit visé s'échappe vers la droite à mesure qu'on grossit, et
 * l'on doit le rattraper au défilement. Ancrer le zoom sur le pointeur est ce qui rend le geste
 * utilisable d'une seule main.
 */
export function defilementAncre(
  instantVise: number, xPointeur: number, zoomApres: number, largeurPx: number, duree: number,
): number {
  const largeurVisible = zoomApres > 0 ? largeurPx / zoomApres : duree;
  const maxDefilement = Math.max(0, duree - largeurVisible);
  return Math.max(0, Math.min(maxDefilement, instantVise - (zoomApres > 0 ? xPointeur / zoomApres : 0)));
}
