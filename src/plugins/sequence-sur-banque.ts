// plugins/sequence-sur-banque.ts — Jouer une séquence écrite sur une banque d'échantillons.
//
// LE CHAÎNON QUI MANQUAIT, relevé par Fabien : « je crée deux sons différents, je les étale sur le
// clavier séparément ; comment je me sers de l'un pour plaquer des accords et de l'autre pour jouer
// la mélodie ? » La réponse était : à la main, aux deux claviers. Le côté composition du dépôt parle
// `sequence` ; le seul composant qui consommait une `banque` était le clavier, qui ne rend que ce
// qu'on a joué à SON clavier et n'a pas d'entrée de séquence. Et le point d'écoute d'une séquence,
// lui, rend par synthèse locale ou SoundFont, jamais par une banque. Rien ne reliait donc une grille
// d'accords ou une ligne calculée aux sons qu'on venait d'étaler.
//
// CE QUE CE COMPOSANT AJOUTE TIENT EN UNE JOINTURE, et c'est pourquoi il est court : le calcul
// existait déjà, `rendreNotes`, celui-là même que le clavier appelle, et les deux formes de note
// sont le MÊME type, `Note` de `audio/note.ts`. Il n'y a donc aucune conversion, et rien qui puisse
// diverger entre ce qu'on joue à la main et ce qu'on écrit.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence } from "../audio/sequence";
import { lireMidiEnSequence } from "../audio/midi-lecture-sequence";
import { rendreNotes, type Banque } from "../audio/clavier-banque";

const en = () => langueCourante() === "en";

/** Une banque est reconnue à sa forme, comme partout ailleurs : ses zones et leur racine. */
const estBanque = (v: unknown): v is Banque =>
  !!v && typeof v === "object" && Array.isArray((v as Banque).zones);

export const fiches: FicheAudio[] = ([
  {
    id: "sequence-sur-banque",
    nom: "Jouer une séquence sur une banque", nomEn: "Play Sequence on Bank",
    univers: "Sorties", famille: "Écoute",
    resume: "Joue une séquence écrite sur une banque d'échantillons : la ligne vient du graphe, le timbre vient du son étalé sur le clavier.",
    resumeEn: "Plays a written sequence on a sample bank: the line comes from the graph, the timbre from the sound spread across the keyboard.",
    notice: "Ce composant joue une séquence sur une banque d'échantillons et rend l'audio. La séquence donne les hauteurs, les instants et les nuances ; la banque donne le timbre, chaque note étant jouée par la zone qui couvre sa touche.\n\nDeux sons étalés sur le clavier et deux de ces composants font deux instruments distincts : une grille d'accords sur l'un, une ligne mélodique sur l'autre, réunies ensuite par le mélangeur.\n\nL'entrée « Séquence » accepte ce que rendent les composants de composition. L'entrée « Banque » accepte ce que rend « Étaler sur le clavier », un fichier SFZ relu, ou la sortie de banque d'un clavier. L'entrée « MIDI » accepte un fichier MIDI, d'où qu'il vienne : un séquenceur, un clavier, une notation, une capture. Elle raccourcit la chaîne d'un composant sur cette route ; la séquence l'emporte quand les deux sont branchées, et le message dit d'où viennent les notes.\n\n« Canal » n'apparaît qu'avec l'entrée MIDI, et dit quel canal du fichier est joué. Une partition à plusieurs voix écrit une voix par canal : deux exemplaires de ce composant, réglés sur deux canaux, donnent deux instruments.\n\n« Volume » est le niveau de sortie, que la nuance de chaque note module. « Relâchement » est le temps d'extinction après la fin de chaque note. « Fondu de boucle » est la durée du fondu au raccord de la boucle de maintien, quand la banque en porte une.\n\n« Hauteurs » décide du sort d'une hauteur qui tombe entre deux touches. Une banque joue par rééchantillonnage, donc elle n'est tenue à aucune grille : « Telles qu'écrites » joue la hauteur exacte, « Ramenées au demi-ton » l'arrondit au demi-ton tempéré le plus proche, comme le ferait un clavier. Les composants spectraux produisent de telles hauteurs, la série harmonique ne tombant pas sur la grille tempérée : sa quinte est deux centièmes de demi-ton au-dessus de la quinte tempérée, sa tierce majeure quatorze centièmes au-dessous de la tierce tempérée. Une séquence dont toutes les hauteurs sont entières sonne pareil dans les deux cas.\n\nUne note dont la touche sort des zones de la banque est jouée par la zone la plus proche. Une note dont la fin n'est pas après son début est écartée, et le message dit combien.\n\nLa sortie « Audio » rend la séquence jouée. Le message donne le nombre de notes jouées et la durée.",
    noticeEn: "This node plays a sequence on a sample bank and returns the audio. The sequence gives the pitches, the instants and the dynamics; the bank gives the timbre, each note being played by the zone covering its key.\n\nTwo sounds spread across the keyboard and two of these nodes make two distinct instruments: a chord grid on one, a melodic line on the other, joined afterwards by the mixer.\n\nThe « Sequence » input takes what the composition nodes return. The « Bank » input takes what « Spread Across Keyboard » returns, an SFZ file read back, or a keyboard's bank output. The « MIDI » input takes a MIDI file, wherever it comes from: a sequencer, a keyboard, a notation, a capture. It shortens the chain by one node on that route; the sequence wins when both are connected, and the message says where the notes come from.\n\n« Channel » appears only with the MIDI input, and says which channel of the file is played. A score in several voices writes one voice per channel: two copies of this node, set to two channels, give two instruments.\n\n« Volume » is the output level, scaled by each note's dynamic. « Release » is the fade-out time after each note ends. « Loop crossfade » is the length of the crossfade at the sustain loop's join, when the bank carries one.\n\n« Pitches » decides the fate of a pitch falling between two keys. A bank plays by resampling, so it is held to no grid: « As written » plays the exact pitch, « Snapped to semitones » rounds it to the nearest equal-tempered semitone, as a keyboard would. Spectral nodes produce such pitches, the harmonic series not falling on the tempered grid: its fifth is two hundredths of a semitone above the tempered fifth, its major third fourteen hundredths below the tempered third. A sequence whose pitches are all integers sounds the same either way.\n\nA note whose key falls outside the bank's zones is played by the nearest zone. A note whose end is not after its start is dropped, and the message says how many.\n\nThe « Audio » output returns the played sequence. The message gives the number of notes played and the length.",
    // L'ENTRÉE MIDI EST LA TROISIÈME, ET C'EST DÉLIBÉRÉ. Elle a été demandée par Fabien pour
    // raccourcir la route la plus fréquente, le MIDI étant ce que produisent les séquenceurs, les
    // claviers et la notation. La poser en dernier garde le rang des deux autres : un graphe
    // enregistré avant elle continue de trouver sa banque sur la même entrée.
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: false },
      { nom: "Banque", nomEn: "Bank", type: "banque" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi", requis: false },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      // LES MÊMES NOMS ET LES MÊMES PLAGES QUE LE CLAVIER, parce que c'est le même calcul : une
      // séquence jouée ici et la même jouée à la main doivent se régler du même geste.
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de sortie. La nuance de chaque note le module.",
        docEn: "Output level. Each note's dynamic scales it." },
      { nom: "Relâchement", nomEn: "Release", type: "curseur", plage: [1, 2000], pas: 1, defaut: 150, unite: "ms",
        doc: "Temps d'extinction après la fin de chaque note. La sortie dure donc un peu plus que la séquence.",
        docEn: "Fade-out time after each note ends. The output therefore lasts a little longer than the sequence." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "curseur", plage: [1, 200], pas: 1, defaut: 20, unite: "ms",
        doc: "Durée du fondu au raccord de la boucle de maintien, quand la banque en porte une. Sans boucle, ce réglage ne sert pas.",
        docEn: "Length of the crossfade at the sustain loop's join, when the bank carries one. With no loop, this setting does nothing." },
      // LE CHOIX EST EXPLICITE, demandé par Fabien. Une banque joue par rééchantillonnage : elle
      // peut donc rendre une hauteur qui tombe entre deux touches, ce qu'un clavier ne peut pas. Les
      // composants spectraux en produisent, la série harmonique ne tombant pas sur la grille
      // tempérée. Ni l'une ni l'autre n'est fausse, ce sont deux grilles ; le réglage dit laquelle,
      // au lieu de laisser la question se poser à chaque écoute.
      { nom: "Hauteurs", nomEn: "Pitches", type: "choix",
        options: ["Telles qu'écrites", "Ramenées au demi-ton"],
        optionsEn: ["As written", "Snapped to semitones"],
        optionIds: ["ecrites", "demi-ton"],
        defaut: "Telles qu'écrites", defautEn: "As written",
        doc: "Ce que le composant fait d'une hauteur qui tombe entre deux touches. « Telles qu'écrites » la joue à sa hauteur exacte : une banque joue par rééchantillonnage, ce qui n'oblige à aucune grille. « Ramenées au demi-ton » l'arrondit au demi-tempéré le plus proche, comme le ferait un clavier. Une séquence dont toutes les hauteurs sont entières sonne pareil dans les deux cas. Le message dit combien de notes ont été déplacées et de combien.",
        docEn: "What the node does with a pitch falling between two keys. « As written » plays it at its exact pitch: a bank plays by resampling, which imposes no grid. « Snapped to semitones » rounds it to the nearest equal-tempered semitone, as a keyboard would. A sequence whose pitches are all integers sounds the same either way. The message says how many notes were moved and by how much." },
      // CE RÉGLAGE APPARTIENT À L'ENTRÉE MIDI, et ne paraît donc que lorsqu'elle est branchée : sur
      // la route par séquence, il n'aurait rien à commander.
      { nom: "Canal", nomEn: "Channel", type: "nombre", plage: [-1, 15], pas: 1, defaut: -1, port: 2,
        doc: "Le canal MIDI retenu quand un fichier arrive sur l'entrée « MIDI ». À moins un, tous les canaux sont pris ensemble ; de zéro à quinze, seules les notes de ce canal sont jouées. C'est ainsi qu'une partition à plusieurs voix se répartit sur plusieurs banques, chaque voix étant écrite sur son canal.",
        docEn: "The MIDI channel kept when a file arrives on the « MIDI » input. At minus one, all channels are taken together; from zero to fifteen, only that channel's notes are played. This is how a score in several voices is spread over several banks, each voice being written on its own channel." },
    ],
    async executer(ctx: any) {
      const banque = ctx.entree(1);
      if (!estBanque(banque) || banque.zones.length === 0) {
        return { valeurs: [null], message: en() ? "No bank." : "Aucune banque." };
      }
      // LA SÉQUENCE L'EMPORTE SUR LE MIDI quand les deux arrivent : c'est le nom du composant, et
      // une séquence porte plus que ce qu'un fichier MIDI sait dire, ses hauteurs pouvant ne pas
      // tomber sur un demi-ton. Le MIDI est la route courte, non la route principale.
      const parSequence = ctx.entree(0);
      const fichier = ctx.entree(2);
      const canal = Math.round(ctx.paramNombre("Canal", -1));
      let sequence = parSequence;
      let venuDuMidi = false;
      if (!estSequence(sequence) && fichier instanceof File) {
        // LA MÊME LECTURE QUE « MIDI → séquence », et c'est la seule du dépôt.
        const lu = await lireMidiEnSequence(fichier, canal, 120);
        if (!lu.sequence) {
          return {
            valeurs: [null],
            message: canal < 0
              ? (en() ? "No note in the MIDI file." : "Aucune note dans le fichier MIDI.")
              : (en() ? `No note on channel ${canal}.` : `Aucune note sur le canal ${canal}.`),
          };
        }
        sequence = lu.sequence;
        venuDuMidi = true;
      }
      if (!estSequence(sequence)) {
        return { valeurs: [null], message: en() ? "No sequence." : "Aucune séquence." };
      }
      // AUCUNE CONVERSION : les notes d'une séquence et celles qu'un clavier enregistre sont le même
      // type. Seules les notes sans durée sont écartées, `rendreNotes` les ignorant de toute façon.
      const ecrites = sequence.notes.filter((n) => n.fin > n.debut);
      const ecartees = sequence.notes.length - ecrites.length;
      if (ecrites.length === 0) {
        return { valeurs: [null], message: en() ? "No note to play." : "Aucune note à jouer." };
      }
      // LA GRILLE, QUAND ON LA DEMANDE. Le déplacement est compté pour être dit : une note ramenée
      // de quatorze centièmes de demi-ton n'est pas la même note, et le taire serait mentir sur ce
      // qu'on entend.
      const surLaGrille = String(ctx.paramTexte("Hauteurs", "ecrites")) === "demi-ton";
      const jouables = surLaGrille
        ? ecrites.map((n) => ({ ...n, note: Math.round(n.note) }))
        : ecrites;
      const deplacees = surLaGrille ? ecrites.filter((n) => !Number.isInteger(n.note)).length : 0;
      const ecartMax = surLaGrille
        ? ecrites.reduce((m, n) => Math.max(m, Math.abs(n.note - Math.round(n.note))), 0)
        : 0;
      const audio = rendreNotes(jouables, banque, {
        volume: ctx.paramNombre("Volume", 80) / 100,
        relachement: ctx.paramNombre("Relâchement", 150) / 1000,
        fonduBoucle: ctx.paramNombre("Fondu de boucle", 20) / 1000,
      });
      const dit = en()
        ? `${jouables.length} notes · ${audio.duration.toFixed(2)} s`
        : `${jouables.length} notes · ${audio.duration.toFixed(2).replace(".", ",")} s`;
      const reste = ecartees > 0
        ? (en() ? ` · ${ecartees} without length` : ` · ${ecartees} sans durée`)
        : "";
      // Le déplacement se dit en CENTIÈMES DE DEMI-TON, l'unité dans laquelle on juge un écart de
      // hauteur : quatorze centièmes est l'écart entre la tierce naturelle et la tierce tempérée.
      const cents = Math.round(ecartMax * 100);
      const grille = deplacees > 0
        ? (en()
          ? ` · ${deplacees} snapped, up to ${cents} hundredths of a semitone`
          : ` · ${deplacees} ramenées, jusqu'à ${cents} centièmes de demi-ton`)
        : "";
      // D'OÙ VIENNENT LES NOTES SE DIT, faute de quoi un graphe à deux entrées branchées laisserait
      // deviner laquelle a servi.
      const venue = venuDuMidi
        ? (canal < 0
          ? (en() ? " · from MIDI" : " · depuis le MIDI")
          : (en() ? ` · from MIDI, channel ${canal}` : ` · depuis le MIDI, canal ${canal}`))
        : "";
      return { valeurs: [audio], message: dit + venue + reste + grille };
    },
  },
] as FicheAudio[]).map(avecDoc);
