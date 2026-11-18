// ui/moteur/commandes.ts — Ce que l'interface demande au cache du moteur, en commandes.
//
// POURQUOI. Pièce P3b du plan de l'architecture par messages entre l'interface et le moteur. La pièce
// d'avant a mis le cache derrière un objet qui nomme ses gestes ; mais cet objet restait prêté à
// treize fichiers de l'interface, qui l'appelaient chacun directement. L'interface ne tient plus
// l'objet : elle envoie une commande du protocole (`core/protocole-moteur.ts`), et c'est ce module
// qui l'applique au cache. Le moteur lui-même, la passe, ses pilotes et le ménage, garde l'objet.
//
// CINQ GENRES SUR LES SEPT DES COMMANDES, ceux qui touchent au cache. `lancer` et `arreter` sont au
// moteur depuis la pièce P5b, qui tient l'ordonnanceur et passe ici ce qui touche au cache
// (`moteur.ts`).
//
//   — `oublier` lâche des entrées, ou toutes : les médias, les zones, le SoundFont, Ctrl+Z, l'import,
//     les métas et l'inspecteur ;
//   — `regler` lâche l'entrée du nœud dont un réglage vient de changer. Sa remise à zéro, l'aval puis
//     lui-même, part ensuite en deux `remettreAZero` : c'est l'ordre d'avant ;
//   — `remettreAZero` lâche ces nœuds et les internes de leurs métas, par la règle du `::`. LA PASSE
//     EN COURS N'EST PAS ABATTUE ICI, mais par le moteur, juste avant (`moteur.ts`). `garder` ne sert
//     qu'aux résultats montrés, que l'interface efface elle-même : le cache n'en a pas l'usage ;
//   — `exporterCache` rend les entrées À L'INSTANT DE LA DEMANDE, en paires, ce qu'un paquet `.attic`
//     emporte ;
//   — `importerCache` range celles d'un paquet relu, dans leur ordre.
//
// LES RÈGLES DE TRANSPORT DU PROTOCOLE : l'envoi est synchrone, sans `queueMicrotask` ni
// `MessageChannel`, et `oublier` s'applique aussitôt, jamais mis en file. Une commande rendue a fait
// son effet.
import type { EntreeDeCache } from "../../core/cache-execution";
import type { CommandeAuMoteur, ParNoeud, ReponsesDuMoteur } from "../../core/protocole-moteur";
import { creerCacheDuMoteur, type CacheDuMoteur } from "./cache";

/** Les commandes qui touchent au cache : celles que ce module applique. */
export type CommandeDuCache = Extract<CommandeAuMoteur, { genre: "oublier" | "regler" | "remettreAZero" | "exporterCache" | "importerCache" }>;

/** Envoyer une commande au cache du moteur, de façon synchrone, et recevoir sa réponse. */
export type EnvoiDuCache = <C extends CommandeDuCache>(commande: C) => ReponsesDuMoteur[C["genre"]];

export interface MoteurDuCache {
  /** Ce que l'interface emploie, et rien d'autre. */
  envoyer: EnvoiDuCache;
  /** Le cache, pour le moteur seul : la passe, ses pilotes et le ménage. */
  cache: CacheDuMoteur;
}

/**
 * Ce que fait chaque genre.
 *
 * UNE TABLE PAR GENRE, ET LE COMPILATEUR L'EXIGE ENTIÈRE : un genre ajouté à `CommandeDuCache` sans
 * son entrée, ou une réponse d'un autre type que celle du protocole, fait tomber `tsc` ici même.
 */
const APPLIQUER: { [G in CommandeDuCache["genre"]]: (cache: CacheDuMoteur, c: Extract<CommandeDuCache, { genre: G }>) => ReponsesDuMoteur[G] } = {
  oublier: (cache, c) => { if (c.ids === "tout") cache.vider(); else cache.oublier(c.ids); },
  regler: (cache, c) => { cache.oublier([c.id]); },
  remettreAZero: (cache, c) => { cache.oublierAvecMetas(new Set(c.ids)); },
  exporterCache: (cache): ParNoeud<EntreeDeCache> => [...cache.entrees()],
  importerCache: (cache, c) => { for (const [id, entree] of c.entrees) cache.ecrire(id, entree); },
};

/**
 * Un cache neuf et la façon de lui parler. Un par fenêtre, tenu par le moteur (`moteur.ts`).
 *
 * LA CONVERSION NE DIT RIEN QUE LA TABLE NE GARANTISSE : chaque entrée y est typée par son genre, sa
 * commande et sa réponse. Ce que le compilateur ne sait pas suivre, c'est que `c.genre` choisit
 * l'entrée de la même commande ; la conversion le lui dit, sans rien élargir.
 */
export function creerMoteurDuCache(): MoteurDuCache {
  const cache = creerCacheDuMoteur();
  const envoyer: EnvoiDuCache = (c) => (APPLIQUER[c.genre] as (cache: CacheDuMoteur, c: CommandeDuCache) => never)(cache, c);
  return { envoyer, cache };
}
