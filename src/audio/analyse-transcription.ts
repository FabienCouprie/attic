// audio/analyse-transcription.ts — Trouver les pics d'un spectre, et en tirer des notes.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { fft } from "./fft";
import type { NoteEvenement } from "./midi-sequence";
import Meyda from "meyda";
import { traduire } from "../i18n";
import type { OptionsCentroidSpectral } from "./analyse-descripteurs";

// LA TABLE DE L'ANALYSE S'ARRÊTE À 16 384, là où celle des effets temporels monte à 65 536. Les deux
// fonctions qui les parcourent portaient le même nom, `tailleFenetreAnalyse`, et rendaient pourtant
// des valeurs différentes au-delà de cette borne. Elles étaient privées chacune dans son fichier, ce
// qui cachait la confusion ; le découpage les a mises face à face dans le baril de `src/audio/`, et
// c'est ce qui l'a révélée. Celle-ci porte donc désormais le nom de ce qu'elle sert.
const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];

// Accepte l'id canonique ("moyenne"/"mediane"/"maximum"), l'ancien libellé
// français ET l'anglais. Le cas « Médiane » était un bug silencieux : son
// `toLowerCase()` vaut « médiane » (avec accent), ne correspondait à aucun cas,
// et repartait tel quel — or le calcul en aval teste `case "mediane"` (sans
// accent) et retombait donc sur la moyenne. Autrement dit, choisir « Médiane »
// en français calculait en réalité une moyenne, alors que « Median » en anglais
// fonctionnait. Les `optionIds` suppriment la cause à la racine ; cette
// tolérance reste nécessaire pour les projets déjà enregistrés.
export function normaliserAggregation(valeur: string): OptionsCentroidSpectral["aggregation"] {
  switch (valeur.trim().toLowerCase()) {
    case "moyenne": case "average": return "moyenne";
    case "mediane": case "médiane": case "median": return "mediane";
    case "maximum": return "maximum";
    default: return "moyenne";
  }
}

export function traduireAggregation(valeur: string): string {
  const map: Record<string, string> = {
    "moyenne": "analyse.aggregation_moyenne",
    "mediane": "analyse.aggregation_mediane",
    "maximum": "analyse.aggregation_maximum",
    "average": "analyse.aggregation_moyenne",
    "median": "analyse.aggregation_mediane",
  };
  return map[valeur.toLowerCase()] ? traduire(map[valeur.toLowerCase()]) : valeur;
}

export function traduireType(valeur: string): string {
  const map: Record<string, string> = {
    "chanson": "analyse.chanson",
    "instrumental": "analyse.instrumental",
    "incertain": "analyse.incertain",
  };
  return map[valeur] ? traduire(map[valeur]) : valeur;
}

export function tailleFenetreAnalyse(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}

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


export function transcrireMono(
  buffer: AudioBuffer,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
): NoteEvenement[] {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float64Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
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

  const notes: NoteEvenement[] = [];
  const rejets: [number, number][] = [];
  for (let i = 0; i < onsetsSec.length; i++) {
    const tDebut = onsetsSec[i];
    const tFin = i + 1 < onsetsSec.length ? onsetsSec[i + 1] : buffer.duration;
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

    const noteMidi = Math.round(69 + 12 * Math.log2(pic.frequence / 440));
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
  notes: NoteEvenement[],
  ecartMax = 0.06,
  rejets: [number, number][] = [],
): NoteEvenement[] {
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
  const out: NoteEvenement[] = [];
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


