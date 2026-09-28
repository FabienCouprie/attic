// plugins/cercle-pulsant.ts — Une animation et une mélodie qui sont la même chose.
//
// La logique est dans `audio/cercle-pulsant.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  accordsDepuisPulsations, couleurVersCamelot, frappesDuCercle, notesDepuisPulsations,
  pulsations, pulsationsDepuisNotes, svgAnime,
  type ModeAccords, type ModeDuCercle, type OptionsCercle,
} from "../audio/cercle-pulsant";
import { camelotToAccord } from "../audio/camelot";
import { CANAL_PERCUSSION, PERCUSSIONS_CHOIX } from "../audio/batterie-midi";
import { GAMMES } from "../audio/gammes";
import { QUALITES } from "../audio/qualites-accords";
import { echantillonsDeBattements } from "../audio/pulsation";
import { estSequence } from "../audio/sequence";
import {
  sf2Chargee, normaliserModeSynthèse, decoderInstrumentSF2,
  PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
} from "./soundfontGlobal";

/** La fréquence d'échantillonnage du battement rendu, la même que celle du composant Pulsation. */
const SR = 44100;

/** La hauteur en demi-tons d'une fréquence : la même conversion que dans `plugins/pulsation.ts`. */
const hauteurDe = (hertz: number) => 69 + 12 * Math.log2(Math.max(1, hertz) / 440);

/** « Selon la roue » : la saturation choisit l'anneau, donc le mode, comme avant tout réglage. */
const SELON_LA_ROUE = "roue";

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-pulsant", nom: "Cercle pulsant", nomEn: "Pulsing Circle",
    univers: "Entrées", famille: "Génération",
    resume: "Une animation et un son tirés de la même suite de pulsations : un battement sourd, un rythme frappé ou une mélodie et ses accords, la couleur donnant la tonalité.",
    resumeEn: "An animation and a sound drawn from the same series of pulses: a dull beat, a struck rhythm or a melody and its chords, colour giving the key.",
    notice: `Produit une animation, un cercle qui pulse en changeant de taille et de couleur, et le son correspondant, à partir d'une même suite de pulsations.

Chaque pulsation est définie par trois valeurs : un instant, un rayon et une couleur. L'animation et le son dérivent de cette suite, de sorte que les frappes tombent exactement sur les instants dessinés.

« Mode » choisit ce qui est rendu. L'image est la même dans les trois cas :
• « Pulsation » : une sinusoïde grave qui retombe vite, une par pulsation audible ; « Fréquence du battement » en donne la hauteur et « Longueur du battement » le temps d'extinction
• « Rythme » : la voix de batterie choisie sous « Percussion », frappée à chaque pulsation audible
• « Mélodie et accords » : les degrés de la gamme et l'accord de chaque case traversée

L'entrée « Pulsation » reçoit une suite de notes dont les débuts remplacent les instants engendrés. La durée reçue s'applique alors, et « Durée », « Pulsation initiale » et « Pulsation finale » restent sans effet. La vélocité des notes reçues donne le rayon, dans l'amplitude fixée par « Respiration ». La couleur reste réglée ici, et continue de donner la tonalité et le registre.

La couleur détermine la tonalité par la roue de Camelot :
• la teinte sélectionne la case, une par tranche de trente degrés
• la saturation sélectionne l'anneau : sous 50 %, l'anneau A (mineur) ; au-dessus, l'anneau B (majeur)
• la clarté sélectionne le registre, d'une octave en dessous à une octave au-dessus

La roue de Camelot classe les douze tonalités en cercle suivant la règle d'enchaînement employée par les disc-jockeys : case voisine, même numéro dans l'autre anneau, ou sept cases plus loin. La teinte étant également circulaire, deux teintes voisines correspondent à deux tonalités compatibles, et le réglage « Parcours de teinte » produit une suite de modulations cohérentes. Une correspondance directe entre teinte et demi-tons associerait au contraire deux tonalités sans relation à deux couleurs voisines.

Le rayon détermine la frappe :
• le rayon au moment de la pulsation fixe le degré dans la gamme de la case ; un rayon élevé donne une note grave
• le même rayon fixe la vélocité ; un rayon élevé donne une frappe forte
• « Respiration » règle l'amplitude de variation du rayon, donc l'étendue de gamme parcourue
• en dessous de « Seuil de silence », la pulsation est dessinée mais rien n'est émis

En mode « Mélodie et accords », deux réglages ouvrent les tables complètes :
• « Gamme » : sur « Selon la roue », l'anneau donne le majeur ou le mineur. Une des ${GAMMES.length} gammes nommées s'applique à toutes les cases, qui ne donnent plus que la tonique
• « Qualité des accords » : sur « Selon la roue », l'anneau donne la triade majeure ou mineure. Une des ${QUALITES.length} qualités nommées s'applique à toutes les cases, qui ne donnent plus que la fondamentale

Les accords sont transposés une octave sous la mélodie :
• « Tenus » : un accord par tonalité, maintenu jusqu'à la modulation suivante
• « Frappés » : le même accord répété à chaque pulsation audible
• une case dont toutes les pulsations sont sous le seuil ne reçoit aucun accord
• « Nuance des accords » règle leur vélocité ; celle de la mélodie varie de 50 à 120

Sorties :
• « Mélodie » : en mode « Pulsation », les battements, tous à la même hauteur, ce qui permet de les écrire en rythme mesuré ; en mode « Rythme », les frappes sur le canal de batterie ; en mode « Mélodie et accords », la mélodie
• « Accords » : l'harmonie en fichier MIDI distinct, instrumentable séparément. Vide hors du mode « Mélodie et accords »
• « Audio » : ce que le mode choisi fait entendre, rendu avec le moteur et l'instrument sélectionnés
• « Parcours » : le mode employé, la liste des tonalités traversées et l'instant de début de chacune

L'animation est affichée dans le composant et n'est pas disponible sur un port de sortie. Elle est produite au format SVG animé par SMIL, c'est-à-dire décrite par des balises temporelles et non par une suite d'images ; les traitements d'image ne s'y appliquent pas.`,
    noticeEn: `Produces an animation (a circle that pulses, changing size and colour) and the corresponding sound, from a single series of pulses.

Each pulse is defined by three values: an instant, a radius and a colour. The animation and the sound are both derived from this series, so that the strikes fall exactly on the instants drawn.

« Mode » chooses what is rendered. The picture is the same in all three cases:
• « Pulse »: a low sine that dies away fast, one per audible pulse; « Beat frequency » gives its pitch and « Beat length » its decay time
• « Rhythm »: the drum voice chosen under « Percussion », struck at each audible pulse
• « Melody and chords »: the degrees of the scale and the chord of each position travelled

The « Pulse » input takes a series of notes whose onsets replace the generated instants. The received length then applies, and « Duration », « Initial rate » and « Final rate » have no effect. The velocity of the received notes gives the radius, within the amplitude set by « Breathing ». The colour stays set here, and still gives the key and the register.

Colour determines the key through the Camelot wheel:
• hue selects the position, one per thirty-degree slice
• saturation selects the ring: below 50 %, ring A (minor); above, ring B (major)
• lightness selects the register, from one octave below to one octave above

The Camelot wheel arranges the twelve keys in a circle following the mixing rule used by disc jockeys: adjacent position, same number in the other ring, or seven positions away. Hue being circular as well, two neighbouring hues correspond to two compatible keys, and the « Hue journey » setting produces a coherent sequence of modulations. A direct mapping from hue to semitones would instead assign two unrelated keys to two neighbouring colours.

The radius determines the strike:
• the radius at the moment of the pulse sets the degree in the scale of the position; a large radius gives a low note
• the same radius sets the velocity; a large radius gives a loud strike
• « Breathing » sets the amplitude of the radius variation, hence the range of the scale covered
• below « Silence threshold », the pulse is drawn but nothing is emitted

In « Melody and chords » mode, two settings open the full tables:
• « Scale »: on « From the wheel », the ring gives major or minor. One of the ${GAMMES.length} named scales applies to every position, which then gives only the tonic
• « Chord quality »: on « From the wheel », the ring gives the major or minor triad. One of the ${QUALITES.length} named qualities applies to every position, which then gives only the root

The chords are transposed one octave below the melody:
• « Held »: one chord per key, sustained until the next modulation
• « Struck »: the same chord repeated at each audible pulse
• a position whose pulses are all below the threshold receives no chord
• « Chord dynamic » sets their velocity; that of the melody ranges from 50 to 120

Outputs:
• « Melody »: in « Pulse » mode, the beats, all at the same pitch, so they can be written as a measured rhythm; in « Rhythm » mode, the strikes on the drum channel; in « Melody and chords » mode, the melody
• « Chords »: the harmony as a separate MIDI file, instrumentable independently. Empty outside « Melody and chords » mode
• « Audio »: what the chosen mode sounds, rendered with the selected engine and instrument
• « Journey »: the mode used, the list of keys travelled and the start instant of each

The animation is displayed in the node and is not available on an output port. It is produced as SVG animated by SMIL, that is described by time tags rather than a sequence of images; image processing does not apply to it.`,
    entrees: [{ nom: "Pulsation", nomEn: "Pulse", type: "sequence", requis: false }],
    sorties: [
      { nom: "Mélodie", nomEn: "Melody", type: "midi" },
      { nom: "Audio", type: "audio" },
      { nom: "Parcours", nomEn: "Journey", type: "texte" },
      { nom: "Accords", nomEn: "Chords", type: "midi" },
    ],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Pulsation", "Rythme", "Mélodie et accords"],
        optionsEn: ["Pulse", "Rhythm", "Melody and chords"],
        optionIds: ["pulsation", "rythme", "melodie"], defaut: "Pulsation", defautEn: "Pulse",
        doc: "Ce que le cercle fait entendre. Pulsation : un seul son sourd par frappe, une sinusoïde grave qui retombe vite. Rythme : la percussion choisie à la place de ce son. Mélodie et accords : les degrés de la gamme et l'accord de la case traversée.",
        docEn: "What the circle sounds. Pulse: a single dull tone per strike, a low sine that dies away fast. Rhythm: the chosen percussion in place of that tone. Melody and chords: the degrees of the scale and the chord of the position travelled." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [2, 120], pas: 1, defaut: 20, unite: "s",
        doc: "Durée de l'animation, et de la pièce : les deux sont égales. Sans effet quand une pulsation est reçue à l'entrée, qui apporte la sienne.",
        docEn: "Length of the animation, and of the piece: the two are equal. Without effect when a pulse is received at the input, which brings its own." },
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
      { nom: "Fréquence du battement", nomEn: "Beat frequency", type: "curseur", plage: [30, 400], pas: 1, defaut: 60, unite: "Hz",
        doc: "La hauteur du son sourd qui marque chaque frappe. N'agit qu'en mode Pulsation.",
        docEn: "The pitch of the dull tone that marks each strike. Acts in Pulse mode only." },
      { nom: "Longueur du battement", nomEn: "Beat length", type: "curseur", plage: [10, 600], pas: 5, defaut: 120, unite: "ms",
        doc: "Le temps que met un battement à s'éteindre. N'agit qu'en mode Pulsation.",
        docEn: "The time a beat takes to die away. Acts in Pulse mode only." },
      { nom: "Percussion", nomEn: "Percussion", type: "choix",
        options: PERCUSSIONS_CHOIX.map((p) => p.fr), optionsEn: PERCUSSIONS_CHOIX.map((p) => p.en),
        optionIds: PERCUSSIONS_CHOIX.map((p) => String(p.note)),
        defaut: PERCUSSIONS_CHOIX[0].fr, defautEn: PERCUSSIONS_CHOIX[0].en,
        doc: "La voix de batterie frappée à chaque pulsation audible. N'agit qu'en mode Rythme.",
        docEn: "The drum voice struck at each audible pulse. Acts in Rhythm mode only." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["Selon la roue", ...GAMMES.map((g) => g.fr)],
        optionsEn: ["From the wheel", ...GAMMES.map((g) => g.en)],
        optionIds: [SELON_LA_ROUE, ...GAMMES.map((g) => g.id)],
        defaut: "Selon la roue", defautEn: "From the wheel",
        doc: "La gamme où la mélodie prend ses degrés. Selon la roue : la saturation choisit majeur ou mineur. Une gamme nommée s'impose partout, la case ne donnant plus que la tonique. N'agit qu'en mode Mélodie et accords.",
        docEn: "The scale the melody takes its degrees from. From the wheel: saturation picks major or minor. A named scale applies throughout, the position then giving only the tonic. Acts in Melody and chords mode only." },
      { nom: "Qualité des accords", nomEn: "Chord quality", type: "choix",
        options: ["Selon la roue", ...QUALITES.map((q) => q.fr)],
        optionsEn: ["From the wheel", ...QUALITES.map((q) => q.en)],
        optionIds: [SELON_LA_ROUE, ...QUALITES.map((q) => q.id)],
        defaut: "Selon la roue", defautEn: "From the wheel",
        doc: "La qualité des accords posés sur chaque case. Selon la roue : la triade majeure ou mineure de l'anneau. Une qualité nommée s'impose partout, la case ne donnant plus que la fondamentale. N'agit qu'en mode Mélodie et accords.",
        docEn: "The quality of the chords laid on each position. From the wheel: the major or minor triad of the ring. A named quality applies throughout, the position then giving only the root. Acts in Melody and chords mode only." },
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
      const gammeChoisie = ctx.paramTexte("Gamme", SELON_LA_ROUE);
      const qualiteChoisie = ctx.paramTexte("Qualité des accords", SELON_LA_ROUE);
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
        gamme: gammeChoisie === SELON_LA_ROUE ? undefined : gammeChoisie,
        qualite: qualiteChoisie === SELON_LA_ROUE ? undefined : qualiteChoisie,
      };

      // UNE PULSATION REÇUE DICTE LES INSTANTS, et apporte sa durée avec elle : la suite reçue est
      // datée, et la tronquer sur le réglage « Durée » couperait ce qu'on vient de brancher.
      const recue = ctx.entree(0);
      const dictee = estSequence(recue) ? (recue.notes ?? []) : null;
      if (dictee && dictee.length > 0) {
        o.dureeSec = Math.max(
          recue.duree ?? 0,
          dictee.reduce((m: number, n: { fin: number }) => Math.max(m, n.fin), 0),
        ) || o.dureeSec;
      }
      const p = dictee && dictee.length > 0 ? pulsationsDepuisNotes(dictee, o) : pulsations(o);
      if (p.length === 0) return { valeurs: [null, null, null, null], message: traduire("msg.cerclePulsant.vide") };

      const modeDuCercle = ctx.paramTexte("Mode", "pulsation") as ModeDuCercle;
      const { notes, codes } = notesDepuisPulsations(p, o);
      // La roue de Camelot code des TONALITÉS : la suite des cases traversées est une suite
      // d'accords, et la mélodie seule ne la faisait pas entendre. Voir `audio/cercle-pulsant.ts`.
      const accords = modeDuCercle !== "melodie" ? [] : accordsDepuisPulsations(
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
      // CE QUI SORT DÉPEND DU MODE, et les trois se rendent chacun sur son chemin. Une seule chose
      // leur est commune, et c'est celle qui compte : la suite de pulsations, donc l'image. Les
      // trois modes dessinent exactement le même cercle et n'en diffèrent que par ce qu'il fait
      // entendre.
      const frappes = frappesDuCercle(p, o);
      const volume = ctx.paramNombre("Volume", 80);
      let midi: File | null = null;
      let midiAccords: File | null = null;
      let audio: AudioBuffer;
      let sonnantes = notes.length;

      if (modeDuCercle === "pulsation") {
        const frequence = ctx.paramNombre("Fréquence du battement", 60);
        const longueur = ctx.paramNombre("Longueur du battement", 120) / 1000;
        const x = echantillonsDeBattements(frappes, {
          frequence, longueur, niveau: volume / 100, duree: o.dureeSec, sampleRate: SR,
        });
        const ctxOff = new OfflineAudioContext(1, Math.max(1, x.length), SR);
        audio = ctxOff.createBuffer(1, Math.max(1, x.length), SR);
        audio.getChannelData(0).set(x);
        // Les frappes sortent aussi en MIDI, toutes à la même hauteur : c'est ce qui permet de les
        // écrire en rythme mesuré, où seules les durées comptent.
        const hauteur = Math.round(Math.min(108, Math.max(21, hauteurDe(frequence))));
        const battements = frappes.map((f, i) => ({
          note: hauteur, velocite: f.force, debut: f.instant,
          fin: Math.min(o.dureeSec, i + 1 < frappes.length ? frappes[i + 1].instant : f.instant + longueur),
        }));
        midi = battements.length ? notesVersFichierMidi(battements, tempo, 0, banc, prog) : null;
        sonnantes = frappes.length;
      } else if (modeDuCercle === "rythme") {
        const voix = Math.round(Number(ctx.paramTexte("Percussion", String(PERCUSSIONS_CHOIX[0].note))))
          || PERCUSSIONS_CHOIX[0].note;
        // LE CANAL FAIT LA PERCUSSION, ici comme dans le fichier écrit : le rendu partage les notes
        // sur le canal dix et les envoie au synthétiseur de batterie.
        const coups = frappes.map((f, i) => ({
          note: voix, velocite: f.force, debut: f.instant,
          fin: Math.min(o.dureeSec, i + 1 < frappes.length ? frappes[i + 1].instant : f.instant + 0.25),
          canal: CANAL_PERCUSSION,
        }));
        midi = coups.length ? notesVersFichierMidi(coups, tempo, CANAL_PERCUSSION, banc, prog) : null;
        audio = await rendreSequence(coups, modeRendu, volume, prog, banc);
        sonnantes = coups.length;
      } else {
        // Le troisième argument est le CANAL, non le programme : instrument et banque sont les
        // quatrième et cinquième.
        midi = notesVersFichierMidi(notes, tempo, 0, banc, prog);
        midiAccords = accords.length ? notesVersFichierMidi(accords, tempo, 0, banc, prog) : null;
        // L'audio du composant est la pièce entière : la mélodie et les accords y sont rendus
        // ensemble, tandis que les deux sorties MIDI permettent de les instrumenter séparément.
        audio = await rendreSequence([...notes, ...accords], modeRendu, volume, prog, banc);
      }

      // Le parcours : la suite des tonalités traversées, sans répéter celles qui durent.
      const etapes: { code: string; depuis: number }[] = [];
      codes.forEach((c, i) => {
        if (etapes.length === 0 || etapes[etapes.length - 1].code !== c) etapes.push({ code: c, depuis: p[i].temps });
      });
      const nomDuMode = { pulsation: en ? "Pulse" : "Pulsation", rythme: en ? "Rhythm" : "Rythme",
        melodie: en ? "Melody and chords" : "Mélodie et accords" }[modeDuCercle];
      const lignes = [
        `${en ? "Mode" : "Mode"} : ${nomDuMode}`,
        ...(dictee && dictee.length > 0
          ? [`${en ? "Pulse received" : "Pulsation reçue"} : ${dictee.length} ${en ? "notes" : "notes"}`] : []),
        "",
        `${en ? "Keys travelled" : "Tonalités traversées"} : ${etapes.length}`,
        "",
        ...etapes.map((e) => `  ${e.depuis.toFixed(1).padStart(6)} s   ${e.code.padEnd(4)} ${camelotToAccord(e.code) ?? ""}`),
        "",
        `${en ? "Pulses" : "Pulsations"} : ${p.length}   ${en ? "of which silent" : "dont muettes"} : ${p.length - frappes.length}`,
      ];

      return {
        valeurs: [midi, audio, lignes.join("\n"), midiAccords],
        // L'animation se regarde ici, et ne sort pas : voir l'en-tête de ce fichier. Elle passe
        // par `affichage`, n'étant que le dessin de CE run : le réglage qui la rendrait fausse
        // l'efface, comme la remise à zéro.
        affichage: { animationSvg: svg },
        // LES ACCORDS SE COMPTENT PAR LEURS DÉBUTS, et non en divisant par trois. Une qualité
        // nommée peut en avoir quatre sons ou cinq : la division rendait un compte faux dès qu'on
        // sortait de la triade, et un compte à virgule arrondi ne se voit pas.
        message: `${nomDuMode} · ${traduire("msg.cerclePulsant.resume",
          String(p.length), String(sonnantes),
          String(new Set(accords.map((a) => a.debut)).size), String(etapes.length))}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
