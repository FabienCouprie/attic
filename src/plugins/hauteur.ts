// plugins/hauteur.ts — Le suiveur de hauteur : la caractéristique qui manquait aux courbes.
//
// D'après de Cheveigné et Kawahara, « YIN », JASA 111(4), 2002 ; et Mauch et Dixon, « pYIN »,
// ICASSP 2014. La logique est dans `audio/hauteur.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { lisser } from "../audio/courbe";
import {
  courbeDeConfiance, courbeDepuisHauteur, hauteurMediane, partVoisee, suivreVoie,
  type OptionsVoieHauteur, type SuiviHauteur,
} from "../audio/hauteur";
import { parCanal } from "./hors-fil";

export const fiches: FicheAudio[] = ([
  {
    id: "suiveur-hauteur", nom: "Suiveur de hauteur", nomEn: "Pitch Follower",
    univers: "Traitement", famille: "Effets",
    resume: "Suit la hauteur d'un son instant par instant, pour en piloter un effet.",
    resumeEn: "Follows a sound's pitch instant by instant, to drive an effect with it.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      // Même ordre que le Suiveur de caractéristique — courbe d'abord, audio ensuite — pour que
      // les deux se branchent de la même façon. La confiance vient en plus, à la fin.
      { nom: "Hauteur", nomEn: "Pitch", type: "courbe" },
      { nom: "Audio", type: "audio" },
      { nom: "Confiance", nomEn: "Confidence", type: "courbe" },
    ],
    parametres: [
      { nom: "Hauteur min", nomEn: "Lowest pitch", type: "curseur", plage: [27.5, 500], pas: 0.5, defaut: 55, unite: "Hz",
        doc: "La plus grave des hauteurs cherchées, et ce que le zéro de la courbe veut dire. Elle décide aussi du coût : la fenêtre d'analyse couvre deux de ses périodes, donc plus elle est grave, plus l'analyse est longue et moins elle suit un geste rapide.",
        docEn: "The lowest pitch searched for, and what the curve's zero means. It also decides the cost: the analysis window spans two of its periods, so the lower it is, the longer the analysis and the less it follows a fast gesture." },
      { nom: "Hauteur max", nomEn: "Highest pitch", type: "curseur", plage: [100, 4000], pas: 10, defaut: 1760, unite: "Hz",
        doc: "La plus aiguë des hauteurs cherchées, et ce que le UN de la courbe veut dire. L'échelle entre les deux est logarithmique : une octave vaut le même intervalle de courbe où qu'elle se trouve.",
        docEn: "The highest pitch searched for, and what the curve's one means. The scale between the two is logarithmic: an octave is worth the same curve interval wherever it falls." },
      { nom: "Décodage", nomEn: "Decoding", type: "choix",
        options: ["pYIN (chemin le plus probable)", "YIN (seuil simple)"],
        optionsEn: ["pYIN (most likely path)", "YIN (plain threshold)"],
        optionIds: ["pyin", "yin"], defaut: "pYIN (chemin le plus probable)", defautEn: "pYIN (most likely path)",
        doc: "pYIN garde plusieurs candidats par trame et choisit le chemin le plus probable sur tout le son : une trame ambiguë est tranchée par ses voisines. YIN ne garde qu'un candidat, et saute d'une octave quand le fondamental faiblit. Le second est là pour qu'on puisse entendre la différence plutôt que de me croire : sur une note tenue coupée de deux passages faibles, YIN rend 17 trames fautives sur 119, pYIN aucune.",
        docEn: "pYIN keeps several candidates per frame and picks the most likely path over the whole sound: an ambiguous frame is settled by its neighbours. YIN keeps a single candidate, and jumps an octave whenever the fundamental weakens. The second is here so the difference can be heard rather than taken on trust: on a held note broken by two weak passages, YIN returns 17 faulty frames out of 119, pYIN none." },
      { nom: "Inertie", nomEn: "Inertia", type: "curseur", plage: [0, 99], pas: 1, defaut: 30, unite: "%",
        doc: "Lissage de la courbe de hauteur, en aller-retour pour ne pas la décaler. À zéro, le vibrato passe tel quel ; haut, seule la ligne mélodique reste.",
        docEn: "Smoothing of the pitch curve, forwards then backwards so as not to shift it. At zero, vibrato passes through as is; high, only the melodic line remains." },
      { nom: "Cadence", nomEn: "Rate", type: "curseur", plage: [20, 400], pas: 10, defaut: 100, unite: "/s",
        doc: "Trames par seconde. C'est le réglage qui décide du coût, et il compte ici plus qu'ailleurs : une transformée par trame, soit environ 60 ms de calcul par seconde de son à cadence 50, 112 ms à 100 et 182 ms à 200.",
        docEn: "Frames per second. This is the setting that decides the cost, and it matters more here than elsewhere: one transform per frame, that is about 60 ms of computation per second of sound at rate 50, 112 ms at 100 and 182 ms at 200." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e") };
      }
      const fMin = ctx.paramNombre("Hauteur min", 55);
      const fMax = Math.max(fMin * 2, ctx.paramNombre("Hauteur max", 1760));
      // UNE SEULE VOIE : le suivi porte sur le canal de gauche, une hauteur étant une propriété de
      // la note jouée et non de l'image stéréo. Le socle n'en reçoit donc qu'une.
      const [suivi] = await parCanal<OptionsVoieHauteur, SuiviHauteur>(
        [entree.getChannelData(0)],
        {
          sampleRate: entree.sampleRate, fMin, fMax,
          cadence: Math.round(ctx.paramNombre("Cadence", 100)),
          viterbi: ctx.paramTexte("Décodage", "pyin") !== "yin",
        },
        {
          creerWorker: () => new Worker(new URL("../workers/hauteur-worker.ts", import.meta.url), { type: "module" }),
          calcul: suivreVoie,
        },
      );
      const brute = courbeDepuisHauteur(suivi, fMin, fMax);
      const inertie = ctx.paramNombre("Inertie", 30) / 100;
      const hauteur = { valeurs: lisser(brute.valeurs, inertie), cadence: brute.cadence };
      const mediane = hauteurMediane(suivi);
      return {
        // L'audio ressort tel quel : le suiveur s'insère dans une chaîne sans la couper.
        valeurs: [hauteur, entree, courbeDeConfiance(suivi)],
        message: traduire("msg.hauteur.suivi",
          String(suivi.hauteurs.length), (partVoisee(suivi) * 100).toFixed(0), mediane.toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
