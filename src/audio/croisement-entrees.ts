// audio/croisement-entrees.ts — Les entrées propres à certaines fiches dans la passe de croisement.
//
// POURQUOI CE MODULE EXISTE. Les valeurs d'essai communes (`valeurs-essai.ts`) font tourner chaque
// nœud ; elles ne font pas agir chaque réglage. Une inertie mesurée sur une entrée qui ne peut pas la
// faire voir n'en est pas une : le son d'essai n'a qu'une hauteur et n'est pas écrêté, le MIDI d'essai
// pose ses attaques sur les temps et n'a qu'un canal, la séquence d'essai porte son tempo. Le lot 3d-2
// (décision de Fabien du 2026-11-14 : « une entrée propre par nœud si c'est simple ») donne à ces nœuds
// une entrée qui donne prise, chacune avec sa raison. Sorti de `croisement-reglages.ts` à la taille.

import { writeMidi } from "midi-file";
import { poserDepart } from "./depart-bwf";
import { sonDEssai } from "./lancer-fiche";
import { notesVersFichierMidi } from "./midi-ecriture";
import { comparerEvenementsMidi } from "./midi-ordre";
import { etiqueter } from "./multicanal";
import { modeleDEssai, sequenceDEssai } from "./valeurs-essai";
import { lireTableDcml } from "./dcml-tsv";
import { TABLE_175 } from "./choral-175-dcml";
import { MODES_CHORAL } from "./choral-regles";
import { TONIQUE_REFERENCE } from "./champ-corpus";

/** Quatre accords d'une seconde : do, fa majeur septième, sol septième, la mineur. */
const ACCORDS_D_ESSAI = [[60, 64, 67], [65, 69, 72, 76], [67, 71, 74, 77], [57, 60, 64]];

/** Les accords d'essai, une note par événement, chaque accord partant à `debutDe(k)`. */
export const notesDesAccords = (debutDe = (k: number) => k, transposition = 0) =>
  ACCORDS_D_ESSAI.flatMap((a, k) => a.map((note) => ({ note: note + transposition, velocite: 96, debut: debutDe(k), fin: debutDe(k) + 0.95, canal: 0 })));

/** Les deux notes seules qui suivent les accords dans le MIDI d'essai. */
export const DEUX_NOTES = [{ note: 72, velocite: 90, debut: 4, fin: 4.45, canal: 0 }, { note: 74, velocite: 90, debut: 4.5, fin: 4.95, canal: 0 }];

/**
 * Le son d'un port audio après le premier, autre que le son d'essai en chacun de ses traits : plus
 * faible, mono et non large, sur 330 et 1 320 Hz et non 220, avec une frappe par demi-seconde qui
 * lui donne une autre crête.
 */
export function sonSecond(): AudioBuffer {
  const ref = sonDEssai();
  const sr = ref.sampleRate;
  const b = new AudioBuffer({ numberOfChannels: 2, length: ref.length, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = 0.1 * Math.sin(2 * Math.PI * 330 * t) + 0.03 * Math.sin(2 * Math.PI * 1320 * t)
        + 0.25 * Math.exp(-(t % 0.5) / 0.004) * Math.sin(2 * Math.PI * 2000 * t);
    }
  }
  return b;
}

/** Un son stéréo de `secondes`, échantillon par échantillon. */
export function sonDe(secondes: number, f: (t: number) => number, sr = 48000): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: Math.round(secondes * sr), sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = f(i / sr);
  }
  return b;
}

/** Un champ ambisonique d'ordre un, déclaré comme tel : quatre canaux du son d'essai, pondérés. */
function champAmbisonique(): AudioBuffer {
  const son = sonDEssai(1);
  const b = new AudioBuffer({ numberOfChannels: 4, length: son.length, sampleRate: son.sampleRate });
  const source = son.getChannelData(0);
  [1, 0.5, 0.25, 0.7].forEach((gain, c) => b.getChannelData(c).set(source.map((x) => x * gain)));
  return etiqueter(b, "foa");
}

/** Le son d'essai d'une seconde, écrêté à `plafond` : des plateaux que la restauration ait à refaire. */
function sonEcrete(plafond: number): AudioBuffer {
  const son = sonDEssai(1);
  for (let c = 0; c < son.numberOfChannels; c++) {
    const d = son.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(-plafond, Math.min(plafond, d[i]));
  }
  return son;
}

/** Un MIDI dont chaque note garde son canal, à 120 à la noire : `notesVersFichierMidi` n'en écrit qu'un. */
export function midiParCanal(notes: readonly { note: number; velocite: number; debut: number; fin: number; canal: number }[]): File {
  const tick = (s: number) => Math.round(s * 2 * 480);
  const lignes: { tick: number; type: string; [k: string]: unknown }[] = [{ tick: 0, type: "setTempo", microsecondsPerBeat: 500_000 }];
  for (const n of notes) {
    lignes.push({ tick: tick(n.debut), type: "noteOn", channel: n.canal, noteNumber: n.note, velocity: n.velocite });
    lignes.push({ tick: tick(n.fin), type: "noteOff", channel: n.canal, noteNumber: n.note, velocity: 0 });
  }
  lignes.sort(comparerEvenementsMidi);
  let avant = 0;
  const events = lignes.map(({ tick: t, ...reste }) => { const e = { deltaTime: t - avant, ...reste }; avant = t; return e; });
  events.push({ deltaTime: 0, type: "endOfTrack" });
  const bytes = new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: 480 }, tracks: [events] } as never));
  return new File([bytes], "essai.mid", { type: "audio/midi" });
}

/** Les seize pistes du montage, chacune avec une heure d'enregistrement (BWF), à 10 h et après. */
function pistesDatees(): Record<string, { valeur: () => unknown; raison: string }> {
  const raison = "les sons communs n'ont pas d'heure d'enregistrement, et caler sur elle n'avait rien à caler ; chaque piste reçoit le son qu'elle avait, daté, pour que les seize pistes restent nourries";
  return Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`Piste ${k + 1}`, {
    valeur: () => poserDepart(k === 0 ? sonDEssai() : sonSecond(), 36000 + 0.25 * k), raison,
  }]));
}

/**
 * Les ports d'une fiche que l'entrée commune ne sait pas nourrir, ou ne nourrit pas de quoi faire
 * agir ses réglages, avec la raison.
 *
 * UNE ENTRÉE QUE LE NŒUD REFUSE NE MESURE RIEN : la première passe a vu chaque lancer de ces fiches
 * rendu en erreur, et leurs réglages n'ont donc pas été éprouvés du tout.
 */
export const ENTREES_PROPRES: Record<string, Record<string, { valeur: () => unknown; raison: string }>> = {
  musicxml: {
    Arbre: { valeur: () => undefined, raison: "un arbre rythmique s'écrit dans sa syntaxe ; une phrase quelconque n'en est pas un, et le nœud la refusait" },
  },
  "decodeur-ambisonique": {
    Champ: { valeur: champAmbisonique, raison: "le décodeur refuse un son qui n'est pas étiqueté comme un champ ambisonique" },
  },
  // Ce que rend « Analyse harmonique », sauf la tonalité, saisie sans mode : un mode nommé l'emporte
  // sur la « Gamme », que la passe doit pouvoir voir agir.
  "accords-vers-notation": {
    Tonalité: { valeur: () => "A", raison: "une tonique seule, sans quoi la Gamme ne servirait pas" },
    // SANS VII : la gamme par tons et l'augmentée n'ont que six degrés, et le nœud refuse le chiffre
    // d'un degré que la gamme n'a pas (2026-11-23).
    Progression: { valeur: () => "i VI III iv", raison: "le port lit des chiffres romains, et refuse une phrase ; des degrés que les dix-sept gammes offertes ont toutes" },
    "Accords détectés": {
      valeur: () => ["0:00 Am (2 s)", "0:02 F (2 s)", "0:04 C (1 s)", "0:05 G (3 s)", "0:08 Dm"].join(String.fromCharCode(10)),
      raison: "une phrase quelconque n'a aucun accord exploitable ; le dernier accord n'a pas de durée, et c'est la « Durée par accord » qui la lui donne",
    },
  },
  "melodie-sur-accords": {
    Accords: { valeur: () => ({ notes: notesDesAccords(), tempo: 120 }), raison: "la séquence commune n'a que des notes seules, où aucun accord ne se reconnaît" },
  },
  // Les voicings lisent la séquence avant le MIDI : les accords d'essai viennent donc du MIDI.
  "voicings-accords": {
    Séquence: { valeur: () => undefined, raison: "la séquence passe devant le MIDI, et la commune n'a que des notes seules, qui ne se renversent pas" },
    MIDI: {
      valeur: () => notesVersFichierMidi([...notesDesAccords(undefined, -12), ...DEUX_NOTES], 120, 0),
      raison: "les accords d'essai une octave plus bas, le plus grave en tête : à leur hauteur commune, aucune disposition retenue ne descendait sous le grave minimum, qui n'avait rien à remonter",
    },
  },
  "motif-eclaircir": {
    MIDI: {
      valeur: () => notesVersFichierMidi(Array.from({ length: 16 }, (_, k) => ({ note: 60 + (k % 8), velocite: 90, debut: k * 0.25, fin: k * 0.25 + 0.2, canal: 0 })), 120, 0),
      raison: "le MIDI commun pose chaque attaque sur un temps, qu'éclaircir garde sans tirer : seize doubles croches en mettent la moitié à contretemps",
    },
  },
  "quantifier-rythme": {
    Séquence: {
      valeur: () => ({ notes: [...Array.from({ length: 8 }, (_, k) => ({ note: 60 + k, velocite: 100, debut: k * 0.0625, fin: k * 0.0625 + 0.05, canal: 0 })), ...sequenceDEssai().notes.slice(1)] }),
      raison: "la séquence commune porte son tempo, qui passe devant le réglage, et n'a qu'une attaque par temps : sans tempo, et huit attaques dans le premier temps, la profondeur a des divisions à faire",
    },
  },
  "partition-csound": {
    MIDI: {
      valeur: () => midiParCanal([...notesDesAccords(), ...DEUX_NOTES.map((n) => ({ ...n, canal: 1 }))]),
      raison: "le MIDI commun n'a qu'un canal, où un instrument par canal n'a qu'un instrument à donner : les deux notes seules passent sur un second",
    },
  },
  montage: pistesDatees(),
  "correction-hauteur": {
    Audio: {
      valeur: () => sonDe(3, (t) => 0.3 * Math.sin(2 * Math.PI * 440 * Math.pow(2, (60 + Math.min(11, Math.floor(t / 0.25)) - 69 + 0.3) / 12) * t)),
      raison: "le son commun n'a qu'une hauteur, un la, que plusieurs gammes gardent ou ramènent au même endroit : les douze demi-tons de do à si, trente cents trop haut, séparent deux gammes dès qu'une note est dans l'une et non dans l'autre",
    },
  },
  "transposeur-quantiseur-midi": {
    MIDI: {
      valeur: () => notesVersFichierMidi([...notesDesAccords((k) => k * 1.07), { ...DEUX_NOTES[0], debut: 4.28, fin: 4.73 }, { ...DEUX_NOTES[1], debut: 4.85, fin: 5.3 }], 120, 0),
      raison: "le MIDI commun pose ses attaques sur des noires, que toute grille divisant la noire laisse en place : chaque attaque est ici à côté de la grille, d'un écart qui grandit",
    },
  },
  "restauration-ecretage": {
    Audio: { valeur: () => sonEcrete(0.25), raison: "le son commun n'est pas écrêté : sans plateau, la restauration le rendait tel quel, et ses réglages n'avaient rien à refaire" },
  },
  "rendu-sequence": {
    Séquence: { valeur: () => ({ notes: sequenceDEssai().notes }), raison: "la séquence commune porte son tempo, qui l'emporte sur le réglage dans le MIDI rendu" },
  },
  "evolution-melodie": {
    Courbe: {
      valeur: () => ({ valeurs: Float32Array.from({ length: 16 }, (_, k) => k / 15), cadence: 4 }),
      raison: "sans courbe, sans séquence et l'ampleur à zéro, aucun objectif ne pèse : le nœud rendait son premier tirage, et la recherche n'avait pas lieu",
    },
  },
  "zones-vers-midi": {
    Zones: {
      valeur: () => [...Array.from({ length: 12 }, (_, k) => ({ debut: k * 0.25, duree: 0.2, sonie: -6 - 4 * k })), { debut: 3, duree: 0.2 }],
      raison: "des zones qui portent leur niveau, et une qui n'en porte pas : les zones communes n'en avaient aucun, et la vélocité par le niveau n'avait rien à lire",
    },
    Hauteur: {
      valeur: () => ({ cadence: 200, valeurs: Float32Array.from({ length: 650 }, (_, i) => (i < 600 ? (27 + Math.floor(i / 50)) / 60 : 0)) }),
      raison: "une courbe qui monte d'un demi-ton par zone, de 60 à 71, et se tait sur la dernière : sans courbe, la hauteur venait partout de la note fixe",
    },
  },
  "midi-vers-abc": {
    MIDI: {
      valeur: () => notesVersFichierMidi([...notesDesAccords(), { ...DEUX_NOTES[0], fin: 4.85 }, { ...DEUX_NOTES[1], debut: 4.375 }], 120, 0),
      raison: "une note qui sonne encore à l'attaque de la suivante, d'assez loin pour que la grille de croches ne l'efface pas, et une attaque sur une double croche à contretemps : le MIDI commun n'a ni l'un ni l'autre",
    },
  },
  "sms-sinusoides-bruit": {
    Audio: {
      valeur: () => sonDe(1, (t) => Array.from({ length: 15 }, (_, h) => Math.pow(10, -4 * h / 20) * Math.sin(2 * Math.PI * 1500 * (h + 1) * t)).reduce((s, x) => s + x, 0) * 0.15),
      raison: "le son commun n'a que deux ou trois pics par trame : quinze harmoniques de 1 500 Hz, espacés de 4 dB, donnent au plafond de partiels et au seuil de quoi écarter, et restent saillants jusqu'à la fenêtre de 256 points, où ceux de 440 Hz se confondaient et où ceux de 1 000 Hz n'étaient pas dix",
    },
  },
  "harmoniser-choral": {
    Séquence: {
      valeur: () => ({ ...lireTableDcml(TABLE_175, 60).sequence, notes: lireTableDcml(TABLE_175, 60).sequence.notes.filter((n) => n.voix === 0) }),
      raison: "la séquence commune est une gamme de do, sous laquelle loin de do chaque note prend le même repli et les septièmes comme les renversements se confondent : le soprano du choral 175 de Bach a des notes répétées, des cadences et des degrés que chaque réglage départage",
    },
    Modèle: {
      valeur: () => modeleDEssai(),
      raison: "sans modèle, « Part des règles » et « Faisceau » sont sans effet, et leur documentation le dit : un modèle appris sur le corpus d'essai les fait agir",
    },
  },
  "apprendre-corpus": {
    Corpus: {
      valeur: () => ({
        pieces: MODES_CHORAL.flatMap((mode) => Array.from({ length: 6 }, (_, t) => t).map((t) => {
          const s = lireTableDcml(TABLE_175, 60).sequence;
          // LA TONALITÉ RESTE DÉCLARÉE SUR LA TONIQUE DE RÉFÉRENCE DU MODE : ramenées à leur vraie
          // tonique, les six pièces redeviendraient le même choral, et la graine qui choisit la pièce
          // mise de côté ne changerait rien.
          return { sequence: { ...s, notes: s.notes.map((n) => ({ ...n, note: n.note + t })) }, source: `175 + ${t}, ${mode}`, tonalite: { tonique: TONIQUE_REFERENCE[mode], mode, origine: "notes" as const } };
        })),
      }),
      raison: "le corpus d'essai n'a qu'une pièce majeure et une mineure, et une validation n'y met rien de côté : le choral 175 de Bach monté de zéro à cinq demi-tons, sa tonalité déclarée sur la tonique de référence de chacun des cinq modes, donne six pièces distinctes par mode, assez pour que la part et la graine agissent sous chaque « Gamme »",
    },
  },
  "verifier-choral": {
    Séquence: {
      valeur: () => lireTableDcml(TABLE_175, 60).sequence,
      raison: "la séquence commune n'a qu'une voix, et le nœud refuse un choral auquel il en manque trois : le choral 175 de Bach a les quatre, et des avis dont la place, la tonalité et le mode changent le rapport",
    },
    Modèle: {
      valeur: () => modeleDEssai(),
      raison: "sans modèle, « Arêtes rapportées » est sans effet, et sa documentation le dit : un modèle appris sur le corpus d'essai lui donne des passages à nommer",
    },
  },
};
