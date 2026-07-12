// plugins/texte-provider.ts — Nœud « Source de texte » : émet un texte saisi
// par l'utilisateur sur sa sortie texte (port bleu). Utile comme source pour
// les nodes de synthèse vocale, les scripts IA, etc.
import { enregistrer } from "../core";
import type { PluginDef } from "../core";
import { avecDoc } from "./notices";

for (const def of [
  {
    id: "source-texte", nom: "Entrée texte", nomEn: "Text Input",
    univers: "Entrées", famille: "Text to Speech",
    resume: "Émet un texte saisi par l'utilisateur sur sa sortie texte.",
    resumeEn: "Outputs user-entered text on its text output.",
    entrees: [],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Texte", nomEn: "Text", type: "texte", defaut: "Bonjour, ceci est un texte de test.",
        doc: "Texte à émettre. Sera transmis sur la sortie texte (port bleu).",
        docEn: "Text to output. Will be sent on the text output (blue port)." },
    ],
    async executer(ctx: any) {
      const texte = ctx.paramTexte("Texte", "Bonjour, ceci est un texte de test.");
      return { valeurs: [texte], message: `${texte.length} caractères` };
    },
  },
] as PluginDef[]) enregistrer(avecDoc(def));
