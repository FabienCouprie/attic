// audio/facons-accord.ts — La façon de jouer un accord, déclarée une fois.
//
// POURQUOI CE MODULE EXISTE. Huit composants offrent de jouer un accord plaqué ou arpégé, et chacun
// l'écrivait à sa façon : `plaque` ici, `block` et `bloc` là, `harmonie` chez trois autres, `arpege`,
// `arpeggio` et `arpeges`, `Polyphonie` et `Arpège` en toutes lettres chez l'automate cellulaire. Six
// écritures pour trois choses (passe de complétude, lot 3c, 2026-11-14).
//
// LA TABLE EST CELLE DES ACCORDS JOUÉS, les seuls à offrir les trois façons, dont `jouerAccord`
// (`audio/qualites-accords.ts`) donne le calcul.
//
// « MÉLODIE » N'EN EST PAS UNE : trois composants à couleurs et l'automate l'offrent à côté, pour une
// note à la fois. C'est leur sentinelle, que le registre des nomenclatures déclare.

/** Les trois façons, dans l'ordre des accords joués. */
export const FACONS_ACCORD = {
  ids: ["plaque", "arpege", "roule"] as const,
  fr: ["Plaqué", "Arpégé", "Roulé"],
  en: ["Block", "Arpeggiated", "Rolled"],
};

export type FaconAccord = (typeof FACONS_ACCORD.ids)[number];

/**
 * Les écritures qu'un projet enregistré peut porter, identifiants et libellés d'avant.
 *
 * « STRUCK » était le libellé anglais des accords joués ; « Block » le remplace, le mot que l'anglais
 * emploie pour un accord plaqué, et que deux autres composants affichaient déjà.
 */
export const LIBELLES_HERITES_FACONS: Record<string, FaconAccord> = {
  "block": "plaque", "Block": "plaque", "bloc": "plaque", "Bloc": "plaque",
  "harmonie": "plaque", "Harmonie": "plaque", "Harmony": "plaque", "Struck": "plaque",
  "Polyphonie": "plaque", "Polyphony": "plaque",
  "arpeggio": "arpege", "Arpeggio": "arpege", "Arpège": "arpege",
  "arpeges": "arpege", "Arpèges": "arpege", "Arpeggios": "arpege",
};

/** Les listes d'un réglage de façon, pour les façons demandées, dans l'ordre de la table. */
export function choixFaconAccord(ids: readonly FaconAccord[] = FACONS_ACCORD.ids): {
  options: string[]; optionsEn: string[]; optionIds: FaconAccord[]; optionsHeritees: Record<string, string>;
} {
  const rangs = FACONS_ACCORD.ids.flatMap((id, i) => (ids.includes(id) ? [i] : []));
  if (rangs.length !== ids.length) throw new Error(`façon inconnue parmi : ${ids.join(", ")}`);
  return {
    options: rangs.map((i) => FACONS_ACCORD.fr[i]),
    optionsEn: rangs.map((i) => FACONS_ACCORD.en[i]),
    optionIds: rangs.map((i) => FACONS_ACCORD.ids[i]),
    optionsHeritees: { ...LIBELLES_HERITES_FACONS },
  };
}

/**
 * Les listes d'un réglage qui offre aussi « Mélodie », une note à la fois, au rang que le composant
 * lui donnait : en tête chez les trois composants à couleurs, au milieu chez l'automate cellulaire.
 */
export function choixFaconOuMelodie(ids: readonly FaconAccord[], rangMelodie = 0): {
  options: string[]; optionsEn: string[]; optionIds: string[]; optionsHeritees: Record<string, string>;
} {
  const c = choixFaconAccord(ids);
  const poser = (l: readonly string[], m: string) => [...l.slice(0, rangMelodie), m, ...l.slice(rangMelodie)];
  return {
    options: poser(c.options, "Mélodie"),
    optionsEn: poser(c.optionsEn, "Melody"),
    optionIds: poser(c.optionIds, "melodie"),
    optionsHeritees: { ...c.optionsHeritees, "Mélodie": "melodie", "Melody": "melodie" },
  };
}

/**
 * La façon d'une valeur reçue, sous n'importe laquelle de ses écritures, ou `undefined` : une
 * sentinelle comme « Mélodie » n'en est pas une.
 *
 * UNE FONCTION, ET NON LA RECHERCHE D'UN MORCEAU DE MOT : trois composants reconnaissaient
 * l'harmonie à ce que sa valeur contenait « harm ». Devenue `plaque`, elle ne le contient plus, et la
 * recherche l'aurait prise pour une mélodie sans que rien ne le dise.
 */
export function faconDe(valeur: unknown): FaconAccord | undefined {
  const v = String(valeur).trim();
  const ids = FACONS_ACCORD.ids as readonly string[];
  if (ids.includes(v)) return v as FaconAccord;
  const rang = Math.max(FACONS_ACCORD.fr.indexOf(v), FACONS_ACCORD.en.indexOf(v));
  if (rang >= 0) return FACONS_ACCORD.ids[rang];
  return LIBELLES_HERITES_FACONS[v];
}
