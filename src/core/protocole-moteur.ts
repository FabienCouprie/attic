// core/protocole-moteur.ts — Ce que l'interface et le moteur se disent, écrit en types.
//
// LE POINT DU LONG TERME D'`ARCHITECTURE.md` : « passer à une architecture orientée messages /
// événements entre UI et moteur pour éviter que ReactFlow et l'exécution partagent le même objet
// mutable ». Le plan du 2026-11-16 garde le moteur sur le fil principal, derrière une frontière en
// trois sortes, et ce fichier est sa pièce P1 : le protocole, écrit avant d'avoir un seul appelant.
//
//   — des COMMANDES, de l'interface vers le moteur : `CommandeAuMoteur` ;
//   — des ÉVÉNEMENTS, du moteur vers l'interface, chacun marqué de la génération de sa passe :
//     `EvenementDuMoteur` ;
//   — des QUESTIONS, que le moteur pose à l'interface, synchrones et en lecture seule :
//     `QuestionsAuShell`. Elles gardent ce que le moteur lit EN DIRECT par choix, au moment où il le
//     lit aujourd'hui (voir l'en-tête de `ui/etat-de-passe.ts`) ; en faire des commandes poussées
//     changerait ce moment.
//
// LE DISCRIMINANT EST `genre`, comme dans `DecisionDuNoeud` de `core/execution.ts`. Les charges
// réemploient les types du cœur, statuts, entrée de cache, demande au moteur et canaux d'un
// exécuteur, et n'en redéfinissent aucun : un champ ajouté à `EntreeDeCache` voyage donc dans
// `importerCache` sans qu'on touche à ce fichier, et ses gardes le relisent.
//
// LES RÈGLES DE TRANSPORT, que les types ne peuvent pas dire et sans lesquelles rien ne reste
// identique : l'envoi est SYNCHRONE, sans `queueMicrotask` ni `MessageChannel` ; `lancer` rend
// toujours la promesse de la passe ; `oublier` s'applique aussitôt et n'est jamais mis en file ; le
// moteur est construit une fois, et le récepteur lui est passé à la construction, non par un effet,
// `StrictMode` doublant sinon chaque événement.
//
// CE MODULE NE PORTE AUCUN CODE, et c'est voulu. Il ne s'importe que par `import type` : avec
// `verbatimModuleSyntax`, un `import { type X }` survit comme import à effet. Tant qu'il n'a pas
// d'appelant, rien de l'application ne change, ce que prouve un bundle identique à celui de `master`.
//
// LA VERSION DU PROTOCOLE N'EST PAS ICI. Une constante lue par les deux côtés d'un même bundle ne
// peut jamais différer, donc un garde sur elle ne serait jamais vu rouge. Elle vivra là où quelque
// chose persiste : le journal de passe enregistré, puis, le jour où le moteur traversera une
// frontière, le canal lui-même, vérifiée à la poignée de main. C'est une décision à Fabien.
//
// LES GARDES SONT DANS `protocole-moteur.test.ts` : une table d'exemplaires par genre, que le
// compilateur exige entière, et chaque exemplaire passé au clonage structuré.
import type { EntreeDeCache } from "./cache-execution";
import type { PretsDuRetour, RetourDeNoeud } from "./execution";
import type { AreteG, MetaComposant, NoeudG } from "./meta";
import type { StatutAPoser } from "./preparation-passe";
import type { DemandeAuMoteur } from "./types";

/** Le numéro de la passe dont vient un événement : celui de son jeton. Voir `ui/ordonnanceur-runs.ts`. */
export type Generation = NonNullable<PretsDuRetour["jeton"]>["generation"];

/**
 * Une table rangée par nœud, en données : des paires, dans l'ordre où le moteur l'a remplie.
 *
 * DES PAIRES ET NON UNE `Map`, parce que l'ordre compte : le ménage pose les temps et les écarts dans
 * l'ordre de leurs tables, et le journal de passe relève l'ordre des écritures. `new Map(paires)` la
 * refait.
 */
export type ParNoeud<T> = readonly (readonly [id: string, valeur: T])[];

/**
 * Une valeur du domaine que le moteur et l'interface se partagent PAR RÉFÉRENCE, en lecture seule.
 *
 * CE SONT LES LOURDES QUI COMPTENT : côté audio, un tampon (`AudioBuffer`), un `Float32Array`, un
 * `File`, un `Blob`, dans les valeurs rendues comme dans les saisies d'un nœud. Les recopier coûterait
 * ce que pèse le son ; elles passent donc telles quelles. Le cœur ne nomme pas le tampon : il reçoit
 * l'union des valeurs du domaine en paramètre, comme partout ailleurs.
 *
 * CE TYPE EST UN NOM, ET NON UNE GARANTIE. Rien ne gèle les octets d'un tampon : `getChannelData` les
 * rend modifiables à qui le tient, et un exécuteur qui écrirait dans son entrée corromprait le cache
 * de l'amont. La règle est de ne pas écrire ; ce nom dit où elle s'applique, et c'est là qu'une
 * frontière future mettrait une poignée à la place de la valeur.
 */
export type ValeurPartagee<TValeur> = TValeur;

// ═══ LES COMMANDES, DE L'INTERFACE VERS LE MOTEUR ═══

/** Ce que l'interface demande au moteur. Chaque genre a sa réponse dans `ReponsesDuMoteur`. */
export type CommandeAuMoteur =
  /**
   * Lancer une passe. LE GRAPHE N'Y EST PAS : il se lit au départ de chaque passe, par la question
   * `graphe()`. Une demande attend son tour dans la file, et deux demandes de même cible se fondent ;
   * un graphe porté par la demande ferait lancer à l'une comme à l'autre le graphe du moment où elle
   * a été faite, et non celui du moment où elle part.
   */
  | {
    genre: "lancer";
    /** Le nœud visé par un ▶, absent pour un run global. */
    cible?: string;
    /** Vrai pour une relance automatique après réglage : l'aval entre dans le périmètre. */
    versLAval?: boolean;
    /** Vrai pour la passe qui repose ce que le cache tient, sans rien exécuter : un paquet `.attic` rouvert. */
    cacheSeulement?: boolean;
    /** Les nœuds que cette passe de repose attend dans l'atelier, que l'import vient de poser. */
    attendre?: readonly string[];
  }
  /** Abattre la passe en cours et vider la file. Ce qui a été calculé reste montré. */
  | { genre: "arreter" }
  /**
   * Remettre des nœuds à zéro : statuts, résultats et cache, méta compris par la règle du `::`. La
   * passe en cours est annulée. `garder` nomme les champs de résultat à laisser en place, et n'est
   * employé que par un changement de réglage.
   */
  | { genre: "remettreAZero"; ids: readonly string[]; garder?: readonly string[] }
  /** Un réglage de ce nœud vient de changer : sa purge et sa remise à zéro. La relance reste à l'interface. */
  | { genre: "regler"; id: string }
  /** Lâcher des entrées de cache, sans toucher à ce qui est montré. S'applique aussitôt, jamais mis en file. */
  | { genre: "oublier"; ids: readonly string[] | "tout" }
  /** Rendre ce que le cache tient : ce qu'un paquet `.attic` emporte. */
  | { genre: "exporterCache" }
  /** Ranger des entrées dans le cache, celles d'un paquet relu ; une entrée remplace celle du même nœud. */
  | { genre: "importerCache"; entrees: ParNoeud<EntreeDeCache> };

/** Ce que le moteur rend à chaque commande, par genre. */
export interface ReponsesDuMoteur {
  /** La promesse de la passe, toujours : la barre d'outils l'attend (`ui/hooks/useCommandesBarre.ts`). */
  lancer: Promise<void>;
  arreter: void;
  remettreAZero: void;
  regler: void;
  oublier: void;
  /** Les entrées du cache à l'instant de la demande. */
  exporterCache: ParNoeud<EntreeDeCache>;
  importerCache: void;
}

/**
 * Envoyer une commande au moteur, de façon synchrone, et recevoir sa réponse.
 *
 * L'INDEXATION PAR LE GENRE EST UN GARDE : un genre ajouté à `CommandeAuMoteur` sans sa réponse fait
 * tomber le compilateur ici même.
 */
export type EnvoiAuMoteur = <C extends CommandeAuMoteur>(commande: C) => ReponsesDuMoteur[C["genre"]];

// ═══ LES ÉVÉNEMENTS, DU MOTEUR VERS L'INTERFACE ═══

/**
 * Ce que le nœud VISIBLE a rendu, choisi par le moteur.
 *
 * LE CHOIX DES VALEURS PASSE AU CŒUR, et l'affichage reste à l'interface. Choisir, c'est lire les
 * tables de la passe : les sorties exposées d'un méta, la seule sortie qui représente une bulle,
 * l'erreur d'une branche qui n'a rien rendu. Tant que l'interface lirait elle-même ces tables, la
 * frontière n'en serait pas une. Les adresses d'objet, le lecteur promis et les révocations restent
 * au récepteur.
 */
export interface RenduDuVisible<TValeur> {
  /** Ce qu'il montre : ses valeurs ; celles de ses sorties exposées pour un méta ; pour une bulle, la seule qui la représente, ou aucune. */
  valeurs: readonly ValeurPartagee<TValeur>[];
  message?: string;
  /** Les deux canaux déclarés de son retour, tels quels. Voir `affichage` et `designe` dans `core/types.ts`. */
  affichage?: RetourDeNoeud["affichage"];
  designe?: RetourDeNoeud["designe"];
  /**
   * Un méta dont la chaîne interne n'a rien rendu : il passe en erreur, et l'on dit la fiche du
   * premier nœud interne resté vide quand il y en a un.
   */
  brancheEnEchec?: { fautif?: string };
}

/** Ce que le moteur dit à l'interface. Chaque événement porte la génération de sa passe. */
export type EvenementDuMoteur<TValeur> =
  /** La préparation est faite : l'ordre réellement exécuté, et les statuts qu'elle pose, dans l'ordre. */
  | {
    genre: "passeCommencee";
    generation: Generation;
    /** Le nœud visé, absent pour une passe globale : c'est elle seule qui montre que le moteur tourne. */
    cible?: string;
    ordre: readonly string[];
    statuts: readonly StatutAPoser[];
  }
  /** Le statut d'un nœud visible. `progressionDuNoeud` dit que la progression vient de l'exécuteur. */
  | ({ genre: "statut"; generation: Generation; progressionDuNoeud: boolean } & StatutAPoser)
  /** L'état d'un nœud invisible, copie de boucle ou nœud interne, rattaché au nœud visible qu'il sert. */
  | { genre: "statutOmbre"; generation: Generation; id: string; visible: string; statut: StatutAPoser["statut"] }
  /**
   * Ce nœud vient de tourner, en succès comme en erreur. `rendu` manque quand il n'y a rien à
   * montrer : l'identifiant n'est pas celui d'un nœud visible, un nœud interne de méta ou une copie
   * de boucle, ou le nœud n'a rendu ni valeur ni message. Le récepteur rend la promesse de la pose
   * pour un nœud regardé, et la boucle l'attend.
   */
  | { genre: "noeudFini"; generation: Generation; id: string; rendu?: RenduDuVisible<TValeur> }
  /**
   * Ce que la passe a compté et choisi une fois sa boucle finie, que le récepteur pose dans cet
   * ordre : les causes de boucle, la pose finale, les temps et les écarts, les demandes qu'il a
   * gardées, les champs autonomes, puis les conteneurs. Il rend la promesse de tout cela, et le
   * ménage l'attend.
   *
   * LES MESSAGES Y SONT DÉJÀ COMPLÉTÉS : le moteur a ajouté la graine tirée et la cause d'une boucle
   * avant de choisir les rendus, qui les portent.
   */
  | {
    genre: "bilan";
    generation: Generation;
    /** Ce qui a empêché une boucle de se déplier, dit sous l'identifiant du nœud visible qui le porte, dans l'ordre de la passe. */
    problemesDeBoucle: ParNoeud<string>;
    /** Les nœuds visibles dont le message a été complété après la boucle : la pose finale les reprend, même déjà posés. */
    messagesCompletes: readonly string[];
    /** Ce que chaque nœud visible montre à la fin de la passe. Un nœud qui n'a rien à montrer n'y est pas. */
    rendus: ParNoeud<RenduDuVisible<TValeur>>;
    /** Le temps de calcul, en millisecondes, cumulé sur le nœud visible, méta compris. */
    temps: ParNoeud<number>;
    /** De combien chaque nœud a changé le niveau de ce qu'il a reçu, mesuré par le domaine. */
    ecarts: ParNoeud<number>;
    /** Les champs préfixés `_` qu'un composant à affichage autonome a posés sur son nœud : le récepteur les reporte sur l'état. */
    champsAutonomes: ParNoeud<Readonly<Record<string, unknown>>>;
    /** Chaque conteneur dont un membre a tourné, et ceux de ses membres qui s'exécutent : son statut se lit sur ceux de toutes les passes. */
    conteneurs: ParNoeud<readonly string[]>;
  }
  /**
   * Ce qu'un composant a demandé au moteur, par son troisième canal. Voir `moteur` dans `core/types.ts`.
   * Le moteur le dit avant le bilan, et le récepteur le transmet à l'atelier après la pose finale.
   */
  | { genre: "demande"; generation: Generation; id: string; demande: DemandeAuMoteur }
  /** La passe est finie, arrêtée ou tombée. */
  | {
    genre: "passeTerminee";
    generation: Generation;
    /** Le même que celui de `passeCommencee`, que la préparation ait abouti ou non. */
    cible?: string;
    raison: "fin" | "arret" | "erreur";
  };

/**
 * Le récepteur, côté React, qui applique un événement aux magasins.
 *
 * IL NE REND UNE PROMESSE QUE S'IL Y A À ATTENDRE, et le moteur n'attend qu'alors : attendre à chaque
 * événement ajouterait un tour de microtâche que la boucle ne fait pas.
 */
export type RecepteurDuMoteur<TValeur> = (evenement: EvenementDuMoteur<TValeur>) => Promise<void> | void;

// ═══ LES QUESTIONS, QUE LE MOTEUR POSE À L'INTERFACE ═══

/**
 * Le graphe tel qu'une passe le lit, copié au moment de la question.
 *
 * COPIÉ ET NON PRÊTÉ : les objets simples sont recopiés, et ce qui n'en est pas un, fichier, tampon,
 * tableau typé, est gardé par référence. Ce sont les `ValeurPartagee` des saisies.
 */
export interface InstantaneDeGraphe {
  /** Les nœuds visibles du canevas, bulles comprises. */
  noeuds: readonly NoeudG[];
  /** Toutes les arêtes, substitutions de bulles comprises : la préparation les écarte. */
  aretes: readonly AreteG[];
  /** Les métas employés par ces nœuds : la préparation les lit ici, et non dans le registre vivant. */
  metas: readonly MetaComposant[];
}

/**
 * Ce que le moteur lit de l'interface, au moment où il le lit. Synchrone, en lecture seule.
 *
 * CHAQUE QUESTION GARDE UN INSTANT DE LECTURE QUI EXISTE AUJOURD'HUI : un câble tiré pendant un run
 * long compte pour dire si un nœud est regardé, et un nœud ajouté pendant la passe est vu par la pose
 * finale.
 */
export interface QuestionsAuShell {
  /** Le graphe à exécuter, lu au départ de chaque passe, et pour un lot avant chacune des siennes. */
  graphe(): InstantaneDeGraphe;
  /** Le nœud prioritaire posé sur le canevas, lu à la préparation. */
  priorite(): string | null;
  /** Ce nœud est-il celui qu'on regarde : sélectionné ou terminal, dans une bulle ou non. */
  estRegarde(id: string): boolean;
  /** Le nœud visible de cet identifiant au moment de la pose, ou rien s'il n'en est pas un. */
  noeudVisible(id: string): Readonly<NoeudG> | undefined;
  /** La bascule d'économie de mémoire. */
  economieMemoire(): boolean;
  /** Un méta est-il ouvert dans le canevas. */
  dansUnMeta(): boolean;
}
