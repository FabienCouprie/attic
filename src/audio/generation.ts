// audio/generation.ts — Extrait de l'ancien monolithe DSP.
import type { NoteEvenement } from "./midi";
import { writeMidi } from "midi-file";
import { DEMI_TONS_CLE, frequenceDeNoteMidi } from "./commun";

const MOTIFS_PREDEFINIS: Record<string, number[]> = {
  "Triade M": [0, 4, 7],
  "Triade m": [0, 3, 7],
  "Arpège 7": [0, 4, 7, 10],
  "Cantus firmus": [0, 2, 4, 5, 7, 9, 11],
};


function degreVersMidi(degre: number, decalageCle: number, degresGamme: number[], octaveBase: number): number {
  const octaveDelta = Math.floor(degre / degresGamme.length);
  const idx = ((degre % degresGamme.length) + degresGamme.length) % degresGamme.length;
  return octaveBase + decalageCle + degresGamme[idx] + octaveDelta * 12;
}


function deplierMotif(motif: number[], profondeur: number): number[] {
  if (profondeur <= 1) return motif;
  const sous = deplierMotif(motif, profondeur - 1);
  const resultat: number[] = [];
  for (const intervalle of motif) {
    for (const note of sous) {
      resultat.push(intervalle + note);
    }
  }
  return resultat;
}


export async function genererMusiqueFractale(
  typeMotif: string,
  intervallesPerso: string,
  profondeur: number,
  dureeSec: number,
  tempo: number,
  cle: string,
  gamme: string,
  timbre: string
): Promise<{ audio: AudioBuffer; notes: NoteEvenement[] }> {
  const sampleRate = 44100;
  const pMax = Math.min(profondeur, 6);
  const motif = typeMotif === "Personnalisé"
    ? intervallesPerso.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : (MOTIFS_PREDEFINIS[typeMotif] ?? [0, 4, 7]);
  if (motif.length === 0) motif.push(0);

  const degres = DEGRES_GAMME[gamme] ?? DEGRES_GAMME["Majeur"];
  const decalageCle = DEMI_TONS_CLE[cle] ?? 0;

  const notesMidi = deplierMotif(motif, pMax);
  const dureeParNote = (60 / Math.max(1, tempo)) / (motif.length ** (pMax - 1) || 1);
  const dureeCalculee = notesMidi.length * dureeParNote;
  const facteur = dureeCalculee > 0 ? dureeSec / dureeCalculee : 1;
  const dureeNote = dureeParNote * facteur;

  const totalNotes = notesMidi.length;
  const dureeTotale = totalNotes * dureeNote;
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(dureeTotale * sampleRate)), sampleRate);
  const notes: NoteEvenement[] = [];

  const formesOsc: Record<string, OscillatorType> = { Douce: "triangle", Brillante: "sawtooth", Percutante: "square" };
  const typeOsc = formesOsc[timbre] ?? "triangle";
  const attaque = timbre === "Percutante" ? 0.001 : 0.005;
  const relache = timbre === "Douce" ? 0.15 : 0.04;

  for (let i = 0; i < totalNotes; i++) {
    const midiSnappe = degreVersMidi(
      Math.round(notesMidi[i]),
      decalageCle,
      degres,
      48
    );
    const freq = frequenceDeNoteMidi(midiSnappe);
    const debut = i * dureeNote;
    const fin = debut + dureeNote;
    const volume = timbre === "Percutante" ? 0.3 : 0.18;

    const osc = offline.createOscillator();
    osc.type = typeOsc;
    osc.frequency.value = freq;

    const gain = offline.createGain();
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(volume, debut + attaque);
    gain.gain.setValueAtTime(volume, Math.max(debut + attaque, fin - relache));
    gain.gain.linearRampToValueAtTime(0, fin);

    osc.connect(gain);
    gain.connect(offline.destination);
    osc.start(debut);
    osc.stop(fin + 0.01);
    notes.push({ note: midiSnappe, velocite: 100, debut, fin });
  }

  const audio = await offline.startRendering();
  return { audio, notes };
}

// --- Génération mélodique aléatoire ---------------------------------------


const DEGRES_GAMME: Record<string, number[]> = {
  Majeur: [0, 2, 4, 5, 7, 9, 11],
  "Mineur naturel": [0, 2, 3, 5, 7, 8, 10],
  "Mineur harmonique": [0, 2, 3, 5, 7, 8, 11],
  "Pentatonique majeure": [0, 2, 4, 7, 9],
  "Pentatonique mineure": [0, 3, 5, 7, 10],
};


export async function genererMelodieAleatoire(
  cle: string,
  gamme: string,
  signature: string,
  tempoBpm: number,
  nbMesures: number
): Promise<{ audio: AudioBuffer; notes: NoteEvenement[] }> {
  const decalage = DEMI_TONS_CLE[cle] ?? 0;
  const degres = DEGRES_GAMME[gamme] ?? DEGRES_GAMME["Majeur"];
  const [tempsParMesureTexte, uniteBattementTexte] = signature.split("/");
  const tempsParMesure = Number(tempsParMesureTexte) || 4;
  const uniteBattement = Number(uniteBattementTexte) || 4;

  const dureeNoire = 60 / Math.max(1, tempoBpm);
  const dureeBattement = dureeNoire * (4 / uniteBattement);
  const nbBattements = Math.max(1, tempsParMesure) * Math.max(1, nbMesures);

  const sampleRate = 44100;
  const dureeTotale = nbBattements * dureeBattement + 1;
  const offline = new OfflineAudioContext(2, Math.ceil(dureeTotale * sampleRate), sampleRate);
  const notes: NoteEvenement[] = [];

  const noteCentrale = 60; // Do central
  let tempsCourant = 0;

  for (let i = 0; i < nbBattements; i++) {
    const subdivise = Math.random() < 0.3;
    const nbSousNotes = subdivise ? 2 : 1;
    const dureeNote = dureeBattement / nbSousNotes;

    for (let s = 0; s < nbSousNotes; s++) {
      const silence = Math.random() < 0.1;
      if (!silence) {
        const degre = degres[Math.floor(Math.random() * degres.length)];
        const octave = Math.floor(Math.random() * 2) * 12;
        const midi = noteCentrale + decalage + degre + octave;
        const frequence = frequenceDeNoteMidi(midi);

        const debut = tempsCourant + s * dureeNote;
        const fin = debut + dureeNote;
        const attaque = 0.01;
        const relache = Math.min(0.08, dureeNote * 0.3);

        const osc = offline.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = frequence;

        const gain = offline.createGain();
        gain.gain.setValueAtTime(0, debut);
        gain.gain.linearRampToValueAtTime(0.5, debut + attaque);
        gain.gain.setValueAtTime(0.5, debut + Math.max(attaque, dureeNote - relache));
        gain.gain.linearRampToValueAtTime(0, debut + dureeNote);

        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(debut);
        osc.stop(debut + dureeNote + 0.02);
        notes.push({ note: midi, velocite: 80 + Math.floor(Math.random() * 40), debut, fin });
      }
    }

    tempsCourant += dureeBattement;
  }

  const audio = await offline.startRendering();
  return { audio, notes };
}


export type Patron = { kick: number[]; snare: number[]; hat: number[]; hatOuvert: number[] };


export const PATRONS_RYTHME: Record<string, { signatures: string[]; positions: Record<string, Patron> }> = {
  Rock: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Four-on-the-floor": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Funk: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 10], snare: [4, 12], hat: [2, 4, 6, 8, 10, 12, 14], hatOuvert: [0] },
    },
  },
  "Hip-hop": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [3, 7, 11, 15], hatOuvert: [0] },
    },
  },
  Jazz: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0] },
    },
  },
  Reggae: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [8], snare: [8], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  Ska: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [4, 12], snare: [0, 8], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Bossa Nova": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Samba: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hatOuvert: [] },
    },
  },
  House: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [4, 12] },
    },
  },
  Techno: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  "Drum & Bass": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Trap: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8, 12], snare: [8], hat: [0, 3, 6, 9, 12, 15], hatOuvert: [] },
    },
  },
  Disco: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [12] },
    },
  },
  Tango: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 12], snare: [0, 4, 8, 12], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  Calypso: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Marche militaire": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [0, 2, 4, 6, 8, 10, 12, 14], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  "Pop ballade": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0, 8] },
    },
  },
  "Pop dance": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], hatOuvert: [0, 4, 8, 12] },
    },
  },
  "Pop latino": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Pop folk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Pop R&B": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 3, 8, 11], snare: [8], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  "Pop punk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 10, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Valse: {
    signatures: ["3/4"],
    positions: {
      "3/4": { kick: [0], snare: [4, 8], hat: [0, 4, 8], hatOuvert: [] },
    },
  },
  Bolero: {
    signatures: ["3/4"],
    positions: {
      "3/4": { kick: [0, 4], snare: [8], hat: [0, 4, 8], hatOuvert: [] },
    },
  },
};


function decoderPatronTexte(code: string, totalPas: number): { kick: boolean[]; snare: boolean[]; hat: boolean[]; hatOuvert: boolean[] } {
  const pas = code.replace(/\s/g, "").split("");
  const kick = Array.from({ length: totalPas }, () => false);
  const snare = Array.from({ length: totalPas }, () => false);
  const hat = Array.from({ length: totalPas }, () => false);
  const hatOuvert = Array.from({ length: totalPas }, () => false);
  for (let i = 0; i < totalPas; i++) {
    const c = i < pas.length ? pas[i] : ".";
    kick[i] = c === "K" || c === "T" || c === "H" || c === "X";
    snare[i] = c === "S" || c === "T" || c === "R" || c === "X";
    hat[i] = c === "h" || c === "H" || c === "R" || c === "X";
    hatOuvert[i] = c === "O" || c === "o";
  }
  return { kick, snare, hat, hatOuvert };
}


function genererPatronDefaut(tempsParMesure: number, uniteBattement: number): Patron {
  const subParTemps = 4 / (uniteBattement / 4);
  const kick: number[] = [];
  const snare: number[] = [];
  const hat: number[] = [];
  for (let b = 0; b < tempsParMesure; b++) {
    const pos = Math.round(b * subParTemps);
    if (b === 0 || b === Math.floor(tempsParMesure / 2)) kick.push(pos);
    if (b % 2 === 1) snare.push(pos);
    hat.push(pos);
  }
  return { kick, snare, hat, hatOuvert: [] };
}


export async function genererBoiteRythmes(
  tempo: number,
  patronNom: string,
  patronCode: string,
  mesures: number,
  volumeKick: number,
  volumeSnare: number,
  volumeHat: number,
  tempsParMesure: number = 4,
  uniteBattement: number = 4
): Promise<AudioBuffer> {
  const sr = 44100;
  const dureeNoire = 60 / Math.max(1, tempo);
  const dureeBattement = dureeNoire * (4 / uniteBattement);
  const pasMesure = tempsParMesure * 4;
  const tempsPas = dureeBattement / 4;
  const totalPas = mesures * pasMesure;
  const duree = totalPas * tempsPas;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * sr), sr);

  let triggers: { kick: boolean[]; snare: boolean[]; hat: boolean[]; hatOuvert: boolean[] };
  if (patronNom === "Personnalisé") {
    triggers = decoderPatronTexte(patronCode, totalPas);
  } else {
    const entree = PATRONS_RYTHME[patronNom];
    const signatureCle = `${tempsParMesure}/${uniteBattement}`;
    let patron: Patron;
    if (entree && entree.signatures.includes(signatureCle)) {
      patron = entree.positions[signatureCle]!;
    } else {
      patron = genererPatronDefaut(tempsParMesure, uniteBattement);
    }
    const kick = Array.from({ length: totalPas }, () => false);
    const snare = Array.from({ length: totalPas }, () => false);
    const hat = Array.from({ length: totalPas }, () => false);
    const hatOuvert = Array.from({ length: totalPas }, () => false);
    for (let m = 0; m < mesures; m++) {
      const decalage = m * pasMesure;
      for (const p of patron.kick) kick[decalage + p] = true;
      for (const p of patron.snare) snare[decalage + p] = true;
      for (const p of patron.hat) hat[decalage + p] = true;
      for (const p of patron.hatOuvert) hatOuvert[decalage + p] = true;
    }
    triggers = { kick, snare, hat, hatOuvert };
  }

  function jouerKick(debut: number, vol: number) {
    const gVol = vol * 0.8;
    const osc = offline.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, debut);
    osc.frequency.exponentialRampToValueAtTime(30, debut + 0.12);
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.25);
    osc.connect(g);
    g.connect(offline.destination);
    osc.start(debut);
    osc.stop(debut + 0.3);

    const cOsc = offline.createOscillator();
    cOsc.type = "square";
    cOsc.frequency.value = 1000;
    const cG = offline.createGain();
    cG.gain.setValueAtTime(gVol * 0.2, debut);
    cG.gain.exponentialRampToValueAtTime(0.001, debut + 0.003);
    cOsc.connect(cG);
    cG.connect(offline.destination);
    cOsc.start(debut);
    cOsc.stop(debut + 0.01);
  }

  function jouerSnare(debut: number, vol: number) {
    const gVol = vol * 0.6;
    const osc = offline.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 200;
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol * 0.4, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.08);
    osc.connect(g);
    g.connect(offline.destination);
    osc.start(debut);
    osc.stop(debut + 0.1);

    const nLen = Math.ceil(0.12 * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
    const src = offline.createBufferSource();
    src.buffer = buf;
    const f = offline.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 800;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + 0.12);
    src.connect(f);
    f.connect(nG);
    nG.connect(offline.destination);
    src.start(debut);
    src.stop(debut + 0.15);
  }

  function jouerHat(debut: number, vol: number, ouvert: boolean) {
    const gVol = vol * 0.5;
    const dureeSon = ouvert ? 0.25 : 0.04;
    const nLen = Math.ceil(dureeSon * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
    const src = offline.createBufferSource();
    src.buffer = buf;
    const f = offline.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = ouvert ? 5000 : 7000;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + dureeSon);
    src.connect(f);
    f.connect(nG);
    nG.connect(offline.destination);
    src.start(debut);
    src.stop(debut + dureeSon + 0.01);
  }

  const vk = Math.max(0, Math.min(1, volumeKick / 100));
  const vs = Math.max(0, Math.min(1, volumeSnare / 100));
  const vh = Math.max(0, Math.min(1, volumeHat / 100));

  for (let i = 0; i < totalPas; i++) {
    const t = i * tempsPas;
    if (triggers.kick[i]) jouerKick(t, vk);
    if (triggers.snare[i]) jouerSnare(t, vs);
    if (triggers.hat[i]) jouerHat(t, vh, false);
    if (triggers.hatOuvert[i]) jouerHat(t, vh, true);
  }

  return offline.startRendering();
}

// ── Lecteur MIDI ────────────────────────────────────────────────────────────


export function rendreAvecEchantillon(
  notes: NoteEvenement[],
  echantillon: AudioBuffer,
  volume: number,
  noteReference: number,
): AudioBuffer {
  if (notes.length === 0 || echantillon.length === 0) {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    return ctx.startRendering() as unknown as AudioBuffer;
  }

  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), 0.5);
  const sr = echantillon.sampleRate;
  const length = Math.ceil(duree * sr);
  const resultat = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
  const gauche = resultat.getChannelData(0);
  const droite = resultat.getChannelData(1);
  const srcG = echantillon.getChannelData(0);
  const srcD = echantillon.numberOfChannels > 1 ? echantillon.getChannelData(1) : srcG;
  const srcLen = echantillon.length;
  const vol = Math.max(0, Math.min(1, volume / 100));

  for (const n of notes) {
    if (n.fin <= n.debut) continue;
    const ratio = 2 ** ((n.note - noteReference) / 12);
    const dureeEchantillon = srcLen / sr;
    const dureeJouee = dureeEchantillon / ratio;
    const dureeCible = n.fin - n.debut;
    const dureeEffective = Math.min(dureeJouee, dureeCible);
    const debutEch = Math.max(0, Math.floor(n.debut * sr));
    const finEch = Math.min(length, Math.ceil((n.debut + dureeEffective) * sr));
    const gain = (n.velocite / 127) * vol * 0.5;
    const nbEchantJoues = Math.floor(dureeEffective * sr);

    for (let j = 0; j < nbEchantJoues; j++) {
      const posSortie = debutEch + j;
      if (posSortie >= length || posSortie >= finEch) break;
      const srcPos = j * ratio;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      if (srcIdx + 1 >= srcLen) break;
      const g = srcG[srcIdx] * (1 - frac) + srcG[Math.min(srcIdx + 1, srcLen - 1)] * frac;
      const d = srcD[srcIdx] * (1 - frac) + srcD[Math.min(srcIdx + 1, srcLen - 1)] * frac;
      gauche[posSortie] += g * gain;
      droite[posSortie] += d * gain;
    }
  }

  return resultat;
}


export const PROGRESSIONS_GENRE: Record<string, number[][]> = {
  rock: [[0, 4, 5], [0, 4, 0, 5], [0, 5, 3, 4]],
  pop: [[0, 5, 3, 4], [0, 4, 5, 4], [0, 3, 5, 4]],
  jazz: [[0, 3, 2, 5], [0, 2, 3, 4], [0, 5, 0, 3]],
  blues: [[0, 0, 0, 0], [0, 4, 0, 0], [4, 4, 0, 0], [5, 4, 0, 5]],
  classique: [[0, 4, 5, 0], [0, 4, 5, 3, 4, 0, 5, 0]],
  electro: [[0, 3, 5, 4], [0, 4, 5, 3]],
  hiphop: [[0, 3, 4, 5], [0, 4, 0, 3]],
  reggae: [[0, 4, 5, 4], [0, 5, 0, 4]],
  ambient: [[0, 5, 3, 4], [0, 3, 5, 0]],
};


const INSTRUMENTS_GM: Record<string, number> = {
  "Piano": 0, "Piano électrique": 4, "Guitare acoustique": 24, "Guitare électrique": 29,
  "Orgue": 19, "Clavecin": 6, "Vibraphone": 11, "Marimba": 12, "Cordes": 48, "Pad": 88,
  "Basse fretless": 35, "Basse acoustique": 32, "Basse électrique": 33, "Synth bass": 38,
  "Contrebasse": 43, "Basse slap": 36,
  "Flûte": 73, "Trompette": 56, "Sax alto": 65, "Guitare nylon": 24,
  "Violon": 40, "Lead synth": 80, "Boîte à musique": 10, "Xylophone": 13,
  "Batterie (GM)": 0, "Batterie (électro)": 0, "Batterie (jazz)": 0,
};


export const DEGRES_MAJEUR = [0, 2, 4, 5, 7, 9, 11];

export const DEGRES_MINEUR = [0, 2, 3, 5, 7, 8, 10];


export function traduireCle(nom: string): number {
  const clef: Record<string, number> = {
    Do: 0, "Do#": 1, Ré: 2, "Ré#": 3, Mi: 4, Fa: 5, "Fa#": 6,
    Sol: 7, "Sol#": 8, La: 9, "La#": 10, Si: 11,
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  return clef[nom] ?? 0;
}



export async function genererDepuisScript(script: string): Promise<{ midiBytes: Uint8Array; description: string }> {
  const lignes = script.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const cfg: Record<string, string> = {};
  for (const ligne of lignes) {
    const eq = ligne.indexOf("=");
    if (eq < 0) continue;
    const clef = ligne.slice(0, eq).trim().toLowerCase();
    const val = ligne.slice(eq + 1).trim();
    cfg[clef] = val;
  }

  const genre = cfg["genre"] || "pop";
  const tempo = Math.max(40, Math.min(240, parseInt(cfg["tempo"] || "120")));
  const cleNom = cfg["cle"] || cfg["key"] || "C";
  const gammeNom = (cfg["gamme"] || cfg["scale"] || "majeur").toLowerCase();
  const estMineur = gammeNom.includes("min");
  const gammeCourante = estMineur ? DEGRES_MINEUR : DEGRES_MAJEUR;
  const decalage = traduireCle(cleNom);
  const tonalite = estMineur ? `${cleNom} mineur` : `${cleNom} majeur`;

  const instr1 = INSTRUMENTS_GM[cfg["instrument1"] || cfg["instr1"]] ?? (estMineur ? 1 : 0);
  const instr2 = INSTRUMENTS_GM[cfg["instrument2"] || cfg["instr2"]] ?? 33;
  const instr3 = INSTRUMENTS_GM[cfg["instrument3"] || cfg["instr3"]] ?? 12;
  let dureeSec = 30;
  const dureeCfg = cfg["duree"] || cfg["duration"];
  if (dureeCfg) { const nb = parseFloat(dureeCfg); if (!isNaN(nb)) dureeSec = Math.max(4, Math.min(300, nb)); }

  const progressions = PROGRESSIONS_GENRE[genre] || PROGRESSIONS_GENRE["pop"];
  const progression = progressions[0];
  const noire = 60 / tempo;
  const dureeAccord = noire * 2;
  const nbAccords = Math.floor(dureeSec / dureeAccord);
  const notesMel: number[] = [0, 2, 4, 7, 4, 2, 0, 7, 9, 7, 4, 2, 9, 7, 4, 0];

  // Construire le MIDI multi-pistes
  const tpm = 480;
  const microsecParBeat = (60 / tempo) * 1_000_000;
  function secEnTicks(sec: number): number { return Math.round((sec / 60) * tempo * tpm); }

  const pisteAccords: any[] = [
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: instr1 },
  ];
  const pisteBasse: any[] = [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: instr2 },
  ];
  const pisteMelodie: any[] = [
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: instr3 },
  ];
  const pisteBatterie: any[] = [];

  for (let i = 0; i < nbAccords; i++) {
    const debAcc = i * dureeAccord;
    const finAcc = debAcc + dureeAccord;
    const degre = progression[i % progression.length];
    const fonda = 36 + decalage + gammeCourante[degre % gammeCourante.length] + Math.floor(degre / gammeCourante.length) * 12;

    // Accords (piano, notes simultanées)
    const td = secEnTicks(debAcc);
    const tf = secEnTicks(finAcc);
    const tirades = [0, 3, 7];
    for (const itv of tirades) {
      pisteAccords.push({ deltaTime: td, type: "noteOn", channel: 0, noteNumber: fonda + itv, velocity: 70 });
      pisteAccords.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 0, noteNumber: fonda + itv, velocity: 0 });
    }

    // Basse (note fondamentale)
    pisteBasse.push({ deltaTime: td, type: "noteOn", channel: 1, noteNumber: fonda - 12, velocity: 80 });
    pisteBasse.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 1, noteNumber: fonda - 12, velocity: 0 });

    // Mélodie
    const nbNotesMel = Math.floor(dureeAccord / (noire * 0.5));
    for (let n = 0; n < nbNotesMel; n++) {
      const degMel = notesMel[(i * nbNotesMel + n) % notesMel.length];
      const midiMel = 60 + decalage + gammeCourante[degMel % gammeCourante.length] + Math.floor(degMel / gammeCourante.length) * 12;
      const tMelD = secEnTicks(debAcc + n * noire * 0.5);
      const tMelF = secEnTicks(debAcc + n * noire * 0.5 + noire * 0.45);
      pisteMelodie.push({ deltaTime: tMelD, type: "noteOn", channel: 2, noteNumber: midiMel, velocity: 90 });
      pisteMelodie.push({ deltaTime: Math.max(tMelD + 1, tMelF), type: "noteOff", channel: 2, noteNumber: midiMel, velocity: 0 });
    }

    // Batterie (canal 9 = percussions GM)
    for (let b = 0; b < Math.floor(dureeAccord / (noire * 0.25)); b++) {
      const tBat = secEnTicks(debAcc + b * noire * 0.25);
      if (b % 8 === 0) { pisteBatterie.push({ deltaTime: tBat, type: "noteOn", channel: 9, noteNumber: 36, velocity: 100 }); pisteBatterie.push({ deltaTime: tBat + 1, type: "noteOff", channel: 9, noteNumber: 36, velocity: 0 }); }
      if (b % 8 === 4) { pisteBatterie.push({ deltaTime: tBat, type: "noteOn", channel: 9, noteNumber: 38, velocity: 80 }); pisteBatterie.push({ deltaTime: tBat + 1, type: "noteOff", channel: 9, noteNumber: 38, velocity: 0 }); }
      if (b % 2 === 0 || b % 2 === 1) { pisteBatterie.push({ deltaTime: tBat, type: "noteOn", channel: 9, noteNumber: 42, velocity: 60 }); pisteBatterie.push({ deltaTime: tBat + 1, type: "noteOff", channel: 9, noteNumber: 42, velocity: 0 }); }
    }
  }

  // Trier chaque piste par temps absolu puis convertir en deltaTimes
  function trierPiste(events: any[]): any[] {
    events.sort((a, b) => a.deltaTime - b.deltaTime || (a.type === "noteOff" ? 1 : -1));
    let tick = 0;
    const sorted: any[] = [];
    for (const e of events) {
      sorted.push({ ...e, deltaTime: e.deltaTime - tick });
      tick = e.deltaTime;
    }
    sorted.push({ deltaTime: 0, type: "endOfTrack" });
    return sorted;
  }

  const metaEvents = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];
  const piste1 = [...metaEvents, ...trierPiste(pisteAccords)];
  const piste2 = trierPiste(pisteBasse);
  const piste3 = trierPiste(pisteMelodie);
  const piste4 = trierPiste(pisteBatterie);

  const midi = { header: { format: 1 as const, numTracks: 4, ticksPerBeat: tpm }, tracks: [piste1, piste2, piste3, piste4] };
  const bytes = new Uint8Array(writeMidi(midi));

  const descr = [
    `── Script musical ──`,
    `Genre : ${genre}  ·  ${tempo} BPM  ·  ${tonalite}  ·  ${dureeSec}s`,
    `Structure : ${nbAccords} accords × ${dureeAccord.toFixed(1)}s`,
    `Progression : ${progression.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d % 7]).join(" – ")}`,
    `Instruments : Piano · Basse · Marimba · Batterie`,
  ].join("\n");

  return { midiBytes: bytes, description: descr };
}

// ─── Générateur d'accords ───


const ROMAIN_VERS_DEGRE: Record<string, number> = {
  I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6,
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
};


export function genererAccords(
  cleNom: string, gammeNom: string, genreNom: string, progressionPerso: string,
  tempo: number, dureeAccord: number, nbAccords: number,
): { midiBytes: Uint8Array; description: string } {
  const estMineur = gammeNom.toLowerCase().includes("min");
  const gammeCourante = estMineur ? DEGRES_MINEUR : DEGRES_MAJEUR;
  const decalage = traduireCle(cleNom);

  let progression: number[];
  if (genreNom === "personnalisé") {
    progression = progressionPerso.split("-").map((r) => ROMAIN_VERS_DEGRE[r.trim()] ?? 0);
  } else {
    const progressions = PROGRESSIONS_GENRE[genreNom] || PROGRESSIONS_GENRE["pop"];
    progression = progressions[0];
  }

  const noire = 60 / tempo;
  const dureeSecAccord = dureeAccord * noire;
  const tpm = 480;
  const microsecParBeat = (60 / tempo) * 1_000_000;
  function secEnTicks(sec: number): number { return Math.round((sec / 60) * tempo * tpm); }

  const pisteAccords: any[] = [
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: estMineur ? 1 : 0 },
  ];
  const pistePad: any[] = [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 48 },
  ];

  for (let i = 0; i < nbAccords; i++) {
    const deb = i * dureeSecAccord;
    const fin = deb + dureeSecAccord;
    const degre = progression[i % progression.length];
    const fonda = 36 + decalage + gammeCourante[degre % gammeCourante.length] + Math.floor(degre / gammeCourante.length) * 12;
    const td = secEnTicks(deb);
    const tf = secEnTicks(fin);

    // Voicing aéré sur 3 octaves — son plus riche et moins agressif
    const voixAccord = [
      { note: fonda - 12, vel: 90 },        // basse octave -1
      { note: fonda + 7, vel: 65 },          // quinte médium
      { note: fonda + 12 + 3, vel: 60 },     // tierce aiguë
      { note: fonda + 12 + 7, vel: 55 },     // quinte aiguë
      { note: fonda + 24, vel: 50 },         // octave haute
    ];

    for (let vi = 0; vi < voixAccord.length; vi++) {
      const v = voixAccord[vi];
      // Arpège doux : chaque note décalée progressivement de ~15 ms
      const tArp = td + Math.round((vi * 15) * tpm * tempo / 60000);
      pisteAccords.push({ deltaTime: tArp, type: "noteOn", channel: 0, noteNumber: v.note, velocity: v.vel });
      pisteAccords.push({ deltaTime: Math.max(tArp + 1, tf), type: "noteOff", channel: 0, noteNumber: v.note, velocity: 0 });
    }

    // Pad tenu — deux notes espacées
    pistePad.push({ deltaTime: td, type: "noteOn", channel: 1, noteNumber: fonda, velocity: 40 });
    pistePad.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 1, noteNumber: fonda, velocity: 0 });
    pistePad.push({ deltaTime: td, type: "noteOn", channel: 1, noteNumber: fonda + 19, velocity: 35 });
    pistePad.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 1, noteNumber: fonda + 19, velocity: 0 });
  }

  function trierPiste(events: any[]): any[] {
    events.sort((a, b) => a.deltaTime - b.deltaTime || (a.type === "noteOff" ? 1 : -1));
    let tick = 0;
    const sorted: any[] = [];
    for (const e of events) {
      sorted.push({ ...e, deltaTime: e.deltaTime - tick });
      tick = e.deltaTime;
    }
    sorted.push({ deltaTime: 0, type: "endOfTrack" });
    return sorted;
  }

  const metaEvents = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];
  const piste1 = [...metaEvents, ...trierPiste(pisteAccords)];
  const piste2 = trierPiste(pistePad);
  const midi = { header: { format: 1 as const, numTracks: 2, ticksPerBeat: tpm }, tracks: [piste1, piste2] };
  const bytes = new Uint8Array(writeMidi(midi));

  const romain = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const descr = [
    `── Progression d'accords ──`,
    `${cleNom} ${gammeNom} · ${genreNom} · ${tempo} BPM`,
    `${nbAccords} accords × ${dureeAccord}t · ${(nbAccords * dureeSecAccord).toFixed(1)}s`,
    progression.map((d) => romain[d % 7]).join(" – "),
  ].join("\n");

  return { midiBytes: bytes, description: descr };
}

