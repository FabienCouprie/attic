// plugins/zones-vers-midi.ts — Nœud « Zones → MIDI » : une zone, une note.
//
// CE NŒUD FERME UNE CHAÎNE QUI S'ARRÊTAIT À L'ANALYSE. Les zones d'un enregistrement se trouvent
// (découpage en objets, passage par zéro), et elles se consomment pour monter, doser ou effacer ;
// aucune ne devenait un évènement joué. Les instants d'une parole ou d'un geste restaient donc
// mesurables sans être jouables.
//
// LA HAUTEUR VIENT D'UNE COURBE, ET LA COURBE N'A PAS D'UNITÉ. Une courbe porte des valeurs entre
// zéro et un, le receveur décidant de ce qu'elles valent : c'est la convention de tout paramètre
// modulable du catalogue. Les deux bornes sont donc des réglages de ce nœud, et elles doivent
// reprendre les hauteurs extrêmes cherchées en amont pour que les notes tombent juste.
//
// LE RENDU N'EST PAS ICI. La sortie est un fichier MIDI, que les nœuds d'écoute et de rendu
// existants prennent en entrée : ce nœud ne synthétise rien, donc il n'a ni volume ni niveau.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe } from "../audio/courbe";
import { GAMMES_ACCORDS, degresGammeAccords } from "../audio/generation";
import { LIBELLES_HERITES_GAMMES } from "../audio/gammes";
import { PARAMETRE_CLE, demiTonDeCle } from "../audio/cles";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { notesDesZones, tableauDesZones, zonesRetenues } from "../audio/zones-vers-midi";

export const fiches = ([
  {
    id: "zones-vers-midi", nom: "Zones → MIDI", nomEn: "Zones → MIDI",
    univers: "Traitement", famille: "Conversion",
    resume: "Pose une note sur chaque zone reçue, à son début et pour sa durée.",
    resumeEn: "Puts a note on each received zone, at its start and for its length.",
    notice: "Ce composant écrit un fichier MIDI à partir de zones datées. Chaque zone donne une note : "
      + "son début donne l'instant de la note, sa durée donne la durée de la note.\n\n"
      + "« Source de hauteur » décide d'où vient la note. « Courbe de hauteur » la lit sur la courbe "
      + "reçue sur l'entrée « Hauteur », au long de la zone ; la valeur retenue est la médiane des "
      + "valeurs non nulles, le début d'une zone étant souvent une attaque sans hauteur. « Note fixe » "
      + "pose partout la note du réglage « Note fixe », qui sert aussi aux zones où la courbe ne donne "
      + "aucune hauteur.\n\n"
      + "« Note min » et « Note max » disent ce que valent le zéro et le un de la courbe reçue. "
      + "L'échelle entre les deux est en demi-tons.\n\n"
      + "« Clé » et « Gamme » donnent les degrés permis pour la hauteur lue sur la courbe. La note du "
      + "réglage « Note fixe » n'y est pas soumise.\n\n"
      + "« Vélocité » décide de la nuance. « Par le niveau » la prend sur le niveau que la zone porte, "
      + "de 1 à moins soixante décibels jusqu'à 127 à pleine échelle. « Fixe » pose partout la valeur "
      + "du réglage « Vélocité fixe », qui sert aussi aux zones sans niveau.\n\n"
      + "« Canal » est le canal écrit dans le fichier ; le canal 9 est celui des percussions. "
      + "« Tempo du fichier MIDI » est le tempo inscrit : les notes gardent les instants des zones, "
      + "le tempo ne les déplace pas.\n\n"
      + "La sortie « MIDI » rend le fichier. La sortie « Notes » rend un tableau d'une ligne par zone, "
      + "avec son début, sa durée, sa note et sa nuance.",
    noticeEn: "This component writes a MIDI file from dated zones. Each zone gives one note: its start "
      + "gives the note's instant, its length gives the note's length.\n\n"
      + "« Pitch source » decides where the note comes from. « Pitch curve » reads it on the curve "
      + "received on the « Pitch » input, along the zone; the value kept is the median of the non-zero "
      + "values, the start of a zone often being an attack without pitch. « Fixed note » puts the note "
      + "of the « Fixed note » setting everywhere, which also serves the zones where the curve gives no "
      + "pitch.\n\n"
      + "« Lowest note » and « Highest note » say what the curve's zero and one are worth. The scale "
      + "between the two is in semitones.\n\n"
      + "« Key » and « Scale » give the allowed degrees for the pitch read on the curve. The note of the "
      + "« Fixed note » setting is not subject to them.\n\n"
      + "« Velocity » decides the dynamic. « From level » takes it from the level the zone carries, from "
      + "1 at minus sixty decibels up to 127 at full scale. « Fixed » puts the value of the « Fixed "
      + "velocity » setting everywhere, which also serves the zones without a level.\n\n"
      + "« Channel » is the channel written into the file; channel 9 is the percussion one. « MIDI tempo » "
      + "is the tempo written in: the notes keep the instants of the zones, the tempo does not move them.\n\n"
      + "The « MIDI » output renders the file. The « Notes » output renders a table with one line per zone, "
      + "with its start, its length, its note and its dynamic.",
    entrees: [
      { nom: "Zones", nomEn: "Zones", type: "controle", sousType: "zones" },
      { nom: "Hauteur", nomEn: "Pitch", type: "courbe", requis: false },
    ],
    sorties: [
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Notes", nomEn: "Notes", type: "texte" },
    ],
    // Un enregistrement où le découpage ne trouve aucun objet est un résultat, et non une panne :
    // le nœud a bien tourné, et il le dit.
    sortieNullePermise: true,
    parametres: [
      { nom: "Source de hauteur", nomEn: "Pitch source", type: "choix",
        options: ["Courbe de hauteur", "Note fixe"], optionsEn: ["Pitch curve", "Fixed note"],
        optionIds: ["courbe", "fixe"], defaut: "Courbe de hauteur", defautEn: "Pitch curve",
        doc: "D'où vient la note de chaque zone. « Courbe de hauteur » la lit sur l'entrée « Hauteur », au long de la zone. « Note fixe » pose partout la même note.",
        docEn: "Where each zone's note comes from. « Pitch curve » reads it on the « Pitch » input, along the zone. « Fixed note » puts the same note everywhere." },
      { nom: "Note fixe", nomEn: "Fixed note", type: "nombre", plage: [0, 127], pas: 1, defaut: 60,
        doc: "La note posée quand la source est « Note fixe ». Elle sert aussi aux zones où la courbe ne donne aucune hauteur. Do central à 60, et 38 est la caisse claire du canal 9.",
        docEn: "The note put when the source is « Fixed note ». It also serves the zones where the curve gives no pitch. Middle C at 60, and 38 is the snare drum of channel 9." },
      { nom: "Note min", nomEn: "Lowest note", type: "nombre", plage: [0, 127], pas: 1, defaut: 33,
        doc: "La note que vaut le zéro de la courbe reçue. Sans effet quand la source est « Note fixe ».",
        docEn: "The note the received curve's zero is worth. Without effect when the source is « Fixed note »." },
      { nom: "Note max", nomEn: "Highest note", type: "nombre", plage: [0, 127], pas: 1, defaut: 93,
        doc: "La note que vaut le un de la courbe reçue. L'échelle entre les deux bornes est en demi-tons. Sans effet quand la source est « Note fixe ».",
        docEn: "The note the received curve's one is worth. The scale between the two bounds is in semitones. Without effect when the source is « Fixed note »." },
      { ...PARAMETRE_CLE, nom: "Clé", nomEn: "Key",
        doc: "La tonique de la gamme. Sans effet en chromatique, qui contient toutes les notes.",
        docEn: "The scale's root. Without effect in chromatic, which contains every note." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_ACCORDS.map((g) => g.fr), optionsEn: GAMMES_ACCORDS.map((g) => g.en),
        optionIds: GAMMES_ACCORDS.map((g) => g.id), defaut: "Chromatique", defautEn: "Chromatic",
        optionsHeritees: LIBELLES_HERITES_GAMMES,
        doc: "Les degrés permis pour la hauteur lue sur la courbe. La note du réglage « Note fixe » n'y est pas soumise.",
        docEn: "The allowed degrees for the pitch read on the curve. The note of the « Fixed note » setting is not subject to them." },
      { nom: "Vélocité", nomEn: "Velocity", type: "choix",
        options: ["Par le niveau", "Fixe"], optionsEn: ["From level", "Fixed"],
        optionIds: ["sonie", "fixe"], defaut: "Par le niveau", defautEn: "From level",
        doc: "D'où vient la nuance. « Par le niveau » la prend sur le niveau que la zone porte, de 1 à moins soixante décibels jusqu'à 127 à pleine échelle. Une zone sans niveau prend le réglage « Vélocité fixe ».",
        docEn: "Where the dynamic comes from. « From level » takes it from the level the zone carries, from 1 at minus sixty decibels up to 127 at full scale. A zone without a level takes the « Fixed velocity » setting." },
      { nom: "Vélocité fixe", nomEn: "Fixed velocity", type: "nombre", plage: [1, 127], pas: 1, defaut: 100,
        doc: "La nuance posée quand « Vélocité » vaut « Fixe », et celle des zones qui ne portent pas de niveau.",
        docEn: "The dynamic put when « Velocity » is « Fixed », and the one of the zones that carry no level." },
      { nom: "Canal", nomEn: "Channel", type: "nombre", plage: [0, 15], pas: 1, defaut: 0,
        doc: "Le canal écrit dans le fichier. Le canal 9 est celui des percussions.",
        docEn: "The channel written into the file. Channel 9 is the percussion one." },
      { nom: "Tempo du fichier MIDI", nomEn: "MIDI tempo", type: "nombre", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Le tempo inscrit dans le fichier. Les notes gardent les instants des zones : le tempo ne les déplace pas, il décide de la façon dont une partition les écrit.",
        docEn: "The tempo written into the file. The notes keep the instants of the zones: the tempo does not move them, it decides how a score writes them." },
    ],
    async executer(ctx: any) {
      const zones = zonesRetenues(Array.isArray(ctx.entree(0)) ? ctx.entree(0) : []);
      if (zones.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.zonesMidi.aucuneZone") };
      }
      const courbe = ctx.entree(1);
      const tonique = demiTonDeCle(ctx.paramTexte("Clé", "C")) ?? 0;
      const { notes, sansHauteur, sansSonie } = notesDesZones(
        zones,
        estCourbe(courbe) ? courbe : null,
        {
          source: ctx.paramTexte("Source de hauteur", "courbe") === "fixe" ? "fixe" : "courbe",
          noteFixe: ctx.paramNombre("Note fixe", 60),
          noteMin: ctx.paramNombre("Note min", 33),
          noteMax: ctx.paramNombre("Note max", 93),
          degres: degresGammeAccords(ctx.paramTexte("Gamme", "chromatique"))
            .map((d: number) => (((d + tonique) % 12) + 12) % 12),
          velocite: ctx.paramTexte("Vélocité", "sonie") === "fixe" ? "fixe" : "sonie",
          velociteFixe: ctx.paramNombre("Vélocité fixe", 100),
          canal: ctx.paramNombre("Canal", 0),
        },
      );
      const canal = Math.max(0, Math.min(15, Math.round(ctx.paramNombre("Canal", 0))));
      const fichier = notesVersFichierMidi(notes, ctx.paramNombre("Tempo du fichier MIDI", 120), canal);
      return {
        valeurs: [fichier, tableauDesZones(zones, notes, langueCourante() === "en")],
        message: traduire("msg.zonesMidi.notes",
          String(notes.length), String(zones.length), String(sansHauteur), String(sansSonie)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
