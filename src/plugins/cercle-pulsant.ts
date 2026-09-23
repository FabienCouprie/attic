// plugins/cercle-pulsant.ts — Une animation et une mélodie qui sont la même chose.
//
// La logique est dans `audio/cercle-pulsant.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  couleurVersCamelot, notesDepuisPulsations, pulsations, svgAnime, type OptionsCercle,
} from "../audio/cercle-pulsant";
import { camelotToAccord } from "../audio/camelot";

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-pulsant", nom: "Cercle pulsant", nomEn: "Pulsing Circle",
    univers: "Entrées", famille: "Génération",
    resume: "Une animation et une mélodie tirées de la même suite de pulsations : la couleur donne la tonalité, la pulsation le rythme.",
    resumeEn: "An animation and a melody drawn from the same series of pulses: colour gives the key, pulsation the rhythm.",
    notice: "Un cercle qui respire, change de taille et de couleur, et une mélodie qui en sort. Mais pas au sens où l'on sonorise une image : les deux sont la même liste, regardée deux fois.\n\nLe principe, et ce qui le distingue d'une sonification décorative. Le composant calcule une seule suite de pulsations — un instant, une taille, une couleur — puis le dessin anime exactement ces instants et la mélodie écrit exactement ces notes. Elles ne peuvent pas diverger, parce qu'il n'y a rien à synchroniser.\n\nLa teinte donne la tonalité par la roue de Camelot, et ce n'est pas un mappage arbitraire. Cette roue dispose les douze tonalités en cercle — anneau A pour les mineurs, B pour les majeurs — selon la règle d'enchaînement des disc-jockeys : une case voisine, le même numéro dans l'autre anneau, ou sept cases plus loin. La teinte est un cercle, la roue en est un autre : les faire correspondre fait que deux teintes voisines donnent deux tonalités compatibles. Un dégradé continu produit donc une suite de modulations qui fonctionnent. Le mappage évident — teinte divisée en douze demi-tons — ferait l'inverse : deux couleurs voisines y donneraient deux tonalités étrangères, et un dégradé sonnerait comme une suite d'accidents.\n\nLe reste suit. La saturation choisit l'anneau : terne pour le mineur, vive pour le majeur, ce que l'œil lit déjà comme sombre ou éclatant. La clarté donne le registre. Le rayon au moment de la frappe donne le degré dans la gamme — un grand cercle est une note grave, le sens que l'œil donne spontanément à une forme large — et son amplitude la nuance.\n\nLe silence a une image. Sous le seuil, la pulsation se voit et ne s'entend pas : le cercle se rétracte, la musique se tait, et les deux se taisent ensemble parce que c'est la même décision.\n\nL'animation se regarde dans le composant, et ne sort pas par un port : elle est écrite en SVG animé par SMIL, une horloge et non des pixels, et aucun traitement d'image n'en ferait quoi que ce soit. Le composant rend ce qui se branche : les notes, le son, et le parcours des tonalités.",
    noticeEn: "A circle that breathes, changes size and colour, and a melody that comes out of it. But not in the sense of sonifying a picture: the two are the same list, looked at twice.\n\nThe principle, and what sets it apart from decorative sonification. The node computes a single series of pulses — an instant, a size, a colour — then the drawing animates exactly those instants and the melody writes exactly those notes. They cannot drift apart, because there is nothing to synchronise.\n\nHue gives the key through the Camelot wheel, and this is no arbitrary mapping. That wheel lays the twelve keys in a circle — ring A for the minors, B for the majors — following the disc jockeys' mixing rule: a neighbouring position, the same number in the other ring, or seven positions away. Hue is a circle, the wheel is another: matching them means two neighbouring hues give two compatible keys. A continuous gradient therefore produces a sequence of modulations that work. The obvious mapping — hue divided into twelve semitones — would do the opposite: two neighbouring colours would give two unrelated keys, and a gradient would sound like a string of accidents.\n\nThe rest follows. Saturation chooses the ring: dull for minor, vivid for major, which the eye already reads as sombre or brilliant. Lightness gives the register. The radius at the moment of the stroke gives the scale degree — a large circle is a low note, the sense the eye spontaneously gives a wide shape — and its amplitude gives the dynamic.\n\nSilence has a picture. Below the threshold the pulse is seen and not heard: the circle contracts, the music falls silent, and both fall silent together because it is the same decision.\n\nThe animation is watched in the node, and does not leave by a port: it is written as an SVG animated by SMIL, a clock rather than pixels, and no image processing would make anything of it. What the node outputs is what can be connected: the notes, the sound, and the journey through the keys.",
    entrees: [],
    sorties: [
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Audio", type: "audio" },
      { nom: "Parcours", nomEn: "Journey", type: "texte" },
    ],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [2, 120], pas: 1, defaut: 20, unite: "s",
        doc: "Durée de l'animation, et de la pièce. C'est la même : l'une ne peut pas finir avant l'autre.",
        docEn: "Length of the animation, and of the piece. It is the same: one cannot end before the other." },
      { nom: "Pulsation initiale", nomEn: "Initial rate", type: "curseur", plage: [0.2, 12], pas: 0.1, defaut: 1.6, unite: "/s",
        doc: "Battements par seconde au début. Sous un par seconde, on entend des événements isolés ; au-delà de cinq, une texture.",
        docEn: "Beats per second at the start. Below one per second one hears isolated events; beyond five, a texture." },
      { nom: "Pulsation finale", nomEn: "Final rate", type: "curseur", plage: [0.2, 12], pas: 0.1, defaut: 3.2, unite: "/s",
        doc: "Battements par seconde à la fin. Différente de l'initiale, la cadence glisse continûment de l'une à l'autre : ce n'est pas un changement de tempo mais une accélération, que rien ne découpe en paliers.",
        docEn: "Beats per second at the end. Different from the initial one, the rate slides continuously from one to the other: not a tempo change but an acceleration, cut into no steps." },
      { nom: "Teinte", nomEn: "Hue", type: "curseur", plage: [0, 359], pas: 1, defaut: 210, unite: "°",
        doc: "Couleur de départ. Zéro est le rouge, 120 le vert, 240 le bleu. Chaque trentaine de degrés avance d'une case sur la roue de Camelot, donc d'une tonalité.",
        docEn: "Starting colour. Zero is red, 120 green, 240 blue. Every thirty degrees moves one position on the Camelot wheel, hence one key." },
      { nom: "Parcours de teinte", nomEn: "Hue journey", type: "curseur", plage: [-720, 720], pas: 15, defaut: 150, unite: "°",
        doc: "De combien la couleur tourne sur toute la durée. À zéro, la pièce reste dans une seule tonalité. À 360, elle fait le tour complet des douze — et comme les cases voisines sont compatibles, chaque passage est une modulation qui tient.",
        docEn: "How far the colour turns over the whole duration. At zero the piece stays in one key. At 360 it goes round all twelve — and since neighbouring positions are compatible, each passage is a modulation that holds." },
      { nom: "Saturation", nomEn: "Saturation", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Vivacité de la couleur, et mode de la pièce : sous 50 %, l'anneau mineur ; au-dessus, le majeur. Le seuil est au milieu, et il n'y a pas de raison de le mettre ailleurs.",
        docEn: "Vividness of the colour, and mode of the piece: below 50 %, the minor ring; above, the major. The threshold sits in the middle, and there is no reason to put it elsewhere." },
      { nom: "Clarté", nomEn: "Lightness", type: "curseur", plage: [0, 100], pas: 1, defaut: 55, unite: "%",
        doc: "Clarté de la couleur, et registre de la mélodie : une couleur sombre descend d'une octave, une couleur claire monte d'une octave.",
        docEn: "Lightness of the colour, and register of the melody: a dark colour drops an octave, a light one rises an octave." },
      { nom: "Respiration", nomEn: "Breathing", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude des variations de taille. À zéro, le cercle garde son diamètre et la mélodie son degré : on n'entend plus que la tonalité changer. Au maximum, le cercle passe du point au disque plein, et la mélodie parcourt toute la gamme.",
        docEn: "Amplitude of the size variation. At zero the circle keeps its diameter and the melody its degree: only the key is heard changing. At maximum the circle goes from a dot to a full disc, and the melody covers the whole scale." },
      { nom: "Seuil de silence", nomEn: "Silence threshold", type: "curseur", plage: [0, 90], pas: 1, defaut: 45, unite: "%",
        doc: "Taille en deçà de laquelle la pulsation ne sonne pas. C'est ce qui permet à la pièce de respirer plutôt que de poser une note sur chaque battement du début à la fin. Un chiffre à connaître : le rayon ne descend jamais sous cent moins la respiration, si bien qu'un seuil plus bas que cette valeur ne coupe jamais rien. À respiration 65 %, un seuil sous 35 % est sans effet — mesuré, quarante-huit pulsations sonnaient toutes.",
        docEn: "Size below which the pulse does not sound. This is what lets the piece breathe rather than placing a note on every beat from start to finish. A figure worth knowing: the radius never falls below one hundred minus the breathing, so a threshold lower than that never cuts anything. At 65 % breathing, a threshold under 35 % has no effect — measured, all forty-eight pulses sounded." },
      { nom: "Échos", nomEn: "Echoes", type: "choix", options: ["Oui", "Non"], optionsEn: ["Yes", "No"],
        optionIds: ["oui", "non"], defaut: "Oui", defautEn: "Yes",
        doc: "Laisser un anneau s'ouvrir et s'effacer à chaque frappe audible. C'est la décroissance de la note rendue visible, et ce qui donne son épaisseur à l'image.",
        docEn: "Let a ring open and fade at each audible stroke. It is the note's decay made visible, and what gives the picture its depth." },
      { nom: "Taille", nomEn: "Size", type: "curseur", plage: [200, 1200], pas: 20, defaut: 600, unite: "px",
        doc: "Côté de l'image carrée.", docEn: "Side of the square image." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Graine de l'irrégularité des tailles. Une même graine rejoue la même pièce, image comprise.",
        docEn: "Seed for the irregularity of the sizes. The same seed replays the same piece, picture included." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const o: OptionsCercle = {
        dureeSec: ctx.paramNombre("Durée", 20),
        pulsationDebut: ctx.paramNombre("Pulsation initiale", 1.6),
        pulsationFin: ctx.paramNombre("Pulsation finale", 3.2),
        teinteDebut: ctx.paramNombre("Teinte", 210),
        teinteParcours: ctx.paramNombre("Parcours de teinte", 150),
        saturation: ctx.paramNombre("Saturation", 70) / 100,
        clarte: ctx.paramNombre("Clarté", 55) / 100,
        respiration: ctx.paramNombre("Respiration", 80) / 100,
        seuilSilence: ctx.paramNombre("Seuil de silence", 45) / 100,
        graine: Math.round(ctx.paramNombre("Graine", 7)),
      };
      const p = pulsations(o);
      if (p.length === 0) return { valeurs: [null, null, null], message: traduire("msg.cerclePulsant.vide") };

      const { notes, codes } = notesDepuisPulsations(p, o);
      const svg = svgAnime(p, o, {
        taille: Math.round(ctx.paramNombre("Taille", 600)),
        echos: ctx.paramTexte("Échos", "oui") !== "non",
      });

      const { notesVersFichierMidi, rendreSequence } = await import("../audio");
      const tempo = 60 * Math.max(0.2, (o.pulsationDebut + o.pulsationFin) / 2);
      const midi = notesVersFichierMidi(notes, tempo, 0);
      const audio = await rendreSequence(notes, "FM/Oscillateurs", 80, 0, 0);

      // Le parcours : la suite des tonalités traversées, sans répéter celles qui durent.
      const etapes: { code: string; depuis: number }[] = [];
      codes.forEach((c, i) => {
        if (etapes.length === 0 || etapes[etapes.length - 1].code !== c) etapes.push({ code: c, depuis: p[i].temps });
      });
      const lignes = [
        `${en ? "Keys travelled" : "Tonalités traversées"} : ${etapes.length}`,
        "",
        ...etapes.map((e) => `  ${e.depuis.toFixed(1).padStart(6)} s   ${e.code.padEnd(4)} ${camelotToAccord(e.code) ?? ""}`),
        "",
        `${en ? "Pulses" : "Pulsations"} : ${p.length}   ${en ? "of which silent" : "dont muettes"} : ${p.length - notes.length}`,
      ];

      // L'animation se regarde ici, et ne sort pas : voir l'en-tête de ce fichier.
      (ctx.noeud.data as Record<string, unknown>)._animationSvg = svg;
      return {
        valeurs: [midi, audio, lignes.join("\n")],
        message: traduire("msg.cerclePulsant.resume",
          String(p.length), String(notes.length), String(etapes.length)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
