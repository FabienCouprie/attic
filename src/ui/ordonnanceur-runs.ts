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

export interface Ordonnanceur {
  /**
   * Demande une exécution. Rend ce que la tâche rend, ou `undefined` si la demande a été écartée.
   *
   * UNE DEMANDE ÉCARTÉE REND `undefined` ET NE LÈVE PAS : être passé devant n'est pas une erreur, et
   * un appelant qui l'apprendrait par une exception devrait l'attraper pour ne rien en faire.
   */
  demander<T>(tache: (jeton: JetonDeRun) => Promise<T>): Promise<T | undefined>;
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
   */
  enAttenteMax?: number;
  /** Appelé pour demander l'arrêt de l'exécution en cours, en politique « passer-devant ». */
  arreter?: () => void;
}

interface EnAttente {
  lancer: () => void;
  ecarter: () => void;
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

  function suivant(): void {
    const prochain = file.shift();
    if (prochain) prochain.lancer();
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
    demander<T>(tache: (jeton: JetonDeRun) => Promise<T>): Promise<T | undefined> {
      if (!courantTourne) return executer(tache);

      if (politique === "passer-devant") {
        // ON DEMANDE L'ARRÊT, ET L'ON ATTEND QUAND MÊME SON TOUR. Un arrêt est demandé, pas
        // immédiat : le nœud en cours le voit quand il consulte son signal. Partir tout de suite
        // rouvrirait le chevauchement même qu'on ferme.
        arreterLeCourant?.();
      }

      return new Promise<T | undefined>((resoudre, rejeter) => {
        const entree: EnAttente = {
          lancer: () => { executer(tache).then(resoudre, rejeter); },
          ecarter: () => resoudre(undefined),
        };
        file.push(entree);
        while (file.length > enAttenteMax) {
          const tombee = file.shift();
          tombee?.ecarter();
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
      for (const e of ecartees) e.ecarter();
      return n;
    },
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
