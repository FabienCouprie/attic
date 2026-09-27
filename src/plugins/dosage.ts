// plugins/dosage.ts — Appliquer un effet sur une portion de temps.
//
// Le calcul vit dans `audio/dosage.ts`, éprouvé. Ce fichier n'est que la prise.
//
// POURQUOI UN NŒUD DE MÉLANGE PLUTÔT QU'UN RÉGLAGE SUR CHAQUE EFFET. Poser une portion de temps sur
// les cent dix-huit effets aurait demandé de les modifier tous, et d'y remettre à chaque fois la
// même rampe. Le dosage est une opération sur DEUX signaux, le sec et le traité : un seul nœud la
// porte, et tout ce qui produit de l'audio devient applicable sur une portion, y compris ce qui
// regarde le signal entier et ne saurait pas travailler par morceaux.

import type { FicheAudio } from "../audio/types-domaine";
import { doser, enveloppeDeZones, type LoiFondu, type ModeDosage, type Zone } from "../audio/dosage";
import { valeursParametre } from "../audio/courbe";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

const canauxDe = (b: AudioBuffer) =>
  Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));

export const fiches: FicheAudio[] = ([
  {
    id: "doser-effet",
    nom: "Doser un effet", nomEn: "Effect Blend",
    univers: "Traitement", famille: "Montage",
    resume: "Mélange un son et sa version traitée dans une proportion qui varie au cours du temps, pour appliquer un effet sur une portion seulement.",
    resumeEn: "Blends a sound and its treated version in a proportion that varies over time, to apply an effect over one portion only.",
    notice: `Mélange un son et sa version traitée, dans une proportion qui varie au cours du temps.\n\nL'entrée « Sec » reçoit le son d'origine, l'entrée « Traité » la sortie de l'effet. Le dosage est la part du traité dans le mélange : à zéro, la sortie est le sec seul.\n\nUn effet ne s'allume ni ne s'éteint. Couper son entrée ou brancher sa sortie d'un seul coup produit une discontinuité, qui contient toutes les fréquences et s'entend comme un clic. La part du traité monte et descend par une rampe, et la sortie reste continue.\n\n« Zones » reçoit les portions de temps à traiter. Sans zone, le dosage porte sur toute la durée.\n\n« Dose » est la part du traité. « Courbe » la pilote au cours du temps : la courbe parcourt alors l'intervalle qui va de « Dose min » à « Dose max », et les zones le fenêtrent. Les zones disent où, la courbe dit combien à l'intérieur.\n\n« Mode » choisit la façon d'appliquer. En « Insertion », le traité remplace le sec, qui s'efface à mesure : c'est ce que demandent un filtre, une distorsion, une transposition. En « Départ », le sec reste entier et le traité s'ajoute : c'est ce que demandent une réverbération ou un délai.\n\n« Fondu d'entrée » et « Fondu de sortie » donnent la durée des rampes. Elles se tiennent à l'extérieur de la zone, de sorte qu'une zone soit traitée en entier quelle que soit sa longueur. Deux zones dont les rampes se rencontrent prennent la plus haute des deux valeurs, et l'enveloppe ne redescend pas entre elles.\n\n« Loi du fondu » donne la forme des rampes. « Linéaire » convient quand le traité ressemble au sec et s'additionne en phase avec lui, ce qui est le cas d'un filtre. « Puissance constante » convient quand les deux n'ont plus de rapport de phase, une réverbération ou une transposition : les parts sont prises en racine, et le niveau ne creuse pas de trois décibels à mi-rampe.\n\n« Application » traite les zones, ou bien tout ce qui n'est pas elles.\n\nLes deux entrées partagent la même base de temps : le mélange se fait instant par instant, et suppose donc que l'instant t désigne le même endroit du son des deux côtés. Un effet qui ajoute une queue au son la respecte, la queue venant après. Un effet qui étire le son, qui le renverse ou qui le déplace ne la respecte pas : le traité ne répond plus au sec au même instant, et la zone tombe ailleurs que là où elle a été tracée. Un traitement qui change la durée du son se pose par le montage, le passage étant extrait, traité, puis remis en place. Le message donne les deux durées dès qu'elles diffèrent.\n\nLa queue d'un effet est coupée avec la zone, puisque c'est la sortie de l'effet qui est fenêtrée ici. Pour qu'une réverbération sonne après le passage qui la déclenche, c'est l'entrée de l'effet qu'il faut fenêtrer, en amont de lui, le dosage n'ayant plus alors qu'à additionner.\n\nLa sortie prend la plus longue des deux entrées, le sec complété par du silence : un effet qui allonge le son garde ce qu'il a ajouté. Un traité monophonique branché sur un sec stéréophonique est doublé, et le mélange garde ses deux voies.\n\nLa sortie « Audio » porte le mélange. Le message donne le nombre de zones, la part de la durée touchée et le dosage moyen.`,
    noticeEn: `Blends a sound and its treated version, in a proportion that varies over time.\n\nThe « Dry » input receives the original sound, the « Treated » input the effect's output. The blend is the treated share of the mix: at zero, the output is the dry alone.\n\nAn effect does not switch on or off. Cutting its input or connecting its output all at once produces a discontinuity, which contains every frequency and is heard as a click. The treated share rises and falls along a ramp, and the output stays continuous.\n\n« Zones » receives the portions of time to treat. With no zone, the blend covers the whole duration.\n\n« Amount » is the treated share. « Curve » drives it over time: the curve then travels the interval from « Amount min » to « Amount max », and the zones window it. The zones say where, the curve says how much inside.\n\n« Mode » gives the way of applying. In « Insert », the treated replaces the dry, which fades out as it comes: that is what a filter, a distortion, a transposition call for. In « Send », the dry stays whole and the treated adds to it: that is what a reverberation or a delay call for.\n\n« Fade in » and « Fade out » give the length of the ramps. They sit outside the zone, so that a zone is treated whole whatever its length. Two zones whose ramps meet take the higher of the two values, and the envelope does not dip between them.\n\n« Fade law » gives the shape of the ramps. « Linear » suits a treated signal that resembles the dry and adds in phase with it, as a filter's does. « Constant power » suits two signals with no phase relation left, a reverberation or a transposition: the shares are taken as square roots, and the level does not dip by three decibels mid-ramp.\n\n« Applied to » treats the zones, or everything that is not them.\n\nThe two inputs share one time base: the blend is made instant by instant, and so assumes that instant t names the same place in the sound on both sides. An effect that adds a tail to the sound respects that, the tail coming after. An effect that stretches the sound, reverses it or displaces it does not: the treated no longer answers the dry at the same instant, and the zone falls elsewhere than where it was drawn. A treatment that changes the sound's duration is laid down by montage, the passage being extracted, treated, then put back in place. The message gives both durations as soon as they differ.\n\nAn effect's tail is cut with the zone, since it is the effect's output that is windowed here. For a reverberation to sound after the passage that triggers it, it is the effect's input that must be windowed, upstream of it, the blend then having only to add.\n\nThe output takes the longer of the two inputs, the dry padded with silence: an effect that lengthens the sound keeps what it added. A monophonic treated signal fed against a stereophonic dry one is doubled, and the blend keeps its two channels.\n\nThe « Audio » output carries the blend. The message gives the number of zones, the share of the duration touched and the mean blend.`,
    entrees: [
      { nom: "Sec", nomEn: "Dry", type: "audio" },
      { nom: "Traité", nomEn: "Treated", type: "audio" },
      { nom: "Zones", nomEn: "Zones", type: "controle", requis: false },
      { nom: "Courbe", nomEn: "Curve", type: "courbe", requis: false, module: "Dose" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Dose", nomEn: "Amount", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La part du traité dans le mélange, quand aucune courbe ne la pilote. À zéro, la sortie est le sec seul, quelles que soient les zones.",
        docEn: "The treated share in the blend, when no curve drives it. At zero the output is the dry alone, whatever the zones." },
      { nom: "Dose min", nomEn: "Amount min", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        modulationDe: "Dose",
        doc: "La part du traité quand la courbe est au plus bas.",
        docEn: "The treated share when the curve is at its lowest." },
      { nom: "Dose max", nomEn: "Amount max", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        modulationDe: "Dose",
        doc: "La part du traité quand la courbe est au plus haut.",
        docEn: "The treated share when the curve is at its highest." },
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Insertion", "Départ"], optionsEn: ["Insert", "Send"], optionIds: ["insertion", "depart"],
        defaut: "Insertion", defautEn: "Insert",
        doc: "En insertion, le traité remplace le sec, qui s'efface à mesure : c'est ce que demandent un filtre, une distorsion, une transposition. En départ, le sec reste entier et le traité s'ajoute : c'est ce que demandent une réverbération ou un délai.",
        docEn: "In insert, the treated replaces the dry, which fades out as it comes: that is what a filter, a distortion, a transposition call for. In send, the dry stays whole and the treated adds to it: that is what a reverberation or a delay call for." },
      { nom: "Application", nomEn: "Applied to", type: "choix",
        options: ["Dans les zones", "Hors des zones"], optionsEn: ["Inside the zones", "Outside the zones"],
        optionIds: ["dedans", "dehors"], defaut: "Dans les zones", defautEn: "Inside the zones",
        doc: "Traiter les zones reçues, ou tout ce qui n'est pas elles. Les rampes s'inversent avec le reste, et la sortie demeure continue.",
        docEn: "Treat the zones received, or everything that is not them. The ramps invert with the rest, and the output stays continuous." },
      { nom: "Fondu d'entrée", nomEn: "Fade in", type: "curseur", plage: [0, 2000], pas: 5, defaut: 10, unite: "ms",
        doc: "Durée de la rampe qui précède chaque zone. Elle se tient à l'extérieur, de sorte que la zone soit traitée en entier. En dessous de cinq millisecondes, la rampe redevient audible comme un clic sur les sons graves : un fondu couvre au moins une période de la plus basse fréquence présente.",
        docEn: "Length of the ramp before each zone. It sits outside, so that the zone is treated whole. Below five milliseconds the ramp becomes audible again as a click on low sounds: a fade covers at least one period of the lowest frequency present." },
      { nom: "Fondu de sortie", nomEn: "Fade out", type: "curseur", plage: [0, 2000], pas: 5, defaut: 10, unite: "ms",
        doc: "Durée de la rampe qui suit chaque zone, à l'extérieur d'elle également.",
        docEn: "Length of the ramp after each zone, outside it as well." },
      { nom: "Loi du fondu", nomEn: "Fade law", type: "choix",
        options: ["Linéaire", "Puissance constante"], optionsEn: ["Linear", "Constant power"],
        optionIds: ["lineaire", "puissance"], defaut: "Linéaire", defautEn: "Linear",
        doc: "Deux signaux en phase s'additionnent en amplitude, et leur somme garde son niveau quand les deux parts font un : c'est le linéaire, et c'est le cas d'un son et de sa version filtrée. Deux signaux sans rapport de phase s'additionnent en puissance, et leur somme garde son niveau quand les carrés des deux parts font un : c'est la puissance constante, et c'est le cas d'un son et de sa réverbération. Se tromper creuse trois décibels à mi-rampe. Ce réglage n'agit qu'en insertion, un départ additionnant au lieu de traverser.",
        docEn: "Two signals in phase add in amplitude, and their sum keeps its level when the two shares make one: that is linear, and that is the case of a sound and its filtered version. Two signals with no phase relation add in power, and their sum keeps its level when the squares of the two shares make one: that is constant power, and that is the case of a sound and its reverberation. Choosing wrong digs three decibels mid-ramp. This setting acts in insert only, a send adding instead of crossing." },
    ],
    async executer(ctx: any) {
      const sec = ctx.entree(0);
      const traite = ctx.entree(1);
      if (!(sec instanceof AudioBuffer) || !(traite instanceof AudioBuffer)) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Connect the dry sound and the treated one." : "Brancher le son sec et le son traité.",
        };
      }
      if (sec.sampleRate !== traite.sampleRate) {
        return {
          valeurs: [null], erreur: true,
          message: en()
            ? `Sampling rates differ: ${sec.sampleRate} and ${traite.sampleRate} Hz.`
            : `Les fréquences d'échantillonnage diffèrent : ${sec.sampleRate} et ${traite.sampleRate} Hz.`,
        };
      }

      const recues = ctx.entree(2);
      const zones: Zone[] = (Array.isArray(recues) ? recues : [])
        .filter((z: any) => z && Number.isFinite(z.debut) && Number.isFinite(z.duree));
      const sr = sec.sampleRate;
      const longueur = Math.max(sec.length, traite.length);
      const dehors = ctx.paramTexte("Application", "dedans") === "dehors";
      const env = enveloppeDeZones({
        longueur, sampleRate: sr, zones,
        fonduEntreeSec: ctx.paramNombre("Fondu d'entrée", 10) / 1000,
        fonduSortieSec: ctx.paramNombre("Fondu de sortie", 10) / 1000,
        horsZones: dehors,
      });

      // LA COURBE PILOTE LA DOSE, LES ZONES LA FENÊTRENT, et les deux se multiplient. Sans courbe,
      // `valeursParametre` rend la valeur du réglage sur toute la longueur : un seul chemin de
      // calcul, le scalaire étant le cas dégénéré du tableau.
      const doses = valeursParametre(ctx.entree(3), longueur, ctx.paramNombre("Dose", 100), {
        min: ctx.paramNombre("Dose min", 0),
        max: ctx.paramNombre("Dose max", 100),
      });
      const a = new Float32Array(longueur);
      let somme = 0, touches = 0;
      for (let i = 0; i < longueur; i++) {
        a[i] = Math.min(1, Math.max(0, doses[i] / 100)) * env[i];
        somme += a[i];
        if (a[i] > 0) touches++;
      }

      const canaux = doser(canauxDe(sec), canauxDe(traite), a, {
        mode: ctx.paramTexte("Mode", "insertion") as ModeDosage,
        loi: ctx.paramTexte("Loi du fondu", "lineaire") as LoiFondu,
      });
      const sortie = new AudioBuffer({ numberOfChannels: canaux.length, length: longueur, sampleRate: sr });
      for (let ch = 0; ch < canaux.length; ch++) sortie.getChannelData(ch).set(canaux[ch]);

      const part = longueur > 0 ? (100 * touches) / longueur : 0;
      const moyen = longueur > 0 ? somme / longueur : 0;
      const nz = zones.length;

      // LES DEUX DURÉES SONT DITES DÈS QU'ELLES DIFFÈRENT, et ce n'est pas un détail d'affichage.
      // Le dosage mélange instant par instant : il suppose que l'instant t désigne le même endroit
      // du son des deux côtés. Une queue de réverbération respecte cela et allonge un peu ; un
      // étirement ne le respecte pas, et la zone tombe alors ailleurs que là où elle a été tracée,
      // sans que rien ne s'en aperçoive. Relevé à l'écran avec un étirement de huit : la sortie
      // chantait 219 Hz là où le sec était à 879, et portait vingt-huit secondes de silence.
      const ecart = Math.abs(traite.length - sec.length) / Math.max(1, sec.length);
      const duree = ecart > 0.01
        ? (en()
          ? `dry ${(sec.length / sr).toFixed(2)} s / treated ${(traite.length / sr).toFixed(2)} s`
          : `sec ${(sec.length / sr).toFixed(2)} s / traité ${(traite.length / sr).toFixed(2)} s`)
        : `${(longueur / sr).toFixed(2)} s`;

      return {
        valeurs: [sortie],
        message: en()
          ? `${nz} ${nz === 1 ? "zone" : "zones"} · ${part.toFixed(0)} % of the duration · mean blend ${moyen.toFixed(2)} · ${duree}`
          : `${nz} zone${nz === 1 ? "" : "s"} · ${part.toFixed(0)} % de la durée · dosage moyen ${moyen.toFixed(2)} · ${duree}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
