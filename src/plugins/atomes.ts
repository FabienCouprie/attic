// plugins/atomes.ts — Le nœud « Décomposition atomique ». La méthode est dans `audio/atomes.ts`,
// éprouvée pas à pas ; ici, la prise.
//
// POURQUOI DEUX SORTIES AUDIO, ET NON UNE. L'esquisse seule ne dit rien de ce qu'elle a laissé :
// on l'écoute, on la trouve ressemblante, et l'on ne sait pas de quoi la ressemblance est faite.
// Le résidu le dit — c'est exactement ce que les atomes n'ont pas su expliquer, et l'écouter
// apprend plus que l'esquisse elle-même. À nombre d'atomes suffisant il ne reste qu'un souffle ;
// à dix atomes, on y entend tout ce qui fait le grain du son.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  ECHELLES, EST_ECHELLE, decomposer, echellesEnEchantillons, repartition,
} from "../audio/atomes";

export const fiches: FicheAudio[] = ([
  {
    id: "decomposition-atomique", nom: "Décomposition atomique", nomEn: "Atomic Decomposition",
    univers: "Traitement", famille: "Effets",
    resume: "Décrit un son par les N grains de Gabor qui l'expliquent le mieux, et rend séparément l'esquisse obtenue et ce qu'elle a laissé.",
    resumeEn: "Describes a sound by the N Gabor grains that best explain it, and returns the resulting sketch and what it left behind, separately.",
    notice: "D'après Stéphane Mallat et Zhifeng Zhang, « Matching pursuits with time-frequency dictionaries », IEEE Transactions on Signal Processing 41(12), 1993, appliquée au son par Bob L. Sturm et décrite par Curtis Roads comme la décomposition atomique du microson.\n\nCe que la méthode fait, et qui n'existe nulle part ailleurs dans le catalogue. Une transformée de Fourier découpe le son en un nombre fixe de cases, toutes de même durée : une seule échelle pour un claquement de doigts comme pour une note tenue. Ici le son est décrit par une somme de grains de Gabor — des sinusoïdes sous une fenêtre — choisis un à un, chacun là où il explique le plus de signal restant, et pris dans plusieurs durées à la fois. Une attaque prend un atome court, une note tenue un atome long. Et l'on s'arrête quand on veut : c'est une esquisse du son, dont on règle le nombre de traits.\n\nÀ dix atomes, on entend ce qui suffit à reconnaître un son sans le reconnaître vraiment ; à quelques centaines, il revient. La question que le nœud pose est celle-là : combien de traits faut-il pour qu'un son reste lui-même ?\n\nLa garantie de la méthode est que l'énergie du résidu décroît à chaque atome, puisqu'on retire chaque fois la projection orthogonale de ce qui reste. C'est aussi le piège de sa mise en œuvre : la sélection du meilleur candidat passe par une transformée, mais son coefficient est approché — les fenêtres se recouvrent et les atomes ne sont pas orthogonaux entre eux. La projection est donc calculée exactement dans le temps. Prendre le coefficient de la transformée tel quel ferait remonter le résidu, ce qu'un test vérifie pas à pas.\n\nLes échelles se comparent à fenêtre égale. Une fenêtre deux fois plus longue accumule deux fois plus d'échantillons et gagnerait toujours sans cette mise à l'échelle : le dictionnaire multi-échelle ne servirait alors à rien, toutes les attaques étant décrites par des atomes longs qui les étalent.\n\nLa seconde sortie rend le résidu, et c'est la plus instructive des deux. L'esquisse seule ne dit pas de quoi sa ressemblance est faite ; le résidu dit exactement ce que les atomes n'ont pas su expliquer. Branchez les deux sur un comparateur, ou mesurez-les à la fiche technique.\n\nLe coût est borné par le nombre d'atomes, et non par la durée du son : chaque atome demande de retrouver le meilleur candidat de chaque échelle, puis de recalculer les seules trames que l'atome retiré vient de modifier. Le reste du son n'est pas retouché.",
    noticeEn: "After Stephane Mallat and Zhifeng Zhang, « Matching pursuits with time-frequency dictionaries », IEEE Transactions on Signal Processing 41(12), 1993, applied to sound by Bob L. Sturm and described by Curtis Roads as microsound's atomic decomposition.\n\nWhat the method does, and what exists nowhere else in the catalog. A Fourier transform cuts the sound into a fixed number of cells, all of the same duration: one single scale for a finger snap as for a held note. Here the sound is described by a sum of Gabor grains — sines under a window — chosen one at a time, each where it explains the most of the remaining signal, and taken from several durations at once. An attack takes a short atom, a held note a long one. And you stop when you like: it is a sketch of the sound, whose number of strokes you set.\n\nAt ten atoms you hear what is nearly enough to recognise a sound without quite recognising it; at a few hundred, it comes back. The question the node asks is that one: how many strokes does a sound need to stay itself?\n\nThe method's guarantee is that the residual's energy decreases with every atom, since each time the orthogonal projection of what remains is removed. It is also the trap of its implementation: selecting the best candidate goes through a transform, but its coefficient is approximate — windows overlap and atoms are not orthogonal to one another. The projection is therefore computed exactly in the time domain. Taking the transform's coefficient as is would make the residual rise again, which a test checks step by step.\n\nScales are compared at equal window. A window twice as long gathers twice as many samples and would always win without that scaling: the multi-scale dictionary would then be pointless, every attack being described by long atoms that smear it.\n\nThe second output returns the residual, and it is the more instructive of the two. The sketch alone does not say what its likeness is made of; the residual says exactly what the atoms failed to explain. Wire both into a comparator, or measure them with the spec sheet.\n\nThe cost is bounded by the number of atoms, not by the sound's duration: each atom means finding the best candidate at each scale, then recomputing only the frames the removed atom just changed. The rest of the sound is not touched.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Esquisse", nomEn: "Sketch", type: "audio" },
      { nom: "Résidu", nomEn: "Residual", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Atomes", nomEn: "Atoms", type: "curseur", plage: [1, 2000], pas: 1, defaut: 200,
        doc: "Combien de grains décrivent le son. C'est le nombre de traits de l'esquisse, et le seul réglage qui compte vraiment : à dix, on entend ce qui suffit presque à reconnaître le son ; à quelques centaines, il revient. Le coût de calcul y est proportionnel.",
        docEn: "How many grains describe the sound. It is the sketch's number of strokes, and the only setting that really matters: at ten, you hear what is nearly enough to recognise the sound; at a few hundred, it comes back. Computation cost is proportional to it." },
      { nom: "Échelles", nomEn: "Scales", type: "choix",
        options: ECHELLES.map((e) => e.fr), optionsEn: ECHELLES.map((e) => e.en),
        optionIds: ECHELLES.map((e) => e.id), defaut: "Les trois", defautEn: "All three",
        doc: "Les durées de fenêtre où chercher. Courtes, les atomes décrivent bien les attaques et mal les notes tenues ; longues, l'inverse. « Les trois » laisse la méthode choisir pour chaque trait, ce qui est tout l'intérêt d'un dictionnaire de Gabor — et un test vérifie qu'un clic prend bien une fenêtre courte là où une note tenue en prend une longue.",
        docEn: "The window durations to search in. Short, the atoms describe attacks well and held notes badly; long, the other way round. « All three » lets the method choose for each stroke, which is the whole point of a Gabor dictionary — and a test checks that a click does take a short window where a held note takes a long one." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], message: en ? "No input." : "Aucune entrée." };
      }
      const frequence = audio.sampleRate;
      const choix = ctx.paramTexte("Échelles", "trois");
      const echelles = echellesEnEchantillons(EST_ECHELLE(choix) ? choix : "trois", frequence);
      const voulus = Math.max(1, Math.round(ctx.paramNombre("Atomes", 200)));

      const debut = performance.now();
      const esquisses: Float32Array[] = [];
      const residus: Float32Array[] = [];
      let atomes: ReturnType<typeof decomposer>["atomes"] = [];
      let partExpliquee = 0;
      let rapportDb = 0;
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const d = decomposer(audio.getChannelData(c), { frequence, atomes: voulus, echelles });
        esquisses.push(d.esquisse);
        residus.push(d.residu);
        // Les chiffres annoncés sont ceux du premier canal : deux canaux d'une même prise donnent
        // des décompositions très voisines, et annoncer une moyenne laisserait croire à une mesure
        // sur l'ensemble alors que chaque canal est décomposé pour lui-même.
        if (c === 0) { atomes = d.atomes; partExpliquee = d.partExpliqueePc; rapportDb = d.rapportSignalResiduDb; }
      }
      const millisecondes = performance.now() - debut;

      const buffer = (canaux: Float32Array[]) => {
        const b = new AudioBuffer({ numberOfChannels: canaux.length, length: Math.max(1, canaux[0].length), sampleRate: frequence });
        for (let c = 0; c < canaux.length; c++) b.copyToChannel(new Float32Array(canaux[c]), c);
        return b;
      };

      const parEchelle = [...repartition(atomes).entries()].sort((a, b) => a[0] - b[0]);
      const lignes: string[] = [];
      lignes.push(en ? "ATOMIC DECOMPOSITION" : "DÉCOMPOSITION ATOMIQUE");
      lignes.push("");
      lignes.push(`  ${(en ? "Atoms kept" : "Atomes retenus").padEnd(22)}${atomes.length}`);
      lignes.push(`  ${(en ? "Energy explained" : "Énergie expliquée").padEnd(22)}${partExpliquee.toFixed(2)} %`);
      lignes.push(`  ${(en ? "Signal to residual" : "Signal sur résidu").padEnd(22)}${rapportDb.toFixed(2)} dB`);
      lignes.push(`  ${(en ? "Computed in" : "Calculé en").padEnd(22)}${Math.round(millisecondes)} ms`);
      if (parEchelle.length > 0) {
        lignes.push("");
        lignes.push(en ? "By window length" : "Par longueur de fenêtre");
        for (const [echelle, combien] of parEchelle) {
          const ms = ((echelle / frequence) * 1000).toFixed(0);
          lignes.push(`  ${`${ms} ms`.padStart(8)}  ${combien}`);
        }
      }
      if (atomes.length > 0) {
        lignes.push("");
        lignes.push(en ? "Strongest atoms" : "Atomes les plus forts");
        for (const a of atomes.slice(0, 12)) {
          const instant = (a.debut / frequence).toFixed(3);
          lignes.push(`  ${instant.padStart(7)} s  ${a.frequenceHz.toFixed(0).padStart(6)} Hz  ${((a.echelle / frequence) * 1000).toFixed(0).padStart(4)} ms`);
        }
      }

      return {
        valeurs: [buffer(esquisses), buffer(residus), lignes.join("\n")],
        message: [
          `${atomes.length} ${en ? "atoms" : "atomes"} · ${partExpliquee.toFixed(1)} % ${en ? "explained" : "expliqués"} · ${rapportDb.toFixed(1)} dB`,
          `${Math.round(millisecondes)} ms`,
        ].join("\n"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
