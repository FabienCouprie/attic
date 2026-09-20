// plugins/patrons-rythme.ts — Liste unique des patrons de batterie offerts par les nœuds.
//
// La Groove Box n'en proposait que dix, écrits à la main, quand la Boîte à rythmes en
// offrait cinquante-cinq — les mêmes, tirés du même PATRONS_RYTHME. Deux listes
// séparées veulent dire deux listes qui divergent : celle de la Groove Box n'avait
// jamais suivi les ajouts.
//
// Les noms des patrons sont des noms de genres, identiques dans les deux langues sauf
// quelques-uns (« Marche militaire », « Valse », « Pop ballade »). L'identifiant reste
// le nom français : c'est la clé de PATRONS_RYTHME et celle qu'un projet enregistré
// porte déjà.
import { PATRONS_RYTHME } from "../audio/generation";

export interface PatronRythme { id: string; fr: string; en: string }

export const PATRONS: PatronRythme[] = [
  { id: "Rock", fr: "Rock", en: "Rock" },
  { id: "Four-on-the-floor", fr: "Four-on-the-floor", en: "Four-on-the-floor" },
  { id: "Funk", fr: "Funk", en: "Funk" },
  { id: "Hip-hop", fr: "Hip-hop", en: "Hip-hop" },
  { id: "Jazz", fr: "Jazz", en: "Jazz" },
  { id: "Reggae", fr: "Reggae", en: "Reggae" },
  { id: "Samba", fr: "Samba", en: "Samba" },
  { id: "House", fr: "House", en: "House" },
  { id: "Techno", fr: "Techno", en: "Techno" },
  { id: "Drum & Bass", fr: "Drum & Bass", en: "Drum & Bass" },
  { id: "Trap", fr: "Trap", en: "Trap" },
  { id: "Disco", fr: "Disco", en: "Disco" },
  { id: "Ska", fr: "Ska", en: "Ska" },
  { id: "Bossa Nova", fr: "Bossa Nova", en: "Bossa Nova" },
  { id: "Tango", fr: "Tango", en: "Tango" },
  { id: "Calypso", fr: "Calypso", en: "Calypso" },
  { id: "Marche militaire", fr: "Marche militaire", en: "Military march" },
  { id: "Pop ballade", fr: "Pop ballade", en: "Pop ballad" },
  { id: "Pop dance", fr: "Pop dance", en: "Pop dance" },
  { id: "Pop latino", fr: "Pop latino", en: "Pop latin" },
  { id: "Pop folk", fr: "Pop folk", en: "Pop folk" },
  { id: "Pop R&B", fr: "Pop R&B", en: "Pop R&B" },
  { id: "Pop punk", fr: "Pop punk", en: "Pop punk" },
  { id: "Valse", fr: "Valse", en: "Waltz" },
  { id: "Bolero", fr: "Bolero", en: "Bolero" },
  { id: "Afrobeat", fr: "Afrobeat", en: "Afrobeat" },
  { id: "Rumba", fr: "Rumba", en: "Rumba" },
  { id: "Flamenco", fr: "Flamenco", en: "Flamenco" },
  { id: "Merengue", fr: "Merengue", en: "Merengue" },
  { id: "Breakbeat", fr: "Breakbeat", en: "Breakbeat" },
  { id: "Electro", fr: "Electro", en: "Electro" },
  { id: "Detroit techno", fr: "Detroit techno", en: "Detroit techno" },
  { id: "Minimal", fr: "Minimal", en: "Minimal" },
  { id: "Dubstep", fr: "Dubstep", en: "Dubstep" },
  { id: "Moombahton", fr: "Moombahton", en: "Moombahton" },
  { id: "Dembow", fr: "Dembow", en: "Dembow" },
  { id: "Reggaeton", fr: "Reggaeton", en: "Reggaeton" },
  { id: "Cumbia", fr: "Cumbia", en: "Cumbia" },
  { id: "Bachata", fr: "Bachata", en: "Bachata" },
  { id: "Blues shuffle", fr: "Blues shuffle", en: "Blues shuffle" },
  { id: "Gospel", fr: "Gospel", en: "Gospel" },
  { id: "Metal", fr: "Metal", en: "Metal" },
  { id: "Punk", fr: "Punk", en: "Punk" },
  { id: "Grunge", fr: "Grunge", en: "Grunge" },
  { id: "Trance", fr: "Trance", en: "Trance" },
  { id: "Hardstyle", fr: "Hardstyle", en: "Hardstyle" },
  { id: "Lo-fi hip hop", fr: "Lo-fi hip hop", en: "Lo-fi hip hop" },
  { id: "Boom bap", fr: "Boom bap", en: "Boom bap" },
  { id: "Drill", fr: "Drill", en: "Drill" },
  { id: "Trip hop", fr: "Trip hop", en: "Trip hop" },
  { id: "Amapiano", fr: "Amapiano", en: "Amapiano" },
  { id: "Salsa", fr: "Salsa", en: "Salsa" },
  { id: "Highlife", fr: "Highlife", en: "Highlife" },
  { id: "Baile funk", fr: "Baile funk", en: "Baile funk" },
  { id: "Tech house", fr: "Tech house", en: "Tech house" },
];

/**
 * Options d'un paramètre « choix », dans l'ordre de la liste.
 * `signature` restreint aux patrons qui savent jouer cette métrique : la Groove Box
 * travaille sur une grille de 16 pas en 4/4, et un patron qui n'a que du 3/4 — la
 * Valse, le Boléro — y retombait en silence sur un patron rock de secours.
 */
export function optionsPatrons(signature?: string): { options: string[]; optionsEn: string[]; optionIds: string[] } {
  const retenus = signature
    ? PATRONS.filter((p) => PATRONS_RYTHME[p.id]?.signatures.includes(signature))
    : PATRONS;
  return {
    options: retenus.map((p) => p.fr),
    optionsEn: retenus.map((p) => p.en),
    optionIds: retenus.map((p) => p.id),
  };
}
