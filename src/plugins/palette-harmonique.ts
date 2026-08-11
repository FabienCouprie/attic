// plugins/palette-harmonique.ts — Nœud « Palette harmonique ».
// Extrait les couleurs dominantes d'une image et les traduit en notes : la teinte
// choisit le degré de la gamme, la luminosité l'octave, la saturation la vélocité,
// et la position horizontale le moment de lecture.

import type { FicheAudio } from "../audio/types-domaine";
import { genererPaletteHarmonique, GAMMES_ACCORDS, type CouleurExtraite } from "../audio";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";

const formatCouleur = (c: CouleurExtraite) => `rgb(${c.r},${c.g},${c.b})`;

export const fiches: FicheAudio[] = ([
  {
    id: "palette-harmonique",
    nom: "Palette harmonique",
    nomEn: "Harmonic Palette",
    univers: "Autres",
    famille: "Génération",
    resume: "Extrait une palette de couleurs dominantes d'une image et génère une mélodie, harmonie ou arpège.",
    resumeEn: "Extracts dominant colors from an image and generates a melody, harmony or arpeggio.",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defaut: "C",
        optionsEn: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defautEn: "C",
        doc: "Fondamentale de la gamme utilisée.", docEn: "Root note of the scale used." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "pentatonique majeur", "pentatonique mineur", "blues", "chromatique"], defaut: "majeur",
        optionsEn: ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "major pentatonic", "minor pentatonic", "blues", "chromatonic"], defautEn: "major",
        optionIds: GAMMES_ACCORDS.map((g) => g.id),
        doc: "Gamme sur laquelle mapper les teintes (7 modes + 2 gammes pentatoniques, en plus de blues et chromatique).",
        docEn: "Scale used to map hues (7 modes + 2 pentatonic scales, in addition to blues and chromatic)." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Mélodie", "Harmonie", "Arpège"], optionsEn: ["Melody", "Harmony", "Arpeggio"], defaut: "Mélodie", defautEn: "Melody",
        doc: "Mélodie = une note par couleur ; Harmonie = accord triadique par couleur ; Arpège = accord triadique joué note après note.", docEn: "Melody = one note per color; Harmony = triad chord per color; Arpeggio = triad chord played one note after another." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de base des notes générées.", docEn: "Base octave of generated notes." },
      { nom: "Portée", nomEn: "Range", type: "nombre", plage: [1, 3], pas: 1, defaut: 2,
        doc: "Nombre d'octaves sur lesquels la luminosité peut faire varier les notes.", docEn: "Number of octaves over which lightness can vary notes." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 60], pas: 1, defaut: 8, unite: "s",
        doc: "Durée totale de la séquence audio/MIDI.", docEn: "Total duration of the audio/MIDI sequence." },
      { nom: "Couleurs", nomEn: "Colors", type: "nombre", plage: [2, 12], pas: 1, defaut: 4,
        doc: "Nombre de couleurs dominantes à extraire.", docEn: "Number of dominant colors to extract." },
      { nom: "Ordre", nomEn: "Order", type: "choix", options: ["Horizontal", "Vertical", "Luminosité", "Saturation"], optionsEn: ["Horizontal", "Vertical", "Brightness", "Saturation"], defaut: "Horizontal", defautEn: "Horizontal",
        doc: "Ordre de lecture des couleurs dans la séquence.", docEn: "Reading order of colors in the sequence." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Tempo du fichier MIDI.", docEn: "Tempo of the MIDI file." },
    ],
    async executer(ctx: any) {
      const image = ctx.entree(0);
      if (!(image instanceof File)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.connecter.image") };
      }

      const modeStr = ctx.paramTexte("Mode", "Mélodie").toLowerCase();
      const mode = modeStr.includes("harm") ? "harmonie" : modeStr.includes("arp") ? "arpege" : "melodie";
      const modeRenduBrut = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu = modeRenduBrut === "Automatique" ? (sf2Chargee() ? "SoundFont" : "FM/Oscillateurs") : modeRenduBrut;
      const ordre = ctx.paramTexte("Ordre", "Horizontal");
      const ordreValide: any = ["Horizontal", "Vertical", "Luminosité", "Saturation"].includes(ordre)
        ? ordre.toLowerCase() as any
        : "horizontal";

      try {
        const { audio, midi, palette } = await genererPaletteHarmonique(image, {
          cle: ctx.paramTexte("Clé", "C"),
          gamme: ctx.paramTexte("Gamme", "majeur"),
          mode,
          octave: ctx.paramNombre("Octave", 4),
          portee: ctx.paramNombre("Portée", 2),
          duree: ctx.paramNombre("Durée", 8),
          nbCouleurs: ctx.paramNombre("Couleurs", 4),
          ordre: ordreValide,
          modeRendu,
          instrument: ctx.paramNombre("Instrument", 0),
          volume: ctx.paramNombre("Volume", 80),
          tempo: ctx.paramNombre("Tempo", 120),
        });
        const liste = palette.map(formatCouleur).join(", ");
        return { valeurs: [audio, midi], message: `Palette harmonique · ${palette.length} couleurs · ${liste}` };
      } catch (e: any) {
        return { valeurs: [null, null], erreur: true, message: e?.message || traduire("msg.erreur") };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
