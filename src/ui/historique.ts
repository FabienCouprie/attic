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
