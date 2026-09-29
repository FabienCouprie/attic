// audio/montage-morceaux.ts — Les morceaux d'un montage : ce qu'on coupe, déplace, copie et colle.
//
// POURQUOI CE MODULE EXISTE. Demandé par Fabien : « pourrait-on activer le copier coller couper sur
// le node montage », précisé en « sur les bandes de son ou sur des parties de bande de son ». Or une
// bande du montage n'était pas un morceau : c'était un PORT. Sa largeur était la durée mesurée du son
// arrivant sur son câble, et ses seuls réglages étaient son instant, son niveau et ses deux fondus.
// « Une partie de bande » n'avait donc aucune existence : rien ne disait où un son commence dans
// lui-même, ni combien on en joue, et rien ne permettait d'en poser deux sur la même bande.
//
// CE QU'UN MORCEAU AJOUTE, ET C'EST TOUT CE QU'IL AJOUTE : un endroit où il commence DANS le son
// reçu, et une durée. De ces deux nombres viennent la coupe, le copier-coller, et la possibilité
// d'en poser plusieurs sur un même port. Le port, lui, ne change pas de sens : il reste ce qui
// APPORTE le son, et plusieurs morceaux peuvent y puiser.
//
// LA DURÉE ZÉRO VEUT DIRE « JUSQU'À LA FIN DU SON », convention que la ligne de temps emploie déjà
// pour la maquette. Elle n'est pas une commodité : c'est elle qui permet à un graphe enregistré
// avant ce module de se relire sans rien perdre, le son branché pouvant changer de durée d'une
// exécution à l'autre sans que le morceau ait à être réécrit.
//
// TOUT EST PUR ICI, sans React ni Web Audio : ce sont les seules parties dont la justesse se
// démontre. Qu'une coupe conserve exactement ce qui sonnait ne se vérifie pas à l'oreille sur une
// pièce de cinquante secondes ; cela se vérifie sur des nombres.

/** Un morceau posé sur la ligne de temps du montage. */
export interface Morceau {
  /** Identité stable : la sélection, le presse-papier et le dessin la suivent d'un rendu à l'autre. */
  id: string;
  /** Le port d'où vient le son. Plusieurs morceaux peuvent puiser au même. */
  piste: number;
  /** L'instant où il commence sur la ligne de temps, en secondes. Peut être négatif. */
  debut: number;
  /** Où il commence DANS le son reçu, en secondes. Jamais négatif. */
  dans: number;
  /** Ce qu'il en joue, en secondes. Zéro veut dire « jusqu'à la fin du son ». */
  duree: number;
  /** Son niveau, en décibels. */
  gain: number;
  /** Ses fondus, en millisecondes. */
  entree: number;
  sortie: number;
}

/** Les réglages d'un montage tels qu'ils étaient écrits avant les morceaux. */
export type ParametresMontage = Record<string, unknown>;

const nombre = (params: ParametresMontage, nom: string, defaut: number): number => {
  const v = Number(params[nom]);
  return Number.isFinite(v) ? v : defaut;
};

/**
 * Ce qu'un morceau fait sonner, en secondes, une fois connue la durée du son reçu.
 *
 * ZÉRO VEUT DIRE « TOUT CE QUI RESTE », et le reste se compte depuis `dans`. Un morceau dont le
 * `dans` dépasse le son ne sonne pas du tout, ce que ce calcul rend par zéro plutôt que par un
 * nombre négatif dont chaque appelant aurait à se méfier.
 */
export function dureeSonnante(m: Morceau, dureeSource: number): number {
  const reste = Math.max(0, dureeSource - Math.max(0, m.dans));
  return m.duree > 0 ? Math.min(m.duree, reste) : reste;
}

/**
 * Les morceaux d'un montage qui n'en a pas encore : un par piste branchée, le son entier.
 *
 * C'EST LA MIGRATION, ET ELLE NE S'ÉCRIT NULLE PART. Un graphe enregistré avant ce module ne porte
 * que ses réglages ; ses morceaux se déduisent d'eux à l'ouverture, et le montage sonne exactement
 * comme avant. Rien n'est réécrit sur le disque tant que l'on ne touche à rien : un projet ancien
 * qu'on rouvre sans y toucher reste lisible par une version ancienne.
 */
export function morceauxDepuisParametres(
  branchees: readonly number[], params: ParametresMontage,
): Morceau[] {
  return [...branchees].sort((a, b) => a - b).map((k) => ({
    id: `p${k}`,
    piste: k,
    debut: nombre(params, `Début ${k + 1}`, k * 2),
    dans: 0,
    duree: 0,
    gain: nombre(params, `Gain ${k + 1}`, 0),
    entree: nombre(params, `Fondu entrée ${k + 1}`, 10),
    sortie: nombre(params, `Fondu sortie ${k + 1}`, 10),
  }));
}

/** Un identifiant qu'aucun morceau ne porte encore. */
export function nouvelId(existants: readonly Morceau[], graine = "m"): string {
  const pris = new Set(existants.map((m) => m.id));
  for (let i = 1; ; i++) {
    const id = `${graine}${i}`;
    if (!pris.has(id)) return id;
  }
}

/**
 * Coupe un morceau à un instant, et rend les deux qui le remplacent.
 *
 * RIEN N'EST PERDU NI AJOUTÉ, et c'est l'invariant de l'opération : les deux morceaux se suivent
 * sans trou ni recouvrement, et la somme de ce qu'ils font sonner vaut exactement ce que l'original
 * faisait sonner. Le second commence dans le son là où le premier s'arrête, ce qui est la seule
 * façon d'obtenir une coupe qu'on n'entend pas.
 *
 * Une coupe demandée hors du morceau ne coupe rien et le rend seul : couper au bord ne produirait
 * qu'un morceau vide, qui se dessinerait comme un trait et ne s'attraperait plus.
 */
export function couperMorceau(m: Morceau, instant: number, dureeSource: number): Morceau[] {
  const longueur = dureeSonnante(m, dureeSource);
  const ou = instant - m.debut;
  if (!(ou > 0 && ou < longueur)) return [m];
  return [
    { ...m, duree: ou },
    { ...m, id: `${m.id}-b`, debut: instant, dans: Math.max(0, m.dans) + ou, duree: longueur - ou },
  ];
}

/**
 * Coupe à un instant tous les morceaux que cet instant traverse.
 *
 * C'est le geste du banc de montage : la tête de lecture est posée, et la coupe tombe sur tout ce
 * qui passe dessous. Les identifiants engendrés ne peuvent pas se heurter à ceux qui existent.
 */
export function couperA(
  morceaux: readonly Morceau[], instant: number, dureeDe: (piste: number) => number,
): Morceau[] {
  const sortie: Morceau[] = [];
  for (const m of morceaux) {
    const deux = couperMorceau(m, instant, dureeDe(m.piste));
    if (deux.length === 2) {
      deux[1] = { ...deux[1], id: nouvelId([...morceaux, ...sortie], `${m.id}-`) };
    }
    sortie.push(...deux);
  }
  return sortie;
}

/**
 * Le morceau qu'un instant traverse sur une piste donnée, ou `null`.
 *
 * LE DERNIER POSÉ L'EMPORTE quand deux se recouvrent : c'est celui qu'on voit dessus, et cliquer
 * doit prendre ce que l'on voit.
 */
export function morceauA(
  morceaux: readonly Morceau[], piste: number, instant: number, dureeDe: (piste: number) => number,
): Morceau | null {
  let trouve: Morceau | null = null;
  for (const m of morceaux) {
    if (m.piste !== piste) continue;
    const longueur = dureeSonnante(m, dureeDe(m.piste));
    if (instant >= m.debut && instant < m.debut + longueur) trouve = m;
  }
  return trouve;
}

/**
 * Colle des morceaux à un instant, en gardant leurs écarts.
 *
 * L'INSTANT REÇOIT LE PLUS PRÉCOCE, et les autres gardent leur distance à celui-là : coller un
 * groupe doit reposer le groupe, non l'empiler sur un seul point. Chaque morceau collé reçoit un
 * identifiant neuf, sans quoi la sélection désignerait deux morceaux à la fois.
 */
export function collerMorceaux(
  presse: readonly Morceau[], instant: number, existants: readonly Morceau[],
): Morceau[] {
  if (!presse.length) return [];
  const origine = Math.min(...presse.map((m) => m.debut));
  const sortie: Morceau[] = [];
  for (const m of presse) {
    sortie.push({ ...m, id: nouvelId([...existants, ...sortie]), debut: instant + (m.debut - origine) });
  }
  return sortie;
}

/** Un morceau déplacé dans le temps, sans toucher à ce qu'il joue du son. */
export function deplacerMorceau(m: Morceau, versInstant: number): Morceau {
  return { ...m, debut: versInstant };
}

/** Ce qu'un geste sur une barre règle. Les mêmes trois que la ligne de temps connaît déjà. */
export type GesteMorceau = "corps" | "entree" | "sortie";

/**
 * Le morceau qu'un geste produit, à partir de celui qu'on a saisi.
 *
 * LE GESTE PART TOUJOURS DE L'ÉTAT DU DÉBUT, et non du précédent : accumuler les petits
 * déplacements ferait dériver la barre du pointeur, d'autant plus vite que la main tremble. On
 * additionne donc un écart total à une valeur figée au moment de la prise.
 *
 * LE FONDU DE SORTIE SE TIRE À REBOURS, et c'est la seule dissymétrie : sa poignée est sur le bord
 * droit, donc tirer vers la gauche l'allonge. Les fondus ne peuvent pas être négatifs ; le début,
 * lui, le peut, un montage ayant le droit de commencer avant zéro.
 */
export function appliquerGeste(saisi: Morceau, quoi: GesteMorceau, ecartSec: number): Morceau {
  if (quoi === "corps") return { ...saisi, debut: saisi.debut + ecartSec };
  if (quoi === "entree") return { ...saisi, entree: Math.max(0, saisi.entree + ecartSec * 1000) };
  return { ...saisi, sortie: Math.max(0, saisi.sortie - ecartSec * 1000) };
}

/** Un morceau remplacé dans la liste, les autres laissés tels quels. */
export function remplacerMorceau(morceaux: readonly Morceau[], remplacant: Morceau): Morceau[] {
  return morceaux.map((m) => (m.id === remplacant.id ? remplacant : m));
}

/** La liste sans le morceau nommé. */
export function retirerMorceau(morceaux: readonly Morceau[], id: string): Morceau[] {
  return morceaux.filter((m) => m.id !== id);
}

/**
 * L'étendue qu'occupent des morceaux : du plus précoce à la fin du plus tardif.
 *
 * Un montage peut commencer avant zéro, un début négatif étant permis : l'étendue part donc du plus
 * petit début et non de zéro.
 */
export function etendueDesMorceaux(
  morceaux: readonly Morceau[], dureeDe: (piste: number) => number,
): { debut: number; fin: number } {
  if (!morceaux.length) return { debut: 0, fin: 0 };
  let debut = Infinity, fin = -Infinity;
  for (const m of morceaux) {
    debut = Math.min(debut, m.debut);
    fin = Math.max(fin, m.debut + dureeSonnante(m, dureeDe(m.piste)));
  }
  return { debut, fin };
}

/**
 * Un morceau ramené dans ce qui a un sens, une fois connue la durée de son son.
 *
 * `dans` NE PEUT PAS ÊTRE NÉGATIF : le son n'existe pas avant son début, et un `dans` négatif ferait
 * sonner du silence en tête sans que rien ne le dise. Un début négatif sur la LIGNE DE TEMPS reste
 * permis, lui, et c'est autre chose : le montage commence alors avant zéro.
 */
export function normaliserMorceau(m: Morceau, dureeSource: number): Morceau {
  const dans = Math.max(0, Math.min(m.dans, dureeSource));
  const reste = Math.max(0, dureeSource - dans);
  return {
    ...m,
    dans,
    duree: m.duree > 0 ? Math.min(m.duree, reste) : 0,
    entree: Math.max(0, m.entree),
    sortie: Math.max(0, m.sortie),
  };
}
