// core/execution.ts — Logique d'interprétation du résultat d'un plugin.
// Extraite du hook useExecutionGraphe pour la rendre testable et éviter que la
// règle « tout-null = échec » ne marque des états légitimes (transcripteur MIDI
// vide, nœuds-frontière) lorsqu'ils déclarent sortieNullePermise.
//
// ET CE QU'UNE PASSE FAIT D'UN NŒUD AVANT DE L'EXÉCUTER, sorti d'`ui/hooks/useExecutionGraphe.ts`
// le 2026-11-11 à l'identique (pièce 1 du plan `work/plan-runtime-execution-2026-11-11.md`, qui sort
// du moteur la boucle nœud par nœud et l'amène ici). La décision rend un verdict ; c'est le moteur
// qui l'applique, aux tables, aux statuts et aux temps, comme il le faisait.
//
// ET CE QUE LE MOTEUR FAIT DU RETOUR D'UN EXÉCUTEUR, sorti de même le 2026-11-11 (pièce 2) :
// `enregistrerLeRetour` et `enregistrerLEchec`, plus bas. Le domaine, la fiche, le cache et la pose
// des statuts leur sont prêtés ; la console et l'horloge restent celles du langage, comme dans
// `core/types-au-port.ts`.
import type { DemandeAuMoteur, FonctionPlugin, PluginDef } from "./types";
import {
  peutReutiliserLeCache, sourceRetraitee, type CachePrecedent, type EmpreintesDuRun, type EntreeDeCache,
} from "./cache-execution";
import { empreinteEntrees, empreinteParametres, empreinteSorties, empreinteValeursEntrantes, valeursEntrantes } from "./graphe";
import type { AreteG, NoeudG } from "./meta";
import { servicesDomaine } from "./services-domaine";
import type { PoseDesStatuts } from "./statuts-de-passe";
import { signalerEcartsDeType, type TypeVerifiable } from "./types-au-port";

export function estResultatEnErreur<TV, TR>(
  def: PluginDef<TV, TR> | undefined,
  res: { valeurs: TV[]; erreur?: boolean },
): boolean {
  if (res.erreur) return true;
  const aDesSorties = (def?.sorties.length ?? 0) > 0 && !def?.sortieNullePermise;
  const toutNul =
    Array.isArray(res.valeurs) &&
    res.valeurs.length > 0 &&
    (res.valeurs as unknown[]).every((v) => v == null);
  return aDesSorties && toutNul;
}

/**
 * Ce qu'une passe fait d'un nœud avant de l'exécuter, dans l'ordre où elle se le demande.
 *
 *   — `dejaEnErreur` : la préparation ou un échec d'exécution l'a déjà marqué ; on le saute.
 *   — `entreeEnErreur` : une de ses entrées vient d'un nœud en erreur. Il ne peut pas produire un
 *     résultat correct, et le moteur le marque en erreur au lieu de le laisser « réussir » en silence
 *     avec une entrée manquante : le cas d'un mélangeur en aval de branches parallèles dont une a
 *     échoué. L'ordre topologique garantit que la source est déjà traitée.
 *   — `absent` : il n'est pas dans le graphe exécuté.
 *   — `copieSautee` : une copie d'une boucle inchangée, que `core/saut-de-boucle.ts` saute.
 *   — `cache` : il rend son résultat d'avant, et l'entrée de cache le porte.
 *   — `executer` : il tourne, avec les quatre empreintes que l'entrée de cache rangera.
 */
export type DecisionDuNoeud<TEntree> =
  | { genre: "dejaEnErreur" }
  | { genre: "entreeEnErreur"; source: string }
  | { genre: "absent" }
  | { genre: "copieSautee"; noeud: NoeudG }
  | { genre: "cache"; noeud: NoeudG; entree: TEntree }
  | { genre: "executer"; noeud: NoeudG; empreintes: EmpreintesDuRun };

/** Ce que le moteur prête pour décider. */
export interface EntreesDeDecision<TEntree extends CachePrecedent> {
  /** Les nœuds en erreur, de validation ou d'exécution ; le moteur y ajoute en chemin. */
  noeudsEnErreur: ReadonlySet<string>;
  /** Les nœuds du graphe exécuté, aplati et déplié. */
  noeuds: NoeudG[];
  /** Ses arêtes. */
  aretes: AreteG[];
  /** Les valeurs déjà rendues pendant ce run. */
  resultats: Map<string, unknown[]>;
  /** Les nœuds qui ont tourné pendant ce run. */
  traitesCeRun: ReadonlySet<string>;
  /** L'entrée de cache d'un nœud, lue au moment de décider. */
  lireCache: (id: string) => TEntree | undefined;
  /** Les deux questions que le moteur pose aux sauts de boucle. Voir `core/saut-de-boucle.ts`. */
  sauts: { copieSautee(id: string, retraites: ReadonlySet<string>): boolean; finReprise(id: string): boolean };
  /** La fiche d'un nœud, pour savoir si elle refuse le cache. */
  trouverDef: (ficheId: string) => { jamaisCache?: boolean } | undefined;
}

export function deciderDuNoeud<TEntree extends CachePrecedent>(
  nodeId: string, d: EntreesDeDecision<TEntree>,
): DecisionDuNoeud<TEntree> {
  if (d.noeudsEnErreur.has(nodeId)) return { genre: "dejaEnErreur" };
  const entreeFautive = d.aretes.find((a) => a.target === nodeId && d.noeudsEnErreur.has(a.source));
  if (entreeFautive) return { genre: "entreeEnErreur", source: entreeFautive.source };
  const noeud = d.noeuds.find((n) => n.id === nodeId);
  if (!noeud) return { genre: "absent" };
  if (d.sauts.copieSautee(nodeId, d.traitesCeRun)) return { genre: "copieSautee", noeud };

  const sourceReprocessee = sourceRetraitee(nodeId, d.aretes, d.traitesCeRun);
  const empreintes: EmpreintesDuRun = {
    // LES RÉGLAGES DE PROJET DU DOMAINE ENTRENT DANS LA CLÉ, et c'est un défaut évité de peu :
    // changer la fréquence de travail d'un projet ne relançait rien, et le lancement suivant
    // reposait les tampons du cache — à l'ancienne fréquence. Le réglage aurait paru inopérant au
    // deuxième run, ce qui est la pire espèce de panne. Le moteur ne sait pas ce qu'il hache : il
    // demande au domaine, à chaque nœud, par `core/services-domaine.ts`.
    hashParams: empreinteParametres(noeud.data) + JSON.stringify(servicesDomaine().reglagesDeProjet()),
    hashEntree: empreinteEntrees(nodeId, d.aretes),
    // LE CÂBLAGE AVAL ENTRE DANS LA CLÉ depuis qu'un nœud peut savoir si une de ses sorties est
    // branchée : ce qu'il rend en dépend. Voir `empreinteSorties`.
    hashSorties: empreinteSorties(nodeId, d.aretes),
    hashValeursEntree: empreinteValeursEntrantes(nodeId, d.aretes, d.resultats),
  };
  const entree = d.lireCache(nodeId);
  // Certains nœuds (sans sortie, avec I/O fichiers) ne doivent jamais être cachés — la fiche le
  // déclare, le moteur ne connaît aucun id en dur.
  const jamaisCache = d.trouverDef(noeud.data.ficheId as string)?.jamaisCache === true;
  // LA DÉCISION EST DANS `core/cache-execution.ts`, AVEC SES CAS ET SON PRIX. Une fin de boucle
  // reprise rend son entrée sans comparer ses empreintes : c'est la boucle entière qui a été jugée.
  const cacheIdentique = entree && (d.sauts.finReprise(nodeId) || peutReutiliserLeCache(
    jamaisCache, sourceReprocessee, entree, empreintes,
  ));
  return cacheIdentique ? { genre: "cache", noeud, entree } : { genre: "executer", noeud, empreintes };
}

// ═══ CE QUE LE MOTEUR FAIT DU RETOUR D'UN EXÉCUTEUR ═══

/** Ce qu'un exécuteur rend. */
export type RetourDeNoeud = Awaited<ReturnType<FonctionPlugin<unknown, unknown>>>;

/** Ce que le moteur demande au domaine sur les valeurs qu'un nœud vient de rendre. Voir `ui/services-apercu.ts`. */
export interface QuestionsDuRetour {
  porterALaFrequenceDeTravail(valeurs: readonly unknown[]): Promise<unknown[]>;
  heriterDesEntrees(sorties: readonly unknown[], entrees: readonly unknown[]): void;
  ecartNiveau(sorties: readonly unknown[], entrees: readonly unknown[]): number | undefined;
  frequencesMelees(entrees: readonly unknown[]): number[];
}

/** Ce que la passe prête pour ranger le retour de ses nœuds : ses tables, telles quelles, et ses prêts. */
export interface PretsDuRetour {
  aretes: AreteG[];
  /** Le nœud visible dont vient chaque identifiant aplati ou recopié : le temps s'y cumule. */
  expansions: ReadonlyMap<string, string>;
  resultats: Map<string, unknown[]>;
  messages: Map<string, string>;
  affichageParNoeud: Map<string, Record<string, unknown>>;
  designeParNoeud: Map<string, Record<string, unknown>>;
  demandesParNoeud: Map<string, DemandeAuMoteur>;
  ecartsParNoeud: Map<string, number>;
  tempsParVisible: Map<string, number>;
  noeudsEnErreur: Set<string>;
  /** Range une entrée de cache. La seule écriture du cache de tout le moteur passe par là. */
  ecrireCache: (id: string, entree: EntreeDeCache) => void;
  /** Pour une fin de boucle, l'empreinte de sa boucle entière. Voir `core/saut-de-boucle.ts`. */
  empreinteBoucle: (id: string) => string | undefined;
  /** Le jeton du run : périmé, il interdit d'écrire dans le cache. Voir `ui/ordonnanceur-runs.ts`. */
  jeton?: { readonly generation: number; perime(): boolean };
  trouverDef: (ficheId: string) => PluginDef<unknown, unknown> | undefined;
  typeFlux: (id: string) => TypeVerifiable | undefined;
  /** Les réponses du domaine, demandées à chaque question. */
  questions: () => QuestionsDuRetour;
  poserStatut: PoseDesStatuts["poserStatut"];
  marquerMetaEnEchec: PoseDesStatuts["marquerMetaEnEchec"];
}

/** Le nœud qui vient de tourner, et ce que sa décision et son contexte ont retenu de lui. */
export interface NoeudQuiATourne {
  id: string;
  noeud: NoeudG;
  /** Les quatre empreintes que `deciderDuNoeud` a calculées. */
  empreintes: EmpreintesDuRun;
  /** A-t-il demandé si ses sorties étaient branchées ? Voir `core/contexte-de-passe.ts`. */
  aConsulteSesSorties: () => boolean;
  /** L'instant, par `performance.now()`, où son exécution a commencé. */
  debut: number;
}

/** Cumule un temps de calcul sur le nœud VISIBLE, méta compris. */
function ajouterTemps(p: PretsDuRetour, nodeId: string, ms: number): void {
  const visibleId = p.expansions.get(nodeId) ?? nodeId;
  p.tempsParVisible.set(visibleId, (p.tempsParVisible.get(visibleId) ?? 0) + ms);
}

/**
 * Range ce qu'un exécuteur vient de rendre : valeurs converties, canaux, demandes, statut, cache, temps.
 *
 * TOUT CE QUI LÈVE ICI EST L'ÉCHEC DU NŒUD, comme dans le moteur : le crochet l'appelle dans le même
 * `try` que l'exécuteur, et une conversion qui lève passe donc par `enregistrerLEchec`.
 */
export async function enregistrerLeRetour(n: NoeudQuiATourne, res: RetourDeNoeud, p: PretsDuRetour): Promise<void> {
  const { id: nodeId, noeud: node, aConsulteSesSorties } = n;
  const { hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree } = n.empreintes;
  // ═══ L'INVARIANT : TOUT CE QUI CIRCULE SUR UNE ARÊTE EST À LA FRÉQUENCE DU PROJET ═══
  //
  // Point 5 d'une revue du dépôt. À LA SORTIE ET NON À L'ENTRÉE : une valeur lue par trois
  // nœuds serait sinon convertie trois fois, et son aperçu — celui qu'on écoute et qu'on
  // enregistre — ne serait à la bonne fréquence sur aucun des trois. Le domaine décide de
  // tout : ce qu'est une fréquence, laquelle est celle du projet, quel rééchantillonneur
  // l'applique. Gratuit dans le cas ordinaire, où il rend le même tableau.
  const valeurs = await p.questions().porterALaFrequenceDeTravail(res.valeurs as unknown[]);
  p.resultats.set(nodeId, valeurs);
  // CE QUE LES SORTIES HÉRITENT DES ENTRÉES, et que le calcul ne reproduit pas : côté audio,
  // la disposition des canaux. C'est ici, et seulement ici, que les entrées et les sorties
  // sont toutes deux sous la main — d'où la question posée depuis ce point du moteur.
  const entrantes = () => valeursEntrantes<unknown>(nodeId, p.aretes, p.resultats) as unknown[];
  p.questions().heriterDesEntrees(valeurs, entrantes());
  // DE COMBIEN CE NŒUD A CHANGÉ LE NIVEAU DE CE QU'IL A REÇU, porté sur le nœud à côté du
  // temps d'exécution. Ce que « niveau » veut dire appartient au domaine, et c'est lui qui
  // mesure ; le moteur ne sait que l'endroit où la question se pose.
  const ecart = p.questions().ecartNiveau(valeurs, entrantes());
  if (ecart !== undefined) p.ecartsParNoeud.set(nodeId, ecart);
  // ET LE GARDE DE L'INVARIANT : ce recensement a d'abord servi à mesurer avant de convertir,
  // il ne doit désormais PLUS JAMAIS PARLER — toute valeur posée dans les résultats est à la
  // fréquence du projet, donc aucun nœud n'en reçoit deux. S'il parle, la conversion n'a pas
  // eu lieu, et c'est l'unique symptôme qu'on en aurait.
  const melees = p.questions().frequencesMelees(entrantes()); if (melees.length) console.warn(`[frequence] ${nodeId}(${node.data.ficheId}) reçoit ${melees.join(" et ")} Hz : la conversion du moteur n'a pas eu lieu`);
  if (res.message) p.messages.set(nodeId, res.message);
  if (res.affichage) p.affichageParNoeud.set(nodeId, res.affichage);
  if (res.designe) p.designeParNoeud.set(nodeId, res.designe);
  if (res.moteur) p.demandesParNoeud.set(nodeId, res.moteur);
  // Un nœud qui A des sorties mais ne renvoie QUE des null n'a pas réussi (entrée manquante, pas
  // assez d'entrées, fichier absent…) : le marquer « erreur » (et donc le propager) au lieu de
  // « terminé ». Sinon un mélangeur en aval « aboutit » alors qu'aucun résultat n'a été produit.
  // …SAUF si la fiche déclare qu'une sortie nulle est un résultat valide (sortieNullePermise) :
  // « aucune note détectée » d'un transcripteur ou un nœud-frontière ne sont pas des échecs.
  const defRes = p.trouverDef(node.data.ficheId as string);
  if (estResultatEnErreur(defRes, res)) {
    p.noeudsEnErreur.add(nodeId);
    p.poserStatut(nodeId, "erreur", res.message);
    p.marquerMetaEnEchec(nodeId, node.data.ficheId as string);
    ajouterTemps(p, nodeId, performance.now() - n.debut);
  } else {
    const elapsed = performance.now() - n.debut;
    const { jeton } = p;
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
    if (!jeton?.perime()) p.ecrireCache(nodeId, { valeurs, message: res.message, affichage: res.affichage, designe: res.designe, hashParams, hashEntree: monHashEntree, hashSorties, hashValeursEntree, consulteSorties: aConsulteSesSorties(), tempsExecution: elapsed, empreinteBoucle: p.empreinteBoucle(nodeId) });
    else console.warn(`[cache] resultat perime ecarte : ${nodeId} (generation ${jeton.generation})`);
    // ═══ CE QUE LE COMPOSANT REND EST-IL DU TYPE QU'IL PROMET ? ═══
    //
    // Point 6 d'une revue du dépôt : rien ne le vérifiait. Le prédicat vit sur le TYPE DE FLUX, que
    // le domaine déclare ; le moteur ne fait que poser la question. Il RAPPORTE et ne refuse pas :
    // un écart est un défaut du composant, et refuser casserait le graphe de quelqu'un qui n'y peut
    // rien. Voir `core/types-au-port.ts`.
    signalerEcartsDeType(nodeId, String(node.data.ficheId), defRes?.sorties ?? [], valeurs, p.typeFlux);
    p.poserStatut(nodeId, "termine");
    ajouterTemps(p, nodeId, elapsed);
  }
}

/**
 * Range l'échec d'un nœud dont l'exécuteur, ou ce qui suit son retour, a levé.
 *
 * Spec §6.5 : toute exception d'un exécuteur est journalisée (`console.error`) ET remontée sur le nœud
 * (statut « erreur » et message). Une exception levée APRÈS une annulation n'arrive pas ici : le
 * crochet sort de sa boucle avant, sans marquer le nœud.
 */
export function enregistrerLEchec(n: NoeudQuiATourne, e: unknown, p: PretsDuRetour): void {
  const { id: nodeId, noeud: node } = n;
  const elapsed = performance.now() - n.debut;
  console.error(`[attic] Nœud « ${node.data.ficheId} » (id=${nodeId}) a échoué :`, e);
  p.noeudsEnErreur.add(nodeId);
  p.resultats.set(nodeId, [null]);
  const message = (e as { message?: unknown } | null | undefined)?.message;
  p.poserStatut(nodeId, "erreur", message ? String(message) : undefined);
  p.marquerMetaEnEchec(nodeId, node.data.ficheId as string);
  ajouterTemps(p, nodeId, elapsed);
}
