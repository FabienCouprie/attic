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
  type NoeudG, type AreteG,
} from "../../core";

// CE QUE LE SHELL TRANSPORTE SANS LE REGARDER. Le moteur d exécution déclarait ses valeurs
// `TypeValeur`, c est-à-dire l union du domaine audio : le chemin d exécution de TOUS les domaines
// était typé contre un seul. Il n en lit aucune ; il les prend d un nœud et les donne au suivant.
// Depuis la pièce 3 du plan du runtime, c'est la boucle du cœur qui les transporte, en `unknown`.
import { creerTablesDePasse, executerLesNoeuds } from "../../core/execution";
import { Respiration, respirer } from "../../core/respirer";
import { noeudRegarde } from "../../core/memoire";
import { servicesDomaine } from "../../core/services-domaine";
import { poserStatut as poserStatutNoeud, poserStatutOmbre, reinitialiserStatuts, statutDe as statutDeNoeud, statutsPoses } from "../statuts";
import { poserResultat } from "../resultats";
import { sautsDeBoucles } from "../../core/saut-de-boucle";
import { creerResolveurDeGraines } from "../../core/graines-de-passe";
import { preparerLaPasse } from "../../core/preparation-passe";

import { servicesOrchestration } from "../services-orchestration";
// CE QUE LE SHELL DEMANDE AU DOMAINE SUR LES VALEURS PRODUITES. Six fonctions audio étaient
// importées ici, sur le chemin d'exécution de tous les domaines, et `AudioBuffer` nommé à trois
// endroits. Les questions sont désormais posées, et le domaine y répond (cf. ui/services-apercu.ts).
import { servicesApercu } from "../services-apercu";
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
      ordreFiltre, idsDecoratifs, ordonnees, estMetaEnScope,
    } = plan;
    servicesOrchestration().publierGraphe(plan.aDocumenter);
    for (const a of plan.avertissements) console.warn(a);
    for (const s of plan.statuts) definirStatut(s.id, s.statut, s.progression);
    console.log(plan.traceOrdre);

    const ctx = await obtenirAudio();
    // LES TABLES DE LA PASSE, créées avant la boucle : les deux premières sont publiées avant elle, et
    // le ménage lit les autres après. Voir `TablesDePasse` dans `core/execution.ts`.
    const tables = creerTablesDePasse();
    const { resultats, messages, affichageParNoeud, designeParNoeud, demandesParNoeud, ecartsParNoeud, tempsParVisible } = tables;
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
    // ── LA BOUCLE NŒUD PAR NŒUD EST DANS LE CŒUR, `executerLesNoeuds` de `core/execution.ts` ──
    // Décider, appliquer la décision, exécuter, ranger le retour, avec ses trois points d'annulation.
    // Le crochet lui prête ce qu'il tient : le runtime, le contrôleur, le jeton, le registre, le cache,
    // les sauts de boucle, les questions du domaine, la pose des statuts et celle des résultats.
    await executerLesNoeuds<AudioContext>(plan, tables, {
      runtime: ctx, repertoireTravail: repertoire, signal: controller.signal, jeton, trouverDef,
      trouverPlugin: (f) => registreUI().trouverPlugin(f), typeFlux: (t) => registreUI().typeFlux(t),
      canoniser: valeurCanoniqueChoix, graineDuNoeud,
      lireCache: (id) => cacheExec.current.get(id),
      ecrireCache: (id, entree) => cacheExec.current.set(id, entree),
      sauts, questions: () => servicesApercu(), poser: definirStatut, poserOmbre: poserStatutOmbre, t,
      // CE NŒUD-CI A FINI, ET C'EST MAINTENANT QU'IL A QUELQUE CHOSE À MONTRER : il rejoint ce qui
      // est à poser, et il est posé aussitôt s'il est regardé.
      quandUnNoeudAFini: (nodeId) => {
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
        // longs ». La promesse n'est rendue, et attendue, que pour le nœud regardé.
        if (estRegarde(nodeId)) return poserUnNoeud(nodeId);
      },
    });

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
