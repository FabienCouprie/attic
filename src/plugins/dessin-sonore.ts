// plugins/dessin-sonore.ts — Nœud « Dessin sonore » (Kandinsky).
// Lit une image contenant des formes colorées et sonifie chaque région connexe.
// Position X → timing, position Y → hauteur, taille → durée/vélocité,
// couleur → octave. Sortie audio + MIDI.

import type { FicheAudio } from "../audio/types-domaine";
import { genererDessinSonore, GAMMES_ACCORDS, type FormeColoree } from "../audio";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { creerAleatoire } from "../core";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";

const formatCouleur = (c: FormeColoree) => `rgb(${c.couleur.r},${c.couleur.g},${c.couleur.b})`;

export const fiches: FicheAudio[] = ([
  {
    id: "dessin-sonore",
    nom: "Dessin sonore",
    nomEn: "Sound Drawing",
    univers: "Autres",
    famille: "Génération",
    resume: "Sonifie les formes colorées d'une image (dessin) en notes ou accords.",
    resumeEn: "Sonifies the colored shapes of a drawing image into notes or chords.",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defaut: "C",
        optionsEn: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], defautEn: "C",
        doc: "Fondamentale de la gamme.", docEn: "Root note of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "pentatonique majeur", "pentatonique mineur", "blues", "chromatique"], defaut: "majeur",
        optionsEn: ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "major pentatonic", "minor pentatonic", "blues", "chromatonic"], defautEn: "major",
        optionIds: GAMMES_ACCORDS.map((g) => g.id),
        doc: "Gamme utilisée pour mapper les teintes (7 modes + 2 gammes pentatoniques, en plus de blues et chromatique).",
        docEn: "Scale used to map hues (7 modes + 2 pentatonic scales, in addition to blues and chromatic)." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Mélodie", "Harmonie", "Arpège"], optionIds: ["melodie","harmonie","arpege"], optionsEn: ["Melody", "Harmony", "Arpeggio"], defaut: "Mélodie", defautEn: "Melody",
        doc: "Mélodie = une note par forme ; Harmonie = accord triadique par forme ; Arpège = accord triadique joué note après note.", docEn: "Melody = one note per shape; Harmony = triad chord per shape; Arpeggio = triad chord played one note after another." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de base.", docEn: "Base octave." },
      { nom: "Portée", nomEn: "Range", type: "nombre", plage: [1, 3], pas: 1, defaut: 2,
        doc: "Octaves de variation permises par la luminosité.", docEn: "Allowed octave variation from lightness." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 60], pas: 1, defaut: 8, unite: "s",
        doc: "Durée totale de la séquence.", docEn: "Total duration of the sequence." },
      { nom: "Couleurs", nomEn: "Colors", type: "nombre", plage: [2, 12], pas: 1, defaut: 4,
        doc: "Nombre de couleurs dominantes à détecter.", docEn: "Number of dominant colors to detect." },
      { nom: "Taille min", nomEn: "Min size", type: "nombre", plage: [0, 20], pas: 0.1, defaut: 0.5, unite: "%",
        doc: "Surface minimale d'une forme colorée pour être conservée (en % de l'image).", docEn: "Minimum colored shape area to keep (percentage of image)." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 120, unite: "BPM",
        doc: "Tempo du fichier MIDI.", docEn: "Tempo of the MIDI file." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Graine de l'extraction de palette (initialisation k-means++). Valeur par défaut FIXE : un même dessin doit rendre les mêmes formes à chaque exécution. La changer peut faire ressortir d'autres teintes dominantes.",
        docEn: "Seed for the palette extraction (k-means++ initialisation). The default is FIXED: the same drawing must yield the same shapes on every run. Changing it may surface other dominant hues." },
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

      try {
        const { audio, midi, formes } = await genererDessinSonore(image, {
          cle: ctx.paramTexte("Clé", "C"),
          gamme: ctx.paramTexte("Gamme", "majeur"),
          mode,
          octave: ctx.paramNombre("Octave", 4),
          portee: ctx.paramNombre("Portée", 2),
          duree: ctx.paramNombre("Durée", 8),
          nbCouleurs: ctx.paramNombre("Couleurs", 4),
          tailleMin: ctx.paramNombre("Taille min", 0.5) / 100,
          modeRendu,
          instrument: ctx.paramNombre("Instrument", 0),
          volume: ctx.paramNombre("Volume", 80),
          tempo: ctx.paramNombre("Tempo", 120),
          hasard: creerAleatoire(ctx.paramNombre("Graine", 42)),
        });
        const liste = formes.map(formatCouleur).join(", ");
        return { valeurs: [audio, midi], message: `Dessin sonore · ${formes.length} formes · ${liste}` };
      } catch (e: any) {
        return { valeurs: [null, null], erreur: true, message: e?.message || traduire("msg.erreur") };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
