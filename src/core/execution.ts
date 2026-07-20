// core/execution.ts — Logique d'interprétation du résultat d'un plugin.
// Extraite du hook useExecutionGraphe pour la rendre testable et éviter que la
// règle « tout-null = échec » ne marque des états légitimes (transcripteur MIDI
// vide, nœuds-frontière) lorsqu'ils déclarent sortieNullePermise.
import type { PluginDef } from "./types";

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
