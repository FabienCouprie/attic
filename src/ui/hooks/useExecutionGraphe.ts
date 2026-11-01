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
  aplatirGraphe, estBulle, estCacheParBulle, estSubstitution, grapheSansConteneurs,
  sortieDeBulle,
  trouverMeta,
  ordreTopologique, placerEnDernier, ancetres, descendants, perimetreCible, empreinteParametres, empreinteEntrees, empreinteSorties, empreinteValeursEntrantes,
  noeudsEnCycle, resoudreEntree, valeursEntrantes, validerGraphe, signalerEcartsDeType,
  type NoeudG, type AreteG,
} from "../../core";

// CE QUE LE SHELL TRANSPORTE SANS LE REGARDER. Le moteur d exécution déclarait ses valeurs
// `TypeValeur`, c est-à-dire l union du domaine audio : le chemin d exécution de TOUS les domaines
// était typé contre un seul. Il n en lit aucune ; il les prend d un nœud et les donne au suivant.
type ValeurTransportee = unknown;
import { peutReutiliserLeCache, sourceRetraitee } from "../../core/cache-execution";
import { estResultatEnErreur } from "../../core/execution";
import { Respiration, respirer } from "../../core/respirer";
import { noeudRegarde, resultatRetenu } from "../../core/memoire";
import { servicesDomaine } from "../../core/services-domaine";
import { poserApercu, poserStatut as poserStatutNoeud, poserStatutOmbre, reinitialiserStatuts, statutDe as statutDeNoeud, statutsPoses } from "../statuts";
import { aRemettreAZero, avecLeursBulles, conteneurs, statutDuContenu } from "../../core/conteneurs";
import { effacerResultats, poserResultat, resultatDe } from "../resultats";
import { COPIES_MAX, deplierBoucles } from "../../core/boucle-graphe";
import { lacherLeCorps, sautsDeBoucles } from "../../core/saut-de-boucle";
import { graineDuTour, resoudreGraine } from "../../core/hasard";
import { deplierInstruments } from "../../core/instrument-graphe";

import { servicesOrchestration } from "../services-orchestration";
// CE QUE LE SHELL DEMANDE AU DOMAINE SUR LES VALEURS PRODUITES. Six fonctions audio étaient
// importées ici, sur le chemin d'exécution de tous les domaines, et `AudioBuffer` nommé à trois
// endroits. Les questions sont désormais posées, et le domaine y répond (cf. ui/services-apercu.ts).
import { servicesApercu, type ApercuRefaisable } from "../services-apercu";
import { apresEffacement, champsAReporter, urlsARevoquer } from "../../core/cycle-de-vie";
import type { DemandeAuMoteur } from "../../core/types";
import { CHAMPS_GARDES_AU_REGLAGE, CLASSES } from "../../core/classes-de-champs";
import { lireProfondeurExport } from "../profondeur-export";
import { fusionDeLot, useOrdonnanceurDeRuns, type JetonDeRun } from "../ordonnanceur-runs";
import { ErreurAnnulation } from "../../core/annulation";
// LES DEUX PILOTES DE PASSES RESTENT ICI, et c'est un choix écrit : les généraliser demande de
// réécrire les deux boucles imbriquées, qui portent l'oubli de cache par passe et l'ordre
// d'emboîtement du lot autour des boucles — deux corrections durement acquises, qu'aucun test
// n'éprouve aujourd'hui ensemble. Voir `ui/services-orchestration.ts`.
import { planifierLot, publierLot } from "../../plugins/lotGlobal";
// LES BORNES SONT DÉCLARÉES AVEC LE COMPTEUR, ET NON ICI. Recopiées des deux côtés, elles auraient
// dérivé à la première qu'on aurait changée, et le test ne garderait plus que la copie du module.
import { avancerBoucles, planifierBoucles, publierBoucles, PASSES_MAX_TOTAL } from "../../plugins/boucleSequencesGlobal";
import type { Sequence } from "../../audio/sequence";

import { traduire, useI18n, valeurCanoniqueChoix } from "../../i18n";
import { registreUI } from "../registre-actif";

const trouverDef = (id: string) => registreUI().trouverDef(id);

/**
 * Ces valeurs atteignent-elles le seuil où un membre de bulle repliée les lâche ? Voir `resultatRetenu`.
 *
 * C'EST LA QUESTION DES APERÇUS, POSÉE POUR UN INTERMÉDIAIRE ET SANS LA BASCULE : une valeur dont le
 * domaine ne garderait pas l'aperçu d'un nœud non regardé est lourde. Le seuil reste donc écrit une
 * seule fois, dans le domaine ; la bascule, elle, est lue par `resultatRetenu`. Une seule sortie
 * lourde suffit : l'entrée de cache les retient toutes.
 */
const valeursLourdes = (valeurs: readonly unknown[] | undefined): boolean =>
  (valeurs ?? []).some((v) => v != null && !servicesApercu().apercuUtile(v, { regarde: false, economie: true }));

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

  // ── Réinitialiser un ensemble de nœuds ──
  //
  // `garder` nomme les champs de résultat à laisser en place, et n'est employé que par le changement
  // de réglage : voir `CHAMPS_GARDES_AU_REGLAGE`. Le bouton de remise à zéro, lui, n'en passe pas.
  const reinitialiserIds = useCallback((demandes: Set<string>, garder?: ReadonlySet<string>) => {
    // Les bulles qui contiennent ces nœuds repartent avec eux : voir `avecLeursBulles`.
    const ids = avecLeursBulles(noeudsRef.current as unknown as NoeudG[], demandes);
    // Un reset pendant un run en cours signale l'annulation : sans ça, le nœud
    // en cours de calcul (ex. extraction de features piste par piste sur une
    // grosse collection) continue en arrière-plan et écrase l'état qu'on vient
    // de réinitialiser dès son prochain onProgress ou sa fin d'exécution.
    if (ordonnanceur.enCours()) abortControllerRef.current?.abort();
    // Les révocations AVANT `setNodes`, et non dans son updater : celui-ci doit
    // être pur. Double-invoqué par StrictMode, il révoquait deux fois — sans
    // conséquence ici, la révocation étant idempotente — mais c'est le même motif
    // qui, à la création d'URL, laissait un blob orphelin par nœud et par run.
    //
    // ON RÉVOQUE CE QUI EST UNE URL D'OBJET, ET NON UNE LISTE DE NOMS. Quatre champs y étaient
    // énumérés à la main, et c'était la même divergence que celle qui a fait survivre des résultats à
    // la remise à zéro : les films du montage vidéo, de l'extrait, du muet et de la démonstration
    // sont eux aussi des `createObjectURL`, et aucun n'y figurait — un blob par nœud et par run
    // restait donc en mémoire. La seule liste qui décide est `CHAMPS_RESULTAT`, et la valeur dit
    // d'elle-même si elle est à révoquer.
    //
    // ET LES URL SE CHERCHENT DANS LE MAGASIN DES RÉSULTATS, où elles vivent désormais. Les
    // chercher encore dans `node.data` n'aurait rien trouvé, et un blob par nœud et par run serait
    // resté en mémoire — le défaut même que le commentaire ci-dessus raconte, à l'endroit suivant.
    for (const n of noeudsRef.current) {
      if (!ids.has(n.id)) continue;
      for (const url of urlsARevoquer(resultatDe(n.id) as any, CLASSES, garder)) URL.revokeObjectURL(url);
    }
    // L'ÉTAT D'EXÉCUTION ET LE RÉSULTAT VIVENT DANS LEURS MAGASINS : les effacer ne passe plus par
    // le tableau des nœuds. `garder` y vaut comme ici, pour qu'un réglage laisse en place ce que le
    // run avait DÉSIGNÉ de ses entrées. Voir `ui/statuts.ts` et `ui/resultats.ts`.
    reinitialiserStatuts(ids);
    effacerResultats(ids, garder);
    setNodes((nds) => nds.map((n) => {
      if (!ids.has(n.id)) return n;
      // LA RÈGLE EST DANS `core/cycle-de-vie.ts`, ce crochet ne fait que l'appliquer : c'est ce qui
      // permet à un banc d'éprouver la transition sur les 448 fiches sans monter React.
      const { etat, saisiesSauvees } = apresEffacement(n.data as any, CLASSES, garder);
      for (const champ of saisiesSauvees) {
        console.warn(`[reinitialiserIds] Tentative de réinitialisation du champ utilisateur "${champ}" — opération annulée.`);
      }
      return { ...n, data: etat as typeof n.data };
    }));
    // LE CACHE D'UN MÉTA EST CELUI DE SES NŒUDS APLATIS, rangés sous `monMeta::…`, à toute
    // profondeur. N'effacer que l'identifiant visible laissait le run suivant reprendre tout son
    // contenu du cache : mesuré, ses quatre nœuds internes repris et seule l'aval refaite.
    for (const cle of [...cacheExec.current.keys()]) {
      if (ids.has(cle.split("::")[0])) cacheExec.current.delete(cle);
    }
  }, [setNodes]);

  // ── Les deux réinitialisations ──
  //
  // Elles ne diffèrent que sur le nœud de départ, et ce détail décide de ce que
  // l'utilisateur voit :
  //
  //   `reinitialiserNoeud` — le nœud ET son aval. Pour un changement qui rend
  //   FAUSSE la sortie du nœud : un autre fichier, un autre paramètre.
  //
  //   `reinitialiserAval` — son aval SEUL. Pour un changement qui périme ce que
  //   l'aval en a tiré sans toucher ce que le nœud affiche. Effacer le nœud
  //   ferait disparaître sa forme d'onde et son lecteur à chaque zone ajoutée,
  //   alors qu'on ajoute justement les zones les unes après les autres en
  //   regardant l'onde.
  //
  // La traversée vit dans core/graphe.ts (testée) ; `aretesRef` garantit des
  // arêtes à jour plutôt qu'une closure périmée. UNE BULLE SE REMET À ZÉRO PAR SES MEMBRES, et
  // chacun avec son aval : voir `aRemettreAZero` dans `core/conteneurs.ts`.
  const reinitialiserNoeud = useCallback((nodeId: string) => {
    const departs = aRemettreAZero(noeudsRef.current as unknown as NoeudG[], nodeId);
    reinitialiserIds(new Set(departs.flatMap((id) => [id, ...descendants(id, aretesRef.current)])));
  }, [reinitialiserIds]);

  /**
   * La remise à zéro d'un changement de RÉGLAGE, et non du bouton.
   *
   * DEUX PORTÉES, ET C'EST TOUT L'OBJET. L'aval est effacé entièrement : ses entrées viennent de
   * changer, donc tout ce qu'il en a tiré est faux, tampons compris. Le nœud réglé, lui, garde ce
   * qu'il avait désigné de SES entrées — un réglage ne les touche pas — et c'est ce qui permet de
   * continuer à entendre son montage pendant qu'on le règle.
   */
  const reinitialiserPourReglage = useCallback((nodeId: string) => {
    reinitialiserIds(descendants(nodeId, aretesRef.current));
    reinitialiserIds(new Set([nodeId]), CHAMPS_GARDES_AU_REGLAGE);
  }, [reinitialiserIds]);

  const reinitialiserAval = useCallback((nodeId: string) => {
    reinitialiserIds(descendants(nodeId, aretesRef.current));
  }, [reinitialiserIds]);

  // ── Réinitialiser tous les nœuds (reset global) ──
  const reinitialiserTout = useCallback(() => {
    const ids = new Set(noeudsRef.current.map((n) => n.id));
    reinitialiserIds(ids);
  }, [reinitialiserIds]);

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
    const aretesReelles = (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a));
    // Aplatit les méta-composants (sous-graphes) en leur contenu réel avant
    // d'exécuter : le moteur DAG tourne sur un graphe sans méta-nœud. Les
    // résultats des nœuds internes sont remontés au méta-nœud via `expansions`.
    const plat = aplatirGraphe(
      noeudsRef.current as unknown as NoeudG[],
      aretesReelles,
      trouverMeta,
    );
    // LE GRAPHE MIS À DISPOSITION DES NŒUDS QUI LE DOCUMENTENT EST CELUI QUI CALCULE : les
    // conteneurs dépliés, leur contenu à leur place, les boucles et les instruments PAS ENCORE
    // recopiés. Il était publié avant l'aplatissement, si bien qu'un méta-composant se documentait
    // lui-même par la notice que son magasin lui fabrique, et que ses oscillateurs n'étaient
    // documentés nulle part. Le contrat d'exécution du cœur ne porte pas le graphe et n'a pas à le
    // porter ; voir plugins/grapheGlobal.ts et core/formes-graphe.ts.
    const aDocumenter = grapheSansConteneurs(
      noeudsRef.current as unknown as NoeudG[],
      aretesReelles,
      trouverMeta,
      estBulle,
    );
    servicesOrchestration().publierGraphe(aDocumenter);
    for (const id of aDocumenter.conteneursRetires) {
      console.warn(`[attic] Documentation : conteneur non dépliable retiré (${id})`);
    }
    // Puis DÉPLIE les instruments : tout ce qui est branché entre « Note d'instrument » et
    // « Fin d'instrument » est recopié une fois PAR NOTE du clavier, la note étant injectée dans
    // chaque copie. C'est ainsi qu'une recette devient un instrument : rien n'est transposé, chaque
    // note est calculée à sa hauteur. Avant le dépliage des boucles, de sorte qu'une chaîne
    // d'instrument puisse elle-même contenir une boucle — chaque copie en porte alors une, et le
    // dépliage suivant les traite comme autant de boucles indépendantes.
    // Voir `core/instrument-graphe.ts`, testé.
    const instruments = deplierInstruments(plat.noeuds, plat.aretes);
    for (const [copie, origine] of instruments.origines) {
      plat.expansions.set(copie, plat.expansions.get(origine) ?? origine);
    }
    for (const p of instruments.problemes) {
      console.warn(`[attic] Instrument de graphe : ${p.code} sur ${p.noeudId}`);
    }
    plat.noeuds = instruments.noeuds;
    plat.aretes = instruments.aretes;

    // Puis DÉPLIE les boucles de graphe : une boucle est un cycle, et le moteur n'exécute
    // que des graphes acycliques. Les nœuds compris entre « Début de boucle » et « Fin de
    // boucle » sont recopiés autant de fois qu'il y a de tours, chaque copie recevant le
    // résultat de la précédente — c'est ainsi que les effets s'accumulent d'un tour à
    // l'autre. Voir `core/boucle-graphe.ts`, testé.
    const deplie = deplierBoucles(plat.noeuds, plat.aretes);
    for (const [copie, origine] of deplie.origines) {
      plat.expansions.set(copie, plat.expansions.get(origine) ?? origine);
    }
    for (const p of deplie.problemes) {
      console.warn(`[attic] Boucle de graphe : ${p.code} sur ${p.noeudId}`);
    }
    // UN DÉBUT DE BOUCLE DIT CE QU'IL EST DEVENU. Il est RETIRÉ du graphe exécuté — c'est la chaîne
    // recopiée qui tourne à sa place —, donc il ne rend rien et restait « En attente » pour
    // toujours, ce qui ne dit rien de ce qui s'est passé. Relevé par Fabien. Le statut est posé ici
    // plutôt qu'après l'exécution : ce n'est pas le compte rendu d'un calcul, c'est ce que le
    // dépliage vient de décider, et cela vaut même si le run est interrompu ensuite.
    for (const d of deplie.depliees) {
      // ET LES TRAVERSÉES AVEC, parce que leur sens ne se devine pas. Une entrée venue du dehors
      // alimente CHAQUE tour à l'identique, une sortie prise ailleurs que par la fin ne sort QU'UNE
      // FOIS, au dernier tour : un seul câble, et trente et une valeurs sur trente-deux qui ne
      // sortent jamais. Elles ne se disent que lorsqu'il y en a, pour ne pas encombrer le cas simple.
      const dits = [t("boucle.depliee").replace("{n}", String(d.tours))];
      if (d.entreesDuDehors > 0) dits.push(t("boucle.entrees").replace("{n}", String(d.entreesDuDehors)));
      if (d.sortiesVersDehors > 0) dits.push(t("boucle.sorties").replace("{n}", String(d.sortiesVersDehors)));
      definirStatut(d.debutId, "attente", dits.join(" · "));
    }
    const nds = deplie.noeuds as unknown as any[];
    const aretes = deplie.aretes as unknown as Edge[];
    // LES BULLES ET LES MÉTAS, ET CE QUE CHACUN CONTIENT parmi les nœuds exécutés. Voir `core/conteneurs.ts`.
    const tousNoeudsG = noeudsRef.current as unknown as NoeudG[];
    const boites = conteneurs(tousNoeudsG, (id) => plat.expansions.get(id) ?? id, (f) => !!trouverMeta(f));
    const prioriteDemandee = noeudPrioritaireId ?? prioritaireRef.current;
    // Un nœud qui passe en dernier rend compte du graphe entier : le lancer seul n'aurait pas de
    // sens, il n'a pas d'amont. Un run ciblé sur lui devient donc un run global.
    const estDernier = (id: string) => trouverDef((deplie.noeuds.find((n) => n.id === id)?.data as { ficheId?: string } | undefined)?.ficheId as string)?.executerEnDernier === true;
    const priorite = prioriteDemandee && estDernier(prioriteDemandee) ? undefined : prioriteDemandee;

    // Topologie (logique pure testée — cf. core/graphe.ts)
    const aretesG = aretes as unknown as AreteG[];
    const ordonnees = placerEnDernier(ordreTopologique(nds.map((n) => n.id), aretesG), estDernier, aretesG);
    let ordreFiltre = ordonnees;
    // Périmètre d'un run ciblé (nœud prioritaire) : null = run global (tout le graphe).
    let ancPriorite: Set<string> | null = null;
    if (priorite) {
      // UN CONTENEUR SE LANCE PAR TOUT SON CONTENU. Un méta n'existe pas dans le graphe aplati, une
      // bulle n'y a aucune arête : viser leur seul identifiant ne lançait rien, et ne cibler que les
      // nœuds qui alimentent les sorties d'un méta laissait de côté le reste. Voir `core/conteneurs.ts`.
      const contenu = boites.contenu(priorite, ordonnees);
      const cibles = contenu.length > 0 ? contenu : [priorite];
      // LE PÉRIMÈTRE EST CALCULÉ PAR `core/graphe.ts`, pur et éprouvé à part : ce crochet ne fait
      // que le lui demander. L'AVAL Y ENTRE QUAND C'EST UNE RELANCE APRÈS RÉGLAGE, et pas autrement.
      //
      // RELEVÉ PAR FABIEN : « j'ai l'impression que le gain de la table de montage ne fonctionne
      // pas ». Il fonctionnait : le montage se recalculait bien, cache rafraîchi, mais **rien en
      // aval n'était refait**, alors que le moteur venait d'en effacer les résultats. Mesuré sur
      // une chaîne générateur → montage → rotation ambisonique : aussitôt le gain changé, le nœud
      // d'aval passait à « En attente » sans lecteur, et une relance GLOBALE donnait le bon niveau,
      // 0,05931 contre 0,5931, soit le rapport de dix attendu pour −20 dB. Le calcul était donc
      // juste ; c'est la propagation qui manquait. Depuis l'aval — où l'on écoute, où l'on exporte
      // — le gain paraissait mort.
      //
      // ET UN RUN CIBLÉ DEMANDÉ PAR LA PERSONNE N'EMBRASSE TOUJOURS QUE L'AMONT. Les deux chemins
      // passent par ici, et leur intention diffère : cliquer le ▶ d'un nœud veut dire « calcule
      // jusqu'ici », et y ajouter l'aval ferait tourner ce qu'on n'a pas demandé. Une relance
      // automatique, elle, n'a pas été demandée du tout : elle répare l'effacement qu'un réglage
      // vient de causer, et doit donc refaire tout ce qui a été effacé.
      const anc = perimetreCible(cibles, aretesG, perimetre?.versLAval === true);
      ancPriorite = anc;
      ordreFiltre = ordonnees.filter((id) => anc.has(id));
    }
    // Debug : tracer l'ordre topologique réel pour diagnostiquer les exécutions avant
    // les branches amont (ex. mélangeur terminal avant SpeechT5).
    console.log("[ordre] priorite=" + priorite + " ordreFiltre=" + ordreFiltre.map((id) => id + "(" + ((nds.find((n: any) => n.id === id) as any)?.data?.ficheId ?? "?") + ")").join(", "));
    // Résout les types depuis les PluginDef et rejette les arêtes incompatibles.
    // Les nœuds cibles passent en statut « erreur » et ne sont pas exécutés.
    // `validerGraphe` inspecte TOUT le graphe (entrées obligatoires non connectées
    // comprises) : sur un run ciblé (nœud prioritaire), un nœud hors périmètre —
    // même totalement déconnecté du nœud lancé — se faisait donc marquer « erreur »
    // alors qu'il n'a ni lien ni exécution avec le nœud sur lequel on a cliqué
    // « lancer ». On restreint donc l'application des résultats de validation au
    // périmètre du run (`ancPriorite`), comme le fait déjà `ordreFiltre` plus bas.
    // LA VALIDATION PORTE SUR LE GRAPHE RÉELLEMENT EXÉCUTÉ, nœuds ET arêtes venant du même état.
    //
    // Elle lisait les nœuds d'AVANT le dépliage et les arêtes d'APRÈS. Or déplier une boucle RETIRE
    // son « Début de boucle » et recâble ses arêtes vers les copies : le validateur voyait donc ce
    // nœud sans la moindre arête, lui reprochait son entrée requise non branchée, et le marquait en
    // erreur. Relevé sur deux boucles de trente-deux tours qui avaient parfaitement abouti : les
    // 256 copies exécutées, les deux fins de boucle terminées, et les deux débuts en rouge.
    //
    // Le tri topologique et le relevé des cycles travaillent déjà sur `nds`, et la raison est écrite
    // plus bas dans les mêmes termes : « sur le graphe RÉELLEMENT exécuté, avec les mêmes entrées
    // que le tri lui-même ». La validation manquait seulement à l'appel.
    const validation = validerGraphe(
      nds,
      aretes as unknown as AreteG[],
      (ficheId) => trouverDef(ficheId),
      registreUI().fluxCompatibles,
    );
    const noeudsEnErreur = new Set<string>();
    for (const [nodeId, msgs] of validation.noeudsAffectes) {
      if (ancPriorite && !ancPriorite.has(nodeId)) continue;
      noeudsEnErreur.add(nodeId);
      definirStatut(nodeId, "erreur", msgs[0]);
    }
    // UN CYCLE NE DOIT PAS ÊTRE UNE PANNE MUETTE. Kahn n'émet jamais un nœud pris dans un cycle :
    // ce qui manque à l'ordre EST le cycle, et ces nœuds ne sont donc pas exécutés. Jusqu'ici ils
    // l'étaient en silence — ni statut, ni message —, et une branche entière restait sans résultat
    // sans que rien ne dise pourquoi. La pose d'une arête refuse désormais de refermer un cycle,
    // mais un projet enregistré avant ce contrôle peut en porter un, et l'aplatissement d'un méta
    // ou d'un instrument pourrait en fabriquer un : le relevé se fait donc ici aussi, sur le graphe
    // RÉELLEMENT exécuté, avec les mêmes entrées que le tri lui-même.
    for (const id of noeudsEnCycle(nds.map((n: any) => n.id), aretesG)) {
      if (ancPriorite && !ancPriorite.has(id)) continue;
      if (noeudsEnErreur.has(id)) continue;
      noeudsEnErreur.add(id);
      definirStatut(id, "erreur", traduire("erreur.cycle"));
    }
    // Un méta est « dans le périmètre » du run ssi au moins un de ses nœuds internes
    // aplatis (`${id}::…`) y figure. Un run prioritaire ne doit PAS toucher les métas
    // hors périmètre (branches déconnectées) — sinon ils passaient « en cours » puis
    // « erreur », donnant l'illusion d'un run global.
    // Une bulle rejoint le commentaire et le cadre : elle ne calcule rien, ses membres si.
    const idsDecoratifs = new Set(nds.filter((n: any) =>
      n.data?.ficheId === "comment" || n.data?.ficheId === "frame" || estBulle(n.data?.ficheId),
    ).map((n: any) => n.id));
    ordreFiltre = ordreFiltre.filter((id) => !idsDecoratifs.has(id));
    const estMetaEnScope = (nodeId: string) => ordreFiltre.some((id) => id.startsWith(`${nodeId}::`));

    for (const id of ordreFiltre) {
      if (!noeudsEnErreur.has(id)) definirStatut(id, "attente");
    }

    // UN CONTENEUR DIT CE QUE FAIT SON CONTENU. Une bulle ou un méta ne calcule rien, mais un
    // conteneur muet pendant que son contenu travaille laisserait croire qu'il ne se passe rien. Il
    // est en cours dès que ce run touche à l'un de ses nœuds ; son statut final se pose après le run.
    for (const c of boites.ids) {
      if (!noeudsEnErreur.has(c) && boites.contenu(c, ordreFiltre).length > 0) definirStatut(c, "en_cours");
    }

    const ctx = await obtenirAudio();
    const resultats = new Map<string, ValeurTransportee[]>();
    const messages = new Map<string, string>();
    const traitesCeRun = new Set<string>();
    // UNE BOUCLE INCHANGÉE NE SE RECALCULE PAS, son corps eût-il été lâché. Voir `core/saut-de-boucle.ts`.
    const sauts = sautsDeBoucles(deplie.depliees, { noeuds: deplie.noeuds, aretes: aretesG, resultats, cache: cacheExec.current, toursDesCopies: deplie.toursDesCopies,
      reglages: JSON.stringify(servicesDomaine().reglagesDeProjet()), jamaisCache: (id) => trouverDef(deplie.noeuds.find((n) => n.id === id)?.data.ficheId as string)?.jamaisCache === true });

    // ── Les graines, résolues au CENTRE ──
    //
    // Relevé par Fabien : « il y a un excès de décentralisation, il faut le corriger partout où
    // c'est possible, le fonctionnement sur les graines doit être homogène ». Soixante-seize
    // réglages de graine vivaient dans soixante-cinq fichiers, et la convention du projet n'était
    // appliquée que par treize d'entre eux ; ailleurs, une graine à zéro était une graine FIXE
    // valant zéro, qui rendait toujours la même chose quand la documentation annonçait le contraire.
    //
    // DEUX TABLES, ET ELLES NE DISENT PAS LA MÊME CHOSE. `graines` retient ce qu'un nœud a obtenu,
    // pour que deux lectures du même réglage rendent la même valeur. `basesDeGraine` retient ce que
    // le nœud VISIBLE a tiré, et ne sert qu'aux boucles à graines variables : tous les tours
    // partagent alors la même base, que leur numéro décale, de sorte que fixer cette base rejoue la
    // boucle entière à l'identique. Sans cette option, chaque copie résout pour elle-même, ce qui
    // est exactement ce que les graphes enregistrés font aujourd'hui.
    const graines = new Map<string, number>();
    const basesDeGraine = new Map<string, number>();
    /** Ce qu'un nœud a TIRÉ, par réglage : rendu dans son message, sans quoi on ne pourrait le rejouer. */
    const grainesTirees = new Map<string, { nom: string; valeur: number }[]>();

    const graineDuNoeud = (nodeId: string, nom: string, brut: number): number => {
      const cle = `${nodeId}|${nom}`;
      const deja = graines.get(cle);
      if (deja !== undefined) return deja;
      const tour = deplie.toursDesCopies.get(nodeId);
      const origine = deplie.origines.get(nodeId);
      let valeur: number;
      let base: number;
      if (tour === undefined && origine === undefined) {
        valeur = base = resoudreGraine(brut);
      } else {
        // LES COPIES D'UN MÊME NŒUD PARTAGENT UNE BASE, dans les deux réglages, et c'est ce qui rend
        // la boucle rejouable : une seule graine à reposer, et les trente-deux tours reviennent.
        // Sans ce partage, « Identiques » mentait dès que la graine était à zéro — chaque copie
        // tirait la sienne, et les tours différaient sous une étiquette qui promet le contraire.
        const cleBase = `${origine ?? nodeId}|${nom}`;
        const deja = basesDeGraine.get(cleBase);
        base = deja ?? resoudreGraine(brut);
        if (deja === undefined) basesDeGraine.set(cleBase, base);
        // Et c'est la CONVENTION DE GRAINE qui mêle le numéro du tour, jamais le moteur lui-même.
        valeur = tour === undefined ? base : graineDuTour(base, tour);
      }
      graines.set(cle, valeur);
      // TIRÉE veut dire que l'utilisateur n'en avait pas posé : c'est celle-là qu'il faut lui rendre,
      // SUR LE NŒUD QU'IL VOIT. Dans une boucle, celui qui tire est une COPIE, dont l'identifiant
      // n'existe pas à l'écran ; et ce qu'on lui rend est LA BASE, jamais la graine d'un tour :
      // reposer une graine de tour ne rejouerait rien, quand la base rejoue les trente-deux.
      if (!(brut > 0)) {
        const visible = plat.expansions.get(nodeId) ?? nodeId;
        const liste = grainesTirees.get(visible) ?? [];
        if (!liste.some((g) => g.nom === nom)) liste.push({ nom, valeur: base });
        grainesTirees.set(visible, liste);
      }
      return valeur;
    };
    // Les tables VIVANTES du run, pour les nœuds qui passent en dernier (cf. grapheGlobal.ts).
    servicesOrchestration().publierExecution({ ordre: ordreFiltre, noeuds: nds, aretes: aretesG, resultats, messages, expansions: plat.expansions });

    // Retour visuel IMMÉDIAT sur le méta propriétaire d'un nœud interne en échec.
    // Sans ça le méta garde son « en cours » (posé en amont) jusqu'à la passe
    // finale — qui n'arrive qu'à la toute fin du run, voire jamais si une autre
    // branche est très lente : le méta semble alors tourner normalement alors que
    // sa chaîne interne a déjà échoué. `expansions` relie un id aplati au
    // méta-nœud visible d'origine.
    const marquerMetaEnEchec = (idAplati: string, detail?: string) => {
      const proprio = plat.expansions.get(idAplati);
      if (proprio && proprio !== idAplati) {
        definirStatut(proprio, "erreur", detail ? t("execution.brancheEnEchecDetail").replace("{detail}", detail) : t("execution.brancheEnEchec"));
      }
    };

    // ── Les statuts des nœuds DÉPLIÉS ──
    //
    // Un graphe déplié — boucle ou instrument — n'exécute pas les nœuds qu'on voit : il exécute des
    // COPIES, aux identifiants fabriqués. `definirStatut` cherchant le nœud par son id dans la liste
    // visible, ces copies ne posaient aucun statut, et les nœuds de la chaîne restaient affichés « en
    // attente » alors que leur travail était fait — constaté dans l'application : « note=attente |
    // filtre=attente » pendant que la fin d'instrument annonçait ses deux notes rendues.
    //
    // `expansions` relie une copie au nœud visible dont elle vient : on traduit donc l'id avant de
    // poser le statut. Le moteur exécutant les copies l'une après l'autre, la dernière à finir
    // décide de l'état affiché, ce qui est le bon comportement — sauf pour une ERREUR, qu'une copie
    // suivante ne doit pas effacer : un nœud dont une seule note a échoué a échoué.
    //
    // ET LA COPIE GARDE LE SIEN, en ombre : c'est ce que lit le statut final d'un méta ou d'une bulle,
    // qui doit savoir lesquels de ses nœuds ont tourné. Voir `poserStatutOmbre` dans `ui/statuts.ts`.
    const visiblesEnErreur = new Set<string>();
    const poserStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
      const visibleId = plat.expansions.get(nodeId) ?? nodeId;
      if (visibleId !== nodeId) poserStatutOmbre(nodeId, visibleId, statut);
      if (statut === "erreur") visiblesEnErreur.add(visibleId);
      else if (visiblesEnErreur.has(visibleId)) return;
      definirStatut(visibleId, statut, progression, progressionDuNoeud);
    };

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
    const poserUnNoeud = async (id: string) => {
      aPoser.delete(id);
      const n = noeudsRef.current.find((x) => x.id === id);
      if (!n) return;
      const patch = await calculerCorrectifResultat(n);
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
      // Sauter les nœuds en erreur (connexion illégale) — déjà marqués « erreur »
      if (noeudsEnErreur.has(nodeId)) continue;
      // ── Propagation d'erreur ──
      // Si une entrée de ce nœud provient d'un nœud en erreur (validation OU échec
      // d'exécution), il ne peut pas produire un résultat correct : le marquer en
      // erreur au lieu de « réussir » silencieusement avec une entrée manquante —
      // cas d'un mixer/joiner de terminaison en aval de branches parallèles dont
      // une a échoué. L'ordre topologique garantit que la source est déjà traitée.
      const entreeFautive = aretesG.find((a) => a.target === nodeId && noeudsEnErreur.has(a.source));
      if (entreeFautive) {
        noeudsEnErreur.add(nodeId);
        resultats.set(nodeId, [null]);
        poserStatut(nodeId, "erreur", t("execution.entreeEnErreur").replace("{source}", entreeFautive.source));
        marquerMetaEnEchec(nodeId);
        continue;
      }
      const node = nds.find((n) => n.id === nodeId);
      if (!node) continue;
      if (sauts.copieSautee(nodeId, traitesCeRun)) { poserStatut(nodeId, "termine"); continue; }

      const sourceReprocessee = sourceRetraitee(nodeId, aretes, traitesCeRun);
      // LES RÉGLAGES DE PROJET DU DOMAINE ENTRENT DANS LA CLÉ, et c'est un défaut évité de peu :
      // changer la fréquence de travail d'un projet ne relançait rien, et le lancement suivant
      // reposait les tampons du cache — à l'ancienne fréquence. Le réglage aurait paru inopérant au
      // deuxième run, ce qui est la pire espèce de panne. Le moteur ne sait pas ce qu'il hache : il
      // demande au domaine, par `core/services-domaine.ts`.
      const hashParams = empreinteParametres(node.data) + JSON.stringify(servicesDomaine().reglagesDeProjet());
      const monHashEntree = empreinteEntrees(nodeId, aretesG);
      // LE CÂBLAGE AVAL ENTRE DANS LA CLÉ depuis qu'un nœud peut savoir si une de ses sorties est
      // branchée : ce qu'il rend en dépend. Voir `empreinteSorties`.
      const hashSorties = empreinteSorties(nodeId, aretesG);
      const hashValeursEntree = empreinteValeursEntrantes(nodeId, aretesG, resultats);
      const entreeCache = cacheExec.current.get(nodeId);

      // Certains nodes (sans sortie, avec I/O fichiers) ne doivent jamais être
      // cachés — la fiche le déclare, le moteur ne connaît aucun id en dur.
      const jamaisCache = trouverDef(node.data.ficheId as string)?.jamaisCache === true;

      // LA DÉCISION EST DANS `core/cache-execution.ts`, AVEC SES CAS ET SON PRIX. Elle y tient en
      // deux fonctions pures, et l'en-tête de ce module-là dit pourquoi un composant rejoué
      // entraîne toute sa descendance même quand il rend deux fois la même chose.
      const cacheIdentique = entreeCache && (sauts.finReprise(nodeId) || peutReutiliserLeCache(
        jamaisCache, sourceReprocessee, entreeCache,
        { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree },
      ));

      // UN JOURNAL DE HUIT VALEURS PAR NŒUD ET PAR RUN A ÉTÉ RETIRÉ D'ICI, et c'est le second du
      // genre. Il interpolait `sourceReprocessee`, `jamaisCache`, le verdict et quatre empreintes —
      // y compris un objet littéral, donc une sérialisation — pour chaque nœud de chaque run, et
      // rien ne le lisait : ni un cas, ni un script, ni un garde. La décision du cache, elle, est
      // éprouvée dans `core/cache-execution.ts`, avec ses cas et le prix de sa règle écrit.
      //
      // CE QU'IL A PAYÉ : le recensement des fréquences, plus bas. Le fichier est à son plafond de
      // dette, et la règle du dépôt est que ce qu'on y ajoute doit y être payé — ce journal valait
      // moins qu'une mesure, comme « [cache store] » avant lui.
      if (cacheIdentique) {
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
      // CE NŒUD A-T-IL DEMANDÉ SI SES SORTIES ÉTAIENT BRANCHÉES ? La réponse se constate pendant son
      // run, et décide si son câblage aval entre dans sa clé de cache. Déclaré par tour de boucle :
      // c'est une propriété de CE nœud, et la porter au-delà les mélangerait.
      let aConsulteSesSorties = false;
      const ajouterTemps = (ms: number) => {
        const visibleId = plat.expansions.get(nodeId) ?? nodeId;
        tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + ms);
      };
      try {
        const res = await fn({
          noeud: node,
          runtime: ctx,
          repertoireTravail: repertoire,
          entree: (idx: number) => resoudreEntree<ValeurTransportee>(nodeId, idx, aretesG, resultats) as ValeurTransportee,
          entrees: () => valeursEntrantes<ValeurTransportee>(nodeId, aretesG, resultats),
          // Les arêtes sont ici, et elles disent si un câble part de cette sortie. Un nœud peut
          // alors ne calculer une sortie chère que lorsqu'elle sert.
          //
          // ET POSER LA QUESTION EST RETENU. C'est ce fait — non une liste de composants — qui
          // décide si le câblage aval entre dans la clé de cache de ce nœud. Voir
          // `core/cache-execution.ts` : un nœud qui ne demande jamais si ses sorties sont branchées
          // ne peut pas en dépendre, et un câble ajouté derrière lui ne doit pas le faire rejouer.
          sortieBranchee: (idx: number) => {
            aConsulteSesSorties = true;
            return aretesG.some((a) => a.source === nodeId && a.sourceHandle === `out:${idx}`);
          },
          paramNombre: (nom: string, defaut: number) => {
            const p = (node.data.parametres as Record<string, number|string>)?.[nom];
            const def = trouverDef(node.data.ficheId as string);
            const pDef = def?.parametres.find((p) => p.nom === nom);
            // LE REPLI EST LE DÉFAUT DÉCLARÉ, et c'est la racine d'une famille entière de défauts.
            //
            // CE QU'IL Y AVAIT ICI ÉTAIT UNE BRANCHE MORTE. Le repli consultait `defautEn`, qui est
            // le champ du défaut TEXTUEL traduit, typé sur une chaîne : relevé sur le registre,
            // AUCUN des 1983 réglages numériques du catalogue n'en déclare un qui soit un nombre.
            // La condition était donc toujours fausse, et le repli retombait toujours sur le
            // littéral de l'appel.
            //
            // CE QUE CELA COÛTAIT. Un nœud CRÉÉ reçoit chaque réglage déclaré ; un graphe
            // ENREGISTRÉ AVANT qu'un réglage existe ne le porte pas, ni le chargeur ni la
            // sérialisation ne complétant les manquants. Le littéral décidait donc seul du sort de
            // ces nœuds, et il pouvait différer du défaut que l'inspecteur affiche : seize appels
            // de bornes de modulation lisaient ainsi zéro et cent à la place de leur course, et le
            // kit de batterie d'un projet ancien sortait sur un preset mélodique.
            //
            // MESURÉ AVANT DE CHANGER : sur 1402 appels portant un littéral, 1399 donnaient déjà la
            // valeur déclarée. Des trois qui divergeaient, deux étaient des littéraux périmés,
            // corrigés avec ce changement ; le troisième lit un réglage que sa fiche ne déclare
            // plus, une lecture de migration que `pDef` indéfini laisse passer au littéral.
            const brut = typeof p === "number" ? p
              : typeof pDef?.defaut === "number" ? pDef.defaut
              : defaut;
            // UNE GRAINE EST RÉSOLUE ICI, ET NON DANS CHACUN DES SOIXANTE-CINQ COMPOSANTS QUI EN
            // PORTENT UNE. C'est la correction de la décentralisation relevée par Fabien : la
            // convention du projet — zéro ou moins veut dire « tire au sort » — n'était appliquée
            // que par treize d'entre eux, et ailleurs une graine à zéro était une graine FIXE
            // valant zéro. Le rôle est DÉCLARÉ sur le réglage, jamais cherché dans son libellé.
            return pDef?.graine ? graineDuNoeud(nodeId, nom, brut) : brut;
          },
          paramTexte: (nom: string, defaut: string) => {
            const p = (node.data.parametres as Record<string, number|string>)?.[nom];
            const def = trouverDef(node.data.ficheId as string);
            const pDef = def?.parametres.find((p) => p.nom === nom);
            if (typeof p === "string" && pDef) {
              return String(valeurCanoniqueChoix(pDef, p));
            }
            // Repli sur le défaut DÉCLARÉ PAR LA FICHE (`defaut`, français),
            // jamais `defautEn` : la forme canonique d'un « choix » est celle
            // de la liste `options`, et un plugin compare la valeur reçue à ses
            // propres termes français (ex. profilCouleur("Bleu")). Préférer
            // `defautEn` renvoyait "Blue" quand le paramètre était absent de
            // `parametres` (ancien workflow, JSON écrit à la main) et faisait
            // échouer le nœud sur « Couleur 1 inconnue : Blue » — alors que
            // l'inspecteur, lui, affichait bien « Bleu ». Cf. defautCanoniqueChoix.
            return pDef ? String(valeurCanoniqueChoix(pDef, pDef.defaut)) : defaut;
          },
          // UN onProgress APRÈS ANNULATION LÈVE, et c'est ce qui rend 74 exécuteurs
          // interruptibles d'un seul geste : deux seulement lisaient `signal.aborted`.
          // Il ignorait auparavant l'appel, ce qui réglait le symptôme — un « en cours »
          // réaffiché par dessus l'« attente » que le reset venait de poser — sans arrêter
          // le travail. Le `catch` de cette boucle reconnaît déjà le cas : il sort sans
          // marquer le nœud en erreur. Voir `core/annulation.ts`.
          onProgress: (msg: string) => { if (controller.signal.aborted) throw new ErreurAnnulation(); poserStatut(nodeId, "en_cours", msg, true); },
          signal: controller.signal,
        });
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
          if (!jeton?.perime()) cacheExec.current.set(nodeId, { valeurs: valeurs as ValeurTransportee[], message: res.message, affichage: res.affichage, designe: res.designe, hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree, consulteSorties: aConsulteSesSorties, tempsExecution: elapsed, empreinteBoucle: sauts.empreintePour(nodeId) });
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

    // ── Mettre à jour les URL audio ──
    //
    // Le calcul se fait ICI, avant `setNodes`, et l'updater ne fait plus
    // qu'appliquer le résultat. La raison n'est pas cosmétique : un updater de
    // `setNodes` doit être PUR, et celui-ci appelait `URL.createObjectURL` et
    // `URL.revokeObjectURL`. React double-invoque les updaters en développement
    // (StrictMode), si bien que chaque exécution créait DEUX URL pour un même
    // blob — la seconde allait dans l'état, la première restait orpheline et
    // n'était jamais révoquée. Tracé sur un graphe de cinq minutes : deux URL de
    // 53 Mo par nœud audio et par run.
    //
    // Ce n'est pas une fuite anodine sur ce type de graphe. Mesuré dans l'app :
    // le tas JavaScript atteignait 3027 Mo pour une limite de 4192 Mo, et le
    // sixième lecteur audio refusait de charger son WAV — pourtant intact — avec
    // « MEDIA_ELEMENT_ERROR: Format error », que Chromium émet aussi par manque
    // de mémoire. C'est le symptôme « lecteur gris à 0:00 » : il frappe le
    // dernier nœud de la chaîne, quel qu'il soit, et non celui qui aurait un
    // défaut.
    // CE QUI EST LOURD DANS UNE BULLE REPLIÉE N'EST PAS GARDÉ, et le ménage se fait ICI, à la fin du run,
    // et non au moment où un nœud range son résultat. La raison est qu'un membre qui TROUVE son
    // résultat en cache n'exécute pas, donc ne range rien, donc ne déclenchait aucun ménage : les
    // tampons restaient accrochés au cache alors que les données des nœuds les avaient lâchés, et
    // l'on croyait avoir libéré. Relevé à l'écran, deux exécutions de suite.
    //
    // À LA FIN PLUTÔT QU'AU DÉBUT : le run courant garde ses raccourcis de cache, et c'est le
    // suivant qui refera la bulle. On paie le recalcul une fois par exécution, pas deux.
    // Voir `resultatRetenu` dans `core/memoire.ts` pour l'échange consenti, et son seuil : sous lui,
    // un membre se garde, et « Développer » ne refait rien.
    const economie = economieMemoireRef?.current ?? true;
    for (const n of noeudsRef.current) {
      const garde = resultatRetenu({
        cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
        economie,
        lourd: valeursLourdes(cacheExec.current.get(n.id)?.valeurs),
      });
      if (!garde) cacheExec.current.delete(n.id);
    }
    // ET LE CORPS D'UNE BOUCLE DÉPLIÉE, QUE LA BOUCLE CI-DESSUS NE POUVAIT PAS VOIR. Les copies
    // portent des identifiants engendrés — « deb#3::echo » — et ne figurent pas parmi les nœuds
    // visibles : leurs tampons restaient donc accrochés au cache pour toute la session, et rien ne
    // les examinait jamais. Mesuré sur huit tours d'un écho : 134,6 Mo pour le seul corps, le
    // premier tour pesant 5,1 Mo et le huitième 28,6, la chaîne allongeant son signal à chaque
    // passage. Ce que la FIN de boucle rend reste en cache, elle : c'est l'échafaudage qu'on lâche,
    // pas l'ouvrage. Voir `resultatRetenu` pour le prix consenti.
    lacherLeCorps(deplie.origines.keys(), cacheExec.current, economie);

    // CE QUI A EMPÊCHÉ UNE BOUCLE DE SE DÉPLIER SE DIT SUR LE NŒUD, et non dans la seule console.
    //
    // Un début de boucle non déplié s'exécute lui-même et rend « reliez ce composant à une fin de
    // boucle » — vrai d'un seul des six cas, et trompeur pour les cinq autres : relevé par Fabien
    // sur deux boucles emboîtées, où les deux débuts accusaient un câblage pourtant correct. Le
    // moteur, lui, connaît la raison exacte. Il la pose ICI, avant que les correctifs ne soient
    // calculés, faute de quoi le message de l'exécuteur resterait celui qu'on lit.
    for (const p of deplie.problemes) {
      const visible = plat.expansions.get(p.noeudId) ?? p.noeudId;
      const dit = t(`boucle.probleme.${p.code}`).replace("{max}", String(COPIES_MAX));
      messages.set(visible, dit);
      definirStatut(visible, "erreur", dit);
    }

    // LA GRAINE TIRÉE SE REND, faute de quoi un rendu qu'on voudrait garder resterait introuvable :
    // le réglage à zéro ne dit pas ce qui a été joué. Treize composants le faisaient déjà eux-mêmes ;
    // on ne le répète donc que si le NOMBRE n'est pas déjà là — le nombre, et non le mot, qui
    // s'écrit de trop de façons pour qu'on le cherche.
    //
    // ET C'EST ICI, APRÈS TOUTE L'EXÉCUTION, plutôt que dans la boucle des nœuds : `grainesTirees`
    // est rangée sous l'identifiant VISIBLE, quand la boucle, elle, tourne sur des copies. Ajouter
    // le tirage au message d'une copie l'aurait perdu, la vue lisant `messages` sous l'identifiant
    // qu'elle affiche.
    for (const [visible, tirees] of grainesTirees) {
      const dit = messages.get(visible) ?? "";
      const aDire = tirees.filter((g) => !dit.includes(String(g.valeur)));
      if (!aDire.length) continue;
      const bout = aDire.map((g) => `${g.nom.toLowerCase()} ${g.valeur}`).join(" · ");
      messages.set(visible, dit ? `${dit} · ${bout}` : bout);
    }

    // LA POSE FINALE, QUI NE LAISSE PERSONNE DE CÔTÉ. Les nœuds ordinaires ont déjà été posés par
    // paquets pendant la boucle ; celle-ci reprend TOUT LE MONDE, et c'est elle qui sert :
    //
    //   — les métas et les bulles, qui agrègent les résultats de leurs internes et ne pouvaient
    //     donc pas être posés plus tôt ;
    //   — les messages complétés APRÈS la boucle, la graine tirée et la cause d'une boucle non
    //     dépliée, qui sont rangés sous l'identifiant VISIBLE et non sous celui d'une copie. Un
    //     nœud posé tôt a donc pu montrer son message sans son tirage de graine pendant un instant,
    //     et cette pose-ci le corrige.
    //
    // ET ELLE NE REFAIT PAS LE TRAVAIL DÉJÀ FAIT. Reprendre tout le monde recalculait le correctif
    // de chaque nœud une seconde fois, et ce n'est pas gratuit : mesuré sur douze nœuds, **540 ms**,
    // soit quarante-cinq par nœud. Seuls repassent ici ceux qui n'ont pas encore été posés, et ceux
    // dont le message a été complété après la boucle — la graine tirée et la cause d'une boucle non
    // dépliée, rangées sous l'identifiant visible.
    const aRepasser = new Set<string>([...grainesTirees.keys()]);
    for (const p of deplie.problemes) aRepasser.add(plat.expansions.get(p.noeudId) ?? p.noeudId);
    for (const n of noeudsRef.current) {
      if (!dejaPoses.has(n.id) || aRepasser.has(n.id)) aPoser.add(n.id);
    }
    await poserCeQuiEstPret();

    /** Champs à mettre à jour sur un nœud après le run, ou `null` s'il n'y a rien à changer. */
    async function calculerCorrectifResultat(n: any): Promise<Record<string, unknown> | null> {
      {
        const meta = trouverMeta(n.data.ficheId as string);
        // Méta hors du périmètre du run (branche non exécutée) : ne pas y toucher —
        // il garde son statut précédent au lieu de passer « en cours »/« erreur ».
        if (meta && !estMetaEnScope(n.id)) return null;
        // Pour un méta-nœud, on récupère les résultats de ses nœuds internes
        // aplatis (préfixés par l'id du méta-nœud) via ses ports de sortie exposés.
        // UNE BULLE MONTRE LE RÉSULTAT DE CE QUI EN SORT. Elle ne calcule rien, mais elle expose les
        // sorties de tous ses membres : donner la liste entière à l'aperçu lui ferait jouer la
        // première venue, c'est-à-dire le plus souvent le DÉBUT de la chaîne repliée. On ne lui donne
        // donc que la sortie qui représente la bulle, et rien si aucune ne la représente à elle seule.
        // Aucun préfixe d'identifiant ici, contrairement au méta-nœud : replier ne renomme personne.
        const sortie = estBulle(n.data.ficheId as string)
          ? sortieDeBulle(tousNoeudsG, aretesReelles, n.id, trouverDef)
          : null;
        const vals = meta
          ? meta.sorties.map((_, i) => {
              const m = meta.mapSorties[i];
              return resultats.get(`${n.id}::${m.noeudInterne}`)?.[m.portIndex] ?? null;
            })
          : estBulle(n.data.ficheId as string)
            ? (sortie ? [resultats.get(sortie.noeudInterne)?.[sortie.portIndex] ?? null] : [])
            : resultats.get(n.id);
        const defNode = trouverDef(n.data.ficheId as string);
        if ((!vals || vals.length === 0) && !messages.has(n.id)) return null;
        // Le nœud pilote son propre affichage depuis `data` : ne rien écraser.
        //
        // SAUF LES DEUX CANAUX DÉCLARÉS ET SON MESSAGE. « Autonome » veut dire que le moteur ne lui
        // fabrique ni lecteur audio, ni aperçu, ni URL d'image : il montre ce qu'il a lui-même
        // désigné. Cela ne veut pas dire qu'il n'a rien à recevoir. Deux composants sont dans ce cas,
        // « Carte sonore » et « Coordonnées sur carte » : tous deux rendent `affichage` et leur vue
        // lit `_affichage.htmlPath`, or ce retour anticipé le jetait, si bien que la carte ne
        // pouvait pas s'afficher. Les canaux passent donc, et rien d'autre.
        if (defNode?.affichageAutonome) {
          const canaux = {
            audioResultatMessage: messages.get(n.id) ?? undefined,
            _affichage: affichageParNoeud.get(n.id) ?? undefined,
            _designe: designeParNoeud.get(n.id) ?? undefined,
          };
          return canaux._affichage || canaux._designe || canaux.audioResultatMessage ? canaux : null;
        }
        const valsSafe = vals ?? [];
        // LA SORTIE QUI REPRÉSENTE CE QUE LE NŒUD A PRODUIT, et c'est le domaine qui la désigne.
        // Les nœuds dont les sorties sont des pairs — les six pistes d'un séparateur — le disent par
        // `sansApercuAudio`, et l'on ne demande alors rien.
        //
        // UN BLOC DE DIAGNOSTIC A DISPARU D'ICI, et il tenait de la fuite autant que de la trace :
        // il testait `ficheId === "griffin-lim"`, c'est-à-dire un identifiant de composant du domaine
        // écrit dans le shell, pour journaliser deux crêtes dans la console.
        const audio = defNode?.sansApercuAudio ? null : servicesApercu().valeurRepresentative(valsSafe);
        const fichier = valsSafe.find((v): v is File => v instanceof File);
        const imageFile = fichier && (fichier.type === "image/png" || fichier.type === "image/jpeg" || fichier.type === "image/svg+xml") ? fichier : null;
        const midiFile = fichier && fichier.type.includes("midi") ? fichier : null;
        const texte = valsSafe.find((v): v is string => typeof v === "string");
        // Ce qu'une courbe produite donne à dessiner. Combien de points y suffisent, et ce qu'est une
        // courbe, relèvent du domaine : voir `plugins/apercu-domaine.ts`.
        const apercuCourbe = servicesApercu().apercuCourbe(valsSafe as unknown[]);
        // Réutilise l'URL existante si le buffer audio n'a pas changé — évite de
        // démonter/remonter le lecteur à chaque run (cache) et empêche le
        // rechargement gris/0:00 sur les nœuds déjà terminés.
        // Sur une valeur longue, un intermédiaire ne reçoit pas d'aperçu : personne ne l'ouvre, et
        // il sera construit le jour où l'on clique sur ce nœud — la valeur, elle, reste là. Ce que
        // cela pèse et à partir de quand cela compte relèvent du domaine, qui porte son seuil et son
        // arithmétique (cf. `audio/memoire-audio.ts`).
        // UN MEMBRE DE BULLE REPLIÉE NE RETIENT RIEN : ni aperçu, ni référence au tampon. Le premier
        // ne s'écouterait pas, le second annulerait la libération faite plus haut — un tampon qui
        // reste accroché aux données du nœud n'est pas libéré parce que le cache l'a lâché. SOUS LE
        // SEUIL, IL GARDE LES DEUX, comme le cache garde sa valeur : rien n'est libéré qu'il annulerait,
        // et « Développer » le montre aussitôt avec son lecteur.
        const membreReplie = !resultatRetenu({
          cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
          economie: economieMemoireRef?.current ?? true,
          lourd: valeursLourdes(valsSafe),
        });
        const garderApercu = !audio || (!membreReplie && servicesApercu().apercuUtile(audio, {
          regarde: noeudRegarde({
            id: n.id, selectionne: !!n.selected, aretes: aretesRef.current,
            dansUnMeta: (pileMetaRef?.current?.length ?? 0) > 0,
            // Un membre de bulle repliée n'est pas regardé : la bulle, elle, garde son aperçu.
            cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
          }),
          economie: economieMemoireRef?.current ?? true,
        }));
        // LE LECTEUR NE S'ÉCRIT PLUS ICI, IL SE PROMET. Son encodage dure 2,3 s pour cinq minutes de
        // son et 46 s pour une heure, mesuré, et il avait lieu AVANT que le résultat soit posé. Le
        // tampon, le message et tout le reste partent donc tout de suite — le bouton « Écouter » est
        // là immédiatement — et le lecteur les rejoint quand il est prêt.
        // CE QUE CE NŒUD PORTE DÉJÀ SE LIT DANS LE MAGASIN DES RÉSULTATS, et non dans ses données :
        // un résultat n'y vit plus. La réutilisation d'une adresse et sa révocation ont besoin de
        // l'état d'avant, et c'est là qu'il est.
        const dejaLa = resultatDe(n.id) as {
          audioResultatUrl?: string; audioResultatBuffer?: AudioBuffer;
          audioResultatRefaisable?: ApercuRefaisable;
          imageResultatUrl?: string; imageResultatFile?: File;
        };
        const bitsVoulus = lireProfondeurExport();
        let url: string | undefined, refaisable: ApercuRefaisable | undefined;
        if (audio && garderApercu) {
          // LA PROFONDEUR ENTRE DANS LA CONDITION DE RÉUTILISATION, et c'est un défaut mesuré :
          // l'adresse était gardée tant que le tampon était le même OBJET — bonne idée, elle évite
          // de démonter le lecteur à chaque run —, mais elle ne regardait pas à quelle profondeur
          // l'aperçu avait été écrit. Le sélecteur de profondeur était donc inopérant même en
          // relançant. Voir `ui/refaire-apercus.ts`, qui porte le relevé.
          if (audio === dejaLa.audioResultatBuffer && dejaLa.audioResultatUrl
            && dejaLa.audioResultatRefaisable?.bits === bitsVoulus) {
            // L'ADRESSE EST GARDÉE, DONC SON COMPAGNON AUSSI. Le correctif rendu plus bas pose TOUS
            // les champs, si bien que l'omettre ici l'effacerait : l'aperçu deviendrait
            // irréécrivable, et le sélecteur de profondeur inopérant sur ce nœud-là seulement.
            url = dejaLa.audioResultatUrl; refaisable = dejaLa.audioResultatRefaisable;
          } else {
            if (dejaLa.audioResultatUrl) URL.revokeObjectURL(dejaLa.audioResultatUrl);
            // LE NŒUD DÉCLARE QUE SA SORTIE PEUT SORTIR DE LA PLAGE, le shell ne tient plus la
            // liste : elle y était écrite en cinq identifiants de composants du domaine.
            const securiser = trouverDef(n.data.ficheId as string)?.sortieHorsPlagePossible === true;
            // Ce blob est à la fois l'aperçu écoutable et le fichier sauvegardé : la profondeur
            // choisie s'applique donc ici, et non au moment de la sauvegarde. Les séparer aurait
            // demandé de réencoder à l'enregistrement, donc de reconstruire les métadonnées que
            // seule cette boucle connaît. Ce qu'écrire veut dire — repliement d'un multicanal,
            // métadonnées, tranches qui rendent la main — appartient au domaine.
            const ficheId = n.data.ficheId as string;
            // LE NŒUD DÉCLARE QUE SON APERÇU EST LE FICHIER, le shell ne tient plus la liste. Elle
            // y était écrite en dur, sous la forme d'identifiants de composants du domaine, sur le
            // chemin d'exécution de tous les domaines. Les autres n'ont pas de métadonnées : leur
            // calcul parcourt la valeur entière, et un aperçu intermédiaire n'est jamais livré.
            const def = trouverDef(ficheId);
            const aEcouter = audio;
            // CE QU'IL FAUDRAIT POUR LE RÉÉCRIRE EST DÉPOSÉ À CÔTÉ, et c'est nécessaire : le nom
            // pour les métadonnées ne se redérive pas d'un nœud. `ui/refaire-apercus.ts` le relit
            // pour refaire l'aperçu à une autre profondeur sans rejouer le nœud.
            refaisable = { bits: bitsVoulus, reecriture: { securiser,
              nomPourMetadonnees: def?.apercuEstLeFichier ? (def.nom ?? ficheId) : undefined } };
            lecteursAEcrire.set(n.id, async () => {
              const blob = await servicesApercu().blobApercu(aEcouter, {
                ...refaisable!.reecriture, bits: bitsVoulus, souffle,
                onAvance: (part) => poserApercu(n.id, part),
              });
              return blob ? URL.createObjectURL(blob) : undefined;
            });
          }
        } else if (dejaLa.audioResultatUrl) {
          URL.revokeObjectURL(dejaLa.audioResultatUrl);
        }
        // Même logique pour l'image (Songsee, etc.) : réutilise l'URL si le File est identique.
        let imageUrl: string | undefined;
        if (imageFile) {
          if (imageFile === dejaLa.imageResultatFile && dejaLa.imageResultatUrl) {
            imageUrl = dejaLa.imageResultatUrl;
          } else {
            if (dejaLa.imageResultatUrl) URL.revokeObjectURL(dejaLa.imageResultatUrl);
            imageUrl = URL.createObjectURL(imageFile);
          }
        } else if (dejaLa.imageResultatUrl) {
          URL.revokeObjectURL(dejaLa.imageResultatUrl);
        }
        // Pour un méta-nœud : ne marquer "terminé" que si un résultat a été produit
        if (meta) {
          const aResultat = valsSafe.some((v) => v != null);
          if (meta.sorties.length > 0 && !aResultat && !messages.has(n.id)) {
            // Le run est terminé et le méta n'a rien produit sur ses sorties : sa
            // chaîne interne a échoué. Marquer « erreur » — surtout PAS le laisser
            // « en_cours » (le run est fini, la branche ne tourne plus). Corrige le
            // méta figé « en cours » quand une branche parallèle n'aboutit pas alors
            // que l'aval (mixeur) est « terminé ».
            // On identifie en plus le premier nœud interne (ordre topo) resté sans
            // résultat — la cause de l'échec, souvent une entrée manquante (fichier
            // audio non sérialisé à la sauvegarde) — pour l'afficher sans ouvrir le méta.
            const prefixe = `${n.id}::`;
            let fautif = "";
            for (const fid of ordreFiltre) {
              if (!fid.startsWith(prefixe)) continue;
              const r = resultats.get(fid);
              if (!r || r.every((v) => v == null)) {
                fautif = ((plat.noeuds.find((pn) => pn.id === fid)?.data as { ficheId?: string })?.ficheId) ?? "";
                break;
              }
            }
            poserStatutNoeud(n.id, "erreur");
            return { audioResultatMessage: fautif
                ? t("execution.brancheEchecSansResultat").replace("{fautif}", fautif)
                : t("execution.brancheEchecAucunResultat") };
          }
        }
        // Un méta-composant n'est pas exécuté lui-même : ce sont ses nœuds internes qui tournent. Il ne
        // se déclare pas terminé ici, sur une sortie produite : c'est après le run, d'après TOUT son
        // contenu, qu'il l'est ou non. Voir `core/conteneurs.ts`.
        return {
          audioResultatUrl: url ?? undefined,
          audioResultatNom: url ? `${n.data.ficheId}.wav` : undefined,
          audioResultatBuffer: membreReplie ? undefined : (audio ?? undefined),
          audioResultatRefaisable: refaisable,
          audioResultatMessage: messages.get(n.id) ?? (meta && audio ? t("execution.termine") : undefined),
          scriptGenere: texte ?? undefined,
          apercuCourbe,
          midiFichierSortie: midiFile ?? undefined,
          imageResultatUrl: imageUrl ?? undefined,
          imageResultatFile: imageFile ?? undefined,
          // LE CANAL DÉCLARÉ, posé sous deux clés réservées. Le `?? undefined` compte : un composant
          // qui ne rend plus rien à montrer doit effacer ce qu'il montrait au run précédent, sinon
          // l'écran décrirait une exécution qui n'a plus lieu.
          _affichage: affichageParNoeud.get(n.id) ?? undefined,
          _designe: designeParNoeud.get(n.id) ?? undefined,
        };
      }
    }

    // LE TEMPS D'EXÉCUTION ET L'ÉCART DE NIVEAU VONT DANS LE MAGASIN comme le reste du résultat :
    // ce sont deux comptes rendus du run, cumulés par nœud VISIBLE, méta compris. Le magasin ne
    // prévient pas quand la valeur ne change pas, ce que les deux `setNodes` d'avant faisaient à la
    // main en comparant le champ.
    for (const [id, t] of tempsParVisible) poserResultat(id, { tempsExecution: t });
    for (const [id, e] of ecartsParNoeud) poserResultat(id, { ecartNiveau: e });

    // Vérifier si un node a généré une spec de graphe (prompt → graphe)
    //
    // IMPORTANT : on itère `nds` (l'instantané aplati LOCAL à ce `lancer()`,
    // capturé à la ligne ~166), PAS `noeudsRef.current`. `ctx.noeud` passé au
    // plugin pointe vers les entrées de `nds` ; `definirStatut` (appelé au
    // moins une fois par nœud AVANT même l'appel du plugin, pour passer en
    // "en_cours") crée lui un NOUVEL objet `data` via spread pour l'état React
    // — donc dès ce premier appel, `noeudsRef.current` ne contient déjà plus
    // le MÊME objet `data` que celui que le plugin mute ensuite (`ctx.noeud.data`
    // reste l'ancien objet, maintenant orphelin de l'état React). Toute
    // mutation que le plugin faisait sur `ctx.noeud.data` était donc invisible ici
    // — bug préexistant, vérifié sur le code d'origine (avant l'ajout du mode
    // Ollama), qui rendait la génération de graphe totalement silencieuse :
    // le nœud passait bien à « Terminé » mais rien n'apparaissait sur le
    // canevas. `nds`, lui, référence directement les objets mutés par les
    // plugins — aucune de ces trois fonctionnalités ne peut avoir fonctionné
    // depuis l'introduction de cette optimisation de `definirStatut`.
    // LES DEMANDES SE LISENT DANS LE RETOUR DU RUN, et rien n'est à effacer ensuite : elles ne se
    // sont jamais posées sur un nœud. Le long commentaire qui précédait disait qu'un champ muté par
    // un plugin restait invisible tant qu'on lisait l'état React au lieu de l'instantané du run ;
    // la question ne se pose plus, puisque le composant rend sa demande au lieu de l'écrire.
    for (const [nodeId, demande] of demandesParNoeud) {
      if (onGrapheGenere && demande.grapheACreer?.nodes && demande.grapheACreer?.edges) {
        onGrapheGenere(nodeId, { nodes: demande.grapheACreer.nodes, edges: demande.grapheACreer.edges });
      }
    }
    if (onNodeInstalle && [...demandesParNoeud.values()].some((d) => d.paletteARelire)) onNodeInstalle();

    // Fusion générique des champs "autonomes" (préfixés `_`, ex. `_carteHtmlUrl`,
    // `_carteSonore`) qu'un plugin à `affichageAutonome: true` écrit sur
    // `ctx.noeud.data` pendant son exécution. `ctx.noeud` pointe vers l'entrée
    // de `nds` (l'instantané local aplati de ce run), pas vers l'état React réel
    // — une mutation faite là ne serait donc jamais vue par personne sans cette
    // passe. Les demandes au moteur, elles, ne passent plus par là du tout : elles
    // arrivent dans le retour de l'exécuteur et ne touchent jamais un nœud.
    //
    // LES DEUX CANAUX DÉCLARÉS NE PASSENT PAS PAR ICI, et c'est `core/cycle-de-vie.ts` qui le
    // tient : ils viennent du retour de l'exécuteur, ou du cache, jamais de l'instantané.
    const champsAutonomesParNoeud = new Map<string, Record<string, unknown>>();
    for (const n of nds) {
      const d = n.data as any;
      if (!d) continue;
      const champs = champsAReporter(d as Record<string, unknown>);
      if (champs) champsAutonomesParNoeud.set(n.id, champs);
    }
    if (champsAutonomesParNoeud.size > 0) {
      setNodes((nds2) =>
        nds2.map((n) => {
          const champs = champsAutonomesParNoeud.get(n.id);
          if (!champs) return n;
          const change = Object.keys(champs).some((cle) => (n.data as any)[cle] !== champs[cle]);
          return change ? { ...n, data: { ...n.data, ...champs } } : n;
        })
      );
    }

    // LE STATUT FINAL D'UN CONTENEUR EST CELUI DE TOUT SON CONTENU : en erreur si l'un a échoué,
    // terminé si tous ont fini, en attente sinon, et il dit alors combien. Il était pris sur les seuls
    // nœuds DE CE RUN : un ▶ posé en aval d'une branche déclarait terminée une bulle dont six membres
    // sur huit n'avaient jamais tourné. L'erreur qu'un méta s'est vu poser, sorties vides, reste la
    // sienne. La laisser « en cours » après le run ferait croire à un calcul qui n'en finit pas.
    const executables = ordonnees.filter((id) => !idsDecoratifs.has(id));
    for (const c of boites.ids) {
      if (boites.contenu(c, ordreFiltre).length === 0 || statutDeNoeud(c).statut === "erreur") continue;
      const b = statutDuContenu(boites.contenu(c, executables).map((id) => statutDeNoeud(id).statut));
      const partiel = t("conteneur.partiel").replace("{n}", String(b.faits)).replace("{total}", String(b.total));
      definirStatut(c, b.statut, b.statut === "attente" ? partiel : undefined);
    }

    // ── LES LECTEURS, ÉCRITS APRÈS QUE TOUT EST POSÉ ─────────────────────────────────
    //
    // CHACUN PARAÎT DÈS QU'IL EST PRÊT, et non tous ensemble à la fin : sur une chaîne de sept
    // nœuds audio, attendre le dernier encodage pour montrer le premier lecteur était la moitié du
    // défaut relevé. Pendant son écriture, le nœud dit où elle en est : il est déjà terminé, son
    // tampon est posé, il s'écoute déjà par le bouton, et c'est le lecteur qui se fabrique.
    for (const [id, ecrire] of lecteursAEcrire) {
      if (controller.signal.aborted) break;
      poserApercu(id, 0);
      try {
        const url = await ecrire();
        if (url) {
          const ficheId = noeudsRef.current.find((n) => n.id === id)?.data.ficheId;
          poserResultat(id, { audioResultatUrl: url, audioResultatNom: `${ficheId}.wav` });
        }
      } catch (e) {
        // UN LECTEUR QUI NE S'ÉCRIT PAS N'EMPORTE PAS LE RUN, et c'est le second intérêt de l'avoir
        // sorti d'ici : le résultat est déjà posé, le tampon est là, et le bouton « Écouter » reste
        // la voie d'écoute. Avant, cette exception remontait avant tout `setNodes`, et le nœud
        // perdait jusqu'à son message.
        console.error("[apercu] écriture du lecteur impossible", id, e);
      } finally {
        poserApercu(id, undefined);
      }
      await souffle.tour();
    }

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

  /**
   * La boucle sur une VALEUR : le graphe entier, rejoué une fois par morceau de ce qui circule.
   *
   * CE QU'ELLE AJOUTE AUX TROIS AUTRES RÉPÉTITIONS, ET LE POINT DUR. Les trois connaissent leur
   * compte AVANT d'exécuter quoi que ce soit : un paramètre pour la boucle de graphe et
   * l'instrument, un dossier lu pour le lot. Une liste qui arrive par un câble, elle, ne se connaît
   * qu'une fois l'amont exécuté. D'où la PREMIÈRE PASSE DE DÉCOUVERTE : on lance une passe sans
   * savoir combien il en faudra, le nœud de début publie ce qu'il a trouvé, et l'on poursuit. Elle
   * ne coûte rien, étant la première passe utile et non une passe de plus.
   *
   * ELLE NE TOUCHE PAS AU MOTEUR, et c'est la condition de sa sûreté. Comme le lot, elle rejoue
   * `lancerUnePasse`, qui reste une exécution entière avec ses statuts, son cache, son annulation
   * et son `AbortController`. L'acyclicité du graphe n'est pas entamée : ce que `boucle-graphe.ts`
   * désigne comme ce qu'il ne fallait pas casser reste intact.
   *
   * SANS NŒUD DE BOUCLE, RIEN NE CHANGE : une seule passe, comme avant. Le plan coûte désormais un
   * aplatissement, c'est-à-dire un parcours du graphe qui n'exécute rien ; c'est le prix pour que le
   * contenu d'un méta-composant soit vu, et il se paie une fois par exécution, non une fois par
   * passe.
   */
  const lancerBoucleValeur = useCallback(async (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => {
    // LE PLAN SE FAIT SUR LE GRAPHE APLATI, ET NON SUR CELUI QU'ON VOIT — relevé par Fabien, qui
    // demandait si les changements faits sur les boucles valaient aussi pour les autres.
    //
    // CE QUI CLOCHAIT. Un nœud de boucle par passes s'apparie à sa boucle PAR SON IDENTIFIANT, et
    // c'est celui de son exécution qu'il donne (`ctx.noeud.id`). Dans un méta-composant, cet
    // identifiant est PRÉFIXÉ par celui du méta — `outil1::cd` —, quand le plan, lui, était fait sur
    // les nœuds visibles, où le méta n'est qu'UN nœud. La boucle n'était donc jamais planifiée : la
    // découverte n'avait pas lieu, le graphe tournait une passe, et rien ne prévenait. MESURÉ sur
    // une boucle à quatre créneaux suivie d'un rendu : quatre notes sur quatorze secondes posée sur
    // le canevas, UNE note sur deux secondes une fois les deux mêmes nœuds groupés en outil.
    //
    // ET `oublierLeCorps` SUIT, faute de quoi la moitié du travail serait faite : il efface du cache
    // ce qui doit rejouer, or le cache est rangé sous l'identifiant EXÉCUTÉ. Effacer `outil1` n'y
    // touchait rien, et le début de boucle, servi par le cache, n'aurait pas redécouvert.
    //
    // SANS MÉTA, RIEN NE CHANGE : l'aplatissement rend alors les mêmes nœuds sous les mêmes
    // identifiants. Les arêtes de substitution sont écartées comme le fait l'exécution, de sorte que
    // le plan porte sur le graphe qui va tourner et non sur celui qu'une bulle repliée donne à voir.
    const aretesReelles = (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a));
    const aplati = aplatirGraphe(noeudsRef.current as unknown as NoeudG[], aretesReelles, trouverMeta);
    const aretesG = () => aplati.aretes;
    const plan = planifierBoucles(
      aplati.noeuds,
      (id) => [...descendants(id, aretesG())],
      (id) => [...ancetres(id, aretesG())],
    );
    if (!plan) { publierBoucles([]); return lancerUnePasse(noeudPrioritaireId, perimetre, jeton); }
    if (plan.independantes) {
      console.warn("[attic] Deux boucles qui ne s'emboîtent pas : elles seront menées l'une dans l'autre.");
    }

    const etats = plan.boucles.map((b) => ({
      debutId: b.debutId, finsIds: b.finsIds, index: 0,
      morceaux: [] as Sequence[], recoltes: [] as Sequence[],
    }));

    /** Ce qui doit rejouer : le corps de ces boucles, désigné par ses deux bouts. */
    const oublierLeCorps = (depuis: number) => {
      const aRejouer = new Set<string>();
      for (let k = depuis; k < etats.length; k++) {
        aRejouer.add(etats[k].debutId);
        for (const id of descendants(etats[k].debutId, aretesG())) aRejouer.add(id);
        for (const finId of etats[k].finsIds) {
          aRejouer.add(finId);
          for (const id of ancetres(finId, aretesG())) aRejouer.add(id);
        }
      }
      for (const id of aRejouer) cacheExec.current.delete(id);
    };

    try {
      publierBoucles(etats);
      // LE CORPS EST OUBLIÉ AVANT LA DÉCOUVERTE, ET NON SEULEMENT ENTRE LES PASSES. Sans cela, un
      // second lancement du même graphe ne bouclait plus : le nœud de début, dont les réglages et
      // les entrées n'avaient pas changé, était servi par le cache, `decouvrirPour` n'était jamais
      // appelé, la boucle restait à zéro morceau, et la fin annonçait « toutes les passes sont
      // revenues vides ». Le premier lancement marchait, les suivants non, ce qui est le pire des
      // défauts à trouver. Relevé sur une boucle par créneau relancée deux fois de suite.
      oublierLeCorps(0);
      // La passe de découverte : chaque début y remplit ses morceaux.
      await lancerUnePasse(noeudPrioritaireId, perimetre, jeton);

      // LE COMPTEUR EST DANS `boucleSequencesGlobal.ts`, AVEC SES BORNES ET SES TESTS. Une mécanique
      // dont toute la valeur est de s'arrêter ne peut pas vivre dans un composant, où aucun test de
      // ce dépôt ne l'atteint.
      let faites = 1;
      while (avancerBoucles(etats)) {
        if (arretLotRef.current || faites >= PASSES_MAX_TOTAL) break;
        oublierLeCorps(0);
        await lancerUnePasse(noeudPrioritaireId, perimetre, jeton);
        faites++;
      }
    } finally {
      publierBoucles([]);
    }
  }, [lancerUnePasse]);

  /**
   * Le traitement par lot : le graphe entier, rejoué une fois par fichier.
   *
   * POURQUOI DES PASSES ET NON UN DÉPLIAGE. Les deux autres répétitions du projet — la boucle de
   * graphe et l'instrument — recopient la chaîne AVANT l'exécution, si bien que tous les tours
   * vivent ensemble. C'est sans conséquence sur une note de deux secondes ; c'en est une sur un
   * lot, où les fichiers font des minutes. Un morceau de trois minutes en stéréo pèse 63 Mo par
   * nœud : quatre nœuds sur trente fichiers demanderaient 7,5 Go. Ici chaque passe rend sa mémoire
   * avant la suivante — `setNodes` remplace les tampons —, et le nombre de fichiers n'a plus de
   * plafond.
   *
   * CE QUI RESTE DANS `lancerUnePasse`, ET C'EST VOLONTAIRE. Une passe est une exécution entière,
   * avec ses statuts, son cache, son annulation et son `AbortController`. L'enveloppe ne fait que
   * la rejouer : elle ne connaît ni la topologie, ni les résultats, ni rien du moteur. C'est la
   * raison pour laquelle cette mécanique-ci tient en trente lignes là où apprendre au moteur à
   * revenir en arrière aurait demandé de casser le cache, les statuts et l'annulation — ce que
   * `core/boucle-graphe.ts` disait déjà, et qui reste vrai.
   */
  const lancerLeLot = useCallback(async (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => {
    arretLotRef.current = false;
    // La lecture du dossier est asynchrone, la planification ne l'est pas : on lit d'abord, puis
    // `planifierLot` — pure et testée — décide de tout le reste.
    // QUELS DOSSIERS LIRE EST UNE QUESTION DE DOMAINE, et le moteur ne la tranche plus : il tenait
    // ici l'identifiant du composant qui les porte et le nom de son paramètre.
    const api = (window as any).api;
    const orch = servicesOrchestration();
    const dossiers = new Map<string, readonly unknown[]>();
    for (const d of orch.dossiersALire(noeudsRef.current)) {
      if (dossiers.has(d)) continue;
      dossiers.set(d, api?.lireDossier ? orch.fichiersUtiles(await api.lireDossier(d)) : []);
    }
    const plan = planifierLot(noeudsRef.current, (d) => (dossiers.get(d) ?? []) as never);

    // Le cas courant est celui-ci, et il ne doit rien coûter : pas de lot, une passe, rien de plus.
    if (!plan) {
      publierLot(null);
      return lancerBoucleValeur(noeudPrioritaireId, perimetre, jeton);
    }
    if (plan.plusieursDebuts) {
      console.warn("[attic] Deux débuts de boucle collection : chacun voudrait commander le nombre de passes.");
    }

    const journal: string[] = [];
    const nomsEcrits: string[] = [];
    try {
      for (let index = 0; index < plan.passes; index++) {
        if (arretLotRef.current) break;
        publierLot({ debutId: plan.debutId, index, fichiers: plan.fichiers, journal, nomsEcrits });
        // Le début de boucle et tout son aval doivent rejouer : leur empreinte n'a pas bougé d'une
        // passe à l'autre — le nœud n'a ni entrée ni paramètre qui change —, et le cache les
        // sauterait donc tous, le lot rendant trente fois le premier fichier.
        cacheExec.current.delete(plan.debutId);
        for (const id of descendants(plan.debutId, aretesRef.current as unknown as AreteG[])) {
          cacheExec.current.delete(id);
        }
        // CHAQUE FICHIER PASSE PAR LE PILOTE DES BOUCLES, ET NON PAR UNE PASSE NUE — relevé par
        // Fabien. Cette ligne appelait `lancerUnePasse` directement, si bien qu'une boucle par voix,
        // par créneau ou par cercle posée dans un graphe mené par lot n'était jamais PLANIFIÉE : le
        // pilote qui la mène est celui-là même qu'on sautait. Chaque fichier menait donc une seule
        // passe, la boucle ne bouclait pas, et rien ne le disait. Les trois répétitions s'emboîtent
        // maintenant dans l'ordre où elles se lisent : le lot dehors, les boucles par passes dedans,
        // et l'exécution du graphe au fond.
        await lancerBoucleValeur(noeudPrioritaireId, perimetre, jeton);
      }
    } finally {
      publierLot(null);
    }
  }, [lancerBoucleValeur]);

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
