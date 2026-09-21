// audio/accords.ts — Détection d'accords par chromagramme fenêtré.
// Pour chaque fenêtre temporelle, calcule un vecteur chroma (12 classes de
// hauteur) et le compare à des templates d'accords (majeur, mineur, 7ᵉ, mineur
// 7ᵉ, diminué, sus2, sus4) par corrélation. Renvoie la progression d'accords.

import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

const NOMS_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Profils Krumhansl–Kessler simplifiés (classe 0 = tonique). Utilisés pour
// l'estimation de la tonalité globale d'un morceau.
const PROFIL_MAJEUR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PROFIL_MINEUR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

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
  if (n < 8) return Array.from({ length: 12 }, () => 0);
  const re = new Float64Array(taille);
  const im = new Float64Array(taille);
  for (let i = 0; i < n; i++) re[i] = donnees[debut + i] * (fen[i] ?? 1);
  fft(re, im, false);

  const nbBins = Math.floor(taille / 2);
  const chroma = Array.from({ length: 12 }, () => 0);
  for (let b = 1; b < nbBins; b++) {
    const mag = Math.hypot(re[b], im[b]);
    const freq = (b * sr) / taille;
    if (freq < 65 || freq > 8000) continue;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag;
  }

  // MAGNITUDES BRUTES, sans normaliser la fenêtre par son maximum.
  //
  // La normalisation était ici, et elle coûtait cher à l'estimation de tonalité :
  // celle-ci SOMME les fenêtres, si bien qu'un accord tenu fort et une résonance
  // à peine audible pesaient pareil. Or les profils de Krumhansl décrivent une
  // HIÉRARCHIE de notes — c'est elle qui distingue une tonalité de sa relative,
  // les deux partageant leurs sept notes — et l'égalisation des fenêtres
  // l'aplatissait. Mesuré : la même suite d'accords, la fondamentale renforcée
  // comme le ferait une basse, se lisait « C major » en normalisant et
  // « A minor » sans.
  //
  // La détection d'accords, elle, n'en est pas affectée : `meilleurAccord`
  // compare par similarité cosinus, qui est invariante d'échelle. Vérifié dans
  // l'app avant d'y toucher plutôt que déduit — les 32 accords détectés sur un
  // Groove Box sont identiques, au nom et à l'instant près.
  return chroma;
}

/** Ramène un chroma à un maximum de 1. */
function normaliserChroma(chroma: number[]): number[] {
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
  // La meilleure corrélation du segment en cours : écrite avec lui quand il se termine.
  let confianceCourante = 0;

  for (let f = 0; f < nbFenetres; f++) {
    const debut = f * hop;
    const fin = Math.min(debut + fftTaille, length);
    if (fin - debut < 1024) continue;

    // La détection d'accords garde la normalisation par fenêtre, contrairement à
    // l'estimation de tonalité : `meilleurAccord` compare par similarité cosinus,
    // invariante d'échelle, donc la retirer ici ne gagnerait rien et ne ferait que
    // déplacer les arrondis. Le changement ne devait profiter qu'à l'estimation de
    // tonalité, qui SOMME les fenêtres.
    //
    // Un avertissement pour qui voudrait comparer deux listes d'accords : sur un
    // Groove Box, elles ne sont pas comparables. Deux rendus de la MÊME graine
    // donnent 31 et 32 accords avec 26 différences, les voix de batterie
    // `NoiseSynth` tirant du bruit aléatoire à chaque rendu. Une première version
    // de ce commentaire imputait justement un tel écart au changement de chroma —
    // c'était cette variation, pas le changement.
    const chroma = normaliserChroma(chromaFenetre(mono, debut, fftTaille, sr));
    const { root, typeIdx, corr } = meilleurAccord(chroma);
    const t = debut / sr;

    if (accordPrec && (accordPrec.root !== root || accordPrec.typeIdx !== typeIdx)) {
      const tpl = TEMPLATES[accordPrec.typeIdx];
      resultats.push({
        temps: debutAccord,
        duree: t - debutAccord,
        nom: `${NOMS_NOTES[accordPrec.root]} ${tpl.nom}`,
        nomEn: `${NOMS_NOTES[accordPrec.root]}${tpl.nomEn}`,
        confiance: confianceCourante,
      });
      accordPrec = { root, typeIdx };
      debutAccord = t;
      confianceCourante = 0;
    } else if (!accordPrec) {
      accordPrec = { root, typeIdx };
      debutAccord = t;
    }

    // La confiance du segment en cours. Elle cherchait le segment dans la liste des résultats, où il
    // n'est écrit qu'à sa fin : la recherche échouait toujours, et toute confiance valait 0.
    confianceCourante = Math.max(confianceCourante, corr);

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
      confiance: confianceCourante,
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

export interface TonaliteEstimee {
  nom: string;
  type: "major" | "minor";
  confiance: number;
}

// Estime la tonalité globale d'un morceau par comparaison du chromagramme moyen
// avec les profils Krumhansl–Kessler (majeur / mineur). Teste les 12 toniques.
export function estimerTonalite(buffer: AudioBuffer): TonaliteEstimee {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;

  const mono = new Float64Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

  const fftTaille = 8192;
  const hop = fftTaille / 4;
  const nbFenetres = Math.max(1, Math.floor((length - fftTaille) / hop));
  const chromaGlobal = new Float64Array(12);

  // Les fenêtres s'additionnent en MAGNITUDES BRUTES : un passage fort compte
  // pour ce qu'il vaut, et la hiérarchie des notes — ce que les profils de
  // Krumhansl mesurent — survit à la somme. Voir chromaFenetre.
  for (let f = 0; f < nbFenetres; f++) {
    const chroma = chromaFenetre(mono, f * hop, fftTaille, sr);
    for (let i = 0; i < 12; i++) chromaGlobal[i] += chroma[i];
  }

  // La normalisation finale reste, mais elle est sans effet sur le résultat : la
  // corrélation de Pearson est invariante par changement d'échelle. Elle n'est
  // gardée que pour que le vecteur reste lisible en débogage.
  const max = Math.max(...chromaGlobal, 1e-10);
  const chromaNorm: number[] = Array.from(chromaGlobal).map((v) => v / max);
  const { tonique, type, confiance } = tonaliteDepuisChroma(chromaNorm);
  return { nom: `${NOMS_NOTES[tonique]} ${type}`, type, confiance };
}

export type TonaliteChroma = {
  /** Classe de hauteur de la tonique, 0 = do. */
  tonique: number;
  type: "major" | "minor";
  confiance: number;
  /** Écart avec le second candidat : petit, la tonalité est ambiguë. */
  marge: number;
};

/**
 * Krumhansl-Schmuckler sur un chroma quelconque : les 24 tonalités, le meilleur
 * score et l'écart au second. Partagé entre l'audio (chromagramme) et le MIDI
 * (durées des notes par classe de hauteur), pour que les deux lectures ne
 * puissent pas diverger.
 */
export function tonaliteDepuisChroma(chroma: number[]): TonaliteChroma {
  const scores: { tonique: number; type: "major" | "minor"; score: number }[] = [];
  for (let tonique = 0; tonique < 12; tonique++) {
    scores.push({ tonique, type: "major", score: correlerProfil(chroma, PROFIL_MAJEUR, tonique) });
    scores.push({ tonique, type: "minor", score: correlerProfil(chroma, PROFIL_MINEUR, tonique) });
  }
  // Tri stable : à score égal, l'ordre d'insertion — majeur avant mineur, do
  // d'abord — départage, comme la boucle qu'il remplace.
  scores.sort((a, b) => b.score - a.score);
  return { tonique: scores[0].tonique, type: scores[0].type, confiance: scores[0].score, marge: scores[0].score - scores[1].score };
}

/**
 * Corrélation de Pearson entre un chroma et un profil de tonalité décalé.
 *
 * CENTRÉE SUR LA MOYENNE, et c'est tout l'enjeu. La fonction calculait une
 * similarité cosinus, c'est-à-dire la même formule **sans le centrage**. Or les
 * deux vecteurs sont strictement positifs : leur produit scalaire est alors
 * dominé par leur composante constante, commune à tous les candidats. Les
 * vingt-quatre tonalités obtenaient de ce fait des scores serrés entre 0,93 et
 * 0,97, et le classement se décidait sur un écart de quelques millièmes —
 * insuffisant pour séparer une tonalité de sa relative, qui partagent leurs sept
 * notes et ne diffèrent que par la HIÉRARCHIE de ces notes. C'est précisément
 * cette hiérarchie que les profils de Krumhansl-Kessler décrivent, et que seul
 * le centrage fait ressortir : la méthode de Krumhansl-Schmuckler est définie
 * avec une corrélation de Pearson, pas avec un cosinus.
 *
 * Conséquence visible du changement : les valeurs de confiance baissent — de
 * l'ordre de 0,6 à 0,8 au lieu de 0,93 à 0,97. Elles ne perdent rien, elles
 * cessent d'être flattées : un score de 0,96 attribué à vingt-quatre candidats
 * à la fois ne renseignait sur aucun.
 */
function correlerProfil(chroma: number[], profil: number[], decalage: number): number {
  let moyChroma = 0, moyProfil = 0;
  for (let i = 0; i < 12; i++) {
    moyChroma += chroma[i];
    moyProfil += profil[i];
  }
  moyChroma /= 12;
  moyProfil /= 12;

  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < 12; i++) {
    const v = chroma[i] - moyChroma;
    const p = profil[(i - decalage + 12) % 12] - moyProfil;
    num += v * p;
    den1 += v * v;
    den2 += p * p;
  }
  if (den1 === 0 || den2 === 0) return -1;
  return num / Math.sqrt(den1 * den2);
}
