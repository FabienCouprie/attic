// plugins/generateur-script-ia.ts — Nœud « Générateur de script IA » :
// combine aléatoirement des instruments, styles, émotions et tessitures de
// voix reçus en entrée texte pour produire un prompt/script pour un applicatif
// IA tel que Suno. Bilingue FR/EN.

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { langueCourante, type Langue } from "../i18n";

function decouperEntree(valeur: unknown): string[] {
  if (typeof valeur !== "string" || !valeur.trim()) return [];
  return valeur
    .split(/[,\n;|•]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function piocher<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return [];
  const copie = [...arr];
  const resultat: T[] = [];
  const count = Math.min(n, copie.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copie.length);
    resultat.push(copie.splice(idx, 1)[0]);
  }
  return resultat;
}

function construireScript(
  instruments: string[], styles: string[], emotions: string[], tessitures: string[],
  nbInstruments: number, nbStyles: number, nbEmotions: number,
  langue: Langue,
): string {
  const fr = langue === "fr";
  const instr = piocher(instruments, nbInstruments);
  const styl = piocher(styles, nbStyles);
  const emo = piocher(emotions, nbEmotions);
  const tess = piocher(tessitures, 1);

  const lignes: string[] = [];
  lignes.push(fr ? "=== Script de génération musicale IA ===" : "=== AI Music Generation Script ===");
  lignes.push("");

  if (styl.length > 0) {
    lignes.push(fr ? `Style musical : ${styl.join(", ")}` : `Musical style: ${styl.join(", ")}`);
  }
  if (instr.length > 0) {
    lignes.push(fr ? `Instruments : ${instr.join(", ")}` : `Instruments: ${instr.join(", ")}`);
  }
  if (emo.length > 0) {
    lignes.push(fr ? `Émotions / ambiance : ${emo.join(", ")}` : `Emotions / mood: ${emo.join(", ")}`);
  }
  if (tess.length > 0) {
    lignes.push(fr ? `Voix : ${tess[0]}` : `Vocals: ${tess[0]}`);
  }

  lignes.push("");
  lignes.push(fr ? "--- Prompt ---" : "--- Prompt ---");
  const parts: string[] = [];
  if (styl.length > 0) {
    parts.push(fr ? `un morceau ${styl.join(" / ")}` : `a ${styl.join(" / ")} track`);
  } else {
    parts.push(fr ? "un morceau" : "a track");
  }
  if (instr.length > 0) {
    parts.push(fr ? `avec ${instr.join(", ")}` : `featuring ${instr.join(", ")}`);
  }
  if (emo.length > 0) {
    parts.push(fr ? `dégageant ${emo.join(", ")}` : `evoking ${emo.join(", ")}`);
  }
  if (tess.length > 0) {
    parts.push(fr ? `chanté par une ${tess[0]}` : `sung by a ${tess[0]}`);
  }

  const phrase = parts.join(", ");
  lignes.push(fr ? `Crée ${phrase}.` : `Create ${phrase}.`);

  lignes.push("");
  lignes.push(fr ? "--- Tags ---" : "--- Tags ---");
  const tags: string[] = [];
  for (const s of styl) tags.push(s.toLowerCase().replace(/\s+/g, "-"));
  for (const e of emo) tags.push(e.toLowerCase().replace(/\s+/g, "-"));
  if (tess.length > 0) tags.push(tess[0].toLowerCase().replace(/\s+/g, "-"));
  lignes.push(tags.length > 0 ? tags.join(", ") : (fr ? "(aucun)" : "(none)"));

  return lignes.join("\n");
}

export const fiches: PluginDef[] = ([
  {
    id: "generateur-script-ia", nom: "Générateur de script IA", nomEn: "AI Script Generator",
    univers: "Autres", famille: "Texte",
    resume: "Génère un prompt pour une IA musicale (Suno, Udio…) en combinant aléatoirement instruments, styles, émotions et tessitures.",
    resumeEn: "Generates a prompt for a music AI (Suno, Udio…) by randomly combining instruments, styles, emotions and vocal ranges.",
    entrees: [
      { nom: "Instruments", type: "texte" },
      { nom: "Styles", type: "texte" },
      { nom: "Émotions", type: "texte" },
      { nom: "Tessitures", type: "texte" },
    ],
    sorties: [{ nom: "Script", type: "texte" }],
    parametres: [
      { nom: "Instruments", nomEn: "Instruments", plage: [0, 10], pas: 1, defaut: 3, unite: "",
        doc: "Nombre d'instruments à piocher aléatoirement dans l'entrée.", docEn: "Number of instruments to randomly pick from the input." },
      { nom: "Styles", nomEn: "Styles", plage: [0, 5], pas: 1, defaut: 2, unite: "",
        doc: "Nombre de styles musicaux à piocher.", docEn: "Number of musical styles to pick." },
      { nom: "Émotions", nomEn: "Emotions", plage: [0, 5], pas: 1, defaut: 2, unite: "",
        doc: "Nombre d'émotions à piocher.", docEn: "Number of emotions to pick." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0, unite: "",
        doc: "Graine aléatoire (0 = aléatoire à chaque exécution).", docEn: "Random seed (0 = random each run)." },
    ],
    async executer(ctx: any) {
      const langue = langueCourante();
      const instruments = decouperEntree(ctx.entree(0));
      const styles = decouperEntree(ctx.entree(1));
      const emotions = decouperEntree(ctx.entree(2));
      const tessitures = decouperEntree(ctx.entree(3));

      const nbInstr = Math.round(ctx.paramNombre("Instruments", 3));
      const nbStyles = Math.round(ctx.paramNombre("Styles", 2));
      const nbEmo = Math.round(ctx.paramNombre("Émotions", 2));
      const graine = Math.round(ctx.paramNombre("Graine", 0));
      if (graine > 0) {
        let s = graine;
        Math.random = () => {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          return s / 0x7fffffff;
        };
      }

      const script = construireScript(instruments, styles, emotions, tessitures, nbInstr, nbStyles, nbEmo, langue);

      const fr = langue === "fr";
      const parties = [];
      if (instruments.length > 0) parties.push(`${instruments.length} instr.`);
      if (styles.length > 0) parties.push(`${styles.length} styles`);
      if (emotions.length > 0) parties.push(`${emotions.length} ${fr ? "émot." : "emot."}`);
      if (tessitures.length > 0) parties.push(`${tessitures.length} ${fr ? "tess." : "voc."}`);
      const source = parties.length > 0 ? parties.join(" · ") : (fr ? "entrées vides — utilisez les valeurs par défaut" : "empty inputs — using defaults");

      return { valeurs: [script], message: `${fr ? "Script généré" : "Script generated"} (${source})` };
    },
  },
] as PluginDef[]).map(avecDoc);
