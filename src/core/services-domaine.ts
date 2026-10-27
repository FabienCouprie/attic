// core/services-domaine.ts — Ce que le cœur demande au domaine pour traiter des valeurs qu'il
// ne connaît pas.
//
// POURQUOI CE MODULE. Le cœur transporte des valeurs OPAQUES : il les passe d'un nœud au suivant
// sans les regarder. Trois endroits avaient besoin d'une exception, et chacun l'avait prise en
// nommant `AudioBuffer` en dur :
//
//   • `graphe.ts` fabrique une empreinte de valeur, pour savoir si une entrée a changé ;
//   • `pertes.ts` nomme le type d'un champ, pour dire ce qu'une sauvegarde JSON va détruire ;
//   • `nodes-installes.ts` passe des variables globales au code d'un node installé à chaud.
//
// Aucune de ces trois tâches n'exige de connaître le domaine : elles exigent une RÉPONSE du domaine.
// Le cœur pose donc la question, et l'adaptateur y répond — comme il dépose déjà son registre dans
// le metastore, dans la gestion des nodes et dans le quiz.
//
// LES DÉFAUTS SONT NEUTRES, ET C'EST CE QUI REND LE CŒUR UTILISABLE SEUL. Un domaine qui ne configure
// rien obtient exactement le comportement générique : les primitifs, les tableaux, les objets
// simples, `File`, `Blob` et les tableaux typés sont traités par le cœur, qui les connaît pour de
// bonnes raisons — ils viennent du langage et des API du navigateur, non d'un domaine.
// `core/domaine-nombre.test.ts`, le second domaine complet, ne configure rien.
//
// LES RÉPONSES SONT LUES À L'APPEL, JAMAIS AU CHARGEMENT. Une constante de module serait figée avant
// que l'adaptateur ait pu répondre, et l'ordre des imports déciderait du résultat : c'est la panne
// que `src/composition.ts` raconte en tête de fichier.

/** Ce que le domaine répond au cœur sur ses propres valeurs. */
export interface ServicesDomaine {
  /**
   * Une empreinte stable d'une valeur du domaine, ou `null` si le domaine ne la reconnaît pas.
   *
   * Elle doit changer quand la valeur change, et pas autrement : c'est elle qui décide si un nœud
   * doit se recalculer. Deux valeurs différentes de même empreinte feraient garder un résultat
   * périmé.
   */
  empreinte(valeur: unknown): string | null;

  /** Le nom du type d'une valeur du domaine, ou `null` si le domaine ne la reconnaît pas. */
  nomDeType(valeur: unknown): string | null;

  /**
   * Les noms de types du domaine qui NE SURVIVENT PAS à une sérialisation JSON.
   *
   * Le cœur connaît déjà les siens — `File`, `Blob`, `ArrayBuffer`, les tableaux typés, `DataView` —
   * parce qu'ils viennent du langage. Ceux-ci s'y ajoutent.
   */
  typesNonSerialisables: readonly string[];

  /**
   * Les variables globales qu'un node installé à chaud peut employer.
   *
   * Un node installé est du code du DOMAINE : ce qu'il lui faut sous la main relève donc du domaine.
   * Le cœur fournit de son côté ce qui vient du langage, sans DOM ni stockage.
   */
  globalesInstallees: Record<string, unknown>;

  /**
   * Les réglages du domaine qui appartiennent au FICHIER DE PROJET, et non à l'utilisateur.
   *
   * ═══ POURQUOI LE CŒUR POSE LA QUESTION PLUTÔT QUE DE LIRE LA VALEUR ═══
   *
   * Le domaine audio a une fréquence de travail : tout ce qui est généré l'est à cette fréquence, et
   * tout ce qui entre y est converti. Elle doit voyager dans le fichier, sans quoi le même projet
   * rendrait un autre son demain, ou sur une autre machine — c'est le défaut que ce réglage répare.
   *
   * MAIS CE N'EST PAS UN RÉGLAGE DU CŒUR, et la sauvegarde ne doit pas le savoir. Un domaine de
   * texte ou d'images n'a pas de fréquence d'échantillonnage ; un autre aurait ses propres réglages
   * de projet. Le cœur demande donc « qu'as-tu à écrire » et « voilà ce qui était écrit », et
   * `ui/hooks/usePersistance.ts` reste ignorant du domaine — ce qu'un garde exige, parce que changer
   * de domaine est un but du projet.
   *
   * LE DÉFAUT EST NEUTRE : aucun réglage à écrire, rien à appliquer. Le format de projet n'en porte
   * alors aucune clé, et un fichier écrit sans domaine se relit sans domaine.
   */
  reglagesDeProjet(): Record<string, unknown>;

  /** Les réglages lus dans un fichier de projet. Un fichier qui n'en porte pas vaut les défauts. */
  appliquerReglagesDeProjet(json: Record<string, unknown>): void;

  /**
   * Une valeur du domaine, mise en forme pour traverser une frontière de message.
   *
   * ═══ POURQUOI LE CŒUR DEMANDE PLUTÔT QUE DE SAVOIR ═══
   *
   * Un nœud installé s'exécute désormais dans un CADRE ISOLÉ — origine opaque, sans pont. Ce qui y
   * entre et en sort passe par `postMessage`, qui ne sait cloner qu'un sous-ensemble du langage :
   * un `AudioBuffer` n'en fait pas partie, ses canaux si. Traduire l'un en l'autre est une
   * connaissance du DOMAINE, et le cœur n'a pas à l'avoir.
   *
   * REND LA VALEUR TELLE QUELLE quand elle traverse déjà, et `null` quand elle ne peut pas
   * traverser du tout : l'appelant le dit alors au lieu de laisser le cadre échouer sans raison.
   */
  versTransport(valeur: unknown): { ok: true; valeur: unknown } | { ok: false; pourquoi: string };

  /** L'inverse : ce qui revient du cadre, rendu au domaine. */
  depuisTransport(valeur: unknown): unknown;
}

const NEUTRES: ServicesDomaine = {
  empreinte: () => null,
  nomDeType: () => null,
  typesNonSerialisables: [],
  globalesInstallees: {},
  reglagesDeProjet: () => ({}),
  appliquerReglagesDeProjet: () => {},
  // SANS DOMAINE, CE QUI TRAVERSE EST CE QUE LE LANGAGE SAIT CLONER. Le neutre ne refuse rien : un
  // cadre qui recevrait une valeur inclonable le dira lui-même, et c'est au domaine de l'éviter.
  versTransport: (valeur) => ({ ok: true, valeur }),
  depuisTransport: (valeur) => valeur,
};

let services: ServicesDomaine = NEUTRES;

/** L'adaptateur du domaine répond au cœur. Ce qu'il ne déclare pas garde la réponse neutre. */
export function configurerServicesDomaine(partiels: Partial<ServicesDomaine>): void {
  services = { ...NEUTRES, ...partiels };
}

/** Les réponses du domaine, neutres tant qu'aucun adaptateur n'a répondu. */
export const servicesDomaine = (): ServicesDomaine => services;

/** Rend les réponses neutres. Pour un test qui veut éprouver le cœur seul. */
export function oublierServicesDomaine(): void {
  services = NEUTRES;
}
