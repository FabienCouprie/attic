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
}

const NEUTRES: ServicesDomaine = {
  empreinte: () => null,
  nomDeType: () => null,
  typesNonSerialisables: [],
  globalesInstallees: {},
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
