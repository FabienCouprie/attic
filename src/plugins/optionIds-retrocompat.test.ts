// plugins/optionIds-retrocompat.test.ts
// Verrouille la résolution des anciennes valeurs (FR/EN, pré-optionIds)
// vers les ids canoniques des paramètres "choix" ajoutés/étendus pendant
// la session Griffin-Lim/accords/gammes. Sans ce test, un futur renommage
// d'option casserait silencieusement d'anciens projets sauvegardés : la
// valeur resterait telle quelle (repli non canonisé de valeurCanoniqueChoix)
// et retomberait sur un défaut au lieu de l'option réellement voulue.
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { valeurCanoniqueChoix } from "../i18n";
import { normaliserModeSynthèse } from "./soundfontGlobal";
import { normaliserTimbre } from "../audio/automate-cellulaire";
import type { ParametreDef } from "../core/types";

function paramDe(nodeId: string, nomParam: string): ParametreDef {
  const fiche = registre.trouverDef(nodeId);
  if (!fiche) throw new Error(`Nœud introuvable dans le registre : ${nodeId}`);
  const p = fiche.parametres?.find((p) => p.nom === nomParam);
  if (!p) throw new Error(`Paramètre introuvable : ${nodeId}.${nomParam}`);
  return p;
}

interface Cas {
  node: string;
  param: string;
  ancienneValeur: string;
  idAttendu: string;
}

// Chaque cas correspond à une valeur qui existait AVANT l'ajout des
// optionIds (chaîne FR ou EN affichée à l'époque, potentiellement encore
// stockée dans un vieux projet .attic) et à l'id canonique vers lequel elle
// doit désormais résoudre.
const CAS: Cas[] = [
  // Oscillateur — Forme
  { node: "oscillateur", param: "Forme", ancienneValeur: "Sinus", idAttendu: "sine" },
  { node: "oscillateur", param: "Forme", ancienneValeur: "Carré", idAttendu: "square" },
  { node: "oscillateur", param: "Forme", ancienneValeur: "Dent de scie", idAttendu: "sawtooth" },
  { node: "oscillateur", param: "Forme", ancienneValeur: "Triangle", idAttendu: "triangle" },
  { node: "oscillateur", param: "Forme", ancienneValeur: "Sine", idAttendu: "sine" },
  { node: "oscillateur", param: "Forme", ancienneValeur: "Square", idAttendu: "square" },
  { node: "oscillateur", param: "Forme", ancienneValeur: "Sawtooth", idAttendu: "sawtooth" },

  // Générateur d'accords — Genre (le cas "hip-hop" avec tiret est celui qui
  // retombait silencieusement sur la progression "pop" avant le fix, et le
  // cas "Custom" est celui qui ne déclenchait jamais la progression
  // personnalisée en anglais).
  { node: "generateur-accords", param: "Genre", ancienneValeur: "hip-hop", idAttendu: "hiphop" },
  { node: "generateur-accords", param: "Genre", ancienneValeur: "Hip-hop", idAttendu: "hiphop" },
  { node: "generateur-accords", param: "Genre", ancienneValeur: "personnalisé", idAttendu: "custom" },
  { node: "generateur-accords", param: "Genre", ancienneValeur: "Custom", idAttendu: "custom" },
  { node: "generateur-accords", param: "Genre", ancienneValeur: "classique", idAttendu: "classique" },

  // Générateur d'accords — Gamme (seules majeur/mineur existaient avant)
  { node: "generateur-accords", param: "Gamme", ancienneValeur: "majeur", idAttendu: "majeur" },
  { node: "generateur-accords", param: "Gamme", ancienneValeur: "mineur", idAttendu: "mineur" },
  { node: "generateur-accords", param: "Gamme", ancienneValeur: "Major", idAttendu: "majeur" },
  { node: "generateur-accords", param: "Gamme", ancienneValeur: "minor", idAttendu: "mineur" },

  // Groove Box — Genre (déjà "hiphop" sans tiret avant le fix, mais
  // "personnalisé"/"Custom" avaient le même bug de comparaison figée en FR)
  { node: "boite-groove", param: "Genre", ancienneValeur: "hiphop", idAttendu: "hiphop" },
  { node: "boite-groove", param: "Genre", ancienneValeur: "personnalisé", idAttendu: "custom" },
  { node: "boite-groove", param: "Genre", ancienneValeur: "Custom", idAttendu: "custom" },

  // Groove Box — Gamme
  { node: "boite-groove", param: "Gamme", ancienneValeur: "majeur", idAttendu: "majeur" },
  { node: "boite-groove", param: "Gamme", ancienneValeur: "mineur", idAttendu: "mineur" },
  { node: "boite-groove", param: "Gamme", ancienneValeur: "major", idAttendu: "majeur" },
  { node: "boite-groove", param: "Gamme", ancienneValeur: "minor", idAttendu: "mineur" },

  // Mélodie aléatoire / Musique fractale / Sampler personnalisé — Gamme (5
  // anciennes options communes aux trois nœuds, dont Mineur harmonique qui
  // n'existe pas ailleurs dans l'app)
  ...(["melodie-aleatoire", "generateur-fractal", "sampler-personnalise"] as const).flatMap((node) => [
    { node, param: "Gamme", ancienneValeur: "Majeur", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "Mineur naturel", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "Mineur harmonique", idAttendu: "mineur-harmonique" },
    { node, param: "Gamme", ancienneValeur: "Pentatonique majeure", idAttendu: "pentatonique-majeure" },
    { node, param: "Gamme", ancienneValeur: "Pentatonique mineure", idAttendu: "pentatonique-mineure" },
    { node, param: "Gamme", ancienneValeur: "Major", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "Natural minor", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "Harmonic minor", idAttendu: "mineur-harmonique" },
    { node, param: "Gamme", ancienneValeur: "Major pentatonic", idAttendu: "pentatonique-majeure" },
    { node, param: "Gamme", ancienneValeur: "Minor pentatonic", idAttendu: "pentatonique-mineure" },
  ]),

  // Mappeur Mandelbrot / Arpège de Koch — Gamme (mêmes 6 anciennes options,
  // dont Chromatique déjà présente sur ces deux nœuds avant le fix).
  ...(["mappeur-mandelbrot", "arpege-koch"] as const).flatMap((node) => [
    { node, param: "Gamme", ancienneValeur: "Majeur", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "Mineur naturel", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "Mineur harmonique", idAttendu: "mineur-harmonique" },
    { node, param: "Gamme", ancienneValeur: "Pentatonique majeure", idAttendu: "pentatonique-majeure" },
    { node, param: "Gamme", ancienneValeur: "Pentatonique mineure", idAttendu: "pentatonique-mineure" },
    { node, param: "Gamme", ancienneValeur: "Chromatique", idAttendu: "chromatique" },
    { node, param: "Gamme", ancienneValeur: "Major", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "Harmonic minor", idAttendu: "mineur-harmonique" },
    { node, param: "Gamme", ancienneValeur: "Chromatic", idAttendu: "chromatique" },
  ]),

  // Automate cellulaire — Gamme : seulement 5 anciennes options (pas de
  // Mineur harmonique avant le fix).
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Majeur", idAttendu: "majeur" },
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Mineur naturel", idAttendu: "mineur" },
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Pentatonique majeure", idAttendu: "pentatonique-majeure" },
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Pentatonique mineure", idAttendu: "pentatonique-mineure" },
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Chromatique", idAttendu: "chromatique" },
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Major", idAttendu: "majeur" },
  { node: "automate-cellulaire", param: "Gamme", ancienneValeur: "Major pentatonic", idAttendu: "pentatonique-majeure" },

  // Dessin sonore / Palette harmonique / Color Looper — Gamme : les 3 nœuds
  // partageaient exactement les mêmes anciennes options (y compris la
  // coquille "chromatonic" côté anglais, volontairement préservée).
  ...(["dessin-sonore", "palette-harmonique", "color-looper"] as const).flatMap((node) => [
    { node, param: "Gamme", ancienneValeur: "majeur", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "mineur", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "pentatonique majeur", idAttendu: "pentatonique-majeure" },
    { node, param: "Gamme", ancienneValeur: "pentatonique mineur", idAttendu: "pentatonique-mineure" },
    { node, param: "Gamme", ancienneValeur: "blues", idAttendu: "blues" },
    { node, param: "Gamme", ancienneValeur: "chromatique", idAttendu: "chromatique" },
    { node, param: "Gamme", ancienneValeur: "major", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "minor", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "major pentatonic", idAttendu: "pentatonique-majeure" },
    { node, param: "Gamme", ancienneValeur: "minor pentatonic", idAttendu: "pentatonique-mineure" },
    { node, param: "Gamme", ancienneValeur: "chromatonic", idAttendu: "chromatique" },
  ]),

  // Séquenceur mélodique / Multi-réservoirs — Gamme : 5 anciennes options
  // (pas de chromatique).
  ...(["sequenceur-melodique", "multi-reservoirs"] as const).flatMap((node) => [
    { node, param: "Gamme", ancienneValeur: "majeur", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "mineur", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "pentatonique majeur", idAttendu: "pentatonique majeur" },
    { node, param: "Gamme", ancienneValeur: "pentatonique mineur", idAttendu: "pentatonique mineur" },
    { node, param: "Gamme", ancienneValeur: "blues", idAttendu: "blues" },
    { node, param: "Gamme", ancienneValeur: "major", idAttendu: "majeur" },
    { node, param: "Gamme", ancienneValeur: "minor", idAttendu: "mineur" },
    { node, param: "Gamme", ancienneValeur: "major pentatonic", idAttendu: "pentatonique majeur" },
    { node, param: "Gamme", ancienneValeur: "minor pentatonic", idAttendu: "pentatonique mineur" },
  ]),

  // Réservoir neuronal — Gamme : 6 anciennes options (avec chromatique).
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "majeur", idAttendu: "majeur" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "mineur", idAttendu: "mineur" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "pentatonique majeur", idAttendu: "pentatonique majeur" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "pentatonique mineur", idAttendu: "pentatonique mineur" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "blues", idAttendu: "blues" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "chromatique", idAttendu: "chromatique" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "major", idAttendu: "majeur" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "minor", idAttendu: "mineur" },
  { node: "reservoir-musical", param: "Gamme", ancienneValeur: "chromatic", idAttendu: "chromatique" },

  // « Synthèse » — paramètre partagé (PARAMETRE_SYNTHESE, soundfontGlobal.ts),
  // déclaré à l'identique sur une vingtaine de nœuds. Les projets enregistrés
  // avant l'ajout des optionIds stockent les libellés FR ou EN.
  { node: "sortie-midi", param: "Synthèse", ancienneValeur: "Automatique", idAttendu: "auto" },
  { node: "sortie-midi", param: "Synthèse", ancienneValeur: "Auto", idAttendu: "auto" },
  { node: "sortie-midi", param: "Synthèse", ancienneValeur: "FM/Oscillateurs", idAttendu: "fm" },
  { node: "sortie-midi", param: "Synthèse", ancienneValeur: "FM/Oscillators", idAttendu: "fm" },
  { node: "sortie-midi", param: "Synthèse", ancienneValeur: "SoundFont", idAttendu: "soundfont" },
  // Variante sans « Automatique » (PARAMETRE_SYNTHESE_SANS_AUTO).
  { node: "automate-cellulaire", param: "Synthèse", ancienneValeur: "FM/Oscillateurs", idAttendu: "fm" },
  { node: "automate-cellulaire", param: "Synthèse", ancienneValeur: "FM/Oscillators", idAttendu: "fm" },
  { node: "automate-cellulaire", param: "Synthèse", ancienneValeur: "SoundFont", idAttendu: "soundfont" },
  // Nœuds au format de déclaration différent, migrés dans le même lot.
  { node: "melodie-aleatoire", param: "Synthèse", ancienneValeur: "Auto", idAttendu: "auto" },
  { node: "generateur-fractal", param: "Synthèse", ancienneValeur: "FM/Oscillators", idAttendu: "fm" },
  { node: "clavier-melodie", param: "Synthèse", ancienneValeur: "SoundFont", idAttendu: "soundfont" },
];

describe("rétrocompatibilité des optionIds (anciens projets .attic)", () => {
  for (const { node, param, ancienneValeur, idAttendu } of CAS) {
    it(`${node}.${param} : "${ancienneValeur}" → "${idAttendu}"`, () => {
      const def = paramDe(node, param);
      expect(valeurCanoniqueChoix(def, ancienneValeur)).toBe(idAttendu);
    });
  }

  it("une valeur déjà canonique reste inchangée (idempotence)", () => {
    const def = paramDe("generateur-accords", "Genre");
    expect(valeurCanoniqueChoix(def, "custom")).toBe("custom");
    expect(valeurCanoniqueChoix(def, "hiphop")).toBe("hiphop");
  });
});

// Ajouter des optionIds ne suffit pas : le code qui CONSOMME le paramètre doit
// accepter l'id canonique, sinon `paramTexte` renvoie "fm" à un comparateur qui
// n'attend que "FM/Oscillateurs" et le nœud bascule silencieusement de moteur.
describe("les normaliseurs acceptent l'id canonique ET les anciens libellés", () => {
  it("normaliserModeSynthèse", () => {
    for (const v of ["auto", "Automatique", "Auto"]) {
      expect(normaliserModeSynthèse(v)).toBe("Automatique");
    }
    for (const v of ["fm", "FM/Oscillateurs", "FM/Oscillators"]) {
      expect(normaliserModeSynthèse(v)).toBe("FM/Oscillateurs");
    }
    for (const v of ["soundfont", "SoundFont"]) {
      expect(normaliserModeSynthèse(v)).toBe("SoundFont");
    }
  });

  it("normaliserTimbre (automate cellulaire)", () => {
    for (const v of ["fm", "FM/Oscillateurs", "FM/Oscillators"]) {
      expect(normaliserTimbre(v)).toBe("FM/Oscillateurs");
    }
    for (const v of ["soundfont", "SoundFont"]) {
      expect(normaliserTimbre(v)).toBe("SoundFont");
    }
  });
});
