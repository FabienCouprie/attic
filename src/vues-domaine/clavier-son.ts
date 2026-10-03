// ui/clavier-son.ts — Comment le clavier du nœud doit sonner, ici et maintenant.
//
// Le nœud « Clavier mélodie » offre les paramètres « Synthèse » et « Instrument », et son
// exécution les respecte : la sortie audio est rendue au SoundFont quand on le demande.
// Le CLAVIER, lui, les ignorait : presser une touche — et le bouton « Rejouer » —
// passaient par un oscillateur triangle écrit en dur. On choisissait un piano de concert
// et l'on entendait un bip, jusqu'à ce que le graphe soit lancé.
//
// La décision vit ici, hors du composant, et vaut pour les deux : ce qu'on entend en
// jouant est ce que le nœud rendra.
import { decoderInstrumentSF2, normaliserModeSynthèse } from "../plugins/soundfontGlobal";

export type ModeRendu = "FM/Oscillateurs" | "SoundFont";

/**
 * Le mode de rendu effectif.
 *
 * « Automatique » suit la présence d'un SoundFont, comme à l'exécution. Mais « SoundFont »
 * demandé SANS fichier chargé retombe ici sur la synthèse interne, là où l'exécution lève
 * une erreur : un nœud qui refuse de s'exécuter se voit et s'explique, un clavier qui
 * devient muet sous les doigts ne s'explique pas.
 */
export function modeRenduClavier(
  parametres: Record<string, unknown> | undefined,
  sf2Presente: boolean,
): ModeRendu {
  const mode = normaliserModeSynthèse(String(parametres?.["Synthèse"] ?? "Automatique"));
  if (mode === "FM/Oscillateurs") return "FM/Oscillateurs";
  return sf2Presente ? "SoundFont" : "FM/Oscillateurs";
}

/** Programme et banque du SoundFont, tels que l'exécution les décode. */
export function instrumentClavier(parametres: Record<string, unknown> | undefined): {
  programme: number;
  banque: number;
} {
  const brut = Number(parametres?.["Instrument"] ?? 0);
  return decoderInstrumentSF2(Number.isFinite(brut) ? brut : 0);
}

/** Volume du nœud, en pour-cent, borné. */
export function volumeClavier(parametres: Record<string, unknown> | undefined): number {
  const v = Number(parametres?.["Volume"] ?? 80);
  if (!Number.isFinite(v)) return 80;
  return Math.max(0, Math.min(100, v));
}

/** Durée d'une note tenue au clavier, en secondes : de quoi laisser l'échantillon vivre. */
export const DUREE_NOTE_LIVE = 2.5;
