// ui/moteur/cache.ts — Le cache du moteur, derrière un objet qui dit ce qu'on lui fait.
//
// POURQUOI. Pièce P3a du plan de l'architecture par messages entre l'interface et le moteur. Le cache
// était une `Map` tenue par `App.tsx` et prêtée à quatorze fichiers de l'interface, qui y appelaient
// `get`, `set`, `delete` et `clear` chacun à sa façon : la remise à zéro y effaçait les internes d'un
// méta par une règle écrite à la main, `cle.split("::")[0]`, que personne d'autre ne connaissait. La
// frontière entre l'interface et le moteur ne peut pas passer au milieu d'une `Map` que tout le monde
// écrit. Cet objet nomme les gestes ; la pièce suivante les fera passer par des commandes.
//
// MÊMES OPÉRATIONS, DANS LE MÊME ORDRE. Chaque méthode fait ce que faisait l'appel qu'elle remplace :
// `oublier` efface les identifiants dans l'ordre où on les lui donne, comme les `delete` d'une boucle,
// et `oublierAvecMetas` parcourt les clés dans l'ordre de la `Map`, comme la remise à zéro le faisait.
// `entrees` rend la `Map` elle-même en lecture seule, pour ceux qui ne font que lire : les sauts de
// boucle, et l'écriture d'un paquet `.attic`.
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
   * suivant reprendre tout son contenu du cache.
   */
  oublierAvecMetas(ids: ReadonlySet<string>): void;
  vider(): void;
  taille(): number;
  /** Le cache tel qu'il est, en lecture seule. */
  entrees(): ReadonlyMap<string, EntreeDeCache>;
}

export function creerCacheDuMoteur(): CacheDuMoteur {
  const cache = new Map<string, EntreeDeCache>();
  return {
    lire: (id) => cache.get(id),
    ecrire: (id, entree) => { cache.set(id, entree); },
    oublier: (ids) => { for (const id of ids) cache.delete(id); },
    oublierAvecMetas: (ids) => {
      for (const cle of [...cache.keys()]) if (ids.has(cle.split("::")[0])) cache.delete(cle);
    },
    vider: () => { cache.clear(); },
    taille: () => cache.size,
    entrees: () => cache,
  };
}
