// audio/parfum.ts — Le vocabulaire des odeurs, et où chacune se tient dans l'espace des goûts.
//
// D'OÙ CELA VIENT. Crisinel et Spence (« A Fruity Note », Chemical Senses 37, 2012, p. 151-158) ont
// fait apparier des odeurs à des hauteurs et à des instruments. Les odeurs fruitées et les agrumes
// vont vers l'aigu, le musc, le café torréfié, la fumée et le chocolat noir vers le grave. CE QUI
// DÉCIDE DE L'APPARIEMENT EST L'AGRÉMENT ET LA COMPLEXITÉ DE L'ODEUR, ET NON SON INTENSITÉ — d'où
// l'intensité laissée neutre plus bas, qui n'est pas un oubli. L'appariement à un instrument n'était
// fiable que pour un quart environ des odeurs testées : le timbre proposé ici est donc un défaut, et
// non une correspondance établie.
//
// Les trois familles de timbre reprennent le vocabulaire partagé du timbre et de l'arôme —
// [brillant, frais, éthéré], [aigu, métallique], [plein, riche, chaud].
//
// CE QUE CE FICHIER NE PRÉTEND PAS ÊTRE, comme `gout.ts` : les auteurs n'ont pas publié de valeurs
// chiffrées par odeur. Le champ `publiee` dit, odeur par odeur, si l'article la nomme — les autres
// sont placées par leur famille, et se relisent comme telles.

import type { DimensionsGout } from "./gout";

export type FamilleTimbre = "clair" | "mordant" | "plein";

export interface Odeur {
  id: string;
  nom: string;
  nomEn: string;
  /** 0 très grave, 1 très aigu — la dimension « hauteur » de `gout.ts`. */
  registre: number;
  /** L'agrément, de 0 (déplaisant) à 1 (plaisant) : c'est lui qui porte la consonance. */
  agrement: number;
  /** La complexité, de 0 (simple) à 1 (composée) : c'est elle qui porte la vitesse. */
  complexite: number;
  timbre: FamilleTimbre;
  /** Vrai si l'article nomme cette odeur ; faux si elle est placée par sa famille. */
  publiee: boolean;
}

/** Les trois familles de timbre, et l'instrument General MIDI qui leur sert de défaut. */
export const TIMBRES: Record<FamilleTimbre, { programme: number; instrument: string; instrumentEn: string; mots: string; motsEn: string }> = {
  // Flûte : le souffle sans épaisseur, pour ce qui est dit brillant, frais ou éthéré.
  clair: { programme: 73, instrument: "flûte", instrumentEn: "flute",
    mots: "brillant, frais, éthéré", motsEn: "bright, fresh, ethereal" },
  // Hautbois : le nasal qui perce, pour ce qui est dit aigu ou métallique.
  mordant: { programme: 68, instrument: "hautbois", instrumentEn: "oboe",
    mots: "aigu, métallique", motsEn: "sharp, metallic" },
  // Violoncelle : le grave qui porte, pour ce qui est dit plein, riche ou chaud.
  plein: { programme: 42, instrument: "violoncelle", instrumentEn: "cello",
    mots: "plein, riche, chaud", motsEn: "full, rich, warm" },
};

/**
 * Les odeurs et leur place.
 *
 * L'ordre suit le registre, du plus aigu au plus grave : c'est l'axe que l'article établit, le seul
 * sur lequel ses résultats sont nets, et celui dans lequel la liste du nœud se présente.
 */
export const ODEURS: Odeur[] = [
  { id: "citron", nom: "citron", nomEn: "lemon", registre: 0.92, agrement: 0.75, complexite: 0.2, timbre: "clair", publiee: true },
  { id: "menthe", nom: "menthe", nomEn: "mint", registre: 0.88, agrement: 0.7, complexite: 0.25, timbre: "clair", publiee: true },
  { id: "orange-confite", nom: "orange confite", nomEn: "candied orange", registre: 0.82, agrement: 0.85, complexite: 0.4, timbre: "clair", publiee: true },
  { id: "iris", nom: "iris", nomEn: "iris", registre: 0.78, agrement: 0.8, complexite: 0.5, timbre: "clair", publiee: true },
  { id: "fraise", nom: "fraise", nomEn: "strawberry", registre: 0.72, agrement: 0.85, complexite: 0.3, timbre: "clair", publiee: false },
  { id: "rose", nom: "rose", nomEn: "rose", registre: 0.6, agrement: 0.85, complexite: 0.55, timbre: "clair", publiee: false },
  { id: "vanille", nom: "vanille", nomEn: "vanilla", registre: 0.5, agrement: 0.9, complexite: 0.3, timbre: "plein", publiee: false },
  { id: "chocolat-noir", nom: "chocolat noir", nomEn: "dark chocolate", registre: 0.28, agrement: 0.75, complexite: 0.7, timbre: "plein", publiee: true },
  { id: "cafe-torrefie", nom: "café torréfié", nomEn: "roasted coffee", registre: 0.2, agrement: 0.6, complexite: 0.8, timbre: "plein", publiee: true },
  { id: "musc", nom: "musc", nomEn: "musk", registre: 0.14, agrement: 0.5, complexite: 0.75, timbre: "plein", publiee: true },
  { id: "fumee", nom: "fumée", nomEn: "smoke", registre: 0.1, agrement: 0.3, complexite: 0.6, timbre: "mordant", publiee: true },
];

/** L'odeur d'un identifiant exact, ou rien. C'est par là que passe la liste déroulante du nœud. */
export function odeurParId(id: string): Odeur | undefined {
  return ODEURS.find((o) => o.id === id);
}

/**
 * L'odeur, placée dans l'espace à cinq dimensions de `gout.ts`.
 *
 * DEUX DIMENSIONS RESTENT AU MILIEU, ET C'EST VOULU. L'articulation, dont la littérature des odeurs
 * ne dit rien ; et l'intensité, dont elle dit précisément qu'elle ne décide PAS de l'appariement —
 * la placer d'après l'odeur serait donc contredire l'article dont on se sert. Elles se règlent à la
 * main sur le nœud, qui laisse la valeur neutre par défaut.
 */
export function pointDepuisParfum(o: Odeur): DimensionsGout {
  return {
    hauteur: o.registre,
    // L'agrément porte la consonance : c'est lui qui décide de l'appariement dans l'article.
    consonance: o.agrement,
    // La complexité porte la vitesse — notre lecture, et non un résultat publié : une odeur composée
    // demande plus d'événements pour se dire qu'une odeur simple.
    vitesse: 0.3 + 0.4 * o.complexite,
    articulation: 0.5,
    intensite: 0.5,
  };
}
