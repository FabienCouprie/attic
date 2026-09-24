// plugins/texture-statistique.ts — Nœud « Texture par statistiques ».
//
// D'après Josh H. McDermott et Eero P. Simoncelli, « Sound Texture Perception via Statistics of
// the Auditory Periphery: Evidence from Sound Synthesis », Neuron 71(5), 2011 —
// https://mcdermottlab.mit.edu/papers/McDermott_Simoncelli_2011_sound_texture_synthesis.pdf
//
// La logique est dans `audio/texture-statistique.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  traiterVoie, type OptionsVoieTexture, type ResultatTexture,
} from "../audio/texture-statistique";
import { parCanal } from "./hors-fil";

export const fiches: FicheAudio[] = ([
  {
    id: "texture-statistique", nom: "Texture par statistiques", nomEn: "Statistical Texture",
    univers: "Traitement", famille: "Effets",
    resume: "Engendre une texture neuve aux statistiques d'un son donné (pluie, feu, foule) sans en recopier un seul échantillon.",
    resumeEn: "Generates a new texture with the statistics of a given sound (rain, fire, crowd) without copying a single sample of it.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [1, 120], pas: 1, defaut: 10, unite: "s",
        doc: "Durée à engendrer. Elle n'a aucun rapport avec celle du modèle : les statistiques sont des moyennes dans le temps, si bien que cinq secondes de pluie en produisent deux minutes qui ne se répètent jamais.",
        docEn: "Duration to generate. It bears no relation to the model's: the statistics are time averages, so five seconds of rain produce two minutes that never repeat." },
      { nom: "Bandes", nomEn: "Bands", type: "choix",
        options: ["16", "20", "28"], optionsEn: ["16", "20", "28"], optionIds: ["16", "20", "28"],
        defaut: "20", defautEn: "20",
        doc: "Nombre de bandes cochléaires, espacées comme l'oreille les entend, serrées dans le grave, larges dans l'aigu. Plus il y en a, plus la couleur du modèle est suivie de près, et plus le calcul est long : le coût des corrélations croît avec leur carré.",
        docEn: "Number of cochlear bands, spaced as the ear hears them, narrow in the bass, wide in the treble. The more there are, the more closely the model's colour is followed, and the longer the computation: the cost of the correlations grows with their square." },
      { nom: "Corrélations", nomEn: "Correlations", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Imposer aussi les corrélations entre bandes, et pas seulement la distribution de chacune. C'est le résultat central de l'article : les bandes prises isolément ne font pas une texture reconnaissable. Mesuré ici sur une pluie de synthèse, l'écart statistique au modèle passe de 40 % à 31 % quand on les impose. Mettre « Non » sert surtout à entendre la différence.",
        docEn: "Also impose the correlations between bands, not merely each band's distribution. This is the paper's central result: bands taken in isolation do not make a recognisable texture. Measured here on a synthetic rain, the statistical distance to the model falls from 40 % to 31 % when they are imposed. Setting « No » mostly serves to hear the difference." },
      { nom: "Itérations", nomEn: "Iterations", type: "curseur", plage: [1, 20], pas: 1, defaut: 6,
        doc: "Tours de projections alternées entre distributions et corrélations : imposer les unes abîme les autres, et l'on alterne jusqu'à ce que les deux tiennent à peu près. Au-delà d'une dizaine, le gain devient imperceptible et le calcul double.",
        docEn: "Rounds of alternating projections between distributions and correlations: imposing one spoils the other, and one alternates until both roughly hold. Beyond about ten, the gain becomes imperceptible and the computation doubles." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 1,
        doc: "Graine du bruit de départ. Deux graines donnent deux textures différentes aux mêmes statistiques ; c'est exactement ce que deux enregistrements de la même pluie sont l'un pour l'autre.",
        docEn: "Seed of the starting noise. Two seeds give two different textures with the same statistics, which is exactly what two recordings of the same rain are to each other." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const { sampleRate, numberOfChannels: canaux } = entree;
      const longueur = Math.max(1, Math.round(ctx.paramNombre("Durée", 10) * sampleRate));
      const nombreBandes = parseInt(ctx.paramTexte("Bandes", "20"), 10) || 20;
      const correlations = ctx.paramTexte("Corrélations", "oui") !== "non";
      const iterations = Math.round(ctx.paramNombre("Itérations", 6));
      const graine = Math.round(ctx.paramNombre("Graine", 1));

      const sortie = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate });
      let ecart = 0;
      // La graine par canal est appliquée par `traiterVoie`, qui reçoit l'indice : les deux côtés
      // partagent les statistiques sans partager un échantillon, et la texture est large d'elle-même.
      const voies = Array.from({ length: canaux }, (_, c) => entree.getChannelData(c));
      const parVoie = await parCanal<OptionsVoieTexture, ResultatTexture>(
        voies, { longueur, sampleRate, nombreBandes, correlations, iterations, graine },
        {
          creerWorker: () => new Worker(new URL("../workers/texture-worker.ts", import.meta.url), { type: "module" }),
          calcul: traiterVoie,
          surProgres: (c, n) => ctx.onProgress?.(traduire("msg.texture.canal", String(c), String(n))),
        },
      );
      for (let c = 0; c < canaux; c++) {
        sortie.copyToChannel(new Float32Array(parVoie[c].son), c);
        ecart += parVoie[c].ecart / canaux;
      }
      return {
        valeurs: [sortie],
        message: traduire("msg.texture.resultat",
          (longueur / sampleRate).toFixed(1), String(nombreBandes), ecart.toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
