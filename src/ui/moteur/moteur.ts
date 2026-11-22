// ui/moteur/moteur.ts — Le moteur, construit une fois, et la seule façon de lui parler : `envoyer`.
//
// POURQUOI. Pièce P5b du plan de l'architecture par messages entre l'interface et le moteur. Le pont,
// `ui/hooks/useExecutionGraphe.ts`, tenait l'ordonnanceur, le contrôleur de la passe en cours et le
// drapeau d'arrêt du lot, et recréait la passe et ses pilotes à chaque rendu où la langue ou le
// dossier de travail changeaient. Tout cela est ici, sans React. Le moteur est construit une fois,
// par une référence paresseuse du pont, et il reçoit à sa construction ses questions et son
// récepteur, jamais par un effet : `StrictMode` doublerait chaque événement.
//
// LES SEPT COMMANDES DU PROTOCOLE PASSENT PAR `envoyer`, de façon synchrone :
//
//   — `lancer` pose la question `demande()` à l'instant où il est envoyé, et crée la passe et ses
//     pilotes avec ses réponses : une demande mise en file garde la langue et le dossier de cet
//     instant, comme la fermeture d'avant. Puis il passe par l'ordonnanceur, et rend la promesse de la
//     passe. La repose d'un paquet attend que l'atelier montre ses nœuds, et ne se fond avec rien ;
//   — `arreter` lève l'arrêt du lot, vide la file et abat la passe en cours ;
//   — `remettreAZero` abat la passe en cours, puis lâche ses nœuds du cache : l'annulation était un
//     appel à part, que la remise à zéro faisait avant d'effacer ;
//   — `oublier`, `regler`, `exporterCache` et `importerCache` vont au cache, comme depuis P3b.
//
// ET LE MOTEUR NUMÉROTE CHAQUE REMISE À ZÉRO ET CHAQUE OUBLI, depuis la pièce P6 (`core/remises.ts`).
// Une passe retient le numéro de son départ. Elle n'écrit plus au cache un nœud oublié depuis : elle
// calcule sur un graphe d'avant. Et le récepteur apprend, par `perimes`, ce qui a été remis à zéro
// ou abandonné, pour écarter ce que la passe en dirait encore. Un oubli simple, celui du SoundFont ou
// de l'ouverture d'un méta, ne lui dit rien : ce qui est montré reste.
import type { CommandeAuMoteur, EnvoiAuMoteur, QuestionsAuShell, RecepteurDuMoteur, ReponsesDuMoteur } from "../../core/protocole-moteur";
import { creerRemises } from "../../core/remises";
import { creerMoteurDuCache } from "./commandes";
import { creerOrdonnanceurDuMoteur, fusionDeLot } from "./ordonnanceur-runs";
import { creerLancerUnePasse, type Emplacement, type PerimetreCible, type PretsDeLaPasse } from "./passe";
import { creerPilotesDePasse } from "./pilotes";

/** Ce que le pont donne au moteur, une fois, à sa construction. */
export interface PretsDuMoteur {
  questions: QuestionsAuShell;
  /** Le récepteur, à qui chaque passe dit tout ce qu'elle fait. */
  recepteur: RecepteurDuMoteur<unknown>;
  /** Le contexte audio, créé à la première passe et réveillé à chacune. */
  audio: PretsDeLaPasse["audio"];
  /** La forme canonique d'un choix, que la langue de l'interface ne doit pas changer. */
  canoniser: PretsDeLaPasse["canoniser"];
  /** La ligne qui dit les valeurs de choix inconnues, que le shell écrit dans la langue de l'interface. */
  direValeursInconnues?: PretsDeLaPasse["direValeursInconnues"];
}

export interface Moteur {
  /** Envoyer une commande du protocole. Elle a fait son effet quand l'envoi rend la main. */
  envoyer: EnvoiAuMoteur;
}

/**
 * Attend que l'atelier montre les nœuds qu'un import vient de poser, au plus deux secondes.
 *
 * `setNodes` ne se voit dans les nœuds visibles qu'après le rendu qui suit, et une passe partie avant
 * reposerait le nouveau cache sur l'ancien graphe.
 */
async function attendreLesNoeuds(noeudsVisibles: () => readonly { id: string }[], ids: readonly string[]): Promise<boolean> {
  const fin = performance.now() + 2000;
  while (performance.now() < fin) {
    const presents = new Set(noeudsVisibles().map((n) => n.id));
    if (ids.every((id) => presents.has(id))) return true;
    await new Promise((r) => setTimeout(r, 16));
  }
  return false;
}

export function creerMoteur(p: PretsDuMoteur): Moteur {
  const { questions: q } = p;
  const { envoyer: envoyerAuCache, cache } = creerMoteurDuCache();
  // ═══ UNE EXÉCUTION À LA FOIS, ET C'EST L'ORDONNANCEUR QUI LE TIENT ═══ Voir `ordonnanceur-runs.ts`.
  const ordonnanceur = creerOrdonnanceurDuMoteur();
  /**
   * Le contrôleur de la passe en cours : un seul pour tout `lancer`, le moteur exécutant les nœuds en
   * séquence dans une seule boucle. Savoir qu'une exécution tourne, ciblée comprise, est l'affaire de
   * l'ordonnanceur, qui le compte au lieu de le déclarer.
   */
  const controleur: Emplacement<AbortController | null> = { current: null };
  /**
   * ARRÊTER PENDANT UN LOT DOIT ARRÊTER LE LOT, et non la seule passe en cours. Sans ce drapeau,
   * l'annulation coupait le fichier courant et l'enveloppe enchaînait aussitôt sur le suivant : le
   * bouton « Arrêter » paraissait alors ne rien faire sur un lot de trente fichiers.
   */
  const arretDuLot: Emplacement<boolean> = { current: false };

  /** Abat la passe en cours s'il y en a une, sans toucher à la file ni au lot. */
  const abattre = () => { if (ordonnanceur.enCours()) controleur.current?.abort(); };

  /** Le numéro de la dernière remise à zéro ou du dernier oubli, et ce que chacun a touché. */
  let numero = 0;
  const oublis = creerRemises();
  /**
   * Note un geste qui périme ce qu'une passe partie avant dirait de ces nœuds. Le récepteur ne
   * l'apprend que si ce qui est montré en dépend : une remise à zéro, ou un graphe abandonné.
   */
  const noter = (ids: readonly string[] | "tout", avecLeurContenu: boolean, direAuRecepteur: boolean) => {
    numero += 1;
    oublis.noter(numero, ids, avecLeurContenu);
    if (direAuRecepteur) p.recepteur({ genre: "perimes", generation: ordonnanceur.generation(), numero, ids });
  };

  const lancer = (c: Extract<CommandeAuMoteur, { genre: "lancer" }>): Promise<void> => {
    // LA DEMANDE LIE SA LANGUE ET SON DOSSIER MAINTENANT, et la passe les garde jusqu'au bout.
    const { t, repertoire } = q.demande();
    const lancerUnePasse = creerLancerUnePasse({
      graphe: () => q.graphe(), priorite: () => q.priorite(), noeudVisible: (id) => q.noeudVisible(id),
      noeudsVisibles: () => q.noeudsVisibles(), economieMemoire: () => q.economieMemoire(),
      recevoir: p.recepteur, cache, audio: p.audio, canoniser: p.canoniser, direValeursInconnues: p.direValeursInconnues, repertoire, t, controleur,
      numero: () => numero, oublieDepuis: (id, depart, visible) => oublis.depuis(id, depart, visible),
    });
    const { lancerLeLot } = creerPilotesDePasse({ lancerUnePasse, graphe: () => q.graphe(), cache, arretDuLot });
    // LE PÉRIMÈTRE EST CELUI QUE L'APPELANT A DONNÉ, champ pour champ, et rien s'il n'en a donné aucun :
    // la fusion de deux demandes distingue l'absence d'un périmètre vide.
    const { genre: _genre, cible, ...reste } = c;
    const perimetre: PerimetreCible | undefined = Object.keys(reste).length > 0 ? reste : undefined;
    // LA REPOSE D'UN PAQUET VA DROIT À UNE PASSE, sans fusion : fondue à un ▶ global, elle lui
    // donnerait son « cache seulement », et le run demandé n'exécuterait rien.
    if (perimetre?.cacheSeulement) {
      return ordonnanceur.demander(async (j) => {
        if (!(await attendreLesNoeuds(() => q.noeudsVisibles(), perimetre.attendre ?? []))) {
          console.warn("[lancer] repose du cache abandonnée : les nœuds importés ne sont pas dans l'atelier");
          return;
        }
        return lancerUnePasse(undefined, { cacheSeulement: true }, j);
      }) as Promise<void>;
    }
    return ordonnanceur.demander((j) => lancerLeLot(cible, perimetre, j), fusionDeLot(cible, perimetre, lancerLeLot)) as Promise<void>;
  };

  /**
   * Arrêter l'exécution en cours, sans rien effacer : les résultats déjà calculés restent en place.
   *
   * L'arrêt est demandé, pas immédiat : le nœud en cours reçoit son signal et s'arrête quand il le
   * consulte ; la boucle, elle, n'enchaîne plus le suivant. LA FILE SE VIDE AUSSI : une demande en
   * attente aurait démarré juste après l'arrêt, et le bouton aurait paru ne rien faire.
   */
  const arreter = () => {
    arretDuLot.current = true;
    ordonnanceur.viderLaFile();
    abattre();
  };

  /** Ce que fait chaque genre. Le compilateur l'exige entière, et chaque réponse du type du protocole. */
  const APPLIQUER: { [G in CommandeAuMoteur["genre"]]: (c: Extract<CommandeAuMoteur, { genre: G }>) => ReponsesDuMoteur[G] } = {
    lancer,
    arreter,
    // UNE REMISE À ZÉRO PENDANT UNE PASSE L'ABAT D'ABORD : sans cela, le nœud en cours de calcul
    // continuerait en arrière-plan et écraserait l'état qu'on vient d'effacer dès sa fin. PUIS ELLE
    // LE DIT AU RÉCEPTEUR : le bilan de la passe abattue reposait ce qu'on venait d'effacer (D1).
    remettreAZero: (c) => { abattre(); noter(c.ids, true, true); envoyerAuCache(c); },
    regler: (c) => { noter([c.id], false, false); envoyerAuCache(c); },
    // UN GRAPHE ABANDONNÉ SE DIT AU RÉCEPTEUR, et la passe qui tourne sur lui continue sans plus rien
    // écrire, ni au cache ni à l'écran (D2). La décision d'arrêter la passe est à part.
    oublier: (c) => { noter(c.ids, false, c.grapheAbandonne === true); envoyerAuCache(c); },
    exporterCache: (c) => envoyerAuCache(c),
    importerCache: (c) => envoyerAuCache(c),
  };
  // LA CONVERSION NE DIT RIEN QUE LA TABLE NE GARANTISSE : `c.genre` choisit l'entrée de la même
  // commande, ce que le compilateur ne sait pas suivre.
  const envoyer: EnvoiAuMoteur = (c) => (APPLIQUER[c.genre] as (c: CommandeAuMoteur) => never)(c);
  return { envoyer };
}
