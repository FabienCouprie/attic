// core/cache-execution.ts — Quand un composant peut rendre son résultat d'avant, et quand il doit
// rejouer.
//
// POURQUOI CE MODULE EXISTE, relevé par Fabien : « faire le run sur sortie texte refait tourner les
// nœuds déjà exécutés, pourquoi ? Ce n'est pas un comportement habituel, chaque nœud est censé
// avoir son cache. Est-ce une exception due à la vidéo ou cette règle n'a pas été suffisamment
// gravée dans le marbre ? » La règle était écrite dans le moteur, en trois expressions au milieu
// d'un fichier d'un millier de lignes, et AUCUN test ne la regardait : ni la propagation, ni
// l'exception. Ce qu'elle coûte n'était écrit nulle part non plus.
//
// LES DEUX PARTIES DE LA RÈGLE.
//
// 1. UN COMPOSANT REJOUE SON RÉSULTAT quand rien de ce dont il dépend n'a bougé : ses réglages, son
//    câblage amont, son câblage aval, et les valeurs qui arrivent sur ses entrées.
//
// 2. SAUF SI SA FICHE DÉCLARE `jamaisCache`, ou si l'une de ses entrées vient d'un composant qui a
//    tourné pendant ce run.
//
// ET LE PRIX DE LA SECONDE PARTIE, QUI EST CE QUI SURPREND. Un composant est déclaré retraité dès
// qu'il a TOURNÉ, et non dès que sa sortie a CHANGÉ. Un composant `jamaisCache` qui rend deux fois
// exactement la même chose entraîne donc toute sa descendance, à chaque run.
//
// CE N'EST PAS UNE NÉGLIGENCE, ET ON NE PEUT PAS LE CORRIGER EN COMPARANT LES SORTIES. Les
// empreintes de `core/graphe.ts` décrivent une FORME et non un contenu : un tampon audio s'y écrit
// `AudioBuffer(longueur, fréquence, canaux)`. Deux sons entièrement différents de même durée, même
// fréquence et même nombre de canaux ont donc la MÊME empreinte. Un moteur qui déciderait « rejoué,
// mais identique, je n'avertis pas l'aval » servirait un son périmé en silence dès qu'un traitement
// rend une durée inchangée, c'est-à-dire presque toujours. La propagation est le filet qui rattrape
// cette imprécision, et elle coûte le rejeu de toute la descendance d'un composant non caché.
//
// QUI DÉCLARE `jamaisCache`, ET POURQUOI. Ceux dont le résultat dépend de quelque chose que les
// empreintes ne regardent pas : un fichier du disque, que rien ne relit, ou le graphe entier, dont
// aucune empreinte de nœud ne dit rien. La fiche porte la raison à côté du drapeau.
//
// UNE BRANCHE SŒUR N'EST PAS ENTRAÎNÉE. La propagation suit les arêtes, et non l'ordre linéaire du
// run : deux branches parallèles dont l'une rejoue laissent l'autre tranquille. Cela a été une
// faute, et c'est pour cela que la règle se lit sur les arêtes.

/** Les quatre empreintes d'un composant pour un run. */
export interface EmpreintesDuRun {
  /** Ses réglages. */
  hashParams: string;
  /** Le câblage de ses entrées : quels ports, depuis quels composants. */
  hashEntree: string;
  /** Le câblage de ses sorties. Ce qu'un composant rend peut dépendre de ce qui est branché. */
  hashSorties: string;
  /** Les valeurs qui arrivent réellement sur ses entrées. */
  hashValeursEntree: string;
}

/** Ce qu'il faut savoir d'une arête pour décider : d'où elle part, où elle va. */
export interface LienDeGraphe {
  source: string;
  target: string;
}

/**
 * Vrai quand une entrée de ce composant vient d'un composant qui a tourné pendant ce run.
 *
 * SE LIT SUR LES ARÊTES, ET JAMAIS SUR L'ORDRE DU RUN. Un composant qui suit un autre dans l'ordre
 * linéaire sans en dépendre n'est pas sa descendance, et le rejouer serait du temps perdu.
 */
export function sourceRetraitee(
  nodeId: string,
  liens: readonly LienDeGraphe[],
  retraitesCeRun: ReadonlySet<string>,
): boolean {
  return liens.some((l) => l.target === nodeId && retraitesCeRun.has(l.source));
}

/**
 * Vrai quand ce composant peut rendre le résultat de son run précédent.
 *
 * `precedentes` vaut `undefined` pour un composant qui n'a pas encore tourné : il n'y a alors rien
 * à rejouer, et la réponse est non.
 */
export function peutReutiliserLeCache(
  jamaisCache: boolean,
  entreeRetraitee: boolean,
  precedentes: EmpreintesDuRun | undefined,
  courantes: EmpreintesDuRun,
): boolean {
  if (jamaisCache || entreeRetraitee || !precedentes) return false;
  return precedentes.hashParams === courantes.hashParams
    && precedentes.hashEntree === courantes.hashEntree
    && precedentes.hashSorties === courantes.hashSorties
    && precedentes.hashValeursEntree === courantes.hashValeursEntree;
}
