// plugins/emotions.ts — Nœud « Émotions » : émet sur sa sortie texte une
// collection d'émotions humaines, filtrable par catégorie. Bilingue FR/EN.

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante, type Langue, traduire } from "../i18n";;

type Emotion = { fr: string; en: string };

export const EMOTIONS: Record<string, Emotion[]> = {
  "Joie/Bonheur": [
    { fr: "Joie", en: "Joy" }, { fr: "Bonheur", en: "Happiness" }, { fr: "Allégresse", en: "Gladness" },
    { fr: "Enthousiasme", en: "Enthusiasm" }, { fr: "Euphorie", en: "Euphoria" }, { fr: "Exaltation", en: "Exaltation" },
    { fr: "Ravissement", en: "Delight" }, { fr: "Satisfaction", en: "Satisfaction" }, { fr: "Fierté", en: "Pride" },
    { fr: "Sérénité", en: "Serenity" }, { fr: "Plaisir", en: "Pleasure" }, { fr: "Gaieté", en: "Cheerfulness" },
    { fr: "Optimisme", en: "Optimism" }, { fr: "Espoir", en: "Hope" }, { fr: "Gratitude", en: "Gratitude" },
    { fr: "Reconnaissance", en: "Appreciation" }, { fr: "Insouciance", en: "Carefreeness" },
    { fr: "Béatitude", en: "Bliss" }, { fr: "Ivresse", en: "Intoxication" }, { fr: "Triomphe", en: "Triumph" },
    { fr: "Soulagement", en: "Relief" }, { fr: "Amusement", en: "Amusement" }, { fr: "Gaudriole", en: "Hilarity" },
  ],
  "Tristesse/Mélancolie": [
    { fr: "Tristesse", en: "Sadness" }, { fr: "Chagrin", en: "Grief" }, { fr: "Mélancolie", en: "Melancholy" },
    { fr: "Déprime", en: "Depression" }, { fr: "Désespoir", en: "Despair" }, { fr: "Désolation", en: "Desolation" },
    { fr: "Nostalgie", en: "Nostalgia" }, { fr: "Regret", en: "Regret" }, { fr: "Remords", en: "Remorse" },
    { fr: "Culpabilité", en: "Guilt" }, { fr: "Honte", en: "Shame" }, { fr: "Humiliation", en: "Humiliation" },
    { fr: "Solitude", en: "Loneliness" }, { fr: "Abattement", en: "Dejection" }, { fr: "Morne", en: "Gloom" },
    { fr: "Affliction", en: "Sorrow" }, { fr: "Découragement", en: "Discouragement" },
    { fr: "Désenchantement", en: "Disenchantment" }, { fr: "Lassitude", en: "Weariness" },
    { fr: "Pessimisme", en: "Pessimism" }, { fr: "Renoncement", en: "Resignation" },
    { fr: "Vide", en: "Emptiness" }, { fr: "Vulnérabilité", en: "Vulnerability" },
  ],
  "Colère/Frustration": [
    { fr: "Colère", en: "Anger" }, { fr: "Fureur", en: "Fury" }, { fr: "Rage", en: "Rage" },
    { fr: "Irritation", en: "Irritation" }, { fr: "Exaspération", en: "Exasperation" },
    { fr: "Frustration", en: "Frustration" }, { fr: "Indignation", en: "Indignation" },
    { fr: "Resentiment", en: "Resentment" }, { fr: "Aigreur", en: "Bitterness" }, { fr: "Rancœur", en: "Grudge" },
    { fr: "Vengeance", en: "Vengefulness" }, { fr: "Hostilité", en: "Hostility" }, { fr: "Agressivité", en: "Aggressiveness" },
    { fr: "Irascibilité", en: "Irritability" }, { fr: "Contrariété", en: "Annoyance" },
    { fr: "Impatience", en: "Impatience" }, { fr: "Mécontentement", en: "Discontent" },
    { fr: "Exécration", en: "Execration" }, { fr: "Courroux", en: "Wrath" }, { fr: "Bouderie", en: "Sullenness" },
  ],
  "Peur/Anxiété": [
    { fr: "Peur", en: "Fear" }, { fr: "Angoisse", en: "Anguish" }, { fr: "Anxiété", en: "Anxiety" },
    { fr: "Terreur", en: "Terror" }, { fr: "Épouvante", en: "Dread" }, { fr: "Effroi", en: "Fright" },
    { fr: "Panique", en: "Panic" }, { fr: "Phobie", en: "Phobia" }, { fr: "Inquiétude", en: "Worry" },
    { fr: "Appréhension", en: "Apprehension" }, { fr: "Nervosité", en: "Nervousness" },
    { fr: "Stress", en: "Stress" }, { fr: "Tension", en: "Tension" }, { fr: "Malaise", en: "Unease" },
    { fr: "Incertitude", en: "Uncertainty" }, { fr: "Doute", en: "Doubt" }, { fr: "Paranoïa", en: "Paranoia" },
    { fr: "Crainte", en: "Dread" }, { fr: "Frisson", en: "Shudder" }, { fr: "Horreur", en: "Horror" },
    { fr: "Stupeur", en: "Stupefaction" },
  ],
  "Amour/Tendresse": [
    { fr: "Amour", en: "Love" }, { fr: "Affection", en: "Affection" }, { fr: "Tendresse", en: "Tenderness" },
    { fr: "Passion", en: "Passion" }, { fr: "Désir", en: "Desire" }, { fr: "Attirance", en: "Attraction" },
    { fr: "Charmement", en: "Enchantment" }, { fr: "Fascination", en: "Fascination" },
    { fr: "Engouement", en: "Infatuation" }, { fr: "Besoin", en: "Longing" }, { fr: "Nostalgie amoureuse", en: "Yearning" },
    { fr: "Admiration", en: "Admiration" }, { fr: "Vénération", en: "Reverence" }, { fr: "Dévotion", en: "Devotion" },
    { fr: "Compassion", en: "Compassion" }, { fr: "Empathie", en: "Empathy" }, { fr: "Tendresse", en: "Fondness" },
    { fr: "Bienveillance", en: "Benevolence" }, { fr: "Attachement", en: "Attachment" },
    { fr: "Coup de foudre", en: "Infatuation" }, { fr: "Sollicitude", en: "Solicitude" },
  ],
  "Surprise/Émerveillement": [
    { fr: "Surprise", en: "Surprise" }, { fr: "Étonnement", en: "Astonishment" }, { fr: "Stupéfaction", en: "Amazement" },
    { fr: "Émerveillement", en: "Wonder" }, { fr: "Ahurissement", en: "Dumbfoundedness" },
    { fr: "Confusion", en: "Confusion" }, { fr: "Perplexité", en: "Perplexity" }, { fr: "Désorientation", en: "Disorientation" },
    { fr: "Incrédulité", en: "Disbelief" }, { fr: "Curiosité", en: "Curiosity" }, { fr: "Intérêt", en: "Interest" },
    { fr: "Ébahissement", en: "Awe" }, { fr: "Égarement", en: "Bewilderment" },
  ],
  "Dégoût/Rejet": [
    { fr: "Dégoût", en: "Disgust" }, { fr: "Répugnance", en: "Repugnance" }, { fr: "Aversion", en: "Aversion" },
    { fr: "Rejet", en: "Rejection" }, { fr: "Mépris", en: "Contempt" }, { fr: "Dédain", en: "Disdain" },
    { fr: "Condescendance", en: "Condescension" }, { fr: "Scorn", en: "Scorn" }, { fr: "Répulsion", en: "Repulsion" },
    { fr: "Horreur", en: "Revulsion" }, { fr: "Antipathie", en: "Antipathy" }, { fr: "Exécration", en: "Loathing" },
    { fr: "Gêne", en: "Embarrassment" },
  ],
  "Mixte/Complexe": [
    { fr: "Ambivalence", en: "Ambivalence" }, { fr: "Contradiction", en: "Contradiction" },
    { fr: "Mélancolie joyeuse", en: "Bittersweet" }, { fr: "Nostalgie heureuse", en: "Happy nostalgia" },
    { fr: "Jalousie", en: "Jealousy" }, { fr: "Envie", en: "Envy" }, { fr: "Covetousness", en: "Covetousness" },
    { fr: "Honte fière", en: "Proud shame" }, { fr: "Colère contenue", en: "Suppressed anger" },
    { fr: "Tristesse souriante", en: "Smiling sadness" }, { fr: "Peureux mais excité", en: "Fearful excitement" },
    { fr: "Soulagement amer", en: "Bitter relief" }, { fr: "Joie coupable", en: "Guilty pleasure" },
    { fr: "Espoir teinté de doute", en: "Hopeful doubt" }, { fr: "Colère justifiée", en: "Righteous anger" },
    { fr: "Sérénité mélancolique", en: "Melancholic serenity" }, { fr: "Extase douloureuse", en: "Painful ecstasy" },
    { fr: "Ennui", en: "Boredom" }, { fr: "Apathie", en: "Apathy" }, { fr: "Lethargie", en: "Lethargy" },
    { fr: "Engourdissement", en: "Numbness" }, { fr: "Détachement", en: "Detachment" },
    { fr: "Contemplation", en: "Contemplation" }, { fr: "Équanimité", en: "Equanimity" },
    { fr: "Sagesse", en: "Wisdom" }, { fr: "Acceptation", en: "Acceptance" },
    { fr: "Pardon", en: "Forgiveness" }, { fr: "Libération", en: "Liberation" },
    { fr: "Renaissance", en: "Rebirth" },
  ],
};

export const CATEGORIES_EMOTIONS = Object.keys(EMOTIONS);

export const CATEGORIES_EMOTIONS_LABEL: Record<string, Record<Langue, string>> = {
  "Joie/Bonheur": { fr: "Joie/Bonheur", en: "Joy/Happiness" },
  "Tristesse/Mélancolie": { fr: "Tristesse/Mélancolie", en: "Sadness/Melancholy" },
  "Colère/Frustration": { fr: "Colère/Frustration", en: "Anger/Frustration" },
  "Peur/Anxiété": { fr: "Peur/Anxiété", en: "Fear/Anxiety" },
  "Amour/Tendresse": { fr: "Amour/Tendresse", en: "Love/Tenderness" },
  "Surprise/Émerveillement": { fr: "Surprise/Émerveillement", en: "Surprise/Wonder" },
  "Dégoût/Rejet": { fr: "Dégoût/Rejet", en: "Disgust/Rejection" },
  "Mixte/Complexe": { fr: "Mixte/Complexe", en: "Mixed/Complex" },
};

export function construireListeEmotions(
  categorie: string, format: string, langue: Langue,
): { texte: string; total: number } {
  const liste = categorie && categorie !== "Toutes" ? (EMOTIONS[categorie] ?? []) : Object.values(EMOTIONS).flat();
  const noms = liste.map((e) => (langue === "en" ? e.en : e.fr));
  let texte: string;
  if (format === "Retour ligne") texte = noms.join("\n");
  else if (format === "Puces") texte = noms.map((n) => `• ${n}`).join("\n");
  else texte = noms.join(", ");
  return { texte, total: noms.length };
}

export const fiches: FicheAudio[] = ([
  {
    id: "emotions", nom: "Émotions", nomEn: "Emotions",
    univers: "Autres", famille: "Texte",
    resume: "Émet en texte une collection d'émotions humaines par catégorie.",
    resumeEn: "Outputs a collection of human emotions by category as text.",
    entrees: [],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      {
        nom: "Catégorie", nomEn: "Category", type: "choix",
        options: ["Toutes", ...CATEGORIES_EMOTIONS],
        optionsEn: ["All", ...CATEGORIES_EMOTIONS.map((c) => CATEGORIES_EMOTIONS_LABEL[c]?.en ?? c)],
        defaut: "Toutes",
        doc: "Filtre la liste par catégorie d'émotions.", docEn: "Filters the list by emotion category.", defautEn: "All",
     },
      {
        nom: "Format", nomEn: "Format", type: "choix",
        options: ["Virgule", "Retour ligne", "Puces"],
        optionsEn: ["Comma", "Newline", "Bullets"],
        defaut: "Virgule",
        doc: "Séparateur du texte produit.", docEn: "Separator of the produced text.", defautEn: "Comma",
     },
    ],
    async executer(ctx: any) {
      const langue = langueCourante();
      const cat = ctx.paramTexte("Catégorie", "Toutes");
      const { texte, total } = construireListeEmotions(cat, ctx.paramTexte("Format", "Virgule"), langue);
      const catAff = cat === "Toutes" ? "" : (CATEGORIES_EMOTIONS_LABEL[cat]?.[langue] ?? cat);
      return { valeurs: [texte], message: traduire("msg.var_0_motions_var_1", total, catAff ? ` — ${catAff}` : "") };
   },
 },
] as FicheAudio[]).map(avecDoc);
