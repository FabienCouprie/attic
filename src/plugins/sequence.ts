// plugins/sequence.ts — Faire entendre une séquence de notes, et la rendre au format que les autres lisent.
//
// POURQUOI CE NŒUD EXISTE. Le flux « séquence » porte des hauteurs qui ne tombent pas sur un
// demi-ton. Sans un rendu qui les respecte, ce flux ne se prouverait pas : il faut entendre le
// quart de ton pour croire qu'il a traversé.
//
// LES DEUX SYNTHÈSES SONT CONTINUES, ET C'EST MESURÉ. La voie FM calcule `440 × 2^((n − 69) / 12)`
// à partir de la hauteur reçue ; la voie SoundFont calcule un rapport de lecture par la même
// formule, augmenté de l'accord de la zone. Ni l'une ni l'autre n'arrondit, de sorte qu'une hauteur
// fractionnaire s'entend à sa fréquence exacte. La vérification vit dans `audio/microtons.test.ts`.
//
// LA SORTIE MIDI, ELLE, ARRONDIT, et le message le dit plutôt que de le taire : le numéro de note
// d'un fichier MIDI est un octet. C'est la limite du format et non un défaut du nœud ; qui veut
// garder les cents grave en MusicXML, dont le champ d'altération accepte les fractions.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { notesVersFichierMidi, rendreSequence } from "../audio";
import { compterMicrotons, dureeSequence, estSequence } from "../audio/sequence";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";

const en = () => langueCourante() === "en";

/** Les timbres de la synthèse locale. « Sinus » ne module pas, donc il rend la hauteur seule. */
const TIMBRES = [
  { id: "pur", nom: "Sinus", nomEn: "Sine" },
  { id: "douce", nom: "Douce", nomEn: "Soft" },
  { id: "brillante", nom: "Brillante", nomEn: "Bright" },
  { id: "percutante", nom: "Percutante", nomEn: "Percussive" },
] as const;

/**
 * Le nom du preset que la SoundFont va réellement employer.
 *
 * POURQUOI LE MESSAGE LE DIT. Fabien a vu « Gun Shot » sur son écran, lu « Yamaha Grand Piano »
 * ailleurs, et entendu une détonation : trois noms pour un seul rendu, dont aucun ne prouvait ce
 * que le moteur faisait. La règle est la même que pour le paquet de bruitage — ce qui a servi est
 * nommé par celui qui a servi, et non par le réglage.
 *
 * LA RÉSOLUTION EST CELLE DU MOTEUR, repli compris : à défaut du programme demandé, la recherche
 * prend le premier preset du fichier, et c'est justement ce repli qu'il faut pouvoir voir.
 */
function presetSf2(programme: number, banque: number): string {
  const sf = sf2Chargee();
  if (!sf) return "?";
  const prog = programme >= 0 ? programme : 0;
  const bq = banque >= 0 ? banque : 0;
  const exact = sf.presets.find((p) => p.programme === prog && p.banque === bq);
  if (exact) return exact.nom;
  const repli = sf.presets[0];
  return repli ? `${repli.nom} ${en() ? "(fallback)" : "(repli)"}` : "?";
}

export const fiches: FicheAudio[] = ([
  {
    id: "rendu-sequence",
    nom: "Rendu de séquence", nomEn: "Sequence Renderer",
    univers: "Traitement", famille: "Conversion",
    resume: "Joue une séquence de notes en gardant ses écarts au tempérament, et en rend aussi le MIDI.",
    resumeEn: "Plays a note sequence keeping its deviations from equal temperament, and also returns the MIDI.",
    notice: "Fait entendre une séquence de notes reçue sur son entrée, et en rend un fichier MIDI.\n\nLes hauteurs d'une séquence peuvent ne pas tomber sur un demi-ton. Les deux synthèses les respectent : la voie FM calcule la fréquence directement depuis la hauteur reçue, la voie SoundFont en déduit une vitesse de lecture de l'échantillon. Un quart de ton s'entend donc à sa fréquence exacte, et non à celle de la touche voisine.\n\nLa sortie MIDI, elle, arrondit. Le numéro de note d'un fichier MIDI est un octet, et le format ne sait pas porter de cents. Le message dit combien de hauteurs y laissent leur écart, de sorte que la perte se voie au lieu de se deviner. Pour garder les écarts dans une partition écrite, graver en MusicXML, dont le champ d'altération accepte les fractions de demi-ton.\n\n« Synthèse » choisit le moteur, et la synthèse locale est prise par défaut, contrairement à l'usage ailleurs. Une SoundFont apporte à chaque partiel le spectre entier d'un instrument échantillonné : douze partiels deviennent douze pianos plaqués sur trois octaves, et l'agrégat calculé disparaît sous eux. Elle reste offerte pour une mélodie ordinaire. « Automatique » la prend dès qu'un fichier SF2 est chargé.\n\nLe message commence par le moteur qui a réellement rendu, et non par le réglage : « Automatique » ne dit pas lequel a servi.\n\n« Instrument » choisit le programme de la SoundFont, quand elle est employée.\n\n« Timbre » décide de ce que devient chaque note en synthèse locale, et le choix n'est pas décoratif. « Sinus » rend exactement la hauteur demandée, une sinusoïde et rien d'autre : un agrégat calculé s'entend alors tel qu'il a été écrit. Les trois autres modulent la fréquence, ce qui ajoute à chaque note une huitaine de partiels qu'elle n'avait pas. Sur une série harmonique de douze partiels à 110 hertz, dont les plus forts sont les plus graves, le timbre brillant laisse un pour cent de l'énergie sous 500 hertz et en porte quatre-vingt-dix-neuf entre 500 hertz et 4 kilohertz : ce n'est plus le spectre calculé que l'on entend. Ces timbres conviennent à une mélodie, pas à un spectre.\n\n« Volume » règle le niveau du rendu.\n\n« Tempo » n'agit pas sur ce qu'on entend, les temps d'une séquence étant en secondes. Il est inscrit dans le fichier MIDI, où il décide de la valeur des notes à la relecture.\n\nLe message donne le nombre de notes, la durée, et le nombre de hauteurs que la sortie MIDI arrondit.",
    noticeEn: "Plays a note sequence received on its input, and returns a MIDI file of it.\n\nThe pitches of a sequence need not fall on a semitone. Both synthesis paths respect them: the FM path computes the frequency straight from the pitch received, the SoundFont path derives a sample playback rate from it. A quarter tone is therefore heard at its exact frequency, not at that of the neighbouring key.\n\nThe MIDI output does round. The note number of a MIDI file is one byte, and the format cannot carry cents. The message states how many pitches lose their deviation there, so the loss is visible rather than guessed. To keep the deviations in a written score, engrave to MusicXML, whose alteration field accepts fractions of a semitone.\n\n« Synthesis » selects the engine, and local synthesis is taken by default, unlike the usage elsewhere. A SoundFont brings each partial the whole spectrum of a sampled instrument: twelve partials become twelve pianos struck across three octaves, and the computed aggregate vanishes beneath them. It remains available for an ordinary melody. « Auto » takes it as soon as an SF2 file is loaded.\n\nThe message starts with the engine that actually rendered, not with the setting: « Auto » does not say which one served.\n\n« Instrument » selects the SoundFont program, when it is used.\n\n« Timbre » decides what each note becomes in local synthesis, and the choice is not decorative. « Sine » renders exactly the pitch asked for, a sine wave and nothing else: a computed aggregate is then heard as it was written. The other three modulate the frequency, which adds some eight partials each note did not have. On a harmonic series of twelve partials at 110 hertz, whose strongest are the lowest, the bright timbre leaves one percent of the energy below 500 hertz and puts ninety-nine between 500 hertz and 4 kilohertz: what is heard is no longer the computed spectrum. Those timbres suit a melody, not a spectrum.\n\n« Volume » sets the level of the rendering.\n\n« Tempo » has no effect on what is heard, the times of a sequence being in seconds. It is written into the MIDI file, where it decides the note values on reading back.\n\nThe message gives the number of notes, the duration, and how many pitches the MIDI output rounds.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      // LA SYNTHÈSE LOCALE PAR DÉFAUT, ET NON « AUTOMATIQUE » COMME AILLEURS. Relevé par Fabien à
      // l'écoute, deux fois : le son restait une explosion après la correction du timbre, parce
      // qu'une SoundFont était chargée et qu'« Automatique » la préfère. Or un échantillon de piano
      // ou de cordes apporte à CHAQUE partiel son spectre entier : douze partiels deviennent douze
      // instruments plaqués sur trois octaves, et l'agrégat calculé disparaît sous eux. La
      // SoundFont reste offerte, pour une mélodie ordinaire, et le message dit toujours quel
      // moteur a rendu.
      { ...PARAMETRE_SYNTHESE, defaut: "FM/Oscillateurs", defautEn: "FM/Oscillators",
        doc: "Synthèse locale par défaut : c'est la seule qui rende une note comme une sinusoïde, donc un agrégat tel qu'il a été calculé. La SoundFont apporte à chaque partiel le spectre entier d'un instrument échantillonné.",
        docEn: "Local synthesis by default: it is the only one that renders a note as a sine wave, hence an aggregate as it was computed. The SoundFont brings each partial the whole spectrum of a sampled instrument." },
      // LE SÉLECTEUR SIMPLE, SANS « SUIVRE LE MIDI » : ce nœud ne reçoit pas de fichier MIDI, donc
      // il n'y a aucun changement de programme à suivre. L'option y proposait un comportement sans
      // objet, qui se résolvait silencieusement au programme 0.
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Timbre", nomEn: "Timbre", type: "choix",
        options: TIMBRES.map((t) => t.nom), optionsEn: TIMBRES.map((t) => t.nomEn),
        optionIds: TIMBRES.map((t) => t.id),
        defaut: "Sinus", defautEn: "Sine",
        doc: "Le timbre de chaque note en synthèse locale. « Sinus » ne rend que la hauteur demandée ; les trois autres modulent et ajoutent leurs propres partiels.",
        docEn: "The timbre of each note in local synthesis. « Sine » renders only the pitch asked for; the other three modulate and add partials of their own." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau du rendu.", docEn: "The level of the rendering." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Inscrit dans le fichier MIDI ; sans effet sur ce qu'on entend.",
        docEn: "Written into the MIDI file; no effect on what is heard." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      if (entree.notes.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "The sequence is empty." : "La séquence est vide.",
        };
      }
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const volume = ctx.paramNombre("Volume", 80);
      const tempo = ctx.paramNombre("Tempo", 120);
      const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", -1));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" =
        mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";

      // LE TIMBRE DÉCIDE SI L'ON ENTEND LE SPECTRE CALCULÉ OU AUTRE CHOSE. Voir `CARACTERES_FM` :
      // un timbre modulé ajoute à chaque note une huitaine de bandes latérales, et l'agrégat
      // entendu n'est plus celui qu'on a écrit. D'où la sinusoïde par défaut sur ce flux.
      const timbre = ctx.paramTexte("Timbre", "pur") as "pur" | "douce" | "brillante" | "percutante";
      // La durée voulue est transmise : une séquence qui se termine par un silence dure plus
      // longtemps que sa dernière note, et le rendu doit garder ce silence.
      const audio = await rendreSequence(
        entree.notes, modeRendu, volume, programme, banque, timbre, dureeSequence(entree));
      const midi = notesVersFichierMidi(entree.notes, entree.tempo ?? tempo);
      const arrondies = compterMicrotons(entree);
      const perte = arrondies === 0
        ? (en() ? "no pitch rounded" : "aucune hauteur arrondie")
        : (en() ? `${arrondies} pitches rounded in the MIDI` : `${arrondies} hauteurs arrondies dans le MIDI`);
      // LE MOTEUR EN TÊTE DU MESSAGE, et non le réglage : « Automatique » ne dit pas ce qui a
      // rendu. Deux écoutes ont été perdues à chercher dans le calcul un défaut qui venait de là.
      const moteur = modeRendu === "SoundFont"
        ? `SoundFont · ${presetSf2(programme, banque)}`
        : (TIMBRES.find((t) => t.id === timbre) ?? TIMBRES[0])[en() ? "nomEn" : "nom"];
      return {
        valeurs: [audio, midi],
        message: `${moteur} · ${entree.notes.length} notes · `
          + `${dureeSequence(entree).toFixed(2)} s · ${perte}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
