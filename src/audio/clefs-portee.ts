// audio/clefs-portee.ts — Les clés d'une portée, déclarées une fois.
//
// POURQUOI CE MODULE EXISTE. Les trois portées VexFlow offraient chacune la liste « treble, bass,
// alto, tenor », écrite à la main, et sans identifiants : le nom anglais de VexFlow était le libellé,
// et un lecteur francophone voyait « treble » (passe de complétude, lot 3c, 2026-11-14).
//
// LES IDENTIFIANTS SONT LES NOMS DE VEXFLOW, parce que c'est ce que la gravure lui passe. Un projet
// qui a enregistré « treble » se relit donc tel quel : c'est désormais l'identifiant.

/** Les quatre clés, de la plus aiguë à la plus grave. */
export const CLEFS_PORTEE: { ids: string[]; fr: string[]; en: string[] } = {
  ids: ["treble", "bass", "alto", "tenor"],
  fr: ["Sol", "Fa", "Ut 3e ligne (alto)", "Ut 4e ligne (ténor)"],
  en: ["Treble", "Bass", "Alto", "Tenor"],
};

/** Les listes d'un réglage de clé de portée. */
export function choixClefPortee(): { options: string[]; optionsEn: string[]; optionIds: string[] } {
  return { options: [...CLEFS_PORTEE.fr], optionsEn: [...CLEFS_PORTEE.en], optionIds: [...CLEFS_PORTEE.ids] };
}
