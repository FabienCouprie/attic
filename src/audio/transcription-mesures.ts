// audio/transcription-mesures.ts — La transcription monophonique, et le tempo qui l'accompagne,
// sans un mot de texte.
//
// TIRÉ D'`analyse-transcription.ts` POUR PASSER HORS DU FIL, comme la mesure de l'analyse
// d'ensemble l'a été d'`analyse.ts` : ce module-là rédige avec `traduire`, qu'un worker ne doit pas
// atteindre. Le calcul est celui d'avant, tel quel ; seule sa lecture change : il reçoit les canaux,
// un worker n'ayant pas de tampon audio, et les mélange lui-même en double précision comme il le
// faisait. `analyse-transcription.ts` garde `transcrireMono`, qui lit un tampon et appelle celle-ci.

import { fft } from "./fft";
import type { Note } from "./note";
import { noteMidiDeFrequence } from "./commun";
import { mesurerAnalyse, type MesuresAnalyse } from "./analyse-mesures";

function trouverPicFFT(
  mono: Float64Array | Float32Array,
  debut: number,
  taille: number,
  sr: number,
  fenetre: Float64Array,
): { frequence: number; ampleur: number; platitude: number } {
  const n = Math.min(taille, mono.length - debut);
  if (n < 4) return { frequence: 0, ampleur: 0, platitude: 1 };
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = mono[debut + i] * (fenetre[i] ?? 1);
  fft(re, im, false);
  const nbBins = Math.floor(n / 2);
  let picBin = -1;
  let picAmp = 0;
  for (let b = 1; b < nbBins; b++) {
    const amp = Math.hypot(re[b], im[b]);
    if (amp > picAmp) { picAmp = amp; picBin = b; }
  }
  if (picBin < 0) return { frequence: 0, ampleur: 0, platitude: 1 };
  // Platitude spectrale (moyenne géométrique / moyenne arithmétique) : proche de
  // 0 pour un son tonal (énergie concentrée sur quelques partiels), proche de 1
  // pour un bruit large bande. C'est ce qui distingue une note d'un coup de
  // batterie — sans ce critère, chaque frappe produisait une note fantôme, le
  // pic FFT d'un spectre de bruit étant purement arbitraire.
  let sommeLog = 0;
  let somme = 0;
  let nb = 0;
  for (let b = 1; b < nbBins; b++) {
    const amp = Math.hypot(re[b], im[b]);
    sommeLog += Math.log(amp + 1e-12);
    somme += amp;
    nb++;
  }
  const platitude = nb > 0 && somme > 0 ? Math.exp(sommeLog / nb) / (somme / nb) : 1;
  const freq = (picBin * sr) / n;
  return { frequence: freq, ampleur: picAmp, platitude };
}


/** La transcription monophonique, sur les canaux d'un son et sa fréquence d'échantillonnage. */
export function transcrireMonoVoies(
  canaux: readonly Float32Array[],
  sr: number,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
): Note[] {
  const nCh = canaux.length;
  const length = canaux[0]?.length ?? 0;
  // La durée du tampon, que l'ancienne lecture prenait à `buffer.duration` : longueur sur fréquence.
  const dureeSon = length / sr;
  const mono = new Float64Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = canaux[c];
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

  const fenetreRMS = Math.max(1, Math.round(sr * 0.01));
  const nbFrames = Math.ceil(length / fenetreRMS);
  const enveloppe = new Float64Array(nbFrames);
  for (let i = 0; i < nbFrames; i++) {
    const debut = i * fenetreRMS;
    const fin = Math.min(debut + fenetreRMS, length);
    let sumSq = 0;
    for (let j = debut; j < fin; j++) sumSq += mono[j] * mono[j];
    enveloppe[i] = Math.sqrt(sumSq / (fin - debut));
  }

  const maxEnv = Math.max(...enveloppe);
  if (maxEnv < 1e-9) return [];
  const seuil = maxEnv * (seuilOnset / 100);
  const seuilSol = maxEnv * 0.02;

  const onsetsSec: number[] = [];
  for (let i = 2; i < nbFrames - 2; i++) {
    if (enveloppe[i] > seuil && enveloppe[i] > enveloppe[i - 1] && enveloppe[i] > enveloppe[i + 1]) {
      if (onsetsSec.length === 0 || (i * fenetreRMS / sr) - onsetsSec[onsetsSec.length - 1] > 0.05) {
        onsetsSec.push((i * fenetreRMS) / sr);
      }
    }
  }
  if (onsetsSec.length === 0) { onsetsSec.push(0); }

  const tailleFFT = 4096;
  const fenetre = new Float64Array(tailleFFT);
  for (let i = 0; i < tailleFFT; i++) fenetre[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (tailleFFT - 1)));

  const notes: Note[] = [];
  const rejets: [number, number][] = [];
  for (let i = 0; i < onsetsSec.length; i++) {
    const tDebut = onsetsSec[i];
    const tFin = i + 1 < onsetsSec.length ? onsetsSec[i + 1] : dureeSon;
    const duree = tFin - tDebut;
    if (duree < 0.04) continue;

    const milieuEch = Math.round(((tDebut + tFin) / 2) * sr);
    const analyseDebut = Math.max(0, milieuEch - tailleFFT / 2);
    const pic = trouverPicFFT(mono, analyseDebut, tailleFFT, sr, fenetre);
    if (pic.ampleur < seuilSol || pic.frequence < 30) continue;
    // Rejette les trames de bruit large bande (percussions, souffle) : leur pic
    // FFT ne correspond à aucune hauteur réelle. On mémorise l'intervalle : une
    // frappe de batterie PAR-DESSUS une note tenue ne doit pas couper la note,
    // seulement empêcher d'inventer une hauteur (cf. fusion plus bas).
    if (pic.platitude > SEUIL_PLATITUDE) { rejets.push([tDebut, tFin]); continue; }

    const noteMidi = Math.round(noteMidiDeFrequence(pic.frequence));
    if (noteMidi < noteMin || noteMidi > noteMax) continue;

    const vel = Math.min(127, Math.round((pic.ampleur / maxEnv) * 127));
    notes.push({ note: noteMidi, velocite: Math.max(1, vel), debut: tDebut, fin: tFin });
  }
  return fusionnerNotesRepetees(notes, 0.06, rejets);
}

// Seuil de platitude spectrale au-delà duquel une trame est jugée bruitée.
// 0,35 laisse passer les instruments harmoniques (typiquement < 0,2) tout en
// écartant les percussions et le souffle (typiquement > 0,5).
const SEUIL_PLATITUDE = 0.35;

// Deux notes identiques et jointives proviennent presque toujours d'une même
// note tenue que la détection d'attaque a coupée en deux (vibrato, tremolo,
// réattaque de l'enveloppe). Les fusionner supprime le fourmillement sans
// perdre d'information musicale.
export function fusionnerNotesRepetees(
  notes: Note[],
  ecartMax = 0.06,
  rejets: [number, number][] = [],
): Note[] {
  if (notes.length < 2) return notes;
  // Un trou entièrement couvert par des intervalles rejetés pour cause de bruit
  // n'est pas un silence musical : c'est une frappe de percussion masquant une
  // note tenue. Sans ce pont, filtrer le bruit hachait chaque note en autant de
  // fragments qu'il y avait de frappes par-dessus.
  const combleParRejet = (debut: number, fin: number): boolean => {
    if (fin <= debut) return true;
    let couvert = 0;
    for (const [rd, rf] of rejets) {
      const a = Math.max(debut, rd);
      const b = Math.min(fin, rf);
      if (b > a) couvert += b - a;
    }
    return couvert >= (fin - debut) * 0.8;
  };
  const tri = [...notes].sort((a, b) => a.debut - b.debut || a.note - b.note);
  const out: Note[] = [];
  for (const n of tri) {
    const prec = out.find((p) => p.note === n.note && n.debut >= p.debut
      && (n.debut - p.fin <= ecartMax || combleParRejet(p.fin, n.debut)));
    if (prec) {
      prec.fin = Math.max(prec.fin, n.fin);
      prec.velocite = Math.max(prec.velocite, n.velocite);
    } else {
      out.push({ ...n });
    }
  }
  return out.sort((a, b) => a.debut - b.debut || a.note - b.note);
}

/** Ce que reçoit le worker du Transcripteur MIDI : les canaux, les réglages, et ce qu'il doit mesurer. */
export interface DemandeTranscription {
  canaux: Float32Array[];
  sampleRate: number;
  seuil: number;
  noteMin: number;
  noteMax: number;
  /** Deviner le tempo, quand le réglage est resté à sa valeur d'origine. */
  tempo: boolean;
  /** Transcrire en monophonique ; le polyphonique, par Basic Pitch, reste dans la page. */
  notes: boolean;
}

export interface MesuresTranscription {
  /** L'analyse d'ensemble dont la page tire le tempo, ou rien si elle n'est pas demandée ou a échoué. */
  analyse: MesuresAnalyse | null;
  notes: Note[] | null;
}

export function mesurerTranscription(d: DemandeTranscription): MesuresTranscription {
  let analyse: MesuresAnalyse | null = null;
  if (d.tempo) {
    // UN ÉCHEC DE L'ANALYSE LAISSE LE TEMPO RÉGLÉ, comme le faisait le composant : le fichier MIDI
    // s'écrit alors à 120, et la transcription n'en dépend pas.
    try { analyse = mesurerAnalyse({ mono: d.canaux[0], sampleRate: d.sampleRate }); } catch { analyse = null; }
  }
  return {
    analyse,
    notes: d.notes ? transcrireMonoVoies(d.canaux, d.sampleRate, d.seuil, d.noteMin, d.noteMax) : null,
  };
}
