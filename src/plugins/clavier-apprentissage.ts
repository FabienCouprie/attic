// plugins/clavier-apprentissage.ts — Nœud « Clavier d'apprentissage ».
//
// Le « Clavier mélodie » se joue à la souris et enregistre ce qu'on y a joué. Celui-ci fait
// l'inverse : on lui donne un MIDI, et il le MONTRE sur les mêmes quatre-vingt-huit touches,
// main gauche et main droite de deux couleurs, en même temps qu'il le fait entendre. C'est ce
// qui aide à apprendre : voir où se posent les doigts pendant qu'on écoute.
//
// Reste la question que pose tout fichier qu'on n'a pas écrit soi-même : est-il seulement
// JOUABLE sur un clavier ? Un fichier d'orchestre, de batterie ou de synthèse ne l'est pas, et
// l'afficher quand même serait mentir. Le partage est fait dans `audio/conformite-clavier.ts`,
// testé : quatre empêchements qui se décident — hors des 88 touches, percussion, plus de dix
// doigts, accord qu'aucune paire de mains ne tient — et trois mesures qui ne se décident pas,
// vitesse, sauts, notes tenues, rendues en chiffres plutôt qu'en verdict.
//
// LE NŒUD NE REFUSE RIEN. Il montre ce qu'il peut et nomme ce qu'il ne peut pas : on apprend sur
// du vrai répertoire, pas sur des fichiers certifiés. L'adaptation — replier les octaves,
// écarter la percussion — existe, mais elle est DEMANDÉE : une adaptation silencieuse mentirait
// sur la musique, une adaptation choisie est un arrangement.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { parseMidi } from "midi-file";
import {
  analyserMidi, notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi,
  type NoteEvenement,
} from "../audio";
import {
  CANAL_PERCUSSION, adapterAuClavier, analyserConformiteClavier, resumeConformite,
  type NoteJouee,
} from "../audio/conformite-clavier";
import {
  sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2,
  decoderInstrumentSF2,
} from "./soundfontGlobal";

const CANAUX_FR = ["Automatique", "Tous", ...Array.from({ length: 16 }, (_, i) => String(i + 1))];
const CANAUX_EN = ["Automatic", "All", ...Array.from({ length: 16 }, (_, i) => String(i + 1))];
const CANAUX_IDS = ["auto", "tous", ...Array.from({ length: 16 }, (_, i) => String(i))];

export const fiches: FicheAudio[] = ([
  {
    id: "clavier-apprentissage", nom: "Clavier d'apprentissage", nomEn: "Practice Keyboard",
    univers: "Visualisation", famille: "Analyse",
    resume: "Montre un MIDI joué sur un clavier de 88 touches, une couleur par main, et dit s'il est jouable.",
    resumeEn: "Shows a MIDI file played on an 88-key keyboard, one colour per hand, and says whether it is playable.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Conformité", nomEn: "Conformance", type: "texte" },
    ],
    parametres: [
      { nom: "Canal", nomEn: "Channel", type: "choix",
        options: CANAUX_FR, optionsEn: CANAUX_EN, optionIds: CANAUX_IDS,
        defaut: "Automatique", defautEn: "Automatic",
        doc: "Quel canal montrer. Un morceau de piano tient sur un canal ; un fichier d'orchestre en a seize, et les montrer tous rend le clavier illisible. « Automatique » prend celui qui porte le plus de notes, en évitant la percussion. Le rapport liste tous les canaux du fichier, pour qu'on puisse choisir.",
        docEn: "Which channel to show. A piano piece fits on one channel; an orchestral file has sixteen, and showing them all makes the keyboard unreadable. « Automatic » takes the one with the most notes, avoiding percussion. The report lists every channel in the file, so you can choose." },
      { nom: "Écart de main", nomEn: "Hand span", type: "curseur", plage: [8, 16], pas: 1, defaut: 12,
        unite: " ½-ton", uniteEn: " st",
        doc: "Ce qu'une main peut tenir, en demi-tons. Douze, l'octave, est la mesure ordinaire ; une grande main atteint la dixième, seize. C'est ce réglage qui décide si un accord est partageable entre deux mains, donc s'il est jouable.",
        docEn: "What one hand can hold, in semitones. Twelve, the octave, is the ordinary reach; a large hand gets a tenth, sixteen. This setting decides whether a chord can be split between two hands, hence whether it is playable." },
      { nom: "Adapter", nomEn: "Adapt", type: "choix",
        options: ["Non", "Replier dans l'ambitus", "Replier et écarter la percussion"],
        optionsEn: ["No", "Fold into range", "Fold and drop percussion"],
        optionIds: ["non", "replier", "replier-sans-percussion"],
        defaut: "Non", defautEn: "No",
        doc: "Rendre jouable ce qui ne l'est pas. « Non » laisse le fichier tel quel et se contente de dire ce qui cloche, les notes hors des 88 touches ne sont alors pas montrées. Le repliement par octaves ramène ces notes dans l'ambitus en gardant leur classe de hauteur, donc l'harmonie, au prix du registre. Rien n'est adapté sans qu'on le demande ici.",
        docEn: "Make playable what is not. « No » leaves the file as it is and merely says what is wrong, notes outside the 88 keys are then not shown. Octave folding brings those notes back into range keeping their pitch class, hence the harmony, at the cost of register. Nothing is adapted unless asked for here." },
      { nom: "Anticipation", nomEn: "Look ahead", type: "curseur", plage: [1, 8], pas: 0.5, defaut: 3, unite: "s",
        doc: "Combien de secondes de musique descendent au-dessus des touches avant d'être jouées. Court, on voit la note arriver au dernier moment ; long, on lit la phrase entière mais les notes se tassent. Trois secondes sont le compromis d'un lecteur de partition.",
        docEn: "How many seconds of music fall above the keys before being played. Short, the note appears at the last moment; long, the whole phrase is readable but the notes crowd together. Three seconds is the sight-reader's compromise." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null, null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      const { notes: brutes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
      if (brutes.length === 0) return { valeurs: [null, null, null], message: traduire("msg.aucune_note") };

      const toutes: NoteJouee[] = brutes.map((n) => ({
        note: n.note, debut: n.debut, fin: n.fin, canal: n.canal, velociete: n.velociete ?? 90,
      }));
      const ecartMax = Math.round(ctx.paramNombre("Écart de main", 12));

      // Le canal à montrer. « Automatique » prend le plus fourni en évitant la percussion :
      // sur un fichier d'orchestre, le canal le plus chargé est souvent la batterie, et l'on
      // afficherait alors des numéros d'instruments sur un clavier.
      const choixCanal = ctx.paramTexte("Canal", "auto");
      const releve = analyserConformiteClavier(toutes, { ecartMax });
      let canal: number | undefined;
      if (choixCanal === "auto") {
        canal = (releve.canaux.find((c) => !c.percussion) ?? releve.canaux[0])?.canal;
      } else if (choixCanal !== "tous") {
        canal = parseInt(choixCanal, 10);
      }

      const adaptation = ctx.paramTexte("Adapter", "non");
      const { notes: retenues, repliees, retirees } = adapterAuClavier(toutes, {
        canal,
        replier: adaptation !== "non",
        sansPercussion: adaptation === "replier-sans-percussion",
        ecartMax,
      });
      if (retenues.length === 0) {
        return {
          valeurs: [null, null, resumeConformite(releve, en ? "en" : "fr")],
          erreur: true,
          message: traduire("msg.clavier.rienAMontrer"),
        };
      }

      // Le relevé porte sur CE QUI EST MONTRÉ, et le rapport rappelle en tête les canaux du
      // fichier entier : sans cela on ne saurait pas qu'on regarde un seizième de la musique.
      const conformite = analyserConformiteClavier(retenues, { ecartMax });
      conformite.canaux = releve.canaux;
      const rapport = [
        resumeConformite(conformite, en ? "en" : "fr"),
        repliees > 0 || retirees > 0
          ? `\n${traduire("msg.clavier.adapte", String(repliees), String(retirees))}`
          : "",
      ].filter(Boolean).join("\n");

      const evenements: NoteEvenement[] = retenues.map((n) => ({
        note: n.note, velocite: n.velociete ?? 90, debut: n.debut, fin: n.fin,
      }));
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const audio = await rendreSequence(evenements, modeRendu, ctx.paramNombre("Volume", 80), instrument, banque);

      // Le MIDI de sortie est CE QUI EST MONTRÉ et entendu, non l'entrée recopiée : c'est lui
      // que la vue relit pour allumer les touches, et les deux ne doivent pas diverger.
      const midi = await appliquerInstrumentMidi(
        notesVersFichierMidi(evenements, 120), ctx.paramNombre("Instrument", 0));

      const empeche = conformite.horsClavier.graves + conformite.horsClavier.aigues
        + conformite.percussion + conformite.injouables.length;
      return {
        valeurs: [audio, midi, rapport],
        message: traduire(empeche === 0 ? "msg.clavier.conforme" : "msg.clavier.reserves",
          String(retenues.length), conformite.duree.toFixed(1), String(empeche)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

/** Réexporté pour la vue, qui colore les touches avec la même règle que l'analyse. */
export { CANAL_PERCUSSION };
