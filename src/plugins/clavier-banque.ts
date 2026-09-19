// plugins/clavier-banque.ts — Étaler un son sur les 88 touches, et le jouer.
//
// La logique est dans `audio/clavier-banque.ts`, testée ; ce fichier n'est que la prise.

import { parseMidi } from "midi-file";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { analyserMidi } from "../audio/midi";
import { changerTonalite } from "../audio/effets-spectral";
import { separerStn } from "../audio/stn";
import { hauteurMediane, suivreHauteur } from "../audio/hauteur";
import {
  NOTE_DO8, NOTE_LA0, construireBanque, ecartDeZone, planZones, rendreNotes,
  type Banque, type NoteJouee,
} from "../audio/clavier-banque";

/** La note MIDI la plus proche d'une fréquence. */
const noteDepuisHertz = (hz: number): number =>
  Math.max(NOTE_LA0, Math.min(NOTE_DO8, Math.round(69 + 12 * Math.log2(Math.max(1, hz) / 440))));

/** Un AudioBuffer à partir de canaux, pour recoller les parties d'une décomposition STN. */
function depuisCanaux(canaux: Float32Array[], sampleRate: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux.length, length: canaux[0].length, sampleRate });
  for (let c = 0; c < canaux.length; c++) b.getChannelData(c).set(canaux[c]);
  return b;
}

export const fiches: FicheAudio[] = ([
  {
    id: "banque-clavier", nom: "Étaler sur le clavier", nomEn: "Spread Across Keyboard",
    univers: "Traitement", famille: "Effets",
    resume: "Fait d'un son une banque d'échantillons jouable sur les 88 touches, par zones.",
    resumeEn: "Turns one sound into a sample bank playable across the 88 keys, in zones.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Banque", nomEn: "Bank", type: "banque" },
      { nom: "Aperçu", nomEn: "Preview", type: "audio" },
    ],
    parametres: [
      { nom: "Note d'origine", nomEn: "Source note", type: "choix",
        options: ["Automatique", "Manuelle"], optionsEn: ["Automatic", "Manual"],
        optionIds: ["auto", "manuel"], defaut: "Automatique", defautEn: "Automatic",
        doc: "En automatique, la hauteur du son est MESURÉE par le suiveur de hauteur — inutile de la déclarer, et elle sera juste. C'est aussi elle qui ancre la grille des zones, de sorte qu'une zone au moins joue le son sans aucune transposition.",
        docEn: "In automatic mode the sound's pitch is MEASURED by the pitch follower — no need to declare it, and it will be right. It is also what anchors the zone grid, so that at least one zone plays the sound with no transposition at all." },
      { nom: "Note manuelle", nomEn: "Manual note", type: "curseur", plage: [21, 108], pas: 1, defaut: 60,
        doc: "Note MIDI correspondant à la hauteur du son (60 = do central). Ne sert qu'en mode manuel — utile pour un son non harmonique, dont la hauteur ne se mesure pas.",
        docEn: "MIDI note matching the sound's pitch (60 = middle C). Only used in manual mode — useful for an inharmonic sound, whose pitch cannot be measured." },
      { nom: "Largeur de zone", nomEn: "Zone width", type: "curseur", plage: [1, 6], pas: 1, defaut: 2,
        unite: " demi-tons", uniteEn: " semitones",
        doc: "De combien de demi-tons une zone est rééchantillonnée, au plus, de part et d'autre de sa racine. C'est LE réglage de qualité : la pratique des bibliothèques d'échantillons ne dépasse pas deux ou trois demi-tons — la « règle de la tierce mineure ». À ±2, il faut dix-huit ou dix-neuf zones pour 88 touches et la durée d'une note ne varie que de 12 % à l'intérieur d'une zone ; à ±6, une zone par octave, et l'on entend le découpage.",
        docEn: "By how many semitones a zone is resampled at most, either side of its root. This is THE quality setting: sample-library practice does not exceed two or three semitones — the « minor third rule ». At ±2, eighteen or nineteen zones cover the 88 keys and a note's duration varies by only 12 % within a zone; at ±6, one zone per octave, and the seams are audible." },
      { nom: "Transposition", nomEn: "Transposition", type: "choix",
        options: ["Durée constante", "Magnétophone", "Attaque préservée"],
        optionsEn: ["Constant duration", "Tape", "Attack preserved"],
        optionIds: ["duree", "bande", "attaque"], defaut: "Durée constante", defautEn: "Constant duration",
        doc: "Comment chaque zone est fabriquée. DURÉE CONSTANTE : vocodeur de phase — la hauteur change, la durée reste, ce qu'il faut pour des intervalles allant jusqu'à quatre octaves. MAGNÉTOPHONE : rééchantillonnage, comme une bande qu'on accélère — la durée suit la hauteur, ce qui est l'effet « écureuil » qu'on cherche justement à éviter, mais qui est parfois voulu. ATTAQUE PRÉSERVÉE : le son est d'abord séparé en sinus, transitoires et bruit, seuls les deux premiers sont transposés, et les TRANSITOIRES sont remis tels quels — l'attaque ne s'étale pas et ne se met pas à claquer.",
        docEn: "How each zone is built. CONSTANT DURATION: phase vocoder — pitch changes, duration stays, which is what intervals of up to four octaves require. TAPE: resampling, like speeding up a tape — duration follows pitch, the « chipmunk » effect one usually wants to avoid, though sometimes it is the point. ATTACK PRESERVED: the sound is first split into sines, transients and noise, only the first two are transposed, and the TRANSIENTS are put back untouched — the attack neither smears nor turns into a click." },
      { nom: "Note basse", nomEn: "Lowest key", type: "curseur", plage: [21, 108], pas: 1, defaut: 21,
        doc: "Première touche couverte. 21 = La0, la plus grave d'un piano de 88 touches.",
        docEn: "First key covered. 21 = A0, the lowest of an 88-key piano." },
      { nom: "Note haute", nomEn: "Highest key", type: "curseur", plage: [21, 108], pas: 1, defaut: 108,
        doc: "Dernière touche couverte. 108 = Do8, la plus aiguë.",
        docEn: "Last key covered. 108 = C8, the highest." },
      { nom: "Suivi de touche", nomEn: "Key tracking", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "De combien la note raccourcit vers l'aigu. À 100 %, la durée est divisée par deux à chaque octave montée, ce qui est l'ordre de grandeur d'un piano — une corde grave tient vingt secondes, une aiguë moins d'une. À 0 %, toutes les touches durent autant, ce qui sonne comme un échantillonneur et non comme un instrument.",
        docEn: "By how much a note shortens toward the treble. At 100 %, duration halves with every octave up, which is a piano's order of magnitude — a bass string rings for twenty seconds, a treble one for less than one. At 0 %, every key lasts as long, which sounds like a sampler rather than an instrument." },
      { nom: "Boucle de maintien", nomEn: "Sustain loop", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Pose dans chaque zone une boucle relue tant que la touche est tenue : sans elle, une note tenue s'arrête à la fin de l'échantillon. Le raccord est fondu, faute de quoi chaque tour laisserait un clic — l'onde ne revenant pas à la même phase.",
        docEn: "Places in each zone a loop replayed while the key is held: without it, a held note stops at the end of the sample. The join is crossfaded, failing which each turn would leave a click — the wave not returning to the same phase." },
      { nom: "Début de boucle", nomEn: "Loop start", type: "curseur", plage: [5, 90], pas: 1, defaut: 50, unite: "%",
        doc: "Où la boucle commence dans l'échantillon. Après l'attaque, donc : une boucle qui l'engloberait la répéterait à chaque tour.",
        docEn: "Where the loop starts within the sample. After the attack, then: a loop enclosing it would repeat it on every turn." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const auto = ctx.paramTexte("Note d'origine", "auto") !== "manuel";
      const sr = entree.sampleRate;
      let racine = Math.round(ctx.paramNombre("Note manuelle", 60));
      let mesuree = 0;
      if (auto) {
        const suivi = suivreHauteur(entree.getChannelData(0), sr, { cadence: 100 });
        mesuree = hauteurMediane(suivi);
        if (mesuree > 0) racine = noteDepuisHertz(mesuree);
      }
      const largeur = Math.round(ctx.paramNombre("Largeur de zone", 2));
      const noteBasse = Math.round(ctx.paramNombre("Note basse", NOTE_LA0));
      const noteHaute = Math.max(noteBasse + 1, Math.round(ctx.paramNombre("Note haute", NOTE_DO8)));
      const methode = ctx.paramTexte("Transposition", "duree");

      // Le transposeur, selon la méthode. « Attaque préservée » décompose UNE FOIS le son source et
      // ne transpose ensuite que les sinus et le bruit : les transitoires sont remis tels quels.
      let transposer: (a: AudioBuffer, d: number) => AudioBuffer;
      if (methode === "bande") {
        transposer = (a, d) => {
          const ratio = Math.pow(2, d / 12);
          const n = Math.max(1, Math.round(a.length / ratio));
          const out = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: n, sampleRate: a.sampleRate });
          for (let c = 0; c < a.numberOfChannels; c++) {
            const src = a.getChannelData(c), dst = out.getChannelData(c);
            for (let i = 0; i < n; i++) {
              const p = i * ratio, k = Math.floor(p), f = p - k;
              dst[i] = (src[k] ?? 0) * (1 - f) + (src[k + 1] ?? src[k] ?? 0) * f;
            }
          }
          return out;
        };
      } else if (methode === "attaque") {
        const parties = Array.from({ length: entree.numberOfChannels }, (_, c) =>
          separerStn(entree.getChannelData(c)));
        const tenu = depuisCanaux(parties.map((p) => Float32Array.from(p.sinus, (v, i) => v + p.bruit[i])), sr);
        transposer = (_a, d) => {
          if (d === 0) return entree;
          const decale = changerTonalite(tenu, d);
          const out = new AudioBuffer({ numberOfChannels: entree.numberOfChannels, length: entree.length, sampleRate: sr });
          for (let c = 0; c < entree.numberOfChannels; c++) {
            const dst = out.getChannelData(c);
            const src = decale.getChannelData(Math.min(c, decale.numberOfChannels - 1));
            const tr = parties[c].transitoires;
            for (let i = 0; i < dst.length; i++) dst[i] = (src[i] ?? 0) + tr[i];
          }
          return out;
        };
      } else {
        transposer = (a, d) => (d === 0 ? a : changerTonalite(a, d));
      }

      const banque: Banque = construireBanque(entree, {
        racineSource: racine, noteBasse, noteHaute, largeur, transposer,
        suiviTouche: ctx.paramNombre("Suivi de touche", 50) / 100,
        boucle: ctx.paramTexte("Boucle de maintien", "oui") !== "non",
        boucleDebut: ctx.paramNombre("Début de boucle", 50) / 100,
      });

      // L'aperçu : la racine de chaque zone, l'une après l'autre. De quoi ENTENDRE la banque sans
      // brancher un clavier, et voir si une zone sonne autrement que ses voisines.
      const apercu = rendreNotes(
        banque.zones.map((z, i) => ({ note: z.racine, velocite: 100, debut: i * 0.3, fin: i * 0.3 + 0.28 })),
        banque, { volume: 0.8, relachement: 0.02 },
      );
      return {
        valeurs: [banque, apercu],
        message: traduire("msg.banque.faite",
          String(banque.zones.length), String(largeur), String(racine),
          mesuree > 0 ? mesuree.toFixed(1) : "—"),
      };
    },
  },
  {
    id: "sampler-multizones", nom: "Sampler multi-zones", nomEn: "Multi-Zone Sampler",
    univers: "Traitement", famille: "Effets",
    resume: "Joue un MIDI avec une banque de clavier : chaque note prend la zone la plus proche.",
    resumeEn: "Plays MIDI with a keyboard bank: each note takes its nearest zone.",
    entrees: [
      { nom: "MIDI", type: "midi" },
      { nom: "Banque", nomEn: "Bank", type: "banque" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de sortie. La vélocité de chaque note le module.",
        docEn: "Output level. Each note's velocity scales it." },
      { nom: "Relâchement", nomEn: "Release", type: "curseur", plage: [1, 2000], pas: 1, defaut: 50, unite: "ms",
        doc: "Temps d'extinction après le relâchement de la touche. Court, les notes se coupent net ; long, elles se superposent.",
        docEn: "Fade-out time after the key is released. Short, notes cut off; long, they overlap." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "curseur", plage: [1, 200], pas: 1, defaut: 20, unite: "ms",
        doc: "Durée du fondu au raccord de la boucle de maintien. Trop court, on entend un clic à chaque tour ; trop long, la boucle se met à respirer.",
        docEn: "Length of the crossfade at the sustain loop's join. Too short, a click is heard on every turn; too long, the loop starts to breathe." },
    ],
    async executer(ctx: any) {
      const midiFile = ctx.entree(0);
      const banque = ctx.entree(1) as Banque | null;
      if (!(midiFile instanceof File)) return { valeurs: [null, null], message: traduire("msg.branchez_un_source_midi") };
      if (!banque || !Array.isArray(banque.zones) || banque.zones.length === 0) {
        return { valeurs: [null, midiFile], message: traduire("msg.banque.absente") };
      }
      const bytes = new Uint8Array(await midiFile.arrayBuffer());
      const { notes } = analyserMidi(parseMidi(bytes));
      if (!notes.length) return { valeurs: [null, midiFile], message: traduire("msg.aucune_note_dans_le_midi") };

      const jouees: NoteJouee[] = notes.map((n: any) => ({
        note: n.note, velocite: n.velocite ?? n.velociete ?? 100, debut: n.debut, fin: n.fin,
      }));
      const audio = rendreNotes(jouees, banque, {
        volume: ctx.paramNombre("Volume", 80) / 100,
        relachement: ctx.paramNombre("Relâchement", 50) / 1000,
        fonduBoucle: ctx.paramNombre("Fondu de boucle", 20) / 1000,
      });
      // L'écart maximal dit si la banque couvre bien ce qu'on lui demande de jouer : une note hors
      // du clavier de la banque serait jouée par la zone la plus proche, donc transposée davantage.
      let ecartMax = 0;
      for (const n of jouees) ecartMax = Math.max(ecartMax, Math.abs(ecartDeZone(banque, n.note)));
      return {
        valeurs: [audio, midiFile],
        message: traduire("msg.banque.jouee", String(notes.length), String(banque.zones.length), String(ecartMax)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

// Réexport pour le nœud d'export SFZ, qui vient ensuite.
export { planZones };
