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
  /**
   * Deux SOUS-TYPES de ce flux vont-ils ensemble ? Sans règle déclarée, ils vont tous ensemble.
   *
   * POURQUOI LE CŒUR N'EN SAIT RIEN DE PLUS. `PortDef.sousType` est une chaîne que le domaine
   * remplit ; le cœur ne l'a jamais lue, et il ne la lit toujours pas. Ce qu'il tient ici est un
   * emplacement pour la règle, que le domaine fournit en fermeture : le vocabulaire reste chez
   * lui, comme la couleur et la forme.
   *
   * UN TYPE DE TRANSPORT NE DIT PAS LE CONTENU, et c'est ce que cet emplacement répare. Un plan de
   * chanson, une notation, un prompt et une transcription sont tous du « texte » : le graphe
   * autorisait les trente combinaisons, et six voulaient dire quelque chose.
   */
  sousTypesCompatibles?: (sousTypeSource: string | undefined, sousTypeCible: string | undefined) => boolean;
}
