// core/execution.ts — Logique d'interprétation du résultat d'un plugin.
// Extraite du hook useExecutionGraphe pour la rendre testable et éviter que la
// règle « tout-null = échec » ne marque des états légitimes (transcripteur MIDI
// vide, nœuds-frontière) lorsqu'ils déclarent sortieNullePermise.
//
// ET CE QU'UNE PASSE FAIT D'UN NŒUD AVANT DE L'EXÉCUTER, sorti d'`ui/hooks/useExecutionGraphe.ts`
// le 2026-11-11 à l'identique (pièce 1 du plan `work/plan-runtime-execution-2026-11-11.md`, qui sort
// du moteur la boucle nœud par nœud et l'amène ici). La décision rend un verdict ; c'est le moteur
// qui l'applique, aux tables, aux statuts et aux temps, comme il le faisait.
import type { PluginDef } from "./types";
import { peutReutiliserLeCache, sourceRetraitee, type CachePrecedent, type EmpreintesDuRun } from "./cache-execution";
import { empreinteEntrees, empreinteParametres, empreinteSorties, empreinteValeursEntrantes } from "./graphe";
import type { AreteG, NoeudG } from "./meta";
import { servicesDomaine } from "./services-domaine";

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
