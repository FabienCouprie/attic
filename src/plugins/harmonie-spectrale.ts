// plugins/harmonie-spectrale.ts — Un spectre calculé comme matériau de hauteurs.
//
// POURQUOI CE NŒUD N'EN DOUBLE AUCUN. Dix-neuf nœuds travaillent déjà sur des trames de Fourier :
// ils filtrent, gèlent, étirent, resynthétisent un SIGNAL. Celui-ci ne touche à aucun signal. Il
// calcule une suite de hauteurs et la fait circuler : le résultat se transpose, se joue, se grave.
// C'est la différence entre filtrer un son et écrire un agrégat dont les degrés viennent d'un
// spectre, et c'est ce que le dépôt ne savait pas faire.
//
// IL EST LE PREMIER PRODUCTEUR DU FLUX « PARTITION », et c'est pour lui que ce flux existe : ses
// hauteurs ne tombent pas sur le tempérament, et un port MIDI les arrondirait avant qu'elles
// n'atteignent le nœud suivant. Voir `audio/sequence.ts`.
//
// LES FORMULES VIENNENT DE LA LITTÉRATURE PUBLIÉE, jamais d'un code sous licence GPL : voir
// l'en-tête de `audio/harmonie-spectrale.ts` et la section 4 de `COMPOSITION-ASSISTEE.md`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  decrirePartiels, fondamentaleVirtuelle, modulationEnAnneau, partielsVersNotes,
  serieHarmonique, spectreDistordu, spectreFM, type Partiel,
} from "../audio/harmonie-spectrale";
import type { Sequence } from "../audio/sequence";

const en = () => langueCourante() === "en";

const PROCEDES = [
  { id: "serie", nom: "Série harmonique", nomEn: "Harmonic series" },
  { id: "distordu", nom: "Spectre distordu", nomEn: "Distorted spectrum" },
  { id: "anneau", nom: "Modulation en anneau", nomEn: "Ring modulation" },
  { id: "fm", nom: "Modulation de fréquence", nomEn: "Frequency modulation" },
];

export const fiches: FicheAudio[] = ([
  {
    id: "harmonie-spectrale",
    nom: "Harmonie spectrale", nomEn: "Spectral Harmony",
    univers: "Entrées", famille: "Génération",
    resume: "Calcule un spectre et le rend en hauteurs, écarts au tempérament compris.",
    resumeEn: "Computes a spectrum and returns it as pitches, keeping the deviations from equal temperament.",
    notice: "Calcule une suite de hauteurs à partir d'un spectre, et la rend sur une sortie « Séquence » que d'autres composants peuvent jouer ou graver.\n\nLes hauteurs obtenues ne tombent pas sur les touches d'un clavier, et c'est l'objet même du procédé : le septième partiel d'une série harmonique est à trente et un cents sous la septième mineure tempérée, le onzième à quarante-neuf cents sous la quarte augmentée. Ces écarts sont conservés jusqu'au son.\n\n« Procédé » choisit le calcul.\n\n« Série harmonique » place le partiel de rang k à k fois la fondamentale. C'est le spectre d'un son entretenu, et la référence des trois autres.\n\n« Spectre distordu » place le partiel de rang k à la fondamentale multipliée par k élevé au coefficient de distorsion. À un, c'est la série harmonique. En dessous, les partiels se resserrent et l'ensemble s'épaissit vers le grave. Au-dessus, ils s'écartent et la fondamentale perçue se défait. Le même calcul décrit l'inharmonicité d'une corde de piano, dont les partiels aigus montent au-delà de leur rang.\n\n« Modulation en anneau » rend toutes les sommes et toutes les différences entre les partiels de la fondamentale et la seconde fréquence. Le résultat n'est harmonique d'aucun côté, ce qui lui donne sa couleur entre l'accord et le timbre. Une différence négative se replie, une fréquence n'ayant pas de signe.\n\n« Modulation de fréquence » place les composantes à la porteuse plus ou moins un multiple de la modulante, chacune pondérée par la fonction de Bessel de l'indice. À indice nul il ne reste que la porteuse, et le nombre de bandes audibles croît à peu près comme l'indice plus un. La porteuse est la fondamentale.\n\n« Fondamentale » est la fréquence de départ, en hertz.\n\n« Partiels » est le nombre de rangs calculés. Il n'agit pas sur la modulation de fréquence, dont le nombre de bandes vient de l'indice.\n\n« Distorsion » est le coefficient du spectre distordu.\n\n« Seconde fréquence » est la fréquence modulante de la modulation en anneau.\n\n« Modulante » et « Indice » règlent la modulation de fréquence.\n\n« Durée » est la durée du partiel le plus grave. « Décroissance » décide de combien les partiels aigus s'éteignent plus tôt que lui, suivant une puissance de leur fréquence : à zéro ils durent tous autant et l'agrégat sonne comme un jeu d'orgue, à un un partiel deux fois plus aigu dure deux fois moins. Les départs ne bougent pas, et c'est ce qui conserve la fusion : ce qui fait entendre un son unique plutôt qu'un accord est l'attaque commune. « Étalement » décale le départ de chaque partiel sur celui qui le précède : à zéro, tout est plaqué en un agrégat ; au-dessus, le spectre s'arpège.\n\n« Nuance » est la vélocité du partiel le plus fort ; les autres suivent leur amplitude.\n\nLes hauteurs qui sortent de l'étendue d'un piano sont écartées plutôt que repliées à l'octave, ce qui inventerait des degrés que le calcul n'a pas produits. Deux partiels distants de moins d'un cent sont fondus en un seul.\n\nLa sortie « Analyse » donne, pour chaque partiel, sa fréquence, sa hauteur en demi-tons, son écart au tempéré et la fréquence de la touche la plus proche. Le message rappelle le procédé, le nombre de partiels retenus et la fondamentale virtuelle de l'ensemble, c'est-à-dire la hauteur que l'oreille attribue à l'agrégat même lorsqu'elle n'y est pas jouée.",
    noticeEn: "Computes a series of pitches from a spectrum and returns it on a « Sequence » output that other components can play or engrave.\n\nThe resulting pitches do not fall on the keys of a keyboard, and that is the whole point: the seventh partial of a harmonic series is thirty-one cents below the equal-tempered minor seventh, the eleventh forty-nine cents below the augmented fourth. Those deviations are kept all the way to the sound.\n\n« Process » selects the calculation.\n\n« Harmonic series » places partial k at k times the fundamental. It is the spectrum of a sustained tone, and the reference for the other three.\n\n« Distorted spectrum » places partial k at the fundamental times k raised to the distortion coefficient. At one, it is the harmonic series. Below, partials draw together and the whole thickens towards the bass. Above, they spread and the perceived fundamental dissolves. The same calculation describes the inharmonicity of a piano string, whose high partials rise beyond their rank.\n\n« Ring modulation » returns every sum and every difference between the partials of the fundamental and the second frequency. The result is harmonic on neither side, which gives it its colour between chord and timbre. A negative difference folds back, a frequency having no sign.\n\n« Frequency modulation » places components at the carrier plus or minus a multiple of the modulator, each weighted by the Bessel function of the index. At index zero only the carrier remains, and the number of audible sidebands grows roughly as the index plus one. The carrier is the fundamental.\n\n« Fundamental » is the starting frequency, in hertz.\n\n« Partials » is the number of ranks computed. It has no effect on frequency modulation, whose number of sidebands comes from the index.\n\n« Distortion » is the coefficient of the distorted spectrum.\n\n« Second frequency » is the modulating frequency of the ring modulation.\n\n« Modulator » and « Index » set the frequency modulation.\n\n« Duration » is the length of the lowest partial. « Decay » decides how much sooner high partials die away than it does, following a power of their frequency: at zero they all last the same and the aggregate sounds like an organ stop, at one a partial twice as high lasts half as long. The onsets do not move, and that is what preserves fusion: what makes a single sound rather than a chord is the common attack. « Spread » delays the start of each partial relative to the previous one: at zero everything is struck together as an aggregate; above, the spectrum arpeggiates.\n\n« Velocity » is the velocity of the loudest partial; the others follow their amplitude.\n\nPitches falling outside the range of a piano are dropped rather than folded to the octave, which would invent degrees the calculation did not produce. Two partials less than one cent apart are merged into one.\n\nThe « Analysis » output gives, for each partial, its frequency, its pitch in semitones, its deviation from equal temperament and the frequency of the nearest key. The message recalls the process, the number of partials kept and the virtual fundamental of the set, that is the pitch the ear attributes to the aggregate even when it is not played in it.",
    entrees: [],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Procédé", nomEn: "Process", type: "choix",
        options: PROCEDES.map((p) => p.nom), optionsEn: PROCEDES.map((p) => p.nomEn),
        optionIds: PROCEDES.map((p) => p.id), defaut: PROCEDES[0].nom, defautEn: PROCEDES[0].nomEn,
        doc: "Le calcul appliqué. Chacun est décrit dans la notice.",
        docEn: "The calculation applied. Each one is described in the notice." },
      { nom: "Fondamentale", nomEn: "Fundamental", plage: [20, 2000], pas: 1, defaut: 110, unite: "Hz",
        doc: "La fréquence de départ, et la porteuse de la modulation de fréquence.",
        docEn: "The starting frequency, and the carrier of the frequency modulation." },
      { nom: "Partiels", nomEn: "Partials", plage: [1, 64], pas: 1, defaut: 12,
        doc: "Le nombre de rangs calculés. Sans effet sur la modulation de fréquence.",
        docEn: "The number of ranks computed. No effect on frequency modulation." },
      { nom: "Distorsion", nomEn: "Distortion", plage: [0.5, 2], pas: 0.01, defaut: 1,
        doc: "L'exposant du spectre distordu. Un rend la série harmonique.",
        docEn: "The exponent of the distorted spectrum. One gives the harmonic series." },
      { nom: "Seconde fréquence", nomEn: "Second frequency", plage: [20, 2000], pas: 1, defaut: 165, unite: "Hz",
        doc: "La fréquence avec laquelle les partiels sont modulés en anneau.",
        docEn: "The frequency the partials are ring modulated with." },
      { nom: "Modulante", nomEn: "Modulator", plage: [1, 2000], pas: 1, defaut: 110, unite: "Hz",
        doc: "L'écart entre deux bandes de la modulation de fréquence.",
        docEn: "The spacing between two sidebands of the frequency modulation." },
      { nom: "Indice", nomEn: "Index", plage: [0, 20], pas: 0.1, defaut: 3,
        doc: "La largeur de la modulation de fréquence. À zéro, seule la porteuse subsiste.",
        docEn: "The width of the frequency modulation. At zero, only the carrier remains." },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 3, unite: "s",
        doc: "La durée de chaque note.", docEn: "The length of each note." },
      { nom: "Décroissance", nomEn: "Decay", plage: [0, 2], pas: 0.05, defaut: 0.5,
        doc: "De combien les partiels aigus s'éteignent plus tôt que le grave. À zéro, ils durent tous autant et l'agrégat sonne comme un jeu d'orgue. À un, un partiel deux fois plus aigu dure deux fois moins. Les départs ne bougent pas.",
        docEn: "How much sooner high partials die away than the low one. At zero they all last the same and the aggregate sounds like an organ stop. At one, a partial twice as high lasts half as long. The onsets do not move." },
      { nom: "Étalement", nomEn: "Spread", plage: [0, 2], pas: 0.01, defaut: 0, unite: "s",
        doc: "Le décalage entre deux partiels successifs. À zéro, l'agrégat est plaqué.",
        docEn: "The delay between two successive partials. At zero, the aggregate is struck together." },
      { nom: "Nuance", nomEn: "Velocity", plage: [1, 127], pas: 1, defaut: 100,
        doc: "La vélocité du partiel le plus fort ; les autres suivent leur amplitude.",
        docEn: "The velocity of the loudest partial; the others follow their amplitude." },
    ],
    async executer(ctx: any) {
      // LE RÉGLAGE REND L'IDENTIFIANT, PAS LE LIBELLÉ : c'est l'identifiant qui est enregistré,
      // pour qu'un graphe rouvert dans l'autre langue retrouve le même procédé. Le message, lui,
      // doit dire le nom que le réglage affiche, et non « serie ».
      const choisi = ctx.paramTexte("Procédé", PROCEDES[0].id);
      const def = PROCEDES.find((p) => p.id === choisi || p.nom === choisi || p.nomEn === choisi) ?? PROCEDES[0];
      const id = def.id;
      const procede = en() ? def.nomEn : def.nom;
      const f0 = ctx.paramNombre("Fondamentale", 110);
      const nombre = Math.round(ctx.paramNombre("Partiels", 12));

      let partiels: Partiel[];
      if (id === "distordu") {
        partiels = spectreDistordu(f0, nombre, ctx.paramNombre("Distorsion", 1));
      } else if (id === "anneau") {
        // LA SÉRIE DE LA FONDAMENTALE CONTRE UNE SEULE FRÉQUENCE, et non deux séries entières :
        // le produit de deux spectres de douze partiels en ferait deux cent quatre-vingt-huit,
        // dont l'oreille ne distingue rien. Le procédé garde sa couleur avec 2n composantes.
        partiels = modulationEnAnneau(serieHarmonique(f0, nombre).map((p) => p.frequence),
          [ctx.paramNombre("Seconde fréquence", 165)]);
      } else if (id === "fm") {
        partiels = spectreFM(f0, ctx.paramNombre("Modulante", 110), ctx.paramNombre("Indice", 3));
      } else {
        partiels = serieHarmonique(f0, nombre);
      }

      const notes = partielsVersNotes(partiels, {
        duree: ctx.paramNombre("Durée", 3),
        decroissance: ctx.paramNombre("Décroissance", 0.5),
        etalement: ctx.paramNombre("Étalement", 0),
        velocite: Math.round(ctx.paramNombre("Nuance", 100)),
      });
      if (notes.length === 0) {
        return {
          valeurs: [null, ""], erreur: true,
          message: en()
            ? "No partial falls within the range of a piano: lower the fundamental."
            : "Aucun partiel ne tombe dans l'étendue d'un piano : baisser la fondamentale.",
        };
      }

      const sequence: Sequence = { notes, tempo: 120, titre: procede };
      const virtuelle = fondamentaleVirtuelle(partiels.map((p) => p.frequence));
      const horsTempere = notes.filter((n) => !Number.isInteger(n.note)).length;
      return {
        valeurs: [sequence, decrirePartiels(partiels)],
        message: `${procede} · ${notes.length} ${en() ? "partials" : "partiels"} · `
          + `${horsTempere} ${en() ? "off the keyboard" : "hors du clavier"} · `
          + `${en() ? "virtual fundamental" : "fondamentale virtuelle"} ${virtuelle.toFixed(2)} Hz`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
