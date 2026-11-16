// plugins/filtre-tb303.ts — Nœud « Filtre TB-303 » : le passe-bas à échelle de diodes de la Roland TB-303.
//
// Demandé par Fabien le 2026-11-15 : « le filtre TB 303 de Roland ». Les quatre décisions sont les
// siennes, prises le même jour sur la proposition chiffrée : une entrée MIDI qui déclenche l'enveloppe
// et l'accent ; une résonance qui à 100 % reste juste sous l'oscillation à toute coupure ; aucune
// compensation du niveau ; une coupure de 20 Hz à 20 kHz, qui est la fréquence de la résonance.
//
// LE CALCUL EST DANS DEUX MODULES PURS : `audio/enveloppe-tb303.ts` fait la coupure à partir des notes,
// `audio/filtre-tb303.ts` filtre, et sort du fil de l'interface par `workers/filtre-tb303-worker.ts`.
// Cette fiche lit les réglages, les courbes et les notes, et les leur passe.
//
// SANS MIDI, LES QUATRE RÉGLAGES DE L'ENVELOPPE SONT INERTES, et leur documentation le dit : il n'y a
// rien à envelopper. C'est la règle du contrat de nœud pour un réglage légitimement inerte.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, progressionPour, valeursParametre } from "../audio/courbe";
import { notesDuMidi } from "../audio/midi";
import { coupureEnveloppee } from "../audio/enveloppe-tb303";
import { filtrerVoieTb303, type OptionsFiltreTb303, type ResultatFiltreTb303 } from "../audio/filtre-tb303";
import { parCanal } from "./hors-fil";
import { entreeAudio, sansEntree } from "./lire-entree";

const SANS_NOTES = "Sans fichier MIDI sur l'entrée Notes, ce réglage est sans effet.";
const SANS_NOTES_EN = "With no MIDI file on the Notes input, this setting has no effect.";
const SANS_COURBE = "Sans courbe, ce réglage est sans effet.";
const SANS_COURBE_EN = "With no curve, this setting has no effect.";

export const fiches: FicheAudio[] = ([
  fiche({
    // « 303 » manque au lexique du moteur vocal : le nom parlé le remplace à la dictée.
    id: "filtre-tb303", nomDicte: "filtre à diodes", nom: "Filtre TB-303", nomEn: "TB-303 Filter",
    univers: "Traitement", famille: "Effets",
    resume: "Filtre le son par le passe-bas à échelle de diodes de la Roland TB-303, son enveloppe et son accent.",
    resumeEn: "Filters the sound through the diode-ladder low-pass of the Roland TB-303, with its envelope and accent.",
    etiquettes: ["303", "TB-303", "acid", "échelle de diodes", "diode ladder", "passe-bas", "low-pass", "résonance", "accent"],
    notice: "Le Filtre TB-303 filtre le son reçu par le passe-bas à échelle de diodes de la Roland TB-303, et fait suivre à sa coupure l'enveloppe et l'accent que cet instrument tire de ses notes.\n\n"
      + "Le filtre est une échelle de quatre étages couplés. Son condensateur du bas vaut 0,018 µF et les trois autres 0,033 µF, comme sur le schéma de l'instrument, et chaque barreau de diodes y suit une tangente hyperbolique : le filtre déforme d'autant plus le son que son niveau est élevé. Ses quatre pôles sont étalés : la pente s'accentue progressivement au-dessus de la coupure et n'atteint 24 dB par octave que loin au-dessus. La résonance est renvoyée de la sortie vers l'entrée à travers un passe-haut de 92 Hz. Le calcul se fait à deux fois la fréquence d'échantillonnage. Références : T. E. Stinchcombe, « Analysis of the Moog Transistor Ladder and Derivative Filters », 2008, et ses analyses de l'échelle à diodes de la TB-303 ; V. Zavalishin, « The Art of VA Filter Design », section « Diode ladder ».\n\n"
      + "« Coupure » est la fréquence où se forme la résonance, de 20 Hz à 20 kHz. À résonance nulle, le son est atténué de 3 dB à une fréquence 9,5 fois plus basse : pour une coupure de 800 Hz, vers 84 Hz.\n\n"
      + "« Résonance » règle la part de la sortie renvoyée à l'entrée, de 0 à 100 %. À 100 %, le gain de boucle vaut 0,943 fois celui qui ferait osciller l'échelle seule : le filtre n'oscille de lui-même à aucune coupure. La résonance creuse la bande passante, et le niveau n'est pas compensé : à 100 % et pour une coupure de 800 Hz, le son perd de 22 à 24 dB entre 100 et 200 Hz, et 15 dB à 30 Hz, sous le passe-haut de la boucle.\n\n"
      + "« Modulation coupure » et « Modulation résonance » reçoivent chacune une courbe qui remplace le réglage du même nom. « Modulation min » et « Modulation max » donnent la coupure que valent le zéro et le un de la courbe, « Résonance min » et « Résonance max » la résonance. Sans courbe, ces quatre réglages sont sans effet.\n\n"
      + "L'entrée « Notes » reçoit un fichier MIDI, dont chaque note relance l'enveloppe de la coupure :\n"
      + "• l'enveloppe monte en 3 ms, puis retombe à un dixième au bout du temps « Déclin », de 200 ms à 2 s ;\n"
      + "• une note qui commence avant la fin de la précédente glisse et ne relance rien, de sorte qu'un accord ne compte qu'une fois ;\n"
      + "• une note de vélocité au moins égale à « Vélocité d'accent » est accentuée : son déclin vaut 200 ms, et elle passe par le balayage d'accent.\n"
      + "Le début des notes se lit à partir du début du son reçu.\n\n"
      + "« Modulation d'enveloppe » règle la course de l'enveloppe, selon la correspondance qu'Open303 (Robin Schmidt) tire de mesures sur l'instrument. L'enveloppe monte la crête au-dessus de « Coupure » et descend le repos au-dessous, d'autant plus que la modulation est forte, et elle ne s'annule pas à 0 % : pour une coupure de 313,8 Hz, 0 % place le repos à 0,86 fois la coupure et la crête à 1,43 fois, 100 % les place à 0,40 et 9,08 fois.\n\n"
      + "« Accent » règle ce que le balayage d'accent ajoute à la coupure. Le balayage suit le circuit de l'instrument que décrit R. Whittle (« Devil Fish TB-303 Modifications », 1999) : une diode, une résistance de 47 kΩ, un potentiomètre de 100 kΩ qui est le second étage de celui de la résonance, et un condensateur de 1 µF. À résonance nulle, la coupure suit l'enveloppe de la note accentuée, et un accent isolé à 100 % la monte de deux octaves. À résonance forte, le condensateur lisse le balayage, qui monte moins haut et plus tard, et garde sa charge d'un accent au suivant : des accents rapprochés montent plus haut que le premier.\n\n"
      + "Sans fichier MIDI sur « Notes », « Modulation d'enveloppe », « Déclin », « Accent » et « Vélocité d'accent » sont sans effet, et la coupure est celle du réglage ou de la courbe.\n\n"
      + "La sortie « Audio » rend le son filtré, avec la durée, la fréquence d'échantillonnage et les canaux reçus. Le message donne le nombre de notes jouées, accentuées et liées.\n\n"
      + "Le modèle laisse de côté les réseaux de liaison du circuit sous 16 Hz, le volume que l'accent ajoute sur l'instrument, et la dispersion des composants.",
    noticeEn: "The TB-303 Filter filters the received sound through the diode-ladder low-pass of the Roland TB-303, and makes its cutoff follow the envelope and the accent that this instrument draws from its notes.\n\n"
      + "The filter is a ladder of four coupled stages. Its bottom capacitor is 0.018 µF and the other three 0.033 µF, as on the instrument's schematic, and each rung of diodes follows a hyperbolic tangent: the filter distorts the sound the more, the higher its level. Its four poles are spread out: the slope steepens gradually above the cutoff and only reaches 24 dB per octave well above it. The resonance is sent back from the output to the input through a 92 Hz high-pass. The computation runs at twice the sample rate. References: T. E. Stinchcombe, « Analysis of the Moog Transistor Ladder and Derivative Filters », 2008, and his analyses of the TB-303 diode ladder; V. Zavalishin, « The Art of VA Filter Design », section « Diode ladder ».\n\n"
      + "« Cutoff » is the frequency where the resonance forms, from 20 Hz to 20 kHz. At zero resonance, the sound is 3 dB down at a frequency 9.5 times lower: for an 800 Hz cutoff, around 84 Hz.\n\n"
      + "« Resonance » sets the share of the output sent back to the input, from 0 to 100 %. At 100 %, the loop gain is 0.943 times the one that would make the ladder alone oscillate: the filter does not oscillate by itself at any cutoff. The resonance hollows out the pass-band, and the level is not compensated: at 100 % and for an 800 Hz cutoff, the sound loses 22 to 24 dB between 100 and 200 Hz, and 15 dB at 30 Hz, below the loop high-pass.\n\n"
      + "« Cutoff modulation » and « Resonance modulation » each receive a curve that replaces the setting of the same name. « Modulation min » and « Modulation max » give the cutoff that the curve's zero and one mean, « Resonance min » and « Resonance max » the resonance. With no curve, these four settings have no effect.\n\n"
      + "The « Notes » input receives a MIDI file, each note of which restarts the cutoff envelope:\n"
      + "• the envelope rises in 3 ms, then falls back to one tenth after the « Decay » time, from 200 ms to 2 s;\n"
      + "• a note that starts before the previous one ends slides and restarts nothing, so a chord counts only once;\n"
      + "• a note whose velocity is at least « Accent velocity » is accented: its decay is 200 ms, and it goes through the accent sweep.\n"
      + "Note starts are read from the start of the received sound.\n\n"
      + "« Envelope modulation » sets the travel of the envelope, following the mapping that Open303 (Robin Schmidt) draws from measurements on the instrument. The envelope raises the peak above « Cutoff » and lowers the rest point below it, the more so as the modulation grows, and it does not vanish at 0 %: for a 313.8 Hz cutoff, 0 % puts the rest point at 0.86 times the cutoff and the peak at 1.43 times, 100 % puts them at 0.40 and 9.08 times.\n\n"
      + "« Accent » sets what the accent sweep adds to the cutoff. The sweep follows the instrument's circuit described by R. Whittle (« Devil Fish TB-303 Modifications », 1999): a diode, a 47 kΩ resistor, a 100 kΩ potentiometer that is the second gang of the resonance one, and a 1 µF capacitor. At zero resonance, the cutoff follows the envelope of the accented note, and a single accent at 100 % raises it by two octaves. At high resonance, the capacitor smooths the sweep, which rises less high and later, and keeps its charge from one accent to the next: close accents rise higher than the first.\n\n"
      + "With no MIDI file on « Notes », « Envelope modulation », « Decay », « Accent » and « Accent velocity » have no effect, and the cutoff is that of the setting or of the curve.\n\n"
      + "The « Audio » output returns the filtered sound, with the received length, sample rate and channels. The message gives the number of notes played, accented and slid.\n\n"
      + "The model leaves out the circuit's coupling networks below 16 Hz, the volume that the accent adds on the instrument, and component spread.",
    entrees: [
      { nom: "Audio", type: "audio" },
      { nom: "Notes", nomEn: "Notes", type: "midi", requis: false },
      { nom: "Modulation coupure", nomEn: "Cutoff modulation", type: "courbe", requis: false, module: "Coupure" },
      { nom: "Modulation résonance", nomEn: "Resonance modulation", type: "courbe", requis: false, module: "Résonance" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Coupure", nomEn: "Cutoff", plage: [20, 20000], pas: 1, defaut: 800, unite: "Hz",
        doc: "La fréquence où se forme la résonance. À résonance nulle, le son est atténué de 3 dB à une fréquence 9,5 fois plus basse.",
        docEn: "The frequency where the resonance forms. At zero resonance, the sound is 3 dB down at a frequency 9.5 times lower." },
      { nom: "Résonance", nomEn: "Resonance", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "La part de la sortie renvoyée à l'entrée. À 100 %, le filtre reste juste sous l'oscillation. Elle creuse la bande passante, sans compensation du niveau.",
        docEn: "The share of the output sent back to the input. At 100 %, the filter stays just below oscillation. It hollows out the pass-band, with no level compensation." },
      { nom: "Modulation d'enveloppe", nomEn: "Envelope modulation", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: `La course de l'enveloppe : elle monte la crête au-dessus de la coupure et descend le repos au-dessous, et ne s'annule pas à 0 %. ${SANS_NOTES}`,
        docEn: `The travel of the envelope: it raises the peak above the cutoff and lowers the rest point below it, and does not vanish at 0 %. ${SANS_NOTES_EN}` },
      { nom: "Déclin", nomEn: "Decay", plage: [200, 2000], pas: 10, defaut: 500, unite: "ms",
        doc: `Le temps que l'enveloppe met à retomber à un dixième après une note ordinaire. Une note accentuée retombe en 200 ms. ${SANS_NOTES}`,
        docEn: `The time the envelope takes to fall back to one tenth after an ordinary note. An accented note falls back in 200 ms. ${SANS_NOTES_EN}` },
      { nom: "Accent", nomEn: "Accent", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: `Ce que le balayage d'accent ajoute à la coupure : à 100 % et à résonance nulle, un accent isolé la monte de deux octaves. ${SANS_NOTES}`,
        docEn: `What the accent sweep adds to the cutoff: at 100 % and zero resonance, a single accent raises it by two octaves. ${SANS_NOTES_EN}` },
      { nom: "Vélocité d'accent", nomEn: "Accent velocity", plage: [1, 127], pas: 1, defaut: 100,
        doc: `La vélocité à partir de laquelle une note est accentuée. ${SANS_NOTES}`,
        docEn: `The velocity from which a note is accented. ${SANS_NOTES_EN}` },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Coupure", plage: [20, 20000], pas: 1, defaut: 200, unite: "Hz",
        doc: `La coupure que vaut le zéro d'une courbe branchée sur l'entrée Modulation coupure. ${SANS_COURBE}`,
        docEn: `The cutoff that a curve's zero means on the Cutoff modulation input. ${SANS_COURBE_EN}` },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Coupure", plage: [20, 20000], pas: 1, defaut: 4000, unite: "Hz",
        doc: `La coupure que vaut le un de la courbe. ${SANS_COURBE}`,
        docEn: `The cutoff that the curve's one means. ${SANS_COURBE_EN}` },
      { nom: "Résonance min", nomEn: "Resonance min", modulationDe: "Résonance", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: `La résonance que vaut le zéro d'une courbe branchée sur l'entrée Modulation résonance. ${SANS_COURBE}`,
        docEn: `The resonance that a curve's zero means on the Resonance modulation input. ${SANS_COURBE_EN}` },
      { nom: "Résonance max", nomEn: "Resonance max", modulationDe: "Résonance", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: `La résonance que vaut le un de la courbe. ${SANS_COURBE}`,
        docEn: `The resonance that the curve's one means. ${SANS_COURBE_EN}` },
    ],
    async executer(ctx) {
      const entree = entreeAudio(ctx, 0);
      if (sansEntree(entree)) return entree;
      const { numberOfChannels: canaux, length: n, sampleRate } = entree;
      const modCoupure = ctx.entree(2);
      // La coupure est une fréquence : une courbe la parcourt en multipliant, comme l'unité le dit.
      const base = estCourbe(modCoupure)
        ? valeursParametre(modCoupure, n, 0, {
          min: ctx.paramNombre("Modulation min", 200), max: ctx.paramNombre("Modulation max", 4000),
          ...progressionPour({ unite: "Hz", pas: 1 }),
        })
        : ctx.paramNombre("Coupure", 800);
      const modResonance = ctx.entree(3);
      const resonance = estCourbe(modResonance)
        ? valeursParametre(modResonance, n, 0, {
          min: ctx.paramNombre("Résonance min", 0) / 100, max: ctx.paramNombre("Résonance max", 100) / 100,
        })
        : ctx.paramNombre("Résonance", 50) / 100;

      const notes = await notesDuMidi(ctx.entree(1));
      let coupure: number | Float32Array = base;
      let message = traduire("msg.filtre-tb303.sans-notes");
      if (notes) {
        const e = coupureEnveloppee({
          frequence: sampleRate, longueur: n, notes, coupure: base, resonance,
          modulation: ctx.paramNombre("Modulation d'enveloppe", 50) / 100,
          declin: ctx.paramNombre("Déclin", 500) / 1000,
          accent: ctx.paramNombre("Accent", 50) / 100,
          velociteAccent: ctx.paramNombre("Vélocité d'accent", 100),
        });
        coupure = e.coupure;
        message = traduire("msg.filtre-tb303.notes", e.jouees, e.accentuees, e.glissees);
      }

      const voies = Array.from({ length: canaux }, (_, c) => entree.getChannelData(c));
      const parVoie = await parCanal<OptionsFiltreTb303, ResultatFiltreTb303>(
        voies, { frequence: sampleRate, coupure, resonance }, {
          creerWorker: () => new Worker(new URL("../workers/filtre-tb303-worker.ts", import.meta.url), { type: "module" }),
          calcul: filtrerVoieTb303,
          surProgres: (c, total) => ctx.onProgress?.(traduire("msg.filtre-tb303.canal", String(c), String(total))),
        });
      const sortie = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate });
      // Recopie explicite : `copyToChannel` veut un tableau adossé à un ArrayBuffer simple.
      for (let c = 0; c < canaux; c++) sortie.copyToChannel(new Float32Array(parVoie[c].voie), c);
      return { valeurs: [sortie], message };
    },
  }),
] as FicheAudio[]).map(avecDoc);
