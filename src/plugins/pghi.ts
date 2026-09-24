// plugins/pghi.ts — Retrouver la phase d'un spectrogramme sans itérer.
//
// D'après Průša, Balazs et Søndergaard, IEEE/ACM TASLP 25(5), 2017. La logique est dans
// `audio/pghi.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { reconstruire, type OptionsReconstruction, type Reconstruction } from "../audio/pghi";
import { parCanal } from "./hors-fil";

export const fiches: FicheAudio[] = ([
  {
    id: "phase-pghi", nom: "Reconstruction de phase (PGHI)", nomEn: "Phase Reconstruction (PGHI)",
    univers: "Traitement", famille: "Effets",
    resume: "Reconstruit un son à partir des seules magnitudes de son spectrogramme, sans itérer : la phase se lit dans le gradient de la magnitude.",
    resumeEn: "Rebuilds a sound from its spectrogram magnitudes alone, without iterating: the phase is read from the magnitude's gradient.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["512", "1024", "2048", "4096"], optionsEn: ["512", "1024", "2048", "4096"],
        optionIds: ["512", "1024", "2048", "4096"], defaut: "1024", defautEn: "1024",
        doc: "Taille de la transformée. La fenêtre est gaussienne et non de Hann comme ailleurs : c'est la seule pour laquelle la relation entre phase et magnitude est exacte, et c'est cette relation qui fait tout l'algorithme.",
        docEn: "Transform size. The window is gaussian rather than the Hann used elsewhere: it is the only one for which the relation between phase and magnitude is exact, and that relation is the whole algorithm." },
      { nom: "Affinage", nomEn: "Refinement", type: "curseur", plage: [0, 60], pas: 1, defaut: 10, unite: " tours",
        uniteEn: " passes",
        doc: "Tours de Griffin-Lim appliqués après PGHI, ce que l'article recommande : PGHI ne remplace pas l'itération, il lui donne un point de départ qui a du sens. Mesuré sur un son harmonique : PGHI seul rend −18 dB de convergence spectrale, dix tours de Griffin-Lim seuls −6, cent tours −21, et PGHI suivi de dix tours −26, pour un cinquième du temps de calcul des cent tours. À zéro, on entend PGHI seul.",
        docEn: "Griffin-Lim passes applied after PGHI, as the paper recommends: PGHI does not replace iteration, it gives it a starting point that makes sense. Measured on a harmonic sound: PGHI alone gives −18 dB of spectral convergence, ten Griffin-Lim passes alone −6, a hundred passes −21, and PGHI followed by ten passes −26, for a fifth of the hundred passes' computation time. At zero, you hear PGHI on its own." },
      { nom: "Tolérance", nomEn: "Tolerance", type: "choix",
        options: ["10⁻⁸", "10⁻⁶", "10⁻⁴", "10⁻²"], optionsEn: ["10⁻⁸", "10⁻⁶", "10⁻⁴", "10⁻²"],
        optionIds: ["1e-8", "1e-6", "1e-4", "1e-2"], defaut: "10⁻⁶", defautEn: "10⁻⁶",
        doc: "En dessous de cette part de la magnitude la plus forte, un point n'est pas intégré et reste à phase nulle. Ce n'est pas un détail : intégrer à travers une zone vide propagerait du bruit dans tout le reste du spectrogramme, et c'est justement ce que l'article évite en partant des plus fortes magnitudes.",
        docEn: "Below this fraction of the strongest magnitude, a point is not integrated and keeps zero phase. This is no detail: integrating across an empty region would propagate noise through the rest of the spectrogram, and that is precisely what the paper avoids by starting from the strongest magnitudes." },
      { nom: "Mix", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Proportion de son reconstruit. À 0 %, la sortie est l'entrée.",
        docEn: "Proportion of reconstructed sound. At 0 %, the output is the input." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const taille = parseInt(ctx.paramTexte("Fenêtre", "1024"), 10) || 1024;
      const saut = taille / 4;
      const affinage = Math.round(ctx.paramNombre("Affinage", 10));
      const tolerance = parseFloat(ctx.paramTexte("Tolérance", "1e-6")) || 1e-6;
      const melange = ctx.paramNombre("Mix", 100) / 100;
      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });

      const voies = Array.from({ length: canaux }, (_, c) => entree.getChannelData(c));
      const parVoie = await parCanal<OptionsReconstruction, Reconstruction>(
        voies, { taille, saut, affinage, tolerance, longueur: length },
        {
          creerWorker: () => new Worker(new URL("../workers/pghi-worker.ts", import.meta.url), { type: "module" }),
          calcul: reconstruire,
          surProgres: (c, n) => ctx.onProgress?.(traduire("msg.pghi.canal", String(c), String(n))),
        },
      );

      // L'AGRÉGATION APPARTIENT AU COMPOSANT : moyenne pour la convergence et la part intégrée,
      // maximum pour les îlots. Un socle commun qui en déciderait rendrait un chiffre faux.
      let convergence = 0, ilots = 0, partIntegree = 0;
      for (let c = 0; c < canaux; c++) {
        const r = parVoie[c];
        convergence += r.convergence / canaux;
        ilots = Math.max(ilots, r.ilots);
        partIntegree += r.partIntegree / canaux;
        const voie = voies[c];
        const dst = sortie.getChannelData(c);
        for (let i = 0; i < length; i++) dst[i] = melange * r.reconstruit[i] + (1 - melange) * voie[i];
      }
      return {
        valeurs: [sortie],
        message: traduire("msg.pghi.fait",
          convergence.toFixed(1), String(ilots), (100 * partIntegree).toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
