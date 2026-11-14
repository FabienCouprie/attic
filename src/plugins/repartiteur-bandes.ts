// plugins/repartiteur-bandes.ts — Nœud « Répartiteur de bandes » : une sortie audio par bande de fréquence.
//
// Demandé par Fabien le 2026-11-14 : un composant qui part des neuf bandes de l'égaliseur et rend,
// comme un séparateur de sources, une sortie par part du son, ici une part du spectre. Les deux
// méthodes, Linkwitz-Riley 8 et FFT à phase nulle, et les huit coupures réglables sont ses choix.
//
// La logique est dans `audio/repartiteur-bandes.ts`, testée ; ce fichier n'est que la prise.

import { fiche, reglagePartage } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  COUPURES_DEFAUT, NOMBRE_BANDES, coupuresUtiles, repartirVoie,
  type MethodeRepartition, type OptionsRepartition, type ResultatRepartition,
} from "../audio/repartiteur-bandes";
import { parCanal } from "./hors-fil";
import { entreeAudio, sansEntree } from "./lire-entree";

/**
 * Les numéros des coupures, un littéral chacun : c'est ce qui fait vérifier les huit noms qu'on en
 * tire, à la déclaration comme à la lecture. `satisfies` tient leur nombre égal à celui des coupures.
 */
const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies { length: typeof COUPURES_DEFAUT.length };

/** La course d'une coupure : deux octaves de part et d'autre de sa valeur par défaut, de 20 Hz à 20 kHz. */
const course = (defaut: number): [number, number] =>
  [Math.max(20, Math.round(defaut / 4)), Math.min(20000, Math.round(defaut * 4))];

export const fiches: FicheAudio[] = ([
  fiche({
    id: "repartiteur-bandes", nom: "Répartiteur de bandes", nomEn: "Band Splitter",
    univers: "Traitement", famille: "Effets",
    resume: "Découpe le son en neuf bandes de fréquence et rend chacune sur sa propre sortie.",
    resumeEn: "Splits the sound into nine frequency bands and returns each one on its own output.",
    notice: "Le Répartiteur de bandes découpe le son reçu en neuf bandes de fréquence et rend chacune sur sa propre sortie, de la plus grave à la plus aiguë. Huit fréquences de coupure séparent les bandes : la première bande prend tout ce qui est sous « Coupure 1 », la dernière tout ce qui est au-dessus de « Coupure 8 ».\n\n« Méthode » choisit le filtre. Les deux options donnent à chaque bande le même gain à chaque fréquence, et ne diffèrent que par la phase.\n• « Linkwitz-Riley 8 » sépare les bandes à chaque coupure par un filtre de Linkwitz-Riley d'ordre huit, de pente 48 dB par octave (S. H. Linkwitz, « Active Crossover Networks for Noncoincident Drivers », Journal of the Audio Engineering Society 24(1), 1976, p. 2-8). Chaque bande passe en outre par les filtres passe-tout des coupures situées au-dessus d'elle, ce qui met toutes les bandes en phase entre elles. La somme des neuf sorties a alors le gain de l'entrée à toutes les fréquences, mais sa phase tourne : sa forme d'onde n'est pas celle de l'entrée. Le filtre est causal ; rien ne sort avant l'instant qui l'excite.\n• « FFT à phase nulle » applique à chaque bande ce même gain sans aucun déphasage, par un filtre à réponse finie centré sur l'instant présent. La somme des neuf sorties redonne l'entrée, échantillon pour échantillon, à l'arrondi du calcul près. La réponse d'une bande s'étend avant l'instant qui l'excite : une attaque nette dans une bande grave s'y entend un peu avant d'arriver.\n\n« Coupure 1 » à « Coupure 8 » placent les huit frontières, en hertz. Par défaut, elles sont à mi-chemin, en octaves, entre les fréquences 32, 64, 125, 250 et 500 Hz, 1, 2, 4 et 8 kHz : chacune de ces neuf fréquences sort par sa propre bande avec une perte d'au plus 1,2 dB, et les deux bandes voisines la rendent atténuée d'au moins 24 dB. Les coupures sont rangées par ordre croissant avant l'emploi, et ramenées sous 45 % de la fréquence d'échantillonnage. Deux coupures égales laissent entre elles une bande presque vide.\n\nLes sorties « Bande 1 » à « Bande 9 » rendent chacune sa bande, de la longueur de l'entrée et avec autant de canaux qu'elle. Le message donne la méthode et les coupures employées.",
    noticeEn: "The Band Splitter cuts the received sound into nine frequency bands and returns each one on its own output, from the lowest to the highest. Eight crossover frequencies separate the bands: the first band takes everything below « Crossover 1 », the last everything above « Crossover 8 ».\n\n« Method » chooses the filter. Both options give each band the same gain at every frequency, and differ only in phase.\n• « Linkwitz-Riley 8 » separates the bands at each crossover with an eighth-order Linkwitz-Riley filter, with a slope of 48 dB per octave (S. H. Linkwitz, « Active Crossover Networks for Noncoincident Drivers », Journal of the Audio Engineering Society 24(1), 1976, pp. 2-8). Each band also goes through the all-pass filters of the crossovers above it, which puts all the bands in phase with one another. The sum of the nine outputs then has the input's gain at every frequency, but its phase turns: its waveform is not the input's. The filter is causal; nothing comes out before the instant that excites it.\n• « Zero-phase FFT » applies that same gain to each band with no phase shift at all, through a finite-response filter centred on the present instant. The sum of the nine outputs gives the input back, sample for sample, to within computational rounding. A band's response extends before the instant that excites it: a sharp attack in a low band is heard there a little before it arrives.\n\n« Crossover 1 » to « Crossover 8 » place the eight boundaries, in hertz. By default they lie halfway, in octaves, between the frequencies 32, 64, 125, 250 and 500 Hz, 1, 2, 4 and 8 kHz: each of these nine frequencies comes out through its own band with a loss of at most 1.2 dB, and the two neighbouring bands return it attenuated by at least 24 dB. The crossovers are sorted in increasing order before use, and brought below 45 % of the sample rate. Two equal crossovers leave an almost empty band between them.\n\nThe outputs « Band 1 » to « Band 9 » each return their band, as long as the input and with as many channels. The message gives the method and the crossovers used.",
    // Ses sorties audio sont des pairs : aucune ne represente le noeud a elle seule, et un
    // lecteur generique en designerait une au hasard.
    sansApercuAudio: true,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: Array.from({ length: NOMBRE_BANDES }, (_, k) => ({
      nom: `Bande ${k + 1}`, nomEn: `Band ${k + 1}`, type: "audio",
    })),
    parametres: [
      { nom: "Méthode", nomEn: "Method", type: "choix",
        options: ["Linkwitz-Riley 8", "FFT à phase nulle"], optionsEn: ["Linkwitz-Riley 8", "Zero-phase FFT"],
        optionIds: ["linkwitz-riley", "fft"], defaut: "Linkwitz-Riley 8", defautEn: "Linkwitz-Riley 8",
        doc: "Le filtre qui sépare les bandes. Les deux options donnent à chaque bande le même gain. « Linkwitz-Riley 8 » est causal : la somme des sorties a le gain de l'entrée, avec une phase qui tourne. « FFT à phase nulle » ne déphase pas : la somme des sorties redonne l'entrée, et la réponse d'une bande s'étend avant l'instant qui l'excite.",
        docEn: "The filter that separates the bands. Both options give each band the same gain. « Linkwitz-Riley 8 » is causal: the sum of the outputs has the input's gain, with a turning phase. « Zero-phase FFT » adds no phase shift: the sum of the outputs gives the input back, and a band's response extends before the instant that excites it." },
      ...NUMEROS.map((n, k) => reglagePartage({
        nom: `Coupure ${n}`, nomEn: `Crossover ${n}`, type: "curseur",
        plage: course(COUPURES_DEFAUT[k]), pas: 1, defaut: COUPURES_DEFAUT[k], unite: "Hz",
        doc: `Frontière entre la bande ${n} et la bande ${n + 1}, en hertz. Les coupures sont rangées par ordre croissant avant l'emploi.`,
        docEn: `Boundary between band ${n} and band ${n + 1}, in hertz. The crossovers are sorted in increasing order before use.`,
      })),
    ],
    async executer(ctx) {
      const entree = entreeAudio(ctx, 0, { sorties: NOMBRE_BANDES });
      if (sansEntree(entree)) return entree;
      const methode: MethodeRepartition = ctx.paramTexte("Méthode", "linkwitz-riley") === "fft" ? "fft" : "linkwitz-riley";
      const coupures = NUMEROS.map((n, k) => ctx.paramNombre(`Coupure ${n}`, COUPURES_DEFAUT[k]));

      const { numberOfChannels: canaux, length, sampleRate } = entree;
      // LE CALCUL SORT DU FIL DE L'INTERFACE : cent vingt sections de biquad par canal en
      // Linkwitz-Riley, neuf convolutions en FFT. Le repli dans le fil reste pour les tests, où il
      // n'y a pas de worker.
      const voies = Array.from({ length: canaux }, (_, c) => entree.getChannelData(c));
      const parVoie = await parCanal<OptionsRepartition, ResultatRepartition>(
        voies, { methode, coupures, frequence: sampleRate }, {
          creerWorker: () => new Worker(new URL("../workers/repartiteur-bandes-worker.ts", import.meta.url), { type: "module" }),
          calcul: repartirVoie,
          surProgres: (c, n) => ctx.onProgress?.(traduire("msg.repartiteur-bandes.canal", String(c), String(n))),
        });
      const bandes = Array.from({ length: NOMBRE_BANDES }, (_, b) => {
        const son = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
        // Recopie explicite, comme ailleurs : `copyToChannel` veut un tableau adossé à un
        // ArrayBuffer simple, et le tampon ne partage ainsi rien avec le calcul.
        for (let c = 0; c < canaux; c++) son.copyToChannel(new Float32Array(parVoie[c].bandes[b]), c);
        return son;
      });
      const employees = coupuresUtiles(coupures, sampleRate).map((c) => String(Math.round(c))).join(", ");
      return {
        valeurs: bandes,
        message: traduire(methode === "fft" ? "msg.repartiteur-bandes.fft" : "msg.repartiteur-bandes.lr", employees),
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
