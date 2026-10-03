// ui/services-orchestration.ts — Ce que le moteur d'exécution pose et demande au domaine autour
// d'un run.
//
// POURQUOI CE SIXIÈME POTEAU, ET CE QU'IL NE COUVRE PAS.
//
// `ui/hooks/useExecutionGraphe.ts` importait trois modules du domaine. Ils n'étaient pas de même
// nature, et c'est ce qui décide du traitement :
//
//   `grapheGlobal`           le graphe et le run courants, POSÉS pour qu'un nœud les lise. Aucune
//                            boucle, aucun plan : de l'état ambiant, et rien d'autre. Ici.
//   `lotGlobal`              un PILOTE de passes : il mène le graphe une fois par fichier d'un
//                            dossier.
//   `boucleSequencesGlobal`  un second PILOTE : il mène le graphe une fois par morceau d'une valeur
//                            qu'il ne découvre qu'en exécutant la première passe.
//
// CE POTEAU PORTE LE PREMIER ET LA LECTURE DES DOSSIERS, qui sont sans risque : un état qu'on pose,
// une liste de chemins qu'on demande. Les deux PILOTES restent dans le moteur, et c'est un choix
// écrit : les généraliser demande de réécrire les deux boucles imbriquées qui portent deux
// corrections durement acquises — l'oubli de cache par passe, et l'ordre d'emboîtement du lot autour
// des boucles, qu'un défaut a déjà fait rater. Aucun test n'éprouve aujourd'hui cet emboîtement :
// le réécrire serait toucher la boucle la plus délicate de l'application sans filet.
//
// CE QUE CELA DONNE POUR UN AUTRE DOMAINE. Il déclare ce qu'il veut de ce poteau ; les deux pilotes,
// n'ayant rien à planifier, rendent « pas de plan » et le moteur exécute le graphe en UNE passe.
// C'est le comportement utile, et il ne demande rien à personne.

/** Ce que le moteur pose et demande autour d'un run. */
export interface ServicesOrchestration {
  /**
   * Le graphe qui va calculer, posé avant l'exécution du premier nœud.
   *
   * Un nœud qui DOCUMENTE le graphe en a besoin : il ne demande aucune valeur, il demande la
   * structure, et c'est la seule chose que le contrat d'exécution du cœur ne puisse pas exprimer.
   */
  publierGraphe(graphe: unknown): void;

  /** L'exécution en cours — ordre, nœuds, arêtes, résultats —, posée pour les nœuds qui la lisent. */
  publierExecution(execution: unknown): void;

  /**
   * Les dossiers dont le contenu doit être lu AVANT de planifier quoi que ce soit.
   *
   * La lecture d'un dossier est asynchrone, la planification ne l'est pas : le moteur lit d'abord,
   * puis les pilotes décident. Quels nœuds demandent quel dossier relève du domaine — c'était un
   * identifiant de composant écrit en dur dans le moteur.
   */
  dossiersALire(noeuds: readonly unknown[]): readonly string[];

  /** Ce qu'un dossier lu donne au domaine : à lui de trier ce qui l'intéresse. */
  fichiersUtiles(contenuDuDossier: unknown): readonly unknown[];
}

const NEUTRES: ServicesOrchestration = {
  publierGraphe: () => {},
  publierExecution: () => {},
  dossiersALire: () => [],
  fichiersUtiles: () => [],
};

let services: ServicesOrchestration = NEUTRES;

/** Le domaine répond au moteur. Ce qu'il ne déclare pas garde la réponse neutre. */
export function configurerServicesOrchestration(partiels: Partial<ServicesOrchestration>): void {
  services = { ...NEUTRES, ...partiels };
}

/** Les réponses du domaine, neutres tant qu'aucune n'a été déposée. */
export const servicesOrchestration = (): ServicesOrchestration => services;

/** Rend les réponses neutres. Pour un test qui veut éprouver le moteur seul. */
export function oublierServicesOrchestration(): void {
  services = NEUTRES;
}
