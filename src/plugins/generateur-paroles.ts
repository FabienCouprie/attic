// plugins/generateur-paroles.ts — Nœud « Générateur de paroles » :
// génère des paroles de chanson structurées (couplets, refrain, pont) à partir
// d'un thème, d'une émotion et d'une clé, sans IA — par templates + tirage
// aléatoire dans des dictionnaires de mots. Instantané, hors-ligne, reproductible.

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";

// PRNG déterministe
function mulberry32(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function piocher<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function piocherN<T>(arr: T[], n: number, rng: () => number): T[] {
  const copie = [...arr];
  const resultat: T[] = [];
  for (let i = 0; i < n && copie.length > 0; i++) {
    const idx = Math.floor(rng() * copie.length);
    resultat.push(copie.splice(idx, 1)[0]);
  }
  return resultat;
}

// Dictionnaires de mots par catégorie (FR + EN)
const MOTS: Record<string, Record<string, string[]>> = {
  fr: {
    sujets: ["je", "tu", "elle", "il", "nous", "vous", "le temps", "la nuit", "le vent", "la pluie", "le feu", "l'amour", "le ciel", "la mer", "le chemin", "la ville", "le rêve", "le silence", "le cœur", "l'ombre"],
    verbes: ["chante", "danse", "pleure", "rit", "court", "tombe", "vole", "brille", "part", "reste", "cherche", "trouve", "perd", "garde", "oublie", "rappelle", "attend", "fuit", "aimer", "brûle"],
    objets: ["la lumière", "le silence", "la douleur", "la joie", "le souvenir", "l'espoir", "la liberté", "le destin", "la vérité", "le mensonge", "l'instant", "l'éternité", "la route", "le matin", "le soir", "l'hiver", "l'été", "l'automne", "le printemps", "la lune"],
    adjectifs: ["belle", "triste", "lointain", "froid", "chaud", "doux", "amer", "lumineux", "sombre", "vide", "plein", "fragile", "fort", "libre", "perdu", "vivant", "éteint", "immortel", "profond", "léger"],
    lieux: ["dans la nuit", "sous la pluie", "au bord de la mer", "dans la ville", "sous les étoiles", "au bout du chemin", "dans le vent", "près du feu", "loin d'ici", "dans le silence", "au lever du jour", "au crépuscule", "dans les rues", "sur la colline", "dans le brouillard"],
    emotions: ["l'amour", "la peur", "la colère", "la tristesse", "la joie", "l'espoir", "le regret", "la nostalgie", "le désir", "la liberté", "le doute", "la foi", "la douleur", "la paix", "la passion"],
    connectors: ["et", "mais", "puis", "quand", "où", "comme", "sans", "avec", "pour", "dans"],
  },
  en: {
    sujets: ["I", "you", "she", "he", "we", "the time", "the night", "the wind", "the rain", "the fire", "love", "the sky", "the sea", "the road", "the city", "the dream", "silence", "the heart", "the shadow", "the light"],
    verbes: ["sings", "dances", "cries", "laughs", "runs", "falls", "flies", "shines", "leaves", "stays", "searches", "finds", "loses", "keeps", "forgets", "remembers", "waits", "escapes", "burns", "fades"],
    objets: ["the light", "the silence", "the pain", "the joy", "the memory", "the hope", "freedom", "destiny", "the truth", "the lie", "the moment", "eternity", "the road", "the morning", "the evening", "winter", "summer", "autumn", "spring", "the moon"],
    adjectifs: ["beautiful", "sad", "distant", "cold", "warm", "sweet", "bitter", "bright", "dark", "empty", "full", "fragile", "strong", "free", "lost", "alive", "gone", "immortal", "deep", "light"],
    lieux: ["in the night", "in the rain", "by the sea", "in the city", "under the stars", "at the end of the road", "in the wind", "by the fire", "far from here", "in silence", "at dawn", "at dusk", "in the streets", "on the hill", "in the fog"],
    emotions: ["love", "fear", "anger", "sorrow", "joy", "hope", "regret", "nostalgia", "desire", "freedom", "doubt", "faith", "pain", "peace", "passion"],
    connectors: ["and", "but", "then", "when", "where", "like", "without", "with", "for", "in"],
  },
};

// Modèles de lignes (placeholders: S=sujet, V=verbe, O=objet, A=adjectif, L=lieu, E=émotion, C=connecteur)
const MODELES_LIGNES: string[] = [
  "{S} {V} {O}",
  "{S} {V} {L}",
  "{A} {O}",
  "{S} {V} {A} {O}",
  "{C} {S} {V} {O}",
  "{S} {C} {O} {V}",
  "{A} comme {O}",
  "{S} {V} pour {E}",
  "{L}, {S} {V}",
  "{S} cherche {E} {L}",
  "{C} {L} {S} {V}",
  "{S} {V}, {S} {V} encore",
];

// Structures de chanson
const STRUCTURES = [
  ["Couplet 1", "Couplet 1", "Refrain", "Couplet 2", "Couplet 2", "Refrain", "Pont", "Refrain"],
  ["Couplet 1", "Refrain", "Couplet 2", "Refrain", "Pont", "Refrain", "Refrain"],
  ["Couplet 1", "Couplet 1", "Refrain", "Couplet 2", "Refrain", "Outro"],
  ["Intro", "Couplet 1", "Refrain", "Couplet 2", "Refrain", "Pont", "Refrain", "Outro"],
];

function genererLigne(d: Record<string, string[]>, rng: () => number): string {
  const modele = piocher(MODELES_LIGNES, rng);
  return modele.replace(/\{(\w)\}/g, (_, key) => {
    const map: Record<string, string> = { S: "sujets", V: "verbes", O: "objets", A: "adjectifs", L: "lieux", E: "emotions", C: "connectors" };
    const cat = map[key];
    if (!cat || !d[cat]) return "?";
    return piocher(d[cat], rng);
  });
}

function genererParoles(
  theme: string,
  emotion: string,
  langue: "fr" | "en",
  graine: number,
  nbLignesParSection: number,
): string {
  const rng = mulberry32(graine > 0 ? graine : Math.floor(Math.random() * 99999) + 1);
  const d = MOTS[langue] ?? MOTS.fr;
  const structure = piocher(STRUCTURES, rng);

  // Mélanger le thème dans le dictionnaire
  const themeMot = theme.trim() || (langue === "en" ? "love" : "l'amour");
  const emotionMot = emotion.trim() || (langue === "en" ? "hope" : "l'espoir");
  d.sujets = [...d.sujets, themeMot];
  d.emotions = [...d.emotions, emotionMot];

  const fr = langue === "fr";
  const sections = new Set<string>();
  let resultat = "";

  for (let i = 0; i < structure.length; i++) {
    const section = structure[i];
    if (!sections.has(section)) {
      sections.add(section);
      resultat += `\n[${section}]\n`;
    }

    const nbLignes = section === "Refrain" ? Math.max(2, nbLignesParSection - 1) : nbLignesParSection;
    for (let l = 0; l < nbLignes; l++) {
      resultat += genererLigne(d, rng) + "\n";
    }
    if (i < structure.length - 1) resultat += "\n";
  }

  return resultat.trim();
}

export const fiches: PluginDef[] = ([
  {
    id: "generateur-paroles", nom: "Générateur de paroles", nomEn: "Lyrics Generator",
    univers: "Autres", famille: "Texte",
    resume: "Génère des paroles de chanson structurées (couplets, refrain, pont) sans IA.",
    resumeEn: "Generates structured song lyrics (verse, chorus, bridge) without AI.",
    entrees: [],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Thème", nomEn: "Theme", type: "texte", defaut: "l'amour",
        doc: "Thème principal de la chanson (ex : l'amour, la mer, la liberté).",
        docEn: "Main theme of the song (e.g. love, the sea, freedom)." },
      { nom: "Émotion", nomEn: "Emotion", type: "texte", defaut: "l'espoir",
        doc: "Émotion dominante (ex : l'espoir, la tristesse, la colère).",
        docEn: "Dominant emotion (e.g. hope, sadness, anger)." },
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: ["Français", "English"], optionsEn: ["Français", "English"],
        defaut: "Français",
        doc: "Langue des paroles générées.", docEn: "Language of generated lyrics." },
      { nom: "Lignes/section", nomEn: "Lines/section", plage: [2, 8], pas: 1, defaut: 4,
        doc: "Nombre de lignes par section (couplet, refrain).",
        docEn: "Number of lines per section (verse, chorus)." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouveau à chaque exécution). Même graine = mêmes paroles.",
        docEn: "Random seed (0 = new each run). Same seed = same lyrics." },
    ],
    async executer(ctx: any) {
      const theme = ctx.paramTexte("Thème", "l'amour");
      const emotion = ctx.paramTexte("Émotion", "l'espoir");
      const langueParam = ctx.paramTexte("Langue", "Français");
      const langue = langueParam === "English" ? "en" : "fr";
      const nbLignes = ctx.paramNombre("Lignes/section", 4);
      const graine = ctx.paramNombre("Graine", 0) || Math.floor(Math.random() * 99999) + 1;

      ctx.onProgress("Génération des paroles…");
      const paroles = genererParoles(theme, emotion, langue as "fr" | "en", graine, nbLignes);
      const graineAff = graine > 0 ? graine : "auto";

      return {
        valeurs: [paroles],
        message: `${langue === "fr" ? "Paroles générées" : "Lyrics generated"} · graine ${graineAff} · ${paroles.split("\n").length} lignes`,
      };
    },
  },
] as PluginDef[]).map(avecDoc);
