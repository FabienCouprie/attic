// audio/midi.ts — Extrait de l'ancien monolithe DSP.
import { decoderAudioUrl } from "./io";
import { parseMidi, writeMidi } from "midi-file";
import type { StructureSF2 } from "./soundfont";
import { chercherZoneInstrument } from "./soundfont";
import { sf2Chargee } from "../plugins/soundfontGlobal";

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


function nomVersNote(nom: string): number {
  const tbl: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  const m = nom.match(/^([A-G]#?b?)(-?\d+)$/);
  if (!m) return 69;
  return (tbl[m[1]] ?? 0) + (parseInt(m[2]) + 1) * 12;
}


export function rendreAvecSF2(
  sf: StructureSF2,
  notes: NoteEvenement[],
  volume: number,
  instrumentIdx?: number,
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

    const zone = chercherZoneInstrument(sf, n.note, n.velocite, instrumentIdx);
    if (!zone) continue;

    const ech = zone.echantillon;
    const donnees = zone.donnees;
    const srcDebut = zone.debutSample;
    const srcFin = zone.finSample;
    const srcLen = srcFin - srcDebut;
    if (srcLen < 2) continue;

    const noteDiff = n.note - ech.noteOriginale + ech.correction / 100;
    const ratio = 2 ** (noteDiff / 12);
    const gain = (n.velocite / 127) * vol * 0.8;

    const debutEch = Math.max(0, Math.floor(n.debut * sr));
    const nbEchantJoues = Math.floor(Math.min(dureeNote, srcLen / ratio) * sr);

    const boucleActive = ech.debutBoucle < ech.finBoucle && ech.finBoucle > 0;
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

      if (srcIdx + 1 >= srcDebut + srcLen) {
        if (boucleActive && longueurBoucle > 0) {
          srcIdx = srcDebut + debutBoucle + ((srcIdx - srcDebut - debutBoucle) % longueurBoucle);
        } else {
          break;
        }
      }

      const g = donnees[srcIdx] * (1 - frac) + donnees[Math.min(srcIdx + 1, srcDebut + srcLen - 1)] * frac;
      const mono = (g / 32768) * gain;
      gauche[posSortie] += mono;
      droite[posSortie] += mono;
    }
  }

  return resultat;
}


async function chargerSoundFont(id: string): Promise<Record<string, string>> {
  const url = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${id}-mp3.js`;
  const reponse = await fetch(url);
  const texte = await reponse.text();
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  return JSON.parse(texte.slice(debut, fin + 1));
}


function trouverEchantillon(note: number, echantillons: Record<string, string>): { note: number; url: string } {
  const noms = Object.keys(echantillons);
  let meilleur = noms[0];
  let meilleureDiff = Math.abs(nomVersNote(meilleur) - note);
  for (const nom of noms) {
    const diff = Math.abs(nomVersNote(nom) - note);
    if (diff < meilleureDiff) { meilleureDiff = diff; meilleur = nom; }
  }
  return { note: nomVersNote(meilleur), url: echantillons[meilleur] };
}


async function rendreSoundFont(
  ctx: OfflineAudioContext,
  notes: NoteMidi[],
  volume: number,
  echantillons: Record<string, string>,
) {
  const vol = Math.max(0, Math.min(2, volume / 50));
  const cache = new Map<string, AudioBuffer>();
  const audioCtx = new AudioContext();

  for (const n of notes) {
    const duree = n.fin - n.debut;
    if (duree <= 0) continue;

    const echant = trouverEchantillon(n.note, echantillons);
    const cleCache = echant.note.toString();
    let buf = cache.get(cleCache);
    if (!buf) {
      try {
        buf = await decoderAudioUrl(echant.url, audioCtx);
        cache.set(cleCache, buf);
      } catch {
        continue;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = 2 ** ((n.note - echant.note) / 12);

    const env = ctx.createGain();
    const gain = (n.velociete / 127) * vol * 0.8;
    const a = 0.004;
    const r = 0.04;
    const fin = n.debut + duree;

    env.gain.setValueAtTime(0, n.debut);
    env.gain.linearRampToValueAtTime(gain, n.debut + a);
    env.gain.setValueAtTime(gain, fin - r);
    env.gain.linearRampToValueAtTime(0, fin);

    source.connect(env);
    env.connect(ctx.destination);
    source.start(n.debut);
    source.stop(fin);
  }

  audioCtx.close();
}


function gmProgrammeVersSfId(programme: number): string {
  const tbl: Record<number, string> = {
    0: "acoustic_grand_piano", 1: "bright_acoustic_piano", 2: "electric_grand_piano",
    3: "honkytonk_piano", 4: "electric_piano_1", 5: "electric_piano_2", 6: "harpsichord", 7: "clavinet",
    8: "celesta", 9: "glockenspiel", 10: "music_box", 11: "vibraphone", 12: "marimba", 13: "xylophone",
    14: "tubular_bells", 15: "dulcimer", 16: "drawbar_organ", 17: "percussive_organ", 18: "rock_organ",
    19: "church_organ", 20: "reed_organ", 21: "accordion", 22: "harmonica", 23: "tango_accordion",
    24: "acoustic_guitar_nylon", 25: "acoustic_guitar_steel", 26: "electric_guitar_jazz",
    27: "electric_guitar_clean", 28: "electric_guitar_muted", 29: "overdriven_guitar",
    30: "distortion_guitar", 31: "guitar_harmonics", 32: "acoustic_bass", 33: "electric_bass_finger",
    34: "electric_bass_pick", 35: "fretless_bass", 36: "slap_bass_1", 37: "slap_bass_2",
    38: "synth_bass_1", 39: "synth_bass_2", 40: "violin", 41: "viola", 42: "cello", 43: "contrabass",
    44: "tremolo_strings", 45: "pizzicato_strings", 46: "orchestral_harp", 47: "timpani",
    48: "string_ensemble_1", 49: "string_ensemble_2", 50: "synth_strings_1", 51: "synth_strings_2",
    52: "choir_aahs", 53: "voice_oohs", 54: "synth_voice", 55: "orchestra_hit", 56: "trumpet",
    57: "trombone", 58: "tuba", 59: "muted_trumpet", 60: "french_horn", 61: "brass_section",
    62: "synth_brass_1", 63: "synth_brass_2", 64: "soprano_sax", 65: "alto_sax", 66: "tenor_sax",
    67: "baritone_sax", 68: "oboe", 69: "english_horn", 70: "bassoon", 71: "clarinet", 72: "piccolo",
    73: "flute", 74: "recorder", 75: "pan_flute", 76: "blown_bottle", 77: "shakuhachi", 78: "whistle",
    79: "ocarina", 80: "lead_1_square", 81: "lead_2_sawtooth", 82: "lead_3_calliope", 83: "lead_4_chiff",
    84: "lead_5_charang", 85: "lead_6_voice", 86: "lead_7_fifths", 87: "lead_8_bass_lead",
    88: "pad_1_new_age", 89: "pad_2_warm", 90: "pad_3_polysynth", 91: "pad_4_choir", 92: "pad_5_bowed",
    93: "pad_6_metallic", 94: "pad_7_halo", 95: "pad_8_sweep", 96: "fx_1_rain", 97: "fx_2_soundtrack",
    98: "fx_3_crystal", 99: "fx_4_atmosphere", 100: "fx_5_brightness", 101: "fx_6_goblins",
    102: "fx_7_echoes", 103: "fx_8_scifi", 104: "sitar", 105: "banjo", 106: "shamisen", 107: "koto",
    108: "kalimba", 109: "bag_pipe", 110: "fiddle", 111: "shanai", 112: "tinkle_bell", 113: "agogo",
    114: "steel_drums", 115: "woodblock", 116: "taiko_drum", 117: "melodic_tom", 118: "synth_drum",
    119: "reverse_cymbal", 120: "guitar_fret_noise", 121: "breath_noise", 122: "seashore",
    123: "bird_tweet", 124: "telephone_ring", 125: "helicopter", 126: "applause", 127: "gunshot",
  };
  return tbl[programme] ?? "acoustic_grand_piano";
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
    if (sf2Global) {
      console.log(`[attic] rendreMidiDepuisBytes utilise SF2 global : ${sf2Global.nom} (${sf2Global.instruments.length} instruments, ${sf2Global.echantillons.length} échantillons)`);
      const notesEvenements: NoteEvenement[] = notes.map((n) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));
      return rendreAvecSF2(sf2Global, notesEvenements, volume);
    }
    console.warn("[attic] rendreMidiDepuisBytes en mode SoundFont mais aucun SF2 global chargé ; fallback FluidR3_GM.");
    const ctx = new OfflineAudioContext(2, Math.ceil(duree * sr), sr);
    const notesParProg = new Map<number, NoteMidi[]>();
    for (const n of notes) {
      const prog = canauxInstrument.get(n.canal) ?? 0;
      if (!notesParProg.has(prog)) notesParProg.set(prog, []);
      notesParProg.get(prog)!.push(n);
    }
    const cacheSf = new Map<string, Record<string, string>>();
    for (const [prog, notesGroupe] of notesParProg) {
      const sfId = gmProgrammeVersSfId(prog);
      let echantillons = cacheSf.get(sfId);
      if (!echantillons) {
        try {
          echantillons = await chargerSoundFont(sfId);
          cacheSf.set(sfId, echantillons);
        } catch {
          try {
            echantillons = cacheSf.get("acoustic_grand_piano") ?? await chargerSoundFont("acoustic_grand_piano");
            cacheSf.set("acoustic_grand_piano", echantillons);
          } catch { continue; }
        }
      }
      await rendreSoundFont(ctx, notesGroupe, vol * 100, echantillons);
    }
    return ctx.startRendering();
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
    if (sf2Global) {
      console.log(`[attic] rendreSequence utilise SF2 global : ${sf2Global.nom} (${sf2Global.instruments.length} instruments, ${sf2Global.echantillons.length} échantillons)`);
      return rendreAvecSF2(sf2Global, notes, volume, instrument ?? undefined);
    }
    console.warn("[attic] rendreSequence en mode SoundFont mais aucun SF2 global chargé ; fallback FluidR3_GM.");
    const ctx = new OfflineAudioContext(2, Math.ceil(duree * 44100), 44100);
    const notesMidi: NoteMidi[] = notes.map((n) => ({
      ...n,
      velociete: n.velocite,
      canal: 0,
    }));
    const notesParProg = new Map<number, NoteMidi[]>();
    const prog = instrument ?? 0;
    notesParProg.set(prog, notesMidi);
    const cacheSf = new Map<string, Record<string, string>>();
    for (const [p, notesGroupe] of notesParProg) {
      const sfId = gmProgrammeVersSfId(p);
      let echantillons = cacheSf.get(sfId);
      if (!echantillons) {
        try {
          echantillons = await chargerSoundFont(sfId);
          cacheSf.set(sfId, echantillons);
        } catch {
          try {
            echantillons = cacheSf.get("acoustic_grand_piano") ?? await chargerSoundFont("acoustic_grand_piano");
            cacheSf.set("acoustic_grand_piano", echantillons);
          } catch { continue; }
        }
      }
      await rendreSoundFont(ctx, notesGroupe, vol * 100, echantillons);
    }
    return ctx.startRendering();
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

