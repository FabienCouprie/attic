// plugins/visualiseur-multipiste.ts — Voir plusieurs sons ensemble, sur le même axe du temps.
//
// CE QU'IL RÉSOUT. Comparer deux prises, vérifier qu'une réverbération dure bien ce qu'on croit,
// trouver laquelle de trois versions s'arrête la première : cela demandait d'ouvrir les sons l'un
// après l'autre et de retenir ce qu'on venait de voir. Six bandes sur un seul axe le montrent d'un
// regard.
//
// IL NE REND AUCUN SON, ET C'EST VOULU. Une sortie audio par piste ferait six poignées de sortie
// dessinées en permanence, l'affichage à la demande ne valant que pour les entrées ; et une sortie
// peut déjà nourrir plusieurs entrées, si bien qu'on dérive une chaîne vers lui sans qu'il ait à la
// restituer. Décision de Fabien.
//
// IL GARDE DES ENVELOPPES, NON DES SONS. Voir `audio/pistes-visu.ts` : deux mille colonnes par piste
// au lieu du tampon entier, et la borne que cela pose à la finesse du tracé y est écrite.

import type { FicheAudio } from "../audio/types-domaine";
import { respirer } from "../core/respirer";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { creteDeColonnes, enveloppeDeTampon, type PisteVisu } from "../audio/pistes-visu";

/** Six, à la demande de Fabien. Au-delà, les bandes deviennent trop minces pour se lire. */
export const PISTES_VISU = 6;

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "visualiseur-multipiste", nom: "Visualiseur multipiste", nomEn: "Multitrack Viewer",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dessine jusqu'à six sons l'un sous l'autre, sur un axe du temps commun.",
    resumeEn: "Draws up to six sounds one under another, on a shared time axis.",
    notice: "Dessine les sons branchés sur ses entrées, une bande par piste, l'un sous l'autre et sur un axe du temps commun. Toutes les pistes commencent à zéro ; l'axe va jusqu'à la plus longue, si bien que les durées se comparent directement.\n\nIl montre deux pistes au départ ; les boutons « + » et « − », sous ses entrées, l'allongent ou le raccourcissent, jusqu'à six. Le « − » se refuse tant que la dernière piste est branchée.\n\nChaque bande donne, à chaque instant, le plus bas et le plus haut de ce que le son y fait, tous canaux confondus : une pointe brève reste visible, et ce qui ne se produit que sur un canal se voit aussi. Le rang de la piste et sa durée sont écrits à côté d'elle, ainsi que sa crête.\n\nLe tracé garde deux mille quarante-huit colonnes par piste : sur trois minutes, une colonne couvre quatre-vingt-huit millisecondes. Cela suffit à comparer des prises, à aligner une entrée, à voir où un son s'arrête ; cela ne permet pas de chercher un clic.\n\nLe nœud ne rend aucun son. Une sortie peut nourrir plusieurs entrées : on dérive une chaîne vers lui, et elle continue son chemin.",
    noticeEn: "Draws the sounds connected to its inputs, one lane per track, one under another on a shared time axis. Every track starts at zero; the axis runs to the longest, so durations compare directly.\n\nIt shows two tracks to begin with; the « + » and « - » buttons under its inputs make it longer or shorter, up to six. The « - » refuses while the last track is connected.\n\nEach lane gives, at every instant, the lowest and the highest the sound reaches there, all channels together: a brief peak stays visible, and what happens on one channel only is seen as well. The track number and its length are written beside it, along with its peak.\n\nThe drawing keeps two thousand and forty-eight columns per track: over three minutes, one column covers eighty-eight milliseconds. That is enough to compare takes, to align an entry, to see where a sound stops; it is not enough to hunt for a click.\n\nThe node returns no sound. One output can feed several inputs: a chain is tapped towards it and carries on.",
    entrees: Array.from({ length: PISTES_VISU }, (_, k) => ({
      nom: `Piste ${k + 1}`, nomEn: `Track ${k + 1}`, type: "audio" as const, requis: false,
    })),
    // Deux bandes suffisent au cas le plus fréquent, comparer deux sons ; les autres viennent à la
    // demande (cf. ui/ports-extensibles.ts).
    entreesExtensibles: { min: 2, defaut: 2 },
    sorties: [],
    parametres: [],
    async executer(ctx: any) {
      const pistes: PisteVisu[] = [];
      for (let k = 0; k < PISTES_VISU; k++) {
        const son = ctx.entree(k);
        if (!(son instanceof AudioBuffer)) continue;
        // RESPIRER ENTRE LES PISTES : six tampons de plusieurs minutes, c'est une boucle de dizaines
        // de millions d'échantillons, et elle figerait l'interface d'un seul tenant.
        await respirer();
        const colonnes = enveloppeDeTampon(son);
        pistes.push({ piste: k, dureeSec: son.duration, crete: creteDeColonnes(colonnes), colonnes });
      }
      // La vue lit ce champ : seule l'exécution connaît les sons branchés et leur durée.
      (ctx.noeud.data as any)._pistesVisu = pistes;
      if (pistes.length === 0) {
        return { valeurs: [], message: en() ? "No track connected." : "Aucune piste branchée." };
      }
      const duree = Math.max(...pistes.map((p) => p.dureeSec));
      return {
        valeurs: [],
        message: `${pistes.length} ${en() ? "tracks" : "pistes"} · ${duree.toFixed(2)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
