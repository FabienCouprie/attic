// audio/automate-cellulaire-reglages.ts — Ce qu'un réglage veut dire, quelle que soit sa forme.
//
// POURQUOI CE MODULE. Sept fonctions ne font qu'une chose : ramener une valeur de réglage à sa forme
// canonique. Elles n'ont rien à voir avec l'automate lui-même, qui ne connaît que des cellules et
// des règles, et elles occupaient à elles seules un cinquième de son fichier.
//
// POURQUOI ELLES EXISTENT, ET QUE CE N'EST PAS DE LA DÉFENSE INUTILE. La même valeur arrive sous
// trois formes selon son chemin : l'identifiant canonique d'un `optionIds`, l'ancien libellé
// français, ou l'anglais. Un projet enregistré avant que les identifiants existent porte le libellé ;
// un appel direct depuis un test porte ce qu'on a tapé. Ces fonctions sont donc idempotentes sur la
// forme canonique et tolérantes sur les autres.
import type { Mapping, ModeVoix, Topologie } from "./automate-cellulaire";

export function normaliserTopologie(v: string): Topologie {
  const s = v.toLowerCase().replace(/\s+/g, " ");
  if (s.includes("highlife") || s.includes("high life")) return "2D Highlife";
  if (s.includes("conway") || s.includes("2d")) return "2D Conway";
  return "1D";
}

export function normaliserModeVoix(v: string): ModeVoix {
  const s = v.toLowerCase();
  if (s.includes("arp") || s.includes("arpège") || s.includes("arpegg")) return "Arpège";
  if (s.includes("mélodie") || s.includes("melody") || s.includes("lead")) return "Mélodie";
  return "Polyphonie";
}

export function normaliserMapping(v: string): Mapping {
  const s = v.toLowerCase();
  if (s.includes("durée") || s.includes("duration") || s.includes("longueur")) return "Durée";
  if (
    (s.includes("hauteur") || s.includes("pitch") || s.includes("note")) &&
    (s.includes("vélocité") || s.includes("velocity") || s.includes("intensité") || s.includes("+"))
  ) return "Hauteur + vélocité";
  if (s.includes("vélocité") || s.includes("velocity") || s.includes("intensité")) return "Vélocité";
  return "Hauteur";
}

export function normaliserMode(v: string): "Polyphonie" | "Mélodie" {
  if (v === "Mélodie" || v === "Melody" || v === "melody") return "Mélodie";
  return "Polyphonie";
}

export function normaliserCle(v: string): string {
  const map: Record<string, string> = {
    Do: "Do", C: "Do",
    "Do#": "Do#", "C#": "Do#",
    Ré: "Ré", D: "Ré",
    "Mi♭": "Mi♭", Eb: "Mi♭", "D#": "Mi♭",
    Mi: "Mi", E: "Mi",
    Fa: "Fa", F: "Fa",
    "Fa#": "Fa#", "F#": "Fa#",
    Sol: "Sol", G: "Sol",
    "Sol#": "Sol#", "G#": "Sol#",
    La: "La", A: "La",
    "Si♭": "Si♭", Bb: "Si♭", "A#": "Si♭",
    Si: "Si", B: "Si",
  };
  return map[v] ?? "Do";
}

// Retourne l'id canonique attendu par degresGammeMelodie (audio/generation.ts) —
// accepte indifféremment l'ancien libellé français, anglais, ou un id déjà
// canonique (le paramètre "Gamme" a des optionIds : ctx.paramTexte renvoie
// donc déjà l'id canonique la plupart du temps — cette fonction reste
// idempotente pour ce cas, et gère aussi les valeurs brutes des anciens
// projets ou des appels directs, ex. les tests).
export function normaliserGamme(v: string): string {
  const map: Record<string, string> = {
    Majeur: "majeur", Major: "majeur", majeur: "majeur",
    "Mineur naturel": "mineur", "Natural minor": "mineur", mineur: "mineur",
    "Mineur harmonique": "mineur-harmonique", "Harmonic minor": "mineur-harmonique", "mineur-harmonique": "mineur-harmonique",
    Dorien: "dorien", Dorian: "dorien", dorien: "dorien",
    Phrygien: "phrygien", Phrygian: "phrygien", phrygien: "phrygien",
    Lydien: "lydien", Lydian: "lydien", lydien: "lydien",
    Mixolydien: "mixolydien", Mixolydian: "mixolydien", mixolydien: "mixolydien",
    Locrien: "locrien", Locrian: "locrien", locrien: "locrien",
    "Pentatonique majeure": "pentatonique-majeure", "Major pentatonic": "pentatonique-majeure", "pentatonique-majeure": "pentatonique-majeure",
    "Pentatonique mineure": "pentatonique-mineure", "Minor pentatonic": "pentatonique-mineure", "pentatonique-mineure": "pentatonique-mineure",
    Chromatique: "chromatique", Chromatic: "chromatique", chromatique: "chromatique",
  };
  return map[v] ?? "pentatonique-majeure";
}

// Comparaison insensible à la casse : accepte l'id canonique ("fm"), les
// anciens libellés FR/EN ("FM/Oscillateurs", "FM/Oscillators") et tout ce qui
// mentionne FM/Osc. Sans le `toLowerCase()`, l'id "fm" ne correspondait à aucun
// motif et retombait à tort sur "SoundFont".
export function normaliserTimbre(v: string): "FM/Oscillateurs" | "SoundFont" {
  const s = v.trim().toLowerCase();
  if (s === "soundfont") return "SoundFont";
  if (s.includes("fm") || s.includes("osc")) return "FM/Oscillateurs";
  return "SoundFont";
}
