// audio/listes-musicales.ts — Le seul lecteur des listes de hauteurs, de classes, d'intervalles et de rangs.
//
// LA REVUE DES NOTATIONS EN TEXTE, huitième format, 2026-11-22. Neuf nœuds lisaient une liste de
// nombres, par quatre lecteurs aux règles différentes. Mesuré par `executer` :
//   - « 0 3 7 10 », écrit avec des espaces, rendait une seule note dans la Musique fractale, et
//     « 60;64;67;72 » mettait les quatre voix du Canon sur do ;
//   - un jeton illisible était jeté sans un mot, et une liste toute illisible retombait sur do, sur
//     un cantus engendré, sur un tour complet ou sur du silence ;
//   - une hauteur MIDI de 200 s'écrivait dans le fichier, l'Accordage lisait « 1.5 » comme les rangs
//     1 et 5, et une espace de fin ajoutait un MIDI 0 au Rythme sur hauteurs.
//
// UNE LISTE SE LIT D'UNE SEULE FAÇON. Les jetons se séparent par espaces, virgules, points-virgules
// et retours à la ligne ; les espaces en tête et en fin ne comptent pas. Un jeton qui ne se lit pas,
// ou qui sort de la plage de son genre, fait refuser la liste, et le message le nomme.
//
// DÉCISIONS DE FABIEN DU 2026-11-22 :
//   - « Read them » : un nom de note se lit dans une liste de hauteurs, avec son octave, et dans une
//     liste de classes, avec ou sans elle, par le lecteur du septième format (`noms-de-notes.ts`) ;
//   - « Refuse them, named » : un intervalle au-delà de ±96 demi-tons, une classe hors de 0 à 11 ;
//   - « Refuse it, said » : une liste vide, quand la documentation de son réglage ne dit pas ce que
//     le vide veut dire. Celles qui le disent passent `videPermis`.

import { traduire } from "../i18n";
import { lireNomDeNote, midiDuNom } from "./noms-de-notes";

/**
 * - `hauteurs` : numéros MIDI de 0 à 127, décimales permises, ou noms de notes avec leur octave ;
 * - `classes` : classes de hauteurs de 0 à moins de 12, décimales permises, ou noms de notes ;
 * - `intervalles` : demi-tons de −96 à 96, décimales permises ;
 * - `degres` : rangs entiers de tout signe, ceux d'un accordage, qui franchissent la période ;
 * - `rangs` : rangs entiers à partir de 1, ceux des harmoniques.
 */
export type GenreDeListe = "hauteurs" | "classes" | "intervalles" | "degres" | "rangs";

const DANS: Record<GenreDeListe, (n: number) => boolean> = {
  hauteurs: (n) => n >= 0 && n <= 127,
  classes: (n) => n >= 0 && n < 12,
  intervalles: (n) => n >= -96 && n <= 96,
  degres: () => true,
  rangs: (n) => n >= 1,
};
const ENTIERS = new Set<GenreDeListe>(["degres", "rangs"]);
const NOMBRE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export type ListeLue = { valeurs: number[] } | { refus: string };

const cites = (jetons: string[]) => jetons.slice(0, 3).map((j) => `« ${j} »`).join(", ") + (jetons.length > 3 ? ", …" : "");

/** Les jetons d'une liste, sans les morceaux vides qu'une espace en tête ou en fin, ou une virgule seule, laisseraient. */
export const jetonsDeListe = (texte: string): string[] => texte.split(/[\s,;]+/).filter(Boolean);

/**
 * La liste écrite dans `texte`, lue selon son genre, ou son refus. `reglage` est le nom que le
 * message cite, celui du réglage ou de l'entrée qui porte la liste.
 */
export function lireListe(texte: string, genre: GenreDeListe, reglage: string, o: { videPermis?: boolean } = {}): ListeLue {
  const attendu = traduire(`msg.liste.attendu.${genre}`);
  const jetons = jetonsDeListe(texte);
  if (jetons.length === 0) return o.videPermis ? { valeurs: [] } : { refus: traduire("msg.liste.vide_var_0_var_1", reglage, attendu) };
  const valeurs: number[] = [];
  const illisibles: string[] = [], hors: string[] = [], nonEntiers: string[] = [], sansOctave: string[] = [];
  for (const j of jetons) {
    if (NOMBRE.test(j)) {
      const n = Number(j);
      if (ENTIERS.has(genre) && !Number.isInteger(n)) nonEntiers.push(j);
      else if (!DANS[genre](n)) hors.push(j);
      else valeurs.push(n);
      continue;
    }
    const nom = genre === "hauteurs" || genre === "classes" ? lireNomDeNote(j) : null;
    if (!nom) { illisibles.push(j); continue; }
    if (genre === "classes") { valeurs.push(nom.classe); continue; }
    const midi = midiDuNom(nom);
    if (midi === null) sansOctave.push(j);
    else if (!DANS.hauteurs(midi)) hors.push(j);
    else valeurs.push(midi);
  }
  const fautes = [
    illisibles.length ? traduire("msg.liste.illisibles_var_0", cites(illisibles)) : "",
    hors.length ? traduire("msg.liste.hors_var_0_var_1", cites(hors), traduire(`msg.liste.borne.${genre}`)) : "",
    nonEntiers.length ? traduire("msg.liste.non_entiers_var_0", cites(nonEntiers)) : "",
    sansOctave.length ? traduire("msg.liste.sans_octave_var_0", cites(sansOctave)) : "",
  ].filter(Boolean);
  return fautes.length ? { refus: traduire("msg.liste.refus_var_0_var_1_var_2", reglage, fautes.join(" ; "), attendu) } : { valeurs };
}
