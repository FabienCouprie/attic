// audio/descripteurs-valeurs.ts — Les descripteurs de Meyda, trame par trame, sans un mot de texte.
//
// TIRÉ D'`analyse-descripteurs.ts` POUR PASSER HORS DU FIL, comme la mesure de l'analyse
// d'ensemble l'a été d'`analyse.ts` : ce module-là rédige avec `traduire`, qu'un worker ne doit
// pas atteindre. Ici, l'extraction et l'agrégation telles quelles, et la taille de fenêtre qu'elles
// prennent ; `analyse-descripteurs.ts` en garde les textes. L'extraction reçoit le son déjà mélangé
// en mono, que la page fabrique : un worker n'a pas de tampon audio.

import Meyda from "meyda";

export interface OptionsCentroidSpectral {
  fenetre?: number;
  pas?: number;
  aggregation?: "moyenne" | "mediane" | "maximum";
}

export type MeydaFeatureSimple =
  | "rms"
  | "zcr"
  | "spectralCentroid"
  | "spectralRolloff"
  | "spectralFlatness"
  | "spectralSpread"
  | "energy";

// LA TABLE DE L'ANALYSE S'ARRÊTE À 16 384, là où celle des effets temporels monte à 65 536. Les deux
// fonctions qui les parcourent portaient le même nom, `tailleFenetreAnalyse`, et rendaient pourtant
// des valeurs différentes au-delà de cette borne. Elles étaient privées chacune dans son fichier, ce
// qui cachait la confusion ; le découpage les a mises face à face dans le baril de `src/audio/`, et
// c'est ce qui l'a révélée. Celle-ci porte donc désormais le nom de ce qu'elle sert.
const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];

export function tailleFenetreAnalyse(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}

/** Un descripteur scalaire de Meyda sur chaque trame du mélange mono. */
export function extraireValeursMeyda(
  mono: Float32Array,
  sr: number,
  feature: MeydaFeatureSimple,
  options: OptionsCentroidSpectral = {},
): number[] {
  const fenetre = tailleFenetreAnalyse(options.fenetre || 2048);
  const pas = Math.max(64, options.pas || Math.floor(fenetre / 2));
  const length = mono.length;

  Meyda.sampleRate = sr;
  Meyda.bufferSize = fenetre;
  Meyda.windowingFunction = "hanning";

  const valeurs: number[] = [];
  for (let debut = 0; debut + fenetre <= length; debut += pas) {
    const frame = mono.slice(debut, debut + fenetre);
    const features = Meyda.extract(feature, frame);
    const val = typeof features === "number" ? features : (features as any)?.[feature];
    if (typeof val === "number" && Number.isFinite(val)) valeurs.push(val);
  }
  return valeurs;
}

/** Le centroïde de chaque trame, en hertz : Meyda le rend en indice de case. */
export function valeursCentroideHz(mono: Float32Array, sr: number, options: OptionsCentroidSpectral = {}): number[] {
  const fenetre = tailleFenetreAnalyse(options.fenetre || 2048);
  const facteurHz = sr / fenetre;
  return extraireValeursMeyda(mono, sr, "spectralCentroid", options).map((v) => v * facteurHz);
}

export function agregerValeurs(
  valeurs: number[],
  aggregation: OptionsCentroidSpectral["aggregation"] = "moyenne",
): number {
  if (valeurs.length === 0) return 0;
  switch (aggregation) {
    case "mediane": {
      const sorted = [...valeurs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case "maximum":
      return Math.max(...valeurs);
    case "moyenne":
    default:
      return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  }
}
