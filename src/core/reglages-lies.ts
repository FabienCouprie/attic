// core/reglages-lies.ts — Quand changer un réglage doit en ajuster un autre.
//
// LE PROBLÈME, SIGNALÉ PAR FABIEN. Le composant « Courbe » porte un réglage « Fréquence » qui a DEUX
// sens : des cycles par seconde pour les oscillateurs, des pas par seconde pour la suite logistique
// et la marche aléatoire. Sa propre documentation le dit. Un seul défaut ne peut donc pas servir les
// deux : 0,5 est un bon oscillateur lent, et c'est un pas toutes les deux secondes pour la
// logistique. Mesuré sur les défauts de la fiche, la courbe contenait **cinq paliers sur dix
// secondes** — une suite logistique juste, mais qui ne se lit pas comme telle.
//
// POURQUOI UN DÉFAUT DÉCLARÉ NE SUFFIT PAS. La création d'un nœud recopie les défauts dans ses
// données : le réglage n'est donc jamais absent au moment de l'exécution, et un défaut ne peut pas
// dépendre d'un autre réglage. Il faut agir au moment où la forme change.
//
// LA RÈGLE NE SURPRENDRA PAS, et c'est sa seule condition d'acceptabilité : un réglage que
// l'utilisateur a choisi n'est JAMAIS réécrit. Seule une valeur restée au défaut naturel de
// l'ancienne forme prend le défaut naturel de la nouvelle. Qui a mis 3 Hz garde 3 Hz.
//
// LA RÈGLE EST ICI, SON CONTENU SUR LA FICHE, depuis le 2026-11-21. Le cœur tenait la liaison
// elle-même : l'identifiant de « Courbe », ses deux réglages et ses deux formes à pas. C'était une
// règle d'un seul composant du domaine, écrite dans le cœur. Le réglage la déclare maintenant,
// `defautSelon` (`core/types.ts`), et ce module la lit sur la fiche qu'on lui passe. Son seul
// appelant est `ui/hooks/useRelanceApresReglage.ts`, par où passe tout changement de réglage.
import type { ParametreDef } from "./types";

/** Ce que la règle lit d'une fiche : ses réglages, leur défaut et ce que chacun déclare dépendre d'un autre. */
export type FicheDeReglages = { parametres: readonly Pick<ParametreDef, "nom" | "defaut" | "defautSelon">[] } | undefined;

/**
 * Les réglages après un changement, liaisons de la fiche appliquées.
 *
 * Rend un objet NEUF, jamais celui reçu. Sans liaison qui s'applique, il ne contient que le
 * changement demandé.
 */
export function reglagesApresChangement(
  fiche: FicheDeReglages,
  parametres: Readonly<Record<string, number | string>>,
  nom: string,
  valeur: number | string,
): Record<string, number | string> {
  const suite: Record<string, number | string> = { ...parametres, [nom]: valeur };
  for (const p of fiche?.parametres ?? []) {
    const lie = p.defautSelon;
    if (!lie || lie.reglage !== nom) continue;
    // Une clé se lit sur l'objet déclaré lui-même : `constructor` ou `toString` ne sont pas des valeurs.
    // Le défaut garde son type : un nombre pour un réglage chiffré, un texte pour une progression.
    const defaut = typeof p.defaut === "string" ? p.defaut : Number(p.defaut);
    const naturelle = (v: unknown): number | string =>
      (Object.hasOwn(lie.valeurs, String(v)) ? lie.valeurs[String(v)] : defaut);
    const actuelle = parametres[p.nom];
    // Une valeur choisie n'est pas touchée : on ne remplace que le défaut naturel de l'ancienne valeur.
    if (actuelle !== undefined && actuelle !== naturelle(parametres[nom])) continue;
    suite[p.nom] = naturelle(valeur);
  }
  return suite;
}
