// ui/moteur/passe.ts — Une passe du moteur : préparer, exécuter la boucle, faire le ménage.
//
// POURQUOI CE MODULE. Pièce P5a du plan de l'architecture par messages entre l'interface et le
// moteur. La passe vivait dans `ui/hooks/useExecutionGraphe.ts`, en `useCallback`, et finissait en
// écrivant elle-même dans l'état de React et dans deux magasins : le drapeau « le moteur tourne », la
// remise des « en cours » après un arrêt, et l'effacement de la priorité. Elle est ici une fonction,
// sans React, et elle DIT ce qu'elle fait au récepteur (`ui/recepteur-moteur.ts`) :
//
//   — `passeCommencee` une fois la préparation faite, avec les statuts qu'elle pose et les nœuds
//     visibles de la passe ; c'est à cet instant que le récepteur montre que le moteur tourne ;
//   — les événements de la boucle et du ménage, comme depuis les pièces P4a et P4b ;
//   — `passeArretee` à l'instant où son contrôleur est abattu, depuis la pièce P5b : le récepteur
//     lisait ce signal avant chaque lecteur ;
//   — `passeTerminee` dans le `finally`, avec sa raison : la fin, l'arrêt ou l'erreur.
//
// LES QUESTIONS DU PROTOCOLE SONT POSÉES AU MÊME INSTANT QU'AVANT : le graphe au départ, la priorité
// à la préparation, le nœud visible à la pose, la bascule d'économie au ménage. `t` et `repertoire`
// sont liés au moment de la demande : le moteur crée cette fonction à chaque `lancer`, avec ce que
// `demande()` répond à cet instant. Voir `ui/moteur/moteur.ts`.
//
// `docs/frontiere-moteur.test.ts` tient que rien du dossier du moteur n'atteint React, React Flow ni
// les trois magasins, par les imports transitifs.
import type { AreteG, NoeudG } from "../../core";
import { creerTablesDePasse, executerLesNoeuds, type PretsDeLaBoucle } from "../../core/execution";
import { creerResolveurDeGraines } from "../../core/graines-de-passe";
import { metaDeLInstantane, scellerLInstantane, signalerLesEcritures } from "../../core/instantane-de-graphe";
import { preparerLaPasse } from "../../core/preparation-passe";
import type { QuestionsAuShell, RecepteurDuMoteur } from "../../core/protocole-moteur";
import { respirer } from "../../core/respirer";
import { sautsDeBoucles } from "../../core/saut-de-boucle";
import { servicesDomaine } from "../../core/services-domaine";
import { registreUI } from "../registre-actif";
import { servicesApercu } from "../services-apercu";
import { servicesOrchestration } from "../services-orchestration";
import type { CacheDuMoteur } from "./cache";
import type { EtatDePasse } from "./etat-de-passe";
import { menageApresPasse } from "./menage-apres-passe";
import type { JetonDeRun } from "./ordonnanceur-runs";

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
  /**
   * Vrai pour la passe qui repose ce que le cache tient, sans rien exécuter : celle d'un paquet
   * `.attic` qu'on vient d'ouvrir. Elle ne passe ni par le lot ni par les boucles par passes, qui
   * vident le cache de leur aval, et ne se fond avec aucune autre demande.
   */
  cacheSeulement?: boolean;
  /** Les nœuds que la passe de repose attend dans l'atelier : l'import vient de les poser. */
  attendre?: readonly string[];
}

export type LancerUnePasse = (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => Promise<void>;

/** Une case que le moteur lit et écrit : le contrôleur de la passe en cours, l'arrêt du lot. */
export interface Emplacement<T> { current: T }

/**
 * Ce que le moteur prête à une passe : les questions du protocole qu'elle pose, chacune à l'instant
 * où elle la lisait, le récepteur, le cache, et ce que la demande a lié.
 */
export interface PretsDeLaPasse extends Pick<QuestionsAuShell, "graphe" | "priorite" | "noeudVisible" | "noeudsVisibles" | "economieMemoire"> {
  /**
   * Le récepteur, à qui la passe dit tout : son début, sa boucle, son ménage, son arrêt et sa fin.
   * L'écriture des lecteurs est à lui, une fois le bilan posé, et `passeArretee` l'interrompt.
   */
  recevoir: RecepteurDuMoteur<unknown>;
  cache: CacheDuMoteur;
  /** Le contexte audio, créé à la première passe et réveillé à chacune. */
  audio: () => Promise<AudioContext>;
  /** La forme canonique d'un choix, que la langue de l'interface ne doit pas changer. */
  canoniser: PretsDeLaBoucle<AudioContext>["canoniser"];
  /** Liés à l'instant de la demande : la réponse de `demande()` quand `lancer` a été envoyé. */
  repertoire: string;
  t: (cle: string) => string;
  /** Le contrôleur de la passe en cours, que l'arrêt et la remise à zéro abattent. */
  controleur: Emplacement<AbortController | null>;
}

export function creerLancerUnePasse(p: PretsDeLaPasse): LancerUnePasse {
  const { cache, repertoire, t } = p;
  return async (noeudPrioritaireId, perimetre, jeton) => {
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
    const generation = jeton?.generation ?? 0;
    const cible = noeudPrioritaireId ? { cible: noeudPrioritaireId } : {};
    const controller = new AbortController();
    p.controleur.current = controller;
    // L'ARRÊT SE DIT À L'INSTANT OÙ IL A LIEU : le récepteur lisait le signal de la passe avant chaque
    // lecteur, il reçoit maintenant un événement, synchrone comme l'abandon du contrôleur.
    controller.signal.addEventListener("abort", () => { p.recevoir({ genre: "passeArretee", generation }); }, { once: true });
    let ecrituresDeLaPasse: (() => string[]) | null = null;
    // UN GRAPHE VIDE NE FAIT RIEN, pas même dire qu'il commence ou qu'il finit : le moteur rendait la
    // main avant de rien poser. Le graphe se lit dans le `try`, où une exception est relevée.
    let vide = false;
    let tombee = false;
    try {
      // LE GRAPHE DE LA PASSE EST CELUI DE CET INSTANT, COPIÉ, ses métas compris, et chaque `data` y
      // est scellé : ce qu'un exécuteur y écrirait se relève à la fin de la passe.
      const instantane = p.graphe();
      if (instantane.noeuds.length === 0) { vide = true; return; }
      console.log(`[lancer] priorite=${noeudPrioritaireId} estGlobal=${!noeudPrioritaireId} nodes=${instantane.noeuds.length} cacheSize=${cache.taille()}`);
      ecrituresDeLaPasse = scellerLInstantane(instantane);
      // LES ARÊTES DE SUBSTITUTION NE CALCULENT PAS. Replier une bulle cache les arêtes qui la
      // traversent et en dessine des substituts vers ses poignées : ce sont des objets d'affichage, et
      // les vraies arêtes sont toujours là. Les laisser entrer ici changerait l'empreinte des entrées
      // d'un nœud, donc invaliderait son résultat au moindre repli — or ne RIEN invalider est la
      // propriété qui justifie de replier plutôt que d'extraire. Voir `core/bulles.ts`.
      // ── LA PRÉPARATION EST DANS LE CŒUR, `core/preparation-passe.ts`, PURE ──
      // Aplatir, déplier, ordonner, cibler, valider, relever les cycles : le plan rend ce que le
      // moteur posait en chemin, statuts, avertissements et trace, dans l'ordre où il les posait.
      // Le graphe à documenter est publié avant tout, comme avant.
      const plan = preparerLaPasse({
        noeuds: instantane.noeuds as NoeudG[],
        aretes: instantane.aretes as AreteG[],
        prioriteDemandee: noeudPrioritaireId ?? p.priorite(),
        versLAval: perimetre?.versLAval === true,
        trouverMeta: metaDeLInstantane(instantane), trouverDef, fluxCompatibles: registreUI().fluxCompatibles, t,
      });
      const {
        aretesReelles, plat, deplie, nds, aretesG, tousNoeudsG, boites,
        ordreFiltre, idsDecoratifs, ordonnees, estMetaEnScope,
      } = plan;
      servicesOrchestration().publierGraphe(plan.aDocumenter);
      for (const a of plan.avertissements) console.warn(a);
      // LA PASSE COMMENCE : le récepteur montre que le moteur tourne, pour une passe globale, et pose
      // les statuts de la préparation, dans l'ordre.
      p.recevoir({ genre: "passeCommencee", generation, ...cible, ordre: ordreFiltre, statuts: plan.statuts, noeuds: tousNoeudsG });
      console.log(plan.traceOrdre);

      const ctx = await p.audio();
      // LES TABLES DE LA PASSE, créées avant la boucle : les deux premières sont publiées avant elle, et
      // le ménage lit les autres après. Voir `TablesDePasse` dans `core/execution.ts`.
      const tables = creerTablesDePasse();
      const { resultats, messages, affichageParNoeud, designeParNoeud, demandesParNoeud, ecartsParNoeud, tempsParVisible } = tables;
      // UNE BOUCLE INCHANGÉE NE SE RECALCULE PAS, son corps eût-il été lâché. Voir `core/saut-de-boucle.ts`.
      const sauts = sautsDeBoucles(deplie.depliees, { noeuds: deplie.noeuds, aretes: aretesG, resultats, cache: cache.entrees(), toursDesCopies: deplie.toursDesCopies,
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

      // LES TABLES DU MOTEUR, que lit son ménage. L'affichage du récepteur n'en reçoit aucune.
      const passe: EtatDePasse = {
        resultats, messages, affichageParNoeud, designeParNoeud, tousNoeudsG, aretesReelles, ordreFiltre,
        noeudsPlats: plat.noeuds, estMetaEnScope, trouverDef, economieMemoire: p.economieMemoire, t,
      };
      // ── LA BOUCLE NŒUD PAR NŒUD EST DANS LE CŒUR, `executerLesNoeuds` de `core/execution.ts` ──
      // Décider, appliquer la décision, exécuter, ranger le retour, avec ses trois points d'annulation.
      // Le moteur lui prête ce qu'il tient : le runtime, le contrôleur, le jeton, le registre, le cache,
      // les sauts de boucle et les questions du domaine. Ce qu'elle dit part au récepteur, par `emettre`.
      //
      // UN RÉSULTAT SE POSE DÈS QUE SON NŒUD A FINI, s'il est regardé, et les autres à la fin : c'est le
      // récepteur qui en décide, et le magasin qui rend la pose gratuite. Voir `ui/recepteur-moteur.ts`
      // et `ui/resultats.ts`, où sont les mesures.
      await executerLesNoeuds<AudioContext>(plan, tables, {
        runtime: ctx, repertoireTravail: repertoire, signal: controller.signal, jeton, trouverDef,
        trouverPlugin: (f) => registreUI().trouverPlugin(f), typeFlux: (x) => registreUI().typeFlux(x),
        canoniser: p.canoniser, graineDuNoeud,
        lireCache: (id) => cache.lire(id),
        ecrireCache: (id, entree) => cache.ecrire(id, entree),
        sauts, questions: () => servicesApercu(), t,
        cacheSeulement: perimetre?.cacheSeulement === true,
        emettre: p.recevoir,
        noeudVisible: p.noeudVisible,
      });

      // LE MÉNAGE D'APRÈS PASSE, dans `menage-apres-passe.ts` : le cache lâché, les causes de boucle et
      // les graines dans les messages, puis le bilan, que le récepteur pose dans cet ordre : la pose
      // finale, les temps et les écarts, les demandes, les champs autonomes et le statut des
      // conteneurs. Puis chaque lecteur promis, un par un : la promesse du bilan les comprend.
      await menageApresPasse(passe, {
        noeudsVisibles: p.noeudsVisibles, nds, cache, deplie, expansions: plat.expansions, grainesTirees,
        tempsParVisible, ecartsParNoeud, demandesParNoeud, ordonnees, idsDecoratifs, boites,
        generation, emettre: p.recevoir,
      });
    } catch (e: any) {
      tombee = true;
      console.error("lancer error", e);
    } finally {
      if (ecrituresDeLaPasse) signalerLesEcritures(ecrituresDeLaPasse(), "passe");
      if (p.controleur.current === controller) p.controleur.current = null;
      // LA PASSE EST FINIE, ARRÊTÉE OU TOMBÉE, et le récepteur range ce qu'elle laisse : les « en
      // cours » d'un arrêt, le drapeau d'une passe globale, la priorité. Voir `ui/recepteur-moteur.ts`.
      if (!vide) {
        const raison = controller.signal.aborted ? "arret" : tombee ? "erreur" : "fin";
        p.recevoir({ genre: "passeTerminee", generation, ...cible, raison });
      }
    }
  };
}
