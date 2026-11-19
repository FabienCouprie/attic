// ui/moteur/cache.ts — Le cache du moteur, derrière un objet qui dit ce qu'on lui fait.
//
// POURQUOI. Pièce P3a du plan de l'architecture par messages entre l'interface et le moteur. Le cache
// était une `Map` tenue par `App.tsx` et prêtée à quatorze fichiers de l'interface, qui y appelaient
// `get`, `set`, `delete` et `clear` chacun à sa façon : la remise à zéro y effaçait les internes d'un
// méta par une règle écrite à la main, `cle.split("::")[0]`, que personne d'autre ne connaissait. La
// frontière entre l'interface et le moteur ne peut pas passer au milieu d'une `Map` que tout le monde
// écrit. Cet objet nomme les gestes ; depuis la pièce P3b, l'interface ne le tient plus et lui envoie
// des commandes (`ui/moteur/commandes.ts`), et seul le moteur l'appelle : `docs/frontiere-moteur.test.ts`.
//
// MÊMES OPÉRATIONS, DANS LE MÊME ORDRE. Chaque méthode fait ce que faisait l'appel qu'elle remplace :
// `oublier` efface les identifiants dans l'ordre où on les lui donne, comme les `delete` d'une boucle,
// et `oublierAvecMetas` parcourt les clés dans l'ordre de la `Map`, comme la remise à zéro le faisait.
// `entrees` rend la `Map` elle-même en lecture seule, pour ceux qui ne font que lire : les sauts de
// boucle, et l'écriture d'un paquet `.attic`.
//
// LES COPIES D'UNE BOUCLE OU D'UN INSTRUMENT PARTENT AVEC LE NŒUD QU'ON VOIT. Relevé le 2026-11-16 et
// vu dans l'application par `tests-e2e/copies-remises-a-zero-dans-application.spec.ts` : une copie
// est rangée sous `debut#k::corps` ou `fin@k::noeud`, et la règle du `::`, qui coupe la clé à son
// premier séparateur, n'y voyait que `debut#k` ou `fin@k`. Un ↺ sur le corps laissait ses copies en
// cache, et le Lancer suivant les resservait sans les calculer. Le nom ne se déduit pas de la clé :
// chaque passe RATTACHE ce qu'elle exécute au nœud visible qu'il sert, par la table que sa
// préparation a dressée (`expansions`), comme les statuts rattachent une ombre (`ui/statuts.ts`).
//
// SANS REACT, ET SYNCHRONE : il vivra du côté du moteur quand la frontière sera posée.
import type { EntreeDeCache } from "../../core/cache-execution";

export interface CacheDuMoteur {
  /** L'entrée d'un nœud exécuté, sous son identifiant aplati, ou rien. */
  lire(id: string): EntreeDeCache | undefined;
  ecrire(id: string, entree: EntreeDeCache): void;
  /** Efface ces identifiants, dans cet ordre. */
  oublier(ids: Iterable<string>): void;
  /**
   * Efface ces nœuds et tout ce qui s'exécute sous eux : un méta range ses internes sous
   * `méta::interne`, à toute profondeur, et n'effacer que l'identifiant visible laissait le run
   * suivant reprendre tout son contenu du cache. Et ce qu'une passe a rattaché à l'un d'eux : les
   * copies d'une boucle ou d'un instrument, que la règle du `::` ne voit pas.
   */
  oublierAvecMetas(ids: ReadonlySet<string>): void;
  /**
   * Rattache des identifiants exécutés au nœud visible qu'ils servent : les `expansions` d'une passe.
   * Un rattachement en remplace un plus ancien ; `vider` les efface tous.
   */
  rattacher(visibles: ReadonlyMap<string, string>): void;
  vider(): void;
  taille(): number;
  /** Le cache tel qu'il est, en lecture seule. */
  entrees(): ReadonlyMap<string, EntreeDeCache>;
}

export function creerCacheDuMoteur(): CacheDuMoteur {
  const cache = new Map<string, EntreeDeCache>();
  /** Le nœud visible que sert chaque identifiant exécuté, quand ce n'est pas lui-même. */
  const visibles = new Map<string, string>();
  return {
    lire: (id) => cache.get(id),
    ecrire: (id, entree) => { cache.set(id, entree); },
    oublier: (ids) => { for (const id of ids) cache.delete(id); },
    oublierAvecMetas: (ids) => {
      for (const cle of [...cache.keys()]) {
        const visible = visibles.get(cle);
        if (ids.has(cle.split("::")[0]) || (visible !== undefined && ids.has(visible))) cache.delete(cle);
      }
    },
    rattacher: (table) => { for (const [id, visible] of table) if (id !== visible) visibles.set(id, visible); },
    vider: () => { cache.clear(); visibles.clear(); },
    taille: () => cache.size,
    entrees: () => cache,
  };
}
