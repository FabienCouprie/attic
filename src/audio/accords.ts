// audio/accords.ts — Détection d'accords par chromagramme fenêtré.
// Pour chaque fenêtre temporelle, calcule un vecteur chroma (12 classes de
// hauteur) et le compare à des templates d'accords (majeur, mineur, 7ᵉ, mineur
// 7ᵉ, diminué, sus2, sus4) par corrélation. Renvoie la progression d'accords.

import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

const NOMS_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Templates d'accords : vecteurs binaires de 12 éléments (classes de hauteur).
// Index 0 = fondamentale. Chaque template indique quelles notes appartiennent à
// l'accord (1 = présente, 0 = absente).
const TEMPLATES: { nom: string; nomEn: string; intervalles: number[] }[] = [
  { nom: "maj", nomEn: "maj", intervalles: [0, 4, 7] },
  { nom: "min", nomEn: "min", intervalles: [0, 3, 7] },
  { nom: "7", nomEn: "7", intervalles: [0, 4, 7, 10] },
  { nom: "min7", nomEn: "min7", intervalles: [0, 3, 7, 10] },
  { nom: "maj7", nomEn: "maj7", intervalles: [0, 4, 7, 11] },
  { nom: "dim", nomEn: "dim", intervalles: [0, 3, 6] },
  { nom: "aug", nomEn: "aug", intervalles: [0, 4, 8] },
  { nom: "sus2", nomEn: "sus2", intervalles: [0, 2, 7] },
  { nom: "sus4", nomEn: "sus4", intervalles: [0, 5, 7] },
  { nom: "min7b5", nomEn: "min7b5", intervalles: [0, 3, 6, 10] },
];

// Construit la matrice des templates (72 accords = 12 fondamentales × 10 types).
const TOUS_TEMPLATES: { fondamentale: number; typeIdx: number; vecteur: Float64Array }[] = [];
for (let root = 0; root < 12; root++) {
  for (let t = 0; t < TEMPLATES.length; t++) {
    const v = new Float64Array(12);
    for (const iv of TEMPLATES[t].intervalles) v[(root + iv) % 12] = 1;
    TOUS_TEMPLATES.push({ fondamentale: root, typeIdx: t, vecteur: v });
  }
}

export interface AccordDetecte {
  temps: number;
  duree: number;
  nom: string;
  nomEn: string;
  confiance: number;
}

// Chromagramme pour une fenêtre donnée (mono).
function chromaFenetre(
  donnees: Float32Array | Float64Array,
  debut: number,
  taille: number,
  sr: number,
): number[] {
  const fen = creerFenetreHann(taille);
  const n = Math.min(taille, donnees.length - debut);
  if (n < 8) return new Array(12).fill(0);
  const re = new Float64Array(taille);
  const im = new Float64Array(taille);
  for (let i = 0; i < n; i++) re[i] = donnees[debut + i] * (fen[i] ?? 1);
  fft(re, im, false);

  const nbBins = Math.floor(taille / 2);
  const chroma = new Array(12).fill(0);
  for (let b = 1; b < nbBins; b++) {
    const mag = Math.hypot(re[b], im[b]);
    const freq = (b * sr) / taille;
    if (freq < 65 || freq > 8000) continue;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag;
  }

  const max = Math.max(...chroma, 1e-10);
  return chroma.map((v) => v / max);
}

// Compare un chroma à tous les templates, renvoie le meilleur match.
function meilleurAccord(chroma: number[]): { root: number; typeIdx: number; corr: number } {
  let bestRoot = 0;
  let bestType = 0;
  let bestCorr = -Infinity;

  for (const tpl of TOUS_TEMPLATES) {
    let corr = 0;
    let normTpl = 0;
    let normChr = 0;
    for (let i = 0; i < 12; i++) {
      corr += chroma[i] * tpl.vecteur[i];
      normTpl += tpl.vecteur[i] ** 2;
      normChr += chroma[i] ** 2;
    }
    if (normTpl > 0 && normChr > 0) corr /= Math.sqrt(normTpl * normChr);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestRoot = tpl.fondamentale;
      bestType = tpl.typeIdx;
    }
  }

  return { root: bestRoot, typeIdx: bestType, corr: bestCorr };
}

export function detecterAccords(
  buffer: AudioBuffer,
  tailleFenetreSec: number,
  surProgres?: (pct: number) => void,
): AccordDetecte[] {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;

  // Mix to mono
  const mono = new Float64Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

  const fftTaille = 8192;
  const hop = Math.max(1, Math.round(tailleFenetreSec * sr));
  const nbFenetres = Math.max(1, Math.ceil((length - fftTaille) / hop));

  const resultats: AccordDetecte[] = [];
  let accordPrec: { root: number; typeIdx: number } | null = null;
  let debutAccord = 0;

  for (let f = 0; f < nbFenetres; f++) {
    const debut = f * hop;
    const fin = Math.min(debut + fftTaille, length);
    if (fin - debut < 1024) continue;

    const chroma = chromaFenetre(mono, debut, fftTaille, sr);
    const { root, typeIdx, corr } = meilleurAccord(chroma);
    const t = debut / sr;

    if (accordPrec && (accordPrec.root !== root || accordPrec.typeIdx !== typeIdx)) {
      const tpl = TEMPLATES[accordPrec.typeIdx];
      resultats.push({
        temps: debutAccord,
        duree: t - debutAccord,
        nom: `${NOMS_NOTES[accordPrec.root]} ${tpl.nom}`,
        nomEn: `${NOMS_NOTES[accordPrec.root]}${tpl.nomEn}`,
        confiance: 0,
      });
      accordPrec = { root, typeIdx };
      debutAccord = t;
    } else if (!accordPrec) {
      accordPrec = { root, typeIdx };
      debutAccord = t;
    }

    // Update confidence of the current segment
    if (resultats.length > 0 && resultats[resultats.length - 1].temps === debutAccord) {
      resultats[resultats.length - 1].confiance = Math.max(resultats[resultats.length - 1].confiance, corr);
    }

    surProgres?.(Math.round(((f + 1) / nbFenetres) * 100));
  }

  // Final chord
  if (accordPrec) {
    const tpl = TEMPLATES[accordPrec.typeIdx];
    const tFin = length / sr;
    resultats.push({
      temps: debutAccord,
      duree: tFin - debutAccord,
      nom: `${NOMS_NOTES[accordPrec.root]} ${tpl.nom}`,
      nomEn: `${NOMS_NOTES[accordPrec.root]}${tpl.nomEn}`,
      confiance: 0,
    });
  }

  // Clean up: merge consecutive identical chords and filter very short ones
  const filtres = resultats.filter((a) => a.duree >= 0.1);

  // Format timestamps as M:SS
  return filtres.map((a) => ({
    ...a,
    nom: `${formatTemps(a.temps)} ${a.nom}`,
    nomEn: `${formatTemps(a.temps)} ${a.nomEn}`,
  }));
}

function formatTemps(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function accordsVersTexte(accords: AccordDetecte[], langue: "fr" | "en"): string {
  if (accords.length === 0) return langue === "fr" ? "Aucun accord détecté." : "No chords detected.";
  const lignes = accords.map((a) => {
    const nom = langue === "en" ? a.nomEn : a.nom;
    const conf = Math.round(a.confiance * 100);
    return `${nom} (${a.duree.toFixed(1)}s${conf > 0 ? `, ${conf}%` : ""})`;
  });
  return lignes.join("\n");
}
