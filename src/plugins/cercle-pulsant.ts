// plugins/cercle-pulsant.ts — Une animation et une mélodie qui sont la même chose.
//
// La logique est dans `audio/cercle-pulsant.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  accordsDepuisPulsations, couleurVersCamelot, notesDepuisPulsations, pulsations, svgAnime,
  type ModeAccords, type OptionsCercle,
} from "../audio/cercle-pulsant";
import { camelotToAccord } from "../audio/camelot";
import {
  sf2Chargee, normaliserModeSynthèse, decoderInstrumentSF2,
  PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
} from "./soundfontGlobal";

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-pulsant", nom: "Cercle pulsant", nomEn: "Pulsing Circle",
    univers: "Entrées", famille: "Génération",
    resume: "Une animation, une mélodie et ses accords tirés de la même suite de pulsations : la couleur donne la tonalité, la pulsation le rythme.",
    resumeEn: "An animation, a melody and its chords drawn from the same series of pulses: colour gives the key, pulsation the rhythm.",
    notice: "Produit une animation, un cercle qui pulse en changeant de taille et de couleur, et la pièce musicale correspondante, à partir d'une même suite de pulsations.\n\nChaque pulsation est définie par trois valeurs : un instant, un rayon et une couleur. L'animation et la musique dérivent de cette suite, de sorte que les notes tombent exactement sur les instants dessinés.\n\nLa couleur détermine la tonalité par la roue de Camelot :\n• la teinte sélectionne la case, une par tranche de trente degrés\n• la saturation sélectionne l'anneau : sous 50 %, l'anneau A (mineur) ; au-dessus, l'anneau B (majeur)\n• la clarté sélectionne le registre, d'une octave en dessous à une octave au-dessus\n\nLa roue de Camelot classe les douze tonalités en cercle suivant la règle d'enchaînement employée par les disc-jockeys : case voisine, même numéro dans l'autre anneau, ou sept cases plus loin. La teinte étant également circulaire, deux teintes voisines correspondent à deux tonalités compatibles, et le réglage « Parcours de teinte » produit une suite de modulations cohérentes. Une correspondance directe entre teinte et demi-tons associerait au contraire deux tonalités sans relation à deux couleurs voisines.\n\nLe rayon détermine la note :\n• le rayon au moment de la pulsation fixe le degré dans la gamme de la case ; un rayon élevé donne une note grave\n• le même rayon fixe la vélocité ; un rayon élevé donne une note forte\n• « Respiration » règle l'amplitude de variation du rayon, donc l'étendue de gamme parcourue\n• en dessous de « Seuil de silence », la pulsation est dessinée mais aucune note n'est émise\n\nLes accords reprennent la triade de tonique de la case, transposée une octave sous la mélodie :\n• « Tenus » : un accord par tonalité, maintenu jusqu'à la modulation suivante\n• « Frappés » : le même accord répété à chaque pulsation audible\n• une case dont toutes les pulsations sont sous le seuil ne reçoit aucun accord\n• « Nuance des accords » règle leur vélocité ; celle de la mélodie varie de 50 à 120\n\nSorties :\n• « Mélodie » et « Accords » : deux fichiers MIDI distincts, instrumentables séparément\n• « Audio » : les deux ensemble, rendus avec le moteur et l'instrument sélectionnés\n• « Parcours » : la liste des tonalités traversées et l'instant de début de chacune\n\nL'animation est affichée dans le composant et n'est pas disponible sur un port de sortie. Elle est produite au format SVG animé par SMIL, c'est-à-dire décrite par des balises temporelles et non par une suite d'images ; les traitements d'image ne s'y appliquent pas.",
    noticeEn: "Produces an animation (a circle that pulses, changing size and colour) and the corresponding piece of music, from a single series of pulses.\n\nEach pulse is defined by three values: an instant, a radius and a colour. The animation and the music are both derived from this series, so that the notes fall exactly on the instants drawn.\n\nColour determines the key through the Camelot wheel:\n• hue selects the position, one per thirty-degree slice\n• saturation selects the ring: below 50 %, ring A (minor); above, ring B (major)\n• lightness selects the register, from one octave below to one octave above\n\nThe Camelot wheel arranges the twelve keys in a circle following the mixing rule used by disc jockeys: adjacent position, same number in the other ring, or seven positions away. Hue being circular as well, two neighbouring hues correspond to two compatible keys, and the « Hue journey » setting produces a coherent sequence of modulations. A direct mapping from hue to semitones would instead assign two unrelated keys to two neighbouring colours.\n\nThe radius determines the note:\n• the radius at the moment of the pulse sets the degree in the scale of the position; a large radius gives a low note\n• the same radius sets the velocity; a large radius gives a loud note\n• « Breathing » sets the amplitude of the radius variation, hence the range of the scale covered\n• below « Silence threshold », the pulse is drawn but no note is emitted\n\nThe chords use the tonic triad of the position, transposed one octave below the melody:\n• « Held »: one chord per key, sustained until the next modulation\n• « Struck »: the same chord repeated at each audible pulse\n• a position whose pulses are all below the threshold receives no chord\n• « Chord dynamic » sets their velocity; that of the melody ranges from 50 to 120\n\nOutputs:\n• « Melody » and « Chords »: two separate MIDI files, instrumentable independently\n• « Audio »: both together, rendered with the selected engine and instrument\n• « Journey »: the list of keys travelled and the start instant of each\n\nThe animation is displayed in the node and is not available on an output port. It is produced as SVG animated by SMIL, that is described by time tags rather than a sequence of images; image processing does not apply to it.",
    entrees: [],
    sorties: [
      { nom: "Mélodie", nomEn: "Melody", type: "midi" },
      { nom: "Audio", type: "audio" },
      { nom: "Parcours", nomEn: "Journey", type: "texte" },
      { nom: "Accords", nomEn: "Chords", type: "midi" },
    ],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [2, 120], pas: 1, defaut: 20, unite: "s",
        doc: "Durée de l'animation, et de la pièce : les deux sont égales.",
        docEn: "Length of the animation, and of the piece: the two are equal." },
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
        doc: "De combien la couleur tourne sur toute la durée. À zéro, la pièce reste dans une seule tonalité. À 360, elle fait le tour complet des douze, et comme les cases voisines sont compatibles, chaque passage est une modulation qui tient.",
        docEn: "How far the colour turns over the whole duration. At zero the piece stays in one key. At 360 it goes round all twelve, and since neighbouring positions are compatible, each passage is a modulation that holds." },
      { nom: "Saturation", nomEn: "Saturation", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Vivacité de la couleur, et mode de la pièce : sous 50 %, l'anneau mineur ; au-dessus, le majeur.",
        docEn: "Vividness of the colour, and mode of the piece: below 50 %, the minor ring; above, the major." },
      { nom: "Clarté", nomEn: "Lightness", type: "curseur", plage: [0, 100], pas: 1, defaut: 55, unite: "%",
        doc: "Clarté de la couleur, et registre de la mélodie : une couleur sombre descend d'une octave, une couleur claire monte d'une octave.",
        docEn: "Lightness of the colour, and register of the melody: a dark colour drops an octave, a light one rises an octave." },
      { nom: "Respiration", nomEn: "Breathing", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Amplitude des variations de taille. À zéro, le cercle garde son diamètre et la mélodie son degré : seule la tonalité change encore. Au maximum, le cercle passe du point au disque plein, et la mélodie parcourt toute la gamme.",
        docEn: "Amplitude of the size variation. At zero the circle keeps its diameter and the melody its degree: only the key still changes. At maximum the circle goes from a dot to a full disc, and the melody covers the whole scale." },
      { nom: "Seuil de silence", nomEn: "Silence threshold", type: "curseur", plage: [0, 90], pas: 1, defaut: 45, unite: "%",
        doc: "Taille en deçà de laquelle la pulsation ne sonne pas : elle est alors dessinée et muette. Le rayon ne descend jamais sous cent moins la respiration, si bien qu'un seuil plus bas que cette valeur ne coupe rien. À respiration 65 %, un seuil sous 35 % est sans effet.",
        docEn: "Size below which the pulse does not sound: it is then drawn and silent. The radius never falls below one hundred minus the breathing, so a threshold lower than that cuts nothing. At 65 % breathing, a threshold under 35 % has no effect." },
      { nom: "Accords", nomEn: "Chords", type: "choix",
        options: ["Tenus", "Frappés", "Aucun"], optionsEn: ["Held", "Struck", "None"],
        optionIds: ["tenus", "frappes", "aucun"], defaut: "Tenus", defautEn: "Held",
        doc: "La triade de tonique de chaque case traversée, une octave sous la mélodie. Tenus : un accord par tonalité, gardé jusqu'à la modulation suivante. Frappés : le même accord rejoué à chaque pulsation audible. Une case traversée pendant que le cercle est rétracté ne sonne pas.",
        docEn: "The tonic triad of each position travelled, an octave below the melody. Held: one chord per key, kept until the next modulation. Struck: the same chord replayed at every audible pulse. A position travelled while the circle is contracted does not sound." },
      { nom: "Nuance des accords", nomEn: "Chord dynamic", type: "curseur", plage: [0, 100], pas: 1, defaut: 55, unite: "%",
        doc: "Force de frappe des accords. La mélodie va de 50 à 120 sur la même échelle : au-delà de ces valeurs, l'harmonie passe devant elle.",
        docEn: "Striking force of the chords. The melody runs from 50 to 120 on the same scale: beyond those values the harmony moves in front of it." },
      { nom: "Échos", nomEn: "Echoes", type: "choix", options: ["Oui", "Non"], optionsEn: ["Yes", "No"],
        optionIds: ["oui", "non"], defaut: "Oui", defautEn: "Yes",
        doc: "Laisser un anneau s'ouvrir et s'effacer à chaque frappe audible, sur la durée de la note.",
        docEn: "Let a ring open and fade at each audible stroke, over the length of the note." },
      { nom: "Taille", nomEn: "Size", type: "curseur", plage: [200, 1200], pas: 20, defaut: 600, unite: "px",
        doc: "Côté de l'image carrée.", docEn: "Side of the square image." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Graine de l'irrégularité des tailles. Une même graine rejoue la même pièce, image comprise.",
        docEn: "Seed for the irregularity of the sizes. The same seed replays the same piece, picture included." },
      PARAMETRE_SYNTHESE,
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu sonore.", docEn: "Level of the rendered sound." },
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
      if (p.length === 0) return { valeurs: [null, null, null, null], message: traduire("msg.cerclePulsant.vide") };

      const { notes, codes } = notesDepuisPulsations(p, o);
      // La roue de Camelot code des TONALITÉS : la suite des cases traversées est une suite
      // d'accords, et la mélodie seule ne la faisait pas entendre. Voir `audio/cercle-pulsant.ts`.
      const accords = accordsDepuisPulsations(
        p, o, ctx.paramTexte("Accords", "tenus") as ModeAccords,
        ctx.paramNombre("Nuance des accords", 55) / 100);
      const svg = svgAnime(p, o, {
        taille: Math.round(ctx.paramNombre("Taille", 600)),
        echos: ctx.paramTexte("Échos", "oui") !== "non",
      });

      const { notesVersFichierMidi, rendreSequence } = await import("../audio");
      const tempo = 60 * Math.max(0.2, (o.pulsationDebut + o.pulsationFin) / 2);

      // LE RENDU SE RÈGLE, COMME SUR LES AUTRES GÉNÉRATEURS DE NOTES. Le moteur et l'instrument
      // étaient écrits en dur — FM, programme 0 —, si bien qu'un SoundFont chargé restait sans
      // effet sur un composant qui sort pourtant du MIDI.
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const prog = Math.max(0, programme);
      const banc = Math.max(0, banque);
      // Le troisième argument est le CANAL, non le programme : instrument et banque sont les
      // quatrième et cinquième.
      const midi = notesVersFichierMidi(notes, tempo, 0, banc, prog);
      const midiAccords = accords.length ? notesVersFichierMidi(accords, tempo, 0, banc, prog) : null;
      // L'audio du composant est la pièce entière : la mélodie et les accords y sont rendus
      // ensemble, tandis que les deux sorties MIDI permettent de les instrumenter séparément.
      const audio = await rendreSequence(
        [...notes, ...accords], modeRendu, ctx.paramNombre("Volume", 80), prog, banc);

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
        valeurs: [midi, audio, lignes.join("\n"), midiAccords],
        message: traduire("msg.cerclePulsant.resume",
          String(p.length), String(notes.length), String(accords.length / 3), String(etapes.length)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
