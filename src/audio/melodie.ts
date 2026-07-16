// audio/melodie.ts — Séquenceur mélodique synthétisé (piano-roll pas-à-pas).
// Grille : NB_RANGEES lignes (notes de la gamme, du grave en bas au aigu en
// haut) × N pas. Chaque cellule active déclenche une note synthétisée
// (oscillateur + enveloppe). Le motif est encodé comme celui du séquenceur de
// batterie : lignes séparées par « | », chaque pas « 1 »/« 0 ».

export const NB_RANGEES_MELO = 13; // ~2 octaves de la gamme + 1 note

const GAMMES: Record<string, number[]> = {
  "majeur": [0, 2, 4, 5, 7, 9, 11],
  "mineur": [0, 2, 3, 5, 7, 8, 10],
  "pentatonique majeur": [0, 2, 4, 7, 9],
  "pentatonique mineur": [0, 3, 5, 7, 10],
  "blues": [0, 3, 5, 6, 7, 10],
};

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function intervallesGamme(nom: string): number[] {
  return GAMMES[nom] ?? GAMMES["majeur"];
}

// Calcule le numéro de note MIDI pour la rangée r (0 = grave, NB_RANGEES-1 = aigu).
export function noteMidiPourRangee(
  r: number,
  cle: string,
  gamme: string,
  octave: number,
): number {
  const intervals = intervallesGamme(gamme);
  const degre = r % intervals.length;
  const octDecal = Math.floor(r / intervals.length);
  const cleIdx = NOTES.indexOf(cle);
  return (octave + 1) * 12 + (cleIdx >= 0 ? cleIdx : 0) + intervals[degre] + octDecal * 12;
}

export function frequenceNoteMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Nom lisible d'une note pour l'étiquette de rangée (ex. "C4", "F#3").
export function nomNotePourRangee(
  r: number,
  cle: string,
  gamme: string,
  octave: number,
): string {
  const midi = noteMidiPourRangee(r, cle, gamme, octave);
  const nom = NOTES[midi % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${nom}${oct}`;
}

export function decoderMotifMelodique(motif: string, nbRangees: number, nbPas: number): boolean[][] {
  const lignes = (motif || "").split("|");
  const g: boolean[][] = [];
  for (let r = 0; r < nbRangees; r++) {
    const s = lignes[r] ?? "";
    const row: boolean[] = [];
    for (let c = 0; c < nbPas; c++) row.push(s[c] === "1");
    g.push(row);
  }
  return g;
}

export function encoderMotifMelodique(grille: boolean[][]): string {
  return grille.map((row) => row.map((b) => (b ? "1" : "0")).join("")).join("|");
}

export async function rendreSequenceurMelodique(
  grille: boolean[][], // [rangée 0..NB_RANGEES-1][pas 0..nbPas-1] — 0 = grave
  cle: string,
  gamme: string,
  octave: number,
  timbre: string,
  tempo: number,
  nbPas: number,
  swing: number,
  mesures: number,
  volume: number,
): Promise<AudioBuffer> {
  const sr = 44100;
  const stepDur = ((60 / Math.max(1, tempo)) * 4) / Math.max(1, nbPas);
  const totalPas = Math.max(1, mesures) * nbPas;
  const duree = totalPas * stepDur + 0.5;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * sr), sr);
  const v = Math.max(0, Math.min(1, volume / 100));

  const typeOsc: OscillatorType = timbre === "Carré" ? "square"
    : timbre === "Scie" ? "sawtooth"
    : timbre === "Sinus" ? "sine"
    : "triangle";

  function jouerNote(midi: number, debut: number, dureeNote: number) {
    const freq = frequenceNoteMidi(midi);
    const gVol = v * 0.25;

    // Oscillateur principal
    const osc = offline.createOscillator();
    osc.type = typeOsc;
    osc.frequency.value = freq;
    const g = offline.createGain();
    const t0 = debut;
    const t1 = t0 + Math.min(dureeNote, stepDur * 0.9);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gVol, t0 + 0.008);
    g.gain.setValueAtTime(gVol, t1 - 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t1);
    osc.connect(g);
    g.connect(offline.destination);
    osc.start(t0);
    osc.stop(t1 + 0.05);

    // Panner stéréo subtil selon la hauteur (aigu → droite, grave → gauche)
    const pan = offline.createStereoPanner();
    pan.pan.value = Math.max(-0.5, Math.min(0.5, (midi - 60) / 48));
    g.disconnect(offline.destination);
    g.connect(pan);
    pan.connect(offline.destination);
  }

  for (let pas = 0; pas < totalPas; pas++) {
    const s = pas % nbPas;
    let t = pas * stepDur;
    if (s % 2 === 1) t += (swing / 100) * stepDur * 0.6;

    for (let r = 0; r < NB_RANGEES_MELO; r++) {
      if (grille[r]?.[s]) {
        const midi = noteMidiPourRangee(r, cle, gamme, octave);
        jouerNote(midi, t, stepDur);
      }
    }
  }

  const rendu = await offline.startRendering();
  // Longueur musicale exacte (sans les 0,5 s de silence de fin) + repli de la
  // queue de décroissance sur le début → bouclage sans couture (cf. batterie).
  const barLen = Math.round(totalPas * stepDur * sr);
  if (barLen >= rendu.length) return rendu;
  const out = new AudioBuffer({ numberOfChannels: rendu.numberOfChannels, length: barLen, sampleRate: sr });
  for (let c = 0; c < rendu.numberOfChannels; c++) {
    const src = rendu.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, barLen));
    for (let i = barLen; i < src.length; i++) dst[i - barLen] += src[i];
  }
  return out;
}
