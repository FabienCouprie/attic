// audio/features-piste.ts — Réduit une piste à un vecteur de features de
// longueur fixe, pour le sous-menu Autres → Algèbre musicale (classification
// d'une collection de pistes par PCA/KMeans/GMM). Purement déterministe à
// partir du buffer : aucune dépendance à d'autres pistes de la collection —
// la standardisation inter-pistes (mise à l'échelle par feature) se fait en
// amont de la PCA, à l'étape suivante, pas ici.

import { analyserAudio, calculerCentroidSpectralMeyda, extraireMFCC, chromagramme } from "./analyse";
import { extraitCentre, mixdownMono } from "./commun";

export interface VecteurFeaturesPiste {
  vecteur: number[];
  /** Une étiquette par composante de `vecteur`, même ordre, même longueur. */
  etiquettes: string[];
}

const NOMS_CHROMA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NB_COEFFS_MFCC_DEFAUT = 13;

// Plafond de durée analysée : au-delà, tempo/chroma/MFCC tournent tous sur un
// extrait plutôt que la piste entière — même convention que les jeux de
// données de classification de genre usuels (GTZAN : extraits de 30 s), qui
// suffisent largement à caractériser tempo/timbre/tonalité d'une piste. Sans
// ce plafond, une collection de plusieurs centaines de pistes de 3-4 min
// devient très lente : chaque analyse (tempo par autocorrélation × 2
// méthodes, chromagramme, MFCC image par image) tourne sur toute la durée.
const DUREE_MAX_ANALYSE_S = 30;

function moyenneEtVariance(valeurs: number[]): { moyenne: number; variance: number } {
  const n = valeurs.length;
  if (n === 0) return { moyenne: 0, variance: 0 };
  const moyenne = valeurs.reduce((a, b) => a + b, 0) / n;
  const variance = valeurs.reduce((a, b) => a + (b - moyenne) ** 2, 0) / n;
  return { moyenne, variance };
}

/**
 * Vecteur à 40 dimensions : tempo (1), centroïde spectral moyen (1),
 * chroma — 12 classes de hauteur (12), moyenne+variance de 13 coefficients
 * MFCC (26). Toujours la même longueur/le même ordre, y compris sur un
 * buffer dégénéré (silence, piste plus courte qu'une fenêtre d'analyse) —
 * dans ce cas les composantes concernées retombent sur 0 plutôt que de
 * planter ou de raccourcir le vecteur.
 */
export function extraireVecteurFeatures(buffer: AudioBuffer): VecteurFeaturesPiste {
  const vecteur: number[] = [];
  const etiquettes: string[] = [];
  const extrait = extraitCentre(buffer, DUREE_MAX_ANALYSE_S);

  const analyse = analyserAudio(extrait);
  vecteur.push(analyse.tempo);
  etiquettes.push("Tempo (BPM)");

  const centroid = calculerCentroidSpectralMeyda(extrait);
  vecteur.push(centroid.valeur);
  etiquettes.push("Centroïde spectral");

  const mono = mixdownMono(extrait);
  const chroma = chromagramme(mono, extrait.sampleRate);
  for (let i = 0; i < 12; i++) {
    vecteur.push(chroma[i] ?? 0);
    etiquettes.push(`Chroma ${NOMS_CHROMA[i]}`);
  }

  const tramesMFCC = extraireMFCC(extrait);
  const nbCoeffs = tramesMFCC[0]?.length ?? NB_COEFFS_MFCC_DEFAUT;
  for (let c = 0; c < nbCoeffs; c++) {
    const serie = tramesMFCC.map((t) => t[c]);
    const { moyenne, variance } = moyenneEtVariance(serie);
    vecteur.push(moyenne);
    etiquettes.push(`MFCC ${c + 1} (moyenne)`);
    vecteur.push(variance);
    etiquettes.push(`MFCC ${c + 1} (variance)`);
  }

  return { vecteur, etiquettes };
}
