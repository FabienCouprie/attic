// plugins/romains-hors-gamme.ts — Le refus d'un chiffre romain qui nomme un degré que la gamme n'a pas.
//
// QUATRE NŒUDS LISENT DES CHIFFRES ROMAINS DANS UNE GAMME DE LA TABLE depuis le 2026-11-23 : la
// Progression, la Grille d'accords, la Grille VexFlow et « Accords → Notation ». Une gamme de six
// degrés, la gamme par tons ou l'augmentée, n'a pas de VII : le chiffre se lit, la gamme ne le porte
// pas, et rien ne doit se jouer à sa place. Le refus est écrit une fois, ici, et non dans chaque nœud :
// deux copies d'un même message divergent.
import { langueCourante, traduire } from "../i18n";
import { gammeDe } from "../audio/gammes";
import { degresHorsGamme, type ModeProgression } from "../audio/theorie-romains";

/** Le nom d'une gamme dans la langue de l'interface. */
const nomDeGamme = (id: string): string => {
  const g = gammeDe(id);
  return g ? (langueCourante() === "en" ? g.en : g.fr) : id;
};

/**
 * Le retour d'un nœud qui refuse sa progression, ses `sorties` valeurs à null, quand un chiffre nomme
 * un degré que la gamme n'a pas ; null sinon.
 */
export function refusHorsGamme(tokens: readonly string[], gamme: ModeProgression, sorties: number) {
  const hors = degresHorsGamme(tokens, gamme);
  if (hors.length === 0) return null;
  return {
    valeurs: Array.from({ length: sorties }, () => null),
    erreur: true as const,
    message: traduire("msg.tonal.degres_hors_gamme_var_0_var_1", hors.slice(0, 4).join(" » « "), nomDeGamme(gamme)),
  };
}
