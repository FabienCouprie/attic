// plugins/magenta.ts — Fiches des nœuds Magenta.
// Les calculs lourds sont délégués à src/workers/magenta-worker.ts pour ne pas
// bloquer le thread principal.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { MODES, MODES_EN, MODES_IDS } from "./magenta-helpers";
import { appliquerInstrumentMidi } from "../audio/midi";
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { hasardDuNoeud } from "../core";

let worker: Worker | null = null;
const pending: { resolve: (v: any) => void; reject: (e: any) => void; ctx: any }[] = [];

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/magenta-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const { type, payload, error, msg } = e.data;
      const p = pending[0];
      if (!p) return;
      if (type === "progress") {
        p.ctx?.onProgress?.(msg);
      } else {
        pending.shift();
        if (type === "error") {
          p.reject(new Error(error || msg || "Erreur worker Magenta"));
        } else {
          p.resolve(payload);
        }
      }
    };
  }
  return worker;
}

function runMagenta(ctx: any, type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    pending.push({ resolve, reject, ctx });
    getWorker().postMessage({ type, payload });
  });
}

async function runMagentaFile(ctx: any, type: string, payload: any): Promise<File> {
  const result = await runMagenta(ctx, type, payload);
  if (result?.kind === "file") {
    return new File([result.bytes], result.name, { type: result.type });
  }
  throw new Error("Résultat Magenta inattendu (fichier attendu)");
}

export const fiches: FicheAudio[] = ([
  {
    id: "magenta-drums",
    nom: "Magenta Drums",
    nomEn: "Magenta Drums",
    univers: "Autres",
    famille: "Magenta",
    resume: "Génère une boucle de batterie neuronale avec MusicVAE (2 barres, répétable).",
    resumeEn: "Generates a neural drum loop with MusicVAE (2 bars, repeatable).",
    entrees: [],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0.1, 1.5], pas: 0.05, defaut: 1.0,
        doc: "Créativité du sampling. 0 = déterministe, 1 = créatif, >1 = imprévisible.",
        docEn: "Sampling creativity. 0 = deterministic, 1 = creative, >1 = unpredictable."
     },
      {
        nom: "Tempo", nomEn: "Tempo", type: "curseur",
        plage: [60, 200], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo du fichier MIDI généré.",
        docEn: "Tempo of the generated MIDI file."
     },
      {
        nom: "Mesures", nomEn: "Bars", type: "curseur",
        plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de mesures générées. Le modèle produit des blocs de 2 mesures concaténés.",
        docEn: "Number of bars generated. The model produces and concatenates 2-bar chunks."
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      try {
        const temperature = ctx.paramNombre("Température", 1.0);
        const tempo = ctx.paramNombre("Tempo", 120);
        const bars = ctx.paramNombre("Mesures", 2);
        const file = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, "drums", { temperature, bars, tempo }),
          ctx.paramNombre("Instrument", 0),
        );
        return { valeurs: [file], message: traduire("msg.magenta_drums_var_0_mesures_var_1_bpm", bars, tempo) };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_drums_var_0", err.message ?? err) };
      }
     },
  },
  {
    id: "magenta-continuation",
    nom: "Magenta Continuation",
    nomEn: "Magenta Continuation",
    univers: "Autres",
    famille: "Magenta",
    resume: "Continue une mélodie MIDI avec MusicRNN (mélodie_rnn).",
    resumeEn: "Continues a MIDI melody with MusicRNN (melody_rnn).",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0.1, 1.5], pas: 0.05, defaut: 1.0,
        doc: "Créativité de la continuation.",
        docEn: "Continuation creativity."
     },
      {
        nom: "Pas à générer", nomEn: "Steps to generate", type: "curseur",
        plage: [16, 128], pas: 1, defaut: 32,
        doc: "Nombre de pas générés (1 mesure 4/4 = 16 pas).",
        docEn: "Number of steps to generate (1 bar 4/4 = 16 steps)."
     },
      {
        nom: "Quantification", nomEn: "Quantization", type: "choix",
        options: ["1/4", "1/8", "1/16", "1/32"],
        optionsEn: ["1/4", "1/8", "1/16", "1/32"],
        defaut: "1/16",
        doc: "Résolution de quantification de la mélodie d’entrée avant continuation.",
        docEn: "Quantization resolution applied to the input melody before continuation.", defautEn: "1/16"
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const file = ctx.entree(0);
      if (!(file instanceof File)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      try {
        const temperature = ctx.paramNombre("Température", 1.0);
        const steps = ctx.paramNombre("Pas à générer", 32);
        const q = ctx.paramTexte("Quantification", "1/16");
        const spqMap: Record<string, number> = { "1/4": 1, "1/8": 2, "1/16": 4, "1/32": 8 };
        const spq = spqMap[q] ?? 4;
        const out = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, "continuation", { file, steps, temperature, spq }),
          ctx.paramNombre("Instrument", 0),
        );
        return { valeurs: [out], message: traduire("msg.magenta_continuation_var_0_pas", steps) };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_continuation_var_0", err.message ?? err) };
      }
     },
  },
  {
    id: "magenta-improvisation",
    nom: "Magenta Improvisation",
    nomEn: "Magenta Improvisation",
    univers: "Autres",
    famille: "Magenta",
    resume: "Génère une improvisation au piano avec Piano Genie (8 boutons virtuels).",
    resumeEn: "Generates a piano improvisation with Piano Genie (8 virtual buttons).",
    entrees: [],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Durée", nomEn: "Duration", type: "curseur",
        plage: [1, 30], pas: 0.5, defaut: 8, unite: "s",
        doc: "Durée de l’improvisation en secondes.",
        docEn: "Improvisation duration in seconds."
     },
      {
        nom: "Tempo", nomEn: "Tempo", type: "curseur",
        plage: [60, 200], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo du fichier MIDI généré.",
        docEn: "Tempo of the generated MIDI file."
     },
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0, 1.5], pas: 0.05, defaut: 1.0,
        doc: "Créativité de l’échantillonnage (0 = argmax, 1 = standard, >1 = aléatoire).",
        docEn: "Sampling creativity (0 = argmax, 1 = standard, >1 = random)."
     },
      {
        nom: "Mode", nomEn: "Mode", type: "choix",
        options: MODES,
        optionsEn: MODES_EN,
        optionIds: MODES_IDS,
        defaut: "Aléatoire",
        doc: "Séquence des boutons Piano Genie (0-7). Aléatoire = boutons aléatoires, Marche = dérive, Montant/Descendant/Arpège = motifs.",
        docEn: "Piano Genie button sequence (0-7). Random = random buttons, Walk = drift, Up/Down/Arpeggio = patterns.", defautEn: "Random"
      },
      {
        nom: "Graine", nomEn: "Seed", type: "curseur",
        plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine de l'improvisation — elle pilote à la fois le modèle et le choix des boutons. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici.",
        docEn: "Seed for the improvisation — it drives both the model and the button choice. 0 = drawn at random on every run, and shown in the message so it can be copied back here."
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      try {
        const duree = ctx.paramNombre("Durée", 8);
        const tempo = ctx.paramNombre("Tempo", 120);
        const temperature = ctx.paramNombre("Température", 1.0);
        const mode = ctx.paramTexte("Mode", "random");
        const { graine: seed } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
        const file = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, "improvisation", { duree, tempo, temperature, mode, seed }),
          ctx.paramNombre("Instrument", 0),
        );
        const label = (langueCourante() === "en" ? MODES_EN : MODES)[MODES_IDS.indexOf(mode)] ?? mode;
        return { valeurs: [file], message: `${traduire("msg.magenta_improvisation_var_0_s_var_1_var_2_bpm", duree, label, tempo)} · graine ${seed}` };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_improvisation_var_0", err.message ?? err) };
      }
     },
  },
  {
    id: "magenta-generer-melodie",
    nom: "Magenta Générer mélodie",
    nomEn: "Magenta Generate Melody",
    univers: "Autres",
    famille: "Magenta",
    resume: "Génère une mélodie à partir d’un fichier MIDI de départ avec MusicRNN (melody_rnn).",
    resumeEn: "Generates a melody from a seed MIDI file with MusicRNN (melody_rnn).",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0.1, 1.5], pas: 0.05, defaut: 1.0,
        doc: "Créativité de la génération.",
        docEn: "Generation creativity."
     },
      {
        nom: "Pas à générer", nomEn: "Steps to generate", type: "curseur",
        plage: [16, 128], pas: 1, defaut: 32,
        doc: "Nombre de pas générés après le seed MIDI.",
        docEn: "Number of steps generated after the MIDI seed."
     },
      {
        nom: "Quantification", nomEn: "Quantization", type: "choix",
        options: ["1/4", "1/8", "1/16", "1/32"],
        optionsEn: ["1/4", "1/8", "1/16", "1/32"],
        defaut: "1/16",
        doc: "Résolution de quantification du seed MIDI avant génération.",
        docEn: "Quantization resolution applied to the MIDI seed before generation.", defautEn: "1/16"
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const file = ctx.entree(0);
      if (!(file instanceof File)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      try {
        const temperature = ctx.paramNombre("Température", 1.0);
        const steps = ctx.paramNombre("Pas à générer", 32);
        const q = ctx.paramTexte("Quantification", "1/16");
        const spqMap: Record<string, number> = { "1/4": 1, "1/8": 2, "1/16": 4, "1/32": 8 };
        const spq = spqMap[q] ?? 4;
        const out = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, "melody", { file, steps, temperature, spq }),
          ctx.paramNombre("Instrument", 0),
        );
        return { valeurs: [out], message: traduire("msg.magenta_g_n_rer_m_lodie_var_0_pas", steps) };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_g_n_rer_m_lodie_var_0", err.message ?? err) };
      }
     },
  },
  {
    id: "magenta-interpoler-midi",
    nom: "Magenta Interpoler MIDI",
    nomEn: "Magenta Interpolate MIDI",
    univers: "Autres",
    famille: "Magenta",
    resume: "Génère un MIDI intermédiaire entre deux fichiers MIDI avec MusicVAE.",
    resumeEn: "Generates an intermediate MIDI file between two MIDI files with MusicVAE.",
    entrees: [
      { nom: "MIDI A", type: "midi", requis: true },
      { nom: "MIDI B", type: "midi", requis: true },
    ],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0.1, 1.5], pas: 0.05, defaut: 1.0,
        doc: "Créativité de l’interpolation.",
        docEn: "Interpolation creativity."
     },
      {
        nom: "Interpolations", nomEn: "Interpolations", type: "curseur",
        plage: [3, 11], pas: 2, defaut: 5,
        doc: "Nombre de pas d’interpolation entre les deux MIDI (impair conseillé).",
        docEn: "Number of interpolation steps between the two MIDI files (odd recommended)."
     },
      {
        nom: "Position", nomEn: "Position", type: "curseur",
        plage: [0, 1], pas: 0.05, defaut: 0.5,
        doc: "Position de l’intermédiaire entre MIDI A (0) et MIDI B (1).",
        docEn: "Position of the intermediate between MIDI A (0) and MIDI B (1)."
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const file1 = ctx.entree(0);
      const file2 = ctx.entree(1);
      if (!(file1 instanceof File) || !(file2 instanceof File)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.deux_fichiers_midi_sont_requis") };
      }
      try {
        const temperature = ctx.paramNombre("Température", 1.0);
        const numInterps = ctx.paramNombre("Interpolations", 5);
        const position = ctx.paramNombre("Position", 0.5);
        const out = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, "interpolation", { file1, file2, numInterps, temperature, position }),
          ctx.paramNombre("Instrument", 0),
        );
        return { valeurs: [out], message: traduire("msg.magenta_interpolation_position_var_0", position.toFixed(2)) };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_interpolation_var_0", err.message ?? err) };
      }
   },
  },
  {
    id: "magenta-generer-batterie",
    nom: "Magenta Générer batterie",
    nomEn: "Magenta Generate Drums",
    univers: "Autres",
    famille: "Magenta",
    resume: "Génère une boucle de batterie avec MusicVAE. Un seed MIDI en option peut orienter le style.",
    resumeEn: "Generates a drum loop with MusicVAE. An optional MIDI seed can guide the style.",
    entrees: [{ nom: "MIDI (optionnel)", nomEn: "MIDI (optional)", type: "midi", requis: false }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0.1, 1.5], pas: 0.05, defaut: 1.0,
        doc: "Créativité du sampling.",
        docEn: "Sampling creativity."
     },
      {
        nom: "Tempo", nomEn: "Tempo", type: "curseur",
        plage: [60, 200], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo du fichier MIDI généré.",
        docEn: "Tempo of the generated MIDI file."
     },
      {
        nom: "Mesures", nomEn: "Bars", type: "curseur",
        plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de mesures générées (ignoré si un seed est branché).",
        docEn: "Number of bars generated (ignored when a seed is connected)."
     },
      {
        nom: "Similarité", nomEn: "Similarity", type: "curseur",
        plage: [0, 1], pas: 0.05, defaut: 0.5,
        doc: "Ressemblance avec le seed MIDI (0 = aléatoire, 1 = proche du seed).",
        docEn: "Resemblance to the MIDI seed (0 = random, 1 = close to the seed)."
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      try {
        const temperature = ctx.paramNombre("Température", 1.0);
        const tempo = ctx.paramNombre("Tempo", 120);
        const bars = ctx.paramNombre("Mesures", 2);
        const similarity = ctx.paramNombre("Similarité", 0.5);
        const file = ctx.entree(0);
        const type = file instanceof File ? "drumsSeed" : "drums";
        const payload = file instanceof File
          ? { file, temperature, bars, tempo, similarity }
          : { temperature, bars, tempo };
        const out = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, type, payload),
          ctx.paramNombre("Instrument", 0),
        );
        return { valeurs: [out], message: traduire("msg.magenta_g_n_rer_batterie_var_0_var_1_bpm", file instanceof File ? "variation" : "aléatoire", tempo) };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_g_n_rer_batterie_var_0", err.message ?? err) };
      }
     },
  },
  {
    id: "magenta-humaniser-groove",
    nom: "Magenta Humaniser groove",
    nomEn: "Magenta Humanize Groove",
    univers: "Autres",
    famille: "Magenta",
    resume: "Humanise un pattern de batterie MIDI avec GrooVAE (variations de vélocité et timing).",
    resumeEn: "Humanizes a MIDI drum pattern with GrooVAE (velocity and timing variations).",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Température", nomEn: "Temperature", type: "curseur",
        plage: [0, 1.5], pas: 0.05, defaut: 0.5,
        doc: "Quantité de variation appliquée (0 = peu, 1.5 = très expressif).",
        docEn: "Amount of variation applied (0 = little, 1.5 = very expressive)."
     },
      {
        nom: "Quantification", nomEn: "Quantization", type: "choix",
        options: ["1/4", "1/8", "1/16", "1/32"],
        optionsEn: ["1/4", "1/8", "1/16", "1/32"],
        defaut: "1/16",
        doc: "Résolution de quantification du pattern d’entrée.",
        docEn: "Quantization resolution of the input pattern.", defautEn: "1/16"
     },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const file = ctx.entree(0);
      if (!(file instanceof File)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      try {
        const temperature = ctx.paramNombre("Température", 0.5);
        const q = ctx.paramTexte("Quantification", "1/16");
        const spqMap: Record<string, number> = { "1/4": 1, "1/8": 2, "1/16": 4, "1/32": 8 };
        const spq = spqMap[q] ?? 4;
        const out = await appliquerInstrumentMidi(
          await runMagentaFile(ctx, "humanize", { file, temperature, spq }),
          ctx.paramNombre("Instrument", 0),
        );
        return { valeurs: [out], message: traduire("msg.magenta_humaniser_groove") };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_magenta_humaniser_groove_var_0", err.message ?? err) };
      }
   },
  },
] as FicheAudio[]).map(avecDoc);
