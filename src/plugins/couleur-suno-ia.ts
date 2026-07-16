// plugins/couleur-suno-ia.ts — Nœud « Couleur → Suno IA » :
// prend 1 ou 2 couleurs, utilise un LLM (DistilGPT-2) pour générer un script
// Suno/Udio avec variabilité (graine aléatoire). Combine la psychologie des
// couleurs (mapping statique) avec la créativité du LLM (génération textuelle).

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { COULEURS, NOMS_COULEURS, profilCouleur, fusionnerProfils, profilVersScript } from "../audio";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/textgen-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

// Libère le worker (et donc le modèle résident en mémoire WASM) après usage.
// Évite l'accumulation de plusieurs modèles IA sur un même run — cause de
// plantage par saturation mémoire. Le modèle se recharge au prochain besoin.
function libererWorker(): void {
  if (worker) { worker.terminate(); worker = null; }
}

const COULEURS_EN = NOMS_COULEURS.map((c) => COULEURS[c].en);

export const fiches: PluginDef[] = ([
  {
    id: "couleur-suno-ia", nom: "Couleur → Son IA", nomEn: "Color → Sound AI",
    univers: "Autres", famille: "Génération",
    resume: "Génère un script Suno/Udio par IA depuis 1 ou 2 couleurs avec variabilité.",
    resumeEn: "Generates a Suno/Udio script via AI from 1 or 2 colors with variability.",
    entrees: [],
    sorties: [{ nom: "Script", type: "texte" }],
    parametres: [
      { nom: "Couleur 1", nomEn: "Color 1", type: "choix",
        options: NOMS_COULEURS, optionsEn: COULEURS_EN,
        defaut: "Bleu",
        doc: "Première couleur (mapping psychologique → émotion, mode, tempo, instruments, styles).",
        docEn: "First color (psychological mapping → emotion, mode, tempo, instruments, styles)." },
      { nom: "Couleur 2", nomEn: "Color 2", type: "choix",
        options: ["(aucune)", ...NOMS_COULEURS], optionsEn: ["(none)", ...COULEURS_EN],
        defaut: "(aucune)",
        doc: "Seconde couleur facultative. Si présente, les profils sont fusionnés.",
        docEn: "Optional second color. If present, profiles are fused." },
      { nom: "Variabilité", nomEn: "Variability", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Contrôle la variabilité des scripts générés. Élevée = le LLM est plus créatif ; basse = reste proche du template.",
        docEn: "Controls variability of generated scripts. High = LLM is more creative; low = stays close to template." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouveau script à chaque exécution). Même graine = même script.",
        docEn: "Random seed (0 = new script each run). Same seed = same script." },
    ],
    async executer(ctx: any) {
      const c1Nom = ctx.paramTexte("Couleur 1", "Bleu");
      const c2Nom = ctx.paramTexte("Couleur 2", "(aucune)");
      const variabilite = ctx.paramNombre("Variabilité", 70);
      const graine = ctx.paramNombre("Graine", 0) || Math.floor(Math.random() * 99999) + 1;

      // 1. Construire le profil musical depuis les couleurs
      const p1 = profilCouleur(c1Nom);
      if (!p1) return { valeurs: [null], message: `Couleur 1 inconnue : ${c1Nom}` };

      let profil;
      let couleursLabel: string[];
      if (c2Nom && c2Nom !== "(aucune)" && COULEURS[c2Nom]) {
        const p2 = profilCouleur(c2Nom);
        if (!p2) return { valeurs: [null], message: `Couleur 2 inconnue : ${c2Nom}` };
        profil = fusionnerProfils(p1, p2, c1Nom, c2Nom);
        couleursLabel = [COULEURS[c1Nom].en, COULEURS[c2Nom].en];
      } else {
        profil = p1;
        couleursLabel = [COULEURS[c1Nom].en];
      }

      // 2. Générer le script de base (template structuré)
      const scriptBase = profilVersScript(profil, couleursLabel, "en");

      // 3. Construire un prompt pour le LLM qui enrichit le script
      const temperature = 0.3 + (variabilite / 100) * 1.0; // 0.3 (stable) → 1.3 (créatif)
      const llmPrompt = `You are a music prompt engineer for Suno AI. Based on this color-inspired music profile, write a creative and unique Suno prompt. Add descriptive adjectives, mood words, and production details. Keep it under 200 words.

Color profile:
${scriptBase}

Write a single creative Suno prompt paragraph:`;

      // 4. Appeler le LLM (DistilGPT-2) via le worker
      ctx.onProgress("Génération du script IA…");
      const w = getWorker();
      const llmText = await new Promise<string | null>((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            libererWorker();
            resolve(msg.text);
          } else if (msg.type === "error") {
            libererWorker();
            resolve(null);
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({
          prompt: llmPrompt,
          modelId: "Xenova/distilgpt2",
          task: "text-generation",
          maxTokens: 120,
          temperature,
          repetitionPenalty: 1.4,
        });
      });

      // 5. Combiner le template structuré + l'enrichissement LLM
      let scriptFinal: string;
      if (llmText && llmText.length > 20) {
        scriptFinal = `=== Color → Suno AI Script ===
Colors: ${couleursLabel.join(" + ")}
Seed: ${graine}

--- Structured Profile ---
${scriptBase}

--- AI-Generated Prompt ---
${llmText}

--- Tags ---
${[...profil.styles.map((s: any) => s.en).map((s: string) => s.toLowerCase().replace(/\s+/g, "-")),
  profil.emotion.en.toLowerCase().replace(/[,×]/g, "").split(/\s+/).slice(0, 3).join("-"),
  profil.voix.en.toLowerCase().replace(/\s+/g, "-"),
].join(", ")}
`;
      } else {
        // Fallback : utiliser seulement le template si le LLM échoue
        scriptFinal = `=== Color → Suno Script ===\nColors: ${couleursLabel.join(" + ")}\nSeed: ${graine}\n\n${scriptBase}`;
      }

      return {
        valeurs: [scriptFinal],
        message: `Script généré · ${couleursLabel.join(" + ")} · graine ${graine} · ${scriptFinal.length} caractères`,
      };
    },
  },
] as PluginDef[]).map(avecDoc);
