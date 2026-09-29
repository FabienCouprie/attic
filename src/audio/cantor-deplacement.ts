// audio/cantor-deplacement.ts — La poussière de Cantor qui déplace au lieu de retirer.
//
// CE QUE CE MODULE FAIT, ET POURQUOI IL EXISTE. Demandé par Fabien : « une poussière de Cantor qui
// supprime d'un endroit et ajoute à un autre ». La construction de Cantor, telle que le dépôt
// l'emploie déjà pour engendrer un rythme, ne sait que RETIRER : on ôte le tiers médian, puis le
// tiers médian de ce qui reste, et ainsi de suite ; ce qui survit est la poussière, et le reste
// disparaît. La densité baisse donc à chaque niveau, et une pièce s'appauvrit.
//
// ICI RIEN NE DISPARAÎT. La construction sert de PARTITION du temps : d'un côté la poussière, de
// l'autre les trous. Un événement tombé dans un trou n'est pas supprimé, il est porté dans la
// poussière. Le compte est conservé exactement, et c'est ce qui distingue cette opération d'un
// filtre : elle ne retire pas de matière, elle la redistribue.
//
// LA POUSSIÈRE EST AUTO-SIMILAIRE, et c'est tout l'intérêt de s'en servir comme cible. Les
// événements déplacés s'agglutinent selon la même loi à toutes les échelles : on obtient des
// grappes serrées séparées de silences, et non un nuage uniforme. Un tirage au sort sur toute la
// durée donnerait le nuage.
//
// D'APRÈS Georg Cantor, « Über unendliche, lineare Punktmannigfaltigkeiten », Mathematische Annalen
// 21, 1883, pour l'ensemble ; l'usage rythmique de l'auto-similarité par suppression est celui que
// `rythme-cantor` emploie déjà.

import { creerAleatoire } from "../core";

/** Une part de temps, de son début à sa fin, toutes deux en secondes. */
export interface Segment {
  debut: number;
  fin: number;
}

/** Comment la construction se fait : en combien de parts, et laquelle on ôte. */
export interface FormeDeCantor {
  /** Le nombre de parts égales à chaque niveau. Trois donne l'ensemble classique. */
  parts: number;
  /** La part ôtée : le centre de l'ensemble classique, ou un bord. */
  otee: "centre" | "gauche" | "droite";
  /** Le nombre de niveaux de récursion. */
  profondeur: number;
}

/**
 * Les segments qui survivent à la construction, dans l'ordre du temps.
 *
 * UNE PART OTÉE PAIRE N'A PAS DE CENTRE, et il faut le décider plutôt que d'arrondir en silence :
 * avec un nombre pair de parts, « centre » ôte celle qui suit immédiatement le milieu. Les deux
 * autres choix ne posent pas la question.
 */
export function poussiereDeCantor(duree: number, forme: FormeDeCantor): Segment[] {
  const parts = Math.max(2, Math.floor(forme.parts));
  const profondeur = Math.max(0, Math.floor(forme.profondeur));
  let segments: Segment[] = [{ debut: 0, fin: Math.max(0, duree) }];
  const indexOte = forme.otee === "gauche" ? 0
    : forme.otee === "droite" ? parts - 1
      : Math.floor(parts / 2);
  for (let niveau = 0; niveau < profondeur; niveau++) {
    const suivant: Segment[] = [];
    for (const s of segments) {
      const pas = (s.fin - s.debut) / parts;
      for (let k = 0; k < parts; k++) {
        if (k === indexOte) continue;
        suivant.push({ debut: s.debut + k * pas, fin: s.debut + (k + 1) * pas });
      }
    }
    segments = suivant;
    // Une récursion sur un segment devenu plus court qu'une milliseconde ne décrit plus rien
    // d'audible, et le nombre de segments croît comme une puissance : on s'arrête là.
    if (segments.length === 0 || segments[0].fin - segments[0].debut < 0.001) break;
  }
  return segments;
}

/** Vrai quand l'instant tombe dans la poussière, et non dans un trou. */
export function dansLaPoussiere(instant: number, segments: readonly Segment[]): boolean {
  return segments.some((s) => instant >= s.debut && instant < s.fin);
}

/** La longueur totale de la poussière : ce qu'il reste de temps où poser quelque chose. */
export const mesureDeLaPoussiere = (segments: readonly Segment[]): number =>
  segments.reduce((total, s) => total + (s.fin - s.debut), 0);

/**
 * L'instant de la poussière le plus proche d'un instant donné.
 *
 * LE DÉPLACEMENT MINIMAL GARDE LA FORME. Un événement porté au point le plus proche reste là où on
 * l'attendait, à peu près : la pièce se resserre sans se défigurer. C'est l'inverse d'un tirage,
 * qui la refait entièrement.
 */
export function plusProcheDansLaPoussiere(instant: number, segments: readonly Segment[]): number {
  if (segments.length === 0) return instant;
  let meilleur = segments[0].debut;
  let ecart = Infinity;
  for (const s of segments) {
    // Le point du segment le plus proche : l'instant lui-même s'il est dedans, sinon le bord.
    // La fin est exclue, un événement posé dessus retomberait dans le trou suivant.
    const candidat = instant < s.debut ? s.debut : instant >= s.fin ? Math.max(s.debut, s.fin - 1e-6) : instant;
    const d = Math.abs(candidat - instant);
    if (d < ecart) { ecart = d; meilleur = candidat; }
  }
  return meilleur;
}

/**
 * Un instant tiré au sort dans la poussière, à densité uniforme sur sa longueur.
 *
 * LE TIRAGE SE FAIT SUR LA LONGUEUR TOTALE ET NON SUR LE NOMBRE DE SEGMENTS : tirer un segment au
 * hasard puis un point dedans donnerait aux segments courts le même poids qu'aux longs, ce qui
 * n'est pas la poussière mais une autre loi.
 */
export function tireDansLaPoussiere(segments: readonly Segment[], alea: () => number): number {
  const total = mesureDeLaPoussiere(segments);
  if (total <= 0) return segments[0]?.debut ?? 0;
  let reste = alea() * total;
  for (const s of segments) {
    const longueur = s.fin - s.debut;
    if (reste < longueur) return s.debut + reste;
    reste -= longueur;
  }
  return segments[segments.length - 1].fin;
}

/** Où l'on pose un événement sorti d'un trou. */
export type OuPoser = "proche" | "hasard";

export interface OptionsDeplacement extends FormeDeCantor {
  /** La part des événements des trous qui bougent, de zéro à un. */
  part: number;
  ou: OuPoser;
  graine: number;
}

/** Ce qu'un déplacement a fait, pour que le composant puisse le dire. */
export interface RapportDeplacement {
  /** Le nombre d'événements reçus, qui est aussi celui des rendus. */
  total: number;
  /** Combien tombaient dans un trou. */
  dansLesTrous: number;
  /** Combien ont effectivement bougé. */
  deplaces: number;
  /** Le déplacement moyen, en secondes, sur ceux qui ont bougé. */
  ecartMoyen: number;
  /** Le nombre de segments de poussière, et la part de la durée qu'ils couvrent. */
  segments: number;
  partDeLaDuree: number;
}

/**
 * LE TIRAGE VIENT DU GÉNÉRATEUR COMMUN. Un générateur congruentiel écrit à la main déborde 2^53 en
 * JavaScript dès son second tirage et perd ses bits de poids faible : mesuré, une période de 10 466
 * et 28 % de valeurs répétées. Celui de `core/hasard.ts` emploie `Math.imul` et n'a pas ce défaut.
 */
const tirage = creerAleatoire;

/**
 * Les événements, portés des trous vers la poussière.
 *
 * LE COMPTE EST CONSERVÉ, et c'est le nom même de l'opération : autant d'événements en sortent
 * qu'il en est entré. Ce qui change est LEUR PLACE.
 *
 * LA DURÉE D'UN ÉVÉNEMENT LE SUIT. Un événement porté ailleurs garde sa longueur : la raccourcir
 * pour qu'il tienne dans son segment de poussière changerait ce qu'on entend, et la poussière
 * décrit des instants d'attaque, non des enveloppes.
 *
 * L'ORDRE DU TEMPS EST RENDU TRIÉ. Deux événements peuvent se croiser en se déplaçant, et une suite
 * non triée fait trébucher tout ce qui la lit ensuite.
 */
export function deplacerSurCantor<T extends { debut: number; fin: number }>(
  evenements: readonly T[],
  duree: number,
  o: OptionsDeplacement,
): { evenements: T[]; rapport: RapportDeplacement } {
  const etendue = Math.max(duree, evenements.reduce((m, e) => Math.max(m, e.fin), 0));
  const segments = poussiereDeCantor(etendue, o);
  const alea = tirage(o.graine);
  const part = Math.min(1, Math.max(0, o.part));

  let dansLesTrous = 0;
  let deplaces = 0;
  let sommeDesEcarts = 0;
  const sortie = evenements.map((e) => {
    if (dansLaPoussiere(e.debut, segments)) return e;
    dansLesTrous++;
    // LE TIRAGE SE FAIT POUR CHAQUE ÉVÉNEMENT DES TROUS, y compris quand la part vaut zéro ou un :
    // sans cela, changer la part décalerait toute la suite des tirages, et deux réglages voisins
    // donneraient deux pièces sans rapport au lieu de deux pièces voisines.
    const bouge = alea() < part;
    const cible = o.ou === "hasard"
      ? tireDansLaPoussiere(segments, alea)
      : plusProcheDansLaPoussiere(e.debut, segments);
    if (!bouge) return e;
    deplaces++;
    sommeDesEcarts += Math.abs(cible - e.debut);
    return { ...e, debut: cible, fin: cible + (e.fin - e.debut) };
  });

  sortie.sort((a, b) => a.debut - b.debut);
  return {
    evenements: sortie,
    rapport: {
      total: evenements.length,
      dansLesTrous,
      deplaces,
      ecartMoyen: deplaces > 0 ? sommeDesEcarts / deplaces : 0,
      segments: segments.length,
      partDeLaDuree: etendue > 0 ? mesureDeLaPoussiere(segments) / etendue : 0,
    },
  };
}
