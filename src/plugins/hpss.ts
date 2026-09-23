// plugins/hpss.ts — Nœud « Séparation harmonique / percussive ».
//
// D'après Derry Fitzgerald, « Harmonic/Percussive Separation using Median Filtering », DAFx-10,
// Graz, 2010 — https://arrow.tudublin.ie/argcon/67/
//
// La logique est dans `audio/hpss.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { separerHarmoniquePercussif } from "../audio/hpss";

export const fiches: FicheAudio[] = ([
  {
    id: "separation-harmonique-percussive",
    nom: "Séparation harmonique / percussive", nomEn: "Harmonic/Percussive Separation",
    univers: "Traitement", famille: "Effets",
    resume: "Sépare ce qui tient de ce qui claque, par filtre médian sur le spectrogramme (Fitzgerald, DAFx-10).",
    resumeEn: "Separates what sustains from what strikes, by median filtering the spectrogram (Fitzgerald, DAFx-10).",
    // Ses sorties audio sont des pairs : aucune ne represente le noeud a elle seule, et un
    // lecteur generique en designerait une au hasard.
    sansApercuAudio: true,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Harmonique", nomEn: "Harmonic", type: "audio" },
      { nom: "Percussif", nomEn: "Percussive", type: "audio" },
    ],
    parametres: [
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["1024", "2048", "4096"], optionsEn: ["1024", "2048", "4096"],
        optionIds: ["1024", "2048", "4096"], defaut: "2048", defautEn: "2048",
        doc: "Taille de la transformée. Grande, les notes tenues se distinguent mieux mais les attaques s'étalent ; petite, l'inverse. 2048 est le compromis de l'article.",
        docEn: "Transform size. Large separates sustained notes better but smears attacks; small does the opposite. 2048 is the paper's compromise." },
      { nom: "Filtre temporel", nomEn: "Time filter", type: "curseur", plage: [3, 51], pas: 2, defaut: 17,
        unite: " trames", uniteEn: " frames",
        doc: "Longueur du filtre médian le long du temps, qui efface ce qui ne dure pas. Long, seules les tenues très stables survivent ; court, une note brève passe aussi pour harmonique.",
        docEn: "Length of the median filter along time, which erases what does not last. Long, only very stable sustains survive; short, a brief note also passes for harmonic." },
      { nom: "Filtre fréquentiel", nomEn: "Frequency filter", type: "curseur", plage: [3, 51], pas: 2, defaut: 17,
        unite: " bins", uniteEn: " bins",
        doc: "Longueur du filtre médian le long des fréquences, qui efface ce qui est étroit — une partielle — et garde ce qui est large, le bruit d'une attaque.",
        docEn: "Length of the median filter along frequency, which erases what is narrow — a partial — and keeps what is wide, the noise of an attack." },
      { nom: "Partage", nomEn: "Split", type: "choix",
        options: ["Doux", "Tranché"], optionsEn: ["Soft", "Hard"],
        optionIds: ["doux", "tranche"], defaut: "Doux", defautEn: "Soft",
        doc: "Doux partage l'énergie ambiguë entre les deux sorties, à la manière d'un filtre de Wiener. Tranché envoie chaque point entièrement d'un côté : plus net, au prix d'artefacts sur la matière qui n'est franchement ni l'un ni l'autre. Dans les deux cas les deux sorties, remises bout à bout, redonnent le son de départ.",
        docEn: "Soft shares ambiguous energy between the two outputs, Wiener-fashion. Hard sends each point entirely to one side: cleaner-cut, at the cost of artefacts on material that is frankly neither. In both cases the two outputs, added back together, give back the original sound." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const taille = parseInt(ctx.paramTexte("Fenêtre", "2048"), 10) || 2048;
      const reglages = {
        medianeTemps: Math.round(ctx.paramNombre("Filtre temporel", 17)),
        medianeFrequence: Math.round(ctx.paramNombre("Filtre fréquentiel", 17)),
        fermete: ctx.paramTexte("Partage", "doux") === "tranche" ? Infinity : 2,
      };

      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const harmonique = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      const percussif = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      let partPercussive = 0;
      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.hpss.canal", String(c + 1), String(canaux)));
        const r = separerHarmoniquePercussif(entree.getChannelData(c), taille, reglages);
        // Recopie explicite, comme ailleurs dans Attic : `copyToChannel` veut un tableau adossé
        // à un ArrayBuffer simple, et c'est aussi ce qui garantit que le buffer ne partage rien
        // avec le calcul.
        harmonique.copyToChannel(new Float32Array(r.harmonique), c);
        percussif.copyToChannel(new Float32Array(r.percussif), c);
        partPercussive += r.partPercussive / canaux;
      }
      return {
        valeurs: [harmonique, percussif],
        message: traduire("msg.hpss.resultat",
          Math.round(partPercussive * 100).toString(), Math.round((1 - partPercussive) * 100).toString()),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
