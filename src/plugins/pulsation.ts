// plugins/pulsation.ts — La pulsation d'un son, tirée de ses atomes.
//
// LE CALCUL EST DANS `audio/pulsation.ts`, ÉPROUVÉ, et l'en-tête de ce fichier-là dit pourquoi les
// trois critères sont les trois champs d'une note. Ce fichier n'est que la prise.
//
// IL PREND UNE SÉQUENCE ET NON UN SON, et c'est ce qui le rend petit. La décomposition atomique
// rend déjà les atomes comme des notes datées : leur durée EST l'échelle, leur vélocité le poids,
// leur hauteur la fréquence. Refaire ici une analyse redirait ce qu'elle dit, et les deux se
// désaccorderaient.

import type { FicheAudio } from "../audio/types-domaine";
import {
  cadenceDesFrappes, echantillonsDeBattements, irregularite, pulsationDeSequence,
} from "../audio/pulsation";
import { estSequence, type Sequence } from "../audio/sequence";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/** La fréquence d'échantillonnage du rendu. */
const SR = 44100;

/** La hauteur en demi-tons d'une fréquence, pour que le seuil se règle en hertz. */
const hauteurDe = (hertz: number) => 69 + 12 * Math.log2(Math.max(1, hertz) / 440);

export const fiches: FicheAudio[] = ([
  {
    id: "pulsation", nom: "Pulsation", nomEn: "Pulse",
    univers: "Visualisation", famille: "Détecteurs",
    resume: "Garde les atomes courts, forts et graves d'un son décomposé, et les fait entendre comme un seul son qui bat.",
    resumeEn: "Keeps the short, strong, low atoms of a decomposed sound, and sounds them as a single beating tone.",
    notice: `Tire les frappes d'une suite d'atomes et les rend comme un seul son sourd qui bat.

Une frappe se décrit d'un atome court, la décomposition choisissant l'échelle la plus brève là où le signal est le plus transitoire ; elle est forte, une attaque portant l'essentiel de l'énergie de son instant ; et elle est grave, cette énergie se concentrant dans le bas du spectre. Les trois se lisent directement sur une note : sa durée est l'échelle de l'atome, sa vélocité son poids, sa hauteur sa fréquence.

« Durée maximale » écarte les tenues. Au-delà de ce seuil, l'atome décrit une note qui dure et non le moment où elle commence.

« Fréquence maximale » écarte l'aigu. Le seuil se règle en hertz, qui est l'unité dans laquelle on entend un grave.

« Force minimale » écarte les restes, en part de l'atome le plus fort du son reçu. Le poids d'un atome n'ayant pas d'échelle absolue, un seuil en valeur absolue ne voudrait rien dire d'un son à l'autre.

« Regroupement » décide de ce qui fait une seule frappe. Une attaque reçoit plusieurs atomes, un par partiel et un par échelle : sans regroupement, la pulsation serait plusieurs fois trop dense. L'instant retenu est celui de l'atome le plus tôt du groupe, une attaque commençant où elle commence.

« Fréquence du battement » et « Longueur du battement » décrivent le son sourd. La force de chaque frappe en règle l'amplitude.

« Volume » règle le niveau de crête. Deux frappes qui se recouvrent s'additionnent, et l'ensemble est ramené sous ce niveau plutôt que chaque frappe écrêtée, ce qui déformerait celles qui ne se recouvrent pas.

La sortie « Audio » porte le son qui bat. La sortie « Pulsation » porte les frappes comme des notes, toutes à la même hauteur, ce qui permet de les écrire en rythme mesuré ou de les poser sur une ligne de temps. La sortie « Rapport » donne le compte, la cadence moyenne et l'irrégularité.

L'irrégularité vaut zéro sur une grille parfaite et un quand l'écart type des intervalles égale leur moyenne. Ce composant rend les attaques et non une grille régulière : trouver la pulsation isochrone au milieu des attaques est un autre problème, et l'irrégularité dit à quel point celles-ci s'en approchent.`,
    noticeEn: `Draws the strikes from a series of atoms and returns them as a single dull beating tone.

A strike is described by a short atom, the decomposition choosing the briefest scale where the signal is most transient; it is strong, an attack carrying most of the energy of its instant; and it is low, that energy concentrating in the bottom of the spectrum. All three read directly off a note: its duration is the atom's scale, its velocity its weight, its pitch its frequency.

« Longest atom » drops sustained tones. Beyond this threshold, the atom describes a note that lasts and not the moment it starts.

« Highest frequency » drops the treble. The threshold is set in hertz, which is the unit a low register is heard in.

« Lowest strength » drops the remainder, as a share of the strongest atom in the received sound. An atom's weight having no absolute scale, an absolute threshold would mean nothing from one sound to another.

« Grouping » decides what makes a single strike. One attack receives several atoms, one per partial and one per scale: without grouping, the pulse would be several times too dense. The instant kept is that of the group's earliest atom, an attack starting where it starts.

« Beat frequency » and « Beat length » describe the dull tone. Each strike's strength sets its amplitude.

« Volume » sets the peak level. Two overlapping strikes add up, and the whole is brought back under this level rather than each strike being clipped, which would distort those that do not overlap.

The « Audio » output carries the beating sound. The « Pulse » output carries the strikes as notes, all at the same pitch, so they can be written as a measured rhythm or laid on a timeline. The « Report » output gives the count, the average rate and the irregularity.

The irregularity is zero on a perfect grid and one when the intervals' standard deviation equals their mean. This node returns attacks and not a regular grid: finding the isochronous pulse among the attacks is another problem, and the irregularity says how close these come to it.`,
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Pulsation", nomEn: "Pulse", type: "sequence" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
      { nom: "Audio", type: "audio" },
    ],
    parametres: [
      { nom: "Durée maximale", nomEn: "Longest atom", type: "curseur", plage: [2, 400], pas: 1, defaut: 60, unite: "ms",
        doc: "Au-delà, l'atome décrit une tenue et non une frappe.",
        docEn: "Beyond this, the atom describes a sustained tone and not a strike." },
      { nom: "Fréquence maximale", nomEn: "Highest frequency", type: "curseur", plage: [40, 4000], pas: 10, defaut: 250, unite: "Hz",
        doc: "Au-dessus, ce n'est plus le grave. L'énergie d'une frappe se concentre dans le bas du spectre.",
        docEn: "Above this, it is no longer the low register. A strike's energy concentrates in the bottom of the spectrum." },
      { nom: "Force minimale", nomEn: "Lowest strength", type: "curseur", plage: [0, 100], pas: 1, defaut: 25, unite: "%",
        doc: "En part de l'atome le plus fort du son reçu. Un seuil absolu ne voudrait rien dire d'un son à l'autre.",
        docEn: "As a share of the strongest atom in the received sound. An absolute threshold would mean nothing from one sound to another." },
      { nom: "Regroupement", nomEn: "Grouping", type: "curseur", plage: [1, 500], pas: 1, defaut: 60, unite: "ms",
        doc: "Deux atomes plus proches que cela sont la même frappe. Une attaque en reçoit un par partiel et un par échelle.",
        docEn: "Two atoms closer than this are the same strike. One attack receives one per partial and one per scale." },
      { nom: "Fréquence du battement", nomEn: "Beat frequency", type: "curseur", plage: [30, 400], pas: 1, defaut: 60, unite: "Hz",
        doc: "La hauteur du son sourd qui marque chaque frappe.",
        docEn: "The pitch of the dull tone that marks each strike." },
      { nom: "Longueur du battement", nomEn: "Beat length", type: "curseur", plage: [10, 600], pas: 5, defaut: 120, unite: "ms",
        doc: "Le temps que met un battement à s'éteindre.",
        docEn: "The time a beat takes to die away." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau de crête du son rendu.", docEn: "The peak level of the rendered sound." },
    ],
    async executer(ctx: any) {
      const recue = ctx.entree(0);
      if (!estSequence(recue)) {
        return { valeurs: [null, "", null], erreur: true,
          message: en() ? "No sequence at the input." : "Aucune séquence à l'entrée." };
      }
      const notes = recue.notes ?? [];
      const criteres = {
        dureeMax: ctx.paramNombre("Durée maximale", 60) / 1000,
        hauteurMax: hauteurDe(ctx.paramNombre("Fréquence maximale", 250)),
        forceMin: Math.max(1, (ctx.paramNombre("Force minimale", 25) / 100) * 127),
        regroupement: ctx.paramNombre("Regroupement", 60) / 1000,
      };
      const frappes = pulsationDeSequence(notes, criteres);
      if (frappes.length === 0) {
        return { valeurs: [null, "", null], erreur: true,
          message: en() ? "No strike survives the criteria." : "Aucune frappe ne passe les critères." };
      }

      const duree = Math.max(
        recue.duree ?? 0,
        notes.reduce((m: number, n: { fin: number }) => Math.max(m, n.fin), 0),
        frappes[frappes.length - 1].instant + 0.5,
      );
      const longueur = ctx.paramNombre("Longueur du battement", 120) / 1000;
      const x = echantillonsDeBattements(frappes, {
        frequence: ctx.paramNombre("Fréquence du battement", 60),
        longueur,
        niveau: ctx.paramNombre("Volume", 80) / 100,
        duree,
        sampleRate: SR,
      });
      const ctxOff = new OfflineAudioContext(1, x.length, SR);
      const audio = ctxOff.createBuffer(1, x.length, SR);
      audio.getChannelData(0).set(x);

      // LA PULSATION SORT AUSSI COMME SÉQUENCE, toutes ses notes à la même hauteur : c'est ce qui
      // permet de l'écrire en rythme mesuré, où seules les durées comptent.
      const hauteurDuBattement = hauteurDe(ctx.paramNombre("Fréquence du battement", 60));
      const pulsation: Sequence = {
        notes: frappes.map((f, i) => ({
          note: hauteurDuBattement,
          velocite: f.force,
          debut: f.instant,
          fin: Math.min(duree, i + 1 < frappes.length ? frappes[i + 1].instant : f.instant + longueur),
        })),
        duree,
        titre: en() ? "Pulse" : "Pulsation",
      };

      const cadence = cadenceDesFrappes(frappes);
      const ecart = irregularite(frappes);
      const lignes = [
        en() ? "PULSE" : "PULSATION",
        "",
        `  ${(en() ? "Atoms received" : "Atomes reçus").padEnd(24)}${notes.length}`,
        `  ${(en() ? "Strikes kept" : "Frappes retenues").padEnd(24)}${frappes.length}`,
        `  ${(en() ? "Average gap" : "Écart moyen").padEnd(24)}${(cadence.ecartMoyen * 1000).toFixed(0)} ms`,
        `  ${(en() ? "Per minute" : "Par minute").padEnd(24)}${cadence.parMinute.toFixed(1)}`,
        `  ${(en() ? "Irregularity" : "Irrégularité").padEnd(24)}${ecart.toFixed(3)}`,
        "",
        en() ? "Strikes" : "Frappes",
      ];
      for (const f of frappes.slice(0, 16)) {
        lignes.push(`  ${f.instant.toFixed(3).padStart(8)} s  ${String(f.force).padStart(4)}  ${f.atomes} ${en() ? "atoms" : "atomes"}`);
      }

      return {
        valeurs: [pulsation, lignes.join("\n"), audio],
        message: `${frappes.length} ${en() ? "strikes" : "frappes"} · ${cadence.parMinute.toFixed(0)} `
          + `${en() ? "per minute" : "par minute"} · ${en() ? "irregularity" : "irrégularité"} ${ecart.toFixed(2)}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
