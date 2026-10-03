// core/typesFlux.ts — Interface du type de flux (couleur, forme et règle de compatibilité).
//
// Le Map des types de flux vit désormais dans le registre (creerRegistre),
// cloisonné par domaine. Cette interface est la seule chose qui reste partagée.

/**
 * La forme du point qui marque un port.
 *
 * POURQUOI UNE FORME EN PLUS D'UNE COULEUR, demandé par Fabien : « les ports spectrogrammes et les
 * ports sons sont de la même couleur, très proche pour un œil humain serait plus exact ; nous
 * manquons déjà de couleur, je recommanderais tout simplement de changer la forme du port ».
 *
 * IL AVAIT RAISON, ET LA MESURE LE DIT. Les écarts de couleur du dépôt étaient relevés avec la
 * formule de 1976, qui surestime la distance des couleurs saturées. Reprise avec la CIEDE2000, qui
 * existe précisément pour corriger cela, la paire audio/spectrogramme tombe de 42,5 à **19,0**, et
 * la palette entière se resserre : midi/banque passe de 22,3 à 8,3. Une couleur de plus ne réglait
 * donc rien ; une forme règle tout, et elle multiplie ce qu'on peut distinguer au lieu de puiser
 * dans ce qui reste.
 */
export type FormePort = "rond" | "carre" | "losange";

export interface TypeFlux {
  id: string;
  couleur: string;
  /** La forme du point. Ronde par défaut, comme tous les ports l'étaient. */
  forme?: FormePort;
  libelle?: string;
  compatible?: (cibleId: string) => boolean;
}
