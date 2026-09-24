// plugins/stn.ts — Sinus, transitoires et bruit : les trois matières d'un son.
//
// D'après Fierro et Välimäki, JAES 71(7-8), 2023. La logique est dans `audio/stn.ts`, testée ;
// ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { separerStn, type ReglagesStn, type ResultatStn } from "../audio/stn";
import { parCanal } from "./hors-fil";

export const fiches: FicheAudio[] = ([
  {
    id: "stn-sinus-transitoires-bruit",
    nom: "Sinus + transitoires + bruit (STN)", nomEn: "Sines + Transients + Noise (STN)",
    univers: "Traitement", famille: "Effets",
    resume: "Sépare un son en trois matières (ce qui tient, ce qui claque, ce qui souffle) sans rien perdre.",
    resumeEn: "Splits a sound into three materials (what sustains, what strikes, what breathes) losing nothing.",
    // Ses sorties audio sont des pairs : aucune ne represente le noeud a elle seule, et un
    // lecteur generique en designerait une au hasard.
    sansApercuAudio: true,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Sinus", nomEn: "Sines", type: "audio" },
      { nom: "Transitoires", nomEn: "Transients", type: "audio" },
      { nom: "Bruit", nomEn: "Noise", type: "audio" },
    ],
    parametres: [
      { nom: "Fenêtre sinus", nomEn: "Sines window", type: "choix",
        options: ["2048", "4096", "8192"], optionsEn: ["2048", "4096", "8192"],
        optionIds: ["2048", "4096", "8192"], defaut: "4096", defautEn: "4096",
        doc: "Fenêtre de la première passe. Elle doit être longue : il faut du temps pour constater qu'une fréquence dure. Trop courte, les partielles ne se distinguent plus du reste.",
        docEn: "Window of the first pass. It must be long: it takes time to establish that a frequency lasts. Too short, and partials no longer stand out from the rest." },
      { nom: "Fenêtre transitoires", nomEn: "Transients window", type: "choix",
        options: ["256", "512", "1024"], optionsEn: ["256", "512", "1024"],
        optionIds: ["256", "512", "1024"], defaut: "512", defautEn: "512",
        doc: "Fenêtre de la seconde passe. Elle doit être courte : sur une fenêtre longue, une attaque est déjà diluée dans les dizaines de millisecondes qui l'entourent. C'est la raison d'être des deux passes : une seule analyse ne peut pas voir les deux à la fois.",
        docEn: "Window of the second pass. It must be short: in a long window an attack is already diluted into the tens of milliseconds around it. This is why there are two passes, a single analysis cannot see both at once." },
      { nom: "Filtre temporel", nomEn: "Time filter", type: "curseur", plage: [3, 51], pas: 2, defaut: 17,
        unite: " trames", uniteEn: " frames",
        doc: "Longueur du filtre médian le long du temps, qui efface ce qui ne dure pas.",
        docEn: "Length of the median filter along time, which erases what does not last." },
      { nom: "Filtre fréquentiel", nomEn: "Frequency filter", type: "curseur", plage: [3, 51], pas: 2, defaut: 17,
        unite: " bins", uniteEn: " bins",
        doc: "Longueur du filtre médian le long des fréquences, qui efface ce qui est étroit, une partielle, et garde ce qui est large, le bruit d'une attaque.",
        docEn: "Length of the median filter along frequency, which erases what is narrow, a partial, and keeps what is wide, the noise of an attack." },
      { nom: "Seuil", nomEn: "Threshold", type: "curseur", plage: [0.5, 0.95], pas: 0.01, defaut: 0.7,
        doc: "À partir de quelle franchise un point du spectrogramme bascule dans une matière. Haut, seule la matière la plus nette est retenue et le reste part au bruit ; bas, les trois voies se remplissent vite.",
        docEn: "How outspoken a spectrogram point must be to fall into a material. High, only the clearest material is kept and the rest goes to noise; low, all three paths fill up quickly." },
      { nom: "Flou", nomEn: "Fuzziness", type: "curseur", plage: [0, 0.6], pas: 0.01, defaut: 0.2,
        doc: "Largeur de la zone où un point appartient aux deux matières à la fois, en proportion ; c'est l'apport de l'article. À zéro, le partage redevient tout ou rien : plus net, et plus bruyant sur la matière qui n'est franchement ni l'une ni l'autre. Dans les deux cas les trois sorties, additionnées, redonnent le son de départ.",
        docEn: "Width of the zone where a point belongs to both materials at once, in proportion; this is the paper's contribution. At zero the split goes back to all-or-nothing: cleaner-cut, and noisier on material that is frankly neither. In both cases the three outputs, added together, give back the original sound." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e") };
      }
      const reglages = {
        tailleSinus: parseInt(ctx.paramTexte("Fenêtre sinus", "4096"), 10) || 4096,
        tailleTransitoires: parseInt(ctx.paramTexte("Fenêtre transitoires", "512"), 10) || 512,
        medianeTemps: Math.round(ctx.paramNombre("Filtre temporel", 17)),
        medianeFrequence: Math.round(ctx.paramNombre("Filtre fréquentiel", 17)),
        seuil: ctx.paramNombre("Seuil", 0.7),
        flou: ctx.paramNombre("Flou", 0.2),
      };
      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const faire = () => new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      const sinus = faire(), transitoires = faire(), bruit = faire();
      const parts = { sinus: 0, transitoires: 0, bruit: 0 };

      const voies = Array.from({ length: canaux }, (_, c) => entree.getChannelData(c));
      const parVoie = await parCanal<ReglagesStn, ResultatStn>(voies, reglages, {
        creerWorker: () => new Worker(new URL("../workers/stn-worker.ts", import.meta.url), { type: "module" }),
        calcul: separerStn,
        surProgres: (c, n) => ctx.onProgress?.(traduire("msg.stn.canal", String(c), String(n))),
      });

      for (let c = 0; c < canaux; c++) {
        const r = parVoie[c];
        sinus.getChannelData(c).set(r.sinus.subarray(0, length));
        transitoires.getChannelData(c).set(r.transitoires.subarray(0, length));
        bruit.getChannelData(c).set(r.bruit.subarray(0, length));
        parts.sinus += r.parts.sinus / canaux;
        parts.transitoires += r.parts.transitoires / canaux;
        parts.bruit += r.parts.bruit / canaux;
      }
      const pourcent = (v: number) => (v * 100).toFixed(0);
      return {
        valeurs: [sinus, transitoires, bruit],
        message: traduire("msg.stn.parts",
          pourcent(parts.sinus), pourcent(parts.transitoires), pourcent(parts.bruit)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
