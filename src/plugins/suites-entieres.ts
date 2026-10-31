// plugins/suites-entieres.ts — Écouter une suite d'entiers, et mesurer ce qu'on entend.
//
// La table des suites et la convention de l'OEIS sont dans `audio/suites-entieres.ts`, testée, avec
// l'invariant publié de chacune ; ce fichier n'est que la prise.
//
// UNE TABLE PLUTÔT QU'UN NŒUD PAR SUITE, et c'est la décision du propriétaire. La liste des suites
// qu'on voudrait entendre ne ferme jamais, et un nœud par suite les ferait toutes presque
// identiques. La table s'allonge sans toucher au nœud, et c'est le précédent de la liste d'opcodes
// Csound et des fenêtres du micromontage.
//
// « DÉPART » N'AGIT QUE SUR SYRACUSE, et sa documentation le dit : les autres suites n'ont pas de
// point de départ, elles commencent à leur premier terme. Le contrat de composant l'autorise à
// cette condition.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import { valeurA } from "../audio/courbe";
import { PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2, normaliserModeSynthèse, sf2Chargee } from "./soundfontGlobal";
import {
  EST_SUITE, OEIS, decimalesDePi, fibonacci, notesDeSuite, periodeDePisano, premiers,
  recaman, suiteDeNorgard, syracuse, thueMorse, type Suite,
} from "../audio/suites-entieres";
import { terme as termeNorgard } from "../audio/norgard";
import { frequenceDeTravail } from "../audio/frequence-de-travail";

const SUITES_FR = ["Fibonacci", "Décimales de pi", "Syracuse", "Nombres premiers", "Thue-Morse", "Recamán", "Suite de l'infini"];
const SUITES_EN = ["Fibonacci", "Digits of pi", "Collatz", "Prime numbers", "Thue-Morse", "Recamán", "Infinity series"];
const SUITES_IDS = ["fibonacci", "pi", "syracuse", "premiers", "thue-morse", "recaman", "norgard"];

const MOD_TEMPO = { ...modulationNommee("Tempo", "Tempo", [20, 480], "BPM"), echelle: "logarithmique" as const, defauts: [40, 240] as [number, number] };
const MOD_VOLUME = { ...modulationNommee("Volume", "Volume", [0, 100], "%"), defauts: [0, 100] as [number, number] };

/** Les termes de la suite demandée, en entiers exacts. */
function termesDe(suite: Suite, combien: number, depart: number): bigint[] {
  switch (suite) {
    case "fibonacci": return fibonacci(combien);
    case "pi": return decimalesDePi(combien);
    case "syracuse": return syracuse(depart, combien);
    case "premiers": return premiers(combien);
    case "thue-morse": return thueMorse(combien);
    case "recaman": return recaman(combien);
    case "norgard": return suiteDeNorgard(combien, termeNorgard);
  }
}

export const fiches: FicheAudio[] = ([
  {
    id: "suites-entieres", nom: "Suites d'entiers", nomEn: "Integer Sequences",
    univers: "Entrées", famille: "Génération",
    resume: "Joue une suite d'entiers note par note, et mesure la période de ce qui sort.",
    resumeEn: "Plays an integer sequence note by note, and measures the period of what comes out.",
    notice: `Joue une suite d'entiers en faisant de chaque terme une note, et rend la période trouvée dans la suite des notes.

La convention suivie est celle du lecteur de l'Encyclopédie en ligne des suites d'entiers, dont la page publie les réglages : un modulo et un décalage de hauteur, un modulo et un décalage de durée, un tempo et une coupure du nombre de termes. La formule qui mène d'un terme à une note n'y figure pas ; celle retenue ici est la seule qui respecte les deux bornes publiées, soit le décalage ajouté au reste du terme par le modulo.

« Suite » choisit parmi sept, chacune avec sa référence dans l'Encyclopédie. Fibonacci, A000045, où chaque terme est la somme des deux précédents. Les décimales de pi, A000796, calculées par la formule de Machin en entiers exacts. Syracuse, A070165, où un terme pair se divise par deux et un terme impair se triple et s'augmente de un, jusqu'à atteindre un. Les nombres premiers, A000040. Thue-Morse, A010060, qui donne la parité du nombre de bits à un de chaque rang. Recamán, A005132, qui recule de son rang quand elle peut et avance sinon. Et la suite de l'infini de Per Nørgård, A004718, que le catalogue calcule déjà par ailleurs et qui sert ici de point de comparaison.

« Départ » est le premier terme de Syracuse, et n'agit que sur elle : les autres suites commencent à leur premier terme et n'ont pas de point de départ à choisir. Syracuse s'arrête d'elle-même en atteignant un, de sorte que son nombre de notes est un résultat et non un réglage ; depuis 27 elle prend 111 pas et culmine à 9232.

« Termes » est le nombre de termes joués, et la borne de Syracuse quand elle ne s'arrête pas.

« Modulo de hauteur » et « Décalage de hauteur » ramènent chaque terme sur le clavier. Un modulo de 88 avec un décalage de 21 couvre exactement les quatre-vingt-huit touches d'un piano. Changer le modulo change ce qu'on entend d'une suite, et pas seulement sa transposition : Fibonacci réduit modulo dix est périodique de période soixante, modulo 128 de période 192. C'est une qualité du procédé, et le message donne la période trouvée pour qu'on la lise.

« Modulo de durée » et « Décalage de durée » font de même pour la longueur des notes : à un, toutes les notes durent pareil ; au-delà, le terme décide aussi de sa durée.

Les termes sont calculés en entiers exacts. Fibonacci sort de la précision ordinaire des nombres à virgule flottante à son soixante-dix-neuvième rang, et le reste porterait alors sur une valeur fausse sans que rien ne le signale.

« Tempo » donne la durée d'une noire, « Volume » le niveau du rendu. « Synthèse » et « Instrument » décident du moteur et du timbre.

Les entrées « Modulation tempo » et « Modulation volume » prennent la place de leur réglage quand une courbe y est branchée, chacune avec ses deux bornes ; sans courbe, ces bornes ne servent pas.

La sortie « Audio » porte le rendu, la sortie « MIDI » la suite comme fichier, et la sortie « Analyse » les termes, la période trouvée, le nombre de hauteurs employées et le plus petit et le plus grand terme.`,
    noticeEn: `Plays an integer sequence by turning each term into a note, and returns the period found in the sequence of notes.

The convention followed is that of the On-Line Encyclopedia of Integer Sequences player, whose page publishes the settings: a pitch modulus and offset, a duration modulus and offset, a tempo and a cutoff on the number of terms. The formula leading from a term to a note does not appear there; the one kept here is the only one that respects both published bounds, that is the offset added to the remainder of the term by the modulus.

« Sequence » chooses among seven, each with its Encyclopedia reference. Fibonacci, A000045, where each term is the sum of the two before it. The digits of pi, A000796, computed by Machin's formula in exact integers. Collatz, A070165, where an even term is halved and an odd one tripled and increased by one, until it reaches one. The prime numbers, A000040. Thue-Morse, A010060, which gives the parity of the number of one bits of each rank. Recamán, A005132, which steps back by its rank when it can and forward otherwise. And Per Nørgård's infinity series, A004718, which the catalogue already computes elsewhere and which serves here as a point of comparison.

« Start » is the first term of Collatz, and acts on it only: the other sequences begin at their first term and have no starting point to choose. Collatz stops by itself on reaching one, so its number of notes is a result and not a setting; from 27 it takes 111 steps and peaks at 9232.

« Terms » is the number of terms played, and the bound on Collatz when it does not stop.

« Pitch modulus » and « Pitch offset » bring each term onto the keyboard. A modulus of 88 with an offset of 21 covers exactly the eighty-eight keys of a piano. Changing the modulus changes what one hears of a sequence, and not only its transposition: Fibonacci reduced modulo ten is periodic with period sixty, modulo 128 with period 192. That is a quality of the method, and the message gives the period found so it can be read.

« Duration modulus » and « Duration offset » do the same for the length of the notes: at one, every note lasts the same; beyond, the term decides its length too.

The terms are computed in exact integers. Fibonacci leaves the ordinary precision of floating-point numbers at its seventy-ninth rank, and the remainder would then be taken on a wrong value with nothing to signal it.

« Tempo » gives the length of a quarter note, « Volume » the level of the render. « Synthesis » and « Instrument » decide the engine and the timbre.

The « Modulation tempo » and « Modulation volume » inputs take the place of their setting when a curve is connected, each with its two bounds; with no curve those bounds do nothing.

The « Audio » output carries the render, the « MIDI » output the sequence as a file, and the « Analysis » output the terms, the period found, the number of pitches used and the smallest and largest term.`,
    entrees: [
      portModulation("Tempo", "Tempo", { court: false }),
      portModulation("Volume", "Volume", { court: false }),
    ],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Suite", nomEn: "Sequence", type: "choix",
        options: SUITES_FR, optionsEn: SUITES_EN, optionIds: SUITES_IDS,
        defaut: "Fibonacci", defautEn: "Fibonacci",
        doc: "La suite jouée, parmi sept, chacune avec sa référence dans l'Encyclopédie en ligne des suites d'entiers.",
        docEn: "The sequence played, among seven, each with its reference in the On-Line Encyclopedia of Integer Sequences." },
      { nom: "Départ", nomEn: "Start", type: "curseur", plage: [1, 100000], pas: 1, defaut: 27,
        doc: "Le premier terme de Syracuse, et il n'agit que sur elle : les autres suites commencent à leur premier terme. Depuis 27, la trajectoire prend 111 pas et culmine à 9232.",
        docEn: "The first term of Collatz, and it acts on it only: the other sequences begin at their first term. From 27, the trajectory takes 111 steps and peaks at 9232." },
      { nom: "Termes", nomEn: "Terms", type: "curseur", plage: [2, 2048], pas: 1, defaut: 128,
        doc: "Le nombre de termes joués, et la borne de Syracuse quand elle ne s'arrête pas d'elle-même.",
        docEn: "The number of terms played, and the bound on Collatz when it does not stop by itself." },
      { nom: "Modulo de hauteur", nomEn: "Pitch modulus", type: "curseur", plage: [1, 128], pas: 1, defaut: 88,
        doc: "Le reste par lequel chaque terme est ramené sur le clavier. Il décide de ce qu'on entend d'une suite, et pas seulement de sa transposition : Fibonacci réduit modulo dix est périodique de période soixante, modulo 128 de période 192.",
        docEn: "The remainder by which each term is brought onto the keyboard. It decides what one hears of a sequence, and not only its transposition: Fibonacci reduced modulo ten is periodic with period sixty, modulo 128 with period 192." },
      { nom: "Décalage de hauteur", nomEn: "Pitch offset", type: "curseur", plage: [0, 128], pas: 1, defaut: 21,
        doc: "La note la plus basse atteignable. Avec un modulo de 88, un décalage de 21 couvre exactement les quatre-vingt-huit touches d'un piano. La convention publiée veut que la somme des deux reste sous 129, et le nœud la respecte en bornant la note.",
        docEn: "The lowest reachable note. With a modulus of 88, an offset of 21 covers exactly the eighty-eight keys of a piano. The published convention requires the sum of the two to stay below 129, and the node respects it by bounding the note." },
      { nom: "Modulo de durée", nomEn: "Duration modulus", type: "curseur", plage: [1, 5], pas: 1, defaut: 1,
        doc: "Le reste par lequel le terme décide aussi de la durée de sa note. À un, toutes les notes durent pareil.",
        docEn: "The remainder by which the term also decides the length of its note. At one, every note lasts the same." },
      { nom: "Décalage de durée", nomEn: "Duration offset", type: "curseur", plage: [0, 5], pas: 1, defaut: 1,
        doc: "La durée la plus courte, en crans de noire.",
        docEn: "The shortest length, in quarter-note steps." },
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [20, 480], pas: 1, defaut: 120, unite: "BPM",
        doc: "La durée d'une noire, et le tempo inscrit dans le fichier MIDI produit.",
        docEn: "The length of a quarter note, and the tempo written into the produced MIDI file." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique emploie la SoundFont si un fichier SF2 est chargé, sinon la synthèse FM.",
        docEn: "Auto uses the SoundFont if an SF2 file is loaded, else FM synthesis." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau du rendu audio. Le fichier MIDI n'en dépend pas.",
        docEn: "The level of the audio render. The MIDI file does not depend on it." },
      ...bornesModulation(MOD_TEMPO),
      ...bornesModulation(MOD_VOLUME),
    ],
    async executer(ctx) {
      const { notesVersFichierMidi, appliquerInstrumentMidi, rendreSequence } = await import("../audio");
      const lue = ctx.paramTexte("Suite", "fibonacci");
      const suite: Suite = EST_SUITE(lue) ? lue : "fibonacci";
      const combien = Math.round(ctx.paramNombre("Termes", 128));
      const depart = Math.round(ctx.paramNombre("Départ", 27));

      const termes = termesDe(suite, combien, depart);
      // LE TEMPO EST LU AVANT LES COURBES parce qu'il décide de la longueur du rendu : sa valeur
      // la plus lente donne la durée, et une courbe ne peut pas être construite sur une longueur
      // qu'elle déterminerait elle-même.
      const tempo = ctx.paramNombre("Tempo", 120);
      const { notes, rapport } = notesDeSuite(termes, {
        moduloHauteur: ctx.paramNombre("Modulo de hauteur", 88),
        decalageHauteur: ctx.paramNombre("Décalage de hauteur", 21),
        moduloDuree: ctx.paramNombre("Modulo de durée", 1),
        decalageDuree: ctx.paramNombre("Décalage de durée", 1),
        noireSec: 60 / Math.max(1, tempo),
      });

      const n = Math.max(1, Math.round((notes[notes.length - 1]?.fin ?? 1) * frequenceDeTravail()));
      const volume = reglageModule(ctx, n, 1, {
        // « PROPORTION » PARCE QUE C'EST CE QU'ON MULTIPLIE : la courbe branchée vient ici
        // multiplier des échantillons, et un facteur 80 à la place de 0,80 sortait ce nœud à
        // près de vingt décibels au-dessus de tous les autres. Le moteur de séquence, lui,
        // attend un pourcentage, et reçoit la conversion à son seul point d'appel.
        reglage: "Volume", defaut: 80, rendu: "proportion",
        noms: ["Volume min", "Volume max"], bornes: MOD_VOLUME.defauts,
      });
      const tempoModule = reglageModule(ctx, n, 0, {
        // LE TEMPO SE PARCOURT EN MULTIPLIANT, une octave de vitesse étant un doublement, et le
        // garde de l'échelle des bornes l'exige pour toute unité multiplicative.
        reglage: "Tempo", defaut: 120, rendu: "pourCent", echelle: "logarithmique",
        noms: ["Tempo min", "Tempo max"], bornes: MOD_TEMPO.defauts,
      });

      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const instrument = ctx.paramNombre("Instrument", 0);
      const { programme, banque } = decoderInstrumentSF2(instrument);

      // LA COURBE DE TEMPO REDÉCOUPE LES INSTANTS, note par note, chacune lisant la courbe à
      // l'instant où elle commence. C'est la sémantique du catalogue pour tout ce qui se décide par
      // événement, et la seule qui ait un sens ici : une note ne change pas de tempo en cours de
      // route, sa durée étant fixée quand elle part.
      const noire = 60 / Math.max(1, tempo);
      const jouees = typeof tempoModule === "number" ? notes : (() => {
        let t = 0;
        return notes.map((no) => {
          const crans = (no.fin - no.debut) / noire;
          const i = Math.min(tempoModule.length - 1, Math.max(0, Math.round(no.debut * frequenceDeTravail())));
          const d = crans * (60 / Math.max(1, tempoModule[i]));
          const sortie = { ...no, debut: t, fin: t + d };
          t += d;
          return sortie;
        });
      })();

      const midi = notesVersFichierMidi(jouees, tempo, 0);
      const texte = traduire("msg.suitesEntieres.analyse",
        OEIS[suite], String(rapport.termes), String(rapport.periode),
        String(rapport.hauteurs), rapport.minimum, rapport.maximum,
        jouees.slice(0, 48).map((no) => no.note).join(" "));

      // UN NOMBRE VA AU MOTEUR, UNE COURBE S'APPLIQUE AU RENDU. Le moteur de séquence ne prend
      // qu'un nombre : une courbe branchée n'y agirait que par sa première valeur, c'est-à-dire
      // presque pas. Elle multiplie donc le rendu échantillon par échantillon, sur un rendu fait
      // à pleine échelle. Un volume fixe, lui, passe par le moteur comme dans les treize autres
      // nœuds qui l'appellent, ce qui range la sortie de ce nœud au niveau des leurs.
      const rendu = await rendreSequence(
        jouees, modeRendu, typeof volume === "number" ? volume * 100 : 100, programme, banque);
      if (typeof volume !== "number") {
        for (let c = 0; c < rendu.numberOfChannels; c++) {
          const d = rendu.getChannelData(c);
          for (let i = 0; i < d.length; i++) d[i] *= valeurA(volume, i);
          rendu.copyToChannel(d, c);
        }
      }

      return {
        valeurs: [
          rendu,
          await appliquerInstrumentMidi(midi, instrument),
          texte,
        ],
        message: traduire("msg.suitesEntieres.rendu",
          OEIS[suite], String(rapport.termes),
          rapport.periode > 0 ? String(rapport.periode) : traduire("suites.aucune"),
          String(rapport.hauteurs),
          suite === "fibonacci" ? String(periodeDePisano(ctx.paramNombre("Modulo de hauteur", 88))) : "-"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
