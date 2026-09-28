// audio/cercle-retouche.ts — Ce qu'une main fait à un cercle reçu.
//
// POURQUOI CE MODULE EXISTE, relevé par Fabien : « quand on fait une modification il manque un
// cercle qui prend un cercle en entrée, affiche ce cercle dans le nœud, permet de le modifier et
// renvoie une sortie ». Le trou était réel : neuf composants prennent un cercle et en rendent un,
// et AUCUN n'a de dessin ; les deux seuls qui portent un dessin cliquable n'ont pas d'entrée. Dès
// qu'un cercle était tourné, retourné ou complémenté, plus rien ne le montrait.
//
// LA RETOUCHE EST UN MASQUE, ET NON UNE COPIE DU CERCLE. Elle s'écrit comme un motif, une suite de
// zéros et de uns, un par place. Garder plutôt une copie du cercle reçu figerait l'entrée : changer
// ce qui arrive en amont ne changerait plus rien en aval, et le composant deviendrait une source.
// Un masque, lui, se reporte sur le cercle suivant : c'est ce qui permet de tourner un cercle en
// amont et de voir la retouche tenir.
//
// UNE PLACE QUE L'ENTRÉE N'ALLUMAIT PAS PEUT S'ALLUMER, et sa hauteur est celle de l'attaque qui la
// précède sur le tour. Prendre la suivante ferait dépendre une note de ce qui vient après elle ;
// inventer un intervalle ferait entendre une note que personne n'a écrite. Répéter la précédente ne
// décide rien de plus que « cette place sonne aussi ».

import type { Cercle, Sommet } from "./cercle";

/** Le masque vide : rien n'est retouché, le cercle reçu passe tel quel. */
export const SANS_RETOUCHE = "";

/**
 * Le masque qu'un cercle porte de lui-même : un un par place qui sonne.
 *
 * SERT DE POINT DE DÉPART AU PREMIER CLIC. Tant que rien n'est retouché, le masque reste vide et le
 * cercle passe tel quel ; le premier clic a besoin d'un masque à basculer, et c'est celui-ci.
 */
export function masqueDuCercle(c: Cercle): string {
  const sonnent = new Set(c.sommets.map((s) => s.position));
  return Array.from({ length: c.positions }, (_, i) => (sonnent.has(i) ? "1" : "0")).join("");
}

/**
 * Le masque ramené au nombre de places d'un cercle : tronqué s'il est trop long, complété par les
 * places du cercle s'il est trop court.
 *
 * UN CERCLE PEUT CHANGER DE TAILLE EN AMONT, et le masque écrit pour l'ancien ne doit alors ni
 * jeter des places ni en inventer. Le compléter par ce que le cercle porte déjà est la seule
 * réponse qui ne décide rien à la place de la main.
 */
export function masqueAjuste(masque: string, c: Cercle): string {
  if (!masque) return masqueDuCercle(c);
  const propre = masqueDuCercle(c);
  return Array.from({ length: c.positions }, (_, i) => masque[i] ?? propre[i]).join("");
}

/**
 * La hauteur, ou la note de percussion, à donner à une place que l'entrée n'allumait pas.
 *
 * C'est celle de l'attaque qui la précède sur le tour, le tour se refermant : une place avant la
 * première attaque prend donc la dernière du cercle. Sans aucune attaque, il n'y a rien à prendre.
 */
function valeurHeritee(c: Cercle, place: number): number | undefined {
  if (c.sommets.length === 0) return undefined;
  const tries = [...c.sommets].sort((a, b) => a.position - b.position);
  let choisi: Sommet | undefined;
  for (const s of tries) if (s.position <= place) choisi = s;
  return (choisi ?? tries[tries.length - 1]).valeur;
}

/**
 * Le cercle reçu, retouché.
 *
 * LE MASQUE DÉCIDE DE CE QUI SONNE, ET DE RIEN D'AUTRE : le nombre de places, la sorte et les
 * hauteurs des attaques gardées sont ceux du cercle reçu. Un masque vide rend le cercle tel quel,
 * et c'est l'état d'un composant que personne n'a encore touché.
 */
export function cercleRetouche(c: Cercle, masque: string): Cercle {
  if (!masque) return c;
  const ajuste = masqueAjuste(masque, c);
  const parPlace = new Map(c.sommets.map((s) => [s.position, s]));
  const sommets: Sommet[] = [];
  for (let i = 0; i < c.positions; i++) {
    if (ajuste[i] !== "1") continue;
    const tenu = parPlace.get(i);
    if (tenu) { sommets.push(tenu); continue; }
    const valeur = valeurHeritee(c, i);
    if (valeur !== undefined) sommets.push({ position: i, valeur });
  }
  return { positions: c.positions, sorte: c.sorte, sommets };
}

/** Ce que la retouche a changé, pour qu'un message puisse le dire. */
export function differenceDeRetouche(c: Cercle, masque: string): { eteintes: number; allumees: number } {
  if (!masque) return { eteintes: 0, allumees: 0 };
  const avant = masqueDuCercle(c);
  const apres = masqueAjuste(masque, c);
  let eteintes = 0;
  let allumees = 0;
  for (let i = 0; i < c.positions; i++) {
    if (avant[i] === "1" && apres[i] !== "1") eteintes++;
    if (avant[i] !== "1" && apres[i] === "1") allumees++;
  }
  return { eteintes, allumees };
}
