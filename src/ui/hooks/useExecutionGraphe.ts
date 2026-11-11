// ui/hooks/useExecutionGraphe.ts — Exécution du graphe (la boucle `lancer`) +
// réinitialisation d'un nœud (cascade aval) + statuts.
// Extrait d'App.tsx à l'identique (comportement inchangé). L'ordonnancement, le
// cache et la résolution d'entrées reposent sur les fonctions pures testées de
// core/graphe.ts ; ce hook orchestre l'aplatissement des métas, l'appel des
// plugins et la remontée des résultats dans l'état React.
import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge } from "@xyflow/react";
import {
  estCacheParBulle,
  trouverMeta,
  valeursEntrantes, signalerEcartsDeType,
  type NoeudG, type AreteG,
} from "../../core";

// CE QUE LE SHELL TRANSPORTE SANS LE REGARDER. Le moteur d exécution déclarait ses valeurs
// `TypeValeur`, c est-à-dire l union du domaine audio : le chemin d exécution de TOUS les domaines
// était typé contre un seul. Il n en lit aucune ; il les prend d un nœud et les donne au suivant.
type ValeurTransportee = unknown;
import { deciderDuNoeud, estResultatEnErreur } from "../../core/execution";
import { Respiration, respirer } from "../../core/respirer";
import { noeudRegarde } from "../../core/memoire";
import { servicesDomaine } from "../../core/services-domaine";
import { poserStatut as poserStatutNoeud, poserStatutOmbre, reinitialiserStatuts, statutDe as statutDeNoeud, statutsPoses } from "../statuts";
import { poserResultat } from "../resultats";
import { sautsDeBoucles } from "../../core/saut-de-boucle";
import { creerResolveurDeGraines } from "../../core/graines-de-passe";
import { contexteDePasse } from "../../core/contexte-de-passe";
import { preparerLaPasse } from "../../core/preparation-passe";
import { creerPoseDesStatuts } from "../../core/statuts-de-passe";

import { servicesOrchestration } from "../services-orchestration";
// CE QUE LE SHELL DEMANDE AU DOMAINE SUR LES VALEURS PRODUITES. Six fonctions audio étaient
// importées ici, sur le chemin d'exécution de tous les domaines, et `AudioBuffer` nommé à trois
// endroits. Les questions sont désormais posées, et le domaine y répond (cf. ui/services-apercu.ts).
import { servicesApercu } from "../services-apercu";
import type { DemandeAuMoteur } from "../../core/types";
import { useRemiseAZero } from "./useRemiseAZero";
// CE QUE LE MAGASIN REÇOIT POUR UN NŒUD est calculé dans `ui/correctif-resultat.ts`, sur les tables
// de la passe que `EtatDePasse` nomme une fois ; voir ces deux fichiers.
import { calculerCorrectifResultat } from "../correctif-resultat";
import type { EtatDePasse } from "../etat-de-passe";
// CE QUE LE MOTEUR FAIT UNE FOIS LE DERNIER NŒUD CALCULÉ est dans `ui/menage-apres-passe.ts`.
import { ecrireLesLecteurs, menageApresPasse } from "../menage-apres-passe";
import { fusionDeLot, useOrdonnanceurDeRuns, type JetonDeRun } from "../ordonnanceur-runs";
// LES DEUX PILOTES DE PASSES SONT DANS `usePilotesDePasse.ts`, le lot et les boucles par passes :
// ils rejouent `lancerUnePasse` sans rien connaître du moteur.
import { usePilotesDePasse } from "./usePilotesDePasse";

import { useI18n, valeurCanoniqueChoix } from "../../i18n";
import { registreUI } from "../registre-actif";

const trouverDef = (id: string) => registreUI().trouverDef(id);

/**
 * Ce qu'un run CIBLÉ embrasse, au-delà du nœud visé et de son amont.
 *
 * DEUX APPELANTS, DEUX INTENTIONS. Cliquer le ▶ d'un nœud veut dire « calcule jusqu'ici » : l'aval
 * n'a pas été demandé, et le faire tourner coûterait ce qu'on n'a pas demandé. Une relance
 * automatique après réglage, elle, n'a pas été demandée du tout : elle répare l'effacement qu'un
 * réglage vient de causer, et doit donc refaire tout ce qui a été effacé, aval compris.
 */
export interface PerimetreCible {
  /** Vrai pour une relance automatique après réglage. Faux ou absent pour un run ciblé demandé. */
  versLAval?: boolean;
}

export interface OptionsExecution {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  enExecRef: MutableRefObject<boolean>;
  prioritaireRef: MutableRefObject<string | null>;
  audioCtxRef: MutableRefObject<AudioContext | null>;
  cacheExec: MutableRefObject<Map<string, any>>;
  /** La bascule « économiser la mémoire » de la barre d'outils. Absente : active, le défaut sûr. */
  economieMemoireRef?: MutableRefObject<boolean>;
  /** Pile de navigation des méta-composants : non vide, on regarde le dedans d'un méta. */
  pileMetaRef?: MutableRefObject<{ metaId: string; nom: string }[]>;
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEnExecution: (b: boolean) => void;
  prioritaire: string | null;
  setPrioritaire: (id: string | null) => void;
  repertoire: string;
  onGrapheGenere?: (nodeId: string, spec: { nodes: { ficheId: string; label: string }[]; edges: { source: number; target: number }[] }) => void;
  onNodeInstalle?: () => void;
}

export function useExecutionGraphe(o: OptionsExecution) {
  const { t } = useI18n();
  const {
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec, economieMemoireRef, pileMetaRef,
    setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
    onGrapheGenere, onNodeInstalle,
  } = o;

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
  // qui ne consulte pas son signal. Voir `ui/ordonnanceur-runs.ts`.
  //
  // ET `enCoursRef` A DISPARU AVEC LUI. Ce booléen existait parce qu'`enExecRef` ne suit que les
  // runs GLOBAUX : il fallait savoir qu'un run ciblé tournait pour l'annuler. L'ordonnanceur le sait
  // mieux — il compte ce qui tourne au lieu de le déclarer —, et deux sources de vérité sur « est-ce
  // que ça tourne » sont exactement ce que ce point de revue reprochait.
  const ordonnanceur = useOrdonnanceurDeRuns();

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

  // `progressionDuNoeud` distingue ce que le NŒUD dit de son avancement (son `onProgress`) de ce que
  // le MOTEUR pose — « Étape i/total », qui est sa position dans le lot. L'anneau de progression ne
  // lit que le premier : sans cette distinction, il prenait « Étape 1/1 » pour 100 %.
  // L'ÉTAT VA DANS SON MAGASIN, PAS DANS LE TABLEAU DES NŒUDS. Le faire passer par `setNodes`
  // obligeait React Flow à repasser sur les N nœuds à chaque changement — 7 ms par nœud présent,
  // deux fois par nœud exécuté, soit un gel en N² : 0,6 s sur cinq nœuds, 4,9 s sur vingt. Le
  // magasin ne prévient que le composant concerné. Voir `ui/statuts.ts`.
  const definirStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
    poserStatutNoeud(nodeId, statut, progression, progressionDuNoeud);
  };

  // ── Les remises à zéro, dans useRemiseAZero.ts : le bouton, le réglage, l'aval seul, tout ──
  // Un reset pendant un run en cours signale l'annulation : c'est le moteur qui sait s'il tourne.
  const annulerLeRunEnCours = useCallback(() => {
    if (ordonnanceur.enCours()) abortControllerRef.current?.abort();
  }, [ordonnanceur]);
  const { reinitialiserNoeud, reinitialiserPourReglage, reinitialiserAval, reinitialiserTout } = useRemiseAZero({
    noeudsRef, aretesRef, cacheExec, setNodes, annulerLeRunEnCours,
  });

  const lancerUnePasse = useCallback(async (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => {
    // ═══ LE GARDE ANTI-CHEVAUCHEMENT A QUITTÉ CET ENDROIT ═══
    //
    // Il s'écrivait `if (!noeudPrioritaireId && enExecRef.current) return;` et il avait DEUX
    // défauts, relevés par une revue du dépôt. Il ne couvrait que le run global, de sorte que le
    // bouton ▶ d'un nœud lançait un second run sans aucune condition — deux runs sur le même
    // `cacheExec`. Et quand il mordait, il ABANDONNAIT LA DEMANDE SANS UN MOT : ouvrir un exemple
    // pendant un run, ce que `App.tsx` fait tout seul par un `setTimeout`, ne le lançait pas.
    //
    // La sérialisation est tenue par l'ordonnanceur, en amont de `lancer`, qui met la demande en
    // file au lieu de la jeter. Le laisser ici en plus ferait un second mécanisme capable d'avaler
    // une demande en silence, ce qui est précisément le défaut qu'on vient de retirer.
    if (noeudsRef.current.length === 0) return;
    const estGlobal = !noeudPrioritaireId;
    if (estGlobal) {
      // Mise à jour immédiate de la ref pour bloquer les doubles-clics / re-lancements
      // avant que React ne déclenche le useEffect qui synchronise enExecRef.
      enExecRef.current = true;
      setEnExecution(true);
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
    console.log(`[lancer] priorite=${noeudPrioritaireId} estGlobal=${estGlobal} nodes=${noeudsRef.current.length} cacheSize=${cacheExec.current.size}`);
    // LES ARÊTES DE SUBSTITUTION NE CALCULENT PAS. Replier une bulle cache les arêtes qui la
    // traversent et en dessine des substituts vers ses poignées : ce sont des objets d'affichage, et
    // les vraies arêtes sont toujours là. Les laisser entrer ici changerait l'empreinte des entrées
    // d'un nœud, donc invaliderait son résultat au moindre repli — or ne RIEN invalider est la
    // propriété qui justifie de replier plutôt que d'extraire. Voir `core/bulles.ts`.
    // ── LA PRÉPARATION EST DANS LE CŒUR, `core/preparation-passe.ts`, PURE ──
    // Aplatir, déplier, ordonner, cibler, valider, relever les cycles : le plan rend ce que le
    // moteur posait en chemin, statuts, avertissements et trace, dans l'ordre où il les posait,
    // et c'est ici qu'ils s'appliquent. Le graphe à documenter est publié avant tout, comme avant.
    const plan = preparerLaPasse({
      noeuds: noeudsRef.current as unknown as NoeudG[],
      aretes: aretesRef.current as unknown as AreteG[],
      prioriteDemandee: noeudPrioritaireId ?? prioritaireRef.current,
      versLAval: perimetre?.versLAval === true,
      trouverMeta, trouverDef, fluxCompatibles: registreUI().fluxCompatibles, t,
    });
    const {
      aretesReelles, plat, deplie, nds, aretesG, tousNoeudsG, boites,
      ordreFiltre, noeudsEnErreur, idsDecoratifs, ordonnees, estMetaEnScope,
    } = plan;
    servicesOrchestration().publierGraphe(plan.aDocumenter);
    for (const a of plan.avertissements) console.warn(a);
    for (const s of plan.statuts) definirStatut(s.id, s.statut, s.progression);
    console.log(plan.traceOrdre);

    const ctx = await obtenirAudio();
    const resultats = new Map<string, ValeurTransportee[]>();
    const messages = new Map<string, string>();
    const traitesCeRun = new Set<string>();
    // UNE BOUCLE INCHANGÉE NE SE RECALCULE PAS, son corps eût-il été lâché. Voir `core/saut-de-boucle.ts`.
    const sauts = sautsDeBoucles(deplie.depliees, { noeuds: deplie.noeuds, aretes: aretesG, resultats, cache: cacheExec.current, toursDesCopies: deplie.toursDesCopies,
      reglages: JSON.stringify(servicesDomaine().reglagesDeProjet()), jamaisCache: (id) => trouverDef(deplie.noeuds.find((n) => n.id === id)?.data.ficheId as string)?.jamaisCache === true });

    // ── Les graines, résolues au CENTRE, dans core/graines-de-passe.ts ──
    // Une par nœud et par réglage, partagée par les copies d'une boucle, rendue à qui l'a tirée.
    const { graineDuNoeud, grainesTirees } = creerResolveurDeGraines({
      toursDesCopies: deplie.toursDesCopies, origines: deplie.origines, expansions: plat.expansions,
    });
    // Les tables VIVANTES du run, pour les nœuds qui passent en dernier (cf. grapheGlobal.ts).
    servicesOrchestration().publierExecution({ ordre: ordreFiltre, noeuds: nds, aretes: aretesG, resultats, messages, expansions: plat.expansions });

    // ── LES STATUTS D'UNE PASSE SE POSENT PAR LE CŒUR, `core/statuts-de-passe.ts` ──
    // Une copie traduite vers son nœud visible, son ombre gardée, une erreur qui tient, et le méta
    // d'un nœud interne en échec qui le dit aussitôt. Le magasin et la langue lui sont prêtés.
    const { poserStatut, marquerMetaEnEchec } = creerPoseDesStatuts({
      expansions: plat.expansions, poser: definirStatut, poserOmbre: poserStatutOmbre, t,
    });

    const tempsParVisible = new Map<string, number>();
    // L'ecart de niveau mesure sur chaque noeud, en decibels. Voir le commentaire pose la
    // ou il est calcule.
    const ecartsParNoeud = new Map<string, number>();
    // CE QUE CHAQUE COMPOSANT MONTRE, par le canal déclaré de son exécuteur. Voir `FonctionPlugin`
    // dans `core/types.ts` : `affichage` est ce que le run a produit, `designe` ce qu'il a désigné
    // de ses entrées, et cette distinction seule décide de ce qu'un réglage périme.
    const affichageParNoeud = new Map<string, Record<string, unknown>>();
    const designeParNoeud = new Map<string, Record<string, unknown>>();
    // CE QUE LES COMPOSANTS DEMANDENT AU MOTEUR, et qui ne se pose jamais sur un nœud : poser un
    // graphe sur le canevas, relire la palette. Voir `moteur` dans `core/types.ts`.
    const demandesParNoeud = new Map<string, DemandeAuMoteur>();

    // LA PRÉPARATION EST LE PLUS GROS GEL DU LANCEMENT. Valider le graphe, l'aplatir, déplier les
    // boucles et les instruments, le publier, calculer l'ordre topologique : tout cela est
    // synchrone, et mesuré à 286 ms sur un graphe de cinq nœuds qui ne font rien. Pendant ce
    // temps, le clic sur « Lancer » n'a encore produit aucun retour à l'écran — l'application
    // paraît n'avoir rien entendu. Une image ici, et le lancement se voit.
    await respirer();
    if (controller.signal.aborted) return;

    // ── LES RÉSULTATS SE POSENT NŒUD PAR NŒUD, DÈS QU'IL A FINI ─────────────────────
    //
    // LE DÉFAUT, RELEVÉ PAR FABIEN : « les lecteurs apparaissent longtemps après que les nœuds
    // soient notés comme terminés dans les workflows longs ». Un nœud passe « Terminé » dès que SON
    // calcul finit, dans la boucle ci-dessous ; mais les correctifs étaient collectés puis posés en
    // un seul `setNodes` APRÈS toute la boucle. Plus un nœud était tôt dans la chaîne, plus il
    // restait longtemps terminé sans message, sans lecteur et sans bouton. Mesuré sur une chaîne de
    // quatre nœuds : le premier était terminé à 180 ms et ne montrait rien jusqu'à 4 180 ms, soit
    // quatre secondes de vide, et le deuxième 3,6 s. Sur un graphe de plusieurs minutes, c'est le
    // run entier.
    //
    // ET POSER PAR `setNodes` AURAIT COÛTÉ LE TEMPS DU RUN. Chaque appel fait repasser React Flow
    // sur TOUS les nœuds, à 7 ms par nœud présent : poser par paquets de deux cents millisecondes
    // bornait la latence, mais sur douze nœuds de trois cents millisecondes chacun — donc un paquet
    // par nœud — le run passait de 3 678 ms à 4 434, soit **+20,6 %**, mesuré, les deux
    // distributions ne se recouvrant pas. C'est la question qu'a posée Fabien, et la réponse était
    // oui.
    //
    // D'OÙ LE MAGASIN. Un résultat ne vit plus dans `node.data` : il va dans `ui/resultats.ts`, où
    // seul le composant concerné s'y abonne. La pose est alors gratuite, et les deux coûts tombent
    // ensemble — il n'y a plus à choisir entre la latence et le temps de run. C'est la même mesure
    // qui avait fait sortir les statuts du tableau des nœuds ; voir `ui/statuts.ts`.
    const souffle = new Respiration();
    /**
     * Les lecteurs restant à écrire, par nœud, remplis par `calculerCorrectifResultat`.
     *
     * LA BOUCLE NE LES ÉCRIT PAS : elle les écrivait avant de poser quoi que ce soit, et un nœud
     * terminé restait sans rien pendant la somme des encodages. Ils s'écrivent à la fin, un par un,
     * chacun posé dès qu'il est prêt.
     */
    const lecteursAEcrire = new Map<string, () => Promise<string | undefined>>();
    const aPoser = new Set<string>();
    /**
     * Pose dans le magasin les correctifs des nœuds en attente.
     *
     * UN IDENTIFIANT QUI N'EST PAS CELUI D'UN NŒUD VISIBLE EST SAUTÉ, et c'est voulu : la boucle
     * tourne sur le graphe APLATI, où un membre de méta s'appelle « outil1::cd ». Son méta, lui,
     * agrège les résultats de ses internes et ne peut donc être posé qu'à la fin ; c'est la pose
     * forcée, après la boucle, qui s'en charge.
     */
    const dejaPoses = new Set<string>();
    const passe: EtatDePasse = {
      resultats, messages, affichageParNoeud, designeParNoeud, tousNoeudsG, aretesReelles, ordreFiltre,
      noeudsPlats: plat.noeuds, estMetaEnScope, trouverDef, lecteursAEcrire, souffle,
      aretesRef, economieMemoireRef, pileMetaRef, t,
    };
    const poserUnNoeud = async (id: string) => {
      aPoser.delete(id);
      const n = noeudsRef.current.find((x) => x.id === id);
      if (!n) return;
      const patch = await calculerCorrectifResultat(n, passe);
      if (patch) poserResultat(id, patch);
      dejaPoses.add(id);
    };
    const poserCeQuiEstPret = async () => { for (const id of [...aPoser]) await poserUnNoeud(id); };
    /**
     * Ce nœud-ci est-il celui qu'on REGARDE : sélectionné, ou terminal.
     *
     * C'EST LA MÊME NOTION QUE POUR LA GARDE DES DIX MINUTES, et c'est voulu : le nœud qu'on
     * regarde est celui dont l'aperçu mérite d'être construit, et celui dont le résultat mérite
     * d'être montré sans attendre. Un seul endroit décide de ce qu'« être regardé » veut dire.
     */
    const estRegarde = (id: string) => noeudRegarde({
      id,
      selectionne: !!noeudsRef.current.find((x) => x.id === id)?.selected,
      aretes: aretesRef.current,
      dansUnMeta: (pileMetaRef?.current?.length ?? 0) > 0,
      cacheParBulle: estCacheParBulle(tousNoeudsG, id),
    });

    for (let i = 0; i < ordreFiltre.length; i++) {
      // Run annulé (reset pendant l'exécution) : arrêter d'enchaîner les nœuds
      // suivants. Le nœud éventuellement en cours au moment de l'annulation est
      // géré séparément plus bas (il faut laisser sa promesse se résoudre).
      if (controller.signal.aborted) break;
      const nodeId = ordreFiltre[i];
      // ── CE QUE LA PASSE FAIT DE CE NŒUD EST DÉCIDÉ PAR LE CŒUR, `deciderDuNoeud` de `core/execution.ts` ──
      // Déjà en erreur, entrée en erreur, absent, copie sautée, cache, ou à exécuter : le verdict
      // vient dans cet ordre, et c'est ici qu'il s'applique, aux tables, aux statuts et aux temps.
      const decision = deciderDuNoeud(nodeId, {
        noeudsEnErreur, noeuds: nds, aretes: aretesG, resultats, traitesCeRun,
        lireCache: (id) => cacheExec.current.get(id), sauts, trouverDef,
      });
      if (decision.genre === "dejaEnErreur" || decision.genre === "absent") continue;
      // ── Propagation d'erreur ── : une entrée vient d'un nœud en erreur, de validation OU
      // d'exécution, et ce nœud ne peut pas réussir en silence avec une entrée manquante.
      if (decision.genre === "entreeEnErreur") {
        noeudsEnErreur.add(nodeId);
        resultats.set(nodeId, [null]);
        poserStatut(nodeId, "erreur", t("execution.entreeEnErreur").replace("{source}", decision.source));
        marquerMetaEnEchec(nodeId);
        continue;
      }
      if (decision.genre === "copieSautee") { poserStatut(nodeId, "termine"); continue; }
      const node = decision.noeud;

      // UN JOURNAL DE HUIT VALEURS PAR NŒUD ET PAR RUN A ÉTÉ RETIRÉ D'ICI, et c'est le second du
      // genre. Il interpolait `sourceReprocessee`, `jamaisCache`, le verdict et quatre empreintes —
      // y compris un objet littéral, donc une sérialisation — pour chaque nœud de chaque run, et
      // rien ne le lisait : ni un cas, ni un script, ni un garde. La décision du cache, elle, est
      // éprouvée dans `core/cache-execution.ts`, avec ses cas et le prix de sa règle écrit.
      //
      // CE QU'IL A PAYÉ : le recensement des fréquences, plus bas. Le fichier est à son plafond de
      // dette, et la règle du dépôt est que ce qu'on y ajoute doit y être payé — ce journal valait
      // moins qu'une mesure, comme « [cache store] » avant lui.
      if (decision.genre === "cache") {
        const entreeCache = decision.entree;
        resultats.set(nodeId, entreeCache.valeurs);
        if (entreeCache.message) messages.set(nodeId, entreeCache.message);
        // LE CACHE PORTE AUSSI CE QUE LE NŒUD MONTRAIT, et il ne le portait pas. Un raccourci de
        // cache ne repassait donc rien dans les deux canaux déclarés, et le moteur posait
        // `undefined` : l'écran d'un nœud sauté se vidait. Cela ne se voyait pas, parce que le
        // report des champs autonomes remettait par-dessus la valeur de l'INSTANTANÉ, c'est-à-dire
        // celle d'un run antérieur. Deux fautes qui se masquaient l'une l'autre ; corriger l'une
        // sans l'autre aurait vidé l'écran à chaque cache.
        if (entreeCache.affichage) affichageParNoeud.set(nodeId, entreeCache.affichage);
        if (entreeCache.designe) designeParNoeud.set(nodeId, entreeCache.designe);
        poserStatut(nodeId, "termine");
        if (typeof entreeCache.tempsExecution === "number") {
          const visibleId = plat.expansions.get(nodeId) ?? nodeId;
          tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + entreeCache.tempsExecution);
        }
        continue;
      }
      // Les quatre empreintes que l'entrée de cache rangera si le nœud réussit.
      const { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree } = decision.empreintes;

      // Le statut « en cours » n'est posé qu'après le test de cache : un nœud
      // déjà en cache ne doit pas flasher « en cours »/« terminé » — ce flash
      // donnait l'impression que le modèle Qwen redémarrait inutilement.
      poserStatut(nodeId, "en_cours", t("execution.etape").replace("{i}", String(i + 1)).replace("{total}", String(ordreFiltre.length)));

      // UNE IMAGE AVANT DE PARTIR. Les nœuds calculent dans le fil de l'interface : un nœud qui ne
      // rend jamais la main empêche toute image d'être affichée. Sans cette pause, le statut
      // « en cours » qu'on vient de poser n'apparaissait JAMAIS pendant le calcul du nœud, le
      // bouton « Arrêter » restait inatteignable, et l'on ne voyait pas qui travaillait — mesuré
      // sur cinq nœuds ordinaires : 1,4 seconde sans une seule image sur 1,6 seconde d'exécution.
      //
      // Elle coûte un millième de seconde par nœud. Elle ne suffit pas à elle seule — un nœud qui
      // calcule dix secondes d'affilée fige toujours dix secondes —, mais elle rend l'interface
      // vivante ENTRE les nœuds, et c'est là que se joue la perception d'une application qui répond.
      await respirer();
      if (controller.signal.aborted) break;

      // NE PAS invalider tous les nœuds en aval dans l'ordre topologique plat :
      // cela réexécutait les branches PARALLÈLES (sœurs) d'un nœud rejoué, car
      // elles suivent ce nœud dans l'ordre linéaire sans en dépendre. La
      // réexécution des vrais descendants est déjà assurée par `sourceReprocessee`
      // (propagation transitive via `traitesCeRun`), qui ne touche QUE les
      // nœuds dont une entrée réelle a été recalculée ce run.
      //
      // ET C'EST ICI, AVANT L'EXÉCUTION, QUE LE NŒUD EST DÉCLARÉ RETRAITÉ : dès qu'il a TOURNÉ, et
      // non dès que sa sortie a CHANGÉ. Un composant `jamaisCache` qui rend deux fois la même chose
      // entraîne donc toute sa descendance. Comparer les sorties pour arrêter la propagation serait
      // faux : les empreintes décrivent une forme et non un contenu, et deux sons différents de
      // même durée en portent une seule. Voir `core/cache-execution.ts`, qui tient la décision et
      // ses cas.
      traitesCeRun.add(nodeId);

      const fn = registreUI().trouverPlugin(node.data.ficheId as string);
      if (!fn) { noeudsEnErreur.add(nodeId); resultats.set(nodeId, [null]); poserStatut(nodeId, "erreur"); marquerMetaEnEchec(nodeId, node.data.ficheId as string); continue; }

      const start = performance.now();
      const ajouterTemps = (ms: number) => {
        const visibleId = plat.expansions.get(nodeId) ?? nodeId;
        tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + ms);
      };
      // CE QUE LE NŒUD REÇOIT EST CONSTRUIT PAR LE CŒUR, dans `core/contexte-de-passe.ts` : ses
      // entrées, ses réglages lus comme le contrat le dit, la question des sorties, retenue pour la
      // clé de cache, et un `onProgress` qui lève après annulation.
      const { ctx: contexteDuNoeud, aConsulteSesSorties } = contexteDePasse<ValeurTransportee, AudioContext>({
        noeud: node, aretes: aretesG, resultats, runtime: ctx, repertoireTravail: repertoire,
        trouverDef, canoniser: valeurCanoniqueChoix, graineDuNoeud, signal: controller.signal,
        poserProgression: (msg) => poserStatut(nodeId, "en_cours", msg, true),
      });
      try {
        const res = await fn(contexteDuNoeud);
        // Le nœud a été réinitialisé pendant que sa promesse était en vol (le
        // plugin a ignoré `signal`, ou a fini pile au moment de l'annulation) :
        // ne pas écraser l'état déjà remis à « attente » par le reset avec un
        // résultat/statut « terminé » ou « erreur » périmé.
        if (controller.signal.aborted) break;
        // ═══ L'INVARIANT : TOUT CE QUI CIRCULE SUR UNE ARÊTE EST À LA FRÉQUENCE DU PROJET ═══
        //
        // Point 5 d'une revue du dépôt. À LA SORTIE ET NON À L'ENTRÉE : une valeur lue par trois
        // nœuds serait sinon convertie trois fois, et son aperçu — celui qu'on écoute et qu'on
        // enregistre — ne serait à la bonne fréquence sur aucun des trois. Le domaine décide de
        // tout : ce qu'est une fréquence, laquelle est celle du projet, quel rééchantillonneur
        // l'applique. Gratuit dans le cas ordinaire, où il rend le même tableau.
        const valeurs = await servicesApercu().porterALaFrequenceDeTravail(res.valeurs as unknown[]);
        resultats.set(nodeId, valeurs as ValeurTransportee[]);
        // CE QUE LES SORTIES HÉRITENT DES ENTRÉES, et que le calcul ne reproduit pas : côté audio,
        // la disposition des canaux. C'est ici, et seulement ici, que les entrées et les sorties
        // sont toutes deux sous la main — d'où la question posée depuis ce point du moteur.
        const entrantes = () => valeursEntrantes<ValeurTransportee>(nodeId, aretesG, resultats) as unknown[];
        servicesApercu().heriterDesEntrees(valeurs, entrantes());
        // DE COMBIEN CE NŒUD A CHANGÉ LE NIVEAU DE CE QU'IL A REÇU, porté sur le nœud à côté du
        // temps d'exécution. Ce que « niveau » veut dire appartient au domaine, et c'est lui qui
        // mesure ; le shell ne sait que l'endroit où la question se pose.
        const ecart = servicesApercu().ecartNiveau(valeurs, entrantes());
        if (ecart !== undefined) ecartsParNoeud.set(nodeId, ecart);
        // ET LE GARDE DE L'INVARIANT : ce recensement a d'abord servi à mesurer avant de convertir,
        // il ne doit désormais PLUS JAMAIS PARLER — toute valeur posée dans les résultats est à la
        // fréquence du projet, donc aucun nœud n'en reçoit deux. S'il parle, la conversion n'a pas
        // eu lieu, et c'est l'unique symptôme qu'on en aurait.
        const melees = servicesApercu().frequencesMelees(entrantes()); if (melees.length) console.warn(`[frequence] ${nodeId}(${node.data.ficheId}) reçoit ${melees.join(" et ")} Hz : la conversion du moteur n'a pas eu lieu`);
        if (res.message) messages.set(nodeId, res.message);
        if (res.affichage) affichageParNoeud.set(nodeId, res.affichage);
        if (res.designe) designeParNoeud.set(nodeId, res.designe);
        if (res.moteur) demandesParNoeud.set(nodeId, res.moteur);
        // Un nœud qui A des sorties mais ne renvoie QUE des null n'a pas réussi
        // (entrée manquante, pas assez d'entrées, fichier absent…) : le marquer
        // « erreur » (et donc le propager) au lieu de « terminé ». Sinon un
        // mixer/endpoint en aval « aboutit » alors qu'aucun résultat n'a été
        // produit — la branche n'a rien donné mais le workflow paraît réussi.
        // …SAUF si la fiche déclare qu'une sortie nulle est un résultat valide
        // (sortieNullePermise) : « aucune note détectée » d'un transcripteur ou
        // un nœud-frontière ne sont pas des échecs.
        const defRes = trouverDef(node.data.ficheId as string);
        if (estResultatEnErreur(defRes, res as { valeurs: ValeurTransportee[]; erreur?: boolean })) {
          noeudsEnErreur.add(nodeId);
          poserStatut(nodeId, "erreur", res.message);
          marquerMetaEnEchec(nodeId, node.data.ficheId as string);
          ajouterTemps(performance.now() - start);
        } else {
          const elapsed = performance.now() - start;
          // ═══ UNE EXÉCUTION PÉRIMÉE N'ÉCRIT PLUS DANS LE CACHE ═══
          //
          // C'est la seule écriture du cache de tout le moteur, et c'est donc le seul endroit où ce
          // jeton compte. La sérialisation empêche deux runs de tourner ensemble ; ce qu'elle ne peut
          // pas empêcher, c'est qu'un composant lance son propre travail asynchrone sans consulter
          // son signal — « continue en arrière-plan et écrase l'état qu'on vient de réinitialiser »,
          // ce que `reinitialiserIds` dit déjà de lui. Son résultat arriverait alors dans le cache
          // d'un graphe qui tourne maintenant.
          // `consulteSorties` est ce que le nœud vient de DEMANDER, et non ce qu'une fiche déclare :
          // sans lui, le câblage aval de tous entrerait dans la clé pour la raison d'un seul.
          // LE CACHE GARDE LES VALEURS CONVERTIES, et non celles que le composant a rendues : un
          // coup de cache les repose telles quelles dans les résultats, et garder les brutes aurait
          // rompu l'invariant de fréquence sur tout nœud rejoué depuis le cache — c'est-à-dire la
          // plupart, et seulement au deuxième run. Le genre de défaut qu'on ne reproduit jamais.
          if (!jeton?.perime()) cacheExec.current.set(nodeId, { valeurs: valeurs as ValeurTransportee[], message: res.message, affichage: res.affichage, designe: res.designe, hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree, consulteSorties: aConsulteSesSorties(), tempsExecution: elapsed, empreinteBoucle: sauts.empreintePour(nodeId) });
          else console.warn(`[cache] resultat perime ecarte : ${nodeId} (generation ${jeton.generation})`);
          // ═══ CE QUE LE COMPOSANT REND EST-IL DU TYPE QU'IL PROMET ? ═══
          //
          // Point 6 d'une revue du dépôt : rien ne le vérifiait, et un composant qui déclare une
          // sortie audio pouvait rendre n'importe quoi. Le prédicat vit sur le TYPE DE FLUX, que le
          // domaine déclare ; le moteur ne fait que poser la question. Il RAPPORTE et ne refuse
          // pas : un écart est un défaut du composant, et refuser casserait le graphe de quelqu'un
          // qui n'y peut rien. Voir `core/types-au-port.ts`.
          //
          // CETTE LIGNE REMPLACE UN `console.log` QUE PERSONNE NE LISAIT — « [cache store] » et ses
          // quatre empreintes, interpolées pour chaque nœud de chaque run. Le fichier est à son
          // plafond de dette : ce qu'on y ajoute doit y être payé, et une vérification valait mieux
          // qu'un journal. Elle coûte d'ailleurs moins : un `instanceof` au lieu d'une chaîne.
          signalerEcartsDeType(nodeId, String(node.data.ficheId), defRes?.sorties ?? [], valeurs, (t) => registreUI().typeFlux(t));
          poserStatut(nodeId, "termine");
          ajouterTemps(elapsed);
        }
      } catch (e: any) {
        // Même garde que côté succès : une exception levée après annulation
        // (ex. le plugin vérifie `signal.aborted` et lève pour sortir vite de
        // sa boucle) ne doit pas non plus marquer le nœud « erreur ».
        if (controller.signal.aborted) break;
        // Spec §6.5 : toute exception d'un executer est journalisée (console.error)
        // ET remontée sur le nœud (statut « erreur » + message).
        const elapsed = performance.now() - start;
        console.error(`[attic] Nœud « ${node.data.ficheId} » (id=${nodeId}) a échoué :`, e);
        noeudsEnErreur.add(nodeId);
        resultats.set(nodeId, [null]);
        poserStatut(nodeId, "erreur", e?.message ? String(e.message) : undefined);
        marquerMetaEnEchec(nodeId, node.data.ficheId as string);
        ajouterTemps(elapsed);
      }
      // CE NŒUD-CI A FINI, ET C'EST MAINTENANT QU'IL A QUELQUE CHOSE À MONTRER. En erreur comme en
      // succès : un message d'erreur est un résultat, et l'attendre jusqu'au bout de la boucle
      // laissait un nœud rouge sans sa raison.
      aPoser.add(nodeId);
      // SEUL LE NŒUD QU'ON REGARDE EST POSÉ PENDANT LE RUN, et les autres à la fin.
      //
      // POURQUOI CE PARTAGE, ET CE QU'IL COÛTE. Montrer un résultat coûte le rendu de ce résultat :
      // mesuré en A/B alterné sur douze nœuds, poser chacun pendant le run portait le run de 4 103
      // à 4 920 ms, soit +20 %. Ce n'est pas une inefficacité à corriger — `setNodes`, le double
      // calcul du correctif, le souffle et le parcours du tampon par l'indicateur de niveau ont été
      // éliminés tour à tour, et le coût est resté. C'est le prix du dessin, que l'ancien moteur ne
      // payait pas parce qu'il dessinait tout après le dernier nœud.
      //
      // ON NE LE PAIE DONC QUE POUR CE QU'ON REGARDE. Le nœud sélectionné ou terminal est posé
      // aussitôt, les autres à la fin de la boucle : le coût tombe de N nœuds à un ou deux, et l'on
      // voit sans attendre ce que l'on avait sous les yeux. Relevé par Fabien : « les lecteurs
      // apparaissent longtemps après que les nœuds soient notés comme terminés dans les workflows
      // longs ».
      if (estRegarde(nodeId)) await poserUnNoeud(nodeId);
    }

    // LE MÉNAGE D'APRÈS PASSE ET LES LECTEURS, dans `ui/menage-apres-passe.ts`, dans cet ordre : le
    // cache lâché, les causes de boucle et les graines dans les messages, la pose finale, les demandes,
    // les champs autonomes et le statut des conteneurs ; puis chaque lecteur promis, un par un.
    const noeudsVisibles = () => noeudsRef.current;
    await menageApresPasse(passe, {
      noeudsVisibles, nds, cache: cacheExec.current, deplie, expansions: plat.expansions, grainesTirees,
      tempsParVisible, ecartsParNoeud, demandesParNoeud, ordonnees, idsDecoratifs, boites,
      dejaPoses, aPoser, poserCeQuiEstPret, definirStatut, setNodes, onGrapheGenere, onNodeInstalle,
    });
    await ecrireLesLecteurs(passe, { signal: controller.signal, noeudsVisibles });

    } catch (e: any) {
      console.error("lancer error", e);
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      // Le nœud qui tournait à l'instant de l'arrêt garde le statut « en cours » : la
      // boucle sort par un `break` sans jamais statuer sur lui. Une réinitialisation
      // remettait tout à « attente », mais un arrêt simple ne touche à rien — le nœud
      // resterait donc à tourner à l'écran, indéfiniment, sans que rien ne tourne.
      if (controller.signal.aborted) {
        for (const id of statutsPoses()) {
          if (statutDeNoeud(id).statut === "en_cours") reinitialiserStatuts([id]);
        }
      }
      // Seul le run global a positionné le spinner/flag ; une exécution ciblée
      // (nœud prioritaire) ne doit PAS effacer l'état d'un run global encore en cours.
      //
      // La ref est remise à faux ICI, et pas seulement par l'effet qui la synchronise sur
      // l'état React : `lancer` la lit pour refuser un second run, et le début de cette
      // fonction la met à vrai de la même façon, sans attendre React. Sans cette ligne,
      // relancer aussitôt après la fin d'un run — ce qu'on fait naturellement après avoir
      // cliqué sur « Arrêter » — tombait dans le garde-fou anti-double-clic et ne faisait
      // rien du tout. Un test de bout en bout l'a pris sur le fait : après un arrêt, la
      // barre d'espace laissait les quatorze nœuds « en attente ».
      if (estGlobal) { enExecRef.current = false; setEnExecution(false); }
      // Lire la valeur LIVE (pas la closure, périmée quand onDefinirPrioritaire vient
      // de la fixer) pour toujours effacer la priorité après le run — sinon le run
      // global suivant reste filtré sur l'ancien nœud prioritaire.
      if (prioritaireRef.current) setPrioritaire(null);
    }
  }, [prioritaire, repertoire, t]);

  // ── Les deux pilotes de passes, le lot et les boucles par passes, dans usePilotesDePasse.ts ──
  const { lancerLeLot } = usePilotesDePasse({ lancerUnePasse, noeudsRef, aretesRef, cacheExec, arretLotRef });

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
  const lancer = useCallback((p?: string, perimetre?: PerimetreCible) => ordonnanceur.demander((j) => lancerLeLot(p, perimetre, j), fusionDeLot(p, perimetre, lancerLeLot)), [ordonnanceur, lancerLeLot]);

  return { lancer, arreter, reinitialiserNoeud, reinitialiserAval, reinitialiserPourReglage, reinitialiserTout };
}
