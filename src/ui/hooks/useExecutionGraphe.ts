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
  ancetresBulle, aplatirGraphe, estBulle, estCacheParBulle, estSubstitution, grapheSansConteneurs,
  sortieDeBulle,
  trouverMeta,
  ordreTopologique, placerEnDernier, ancetres, descendants, empreinteParametres, empreinteEntrees, empreinteSorties, empreinteValeursEntrantes,
  noeudsEnCycle, resoudreEntree, valeursEntrantes, validerGraphe,
  type NoeudG, type AreteG, type TypeValeur,
} from "../../core";
import { peutReutiliserLeCache, sourceRetraitee } from "../../core/cache-execution";
import { estResultatEnErreur } from "../../core/execution";
import { Respiration, respirer } from "../../core/respirer";
import { apercuUtile, noeudRegarde, resultatRetenu } from "../../core/memoire";
import { poserStatut as poserStatutNoeud, reinitialiserStatuts, statutDe as statutDeNoeud, statutsPoses } from "../statuts";
import { deplierBoucles } from "../../core/boucle-graphe";
import { deplierInstruments } from "../../core/instrument-graphe";
import { registre } from "../../audio/adaptateur";
import { ecartNiveau } from "../../audio/ecart-niveau";
import { publierGrapheCourant, publierExecutionCourante } from "../../plugins/grapheGlobal";
import { bufferVersWavBlob, bufferVersWavBlobRespirant, picAbsolu } from "../../audio";
import { echantillonnerPourApercu, estCourbe } from "../../audio/courbe";
import { heriterDisposition } from "../../audio/multicanal";
import { tamponPourApercu } from "../../audio/multicanal-ecoute";
import { apresEffacement, champsAReporter, urlsARevoquer, type ClassesDeChamps } from "../../core/cycle-de-vie";
import type { DemandeAuMoteur } from "../../core/types";
import { CHAMPS_DE_SAISIE, CHAMPS_MEDIA } from "../../core/saisies";
import { decrire } from "../../audio/metadonnees";
import { lireProfondeurExport } from "../profondeur-export";
import { FICHE_LOT_DEBUT, fichiersAudio, planifierLot, publierLot } from "../../plugins/lotGlobal";
// LES BORNES SONT DÉCLARÉES AVEC LE COMPTEUR, ET NON ICI. Recopiées des deux côtés, elles auraient
// dérivé à la première qu'on aurait changée, et le test ne garderait plus que la copie du module.
import { avancerBoucles, planifierBoucles, publierBoucles, PASSES_MAX_TOTAL } from "../../plugins/boucleSequencesGlobal";
import type { Sequence } from "../../audio/sequence";

import { traduire, useI18n, valeurCanoniqueChoix } from "../../i18n";

const trouverDef = (id: string) => registre.trouverDef(id);
const FORMULA_NODE_IDS = ["formule-echantillons", "formule-spectrale", "generateur-audio-mathematique"];
const NOEUDS_AVEC_PLAFOND_PREVIEW = [...FORMULA_NODE_IDS, "julia-processor", "python-processor"];
/** Les nœuds dont l'aperçu est aussi le fichier enregistré, et qui portent donc un bloc iXML. */
const NOEUDS_EXPORT = ["sortie-audio", "convertisseur-mp3-wav"];

// LA TROISIÈME CLASSE A DISPARU, ET C'EST UN RÉSULTAT. `CHAMPS_SIGNAL_UNIQUE` nommait ici trois
// champs qu'un composant posait sur un nœud pour parler au MOTEUR : un graphe à créer, un graphe
// trouvé dans un fichier, une palette à relire. Le moteur les relisait puis les remettait à
// `undefined`. C'était une quatrième liste de noms tenue à la main, et un cinquième champ, celui de
// l'export, écrivait la même chose sans y figurer.
//
// Ces demandes passent désormais par `moteur`, dans le retour de l'exécuteur : rien ne se pose sur
// le nœud, donc il n'y a ni classe à décider, ni remise à zéro à prévoir, ni champ à oublier. Il ne
// reste que deux classes, la troisième n'ayant jamais décrit que des champs qui n'avaient pas à être
// là. Voir `DemandeAuMoteur` dans `core/types.ts`.

// Champs saisis par l'utilisateur : ils ne doivent JAMAIS être réinitialisés par
// une cascade de reset. Seuls les résultats de calcul (URLs blob, buffers,
// statuts, messages, cache) peuvent être effacés.
// Exporté : sert aussi d'allowlist au copier-coller (App.tsx) — copier UNIQUEMENT
// ces champs plutôt que tout `data` sans filtre, pour ne jamais dupliquer un
// résultat calculé (buffer audio, URL blob…) sur un nœud qui n'a pas encore
// tourné lui-même. Voir le commit qui a introduit ce commentaire pour le détail
// du bug : un nœud collé affichait/jouait le résultat de l'original avant même
// sa première exécution, car `audioResultatBuffer`/`audioResultatUrl` etc.
// étaient copiés par erreur avec le reste de `data`.
/**
 * Ce que la personne a posé sur un nœud, et que rien n'efface jamais.
 *
 * DÉRIVÉ, ET NON PLUS ÉNUMÉRÉ. Vingt-cinq noms étaient écrits ici à la main, et les sept autres
 * endroits qui décrivaient le même savoir en avaient chacun un sous-ensemble différent. La table des
 * genres de saisie, dans `core/saisies.ts`, les déclare une fois ; ceci n'est plus qu'un nom pour
 * elle. Sert aussi d'allowlist au copier-coller, privée des médias locaux.
 */
export const CHAMPS_UTILISATEUR: ReadonlySet<string> = CHAMPS_DE_SAISIE;

// Média chargé par l'utilisateur SUR CE NŒUD précis.
//
// Ces champs restent dans CHAMPS_UTILISATEUR — ils doivent absolument survivre
// à une cascade de réinitialisation, sans quoi lancer le graphe ferait perdre à
// l'utilisateur le fichier qu'il a chargé. Mais ils ne doivent pas être
// DUPLIQUÉS : un « Entrée audio » collé arrivait avec le fichier de l'original,
// donc un lecteur affichant déjà une durée de piste, alors que ce nœud n'a rien
// reçu ni rien exécuté. Un nœud copié doit arriver vierge, prêt à recevoir son
// propre fichier.
//
// La distinction ne vaut que pour la COPIE (Ctrl+C). Un couper-coller (Ctrl+X)
// est un déplacement, pas une duplication : l'original disparaît, donc le média
// doit suivre — l'oublier là reviendrait à le détruire.
/** Les médias chargés sur CE nœud, dérivés de la même table : voir `core/saisies.ts`. */
export const CHAMPS_MEDIA_LOCAL: ReadonlySet<string> = CHAMPS_MEDIA;

/** Champs retenus par un copier-coller (Ctrl+C) : saisie utilisateur, média exclu. */
export const CHAMPS_COPIABLES = new Set(
  [...CHAMPS_UTILISATEUR].filter((c) => !CHAMPS_MEDIA_LOCAL.has(c)),
);

/**
 * Ce qu'une exécution DÉPOSE sur un nœud, et que la réinitialisation doit donc retirer.
 *
 * POURQUOI CETTE LISTE EXISTE, relevé par Fabien : le dessin du générateur de courbe restait à
 * l'écran après un reset. Le nœud repassait bien « en attente », son message et son bouton de copie
 * disparaissaient, et la courbe continuait de s'afficher comme si elle venait d'être calculée. La
 * cause n'est pas dans le composant : la remise à zéro énumérait à la main les champs à effacer, et
 * trois de ceux que l'exécution écrit n'y figuraient pas. `apercuCourbe` dessine la courbe,
 * `midiFichierSortie` offre le fichier à télécharger, `ecartNiveau` affiche la pastille en
 * décibels : les trois survivaient à la remise à zéro du nœud qui les avait produits.
 *
 * LA LISTE EST DONC UNIQUE, et c'est la seule protection qui tienne. Une énumération écrite là où
 * l'on efface ne peut pas savoir ce qu'on a ajouté là où l'on écrit ; deux listes divergent, et
 * celle du réalisateur de démonstration avait déjà divergé de celle-ci, dans l'autre sens. Un champ
 * ajouté ici disparaît partout.
 *
 * AUCUN DE CES CHAMPS N'APPARTIENT À L'UTILISATEUR. Un recouvrement avec `CHAMPS_UTILISATEUR`
 * serait un fichier chargé qui s'évapore au premier lancement ; un test tient les deux disjoints.
 */
export const CHAMPS_RESULTAT = new Set([
  "audioResultatUrl",
  "audioResultatNom",
  "audioResultatBuffer",
  "audioResultatMessage",
  "mp3Url",
  "scriptGenere",
  "apercuCourbe",
  "midiFichierSortie",
  "imageResultatUrl",
  "imageResultatFile",
  "visualisationUrl",
  "tempsExecution",
  "ecartNiveau",
  // ── L'ANCIEN RÉGIME EST VIDE ──
  //
  // VINGT-NEUF CHAMPS Y FIGURAIENT, sur douze composants. Vingt-six sont passés au canal
  // d'affichage, deux ont été retirés parce que rien ne les lisait, et le dernier, `_grapheExport`,
  // est parti par le canal du moteur : il ne décrivait pas ce qu'on voit, il disait au moteur quoi
  // embarquer dans le fichier écrit.
  //
  // Ce qui précède est ce que le MOTEUR lui-même dépose sur un nœud : l'URL du son rendu, son
  // message, le temps d'exécution. Un composant, lui, n'écrit plus rien.

  // ── LE CANAL DÉCLARÉ, et ce qu'il remplace ──
  //
  // Ces deux clés seules valent pour tout composant qui rend `affichage` ou `designe` : la classe
  // ne se déclare plus champ par champ dans cette liste, elle est portée par le canal. Un composant
  // migré n'ajoute donc plus rien ici, et n'a plus rien à y oublier. Les vingt-neuf entrées
  // ci-dessus sont ce qui reste de l'ancien régime, et elles s'en iront composant par composant.
  "_affichage",
  "_designe",
]);

/**
 * Ce qu'un CHANGEMENT DE RÉGLAGE ne périme pas, bien que le run l'ait déposé.
 *
 * POURQUOI CE SECOND AXE EXISTE, relevé par Fabien : « l'écoute vivante fonctionnait hier et ne
 * fonctionne plus ». C'est cette liste-ci qui manquait. Un réglage modifié passe par la même remise
 * à zéro que le bouton, et depuis que les tampons du Montage s'effacent au reset — ce qu'il fallait
 * pour que le dessin ne survive pas à l'exécution qui l'a produit — bouger un gain les effaçait
 * aussi : le graphe vivant n'avait plus rien à jouer et s'arrêtait. Régler en écoutant redevenait
 * impossible, ce qui est le défaut même qu'il corrigeait.
 *
 * LE CRITÈRE : un réglage périme ce que le nœud a CALCULÉ, jamais ce qu'il a DÉSIGNÉ DE SES ENTRÉES.
 * Les tampons des pistes sont ceux des composants d'amont, les durées mesurées sont celles des sons
 * reçus, les notes sont celles des boîtes branchées : changer un début ou un gain ne touche à aucun
 * des trois. Le bouton de remise à zéro, lui, les efface comme le reste, le nœud repassant « en
 * attente ». Ce n'est donc pas une quatrième classe, c'est la portée d'un geste.
 *
 * ET CELA NE VAUT QUE POUR LE NŒUD DONT LE RÉGLAGE A CHANGÉ. Un montage situé en aval, lui, voit ses
 * entrées changer pour de bon : ses tampons sont périmés, et la cascade les efface.
 *
 * Le dépôt avait déjà rencontré ce conflit, sur les zones, et l'avait résolu par le choix entre
 * `reinitialiserNoeud` et `reinitialiserAval` : « effacer le nœud ferait disparaître sa forme d'onde
 * et son lecteur à chaque zone ajoutée ». Ici le résultat calculé EST périmé, donc il faut effacer le
 * nœud ; seule la matière d'affichage venue des entrées doit rester.
 */
export const CHAMPS_GARDES_AU_REGLAGE = new Set([
  // LE CANAL DÉCLARÉ : `designe` dit ce que le run a reçu, qu'un réglage ne périme pas. Un
  // composant migré est couvert par cette seule entrée, quel que soit ce qu'il désigne.
  //
  // ELLE EST SEULE, ET C'EST LA MESURE DE CE QUE LE CANAL CHANGE. Trois champs y figuraient, un par
  // besoin d'un composant ; le Montage et la Maquette passés au canal, il n'en reste aucun, et le
  // prochain composant qui désignera quelque chose de ses entrées n'aura rien à ajouter ici.
  "_designe",
]);

/**
 * Les quatre classes réunies, telles que `core/cycle-de-vie.ts` les attend.
 *
 * ELLES RESTENT DÉCLARÉES ICI, avec le moteur qui les applique ; ce qu'on en FAIT est parti dans le
 * cœur, où cela se démontre. Un banc peut donc prendre cet objet tel quel et éprouver les
 * transitions sur les quatre cent quarante-huit fiches, sans monter React.
 */
export const CLASSES: ClassesDeChamps = {
  utilisateur: CHAMPS_UTILISATEUR,
  resultat: CHAMPS_RESULTAT,
  gardesAuReglage: CHAMPS_GARDES_AU_REGLAGE,
  mediaLocal: CHAMPS_MEDIA_LOCAL,
};

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
  // granularité par nœud). `enCoursRef` existe séparément de `enExecRef` (qui
  // ne suit QUE les runs globaux, pas un run ciblé sur un seul nœud
  // prioritaire) : sans lui, réinitialiser pendant un run ciblé ne détecterait
  // aucune exécution en cours et n'annulerait rien.
  const enCoursRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    if (!enCoursRef.current) return false;
    abortControllerRef.current?.abort();
    return true;
  }, []);

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
  const reinitialiserIds = useCallback((ids: Set<string>, garder?: ReadonlySet<string>) => {
    // Un reset pendant un run en cours signale l'annulation : sans ça, le nœud
    // en cours de calcul (ex. extraction de features piste par piste sur une
    // grosse collection) continue en arrière-plan et écrase l'état qu'on vient
    // de réinitialiser dès son prochain onProgress ou sa fin d'exécution.
    if (enCoursRef.current) abortControllerRef.current?.abort();
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
    for (const n of noeudsRef.current) {
      if (!ids.has(n.id)) continue;
      for (const url of urlsARevoquer(n.data as any, CLASSES, garder)) URL.revokeObjectURL(url);
    }
    // L'état d'exécution vit dans son magasin : le remettre en attente ne passe plus par le
    // tableau des nœuds (voir `ui/statuts.ts`).
    reinitialiserStatuts(ids);
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
    for (const id of ids) cacheExec.current.delete(id);
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
  // arêtes à jour plutôt qu'une closure périmée.
  const reinitialiserNoeud = useCallback((nodeId: string) => {
    reinitialiserIds(new Set([nodeId, ...descendants(nodeId, aretesRef.current)]));
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

  const lancerUnePasse = useCallback(async (noeudPrioritaireId?: string) => {
    // Ne pas bloquer si on lance un node individuellement (prioritaire)
    // — seul le bouton Run global (sans prioritaire) est bloqué pendant l'exécution
    if (!noeudPrioritaireId && enExecRef.current) return;
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
    enCoursRef.current = true;
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
    publierGrapheCourant(aDocumenter);
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
    const nds = deplie.noeuds as unknown as any[];
    const aretes = deplie.aretes as unknown as Edge[];
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
      // Si le nœud prioritaire est un méta, il n'existe pas dans le graphe aplati
      // (il est expansé) : cibler ses nœuds de sortie internes aplatis, sinon
      // `ancetres` ne renvoie que lui-même et rien ne s'exécute.
      let cibles = [priorite];
      const noeudPrio = noeudsRef.current.find((n) => n.id === priorite);
      const metaPrio = noeudPrio && trouverMeta((noeudPrio.data as { ficheId?: string }).ficheId as string);
      if (metaPrio) cibles = (metaPrio.mapSorties as { noeudInterne: string }[]).map((m) => `${priorite}::${m.noeudInterne}`);
      const anc = new Set<string>();
      for (const c of cibles) for (const a of ancetres(c, aretesG)) anc.add(a);
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
    const validation = validerGraphe(
      plat.noeuds,
      aretes as unknown as AreteG[],
      (ficheId) => trouverDef(ficheId),
      registre.fluxCompatibles,
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

    // Marquer les méta-nœuds visibles comme "en_cours"
    for (const n of noeudsRef.current) {
      const meta = trouverMeta(n.data.ficheId as string);
      if (meta && !noeudsEnErreur.has(n.id) && estMetaEnScope(n.id)) {
        definirStatut(n.id, "en_cours");
      }
    }

    // UNE BULLE DIT CE QUE FONT SES MEMBRES. Elle ne calcule rien, mais un conteneur muet pendant que
    // son contenu travaille laisserait croire qu'il ne se passe rien. L'appartenance étant explicite,
    // la remontée est une lecture directe — sans la convention d'identifiant `::` dont dépend celle des
    // méta-composants, puisque replier ne renomme rien.
    const tousNoeudsG = noeudsRef.current as unknown as NoeudG[];
    const bullesDuNoeud = new Map<string, string[]>();
    for (const id of ordreFiltre) bullesDuNoeud.set(id, ancetresBulle(tousNoeudsG, id));
    for (const n of noeudsRef.current) {
      if (!estBulle(n.data.ficheId as string) || noeudsEnErreur.has(n.id)) continue;
      const active = ordreFiltre.some((id) => (bullesDuNoeud.get(id) ?? []).includes(n.id));
      if (active) definirStatut(n.id, "en_cours");
    }

    const ctx = await obtenirAudio();
    const resultats = new Map<string, TypeValeur[]>();
    const messages = new Map<string, string>();
    const traitesCeRun = new Set<string>();
    // Les tables VIVANTES du run, pour les nœuds qui passent en dernier (cf. grapheGlobal.ts).
    publierExecutionCourante({ ordre: ordreFiltre, noeuds: nds, aretes: aretesG, resultats, messages, expansions: plat.expansions });

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
    const visiblesEnErreur = new Set<string>();
    const poserStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
      const visibleId = plat.expansions.get(nodeId) ?? nodeId;
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
    // CE QUE LES COMPOSANTS DEMANDENT AU MOTEUR, et qui ne se pose jamais sur un nœud : embarquer un
    // graphe dans le fichier écrit, en poser un sur le canevas, relire la palette. Voir `moteur`
    // dans `core/types.ts`.
    const demandesParNoeud = new Map<string, DemandeAuMoteur>();

    // LA PRÉPARATION EST LE PLUS GROS GEL DU LANCEMENT. Valider le graphe, l'aplatir, déplier les
    // boucles et les instruments, le publier, calculer l'ordre topologique : tout cela est
    // synchrone, et mesuré à 286 ms sur un graphe de cinq nœuds qui ne font rien. Pendant ce
    // temps, le clic sur « Lancer » n'a encore produit aucun retour à l'écran — l'application
    // paraît n'avoir rien entendu. Une image ici, et le lancement se voit.
    await respirer();
    if (controller.signal.aborted) { enCoursRef.current = false; return; }

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
      if (!node) {
 continue; }

      const sourceReprocessee = sourceRetraitee(nodeId, aretes, traitesCeRun);
      const hashParams = empreinteParametres(node.data);
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
      const cacheIdentique = entreeCache && peutReutiliserLeCache(
        jamaisCache, sourceReprocessee, entreeCache,
        { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree },
      );

      console.log(`[cache] ${nodeId}(${node.data.ficheId}) sourceReprocessee=${sourceReprocessee} jamaisCache=${jamaisCache} hit=${cacheIdentique} hashParams=${hashParams} hashEntree=${monHashEntree} hashValeursEntree=${hashValeursEntree} cached=${entreeCache ? { hp: entreeCache.hashParams, he: entreeCache.hashEntree, hv: entreeCache.hashValeursEntree } : null}`);

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

      const fn = registre.trouverPlugin(node.data.ficheId as string);
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
          entree: (idx: number) => resoudreEntree<TypeValeur>(nodeId, idx, aretesG, resultats) as TypeValeur,
          entrees: () => valeursEntrantes<TypeValeur>(nodeId, aretesG, resultats),
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
            if (typeof p === "number") return p;
            const def = trouverDef(node.data.ficheId as string);
            const pDef = def?.parametres.find((p) => p.nom === nom);
            const defautEff = typeof pDef?.defautEn === "number" ? pDef.defautEn : defaut;
            return defautEff;
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
            const defautEff = pDef ? pDef.defaut : defaut;
            return pDef ? String(valeurCanoniqueChoix(pDef, defautEff)) : defaut;
          },
          // Ignorer un onProgress qui arrive après annulation : la piste déjà en
          // vol au moment du reset (son await ne vérifie pas `signal` en plein
          // milieu) peut encore appeler onProgress une dernière fois une fois
          // résolue — sans cette garde, ce message réaffiche « en cours » par
          // dessus l'état « attente » que le reset vient de poser, sans plus
          // jamais être corrigé (l'application du résultat final est, elle,
          // déjà court-circuitée par la garde juste après cet appel).
          onProgress: (msg: string) => { if (!controller.signal.aborted) poserStatut(nodeId, "en_cours", msg, true); },
          signal: controller.signal,
        });
        // Le nœud a été réinitialisé pendant que sa promesse était en vol (le
        // plugin a ignoré `signal`, ou a fini pile au moment de l'annulation) :
        // ne pas écraser l'état déjà remis à « attente » par le reset avec un
        // résultat/statut « terminé » ou « erreur » périmé.
        if (controller.signal.aborted) break;
        resultats.set(nodeId, res.valeurs as TypeValeur[]);
        // LA DISPOSITION VOYAGE AVEC LE SON. Un effet ordinaire fabrique un tampon neuf, et sans
        // cette ligne il effacerait au passage l'étiquette « 7.1.4 » ou « ambisonie d'ordre 2 » que
        // son entrée portait — l'export ne saurait plus quel canal est le centre. La règle ne devine
        // jamais : seul un tampon de même nombre de canaux qu'une entrée étiquetée hérite.
        heriterDisposition(res.valeurs as unknown[], valeursEntrantes<TypeValeur>(nodeId, aretesG, resultats));
        // DE COMBIEN CE COMPOSANT A CHANGÉ LE NIVEAU DE CE QU'IL A REÇU.
        //
        // Un composant peut rendre un son plus faible que son entrée sans que rien ne le dise : la
        // chute se découvre à l'oreille, plusieurs composants plus loin, sans qu'on sache lequel en
        // est la cause. L'écart est donc mesuré ici, où les entrées et les sorties sont toutes
        // deux disponibles, et porté sur le nœud à côté du temps d'exécution.
        //
        // RIEN N'EST CORRIGÉ. Redresser automatiquement casserait les composants dont le niveau
        // est l'objet, les garanties de reconstruction et l'associativité de la chaîne : voir
        // l'en-tête d'`audio/ecart-niveau.ts`. Le composant « Recaler le niveau » fait ce travail
        // là où on le demande.
        try {
          const ec = ecartNiveau(
            res.valeurs as unknown[],
            valeursEntrantes<TypeValeur>(nodeId, aretesG, resultats) as unknown[],
            (v): v is AudioBuffer => v instanceof AudioBuffer);
          if (ec) ecartsParNoeud.set(nodeId, ec.ecart);
        } catch { /* une mesure ratée ne fait pas échouer une exécution */ }
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
        if (estResultatEnErreur(defRes, res as { valeurs: TypeValeur[]; erreur?: boolean })) {
          noeudsEnErreur.add(nodeId);
          poserStatut(nodeId, "erreur", res.message);
          marquerMetaEnEchec(nodeId, node.data.ficheId as string);
          ajouterTemps(performance.now() - start);
        } else {
          const elapsed = performance.now() - start;
          // `consulteSorties` est ce que le nœud vient de DEMANDER, et non ce qu'une fiche déclare :
          // sans lui, le câblage aval de tous entrerait dans la clé pour la raison d'un seul.
          cacheExec.current.set(nodeId, { valeurs: res.valeurs, message: res.message, affichage: res.affichage, designe: res.designe, hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree, consulteSorties: aConsulteSesSorties, tempsExecution: elapsed });
          console.log(`[cache store] ${nodeId}(${node.data.ficheId}) hashParams=${hashParams} hashEntree=${monHashEntree} hashValeursEntree=${hashValeursEntree}`);
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
    // CE QUI EST DANS UNE BULLE REPLIÉE N'EST PAS GARDÉ, et le ménage se fait ICI, à la fin du run,
    // et non au moment où un nœud range son résultat. La raison est qu'un membre qui TROUVE son
    // résultat en cache n'exécute pas, donc ne range rien, donc ne déclenchait aucun ménage : les
    // tampons restaient accrochés au cache alors que les données des nœuds les avaient lâchés, et
    // l'on croyait avoir libéré. Relevé à l'écran, deux exécutions de suite.
    //
    // À LA FIN PLUTÔT QU'AU DÉBUT : le run courant garde ses raccourcis de cache, et c'est le
    // suivant qui refera la bulle. On paie le recalcul une fois par exécution, pas deux.
    // Voir `resultatRetenu` dans `core/memoire.ts` pour l'échange consenti.
    for (const n of noeudsRef.current) {
      const garde = resultatRetenu({
        cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
        economie: economieMemoireRef?.current ?? true,
      });
      if (!garde) cacheExec.current.delete(n.id);
    }

    // LA PHASE DES APERÇUS RESPIRE ELLE AUSSI, relevé par Fabien sur une pièce de cinquante
    // secondes. La boucle des nœuds rend la main entre deux nœuds depuis longtemps ; celle-ci, non,
    // et c'est pourtant elle qui encode un WAV par nœud audio pour son petit lecteur. Sur une pièce
    // longue, sept encodages s'enchaînaient sans une image : **un gel de 7,7 secondes d'un seul
    // tenant**, alors que le même graphe lancé nœud par nœud ne gelait pas, le navigateur peignant
    // entre deux clics. C'est cet indice-là qui a désigné la cause.
    const souffle = new Respiration();
    const correctifs = new Map<string, Record<string, unknown>>();
    for (const n of noeudsRef.current) {
      const patch = await calculerCorrectifResultat(n);
      if (patch) correctifs.set(n.id, patch);
      await souffle.tour();
    }
    // Un CORRECTIF de champs, appliqué sur les données VIVANTES du nœud — et non
    // un remplacement de `data` construit depuis `noeudsRef.current`. Ce ref est en
    // retard d'un rendu sur les statuts, que `definirStatut` vient de poser :
    // remplacer `data` en bloc reposait donc un statut périmé, et un nœud restait
    // affiché « en cours » alors que son calcul était fini. Défaut introduit par
    // cette refonte, et attrapé en vérifiant dans l'app.
    setNodes((nds) =>
      nds.map((n) => {
        const patch = correctifs.get(n.id);
        return patch ? { ...n, data: { ...n.data, ...patch } } : n;
      }),
    );

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
        // L'aperçu joue la PREMIÈRE sortie audio. Les nœuds dont les sorties audio sont des pairs —
        // les six pistes d'un séparateur — le disent par `sansApercuAudio` et n'en ont aucun.
        const audio = defNode?.sansApercuAudio ? null : valsSafe.find((v): v is AudioBuffer => v instanceof AudioBuffer);
        if ((n.data.ficheId as string) === "griffin-lim") {
          const peak0 = audio ? picAbsolu(audio.getChannelData(0)) : 0;
          const peak1 = audio && audio.numberOfChannels > 1 ? picAbsolu(audio.getChannelData(1)) : 0;
          console.log("[audio url] griffin-lim", {
            valsLength: valsSafe.length,
            firstType: valsSafe[0] ? typeof valsSafe[0] : "undefined",
            isAudioBuffer: valsSafe[0] instanceof AudioBuffer,
            audioFound: !!audio,
            audioCh: audio?.numberOfChannels,
            audioLen: audio?.length,
            audioSr: audio?.sampleRate,
            peakCh0: peak0,
            peakCh1: peak1,
            existingUrl: n.data.audioResultatUrl ? "yes" : "no",
            sameBuffer: audio === n.data.audioResultatBuffer,
          });
        }
        const fichier = valsSafe.find((v): v is File => v instanceof File);
        const imageFile = fichier && (fichier.type === "image/png" || fichier.type === "image/jpeg" || fichier.type === "image/svg+xml") ? fichier : null;
        const midiFile = fichier && fichier.type.includes("midi") ? fichier : null;
        const texte = valsSafe.find((v): v is string => typeof v === "string");
        // UN APERÇU DE LA COURBE, ET NON LA COURBE. Une courbe de quatre minutes porte quarante-huit
        // mille valeurs ; les retenir sur chaque nœud pour dessiner un trait de deux cents pixels
        // serait payer cher un croquis. Deux cent cinquante-six points suffisent à la forme, et ce
        // sont des nombres ordinaires, donc sérialisables avec le graphe.
        const courbeProduite = (valsSafe as unknown[]).find(estCourbe);
        const apercuCourbe = courbeProduite ? echantillonnerPourApercu(courbeProduite.valeurs, 256) : undefined;
        // Embarquer le graphe dans le WAV de prévisualisation si le node l'a demandé
        const grapheExport = demandesParNoeud.get(n.id)?.grapheAEmbarquer;
        // Réutilise l'URL existante si le buffer audio n'a pas changé — évite de
        // démonter/remonter le lecteur à chaque run (cache) et empêche le
        // rechargement gris/0:00 sur les nœuds déjà terminés.
        // Sur une piste longue, un intermédiaire ne reçoit pas d'aperçu : la copie en 16 bits
        // pèse 635 Mo par heure de son, et personne ne l'ouvre (cf. core/memoire.ts). Elle sera
        // construite le jour où l'on clique sur ce nœud — le tampon, lui, reste là.
        // UN MEMBRE DE BULLE REPLIÉE NE RETIENT RIEN : ni aperçu, ni référence au tampon. Le premier
        // ne s'écouterait pas, le second annulerait la libération faite plus haut — un tampon qui
        // reste accroché aux données du nœud n'est pas libéré parce que le cache l'a lâché.
        const membreReplie = !resultatRetenu({
          cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
          economie: economieMemoireRef?.current ?? true,
        });
        const garderApercu = !audio || (!membreReplie && apercuUtile({
          dureeS: audio.duration,
          regarde: noeudRegarde({
            id: n.id, selectionne: !!n.selected, aretes: aretesRef.current,
            dansUnMeta: (pileMetaRef?.current?.length ?? 0) > 0,
            // Un membre de bulle repliée n'est pas regardé : la bulle, elle, garde son aperçu.
            cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
          }),
          economie: economieMemoireRef?.current ?? true,
        }));
        let url: string | undefined;
        if (audio && garderApercu) {
          if (audio === n.data.audioResultatBuffer && n.data.audioResultatUrl) {
            url = n.data.audioResultatUrl;
          } else {
            if (n.data.audioResultatUrl) URL.revokeObjectURL(n.data.audioResultatUrl);
            const securiser = NOEUDS_AVEC_PLAFOND_PREVIEW.includes(n.data.ficheId as string);
            // Ce blob est à la fois l'aperçu écoutable et le fichier sauvegardé : la profondeur
            // choisie s'applique donc ici, et non au moment de la sauvegarde. Les séparer aurait
            // demandé de réencoder à l'enregistrement, donc de reconstruire le graphe embarqué,
            // que seule cette boucle connaît.
            // Un tampon multicanal étiqueté est replié en stéréo pour l'aperçu : à douze ou seize
            // canaux, l'aperçu pesait six à huit fois une stéréo dans le processus principal, pour un
            // lecteur incapable de le jouer juste. L'enregistrement, lui, repart du tampon complet.
            // Les nœuds d'export disent en plus d'où vient leur fichier (bloc iXML) : c'est ce blob
            // qu'enregistre leur bouton. Pas les autres — le calcul de l'identifiant parcourt le son,
            // et un aperçu intermédiaire n'est jamais livré.
            const ecrit = tamponPourApercu(audio);
            const bits = lireProfondeurExport();
            const ficheId = n.data.ficheId as string;
            const ixml = NOEUDS_EXPORT.includes(ficheId)
              ? decrire(ecrit, { noeud: trouverDef(ficheId)?.nom ?? ficheId }, bits).ixml
              : undefined;
            url = URL.createObjectURL(await bufferVersWavBlobRespirant(
              ecrit, grapheExport, securiser, { bits, ixml }, souffle));
          }
        } else if (n.data.audioResultatUrl) {
          URL.revokeObjectURL(n.data.audioResultatUrl);
        }
        // Même logique pour l'image (Songsee, etc.) : réutilise l'URL si le File est identique.
        let imageUrl: string | undefined;
        if (imageFile) {
          if (imageFile === n.data.imageResultatFile && n.data.imageResultatUrl) {
            imageUrl = n.data.imageResultatUrl;
          } else {
            if (n.data.imageResultatUrl) URL.revokeObjectURL(n.data.imageResultatUrl);
            imageUrl = URL.createObjectURL(imageFile);
          }
        } else if (n.data.imageResultatUrl) {
          URL.revokeObjectURL(n.data.imageResultatUrl);
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
        // Un méta-composant n'est pas exécuté lui-même : ce sont ses nœuds internes qui tournent.
        // C'est donc ici, une fois leurs résultats remontés, qu'on le déclare terminé.
        if (meta) poserStatutNoeud(n.id, "termine");
        return {
          audioResultatUrl: url ?? undefined,
          audioResultatNom: url ? `${n.data.ficheId}.wav` : undefined,
          audioResultatBuffer: membreReplie ? undefined : (audio ?? undefined),
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

    // Appliquer les temps d'exécution mesurés (cumulés par nœud visible, y compris méta)
    if (tempsParVisible.size > 0) {
      setNodes((nds) =>
        nds.map((n) => {
          if (!tempsParVisible.has(n.id)) return n;
          const t = tempsParVisible.get(n.id)!;
          if (n.data.tempsExecution === t) return n;
          return { ...n, data: { ...n.data, tempsExecution: t } };
        })
      );
    }

    // L'ecart de niveau, pose sur le noeud comme le temps d'execution l'est.
    if (ecartsParNoeud.size > 0) {
      setNodes((nds) =>
        nds.map((n) => {
          if (!ecartsParNoeud.has(n.id)) return n;
          const e = ecartsParNoeud.get(n.id)!;
          if (n.data.ecartNiveau === e) return n;
          return { ...n, data: { ...n.data, ecartNiveau: e } };
        })
      );
    }

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
      // UN GRAPHE TROUVÉ DANS UN FICHIER arrive avec des identifiants de nœuds : il se convertit en
      // fiches et en rangs, qui est ce que le canevas sait poser.
      const trouve = demande.grapheTrouve;
      if (onGrapheGenere && trouve?.nodes && trouve?.edges) {
        onGrapheGenere(nodeId, {
          nodes: trouve.nodes.map((nn) => ({ ficheId: nn.ficheId, label: nn.ficheId })),
          edges: trouve.edges.map((ee) => ({
            source: trouve.nodes.findIndex((nn) => nn.id === ee.source),
            target: trouve.nodes.findIndex((nn) => nn.id === ee.target),
          })).filter((e) => e.source >= 0 && e.target >= 0),
        });
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

    // LE STATUT FINAL D'UNE BULLE EST CELUI DE SES MEMBRES : en erreur si l'un a échoué, terminé si
    // tous ont fini. La laisser sur « en cours » après le run ferait croire à un calcul qui n'en finit
    // pas, alors qu'elle n'en mène aucun.
    for (const n of noeudsRef.current) {
      if (!estBulle(n.data.ficheId as string)) continue;
      const membres = ordreFiltre.filter((id) => ancetresBulle(tousNoeudsG, id).includes(n.id));
      if (membres.length === 0) continue;
      const statuts = membres.map((id) => statutDeNoeud(id).statut);
      if (statuts.includes("erreur")) definirStatut(n.id, "erreur");
      else if (statuts.every((s) => s === "termine")) definirStatut(n.id, "termine");
    }

    } catch (e: any) {
      console.error("lancer error", e);
    } finally {
      enCoursRef.current = false;
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
   * SANS NŒUD DE BOUCLE, RIEN NE CHANGE : une seule passe, comme avant, et pas un appel de plus.
   */
  const lancerBoucleValeur = useCallback(async (noeudPrioritaireId?: string) => {
    const aretesG = () => aretesRef.current as unknown as AreteG[];
    const plan = planifierBoucles(
      noeudsRef.current,
      (id) => [...descendants(id, aretesG())],
      (id) => [...ancetres(id, aretesG())],
    );
    if (!plan) { publierBoucles([]); return lancerUnePasse(noeudPrioritaireId); }
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
      await lancerUnePasse(noeudPrioritaireId);

      // LE COMPTEUR EST DANS `boucleSequencesGlobal.ts`, AVEC SES BORNES ET SES TESTS. Une mécanique
      // dont toute la valeur est de s'arrêter ne peut pas vivre dans un composant, où aucun test de
      // ce dépôt ne l'atteint.
      let faites = 1;
      while (avancerBoucles(etats)) {
        if (arretLotRef.current || faites >= PASSES_MAX_TOTAL) break;
        oublierLeCorps(0);
        await lancerUnePasse(noeudPrioritaireId);
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
  const lancer = useCallback(async (noeudPrioritaireId?: string) => {
    arretLotRef.current = false;
    // La lecture du dossier est asynchrone, la planification ne l'est pas : on lit d'abord, puis
    // `planifierLot` — pure et testée — décide de tout le reste.
    const api = (window as any).api;
    const dossiers = new Map<string, ReturnType<typeof fichiersAudio>>();
    for (const n of noeudsRef.current) {
      if ((n.data as { ficheId?: string }).ficheId !== FICHE_LOT_DEBUT) continue;
      const d = String((n.data as { parametres?: Record<string, unknown> }).parametres?.["Dossier"] ?? "").trim();
      if (d && !dossiers.has(d)) dossiers.set(d, api?.lireDossier ? fichiersAudio(await api.lireDossier(d)) : []);
    }
    const plan = planifierLot(noeudsRef.current, (d) => dossiers.get(d) ?? []);

    // Le cas courant est celui-ci, et il ne doit rien coûter : pas de lot, une passe, rien de plus.
    if (!plan) {
      publierLot(null);
      return lancerBoucleValeur(noeudPrioritaireId);
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
        await lancerUnePasse(noeudPrioritaireId);
      }
    } finally {
      publierLot(null);
    }
  }, [lancerUnePasse]);

  return { lancer, arreter, reinitialiserNoeud, reinitialiserAval, reinitialiserPourReglage, reinitialiserTout };
}
