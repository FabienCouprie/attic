// audio/midi.ts — Extrait de l'ancien monolithe DSP.

import { parseMidi, writeMidi } from "midi-file";
import type { StructureSF2 } from "./soundfont";
import { chercherZonesInstrument } from "./soundfont";
import { sf2Chargee } from "../plugins/soundfontGlobal";
import { traduire } from "../i18n";

export interface NoteMidi {
  note: number;
  velociete: number;
  debut: number;
  fin: number;
  canal: number;
}


export function analyserMidi(midi: ReturnType<typeof parseMidi>): {
  notes: NoteMidi[];
  dureeTotale: number;
  canauxInstrument: Map<number, number>;
} {
  const tpm = midi.header.ticksPerBeat ?? 480;
  const changementsTempo: { tick: number; tempo: number }[] = [{ tick: 0, tempo: 500000 }];
  const canauxInstrument = new Map<number, number>();
  for (let c = 0; c < 16; c++) canauxInstrument.set(c, 0);

  for (const piste of midi.tracks) {
    let tick = 0;
    for (const evt of piste) {
      tick += evt.deltaTime;
      if (evt.type === "setTempo") changementsTempo.push({ tick, tempo: evt.microsecondsPerBeat });
      if (evt.type === "programChange") canauxInstrument.set(evt.channel, evt.programNumber);
    }
  }
  changementsTempo.sort((a, b) => a.tick - b.tick);

  function tickEnSecondes(tick: number): number {
    let sec = 0;
    for (let i = 0; i < changementsTempo.length - 1; i++) {
      const c = changementsTempo[i];
      const p = changementsTempo[i + 1];
      if (tick <= p.tick) return sec + ((tick - c.tick) / tpm) * (c.tempo / 1_000_000);
      sec += ((p.tick - c.tick) / tpm) * (c.tempo / 1_000_000);
    }
    const dernier = changementsTempo[changementsTempo.length - 1];
    return sec + ((tick - dernier.tick) / tpm) * (dernier.tempo / 1_000_000);
  }

  const notes: NoteMidi[] = [];
  let dureeMax = 0;

  for (const piste of midi.tracks) {
    let tick = 0;
    const actifs = new Map<string, { note: number; debut: number; velociete: number; canal: number }>();

    for (const evt of piste) {
      tick += evt.deltaTime;
      if (evt.type === "noteOn" && evt.velocity > 0) {
        const t = tickEnSecondes(tick);
        const cle = `${evt.channel}-${evt.noteNumber}`;
        const existant = actifs.get(cle);
        if (existant) {
          notes.push({ ...existant, fin: t });
          if (t > dureeMax) dureeMax = t;
        }
        actifs.set(cle, { note: evt.noteNumber, debut: t, velociete: evt.velocity, canal: evt.channel });
      }
      if (evt.type === "noteOff" || (evt.type === "noteOn" && evt.velocity === 0)) {
        const t = tickEnSecondes(tick);
        const cle = `${evt.channel}-${evt.noteNumber}`;
        const actif = actifs.get(cle);
        if (actif) {
          actifs.delete(cle);
          notes.push({ ...actif, fin: t });
          if (t > dureeMax) dureeMax = t;
        }
      }
      if (evt.type === "endOfTrack") {
        for (const [, actif] of actifs) {
          const t = tickEnSecondes(tick);
          notes.push({ ...actif, fin: t });
          if (t > dureeMax) dureeMax = t;
        }
        actifs.clear();
      }
    }
  }

  return { notes, dureeTotale: dureeMax + 1, canauxInstrument };
}


export function rendreAvecSF2(
  sf: StructureSF2,
  notes: NoteEvenement[],
  volume: number,
  programme = 0,
  banque = 0,
): AudioBuffer {
  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    return ctx.startRendering() as unknown as AudioBuffer;
  }

  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), 0.5);
  const sr = 44100;
  const length = Math.ceil(duree * sr);
  const resultat = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
  const gauche = resultat.getChannelData(0);
  const droite = resultat.getChannelData(1);
  const vol = Math.max(0, Math.min(1, volume / 100));

  for (const n of notes) {
    const dureeNote = n.fin - n.debut;
    if (dureeNote <= 0.001) continue;

    const matches = chercherZonesInstrument(sf, n.note, n.velocite, programme, banque);
    if (matches.length === 0) continue;
    if (notes.indexOf(n) < 5) {
      const first = matches[0];
      const ech = first.echantillon;
      const zone = first.zone;
      const root = zone.rootKey ?? ech.noteOriginale;
      const effPan = (ech.type === 2 || ech.type === 0x8002) ? 1 : (ech.type === 4 || ech.type === 0x8004) ? -1 : (zone.pan ?? 0) / 500;
      console.log(`[attic] SF2 note ${n.note} vel=${n.velocite} -> inst=${first.instrumentIdx} zones=${matches.length} sample="${ech.nom}" root=${root} sr=${ech.taux || 44100} loop=${zone.boucleActive} att=${zone.attenuation ?? 0} type=${ech.type} pan=${zone.pan ?? 0} effPan=${effPan.toFixed(2)}`);
    }

    for (const match of matches) {
      const ech = match.echantillon;
      const zone = match.zone;
      const donnees = match.donnees;
      const srcDebut = match.debutSample;
      const srcFin = match.finSample;
      const srcLen = srcFin - srcDebut;
      if (srcLen < 2) continue;

      const rootNote = zone.rootKey ?? ech.noteOriginale;
      const noteDiff = n.note - rootNote + (zone.coarseTune ?? 0) + (ech.correction + (zone.fineTune ?? 0)) / 100;
      const sampleRate = ech.taux || sr;
      const ratio = (sampleRate / sr) * (2 ** (noteDiff / 12));
      const attenuation = zone.attenuation ?? 0;
      const gain = (n.velocite / 127) * vol * 0.8 * Math.pow(10, -attenuation / 200);
      const pan = (ech.type === 2 || ech.type === 0x8002) ? 1
                  : (ech.type === 4 || ech.type === 0x8004) ? -1
                  : (zone.pan ?? 0) / 500;
      const gainGauche = Math.sqrt((1 - pan) / 2);
      const gainDroite = Math.sqrt((1 + pan) / 2);

      const debutEch = Math.max(0, Math.floor(n.debut * sr));
      const boucleActive = zone.boucleActive && ech.debutBoucle < ech.finBoucle && ech.finBoucle > 0;
      const nbEchantJoues = Math.floor((boucleActive ? dureeNote : Math.min(dureeNote, srcLen / ratio)) * sr);

      const debutBoucle = (ech.debutBoucle - ech.debut);
      const finBoucle = (ech.finBoucle - ech.debut);
      const longueurBoucle = finBoucle - debutBoucle;

      for (let j = 0; j < nbEchantJoues; j++) {
        const posSortie = debutEch + j;
        if (posSortie >= length) break;

        let srcPos = j * ratio;
        let srcIdx: number;
        let frac: number;

        if (boucleActive && longueurBoucle > 0 && srcPos >= debutBoucle + longueurBoucle) {
          const posBoucle = ((srcPos - debutBoucle) % longueurBoucle);
          srcPos = debutBoucle + posBoucle;
        }

        srcIdx = srcDebut + Math.floor(srcPos);
        frac = srcPos - Math.floor(srcPos);

        if (!boucleActive && srcIdx + 1 >= srcDebut + srcLen) {
          break;
        }

        let idx2 = srcIdx + 1;
        if (boucleActive && longueurBoucle > 0 && idx2 >= srcDebut + finBoucle) {
          idx2 = srcDebut + debutBoucle + ((idx2 - srcDebut - finBoucle) % longueurBoucle);
        }
        if (idx2 >= srcDebut + srcLen) {
          idx2 = srcDebut + srcLen - 1;
        }
        const g = donnees[srcIdx] * (1 - frac) + donnees[idx2] * frac;
        const mono = (g / 32768) * gain;
        gauche[posSortie] += mono * gainGauche;
        droite[posSortie] += mono * gainDroite;
      }
    }
  }

  normaliserBuffer(resultat);
  return resultat;
}


function normaliserBuffer(buffer: AudioBuffer, ceiling = 1): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak > ceiling) {
    const s = ceiling / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] *= s;
    }
  }
}



export function notesVersFichierMidi(notes: NoteEvenement[], tempoBpm: number): File {
  const tpm = 480;
  const debutMin = notes.length > 0 ? Math.min(...notes.map((n) => n.debut)) : 0;
  const microsecParBeat = (60 / tempoBpm) * 1_000_000;

  function secEnTicks(sec: number): number { return Math.round(((sec - debutMin) / 60) * tempoBpm * tpm); }

  const lignes: { tick: number; type: string; [key: string]: any }[] = [
    { tick: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { tick: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];

  for (const n of notes) {
    const tickDebut = secEnTicks(n.debut);
    const tickFin = secEnTicks(n.fin);
    if (tickDebut < 0) continue;
    lignes.push({ tick: tickDebut, type: "noteOn", channel: 0, noteNumber: n.note, velocity: Math.max(1, n.velocite) });
    lignes.push({ tick: Math.max(tickDebut + 1, tickFin), type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 });
  }

  lignes.sort((a, b) => a.tick - b.tick || (a.type === "noteOff" ? 1 : -1));

  let tickCourant = 0;
  const events: { deltaTime: number; type: string; [key: string]: any }[] = [];
  for (const l of lignes) {
    const { tick, ...rest } = l;
    events.push({ deltaTime: tick - tickCourant, ...rest });
    tickCourant = tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack" });

  const midi = { header: { format: 1 as const, numTracks: 1, ticksPerBeat: tpm }, tracks: [events] };
  const bytes = new Uint8Array(writeMidi(midi as any));
  return new File([bytes], "transcription.mid", { type: "audio/midi" });
}


export async function rendreMidi(
  fichier: File,
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
): Promise<AudioBuffer> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  return rendreMidiDepuisBytes(bytes, mode, volume);
}


export async function rendreMidiDepuisBytes(
  bytes: Uint8Array,
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
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
        const prog = canauxInstrument.get(canal) ?? 0;
        const preset = sf2Global.presets.find(p => p.programme === prog && p.banque === 0) ?? sf2Global.presets[0];
        const nomInst = preset ? sf2Global.instruments[preset.zones[0]?.instrumentIdx ?? 0]?.nom ?? "?" : "?";
        console.log(`[attic] rendreMidiDepuisBytes canal ${canal} -> programme ${prog} -> preset "${preset?.nom ?? "?"}" -> instrument SF2 "${nomInst}" (${nc.length} notes)`);
        const an = nc.map((n) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));
        const layer = rendreAvecSF2(sf2Global, an, volume, prog, 0);
        for (let i = 0; i < master.length && i < layer.length; i++) {
          master.getChannelData(0)[i] += layer.getChannelData(0)[i];
          master.getChannelData(1)[i] += layer.getChannelData(1)[i];
        }
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
    const gain = (n.velociete / 127) * vol * 0.4;
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


export interface NoteEvenement {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
}


export async function rendreSequence(
  notes: NoteEvenement[],
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument?: number,
): Promise<AudioBuffer> {
  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, Math.ceil(0.5 * 44100), 44100);
    return ctx.startRendering();
  }

  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), 0.5);
  const vol = Math.max(0, Math.min(1, volume / 100));

  if (mode === "SoundFont") {
    const sf2Global = sf2Chargee();
    if (!sf2Global) {
      throw new Error(traduire("msg.sf2.non.charge"));
    }
    const prog = instrument ?? 0;
    const preset = sf2Global.presets.find(p => p.programme === prog && p.banque === 0) ?? sf2Global.presets[0];
    const nomInst = preset ? sf2Global.instruments[preset.zones[0]?.instrumentIdx ?? 0]?.nom ?? "?" : "?";
    console.log(`[attic] rendreSequence utilise SF2 global : ${sf2Global.nom}, programme ${prog}, preset "${preset?.nom ?? "?"}" -> instrument "${nomInst}" (${notes.length} notes)`);
    return rendreAvecSF2(sf2Global, notes, volume, prog, 0);
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
    const ratio = 2;
    const idxMod = 3;
    const debutEch = Math.floor(n.debut * srInterne);
    const finEch = Math.min(debutEch + Math.ceil(dureeNote * srInterne), length);
    const a = 0.005;
    const d = 0.08;
    const sVal = 0.7;
    const r = 0.04;

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

// ─── Analyse audio (tempo, tonalité, song/instrumental) ───

// ─── Transposition + quantification MIDI ───

// Grilles de quantification en divisions par beat.
const GRILLES: Record<string, number> = {
  "Aucune": 0,
  "None": 0,
  "1/4": 1,
  "1/8": 2,
  "1/16": 4,
  "1/32": 8,
  "1/8 triplet": 3,
  "1/16 triplet": 6,
};

export async function transposerQuantifierMidi(
  fichier: File,
  demiTons: number,
  grilleNom: string,
  quantifierFin: boolean,
): Promise<File> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  const midi = parseMidi(bytes);
  const tpm = midi.header.ticksPerBeat ?? 480;
  const divisions = GRILLES[grilleNom] ?? 0;
  const pasGrille = divisions > 0 ? Math.round(tpm / divisions) : 0;

  for (const piste of midi.tracks) {
    for (const evt of piste) {
      if (evt.type === "noteOn" || evt.type === "noteOff") {
        evt.noteNumber = Math.max(0, Math.min(127, evt.noteNumber + demiTons));
      }
    }
  }

  if (pasGrille > 0) {
    for (const piste of midi.tracks) {
      let tickAbsolu = 0;
      const eventsAbsolus: { tick: number; evt: any }[] = [];
      for (const evt of piste) {
        tickAbsolu += evt.deltaTime;
        eventsAbsolus.push({ tick: tickAbsolu, evt });
      }

      // Piste des noteOn actifs pour s'assurer fin >= debut + 1
      const noteOnTick = new Map<string, number>();

      for (const ea of eventsAbsolus) {
        if (ea.evt.type === "noteOn" && ea.evt.velocity > 0) {
          ea.tick = Math.round(ea.tick / pasGrille) * pasGrille;
          noteOnTick.set(`${ea.evt.channel}-${ea.evt.noteNumber}`, ea.tick);
        } else if (ea.evt.type === "noteOff" || (ea.evt.type === "noteOn" && ea.evt.velocity === 0)) {
          if (quantifierFin) {
            ea.tick = Math.round(ea.tick / pasGrille) * pasGrille;
          }
          const cle = `${ea.evt.channel}-${ea.evt.noteNumber}`;
          const debut = noteOnTick.get(cle);
          if (debut !== undefined && ea.tick <= debut) {
            ea.tick = debut + pasGrille;
          }
        }
      }

      eventsAbsolus.sort((a, b) => a.tick - b.tick || (a.evt.type === "noteOff" ? 1 : -1));
      let prevTick = 0;
      for (const ea of eventsAbsolus) {
        ea.evt.deltaTime = Math.max(0, ea.tick - prevTick);
        prevTick = ea.tick;
      }
    }
  }

  const nomBase = fichier.name.replace(/\.mid$/i, "");
  const nouvBytes = new Uint8Array(writeMidi(midi as any));
  return new File([nouvBytes], `${nomBase}_tq.mid`, { type: "audio/midi" });
}

// ─── Arpégiateur MIDI ───

export async function arpegerMidi(
  fichier: File,
  motif: string,
  direction: string,
  vitesseNom: string,
  octaves: number,
  dureeNotePct: number,
): Promise<File> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  const midi = parseMidi(bytes);
  const { notes } = analyserMidi(midi);

  if (notes.length === 0) return fichier;

  // Grouper les notes qui sonnent simultanément en "accords".
  // Deux notes sont dans le même accord si elles commencent dans une fenêtre
  // de tolérance (30 ms) l'une de l'autre, ou si l'une commence pendant que
  // l'autre tient encore.
  const tol = 0.03;
  const notesTriees = [...notes].sort((a, b) => a.debut - b.debut);
  const accords: { temps: number; notes: number[]; velocite: number; duree: number }[] = [];

  for (const n of notesTriees) {
    const dernier = accords[accords.length - 1];
    if (dernier && Math.abs(n.debut - dernier.temps) < tol) {
      dernier.notes.push(n.note);
      dernier.velocite = Math.max(dernier.velocite, n.velociete);
      dernier.duree = Math.max(dernier.duree, n.fin - n.debut);
    } else {
      accords.push({ temps: n.debut, notes: [n.note], velocite: n.velociete, duree: n.fin - n.debut });
    }
  }

  // Vitesse : divisions par beat.
  const vitesses: Record<string, number> = {
    "1/8": 2, "1/16": 4, "1/32": 8, "1/8 triplet": 3, "1/16 triplet": 6,
  };
  const divisions = vitesses[vitesseNom] ?? 4;
  const dureeStep = 60 / (divisions * 2); // en secondes (à 120 BPM de référence)

  // Durée de chaque note arpégée
  const dureeNote = dureeStep * (dureeNotePct / 100);

  // Motif : indices dans l'accord trié.
  // "Montant" = 0,1,2,... ; "Descendant" = N-1,...,1,0 ;
  // "UpDown" = 0,1,...,N-1,...,1,0 ; "DownUp" = N-1,...,0,...,N-1 ;
  // "Aléatoire" = ordre random ; "Montant+1" = décale d'une octave
  function ordreArpege(notes: number[], dir: string, oct: number): number[] {
    const trie = [...notes].sort((a, b) => a - b);
    const result: number[] = [];
    for (let o = 0; o < oct; o++) {
      const base = o * 12;
      let sequence: number[];
      switch (dir) {
        case "Descendant":
          sequence = trie.map((n) => n + base).reverse();
          break;
        case "UpDown":
          sequence = [...trie.map((n) => n + base), ...trie.map((n) => n + base).reverse().slice(1, -1)];
          break;
        case "DownUp":
          sequence = [...trie.map((n) => n + base).reverse(), ...trie.map((n) => n + base).slice(1, -1)];
          break;
        case "Aléatoire":
          sequence = [...trie].sort(() => Math.random() - 0.5).map((n) => n + base);
          break;
        default: // Montant
          sequence = trie.map((n) => n + base);
      }
      result.push(...sequence);
    }
    return result;
  }

  // Motif : pattern répétitif sur l'accord (ex: "1232" = bas, milieu, haut, milieu)
  function appliquerMotif(ordre: number[], motifStr: string): number[] {
    if (!motifStr || motifStr === "Droit") return ordre;
    const indices = motifStr.split("").map((c) => parseInt(c, 10) - 1);
    const result: number[] = [];
    for (const idx of indices) {
      if (idx >= 0 && idx < ordre.length) result.push(ordre[idx]);
    }
    return result.length > 0 ? result : ordre;
  }

  // Construire les notes arpégées
  const nouvNotes: NoteEvenement[] = [];
  for (const accord of accords) {
    const ordre = ordreArpege(accord.notes, direction, octaves);
    const motifNotes = appliquerMotif(ordre, motif);
    const nbNotes = motifNotes.length;
    if (nbNotes === 0) continue;

    // Durée totale de l'arpège = durée de l'accord original
    const dureeAccord = Math.max(accord.duree, nbNotes * dureeStep);
    const nbCycles = Math.max(1, Math.floor(dureeAccord / (nbNotes * dureeStep)));

    for (let c = 0; c < nbCycles; c++) {
      for (let i = 0; i < nbNotes; i++) {
        const t = accord.temps + (c * nbNotes + i) * dureeStep;
        const note = Math.max(0, Math.min(127, motifNotes[i]));
        nouvNotes.push({
          note,
          velocite: Math.max(1, Math.min(127, Math.round(accord.velocite * 0.9))),
          debut: t,
          fin: t + dureeNote,
        });
      }
    }
  }

  const tpm = 480;
  const tempo = 120;
  const microsecParBeat = (60 / tempo) * 1_000_000;
  function secEnTicks(sec: number): number { return Math.round((sec / 60) * tempo * tpm); }

  const lignes: { tick: number; type: string; [key: string]: any }[] = [
    { tick: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { tick: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];

  for (const n of nouvNotes) {
    const tickDebut = secEnTicks(n.debut);
    const tickFin = secEnTicks(n.fin);
    lignes.push({ tick: tickDebut, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocite });
    lignes.push({ tick: Math.max(tickDebut + 1, tickFin), type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 });
  }

  lignes.sort((a, b) => a.tick - b.tick || (a.type === "noteOff" ? 1 : -1));
  let tickCourant = 0;
  const events: { deltaTime: number; type: string; [key: string]: any }[] = [];
  for (const l of lignes) {
    const { tick, ...rest } = l;
    events.push({ deltaTime: tick - tickCourant, ...rest });
    tickCourant = tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack" });

  const nouvMidi = { header: { format: 1 as const, numTracks: 1, ticksPerBeat: tpm }, tracks: [events] };
  const nouvBytes = new Uint8Array(writeMidi(nouvMidi as any));
  const nomBase = fichier.name.replace(/\.mid$/i, "");
  return new File([nouvBytes], `${nomBase}_arp.mid`, { type: "audio/midi" });
}

