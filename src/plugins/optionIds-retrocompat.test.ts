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
import { formeOndeDepuisTimbre, caractereTimbre } from "../audio/timbres";
import { cleCouleur } from "../audio/couleurs";
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

  // ── Lot 3 ──
  // « Timbre » caractère (Douce/Brillante/Percutante).
  ...(["generateur-fractal", "mappeur-mandelbrot", "arpege-koch"] as const).flatMap((node) => [
    { node, param: "Timbre", ancienneValeur: "Douce", idAttendu: "douce" },
    { node, param: "Timbre", ancienneValeur: "Soft", idAttendu: "douce" },
    { node, param: "Timbre", ancienneValeur: "Brillante", idAttendu: "brillante" },
    { node, param: "Timbre", ancienneValeur: "Bright", idAttendu: "brillante" },
    { node, param: "Timbre", ancienneValeur: "Percutante", idAttendu: "percutante" },
    { node, param: "Timbre", ancienneValeur: "Percussive", idAttendu: "percutante" },
  ]),
  // « Timbre » forme d'onde — mêmes ids que le paramètre « Forme » de
  // l'Oscillateur, migré précédemment (cohérence de tout le parc).
  ...(["reservoir-musical", "multi-reservoirs", "sequenceur-melodique"] as const).flatMap((node) => [
    { node, param: "Timbre", ancienneValeur: "Sinus", idAttendu: "sine" },
    { node, param: "Timbre", ancienneValeur: "Sine", idAttendu: "sine" },
    { node, param: "Timbre", ancienneValeur: "Carré", idAttendu: "square" },
    { node, param: "Timbre", ancienneValeur: "Square", idAttendu: "square" },
    { node, param: "Timbre", ancienneValeur: "Scie", idAttendu: "sawtooth" },
    { node, param: "Timbre", ancienneValeur: "Saw", idAttendu: "sawtooth" },
    { node, param: "Timbre", ancienneValeur: "Triangle", idAttendu: "triangle" },
  ]),
  // « Agrégation » — « Médiane » calculait en réalité une moyenne avant ce lot.
  ...(["centroide-spectral", "rms-meyda", "zcr-meyda", "rolloff-spectral-meyda"] as const).flatMap((node) => [
    { node, param: "Agrégation", ancienneValeur: "Moyenne", idAttendu: "moyenne" },
    { node, param: "Agrégation", ancienneValeur: "Average", idAttendu: "moyenne" },
    { node, param: "Agrégation", ancienneValeur: "Médiane", idAttendu: "mediane" },
    { node, param: "Agrégation", ancienneValeur: "Median", idAttendu: "mediane" },
    { node, param: "Agrégation", ancienneValeur: "Maximum", idAttendu: "maximum" },
  ]),
  // « Format » des quatre nœuds de listes textuelles.
  ...(["noms-instruments", "styles-musicaux", "emotions", "tessitures-voix"] as const).flatMap((node) => [
    { node, param: "Format", ancienneValeur: "Virgule", idAttendu: "virgule" },
    { node, param: "Format", ancienneValeur: "Comma", idAttendu: "virgule" },
    { node, param: "Format", ancienneValeur: "Retour ligne", idAttendu: "retour-ligne" },
    { node, param: "Format", ancienneValeur: "Newline", idAttendu: "retour-ligne" },
    { node, param: "Format", ancienneValeur: "Puces", idAttendu: "puces" },
    { node, param: "Format", ancienneValeur: "Bullets", idAttendu: "puces" },
  ]),

  // ── Lot 4 ──
  // « Mode » — les consommateurs testaient déjà par sous-chaîne (.includes("arp"))
  // donc restaient corrects en anglais ; les ids figent malgré tout l'identité.
  ...(["palette-harmonique", "dessin-sonore"] as const).flatMap((node) => [
    { node, param: "Mode", ancienneValeur: "Mélodie", idAttendu: "melodie" },
    { node, param: "Mode", ancienneValeur: "Melody", idAttendu: "melodie" },
    { node, param: "Mode", ancienneValeur: "Harmonie", idAttendu: "harmonie" },
    { node, param: "Mode", ancienneValeur: "Harmony", idAttendu: "harmonie" },
    { node, param: "Mode", ancienneValeur: "Arpège", idAttendu: "arpege" },
    { node, param: "Mode", ancienneValeur: "Arpeggio", idAttendu: "arpege" },
  ]),
  // Color Looper utilise le pluriel « Arpèges » — id distinct, volontairement.
  { node: "color-looper", param: "Mode", ancienneValeur: "Arpèges", idAttendu: "arpeges" },
  { node: "color-looper", param: "Mode", ancienneValeur: "Arpeggios", idAttendu: "arpeges" },

  // « Couleur » — c'est ce paramètre qui échouait sur « Couleur 1 inconnue : Blue ».
  { node: "couleur-suno-ia", param: "Couleur 1", ancienneValeur: "Bleu", idAttendu: "bleu" },
  { node: "couleur-suno-ia", param: "Couleur 1", ancienneValeur: "Blue", idAttendu: "bleu" },
  { node: "couleur-suno-ia", param: "Couleur 1", ancienneValeur: "Rouge", idAttendu: "rouge" },
  { node: "couleur-suno-ia", param: "Couleur 1", ancienneValeur: "Red", idAttendu: "rouge" },
  { node: "couleur-suno-ia", param: "Couleur 2", ancienneValeur: "(aucune)", idAttendu: "aucune" },
  { node: "couleur-suno-ia", param: "Couleur 2", ancienneValeur: "(none)", idAttendu: "aucune" },
  { node: "couleur-suno-ia", param: "Couleur 2", ancienneValeur: "Vert", idAttendu: "vert" },
  { node: "couleur-suno-ia", param: "Couleur 2", ancienneValeur: "Green", idAttendu: "vert" },

  // Bascules binaires du lecteur de collection (lues hors paramTexte, cf. vues.tsx).
  ...(["Lecture aléatoire", "Lecture en boucle"] as const).flatMap((param) => [
    { node: "collection-lecteur-musique", param, ancienneValeur: "Oui", idAttendu: "oui" },
    { node: "collection-lecteur-musique", param, ancienneValeur: "On", idAttendu: "oui" },
    { node: "collection-lecteur-musique", param, ancienneValeur: "Non", idAttendu: "non" },
    { node: "collection-lecteur-musique", param, ancienneValeur: "Off", idAttendu: "non" },
  ]),

  // Échelle des visualisations (également lue hors paramTexte).
  ...(["analyseur-spectre", "spectrogramme"] as const).flatMap((node) => [
    { node, param: "Échelle", ancienneValeur: "Logarithmique", idAttendu: "log" },
    { node, param: "Échelle", ancienneValeur: "Logarithmic", idAttendu: "log" },
    { node, param: "Échelle", ancienneValeur: "Linéaire", idAttendu: "lineaire" },
    { node, param: "Échelle", ancienneValeur: "Linear", idAttendu: "lineaire" },
  ]),
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

  it("formeOndeDepuisTimbre", () => {
    expect(["sine", "Sinus", "Sine"].map(formeOndeDepuisTimbre)).toEqual(["sine", "sine", "sine"]);
    expect(["square", "Carré", "Square"].map(formeOndeDepuisTimbre)).toEqual(["square", "square", "square"]);
    expect(["sawtooth", "Scie", "Saw"].map(formeOndeDepuisTimbre)).toEqual(["sawtooth", "sawtooth", "sawtooth"]);
    expect(["triangle", "Triangle"].map(formeOndeDepuisTimbre)).toEqual(["triangle", "triangle"]);
    // Valeur inconnue → undefined, pour que chaque nœud applique SON repli
    // (« triangle » sur le séquenceur, « sine » sur le réservoir).
    expect(formeOndeDepuisTimbre("n'importe quoi")).toBeUndefined();
  });

  // `cleCouleur` est le point de passage obligé des DEUX consommateurs du
  // paramètre Couleur : le plugin (profilCouleur) et la vue du nœud (pastilles
  // de couleur, qui indexe COULEURS). La vue lit `parametres` directement, sans
  // canonisation — après la migration elle recevait l'id « vert » et retombait
  // sur la couleur grise par défaut.
  it("cleCouleur (id, nom français, nom anglais)", () => {
    expect(["vert", "Vert", "green", "Green"].map(cleCouleur)).toEqual(["Vert", "Vert", "Vert", "Vert"]);
    expect(["bleu", "Bleu", "Blue"].map(cleCouleur)).toEqual(["Bleu", "Bleu", "Bleu"]);
    // « aucune » / « (aucune) » / « (none) » ne désignent aucune couleur.
    for (const v of ["aucune", "(aucune)", "(none)", "n'importe quoi"]) {
      expect(cleCouleur(v)).toBeNull();
    }
  });

  it("caractereTimbre", () => {
    expect(["douce", "Douce", "Soft"].map(caractereTimbre)).toEqual(["douce", "douce", "douce"]);
    expect(["brillante", "Brillante", "Bright"].map(caractereTimbre)).toEqual(["brillante", "brillante", "brillante"]);
    expect(["percutante", "Percutante", "Percussive"].map(caractereTimbre)).toEqual(["percutante", "percutante", "percutante"]);
    expect(caractereTimbre("inconnu")).toBe("douce");
  });
});
