// core/statuts-de-passe.ts — Comment une passe pose le statut d'un nœud qu'elle exécute.
//
// Sorti d'`ui/hooks/useExecutionGraphe.ts` le 2026-11-11, à l'identique (pièce 1 du plan
// `work/plan-runtime-execution-2026-11-11.md`, qui sort du moteur la boucle nœud par nœud). Le cœur
// ne connaît ni le magasin des statuts ni la langue : la pose, l'ombre et la traduction lui sont
// prêtées, et c'est le crochet qui les branche sur `ui/statuts.ts`.
//
// ═══ LES STATUTS DES NŒUDS DÉPLIÉS ═══
//
// Un graphe déplié — boucle ou instrument — n'exécute pas les nœuds qu'on voit : il exécute des
// COPIES, aux identifiants fabriqués. Le magasin cherchant le nœud par son identifiant visible, ces
// copies ne posaient aucun statut, et les nœuds de la chaîne restaient affichés « en attente » alors
// que leur travail était fait — constaté dans l'application : « note=attente | filtre=attente »
// pendant que la fin d'instrument annonçait ses deux notes rendues.
//
// `expansions` relie une copie au nœud visible dont elle vient : on traduit donc l'identifiant avant
// de poser le statut. Le moteur exécutant les copies l'une après l'autre, la dernière à finir décide
// de l'état affiché, ce qui est le bon comportement — sauf pour une ERREUR, qu'une copie suivante ne
// doit pas effacer : un nœud dont une seule note a échoué a échoué.
//
// ET LA COPIE GARDE LE SIEN, en ombre : c'est ce que lit le statut final d'un méta ou d'une bulle,
// qui doit savoir lesquels de ses nœuds ont tourné. Voir `poserStatutOmbre` dans `ui/statuts.ts`.
//
// ═══ LE MÉTA D'UN NŒUD INTERNE EN ÉCHEC LE DIT AUSSITÔT ═══
//
// Sans cela, le méta garde son « en cours » (posé à la préparation) jusqu'à la passe finale — qui
// n'arrive qu'à la toute fin du run, voire jamais si une autre branche est très lente : le méta
// semble alors tourner normalement alors que sa chaîne interne a déjà échoué. Cette pose-là passe
// directement par la pose prêtée, sans la règle de l'erreur qui tient, comme le moteur le faisait.

/** Ce que le crochet prête pour poser un statut. */
export interface PretsDesStatuts {
  /** Le nœud visible dont vient chaque identifiant aplati ou recopié. */
  expansions: ReadonlyMap<string, string>;
  /** Pose un statut sur un nœud visible. */
  poser: (id: string, statut: string, progression?: string, progressionDuNoeud?: boolean) => void;
  /** Pose l'état d'un nœud invisible sous son propre identifiant, rattaché au nœud visible qu'il sert. */
  poserOmbre: (id: string, visible: string, statut: string) => void;
  t: (cle: string) => string;
}

/** Les deux poses d'une passe. */
export interface PoseDesStatuts {
  /** Pose le statut d'un nœud exécuté, traduit vers son nœud visible ; une erreur posée y tient. */
  poserStatut: (nodeId: string, statut: string, progression?: string, progressionDuNoeud?: boolean) => void;
  /** Met en erreur le méta propriétaire d'un nœud aplati, s'il en a un. */
  marquerMetaEnEchec: (idAplati: string, detail?: string) => void;
}

export function creerPoseDesStatuts({ expansions, poser, poserOmbre, t }: PretsDesStatuts): PoseDesStatuts {
  const marquerMetaEnEchec = (idAplati: string, detail?: string) => {
    const proprio = expansions.get(idAplati);
    if (proprio && proprio !== idAplati) {
      poser(proprio, "erreur", detail ? t("execution.brancheEnEchecDetail").replace("{detail}", detail) : t("execution.brancheEnEchec"));
    }
  };

  const visiblesEnErreur = new Set<string>();
  const poserStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
    const visibleId = expansions.get(nodeId) ?? nodeId;
    if (visibleId !== nodeId) poserOmbre(nodeId, visibleId, statut);
    if (statut === "erreur") visiblesEnErreur.add(visibleId);
    else if (visiblesEnErreur.has(visibleId)) return;
    poser(visibleId, statut, progression, progressionDuNoeud);
  };

  return { poserStatut, marquerMetaEnEchec };
}
