// plugins/tessitures.ts — Nœud « Tessitures de voix » : émet sur sa sortie
// texte une collection de tessitures vocales, scindées hommes/femmes.
// Bilingue FR/EN.

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { langueCourante, type Langue } from "../i18n";

type Tessiture = { fr: string; en: string; grave: number; aigu: number };

// Plages en Hz (approximatives, Do à Do sur 2 octaves) pour chaque tessiture.
export const TESSITURES: Record<string, Tessiture[]> = {
  Hommes: [
    { fr: "Basse contrebasse", en: "Basso profondo", grave: 65, aigu: 196 },
    { fr: "Basse", en: "Bass", grave: 73, aigu: 262 },
    { fr: "Basse chantante", en: "Basso cantante", grave: 73, aigu: 294 },
    { fr: "Baryton basse", en: "Bass-baritone", grave: 82, aigu: 294 },
    { fr: "Baryton", en: "Baritone", grave: 98, aigu: 330 },
    { fr: "Baryton Martin", en: "Baritone Martin", grave: 98, aigu: 349 },
    { fr: "Ténor", en: "Tenor", grave: 131, aigu: 392 },
    { fr: "Ténor léger", en: "Leggiero tenor", grave: 131, aigu: 440 },
    { fr: "Ténor dramatique", en: "Spinto tenor", grave: 131, aigu: 415 },
    { fr: "Haute-contre", en: "Countertenor", grave: 131, aigu: 523 },
    { fr: "Contreténor", en: "Countertenor", grave: 147, aigu: 587 },
    { fr: "Ténor altiste", en: "Tenor altino", grave: 147, aigu: 523 },
    { fr: "Falsettiste", en: "Falsettist", grave: 175, aigu: 698 },
  ],
  Femmes: [
    { fr: "Contralto", en: "Contralto", grave: 131, aigu: 440 },
    { fr: "Contralto dramatique", en: "Dramatic contralto", grave: 131, aigu: 415 },
    { fr: "Mezzo-soprano", en: "Mezzo-soprano", grave: 175, aigu: 523 },
    { fr: "Mezzo-soprano léger", en: "Light mezzo-soprano", grave: 175, aigu: 587 },
    { fr: "Soprano dramatique", en: "Dramatic soprano", grave: 196, aigu: 523 },
    { fr: "Soprano lyrique", en: "Lyric soprano", grave: 220, aigu: 587 },
    { fr: "Soprano léger", en: "Light soprano (Soprano leggero)", grave: 220, aigu: 659 },
    { fr: "Soprano colorature", en: "Coloratura soprano", grave: 247, aigu: 698 },
    { fr: "Soprano dramatique colorature", en: "Dramatic coloratura soprano", grave: 247, aigu: 784 },
    { fr: "Soprano soubrette", en: "Soubrette soprano", grave: 247, aigu: 622 },
    { fr: "Soprano Falcon", en: "Falcon soprano", grave: 196, aigu: 494 },
    { fr: "Soprano wagnérienne", en: "Wagnerian soprano", grave: 175, aigu: 587 },
    { fr: "Soprano spinto", en: "Spinto soprano", grave: 196, aigu: 622 },
  ],
  Enfants: [
    { fr: "Soprano enfant", en: "Boy soprano", grave: 262, aigu: 698 },
    { fr: "Garçon soprano", en: "Treble", grave: 262, aigu: 784 },
    { fr: "Voix d'enfant", en: "Child voice", grave: 247, aigu: 698 },
    { fr: "Soprano garçon", en: "Boy alto", grave: 220, aigu: 622 },
    { fr: "Voix blanche", en: "White voice (Voce bianca)", grave: 262, aigu: 698 },
  ],
};

export const GROUPES_TESSITURES = Object.keys(TESSITURES);

export const GROUPES_TESSITURES_LABEL: Record<string, Record<Langue, string>> = {
  Hommes: { fr: "Hommes", en: "Men" },
  Femmes: { fr: "Femmes", en: "Women" },
  Enfants: { fr: "Enfants", en: "Children" },
};

function freqVersNote(hz: number): string {
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return NOTES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function construireListeTessitures(
  groupe: string, format: string, langue: Langue,
): { texte: string; total: number } {
  const liste = groupe && groupe !== "Toutes" ? (TESSITURES[groupe] ?? []) : Object.values(TESSITURES).flat();
  const noms = liste.map((t) => {
    const nom = langue === "en" ? t.en : t.fr;
    return `${nom} (${freqVersNote(t.grave)}–${freqVersNote(t.aigu)})`;
  });
  let texte: string;
  if (format === "Retour ligne") texte = noms.join("\n");
  else if (format === "Puces") texte = noms.map((n) => `• ${n}`).join("\n");
  else texte = noms.join(", ");
  return { texte, total: noms.length };
}

export const fiches: PluginDef[] = ([
  {
    id: "tessitures-voix", nom: "Tessitures de voix", nomEn: "Vocal Ranges",
    univers: "Autres", famille: "Texte",
    resume: "Émet en texte une collection de tessitures vocales (hommes, femmes, enfants).",
    resumeEn: "Outputs a collection of vocal ranges as text (men, women, children).",
    entrees: [],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      {
        nom: "Groupe", nomEn: "Group", type: "choix",
        options: ["Toutes", ...GROUPES_TESSITURES],
        optionsEn: ["All", ...GROUPES_TESSITURES.map((g) => GROUPES_TESSITURES_LABEL[g]?.en ?? g)],
        defaut: "Toutes",
        doc: "Filtre la liste par groupe : hommes, femmes ou enfants.", docEn: "Filters the list by group: men, women or children.",
      },
      {
        nom: "Format", nomEn: "Format", type: "choix",
        options: ["Virgule", "Retour ligne", "Puces"],
        optionsEn: ["Comma", "Newline", "Bullets"],
        defaut: "Virgule",
        doc: "Séparateur du texte produit.", docEn: "Separator of the produced text.",
      },
    ],
    async executer(ctx: any) {
      const langue = langueCourante();
      const grp = ctx.paramTexte("Groupe", "Toutes");
      const { texte, total } = construireListeTessitures(grp, ctx.paramTexte("Format", "Virgule"), langue);
      const grpAff = grp === "Toutes" ? "" : (GROUPES_TESSITURES_LABEL[grp]?.[langue] ?? grp);
      return { valeurs: [texte], message: `${total} tessitures${grpAff ? ` — ${grpAff}` : ""}` };
    },
  },
] as PluginDef[]).map(avecDoc);
