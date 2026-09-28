// audio/midi-montage.ts — Joindre, boucler, filtrer, rendre.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { parseMidi, writeMidi } from "midi-file";
import { sf2Chargee } from "../plugins/soundfontGlobal";
import { traduire } from "../i18n";
import { analyserMidi } from "./midi";
import { normaliserBuffer, rendreAvecSF2 } from "./midi-soundfont";
import { bpmInitial, evenementsAbsolus } from "./midi-ecriture";

export async function joindreMidi(
  fichier1: File,
  fichier2: File,
  chevauchementSec: number,
): Promise<File> {
  const tpmSortie = 480;
  const midi1 = parseMidi(new Uint8Array(await fichier1.arrayBuffer()));
  const midi2 = parseMidi(new Uint8Array(await fichier2.arrayBuffer()));

  const evts1 = evenementsAbsolus(midi1, tpmSortie, false);
  const evts2 = evenementsAbsolus(midi2, tpmSortie, true);

  const maxTick1 = evts1.reduce((m, e) => Math.max(m, e.tick), 0);
  const bpm1 = bpmInitial(midi1);
  const chevTicks = Math.max(
    0,
    Math.min(maxTick1, Math.round(chevauchementSec * ((tpmSortie * bpm1) / 60))),
  );
  const decalage2 = maxTick1 - chevTicks;
  for (const e of evts2) e.tick += decalage2;

  const evts = [...evts1, ...evts2];
  evts.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.evt.type === "noteOff" && b.evt.type !== "noteOff") return -1;
    if (a.evt.type !== "noteOff" && b.evt.type === "noteOff") return 1;
    return 0;
  });

  let tickCourant = 0;
  const outEvts: any[] = [];
  for (const { tick, evt } of evts) {
    const deltaTime = Math.max(0, tick - tickCourant);
    outEvts.push({ ...evt, deltaTime });
    tickCourant = tick;
  }
  outEvts.push({ deltaTime: 0, type: "endOfTrack" });

  const midi = {
    header: { format: 1 as const, numTracks: 1, ticksPerBeat: tpmSortie },
    tracks: [outEvts],
  };
  const bytes = new Uint8Array(writeMidi(midi as any));
  return new File([bytes], "jointure.mid", { type: "audio/midi" });
}

/** Répète un fichier MIDI un nombre de fois donné. Le fondu (en ms) est
 * interprété comme un chevauchement entre deux répétitions (0 = simple
 * concaténation). */
export async function bouclerMidi(
  fichier: File,
  repetitions: number,
  fonduMs: number,
): Promise<File> {
  const reps = Math.max(1, Math.round(repetitions));
  if (reps === 1) return fichier;
  const chevSec = Math.max(0, fonduMs) / 1000;
  let resultat = fichier;
  for (let i = 1; i < reps; i++) {
    resultat = await joindreMidi(resultat, fichier, chevSec);
  }
  return resultat;
}

/** Filtre un fichier MIDI pour ne conserver que les canaux demandés.
 * Garde les méta-événements (tempo, signature) et les événements de canal
 * sélectionnés (note, programme, contrôleurs). */
export function filtrerCanauxMidi(bytes: Uint8Array, canaux: number[]): Uint8Array {
  const midi = parseMidi(bytes);
  const canauxSet = new Set(canaux);
  const tracks = midi.tracks.map((piste) =>
    piste.filter((evt) => {
      if (evt.type === "noteOn" || evt.type === "noteOff" || evt.type === "programChange" || evt.type === "controller") {
        return canauxSet.has(evt.channel);
      }
      return true;
    })
  );
  return new Uint8Array(writeMidi({ header: midi.header, tracks } as any));
}

export async function rendreMidi(
  fichier: File,
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument?: number,
  banque?: number,
): Promise<AudioBuffer> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  return rendreMidiDepuisBytes(bytes, mode, volume, instrument, banque);
}


export async function rendreMidiDepuisBytes(
  bytes: Uint8Array,
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument?: number,
  banque?: number,
): Promise<AudioBuffer> {
  const midi = parseMidi(bytes);
  const { notes, dureeTotale, canauxInstrument } = analyserMidi(midi);

  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, Math.ceil(0.5 * 44100), 44100);
    return ctx.startRendering();
  }

  const sr = 44100;
  const duree = Math.max(dureeTotale, 0.5);
  const vol = Math.max(0, Math.min(1, volume / 100));

  if (mode === "SoundFont") {
    const sf2Global = sf2Chargee();
    if (!sf2Global) {
      throw new Error(traduire("msg.sf2.non.charge"));
    }
    console.log(`[attic] rendreMidiDepuisBytes utilise SF2 global : ${sf2Global.nom} (${sf2Global.presets.length} presets, ${sf2Global.instruments.length} instruments, ${sf2Global.echantillons.length} échantillons)`);
    const sr = 44100;
    const duree = Math.max(dureeTotale, 0.5);
    const master = new AudioBuffer({ numberOfChannels: 2, length: Math.ceil(duree * sr), sampleRate: sr });
      const canaux = [...new Set(notes.map((n) => n.canal))].sort((a, b) => a - b);
      for (const canal of canaux) {
        const nc = notes.filter((n) => n.canal === canal);
        if (!nc.length) continue;
        const instCanal = canauxInstrument.get(canal) ?? { programme: 0, banque: 0 };
        const prog = instrument !== undefined && instrument >= 0 ? instrument : instCanal.programme;
        const bq = banque !== undefined && banque >= 0 ? banque : instCanal.banque;
        const preset = sf2Global.presets.find(p => p.programme === prog && p.banque === bq) ?? sf2Global.presets[0];
        const nomInst = preset ? sf2Global.instruments[preset.zones[0]?.instrumentIdx ?? 0]?.nom ?? "?" : "?";
        console.log(`[attic] rendreMidiDepuisBytes canal ${canal} -> programme ${prog} banque=${bq} -> preset "${preset?.nom ?? "?"}" -> instrument SF2 "${nomInst}" (${nc.length} notes)`);
        const an = nc.map((n) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.fin }));
        const layer = rendreAvecSF2(sf2Global, an, volume, prog, bq);
        // Canaux sortis de la boucle : appeler `getChannelData` par échantillon
        // coûtait 40× le temps du même calcul, pour un résultat identique.
        const mixL = master.getChannelData(0), mixR = master.getChannelData(1);
        const srcL = layer.getChannelData(0), srcR = layer.getChannelData(1);
        const n = Math.min(master.length, layer.length);
        for (let i = 0; i < n; i++) { mixL[i] += srcL[i]; mixR[i] += srcR[i]; }
      }
      normaliserBuffer(master);
      return master;
    }


  // FM mode : écriture directe dans le buffer, sans nœuds Web Audio
  const length = Math.ceil(duree * sr);
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
  const gauche = buffer.getChannelData(0);
  const droite = buffer.getChannelData(1);

  for (const n of notes) {
    const dureeNote = n.fin - n.debut;
    if (dureeNote <= 0.001) continue;
    const freq = 440 * 2 ** ((n.note - 69) / 12);
    const gain = (n.velocite / 127) * vol * 0.4;
    const ratio = 2;
    const idxMod = 3;
    const debutEch = Math.floor(n.debut * sr);
    const finEch = Math.min(debutEch + Math.ceil(dureeNote * sr), length);
    const a = 0.005;
    const d = 0.08;
    const sVal = 0.7;
    const r = 0.04;

    for (let i = debutEch; i < finEch; i++) {
      const t = (i - debutEch) / sr;
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

  return buffer;
}


