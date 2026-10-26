// ui/ordonnanceur-runs.ts — Une exécution à la fois, et un jeton qui dit si la mienne est périmée.
//
// ═══ POURQUOI CE MODULE, ET C'EST UN RELEVÉ DE REVUE ═══
//
// Le 2026-10-25, point 3 d'une revue critique du dépôt : « Deux runs peuvent se chevaucher. Seul le
// run global est verrouillé. Deux ▶ rapprochés, ou une relance automatique pendant un run, tournent
// ensemble sur le même cache. `abortControllerRef` ne retient que le dernier run lancé, et le
// premier run qui finit remet `enCoursRef` à faux pendant que l'autre tourne encore. »
//
// LES QUATRE AFFIRMATIONS SONT VRAIES, vérifiées dans `useExecutionGraphe.ts` :
//
//   · le garde est `if (!noeudPrioritaireId && enExecRef.current) return;` — un run CIBLÉ n'est
//     jamais bloqué, et le bouton ▶ d'un nœud en lance un sans aucune condition ;
//   · `abortControllerRef.current = controller` écrase sans condition : le contrôleur du premier run
//     devient injoignable, et « Arrêter » n'arrête plus que le second ;
//   · `enCoursRef.current = false` est inconditionnel dans le `finally` : le premier run qui finit
//     déclare que rien ne tourne, alors que l'autre tourne ;
//   · et les deux runs écrivent dans le MÊME `cacheExec`.
//
// Un cinquième défaut était là sans être relevé : `lancer()` sans argument, appelé pendant un run
// global, retournait AUSSITÔT ET SANS RIEN DIRE. Ouvrir un exemple pendant un run — ce que
// `App.tsx` fait tout seul, par un `setTimeout` — ne le lançait donc pas.
//
// ═══ CE QUE CE MODULE FAIT, ET CE QU'IL NE DÉCIDE PAS ═══
//
// IL SÉRIALISE : une exécution à la fois, les suivantes attendent leur tour. Le chevauchement
// devient impossible par construction, et les trois premiers défauts avec lui — il n'y a jamais
// deux contrôleurs, jamais deux runs à compter.
//
// ET IL NUMÉROTE : chaque exécution reçoit un jeton qui sait dire si elle est périmée. Cela ne sert
// pas pendant qu'elle tourne — rien de plus récent n'a pu commencer —, mais APRÈS : un composant
// qui lance son propre travail asynchrone sans consulter `signal` continue en arrière-plan et écrit
// son résultat quand il finit. Le jeton est ce qui permet de ne pas l'écouter.
//
// IL NE DÉCIDE PAS DE LA POLITIQUE. Qu'un clic sur le ▶ d'un nœud ATTENDE la fin du run en cours, ou
// qu'il l'INTERROMPE pour passer devant, est une question d'usage et non de mécanique : les deux sont
// ici, et l'appelant choisit.

import { useRef } from "react";

/** Ce qu'une exécution sait d'elle-même. */
export interface JetonDeRun {
  /** Son numéro, qui croît d'une exécution à la suivante. */
  readonly generation: number;
  /**
   * Une exécution plus récente a-t-elle commencé depuis ?
   *
   * À CONSULTER AVANT D'ÉCRIRE, et non avant de calculer : c'est l'écriture d'un résultat périmé
   * dans un cache partagé qui abîme le graphe, et non le calcul lui-même.
   */
  perime(): boolean;
}

/** Ce qu'il advient d'une demande faite pendant qu'une exécution tourne. */
export type Politique =
  /** Elle attend son tour. Rien n'est perdu ; on peut attendre longtemps. */
  | "attendre"
  /** Elle demande l'arrêt de l'exécution en cours et passe devant. */
  | "passer-devant";

/**
 * Ce qui permet à deux demandes en attente de n'en faire qu'une, au lieu que l'une chasse l'autre.
 *
 * ═══ LE DÉFAUT, RELEVÉ LE 2026-10-26 ═══
 *
 * La file n'en tient qu'une, et la plus récente gagnait. Une RELANCE AUTOMATIQUE vers l'aval —
 * celle qui répare ce qu'un changement de réglage vient d'effacer — était donc écartée par un ▶
 * cliqué juste après, et l'aval restait « En attente », c'est-à-dire le défaut même que la relance
 * existait pour réparer. Elle était écartée EN SILENCE : `ecarter` résout sur `undefined`, que
 * l'appelant ne distingue pas de « rien à faire ».
 *
 * DEUX DEMANDES DE MÊME CIBLE SE FONDENT, et leurs portées s'unissent : l'aval est refait dès que
 * l'une des deux le demande. Les deux appelants reçoivent le résultat du run fondu.
 *
 * ═══ ET DEUX CIBLES DIFFÉRENTES NE SE FONDENT PAS, ce qui est une décision ═══
 *
 * La revue proposait l'union de toutes les portées. Pour deux nœuds différents, cette union
 * n'existe pas : le seul run qui les couvre tous les deux est le run GLOBAL. L'escalade ferait
 * tourner tout le graphe là où personne ne l'a demandé — pendant une séparation de plusieurs
 * minutes, le remède coûterait plus cher que le mal. Deux cibles différentes gardent donc la règle
 * d'avant, « finalement, ceci ».
 */
export interface Fusion<T> {
  /** Deux demandes de même clé se fondent. Deux clés différentes ne se fondent pas. */
  cle: string;
  /** Ce que cette demande couvre, au-delà de sa clé. Opaque à l'ordonnanceur. */
  portee: unknown;
  /** La portée qui couvre les deux. */
  union: (ancienne: unknown, neuve: unknown) => unknown;
  /** Bâtit la tâche qui couvre la portée fondue. */
  refaire: (portee: unknown) => (jeton: JetonDeRun) => Promise<T>;
}

export interface Ordonnanceur {
  /**
   * Demande une exécution. Rend ce que la tâche rend, ou `undefined` si la demande a été écartée.
   *
   * UNE DEMANDE ÉCARTÉE REND `undefined` ET NE LÈVE PAS : être passé devant n'est pas une erreur, et
   * un appelant qui l'apprendrait par une exception devrait l'attraper pour ne rien en faire.
   *
   * `fusion` dit comment cette demande se fond avec une demande en attente de même clé. Sans elle,
   * la demande chasse celle qui attendait, comme avant.
   */
  demander<T>(tache: (jeton: JetonDeRun) => Promise<T>, fusion?: Fusion<T>): Promise<T | undefined>;
  /** Une exécution tourne-t-elle, en ce moment ? */
  enCours(): boolean;
  /** Combien de demandes attendent leur tour. */
  enAttente(): number;
  /** Le numéro de l'exécution en cours, ou de la dernière. */
  generation(): number;
  /** Vide la file : ce qui attendait n'aura pas lieu. Rend combien ont été écartées. */
  viderLaFile(): number;
}

export interface Reglages {
  politique?: Politique;
  /**
   * Combien de demandes peuvent attendre à la fois. Au-delà, LA PLUS ANCIENNE EN ATTENTE TOMBE.
   *
   * POURQUOI UNE BORNE, ET POURQUOI C'EST LA PLUS ANCIENNE QUI TOMBE. Cinq clics pendant un run de
   * trois minutes ne veulent pas dire « rejoue cinq fois » : ils veulent dire « finalement, ceci ».
   * Une file sans borne rejouerait une suite de demandes que personne n'attend plus.
   *
   * LA FUSION PASSE AVANT. Deux demandes de même cible n'en font qu'une et ne remplissent donc pas
   * la file : la borne ne tranche qu'entre des demandes qui visent des choses différentes.
   */
  enAttenteMax?: number;
  /** Appelé pour demander l'arrêt de l'exécution en cours, en politique « passer-devant ». */
  arreter?: () => void;
}

interface EnAttente {
  /** La clé de fusion, absente pour une demande qui ne se fond pas. */
  cle?: string;
  /** La portée courante, fondue au fil des demandes qui s'y ajoutent. */
  portee?: unknown;
  fusion?: Fusion<unknown>;
  tache: (jeton: JetonDeRun) => Promise<unknown>;
  /** UN RUN FONDU RÉPOND À TOUS CEUX QU'IL COUVRE : chaque demande garde son dénouement. */
  resoudre: ((valeur: unknown) => void)[];
  rejeter: ((erreur: unknown) => void)[];
}

/**
 * ═══ LA CRÊTE DE SIMULTANÉES, PUBLIÉE POUR QU'UN CAS DE BOUT EN BOUT PUISSE LA LIRE ═══
 *
 * POURQUOI UNE MESURE ET NON UNE DÉDUCTION. Les cas unitaires éprouvent la mécanique ; aucun ne dit
 * qu'elle est BRANCHÉE dans l'application. Et compter les statuts à l'écran ne dirait rien : deux
 * runs concurrents posent leurs statuts dans le même magasin, et le résultat est indistinguable d'un
 * run unique — c'est précisément pour cela que ce défaut a pu vivre si longtemps.
 *
 * CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS. Elle compte ce qui passe PAR L'ORDONNANCEUR : un
 * appel qui le contournerait n'y figurerait pas. C'est pourquoi elle va par paire avec le cas qui
 * vérifie, sur la source, que `lancer` est la seule porte d'entrée du moteur.
 */
const PORTEE = globalThis as unknown as { __attic_runs_simultanes__?: number; __attic_runs_crete__?: number };

function noterEntree(): void {
  const n = (PORTEE.__attic_runs_simultanes__ ?? 0) + 1;
  PORTEE.__attic_runs_simultanes__ = n;
  PORTEE.__attic_runs_crete__ = Math.max(PORTEE.__attic_runs_crete__ ?? 0, n);
}

function noterSortie(): void {
  PORTEE.__attic_runs_simultanes__ = Math.max(0, (PORTEE.__attic_runs_simultanes__ ?? 1) - 1);
}

/** Pour les cas : repartir d'une crête vierge. */
export function oublierLaCrete(): void {
  PORTEE.__attic_runs_simultanes__ = 0;
  PORTEE.__attic_runs_crete__ = 0;
}

/** La plus grande simultanéité observée depuis le chargement. */
export function creteDeSimultanees(): number {
  return PORTEE.__attic_runs_crete__ ?? 0;
}

export function creerOrdonnanceur(reglages: Reglages = {}): Ordonnanceur {
  const politique = reglages.politique ?? "attendre";
  const enAttenteMax = Math.max(1, reglages.enAttenteMax ?? 1);
  const arreterLeCourant = reglages.arreter;

  let generationCourante = 0;
  let courantTourne = false;
  const file: EnAttente[] = [];

  const jetonDe = (generation: number): JetonDeRun => ({
    generation,
    perime: () => generation !== generationCourante,
  });

  function lancerEntree(e: EnAttente): void {
    executer(e.tache).then(
      (v) => { for (const r of e.resoudre) r(v); },
      (err) => { for (const r of e.rejeter) r(err); },
    );
  }

  function ecarterEntree(e: EnAttente): void {
    for (const r of e.resoudre) r(undefined);
  }

  function suivant(): void {
    const prochain = file.shift();
    if (prochain) lancerEntree(prochain);
  }

  async function executer<T>(tache: (jeton: JetonDeRun) => Promise<T>): Promise<T> {
    generationCourante += 1;
    courantTourne = true;
    const jeton = jetonDe(generationCourante);
    noterEntree();
    try {
      return await tache(jeton);
    } finally {
      noterSortie();
      // L'ORDRE COMPTE : on cesse d'être en cours AVANT de lancer le suivant, sans quoi le suivant
      // verrait une exécution déjà en train de tourner et s'empilerait derrière lui-même.
      courantTourne = false;
      suivant();
    }
  }

  return {
    demander<T>(tache: (jeton: JetonDeRun) => Promise<T>, fusion?: Fusion<T>): Promise<T | undefined> {
      if (!courantTourne) return executer(tache);

      if (politique === "passer-devant") {
        // ON DEMANDE L'ARRÊT, ET L'ON ATTEND QUAND MÊME SON TOUR. Un arrêt est demandé, pas
        // immédiat : le nœud en cours le voit quand il consulte son signal. Partir tout de suite
        // rouvrirait le chevauchement même qu'on ferme.
        arreterLeCourant?.();
      }

      return new Promise<T | undefined>((resoudre, rejeter) => {
        const prendre = resoudre as (valeur: unknown) => void;

        // LA FUSION PASSE AVANT LA BORNE : une demande qui se fond ne fait pas grandir la file, donc
        // elle ne peut en faire tomber aucune. C'est tout l'objet de ce chemin.
        const jumelle = fusion && file.find((e) => e.cle !== undefined && e.cle === fusion.cle && e.fusion);
        if (fusion && jumelle) {
          jumelle.portee = fusion.union(jumelle.portee, fusion.portee);
          jumelle.tache = (jumelle.fusion as Fusion<unknown>).refaire(jumelle.portee);
          jumelle.resoudre.push(prendre);
          jumelle.rejeter.push(rejeter);
          return;
        }

        const entree: EnAttente = {
          cle: fusion?.cle,
          portee: fusion?.portee,
          fusion: fusion as Fusion<unknown> | undefined,
          tache,
          resoudre: [prendre],
          rejeter: [rejeter],
        };
        file.push(entree);
        while (file.length > enAttenteMax) {
          const tombee = file.shift();
          if (tombee) ecarterEntree(tombee);
        }
      });
    },
    enCours: () => courantTourne,
    enAttente: () => file.length,
    generation: () => generationCourante,
    viderLaFile(): number {
      const n = file.length;
      // ON COPIE AVANT DE VIDER : `ecarter` résout une promesse, et un appelant qui redemanderait
      // aussitôt pousserait dans la file qu'on est en train de parcourir.
      const ecartees = file.splice(0, file.length);
      for (const e of ecartees) ecarterEntree(e);
      return n;
    },
  };
}

/** Ce qu'un run ciblé embrasse. Même forme que `PerimetreCible`, sans l'importer. */
export interface PorteeDeLot {
  versLAval?: boolean;
}

/**
 * La fusion des demandes du moteur : même nœud visé, et l'aval dès que l'une des deux le demande.
 *
 * ELLE VIT ICI ET NON CHEZ L'APPELANT, pour la raison qui vaut déjà pour `useOrdonnanceurDeRuns` :
 * `ui/hooks/useExecutionGraphe.ts` est en dette de taille, et ce qu'on ajoute à un fichier trop gros
 * va ailleurs. L'appelant n'en écrit toujours qu'une ligne.
 *
 * LES AUTRES CHAMPS D'UNE PORTÉE SUIVENT LA PLUS RÉCENTE, faute de règle qui vaille pour eux ;
 * `versLAval` est le seul dont l'union a un sens, et c'est le seul qui existe aujourd'hui.
 */
export function fusionDeLot<T>(
  noeud: string | undefined,
  perimetre: PorteeDeLot | undefined,
  lancerLeLot: (n: string | undefined, p: PorteeDeLot | undefined, j: JetonDeRun) => Promise<T>,
): Fusion<T> {
  return {
    // UN RUN GLOBAL EST SA PROPRE CIBLE : deux ▶ globaux se fondent, ce qu'ils faisaient déjà en
    // se chassant l'un l'autre, mais sans perdre l'aval que l'un des deux demanderait.
    cle: noeud ?? "*",
    portee: perimetre,
    union: (a, b) => {
      const x = a as PorteeDeLot | undefined;
      const y = b as PorteeDeLot | undefined;
      if (!x && !y) return undefined;
      return { ...(x ?? {}), ...(y ?? {}), versLAval: !!(x?.versLAval || y?.versLAval) };
    },
    refaire: (portee) => (jeton) => lancerLeLot(noeud, portee as PorteeDeLot | undefined, jeton),
  };
}

/**
 * L'ordonnanceur du moteur, créé une fois pour la vie du composant.
 *
 * ═══ POURQUOI SA CONSTRUCTION VIT ICI, ET NON CHEZ L'APPELANT ═══
 *
 * `ui/hooks/useExecutionGraphe.ts` est l'un des quinze fichiers EN DETTE de la norme de taille, et
 * la règle du dépôt est sans ambiguïté : « ce qu'on ajoute à un fichier trop gros va ailleurs. »
 * Huit lignes de construction y auraient été huit lignes de plus dans le fichier qui doit maigrir.
 * Ici, elles sont dans le module qui possède la mécanique, et l'appelant n'en écrit qu'une.
 *
 * LA POLITIQUE EST « ATTENDRE », ET C'EST LA DÉCISION À REVOIR EN PREMIER si l'usage le démentait :
 * un run demandé pendant qu'un autre tourne prend son tour, et le travail engagé va à son terme.
 * « passer-devant » — le ▶ d'un nœud interrompt le run global pour passer — est écrite et éprouvée
 * juste au-dessus ; c'est un mot à changer, pas une mécanique à écrire.
 *
 * UNE SEULE DEMANDE ATTEND À LA FOIS. Cinq clics pendant un run de trois minutes ne veulent pas dire
 * « rejoue cinq fois ».
 */
export function useOrdonnanceurDeRuns(): Ordonnanceur {
  const ref = useRef<Ordonnanceur | null>(null);
  if (!ref.current) ref.current = creerOrdonnanceur({ politique: "attendre", enAttenteMax: 1 });
  return ref.current;
}
