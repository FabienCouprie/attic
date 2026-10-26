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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE PLAFOND EN OCTETS QU'ON VIENT POSER ICI NE LIBÉRERAIT RIEN. RELEVÉ LE 2026-10-26.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Une revue critique du dépôt, point 4, proposait d'ajouter à ce cache « un plafond de mémoire en
// octets, que `octetsTampon` sait déjà calculer ». C'est l'endroit où l'on viendrait l'écrire, et
// c'est pourquoi la mesure est consignée ici plutôt que dans un rapport qu'on ne relira pas.
//
// CE CACHE NE RETIENT RIEN QUE LE MAGASIN DES RÉSULTATS NE RETIENNE DÉJÀ. Il garde, sous l'identifiant
// d'un nœud, les `valeurs` que son exécuteur a rendues — c'est-à-dire LES MÊMES OBJETS que
// `poserResultat` dépose dans `ui/resultats.ts` sous `audioResultatBuffer`. Deux détenteurs, un seul
// tampon : le lâcher d'un côté ne rend pas un octet. Le moteur le dit déjà de l'autre côté — « un
// tampon qui reste accroché aux données du nœud n'est pas libéré parce que le cache l'a lâché ».
//
// ET IL EST PURGÉ PAR LES DEUX GESTES QUI FONT DISPARAÎTRE UN RÉSULTAT. `reinitialiserIds` supprime
// l'entrée du nœud remis à zéro, et `supprimerNoeud` passe par lui : le cache ne garde donc pas les
// tampons de nœuds qui n'existent plus. Une écriture remplace l'entrée précédente, donc n'empile pas
// deux générations du même nœud. Ce cache contient exactement les résultats courants des nœuds
// présents — ni plus, ni autre chose.
//
// LES CHIFFRES, pour qu'on ne les redérive pas. Sur un graphe de quatre nœuds mesuré par `executer`
// — deux sorties de 11,5 s et une de 1,5 s, stéréo 44 100 Hz —, ce cache pèse **8,24 Mio**, et
// **0 Mio de plus** que ce que l'écran retient déjà. Un tampon d'une heure en stéréo pèse 1,18 Gio ;
// dix minutes, 202 Mio. Un plafond les évincerait du cache sans les libérer, et la seule conséquence
// serait un recalcul.
//
// CE QUI RETIENT VRAIMENT DE LA MÉMOIRE EST AILLEURS, et le dépôt le mesure déjà : l'aperçu écoutable,
// une seconde copie détenue par le processus navigateur, que la bascule d'économie de mémoire est là
// pour rattraper (`audio/memoire-audio.ts`, et son relevé de 209 Mo sur deux aperçus de 109 Mo).
//
// ET LES INSTANTANÉS DE L'ANNULATION NE RETIENNENT PAS LES TAMPONS DE RÉSULTAT. La même revue
// l'affirmait des cinquante instantanés de Ctrl+Z. Ils copient `nodes` et `edges` ; un résultat ne vit
// pas sur les données d'un nœud — « ni sauvegardé, ni exporté, ni annulable », dit `ui/resultats.ts`.
// Ce qu'ils gardent par référence, ce sont les MÉDIAS D'ENTRÉE, et c'est délibéré : sans eux, Ctrl+Z
// rendait un « Entrée audio » sans son fichier.
//
// ═══ CE QUE L'EMPREINTE DE DÉRIVATION PROPOSÉE AJOUTERAIT, ET CE QU'ELLE NE PEUT PAS ═══
//
// La même revue proposait d'identifier chaque valeur par un hachage de sa fiche, de la version de sa
// fiche, de ses réglages canoniques, de sa graine résolue et des empreintes de ses entrées. Deux de
// ses quatre bénéfices tiennent, un est étroit, et un est FAUX :
//
//   · TIENT — elle survit aux renommages : un nœud copié-collé reçoit `noeud-N+1` et ne retrouve donc
//     aucune entrée ; aplatir un méta préfixe les identifiants par `<idDuMéta>::`, donc en change.
//     Les deux coûtent du TEMPS et jamais de la justesse.
//   · TIENT — elle permet un cache SUR DISQUE, et c'est le seul gain structurel. Mais elle exige une
//     VERSION DE FICHE, qui n'existe pas : sans elle, un résultat calculé par une version du code
//     serait resservi à la suivante.
//   · ÉTROIT — « stopper la propagation quand un nœud rejoué rend la même chose » ne vaut que pour un
//     nœud rejoué pour une AUTRE raison que `jamaisCache`.
//   · FAUX pour les nœuds `jamaisCache`, qui sont précisément ceux qui commandent la propagation. Un
//     tel nœud l'est parce que son résultat dépend de quelque chose QU'AUCUNE EMPREINTE NE REGARDE :
//     un fichier du disque, le graphe entier. Son hachage de dérivation serait donc INCHANGÉ pendant
//     que son contenu change, et s'y fier servirait un son périmé en silence — la faute exacte que la
//     propagation existe pour empêcher.
//
// UNE EMPREINTE DE DÉRIVATION DOIT DONC EXCLURE TOUT NŒUD DONT LA FERMETURE AMONT N'EST PAS CACHABLE.
// C'est faisable, et c'est la condition que « Build Systems à la carte » appelle la constructivité.

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
