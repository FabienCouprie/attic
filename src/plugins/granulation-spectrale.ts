// plugins/granulation-spectrale.ts — Le nœud « Granulation spectrale ». Le calcul et ses preuves
// sont dans `audio/granulation-spectrale.ts` ; ici, la prise.
//
// POURQUOI « GRAIN LU » ET « GRAIN ÉCRIT » SONT DEUX RÉGLAGES. C'est tout le procédé, et un seul
// réglage de taille le ferait disparaître : le grain ne garde que son spectre d'amplitude, et ce
// spectre se redimensionne avant d'être posé. Lire par 2048 et écrire par 256 n'est ni une
// transposition ni un étirement, c'est la même forme spectrale rendue à une autre échelle de temps.
//
// LES DEUX RÉGLAGES QUI N'AGISSENT QUE DANS UN MODE portent leur raison dans leur documentation,
// comme le contrat l'exige : « Vitesse » ne sert qu'à l'extraction séquentielle, et « Tours » ne
// sert qu'à la reconstruction de Griffin-Lim.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { choixFenetre } from "../audio/fenetres-analyse";
import {
  granulationSpectraleVoie,
  type ExtractionGrain, type FenetreGrain, type OptionsGranulationSpectrale,
  type PhaseGrain, type ResultatGranulationSpectrale,
} from "../audio/granulation-spectrale";
import { hasardDuNoeud } from "../core";
import { parCanal } from "./hors-fil";

const TAILLES = [256, 512, 1024, 2048, 4096, 8192];

export const fiches: FicheAudio[] = ([
  {
    id: "granulation-spectrale", nom: "Granulation spectrale", nomEn: "Spectral granulation",
    univers: "Traitement", famille: "Effets",
    resume: "Granule un son dans le domaine des fréquences : chaque grain ne garde que son spectre d'amplitude, et se réécrit à une autre taille.",
    resumeEn: "Granulates a sound in the frequency domain: each grain keeps only its magnitude spectrum, and is rewritten at another size.",
    notice: "Ce composant granule un son dans le domaine des fréquences. D'après Stefano Fasciani, « Spectral Granular Synthesis », Proceedings of the International Computer Music Conference, Daegu, 2018, p. 99-103.\n\nChaque grain est extrait du son reçu, enveloppé, transformé, et seul son spectre d'amplitude est gardé : la phase est jetée. Les spectres ainsi obtenus sont posés les uns après les autres, puis la phase de l'ensemble est reconstruite en une fois et le son revient au temps.\n\n« Grain lu » est la longueur du morceau pris dans le son reçu. « Grain écrit » est la longueur à laquelle son spectre est réécrit ; les deux sont indépendantes, et c'est ce qui distingue ce composant : le spectre est interpolé ou décimé pour tenir dans la nouvelle largeur, en gardant sa forme. Agrandir ajoute une modulation d'amplitude, qui s'entend comme une matière supplémentaire.\n\n« Recouvrement » est la part d'un grain écrit que le suivant recouvre. Il décide du nombre de spectres superposés, donc de l'épaisseur de la texture.\n\n« Fenêtre » est l'enveloppe du grain lu, et elle agit sur la largeur des raies du spectre retenu.\n\n« Extraction » décide d'où vient chaque grain. « Fixe » lit toujours au même endroit, donné par « Position ». « Séquentielle » part de « Position » et avance à « Vitesse », comptée en parts du son par seconde, négative pour remonter. « Aléatoire » tire chaque grain n'importe où. « Dispersion » ajoute un écart au hasard autour du point de lecture.\n\n« Décalage du spectre » tourne les bandes du spectre de chaque grain sur elles-mêmes : ce qui sort par l'aigu rentre par le grave, de sorte que rien ne se perd.\n\n« Phase » choisit comment la phase est retrouvée. PGHI l'intègre par le gradient, Griffin-Lim la cherche par allers et retours dont « Tours » donne le nombre, et « Nulle » la laisse à zéro, ce qui rend une matière impulsive.\n\n« Graine » fixe le hasard : deux exécutions de même graine rendent le même son.\n\nLa sortie « Audio » rend le son granulé. Le message donne le nombre de spectres posés et la part du spectrogramme que PGHI a pu intégrer.",
    noticeEn: "This node granulates a sound in the frequency domain. After Stefano Fasciani, « Spectral Granular Synthesis », Proceedings of the International Computer Music Conference, Daegu, 2018, pp. 99-103.\n\nEach grain is taken from the incoming sound, windowed, transformed, and only its magnitude spectrum is kept: the phase is discarded. The spectra obtained are laid one after another, then the phase of the whole is reconstructed in one pass and the sound returns to the time domain.\n\n« Read grain » is the length of the piece taken from the incoming sound. « Written grain » is the length its spectrum is rewritten at; the two are independent, and that is what sets this node apart: the spectrum is interpolated or decimated to fit the new width, keeping its shape. Enlarging adds an amplitude modulation, heard as further material.\n\n« Overlap » is the share of a written grain that the next one covers. It decides how many spectra are superposed, hence the thickness of the texture.\n\n« Window » is the envelope of the read grain, and it acts on the width of the lines in the kept spectrum.\n\n« Extraction » decides where each grain comes from. « Fixed » always reads at the same place, given by « Position ». « Sequential » starts at « Position » and moves at « Speed », counted in shares of the sound per second, negative to go backwards. « Random » takes each grain anywhere. « Spread » adds a random offset around the reading point.\n\n« Spectrum shift » rotates the bands of each grain's spectrum onto themselves: what leaves through the treble comes back through the bass, so nothing is lost.\n\n« Phase » chooses how the phase is recovered. PGHI integrates it from the gradient, Griffin-Lim searches it by passes whose number « Passes » gives, and « Zero » leaves it at zero, which yields an impulsive material.\n\n« Seed » fixes the randomness: two runs with the same seed return the same sound.\n\nThe « Audio » output returns the granulated sound. The message gives the number of spectra laid and the share of the spectrogram PGHI could integrate.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Durée", nomEn: "Length", type: "curseur", plage: [0.5, 30], pas: 0.5, defaut: 4, unite: "s",
        doc: "Durée du son rendu. Elle ne dépend pas de celle du son reçu : on pose autant de spectres qu'il en faut pour la remplir.",
        docEn: "Length of the returned sound. It does not depend on the length of the incoming sound: as many spectra are laid as it takes to fill it." },
      { nom: "Grain lu", nomEn: "Read grain", type: "choix", ...choixFenetre(TAILLES), defaut: "2048", defautEn: "2048",
        doc: "Longueur du morceau pris dans le son reçu, en échantillons. Court, il prend un instant et peu de détail fréquentiel ; long, il prend une couleur et perd l'instant.",
        docEn: "Length of the piece taken from the incoming sound, in samples. Short, it takes a moment and little frequency detail; long, it takes a colour and loses the moment." },
      { nom: "Grain écrit", nomEn: "Written grain", type: "choix", ...choixFenetre(TAILLES), defaut: "2048", defautEn: "2048",
        doc: "Longueur à laquelle le spectre du grain est réécrit, en échantillons. Plus petite que « Grain lu », elle resserre la forme spectrale ; plus grande, elle l'étale et ajoute une modulation d'amplitude.",
        docEn: "Length the grain's spectrum is rewritten at, in samples. Smaller than « Read grain », it tightens the spectral shape; larger, it spreads it and adds an amplitude modulation." },
      { nom: "Recouvrement", nomEn: "Overlap", type: "curseur", plage: [0, 95], pas: 5, defaut: 75, unite: "%",
        doc: "Part d'un grain écrit que le suivant recouvre. Elle décide du nombre de spectres superposés, donc de l'épaisseur de la texture et du nombre de grains lus.",
        docEn: "Share of a written grain covered by the next one. It decides how many spectra are superposed, hence the thickness of the texture and the number of grains read." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["Hann", "Hamming", "Blackman"], optionsEn: ["Hann", "Hamming", "Blackman"],
        optionIds: ["hann", "hamming", "blackman"], defaut: "Hann", defautEn: "Hann",
        doc: "Enveloppe du grain lu. Hann et Blackman descendent à zéro aux bords, Blackman plus doucement ; Hamming s'arrête à huit centièmes, ce qui resserre la raie principale et relève les lobes voisins.",
        docEn: "Envelope of the read grain. Hann and Blackman fall to zero at the edges, Blackman more gently; Hamming stops at eight hundredths, which narrows the main lobe and raises the neighbouring ones." },
      { nom: "Extraction", nomEn: "Extraction", type: "choix",
        options: ["Fixe", "Séquentielle", "Aléatoire"], optionsEn: ["Fixed", "Sequential", "Random"],
        optionIds: ["fixe", "sequentielle", "aleatoire"], defaut: "Séquentielle", defautEn: "Sequential",
        doc: "D'où vient chaque grain. Fixe lit toujours au même endroit, séquentielle parcourt le son, aléatoire tire n'importe où.",
        docEn: "Where each grain comes from. Fixed always reads at the same place, sequential travels through the sound, random takes it anywhere." },
      { nom: "Position", nomEn: "Position", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Endroit de lecture dans le son reçu, en part de sa durée. En extraction séquentielle, c'est le point de départ.",
        docEn: "Reading point in the incoming sound, as a share of its length. In sequential extraction, it is the starting point." },
      { nom: "Vitesse", nomEn: "Speed", type: "curseur", plage: [-4, 4], pas: 0.1, defaut: 1,
        doc: "Vitesse du parcours, en parts du son reçu par seconde de sortie ; négative, il remonte. N'agit qu'en extraction séquentielle, les deux autres ne parcourant rien.",
        docEn: "Speed of the travel, in shares of the incoming sound per second of output; negative, it goes backwards. Only acts in sequential extraction, the other two travelling nowhere." },
      { nom: "Dispersion", nomEn: "Spread", type: "curseur", plage: [0, 50], pas: 1, defaut: 0, unite: "%",
        doc: "Écart au hasard autour du point de lecture, en part du son reçu. À zéro, la lecture est exactement où les autres réglages la posent.",
        docEn: "Random offset around the reading point, as a share of the incoming sound. At zero, reading happens exactly where the other settings place it." },
      { nom: "Décalage du spectre", nomEn: "Spectrum shift", type: "curseur", plage: [-100, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Rotation des bandes du spectre de chaque grain, en part de la demi-bande. Ce qui sort par l'aigu rentre par le grave, de sorte que l'énergie est gardée entière.",
        docEn: "Rotation of each grain's spectral bands, as a share of the half band. What leaves through the treble comes back through the bass, so the energy is kept whole." },
      { nom: "Phase", nomEn: "Phase", type: "choix",
        options: ["PGHI", "Griffin-Lim", "Nulle"], optionsEn: ["PGHI", "Griffin-Lim", "Zero"],
        optionIds: ["pghi", "griffin", "nulle"], defaut: "PGHI", defautEn: "PGHI",
        doc: "Comment la phase est retrouvée. PGHI l'intègre par le gradient en une passe, Griffin-Lim la cherche par allers et retours, et Nulle la laisse à zéro, ce qui aligne toutes les bandes et rend une matière impulsive.",
        docEn: "How the phase is recovered. PGHI integrates it from the gradient in one pass, Griffin-Lim searches it by passes, and Zero leaves it at zero, which aligns every band and yields an impulsive material." },
      { nom: "Tours", nomEn: "Passes", type: "curseur", plage: [1, 32], pas: 1, defaut: 8,
        doc: "Nombre d'allers et retours de Griffin-Lim. N'agit que lorsque la phase est cherchée par Griffin-Lim ; PGHI n'itère pas, et une phase nulle n'a rien à chercher.",
        docEn: "Number of Griffin-Lim passes. Only acts when the phase is searched by Griffin-Lim; PGHI does not iterate, and a zero phase has nothing to search." },
      { nom: "Graine", nomEn: "Seed", graine: true, type: "curseur", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Fixe le hasard de l'extraction et de la dispersion. Deux exécutions de même graine rendent le même son.",
        docEn: "Fixes the randomness of extraction and spread. Two runs with the same seed return the same sound." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: en ? "No input." : "Aucune entrée." };
      }
      const lireTaille = (nom: string, defaut: number) => {
        const t = parseInt(ctx.paramTexte(nom, String(defaut)), 10);
        return TAILLES.includes(t) ? t : defaut;
      };
      const options: OptionsGranulationSpectrale = {
        dureeS: Math.max(0.1, ctx.paramNombre("Durée", 4)),
        tailleLue: lireTaille("Grain lu", 2048),
        tailleEcrite: lireTaille("Grain écrit", 2048),
        recouvrement: Math.max(0, Math.min(0.95, ctx.paramNombre("Recouvrement", 75) / 100)),
        fenetre: ctx.paramTexte("Fenêtre", "hann") as FenetreGrain,
        extraction: ctx.paramTexte("Extraction", "sequentielle") as ExtractionGrain,
        position: ctx.paramNombre("Position", 0) / 100,
        vitesse: ctx.paramNombre("Vitesse", 1),
        dispersion: Math.max(0, ctx.paramNombre("Dispersion", 0) / 100),
        decalage: Math.max(-1, Math.min(1, ctx.paramNombre("Décalage du spectre", 0) / 100)),
        phase: ctx.paramTexte("Phase", "pghi") as PhaseGrain,
        iterations: Math.max(1, Math.round(ctx.paramNombre("Tours", 8))),
        // LA GRAINE PASSE PAR LA RÉSOLUTION COMMUNE : zéro veut dire « tire-en une », et le tirage
        // doit alors être le même pour toutes les voies, d'où la lecture avant la boucle.
        graine: hasardDuNoeud(ctx.paramNombre("Graine", 0)).graine,
        sampleRate: audio.sampleRate,
      };

      // LE CALCUL SORT DU FIL DE L'INTERFACE : la reconstruction de phase parcourt tout le
      // spectrogramme, et la durée, la taille écrite et le recouvrement décident ensemble du
      // nombre de trames.
      const voies = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      const parVoie = await parCanal<OptionsGranulationSpectrale, ResultatGranulationSpectrale>(
        voies, options,
        {
          creerWorker: () => new Worker(new URL("../workers/granulation-spectrale-worker.ts", import.meta.url), { type: "module" }),
          calcul: granulationSpectraleVoie,
          surProgres: (c, n) => ctx.onProgress?.(en ? `Channel ${c}/${n}` : `Canal ${c}/${n}`),
        },
      );

      const longueur = Math.max(1, parVoie[0]?.son.length ?? 1);
      const sortie = new AudioBuffer({ numberOfChannels: voies.length, length: longueur, sampleRate: audio.sampleRate });
      for (let c = 0; c < voies.length; c++) sortie.copyToChannel(new Float32Array(parVoie[c].son), c);

      const trames = parVoie[0]?.trames ?? 0;
      const part = Math.round(100 * (parVoie[0]?.partIntegree ?? 0));
      const message = options.phase === "pghi"
        ? (en ? `${trames} spectra, ${part}% integrated` : `${trames} spectres, ${part} % intégrés`)
        : (en ? `${trames} spectra` : `${trames} spectres`);
      return { valeurs: [sortie], message };
    },
  },
] as FicheAudio[]).map(avecDoc);
