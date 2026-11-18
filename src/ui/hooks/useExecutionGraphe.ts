// ui/hooks/useExecutionGraphe.ts — Le pont entre l'interface et le moteur : les questions qu'il pose,
// le récepteur de ce qu'il dit, et les gestes qui le lancent, l'arrêtent et le remettent à zéro.
//
// LE MOTEUR EST DANS `ui/moteur/`, SANS REACT, depuis la pièce P5a du plan de l'architecture par
// messages : l'ordonnanceur, les deux pilotes de passes, la passe et son ménage. Ce crochet ne fait
// plus que les relier à l'interface. Il leur prête ce qu'elle tient : le graphe et le nœud visible,
// lus par des questions au moment où le moteur les lit, le contexte audio, la langue et le dossier de
// travail ; et il leur donne un récepteur par passe, qui pose ce qu'ils disent dans les magasins.
//
// `t` ET `repertoire` SONT LIÉS AU MOMENT DE LA DEMANDE. La passe est recréée quand l'un des deux
// change, et les pilotes avec elle, comme les `useCallback` d'avant ; une demande mise en file garde
// la passe de l'instant où elle a été faite.
import { useCallback, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { MoteurDuCache } from "../moteur/commandes";
import type { Edge } from "@xyflow/react";
import { trouverMeta, type NoeudG, type AreteG } from "../../core";
import { prendreInstantane } from "../../core/instantane-de-graphe";
import { copierPourHistorique } from "../historique";
import { noeudPrioritaire } from "../priorite";
import { creerRecepteurDeLaPasse } from "../recepteur-moteur";
import { useRemiseAZero } from "./useRemiseAZero";
import { creerLancerUnePasse, type PerimetreCible } from "../moteur/passe";
import { creerPilotesDePasse } from "../moteur/pilotes";
import { creerOrdonnanceurDuMoteur, fusionDeLot, type Ordonnanceur } from "../moteur/ordonnanceur-runs";

import { useI18n, valeurCanoniqueChoix } from "../../i18n";
import { registreUI } from "../registre-actif";

const trouverDef = (id: string) => registreUI().trouverDef(id);

/**
 * Attend que l'atelier montre les nœuds qu'un import vient de poser, au plus deux secondes.
 *
 * `setNodes` ne se voit dans `noeudsRef` qu'après le rendu qui suit, et une passe partie avant
 * reposerait le nouveau cache sur l'ancien graphe.
 */
async function attendreLesNoeuds(noeudsRef: MutableRefObject<any[]>, ids: readonly string[]): Promise<boolean> {
  const fin = performance.now() + 2000;
  while (performance.now() < fin) {
    const presents = new Set(noeudsRef.current.map((n) => n.id));
    if (ids.every((id) => presents.has(id))) return true;
    await new Promise((r) => setTimeout(r, 16));
  }
  return false;
}

export interface OptionsExecution {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  enExecRef: MutableRefObject<boolean>;
  audioCtxRef: MutableRefObject<AudioContext | null>;
  /** Le cache et ses commandes : la passe et ses pilotes tiennent le cache, la remise à zéro lui envoie les siennes. */
  moteurDuCache: MoteurDuCache;
  /** La bascule « économiser la mémoire » de la barre d'outils. Absente : active, le défaut sûr. */
  economieMemoireRef?: MutableRefObject<boolean>;
  /** Pile de navigation des méta-composants : non vide, on regarde le dedans d'un méta. */
  pileMetaRef?: MutableRefObject<{ metaId: string; nom: string }[]>;
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEnExecution: (b: boolean) => void;
  repertoire: string;
  onGrapheGenere?: (nodeId: string, spec: { nodes: { ficheId: string; label: string }[]; edges: { source: number; target: number }[] }) => void;
  onNodeInstalle?: () => void;
}

export function useExecutionGraphe(o: OptionsExecution) {
  const { t } = useI18n();
  const {
    noeudsRef, aretesRef, enExecRef, audioCtxRef, moteurDuCache, economieMemoireRef, pileMetaRef,
    setNodes, setEnExecution, repertoire,
    onGrapheGenere, onNodeInstalle,
  } = o;
  // LE MOTEUR TIENT LE CACHE : la passe le lit et l'écrit, ses pilotes et le ménage en lâchent des
  // entrées. Le reste de l'interface ne lui envoie que des commandes. Voir `ui/moteur/commandes.ts`.
  const { cache } = moteurDuCache;

  // ── LA QUESTION `graphe()` : le graphe qu'une passe lira, copié à l'instant où on la pose ──
  // La passe et les deux pilotes la posent là où ils lisaient le tableau vivant, et pas ailleurs.
  // Voir `core/instantane-de-graphe.ts`. Les références sont stables : la question l'est aussi.
  const graphe = useCallback(() => prendreInstantane({
    noeuds: noeudsRef.current as unknown as NoeudG[], aretes: aretesRef.current as unknown as AreteG[],
    trouverMeta, copier: copierPourHistorique,
  }), [noeudsRef, aretesRef]);

  // Annulation d'un run en cours : un seul AbortController pour tout `lancer()`
  // (le moteur exécute les nœuds en séquence dans une seule boucle — pas de
  // granularité par nœud). Savoir qu'une exécution tourne — y compris un run
  // CIBLÉ, qu'`enExecRef` ne suit pas — est désormais l'affaire de
  // l'ordonnanceur, qui le compte au lieu de le déclarer.
  const abortControllerRef = useRef<AbortController | null>(null);

  // ═══ UNE EXÉCUTION À LA FOIS, ET C'EST L'ORDONNANCEUR QUI LE TIENT ═══
  //
  // RELEVÉ PAR UNE REVUE DU DÉPÔT, point 3 : « Deux runs peuvent se chevaucher. Seul le run global
  // est verrouillé. » Vérifié sur les quatre affirmations : le garde ne couvrait que le run global,
  // de sorte que le bouton ▶ d'un nœud en lançait un second sans condition ; `abortControllerRef`
  // était écrasé, donc « Arrêter » n'arrêtait plus que le dernier ; un drapeau booléen `enCoursRef`
  // était remis à faux par le premier run qui finissait ; et les deux écrivaient dans le même
  // `cacheExec`.
  //
  // LA SÉRIALISATION FERME LES TROIS PREMIERS PAR CONSTRUCTION : il n'y a jamais deux contrôleurs,
  // jamais deux runs à compter. Le jeton ferme le quatrième, pour la queue asynchrone d'un composant
  // qui ne consulte pas son signal. Voir `ui/moteur/ordonnanceur-runs.ts`.
  //
  // ET `enCoursRef` A DISPARU AVEC LUI. Ce booléen existait parce qu'`enExecRef` ne suit que les
  // runs GLOBAUX : il fallait savoir qu'un run ciblé tournait pour l'annuler. L'ordonnanceur le sait
  // mieux — il compte ce qui tourne au lieu de le déclarer —, et deux sources de vérité sur « est-ce
  // que ça tourne » sont exactement ce que ce point de revue reprochait.
  //
  // IL EST CRÉÉ UNE FOIS, par une référence paresseuse : un ordonnanceur par composant.
  const ordonnanceurRef = useRef<Ordonnanceur | null>(null);
  if (!ordonnanceurRef.current) ordonnanceurRef.current = creerOrdonnanceurDuMoteur();
  const ordonnanceur = ordonnanceurRef.current;

  /**
   * Arrêter l'exécution en cours, sans rien effacer.
   *
   * Le moteur savait déjà s'annuler — `reinitialiser*` s'en sert —, mais rien ne
   * l'exposait : une fois lancé, un graphe allait jusqu'au bout, et le seul recours
   * devant un nœud long était de fermer l'application. Ce que le bouton « Arrêter »
   * appelle. Les résultats déjà calculés restent en place : arrêter n'est pas
   * réinitialiser.
   *
   * L'arrêt est demandé, pas immédiat : le nœud en cours reçoit `signal` et s'arrête
   * quand il le consulte ; la boucle, elle, n'enchaîne plus le suivant. Renvoie `false`
   * si rien ne tournait.
   */
  // Arrêter pendant un lot doit arrêter LE LOT, et non la seule passe en cours. Sans ce drapeau,
  // l'annulation coupait le fichier courant et l'enveloppe enchaînait aussitôt sur le suivant :
  // le bouton « Arrêter » paraissait alors ne rien faire sur un lot de trente fichiers.
  const arretLotRef = useRef(false);

  const arreter = useCallback(() => {
    arretLotRef.current = true;
    // LA FILE SE VIDE AUSSI, et c'est le second défaut qu'« Arrêter » portait : une demande en
    // attente aurait démarré juste après l'arrêt, et le bouton aurait paru ne rien faire.
    const ecartees = ordonnanceur.viderLaFile() > 0;
    if (ordonnanceur.enCours()) { abortControllerRef.current?.abort(); return true; }
    return ecartees;
  }, [ordonnanceur]);

  async function obtenirAudio() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") {
      try { await audioCtxRef.current.resume(); } catch { /* ignore */ }
    }
    return audioCtxRef.current;
  }

  // ── Les remises à zéro, dans useRemiseAZero.ts : le bouton, le réglage, l'aval seul, tout ──
  // Un reset pendant un run en cours signale l'annulation : c'est le moteur qui sait s'il tourne.
  const annulerLeRunEnCours = useCallback(() => {
    if (ordonnanceur.enCours()) abortControllerRef.current?.abort();
  }, [ordonnanceur]);
  const { reinitialiserNoeud, reinitialiserPourReglage, reinitialiserAval, reinitialiserTout } = useRemiseAZero({
    noeudsRef, aretesRef, envoyer: moteurDuCache.envoyer, setNodes, annulerLeRunEnCours,
  });

  // ── LA PASSE, `ui/moteur/passe.ts`, et son récepteur, `ui/recepteur-moteur.ts` ──
  // Recréée quand la langue ou le dossier de travail changent : ce sont les deux dépendances de la
  // fermeture d'avant, et le reste de ce qu'elle prête est fait de références stables.
  const lancerUnePasse = useMemo(() => creerLancerUnePasse({
    graphe,
    priorite: noeudPrioritaire,
    noeudVisible: (id) => noeudsRef.current.find((x) => x.id === id),
    economieMemoire: () => economieMemoireRef?.current ?? true,
    noeudsVisibles: () => noeudsRef.current,
    recepteur: () => creerRecepteurDeLaPasse({
      affichage: { trouverDef, lecteursAEcrire: new Map(), aretesRef, economieMemoireRef, pileMetaRef, t },
      noeudsVisibles: () => noeudsRef.current,
      setNodes,
      // Mise à jour immédiate de la référence pour bloquer les doubles clics, avant que React ne
      // déclenche l'effet qui la synchronise sur l'état.
      enExecution: (tourne) => { enExecRef.current = tourne; setEnExecution(tourne); },
      onGrapheGenere, onNodeInstalle,
    }),
    cache, audio: obtenirAudio, canoniser: valeurCanoniqueChoix, repertoire, t,
    controleur: abortControllerRef,
  }), [repertoire, t]);

  // ── Les deux pilotes de passes, le lot et les boucles par passes, dans `ui/moteur/pilotes.ts` ──
  const { lancerLeLot } = useMemo(
    () => creerPilotesDePasse({ lancerUnePasse, graphe, cache, arretDuLot: arretLotRef }),
    [lancerUnePasse, graphe, cache],
  );

  /**
   * LA SEULE PORTE D'ENTRÉE, et elle passe par l'ordonnanceur.
   *
   * CE QUI CHANGE POUR L'APPELANT : rien, sauf qu'une demande faite pendant qu'une exécution tourne
   * ATTEND SON TOUR au lieu de tourner en même temps — ou d'être jetée sans un mot, ce qui était le
   * cas du run global. Le ▶ d'un nœud cliqué pendant un run n'ouvre donc plus un second run sur le
   * même cache ; il se met en file, et « Arrêter » vide cette file.
   *
   * ET IL N'Y A PAS DE SECOND MÉCANISME. Le garde qui vivait dans `lancerUnePasse` a été retiré :
   * deux verrous dont l'un jette la demande en silence valent moins qu'un seul qui la garde.
   */
  const lancer = useCallback((p?: string, perimetre?: PerimetreCible) => {
    // LA REPOSE D'UN PAQUET VA DROIT À UNE PASSE, sans fusion : fondue à un ▶ global, elle lui
    // donnerait son « cache seulement », et le run demandé n'exécuterait rien.
    if (perimetre?.cacheSeulement) {
      return ordonnanceur.demander(async (j) => {
        if (!(await attendreLesNoeuds(noeudsRef, perimetre.attendre ?? []))) {
          console.warn("[lancer] repose du cache abandonnée : les nœuds importés ne sont pas dans l'atelier");
          return;
        }
        return lancerUnePasse(undefined, { cacheSeulement: true }, j);
      });
    }
    return ordonnanceur.demander((j) => lancerLeLot(p, perimetre, j), fusionDeLot(p, perimetre, lancerLeLot));
  }, [ordonnanceur, lancerLeLot, lancerUnePasse]);

  return { lancer, arreter, reinitialiserNoeud, reinitialiserAval, reinitialiserPourReglage, reinitialiserTout };
}
