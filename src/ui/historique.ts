// ui/historique.ts — Instantanés de l'historique d'annulation (Ctrl+Z).
//
// POURQUOI PAS JSON
//
// L'historique copiait le graphe par JSON.parse(JSON.stringify(…)). C'est une copie
// profonde commode, mais JSON ne sait pas écrire un File, un Blob ni un AudioBuffer :
// il les réduit à `{}`. Un « Entrée audio » rétabli par Ctrl+Z revenait donc sans son
// fichier — nom affiché, lecteur présent, mais plus rien à décoder au lancement.
// Tant que Ctrl+Z ne rattrapait qu'une suppression de nœud, la perte passait
// inaperçue ; dès qu'il rattrape un canevas entier vidé, elle vide aussi les médias.
//
// Ici, les objets simples et les tableaux sont copiés en profondeur — l'instantané ne
// doit pas bouger quand l'état courant change —, les fonctions sont retirées comme le
// faisait JSON — undo rattache les gestionnaires —, et tout le reste est gardé tel
// quel, par référence : un File ou un AudioBuffer ne sont jamais modifiés en place,
// et c'est justement eux qu'il faut retrouver.

export interface ContexteHistorique<N, E> {
  /** Chemin de navigation dans les méta-composants. */
  pile: { metaId: string; nom: string; nomEn?: string }[];
  /** Graphe racine mis de côté pendant qu'on est dans un méta-composant, sinon null. */
  racine: { nodes: N[]; edges: E[] } | null;
  /** Fichier de workflow ouvert, sinon null. */
  cheminFichier: string | null;
}

export interface EntreeHistorique<N = unknown, E = unknown> {
  nodes: N[];
  edges: E[];
  /** Présent quand l'action a aussi changé la navigation ou le fichier : vider le canevas. */
  contexte?: ContexteHistorique<N, E>;
}

const estSimple = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Copie profonde des objets simples et tableaux ; fonctions retirées ; le reste par référence. */
export function copierPourHistorique<T>(valeur: T, vus = new WeakMap<object, unknown>()): T {
  if (valeur === null || typeof valeur !== "object") return valeur;
  const objet = valeur as unknown as object;
  if (vus.has(objet)) return vus.get(objet) as T;
  if (Array.isArray(objet)) {
    const copie: unknown[] = [];
    vus.set(objet, copie);
    for (const element of objet) copie.push(typeof element === "function" ? undefined : copierPourHistorique(element, vus));
    return copie as unknown as T;
  }
  if (!estSimple(objet)) return valeur;
  const copie: Record<string, unknown> = {};
  vus.set(objet, copie);
  for (const [cle, v] of Object.entries(objet)) {
    if (typeof v === "function") continue;
    copie[cle] = copierPourHistorique(v, vus);
  }
  return copie as unknown as T;
}

export function instantane<N, E>(nodes: N[], edges: E[], contexte?: ContexteHistorique<N, E>): EntreeHistorique<N, E> {
  return {
    nodes: copierPourHistorique(nodes),
    edges: copierPourHistorique(edges),
    ...(contexte ? { contexte: copierPourHistorique(contexte) } : {}),
  };
}

/** Empile en gardant au plus `max` entrées, les plus anciennes sortant d'abord. */
export function empiler<N, E>(pile: EntreeHistorique<N, E>[], entree: EntreeHistorique<N, E>, max: number): void {
  pile.push(entree);
  while (pile.length > max) pile.shift();
}

// ═══ CTRL+Y : LA SECONDE PILE ═══
//
// Demandé par Fabien le 2026-11-10, au point A6 de la revue d'architecture du 2026-10-31 : seul
// Ctrl+Z existait. Annuler pose l'instantané d'avant ; rétablir pose celui que l'annulation a
// remplacé, et c'est donc l'annulation qui le photographie, au moment où elle le quitte.
//
// UNE ACTION NEUVE EFFACE CE QUI SE RÉTABLISSAIT. Annuler deux pas puis agir ouvre une autre suite :
// rétablir l'ancienne écraserait ce qu'on vient de faire.
//
// LE CONTEXTE SUIT L'ENTRÉE. Une entrée qui porte la navigation et le fichier, celles du vidage du
// canevas et du fichier détaché, demande que l'état qu'elle remplace soit photographié avec les
// siens : sans eux, rétablir un vidage rendrait le canevas vide en gardant le fichier ouvert.
//
// CE QUE CES PILES NE VOIENT PAS, comme Ctrl+Z avant elles : un geste qui ne prend pas d'instantané,
// un réglage changé, un fichier chargé, un nœud déplacé. Il n'efface pas ce qui se rétablissait, et
// Ctrl+Y le recouvre, comme Ctrl+Z recouvre déjà ce qui a suivi l'instantané qu'il pose.

/** Ce que Ctrl+Z et Ctrl+Y se partagent : l'une se vide dans l'autre. */
export interface PilesHistorique<N = unknown, E = unknown> {
  annulation: EntreeHistorique<N, E>[];
  retablissement: EntreeHistorique<N, E>[];
}

export const pilesVides = <N = unknown, E = unknown>(): PilesHistorique<N, E> => ({ annulation: [], retablissement: [] });

/** L'instantané de l'état à l'écran, avec sa navigation et son fichier si `avecContexte`. */
export type EtatCourant<N, E> = (avecContexte: boolean) => EntreeHistorique<N, E>;

/** Une action annulable : son instantané s'empile, et ce qui avait été annulé ne se rétablit plus. */
export function noterAction<N, E>(piles: PilesHistorique<N, E>, entree: EntreeHistorique<N, E>, max: number): void {
  empiler(piles.annulation, entree, max);
  piles.retablissement.length = 0;
}

/**
 * D'une pile à l'autre : l'entrée à poser, l'état courant passant sur l'autre pile.
 *
 * SANS PLAFOND, ET RIEN NE DÉBORDE : une entrée ne passe sur l'autre pile qu'en échange de celle
 * qu'elle quitte, et une action neuve vide la seconde. La somme des deux reste donc sous le plafond
 * que `noterAction` tient sur la première.
 */
function basculer<N, E>(
  depuis: EntreeHistorique<N, E>[], vers: EntreeHistorique<N, E>[], courant: EtatCourant<N, E>,
): EntreeHistorique<N, E> | undefined {
  const entree = depuis.pop();
  if (!entree) return undefined;
  vers.push(courant(!!entree.contexte));
  return entree;
}

/** Ctrl+Z : l'entrée à poser, ou rien. L'état courant devient ce que Ctrl+Y rendra. */
export function annuler<N, E>(piles: PilesHistorique<N, E>, courant: EtatCourant<N, E>) {
  return basculer(piles.annulation, piles.retablissement, courant);
}

/** Ctrl+Y : l'entrée à poser, ou rien. L'état courant redevient ce que Ctrl+Z rendra. */
export function retablir<N, E>(piles: PilesHistorique<N, E>, courant: EtatCourant<N, E>) {
  return basculer(piles.retablissement, piles.annulation, courant);
}
