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
// POURQUOI ICI, ET NON DANS L'INTERFACE. Un changement de réglage est appliqué à DEUX endroits dans
// `App.tsx`. Une règle écrite dans l'interface y serait donc dupliquée, et une correction sur l'un
// des deux ne profiterait pas à l'autre : c'est exactement la modification incomplète qu'on cherche
// à rendre impossible. Elle est donc pure, testable, et appelée par les deux.

/** Le nombre de pas par seconde qui rend une suite visible ; les oscillateurs, eux, sont lents. */
export const FREQUENCE_PAS_PAR_SECONDE = 8;
export const FREQUENCE_CYCLES_PAR_SECONDE = 0.5;

/** Les formes du composant « Courbe » dont la fréquence compte des PAS et non des cycles. */
const FORMES_A_PAS = new Set(["logistique", "aleatoire"]);

const frequenceNaturelle = (forme: unknown): number =>
  FORMES_A_PAS.has(String(forme)) ? FREQUENCE_PAS_PAR_SECONDE : FREQUENCE_CYCLES_PAR_SECONDE;

/** Une liaison : changer `declencheur` sur `ficheId` ajuste `ajuste`. */
interface Liaison {
  ficheId: string;
  declencheur: string;
  ajuste: string;
  /** La valeur naturelle de `ajuste` pour une valeur donnée du déclencheur. */
  naturelle: (valeurDeclencheur: unknown) => number;
}

const LIAISONS: Liaison[] = [
  {
    ficheId: "generateur-courbe",
    declencheur: "Forme",
    ajuste: "Fréquence",
    naturelle: frequenceNaturelle,
  },
];

/**
 * Les réglages après un changement, liaisons appliquées.
 *
 * Rend un objet NEUF, jamais celui reçu. Sans liaison qui s'applique, il ne contient que le
 * changement demandé.
 */
export function reglagesApresChangement(
  ficheId: string,
  parametres: Readonly<Record<string, number | string>>,
  nom: string,
  valeur: number | string,
): Record<string, number | string> {
  const suite: Record<string, number | string> = { ...parametres, [nom]: valeur };
  for (const l of LIAISONS) {
    if (l.ficheId !== ficheId || l.declencheur !== nom) continue;
    const avant = parametres[l.declencheur];
    const actuelle = parametres[l.ajuste];
    // Une valeur choisie n'est pas touchée : on ne remplace que le défaut naturel de l'ancienne forme.
    if (typeof actuelle === "number" && actuelle !== l.naturelle(avant)) continue;
    suite[l.ajuste] = l.naturelle(valeur);
  }
  return suite;
}
