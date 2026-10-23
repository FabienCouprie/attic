// core/oui-non.ts — La paire oui/non, déclarée une fois.
//
// POURQUOI CE MODULE EXISTE. Trente-huit réglages du parc offrent un oui ou un non, sous six
// formes au registre des nomenclatures. C'est le concept le plus partagé du catalogue, et le plus
// recopié : chacun écrivait sa paire à la main.
//
// CINQ RÉGLAGES ENREGISTRAIENT `yes` ET `no` quand trente et un enregistraient `oui` et `non`.
// Les degrés de l'affaire sont nuls, un booléen restant un booléen ; ce qui divergeait, c'est ce
// qu'un projet POSE dans son fichier, et deux vocabulaires pour deux valeurs est exactement ce
// qu'un registre de nomenclatures existe pour signaler.
//
// L'ORDRE EST UNE DONNÉE, ET NON UN GOÛT. Vingt et un réglages offrent « Oui » d'abord, dix
// offrent « Non » d'abord, et ce n'est pas une divergence à corriger : la valeur enregistrée dans
// un projet se résout PAR LA POSITION, donc retourner une liste ferait qu'un projet rouvert
// répondrait le contraire de ce qu'il disait. Les deux ordres sont donc offerts ici, et le choix
// appartient au composant : celui qui met « Non » d'abord a son défaut à non.

export type OuiNon = "oui" | "non";

/** La paire, dans l'ordre canonique. */
export const OUI_NON: { ids: OuiNon[]; fr: string[]; en: string[] } = {
  ids: ["oui", "non"],
  fr: ["Oui", "Non"],
  en: ["Yes", "No"],
};

/**
 * Les trois listes d'un réglage oui/non, dans l'ordre demandé.
 *
 * `premier` est la valeur qui s'affiche en tête, et c'est elle que le composant prend pour défaut.
 */
export function choixOuiNon(premier: OuiNon = "oui"): { options: string[]; optionsEn: string[]; optionIds: OuiNon[] } {
  const rangs = premier === "oui" ? [0, 1] : [1, 0];
  return {
    options: rangs.map((i) => OUI_NON.fr[i]),
    optionsEn: rangs.map((i) => OUI_NON.en[i]),
    optionIds: rangs.map((i) => OUI_NON.ids[i]),
  };
}

/**
 * Ce que l'exécuteur demande : la valeur reçue vaut-elle oui ?
 *
 * POURQUOI UNE FONCTION, ET NON UNE COMPARAISON À LA MAIN. Cinq exécuteurs comparaient leur
 * réglage à la chaîne `"yes"`, parce que c'était l'identifiant de leur liste. Les identifiants du
 * parc étant désormais `oui` et `non`, chacune de ces comparaisons serait devenue
 * DÉFINITIVEMENT FAUSSE, et le réglage inerte sans que rien ne le dise. Une fonction qui lit
 * toutes les écritures, l'ancienne comme la neuve, ne peut pas se désaccorder de la table.
 *
 * ET LA CONVERSION DE LA VALEUR ENREGISTRÉE NE SUFFIT PAS À S'EN PASSER : elle a lieu à la lecture
 * du réglage, et un exécuteur peut recevoir une valeur qui n'y est pas passée.
 */
export function estOui(valeur: unknown): boolean {
  return LIBELLES_HERITES_OUI_NON[String(valeur).trim()] === "oui";
}

/**
 * Les écritures qu'un projet enregistré peut porter.
 *
 * TROIS COMPOSANTS POSAIENT `yes` ET `no`, et deux d'entre eux affichaient « oui » et « non » en
 * minuscules. Un quatrième n'avait pas de liste anglaise du tout. Rien de cela ne se devine : la
 * table le déclare, pour qu'un projet retrouve sa réponse.
 *
 * « On » ET « Off » Y SONT AUSSI : un composant les affiche en anglais pour un interrupteur, et un
 * projet enregistré sous cette forme doit se relire comme les autres.
 */
export const LIBELLES_HERITES_OUI_NON: Record<string, string> = {
  "yes": "oui", "no": "non",
  "Yes": "oui", "No": "non",
  "oui": "oui", "non": "non",
  "Oui": "oui", "Non": "non",
  "on": "oui", "off": "non",
  "On": "oui", "Off": "non",
};
