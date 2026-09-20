// plugins/modeles-physiques.ts — Instruments par modèle physique.
//
// Attic synthétise en FM, en additif, en granulaire, par échantillons et par réseau de
// neurones. Il ne simulait aucun INSTRUMENT : pas de tuyau dans lequel une onde fait
// l'aller-retour, pas de corde frottée, pas de barre qui vibre sur ses modes propres. Ces
// nœuds comblent ce manque, d'après les modèles du Synthesis ToolKit de Stanford (Perry
// Cook, Julius Smith).
//
// L'intérêt n'est pas l'économie de calcul mais le COMPORTEMENT : un modèle de ce genre
// met un temps à s'établir, refuse de sonner si on l'excite trop peu, change de timbre avec
// la dynamique au lieu de changer seulement de volume. Rien de tout cela n'est programmé
// comme un effet ; cela tombe du modèle, et c'est ce qu'aucun échantillon ne donne.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import {
  FREQUENCE_ECH, frequenceDe, lireNote, melanger, notesDuMidi, versBuffer,
} from "./instruments-communs";
import { SECOUEURS, secoueur, secoussesRegulieres, synthetiserSecoueur, type Secousse } from "../audio/phisem";
import { synthetiserVent, type Vent } from "../audio/guides-onde";
import { BARRES, barre, synthetiserBarre } from "../audio/barre-modale";

const FS = FREQUENCE_ECH;

export const fiches: FicheAudio[] = ([
  {
    id: "secoueurs", nom: "Secoueurs", nomEn: "Shakers",
    univers: "Traitement", famille: "Effets",
    resume: "Percussions secouées — maracas, cabasa, tambourin, grelots — par modèle stochastique de particules.",
    resumeEn: "Shaken percussion — maracas, cabasa, tambourine, sleigh bells — from a stochastic particle model.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Instrument", nomEn: "Instrument", type: "choix",
        options: SECOUEURS.map((s) => s.fr), optionsEn: SECOUEURS.map((s) => s.en),
        optionIds: SECOUEURS.map((s) => s.id),
        defaut: "Maracas", defautEn: "Maracas",
        doc: "L'instrument. Ce qui les distingue vraiment, ce sont le nombre de particules — quelques graines dans une maraca, des centaines de billes sur une cabasa — et les résonances : la maraca sonne vers 3 kHz, les grelots ajoutent des modes métalliques vers 5 et 6 kHz.",
        docEn: "The instrument. What really tells them apart is the number of particles — a few seeds in a maraca, hundreds of beads on a cabasa — and the resonances: the maraca rings around 3 kHz, sleigh bells add metallic modes around 5 and 6 kHz." },
      { nom: "Secousses", nomEn: "Shakes", type: "nombre", plage: [0.5, 16], pas: 0.5, defaut: 4, unite: "/s",
        doc: "Nombre de secousses par seconde, quand aucun MIDI n'est branché. Un MIDI l'emporte : chaque note devient une secousse, et sa vélocité en fait l'énergie.",
        docEn: "Shakes per second, when no MIDI is connected. A MIDI file wins: each note becomes a shake, and its velocity sets the energy." },
      { nom: "Énergie", nomEn: "Energy", type: "nombre", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Force de chaque secousse. Elle ne fait pas que le volume : plus l'énergie est grande, plus les collisions sont probables, donc plus le grain est dense.",
        docEn: "Strength of each shake. It does not only set the volume: the more energy, the likelier the collisions, hence the denser the grain." },
      { nom: "Particules", nomEn: "Particles", type: "nombre", plage: [0, 512], pas: 1, defaut: 0,
        doc: "Remplace le nombre de particules de l'instrument. 0 = celui de l'instrument. C'est le réglage qui transforme un crépitement compté en chuintement continu.",
        docEn: "Overrides the instrument's particle count. 0 = the instrument's own. This is the setting that turns a countable rattle into a continuous hiss." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.2, 30], pas: 0.1, defaut: 4, unite: "s",
        doc: "Durée produite, quand aucun MIDI n'est branché.", docEn: "Duration produced, when no MIDI is connected." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "0 = tirée au sort à chaque exécution, et affichée dans le message. Toute autre valeur rejoue exactement le même son — ce qu'aucun vrai tambourin ne fait, et dont on a besoin ici.",
        docEn: "0 = drawn at random on every run, and shown in the message. Any other value replays the exact same sound — which no real tambourine does, and which is needed here." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      const energie = ctx.paramNombre("Énergie", 50) / 100;
      const particules = Math.round(ctx.paramNombre("Particules", 0));
      let duree = ctx.paramNombre("Durée", 4);
      let secousses: Secousse[];
      if (notes && notes.length > 0) {
        secousses = notes.map((n) => ({ instant: n.debut, energie: (n.velocite / 127) * energie }));
        duree = Math.max(...notes.map((n) => n.fin)) + 0.5;
      } else {
        secousses = secoussesRegulieres(duree, ctx.paramNombre("Secousses", 4), energie);
      }
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const choisi = secoueur(ctx.paramTexte("Instrument", "maracas"));
      const { signal, collisions } = synthetiserSecoueur({
        secoueur: choisi, duree, secousses, frequenceEch: FS,
        particules: particules > 0 ? particules : undefined,
      }, aleatoire);
      return {
        valeurs: [versBuffer(signal, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.phisem.resultat", secousses.length, collisions, graine),
      };
    },
  },
  {
    id: "vent-guide-onde", nom: "Instrument à vent", nomEn: "Wind Instrument",
    univers: "Traitement", famille: "Effets",
    resume: "Clarinette, flûte ou cuivre par guide d'onde : un tuyau, une anche, et le timbre qui en découle.",
    resumeEn: "Clarinet, flute or brass by waveguide: a bore, a reed, and the timbre that follows.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Instrument", nomEn: "Instrument", type: "choix",
        options: ["Clarinette", "Flûte", "Cuivre"], optionsEn: ["Clarinet", "Flute", "Brass"],
        optionIds: ["clarinette", "flute", "cuivre"],
        defaut: "Clarinette", defautEn: "Clarinet",
        doc: "Le modèle. La clarinette a un tuyau fermé à un bout, ce qui ne laisse vivre que les harmoniques impairs — mesuré, les pairs pèsent 0,4 % des impairs, et c'est là toute sa couleur. La flûte est presque sinusoïdale. Le cuivre s'éclaircit quand on souffle fort, parce que l'onde se raidit en se propageant.",
        docEn: "The model. The clarinet's bore is closed at one end, which lets only odd harmonics live — measured, the even ones weigh 0.4 % of the odd, and that is its whole colour. The flute is nearly sinusoidal. The brass brightens when blown hard, because the wave steepens as it travels." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A3", defautEn: "A3",
        doc: "Note jouée quand aucun MIDI n'est branché (ex. A3, C4, F#5). Un MIDI l'emporte, et la ligne est jouée note à note.",
        docEn: "Note played when no MIDI is connected (e.g. A3, C4, F#5). A MIDI file wins, and the line is played note by note." },
      { nom: "Pression", nomEn: "Breath", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Pression de souffle. Sous 40 %, l'anche de la clarinette ne s'établit pas et il ne sort qu'un bruit — c'est le comportement d'une vraie anche, pas un défaut. Sur le cuivre, la pression change le timbre autant que le volume.",
        docEn: "Breath pressure. Below 40 %, the clarinet's reed does not start and only noise comes out — that is a real reed's behaviour, not a defect. On the brass, pressure changes the timbre as much as the volume." },
      { nom: "Souffle", nomEn: "Noise", type: "nombre", plage: [0, 100], pas: 1, defaut: 5, unite: "%",
        doc: "Part de bruit de souffle mêlée à la pression. Un peu de bruit rend l'attaque vivante ; beaucoup donne le son d'un joueur essoufflé.",
        docEn: "Amount of breath noise mixed into the pressure. A little makes the attack alive; a lot gives the sound of a winded player." },
      { nom: "Vibrato", nomEn: "Vibrato", type: "nombre", plage: [0, 100], pas: 1, defaut: 10, unite: "%",
        doc: "Profondeur du vibrato de souffle.", docEn: "Depth of the breath vibrato." },
      { nom: "Fréquence vibrato", nomEn: "Vibrato rate", type: "nombre", plage: [0.5, 12], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Vitesse du vibrato.", docEn: "Vibrato speed." },
      { nom: "Attaque", nomEn: "Attack", type: "nombre", plage: [0.005, 0.5], pas: 0.005, defaut: 0.05, unite: "s",
        doc: "Durée de montée du souffle. Le modèle met en plus son propre temps à s'établir : c'est la boucle qui se remplit.",
        docEn: "Breath rise time. The model also takes its own time to settle: that is the loop filling up." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.1, 10], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée de la note, quand aucun MIDI n'est branché.", docEn: "Note duration, when no MIDI is connected." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const instrument = ctx.paramTexte("Instrument", "clarinette") as Vent;
      const commun = {
        instrument, frequenceEch: FS,
        pression: ctx.paramNombre("Pression", 80) / 100,
        souffle: ctx.paramNombre("Souffle", 5) / 100,
        vibrato: ctx.paramNombre("Vibrato", 10) / 100,
        frequenceVibrato: ctx.paramNombre("Fréquence vibrato", 5),
        attaque: ctx.paramNombre("Attaque", 0.05),
        extinction: 0.05,
      };
      const { aleatoire } = hasardDuNoeud(1);
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes || notes.length === 0) {
        const duree = ctx.paramNombre("Durée", 2);
        const { signal, parle } = synthetiserVent({
          ...commun, frequence: frequenceDe(lireNote(ctx.paramTexte("Note", "A3"))), duree,
        }, aleatoire);
        return {
          valeurs: [versBuffer(signal, ctx.paramNombre("Volume", 80))],
          message: parle
            ? traduire("msg.vent.resultat", 1, duree.toFixed(1))
            : traduire("msg.vent.muet"),
        };
      }
      // Une ligne : chaque note est un souffle à part, et les queues se superposent —
      // c'est ce qui donne le legato d'un instrument réel.
      const fin = Math.max(...notes.map((n) => n.fin)) + 0.3;
      const melange = new Float32Array(Math.ceil(fin * FS));
      let parlantes = 0;
      for (const n of notes) {
        const duree = Math.max(0.08, n.fin - n.debut) + 0.15;
        const { signal, parle } = synthetiserVent({
          ...commun,
          frequence: frequenceDe(n.note),
          duree,
          pression: commun.pression * (0.6 + 0.4 * (n.velocite / 127)),
        }, aleatoire);
        if (parle) parlantes++;
        melanger(melange, signal, n.debut);
      }
      return {
        valeurs: [versBuffer(melange, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.vent.resultat", parlantes, fin.toFixed(1)),
      };
    },
  },
  {
    id: "barre-modale", nom: "Barre modale", nomEn: "Modal Bar",
    univers: "Traitement", famille: "Effets",
    resume: "Marimba, vibraphone, glockenspiel, cloche tubulaire ou bol, par synthèse modale aux rapports publiés.",
    resumeEn: "Marimba, vibraphone, glockenspiel, tubular bell or bowl, by modal synthesis on published ratios.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Instrument", nomEn: "Instrument", type: "choix",
        options: BARRES.map((b) => b.fr), optionsEn: BARRES.map((b) => b.en),
        optionIds: BARRES.map((b) => b.id),
        defaut: "Marimba", defautEn: "Marimba",
        doc: "L'instrument, c'est-à-dire ses rapports modaux. Une barre libre vibre sur 1 / 2,756 / 5,404 / 8,933 — des rapports non entiers, d'où sa couleur métallique. Creuser une arche sous une barre de marimba ramène son deuxième mode à 4 et son troisième à 10 : elle devient harmonique, donc musicale. La cloche tubulaire, elle, sonne sur 2 / 3 / 4,16 / 5,43, si bien que la note entendue n'existe pas dans le son.",
        docEn: "The instrument, that is, its modal ratios. A free bar vibrates on 1 / 2.756 / 5.404 / 8.933 — non-integer ratios, hence its metallic colour. Carving an arch under a marimba bar brings its second mode to 4 and its third to 10: it becomes harmonic, hence musical. The tubular bell rings on 2 / 3 / 4.16 / 5.43, so the note one hears is not in the sound at all." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "C4", defautEn: "C4",
        doc: "Note frappée quand aucun MIDI n'est branché. Un MIDI l'emporte, et chaque note devient un coup de maillet dont la vélocité règle la dureté.",
        docEn: "Note struck when no MIDI is connected. A MIDI file wins, and each note becomes a mallet stroke whose velocity sets the hardness." },
      { nom: "Dureté du maillet", nomEn: "Mallet hardness", type: "nombre", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Un maillet dur donne une impulsion courte, donc riche en aigus, et réveille les modes hauts ; un maillet mou ne réveille que le premier. C'est le réglage qui change le plus le timbre, et pour une raison physique et non par courbe de réglage.",
        docEn: "A hard mallet gives a short impulse, hence rich in highs, and wakes the upper modes; a soft one wakes only the first. It is the setting that changes the timbre most, and for a physical reason rather than by a tuning curve." },
      { nom: "Amortissement", nomEn: "Damping", type: "nombre", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "La main posée sur la barre : raccourcit toutes les résonances à la fois.",
        docEn: "A hand laid on the bar: shortens every resonance at once." },
      { nom: "Trémolo", nomEn: "Tremolo", type: "nombre", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Le trémolo du vibraphone, qui vient de ses disques tournants dans les tubes résonateurs. Sans effet sur les autres instruments, mais rien n'interdit d'essayer.",
        docEn: "The vibraphone's tremolo, which comes from the discs spinning in its resonator tubes. No effect on the other instruments, but nothing stops you trying." },
      { nom: "Fréquence trémolo", nomEn: "Tremolo rate", type: "nombre", plage: [0.5, 12], pas: 0.1, defaut: 5, unite: "Hz",
        doc: "Vitesse du trémolo.", docEn: "Tremolo speed." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.1, 15], pas: 0.1, defaut: 3, unite: "s",
        doc: "Durée du coup, quand aucun MIDI n'est branché. Le bol tibétain a besoin de plusieurs secondes pour que son battement s'entende.",
        docEn: "Length of the stroke, when no MIDI is connected. The Tibetan bowl needs several seconds for its beating to be heard." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const choisie = barre(ctx.paramTexte("Instrument", "marimba"));
      const commun = {
        barre: choisie, frequenceEch: FS,
        durete: ctx.paramNombre("Dureté du maillet", 50) / 100,
        amortissement: ctx.paramNombre("Amortissement", 0) / 100,
        tremolo: ctx.paramNombre("Trémolo", 0) / 100,
        frequenceTremolo: ctx.paramNombre("Fréquence trémolo", 5),
      };
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes || notes.length === 0) {
        const duree = ctx.paramNombre("Durée", 3);
        const signal = synthetiserBarre({
          ...commun, frequence: frequenceDe(lireNote(ctx.paramTexte("Note", "C4"), 60)), duree,
        });
        return {
          valeurs: [versBuffer(signal, ctx.paramNombre("Volume", 80))],
          message: traduire("msg.barre.resultat", 1, choisie.modes.length),
        };
      }
      // Les coups se superposent : une barre continue de sonner pendant la note suivante,
      // et c'est ce qui fait le halo d'un vibraphone.
      const queue = Math.max(...choisie.modes.map((m) => m.duree));
      const fin = Math.max(...notes.map((n) => n.debut)) + queue + 0.2;
      const melange = new Float32Array(Math.ceil(fin * FS));
      for (const n of notes) {
        const signal = synthetiserBarre({
          ...commun,
          frequence: frequenceDe(n.note),
          duree: Math.min(queue + 0.2, fin - n.debut),
          // Une note forte est frappée plus sèchement : c'est le geste du percussionniste.
          durete: Math.max(0, Math.min(1, commun.durete * (0.5 + (n.velocite / 127)))),
        });
        melanger(melange, signal, n.debut);
      }
      return {
        valeurs: [versBuffer(melange, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.barre.resultat", notes.length, choisie.modes.length),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
