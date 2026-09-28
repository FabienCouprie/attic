// audio/midi-sequence.ts — Le rendu d'une sequence de notes.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import type { CaractereTimbreId } from "./timbres";
import { sf2Chargee } from "../plugins/soundfontGlobal";
import { traduire } from "../i18n";
import type { Note } from "./note";
import { melangerTampons, RESERVE_BATTERIE, separerPercussions, tamponSilencieux } from "./sequence-percussion";
import { rendreAvecSF2 } from "./midi-soundfont";

export type NoteEvenement = Note;


/**
 * Trois caractères de la synthèse FM, et le réglage d'origine. « Brillante » est ce réglage même
 * (rapport 2, indice 3) ; « Douce » ramène l'indice près d'un sinus et adoucit l'attaque ;
 * « Percutante » monte l'indice et laisse la note retomber vite, comme une lame frappée.
 */
/**
 * Les timbres de la synthèse locale. `idxMod` est l'indice de modulation de fréquence.
 *
 * `pur` EST UNE SINUSOÏDE, ET IL A ÉTÉ AJOUTÉ POUR UNE RAISON MESURÉE. Les autres caractères
 * modulent : à l'indice trois du timbre d'origine, chaque note engendre une huitaine de bandes
 * latérales, et ce qu'on entend n'est plus la note mais son cortège. Pour une mélodie c'est un
 * timbre ; pour un AGRÉGAT CALCULÉ, c'est une falsification. Sur une série harmonique de douze
 * partiels à 110 Hz, dont les plus forts sont les plus graves, le timbre d'origine laisse **1,2 %
 * de l'énergie sous 500 Hz et en porte 98,8 % entre 500 Hz et 4 kHz** : le spectre entendu n'est
 * pas celui qui a été calculé. À indice nul, la note est la sinusoïde qu'on lui a demandée.
 */
const CARACTERES_FM: Record<CaractereTimbreId | "origine" | "pur", { ratio: number; idxMod: number; a: number; d: number; sVal: number; r: number }> = {
  origine: { ratio: 2, idxMod: 3, a: 0.005, d: 0.08, sVal: 0.7, r: 0.04 },
  pur: { ratio: 1, idxMod: 0, a: 0.02, d: 0.05, sVal: 1, r: 0.15 },
  brillante: { ratio: 2, idxMod: 3, a: 0.005, d: 0.08, sVal: 0.7, r: 0.04 },
  douce: { ratio: 1, idxMod: 0.7, a: 0.02, d: 0.15, sVal: 0.6, r: 0.1 },
  percutante: { ratio: 2, idxMod: 5, a: 0.001, d: 0.06, sVal: 0.15, r: 0.03 },
};

/** Le même son, dans un tampon plus long : le silence qui suit fait partie de la pièce. */
function allongerA(buffer: AudioBuffer, duree: number): AudioBuffer {
  const longueur = Math.ceil(duree * buffer.sampleRate);
  if (longueur <= buffer.length) return buffer;
  const sortie = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels, length: longueur, sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) sortie.copyToChannel(buffer.getChannelData(c), c, 0);
  return sortie;
}

/**
 * Une séquence rendue en son : les hauteurs par la synthèse choisie, la batterie par la sienne.
 *
 * LE CANAL DE BATTERIE EST HONORÉ, et il ne l'était pas. Toute note partait en hauteur, canal
 * compris : une grosse caisse écrite en 36 sur le canal dix s'entendait en sinusoïde de trente-trois
 * hertz, alors que le fichier MIDI rendu à côté sonnait juste dans un séquenceur. Les frappes vont
 * désormais au synthétiseur de percussions que partagent les autres rythmes du dépôt, ce qui fait
 * qu'une caisse claire y sonne comme une caisse claire ailleurs.
 *
 * UNE SÉQUENCE SANS CANAL NE CHANGE PAS D'UN ÉCHANTILLON : le canal absent vaut zéro, le partage
 * rend alors toutes les notes du côté des hauteurs, et le chemin est celui d'avant, mot pour mot.
 */
export async function rendreSequence(
  notes: NoteEvenement[],
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument?: number,
  banque?: number,
  caractere?: CaractereTimbreId | "pur",
  dureeMin?: number,
): Promise<AudioBuffer> {
  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, Math.ceil(0.5 * 44100), 44100);
    return ctx.startRendering();
  }

  // UNE PIÈCE NE FINIT PAS FORCÉMENT SUR UNE NOTE. La longueur se prenait sur la dernière ; un
  // rythme qui se termine par un silence perdait donc ce silence, mesuré à 1,5 seconde rendue pour
  // une mesure de 2. L'appelant qui connaît la durée voulue la dit, et elle l'emporte.
  // ELLE SE PREND SUR TOUTES LES NOTES, batterie comprise, avant tout partage : les deux moitiés
  // doivent tomber dans le même tampon, et une séquence n'a qu'une durée.
  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), dureeMin ?? 0, 0.5);

  const { frappes, hauteurs } = separerPercussions(notes);
  if (frappes.length > 0) {
    const { rendreBatterieMidi } = await import("./tone-synths");
    // LA MÊME RÉSERVE QUE LA SYNTHÈSE DES HAUTEURS, et le niveau est un gain : multiplier le volume
    // revient exactement à multiplier le rendu. Voir `RESERVE_BATTERIE` pour la mesure qui l'exige.
    const batterie = await rendreBatterieMidi({ notes: frappes, volume: volume * RESERVE_BATTERIE });
    const melodie = hauteurs.length > 0
      ? await rendreHauteurs(hauteurs, mode, volume, instrument, banque, caractere, duree)
      : tamponSilencieux(duree, batterie.sampleRate);
    return melangerTampons(melodie, batterie, duree);
  }

  return rendreHauteurs(notes, mode, volume, instrument, banque, caractere, duree);
}

/** La synthèse des hauteurs seules, telle qu'elle a toujours été, la durée étant déjà décidée. */
async function rendreHauteurs(
  notes: NoteEvenement[],
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument: number | undefined,
  banque: number | undefined,
  caractere: CaractereTimbreId | "pur" | undefined,
  duree: number,
): Promise<AudioBuffer> {
  const vol = Math.max(0, Math.min(1, volume / 100));

  if (mode === "SoundFont") {
    const sf2Global = sf2Chargee();
    if (!sf2Global) {
      throw new Error(traduire("msg.sf2.non.charge"));
    }
    const prog = instrument !== undefined && instrument >= 0 ? instrument : 0;
    const bq = banque !== undefined && banque >= 0 ? banque : 0;
    const preset = sf2Global.presets.find(p => p.programme === prog && p.banque === bq) ?? sf2Global.presets[0];
    const nomInst = preset ? sf2Global.instruments[preset.zones[0]?.instrumentIdx ?? 0]?.nom ?? "?" : "?";
    console.log(`[attic] rendreSequence utilise SF2 global : ${sf2Global.nom}, programme ${prog}, preset "${preset?.nom ?? "?"}" -> instrument "${nomInst}" (${notes.length} notes)`);
    // La voie SoundFont calcule sa propre longueur sur les notes : on la rallonge si la durée
    // voulue va plus loin, plutôt que de reprendre ce calcul à deux endroits.
    return allongerA(rendreAvecSF2(sf2Global, notes, volume, prog, banque ?? 0), duree);
  }

  // FM mode avec suréchantillonnage 2× pour anti-aliasing
  const srInterne = 88200;
  const length = Math.ceil(duree * srInterne);
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: srInterne });
  const gauche = buffer.getChannelData(0);
  const droite = buffer.getChannelData(1);

  for (const n of notes) {
    const dureeNote = n.fin - n.debut;
    if (dureeNote <= 0.001) continue;
    const freq = 440 * 2 ** ((n.note - 69) / 12);
    const gain = (n.velocite / 127) * vol * 0.4;
    // Le caractère du timbre, s'il est demandé ; sans lui, le réglage d'origine, inchangé.
    const { ratio, idxMod, a, d, sVal, r } = CARACTERES_FM[caractere ?? "origine"];
    const debutEch = Math.floor(n.debut * srInterne);
    const finEch = Math.min(debutEch + Math.ceil(dureeNote * srInterne), length);

    for (let i = debutEch; i < finEch; i++) {
      const t = (i - debutEch) / srInterne;
      const mod = idxMod * Math.sin(2 * Math.PI * freq * ratio * t);
      const echantillon = Math.sin(2 * Math.PI * freq * t + mod);
      let env: number;
      if (t < a) env = t / a;
      else if (t < a + d) env = 1 - (1 - sVal) * ((t - a) / d);
      else if (t < dureeNote - r) env = sVal;
      else env = sVal * (1 - (t - (dureeNote - r)) / r);
      const val = echantillon * gain * env;
      gauche[i] += val;
      droite[i] += val;
    }
  }

  // Downsamping : 88200 → 44100 par moyenne de 2 échantillons consécutifs
  const srFinal = 44100;
  const lengthFinal = Math.ceil(duree * srFinal);
  const bufferFinal = new AudioBuffer({ numberOfChannels: 2, length: lengthFinal, sampleRate: srFinal });
  const gFinal = bufferFinal.getChannelData(0);
  const dFinal = bufferFinal.getChannelData(1);
  for (let i = 0; i < lengthFinal; i++) {
    const i1 = i * 2;
    const i2 = i1 + 1;
    gFinal[i] = (gauche[i1] + (i2 < length ? gauche[i2] : gauche[i1])) / 2;
    dFinal[i] = (droite[i1] + (i2 < length ? droite[i2] : droite[i1])) / 2;
  }

  return bufferFinal;
}

