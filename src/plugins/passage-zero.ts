// plugins/passage-zero.ts — Caler les coupes d'un montage sur les passages par zéro.
//
// Le calcul vit dans `audio/passage-zero.ts`, éprouvé. Ce fichier n'est que la prise.
//
// POURQUOI IL SE POSE SUR LES ZONES ET NON SUR LE SON. Les composants qui coupent, masquent,
// extraient ou réinsèrent reçoivent tous une liste de zones : déplacer les frontières en amont
// profite donc à tous d'un coup, et aucun n'a à savoir que le calage existe. Ce nœud ne touche pas
// à l'audio, il ne fait que déplacer des instants de quelques échantillons.

import type { FicheAudio } from "../audio/types-domaine";
import { calerZones, type Pente, type Zone } from "../audio/passage-zero";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

const dB = (x: number) => (x <= 1e-9 ? "−∞" : (20 * Math.log10(x)).toFixed(1));

export const fiches: FicheAudio[] = ([
  {
    id: "caler-coupes",
    nom: "Caler les coupes", nomEn: "Snap Cuts",
    univers: "Traitement", famille: "Montage",
    resume: "Déplace les frontières des zones sur le passage par zéro le plus proche, pour que les coupes ne claquent pas.",
    resumeEn: "Moves zone boundaries to the nearest zero crossing, so that cuts do not click.",
    notice: `Déplace chaque frontière des zones reçues jusqu'au passage par zéro le plus proche de l'onde, et rend les zones ainsi calées.\n\nCouper une onde ailleurs qu'à zéro laisse une marche : l'échantillon vaut sept dixièmes puis, d'un coup, plus rien. Une marche contient toutes les fréquences, et c'est ce qu'on entend comme un clic. Déplacer la coupe de quelques échantillons suffit à la supprimer.\n\nLe sens de la pente compte autant que le zéro. Poser les deux bouts d'un raccord sur un zéro supprime la marche mais pas le coin : une onde qui montait et qui se met à descendre fait un angle, et un angle s'entend. Quand toutes les frontières sont calées sur un zéro montant, n'importe quel bout se raccorde à n'importe quel autre sans qu'on ait à choisir lesquels vont ensemble.\n\n« Recherche » est la distance au plus dont une frontière peut bouger, en millisecondes. Une frontière sans passage dans ce rayon reste où elle est, et le rapport la compte.\n\n« Pente » choisit le sens de la traversée. « Montante » est le réglage qui rend tous les raccords compatibles entre eux ; « Indifférente » prend le zéro le plus proche quel que soit son sens, ce qui bouge moins mais laisse des angles possibles.\n\nLa recherche se fait sur la somme des voies. Deux voies décorrélées ne passent pas par zéro au même instant, et aucun instant ne convient alors parfaitement aux deux : le rapport donne ce qui reste sur la plus mauvaise, avant et après, de sorte que la limite se voie.\n\nUne zone que le calage renverserait, son début passant après sa fin, est écartée plutôt que rendue à l'envers.\n\nLa sortie « Zones » porte les zones calées, dans la forme que les composants de montage attendent. La sortie « Analyse » donne le nombre de frontières, combien ont été calées, combien n'ont trouvé aucun passage, le déplacement moyen et le plus grand, et la marche restante avant et après.`,
    noticeEn: `Moves each boundary of the received zones to the nearest zero crossing of the waveform, and returns the zones thus snapped.\n\nCutting a waveform anywhere but at zero leaves a step: the sample is at seven tenths and then, all at once, nothing. A step contains every frequency, and that is what is heard as a click. Moving the cut by a few samples is enough to remove it.\n\nThe direction of the slope matters as much as the zero. Laying both ends of a splice on a zero removes the step but not the corner: a waveform that was rising and starts falling makes an angle, and an angle is heard. When every boundary is snapped to a rising zero, any end joins any other without having to choose which ones go together.\n\n« Search » is the greatest distance a boundary may move, in milliseconds. A boundary with no crossing within that radius stays where it is, and the report counts it.\n\n« Slope » chooses the direction of the crossing. « Rising » is the setting that makes every splice compatible with every other; « Either » takes the nearest zero whatever its direction, which moves less but leaves angles possible.\n\nThe search is made on the sum of the channels. Two uncorrelated channels do not cross zero at the same instant, and no instant then suits both perfectly: the report gives what remains on the worst one, before and after, so that the limit is visible.\n\nA zone that snapping would turn inside out, its start passing after its end, is dropped rather than returned reversed.\n\nThe « Zones » output carries the snapped zones, in the form the montage nodes expect. The « Analysis » output gives the number of boundaries, how many were snapped, how many found no crossing, the mean and greatest displacement, and the step remaining before and after.`,
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Zones", nomEn: "Zones", type: "controle" },
    ],
    sorties: [
      { nom: "Zones", nomEn: "Zones", type: "controle" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Recherche", nomEn: "Search", type: "curseur", plage: [0.1, 50], pas: 0.1, defaut: 5, unite: "ms",
        doc: "La distance au plus dont une frontière peut bouger. Au-delà, elle reste où elle est.",
        docEn: "The greatest distance a boundary may move. Beyond it, the boundary stays where it is." },
      { nom: "Pente", nomEn: "Slope", type: "choix",
        options: ["Montante", "Descendante", "Indifférente"],
        optionsEn: ["Rising", "Falling", "Either"],
        optionIds: ["montante", "descendante", "indifferente"],
        defaut: "Montante", defautEn: "Rising",
        doc: "Le sens de la traversée. Un seul sens pour toutes les frontières rend n'importe quel raccord compatible avec n'importe quel autre.",
        docEn: "The direction of the crossing. One single direction for every boundary makes any splice compatible with any other." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No sound at the input." : "Aucun son à l'entrée.",
        };
      }
      const recues = ctx.entree(1);
      const zones: Zone[] = (Array.isArray(recues) ? recues : [])
        .filter((z: any) => z && Number.isFinite(z.debut) && Number.isFinite(z.duree));
      if (zones.length === 0) {
        return {
          valeurs: [[], null], erreur: true,
          message: en() ? "No zone at the input." : "Aucune zone à l'entrée.",
        };
      }
      const canaux = Array.from({ length: a.numberOfChannels }, (_, c) => a.getChannelData(c));
      const { zones: calees, rapport } = calerZones(canaux, zones, {
        sampleRate: a.sampleRate,
        rayonMs: ctx.paramNombre("Recherche", 5),
        pente: ctx.paramTexte("Pente", "montante") as Pente,
      });

      const lignes = en() ? [
        `${rapport.frontieres} boundaries, ${rapport.calees} snapped, ${rapport.sansPassage} with no crossing`,
        `moved ${rapport.deplacementMoyenMs.toFixed(3)} ms on average, ${rapport.deplacementMaxMs.toFixed(3)} ms at most`,
        `worst step ${dB(rapport.residuAvant)} dB before, ${dB(rapport.residuApres)} dB after`,
        `${calees.length} zones returned`,
      ] : [
        `${rapport.frontieres} frontières, ${rapport.calees} calées, ${rapport.sansPassage} sans passage`,
        `déplacées de ${rapport.deplacementMoyenMs.toFixed(3)} ms en moyenne, ${rapport.deplacementMaxMs.toFixed(3)} ms au plus`,
        `pire marche ${dB(rapport.residuAvant)} dB avant, ${dB(rapport.residuApres)} dB après`,
        `${calees.length} zones rendues`,
      ];
      return {
        valeurs: [calees, lignes.join("\n")],
        message: `${rapport.calees}/${rapport.frontieres} ${en() ? "snapped" : "calées"} · `
          + `${rapport.deplacementMaxMs.toFixed(2)} ms ${en() ? "at most" : "au plus"} · `
          + `${dB(rapport.residuAvant)} → ${dB(rapport.residuApres)} dB`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
