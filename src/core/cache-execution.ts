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
//
// ET LE CÂBLAGE AVAL NE COMPTE QUE POUR QUI LE CONSULTE — relevé par Fabien : « un nœud Ampleur
// posé après un débruitage IA déjà exécuté relance le débruitage ». Le câblage des sorties était
// entré dans la clé de TOUS les composants pour la raison d'un seul : depuis qu'un composant peut
// demander si une de ses sorties est branchée, ce qu'il rend en dépend. Mais brancher un câble sur
// la sortie d'un composant qui ne pose JAMAIS cette question ne change rien à ce qu'il rend — et
// cela relançait pourtant un modèle appris. Mesuré dans l'application : réglages, câblage amont et
// valeurs d'entrée tous identiques au cache, et pourtant rejeu.
//
// LA QUESTION SE LIT SUR UNE FORME, ET JAMAIS SUR UNE LISTE DE NOMS. On n'inscrit nulle part quels
// composants dépendent de leur aval : le moteur REGARDE si le composant a appelé `sortieBranchee`
// pendant son run, et ne retient le câblage aval dans sa clé que pour celui-là. Une liste déclarée
// se serait oubliée au premier composant ajouté, et l'oubli aurait servi un résultat périmé en
// silence — la faute exactement inverse, et la plus grave des deux.

/** Les quatre empreintes d'un composant pour un run. */
export interface EmpreintesDuRun {
  /** Ses réglages. */
  hashParams: string;
  /** Le câblage de ses entrées : quels ports, depuis quels composants. */
  hashEntree: string;
  /** Le câblage de ses sorties. Ne compte que pour un composant qui le consulte, cf. `CachePrecedent`. */
  hashSorties: string;
  /** Les valeurs qui arrivent réellement sur ses entrées. */
  hashValeursEntree: string;
}

/** Ce que le run précédent a retenu d'un composant : ses empreintes, et ce qu'il a demandé. */
export interface CachePrecedent extends EmpreintesDuRun {
  /**
   * Ce composant a-t-il DEMANDÉ si ses sorties étaient branchées, pendant son dernier run ?
   *
   * C'est un FAIT OBSERVÉ et non une déclaration : le moteur compte les appels à `sortieBranchee`.
   * Un composant qui n'a pas posé la question ne peut pas avoir tenu compte de la réponse, donc son
   * résultat ne dépend pas de son câblage aval, donc un câble ajouté derrière lui ne le périme pas.
   *
   * ABSENT VAUT « N'A PAS DEMANDÉ », et c'est le bon défaut dans les deux sens. Une entrée de cache
   * écrite avant que cette question n'existe n'a pas le champ : elle décrit un composant dont on ne
   * sait rien, et le premier run qui suit le renseignera. Un composant qui, lui, consulte ses
   * sorties porte le champ dès son premier run, celui où il n'y a de toute façon rien à rejouer.
   */
  consulteSorties?: boolean;
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
  precedentes: CachePrecedent | undefined,
  courantes: EmpreintesDuRun,
): boolean {
  if (jamaisCache || entreeRetraitee || !precedentes) return false;
  // LE CÂBLAGE AVAL N'EST COMPARÉ QUE POUR QUI L'A CONSULTÉ. Voir l'en-tête : la réponse est un
  // fait observé au run précédent, non une déclaration qu'on aurait pu oublier de poser.
  if (precedentes.consulteSorties && precedentes.hashSorties !== courantes.hashSorties) return false;
  return precedentes.hashParams === courantes.hashParams
    && precedentes.hashEntree === courantes.hashEntree
    && precedentes.hashValeursEntree === courantes.hashValeursEntree;
}
