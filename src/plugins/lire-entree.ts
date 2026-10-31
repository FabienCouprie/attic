// plugins/lire-entree.ts — Le son sur une entrée, ou l'échec à rendre tel quel quand il n'y est pas.
//
// POURQUOI CE MODULE EXISTE, ET C'EST UN COMPTE QUI L'A RÉCLAMÉ. Cent trente exécuteurs commençaient
// par le même préambule, écrit à la main : lire l'entrée, vérifier `instanceof AudioBuffer`, et
// rendre un résultat vide. Relevé sur `src/plugins` le 2026-10-31 : deux cent cinquante occurrences
// dans cent vingt-trois fichiers, et le résultat vide y prenait dix-sept formes. Cinq clés de
// traduction disaient « pas d'entrée » en des mots différents, cinq fichiers tenaient chacun leur
// propre `sansEntree`, et `erreur: true` y figurait une fois sur trois.
//
// CE DERNIER POINT N'EST PAS UN DÉTAIL DE STYLE. Le contrat d'échec (`core/types.ts`, et
// PORTING-A-DOMAIN.md §4) dit qu'un exécuteur qui échoue DOIT le déclarer : le filet « tout-null »
// du moteur le rattrape sur un nœud qui a des sorties, mais ne porte aucun message, et ne couvre
// pas un nœud qui n'en a pas. Deux tiers des préambules comptaient donc sur le filet.
//
// IL N'Y A QU'UN MESSAGE, et il est celui qui existait déjà sous `msg.aucune_entr_e_audio`. Les
// autres disaient la même chose ; en garder plusieurs, c'était garder plusieurs endroits à traduire.

import { traduire } from "../i18n";

/** Le résultat qu'un exécuteur rend TEL QUEL quand l'entrée qu'il attendait n'est pas un son. */
export interface SansEntree {
  valeurs: null[];
  erreur: true;
  message: string;
}

/** Ce que cette lecture demande au contexte : n'importe quel exécuteur le lui fournit. */
interface LitUneEntree {
  entree: (rang: number) => unknown;
}

/**
 * Le son sur l'entrée `rang`, ou l'échec à rendre s'il n'y en a pas.
 *
 * S'ÉCRIT EN DEUX LIGNES, et la seconde ne décide rien :
 *
 *     const a = entreeAudio(ctx, 0);
 *     if (sansEntree(a)) return a;
 *
 * Le garde de type fait le reste : après la seconde ligne, `a` est un `AudioBuffer`.
 *
 * `sorties` EST LE NOMBRE DE SORTIES DE LA FICHE, une par défaut. Un résultat porte autant de
 * valeurs que la fiche déclare de sorties, même quand il échoue : six familles de tests le tiennent
 * en toutes lettres (« autant de valeurs que de sorties déclarées »), et l'aide ne connaît pas la
 * fiche qui l'appelle. Un composant à trois sorties écrit donc `entreeAudio(ctx, 0, { sorties: 3 })`.
 *
 * `message` NE SE DONNE QUE QUAND IL DIT PLUS QUE « pas d'entrée » : un composant à deux sons qui
 * nomme lequel manque (la piste, la zone traitée), et un test tient à ce qu'il ne les confonde pas.
 * Tout message qui redirait « pas d'entrée » en d'autres mots reste celui-ci.
 */
export function entreeAudio(ctx: LitUneEntree, rang = 0, options: { sorties?: number; message?: string } = {}): AudioBuffer | SansEntree {
  const v = ctx.entree(rang);
  if (v instanceof AudioBuffer) return v;
  const valeurs = Array.from({ length: options.sorties ?? 1 }, () => null);
  return { valeurs, erreur: true, message: options.message ?? traduire("msg.aucune_entr_e_audio") };
}

/** Vrai quand `entreeAudio` n'a pas trouvé de son : ce qu'elle a rendu se rend alors tel quel. */
export function sansEntree(v: AudioBuffer | SansEntree): v is SansEntree {
  return !(v instanceof AudioBuffer);
}
