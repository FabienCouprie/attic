// core/contexte-essai.ts — Un contexte d'exécution d'essai, pour appeler un exécuteur au banc.
//
// POURQUOI IL EXISTE. Cent dix-sept fichiers de test fabriquaient chacun le leur, en une dizaine de
// lignes : `entree`, `entrees`, les deux lecteurs de réglage, un `onProgress` muet, un nœud vide.
// Relevé le 2026-10-31 : les mêmes dix lignes, à de petites variantes près — un `?? null` ici, un
// `Number()` là —, et chaque variante était une façon différente de s'éloigner du moteur réel.
//
// CE QU'IL IMITE, ET CE QU'IL N'IMITE PAS. Les deux lecteurs de réglage rendent ce qu'on leur a
// donné, converti au type demandé, et le défaut de l'appel sinon. Le moteur, lui, replie sur le
// défaut DÉCLARÉ par la fiche, canonise les choix et dérive les graines (`useExecutionGraphe.ts`) :
// un cas qui veut éprouver ces replis passe par un graphe, comme `core/boucle-graphe.test.ts`.
// Ceci sert à appeler UN exécuteur avec DES valeurs, et c'est tout ce que cent dix-sept cas faisaient.
//
// IL EST DANS LE CŒUR PARCE QU'IL NE SAIT RIEN DU DOMAINE : les valeurs y sont opaques, comme sur
// les arêtes. Le domaine nombre peut s'en servir autant que l'audio.

import type { ContexteExecution } from "./types";

export interface OptionsContexteDEssai<TRuntime> {
  /** L'identifiant du nœud ; « n1 » sinon. */
  id?: string;
  /** La fiche que le nœud porte ; « x » sinon, qui ne désigne rien. */
  ficheId?: string;
  /** Ce que `noeud.data` porte de plus que la fiche et les réglages : un fichier chargé, une saisie. */
  data?: Record<string, unknown>;
  runtime?: TRuntime;
  repertoireTravail?: string;
  onProgress?: (msg: string) => void;
  sortieBranchee?: (index: number) => boolean;
  signal?: AbortSignal;
}

/**
 * Un contexte qui sert `entrees` dans l'ordre et `reglages` par leur nom.
 *
 * `entree(rang)` rend `null` au-delà des entrées données, comme le moteur pour un port non branché ;
 * un cas qui veut voir un exécuteur sans rien passe donc un tableau vide.
 */
export function ctxDEssai<TValeur = unknown, TRuntime = null>(
  entrees: readonly (TValeur | null)[] = [],
  reglages: Record<string, number | string> = {},
  options: OptionsContexteDEssai<TRuntime> = {},
): ContexteExecution<TValeur, TRuntime> {
  const ctx: ContexteExecution<TValeur, TRuntime> = {
    noeud: { id: options.id ?? "n1", data: { ficheId: options.ficheId ?? "x", parametres: reglages, ...options.data } },
    runtime: (options.runtime ?? null) as TRuntime,
    repertoireTravail: options.repertoireTravail ?? "",
    entree: (rang) => (entrees[rang] ?? null) as TValeur,
    entrees: () => [...entrees],
    paramNombre: (nom, defaut) => (reglages[nom] === undefined ? defaut : Number(reglages[nom])),
    paramTexte: (nom, defaut) => (reglages[nom] === undefined ? defaut : String(reglages[nom])),
    onProgress: options.onProgress ?? (() => {}),
  };
  // Les deux champs facultatifs ne sont posés que s'ils sont donnés : un exécuteur qui demande
  // `"sortieBranchee" in ctx` doit voir la même chose que devant le moteur.
  if (options.sortieBranchee) ctx.sortieBranchee = options.sortieBranchee;
  if (options.signal) ctx.signal = options.signal;
  return ctx;
}
