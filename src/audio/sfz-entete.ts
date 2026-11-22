// audio/sfz-entete.ts — Les lignes de commentaire en tête d'un .sfz exporté.
//
// Elles s'écrivaient en français, interface anglaise comprise : « // Banque de clavier exportée… »,
// « Touches couvertes ». Décision de Fabien du 2026-11-22, « The interface language », revue des
// notations en texte : l'en-tête suit la langue de l'interface, comme les commentaires des formules
// Csound.
import type { Banque } from "./clavier-banque";

/** L'en-tête d'une banque exportée : ce qu'elle est, ses zones, les touches qu'elle couvre. */
export function enteteSfz(banque: Banque, o: { nom?: string; en?: boolean } = {}): string[] {
  const nom = o.nom ? ` — ${o.nom}` : "";
  const couches = banque.couches && banque.couches > 1 ? banque.couches : 0;
  if (o.en) {
    return [
      `// Keyboard bank exported by Attic${nom}`,
      `// ${banque.zones.length} zones of ±${banque.largeur} semitones, root of the sound: ${banque.racineSource}`
        + (couches ? ` — ${couches} velocity layers` : ""),
      `// Keys covered: ${banque.noteBasse} to ${banque.noteHaute}`,
    ];
  }
  return [
    `// Banque de clavier exportée par Attic${nom}`,
    `// ${banque.zones.length} zones de ±${banque.largeur} demi-tons, racine du son : ${banque.racineSource}`
      + (couches ? ` — ${couches} couches de vélocité` : ""),
    `// Touches couvertes : ${banque.noteBasse} à ${banque.noteHaute}`,
  ];
}
