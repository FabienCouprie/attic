// audio/analyse.ts — L'analyse d'ensemble : chroma, tonalite, tempo, niveaux.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { creerFenetreHann, tramesDepuisBuffer, noteMidiDeFrequence } from "./commun";
import { traduire } from "../i18n";
import { traduireType } from "./analyse-transcription";
import { mesurerAnalyse, type MesuresAnalyse } from "./analyse-mesures";

// La mesure, et le chromagramme avec elle, vit dans `analyse-mesures.ts` pour passer hors du fil.
export { chromagramme } from "./analyse-mesures";

export interface AnalyseResultat {
  tempo: number;
  tempoConfiance: number;
  tonalites: { debut: number; fin: number; tonalite: string; confiance: number }[];
  mode: "majeur" | "mineur";
  modeConfiance: number;
  songVsInstrumental: "chanson" | "instrumental" | "incertain";
  description: string;
}


const NOMS_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Profils Krumhansl-Kessler (1982)

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Profils Temperley (2001) — optimisés pour la musique populaire

const TEMP_MAJOR = [5.0, 2.0, 3.5, 2.5, 4.5, 4.0, 2.5, 5.0, 2.5, 3.5, 1.5, 4.0];

const TEMP_MINOR = [5.0, 2.5, 3.5, 4.5, 2.5, 4.0, 2.5, 5.0, 3.5, 2.5, 1.5, 4.0];


/**
 * Comme `chromagramme`, mais renvoie un vecteur de 12 classes par trame FFT
 * (~11.6 ms à 44.1 kHz, saut 512) plutôt qu'un seul vecteur agrégé sur tout
 * le signal — nécessaire pour aligner deux pistes trame par trame (DTW), qui
 * a besoin d'une vraie série temporelle, pas d'un résumé. Fonction distincte
 * plutôt que dérivée de `chromagramme` : agréger des vecteurs déjà normalisés
 * par trame donnerait un résultat différent de la normalisation par le
 * maximum global que fait `chromagramme` — les deux doivent rester
 * indépendantes pour ne pas changer son comportement (déjà testé).
 */
// Exporté : un consommateur du chemin d'alignement DTW (ex. un nœud
// d'étirement temporel) a besoin de connaître le pas en échantillons pour
// replacer un indice de trame `i`/`j` sur l'axe temporel — dupliquer cette
// constante ailleurs risquerait de diverger silencieusement si elle change ici.
export const SAUT_TRAME_CHROMAGRAMME = 512;

export function chromagrammeParTrame(donnees: Float32Array, sampleRate: number): number[][] {
  const fftTaille = 2048;
  const saut = SAUT_TRAME_CHROMAGRAMME;
  const fenetre = creerFenetreHann(fftTaille);
  const trames = tramesDepuisBuffer(donnees, fftTaille, saut, fenetre);
  const nbBins = fftTaille / 2 + 1;

  return trames.map((trame) => {
    const chroma = new Array(12).fill(0);
    for (let bin = 1; bin < nbBins; bin++) {
      const mag = Math.sqrt(trame.re[bin] ** 2 + trame.im[bin] ** 2);
      const freq = (bin * sampleRate) / fftTaille;
      if (freq < 65 || freq > 8000) continue;
      const midiNote = noteMidiDeFrequence(freq);
      const pc = ((Math.round(midiNote) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
    const maxTrame = Math.max(...chroma, 1e-10);
    return chroma.map((v) => v / maxTrame);
  });
}


function meilleureCorrelation(chroma: number[], profil: number[]): { shift: number; corr: number } {
  let bestShift = 0;
  let bestCorr = -Infinity;
  for (let shift = 0; shift < 12; shift++) {
    let corr = 0;
    for (let i = 0; i < 12; i++) corr += chroma[(i + shift) % 12] * profil[i];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestShift = shift;
    }
  }
  return { shift: bestShift, corr: bestCorr };
}


/** Le rapport de l'analyse d'ensemble, rédigé sur ce qu'a rendu `mesurerAnalyse`. */
export function decrireAnalyse(m: MesuresAnalyse): AnalyseResultat {
  const { duree, t1, t2, chroma, chroma1, chroma2, ecCent, ecZCR, ecBand } = m;
  const lignes: string[] = [];

  lignes.push(traduire("analyse.tempo"));
  lignes.push(traduire("analyse.rms_autocorr", t1.bpm, (t1.corr * 100).toFixed(0)));
  lignes.push(traduire("analyse.flux_autocorr", t2.bpm, (t2.corr * 100).toFixed(0)));

  const accords = t1.bpm && t2.bpm && Math.abs(t1.bpm - t2.bpm) <= 10;
  const meilleur = t1.corr >= t2.corr ? t1 : t2;
  const tempoFinal = accords ? Math.round((t1.bpm + t2.bpm) / 2) : meilleur.bpm;
  const suffix = accords ? traduire("analyse.accord_methodes") : traduire("analyse.methode_plus_confiante");
  lignes.push(traduire("analyse.retenu", tempoFinal, suffix));

  // ────── TONALITÉ ──────

  function evaluerProfil(profilMaj: number[], profilMin: number[], etiquette: string): string {
    const m = meilleureCorrelation(chroma, profilMaj);
    const n = meilleureCorrelation(chroma, profilMin);
    const r = m.corr >= n.corr
      ? `${traduire("analyse.nom_majeur", NOMS_NOTES[m.shift])} (${(m.corr / 60 * 100).toFixed(0)}%)`
      : `${traduire("analyse.nom_mineur", NOMS_NOTES[n.shift])} (${(n.corr / 60 * 100).toFixed(0)}%)`;
    return traduire("analyse.profil", etiquette, r);
  }

  lignes.push(traduire("analyse.tonalite"));
  const kkGlobal = evaluerProfil(KK_MAJOR, KK_MINOR, "Krumhansl-Kessler");
  const tpGlobal = evaluerProfil(TEMP_MAJOR, TEMP_MINOR, "Temperley");
  lignes.push(`  ${kkGlobal}`);
  lignes.push(`  ${tpGlobal}`);

  const { shift: sMajKK, corr: cMajKK } = meilleureCorrelation(chroma, KK_MAJOR);
  const { shift: sMinKK, corr: cMinKK } = meilleureCorrelation(chroma, KK_MINOR);
  const { shift: sMajTP, corr: cMajTP } = meilleureCorrelation(chroma, TEMP_MAJOR);
  const { shift: sMinTP, corr: cMinTP } = meilleureCorrelation(chroma, TEMP_MINOR);
  const bestKK = cMajKK >= cMinKK
    ? { nom: `${NOMS_NOTES[sMajKK]} majeur`, conf: cMajKK, mineur: false }
    : { nom: `${NOMS_NOTES[sMinKK]} mineur`, conf: cMinKK, mineur: true };
  const bestTP = cMajTP >= cMinTP
    ? { nom: `${NOMS_NOTES[sMajTP]} majeur`, conf: cMajTP, mineur: false }
    : { nom: `${NOMS_NOTES[sMinTP]} mineur`, conf: cMinTP, mineur: true };
  const principale = bestKK.conf >= bestTP.conf ? bestKK : bestTP;

  // Analyse par moitiés avec les deux profils
  function profilermoitie(chr: number[], label: string): string[] {
    const mk = meilleureCorrelation(chr, KK_MAJOR);
    const nk = meilleureCorrelation(chr, KK_MINOR);
    const kk = mk.corr >= nk.corr
      ? traduire("analyse.nom_majeur", NOMS_NOTES[mk.shift])
      : traduire("analyse.nom_mineur", NOMS_NOTES[nk.shift]);
    const mt = meilleureCorrelation(chr, TEMP_MAJOR);
    const nt = meilleureCorrelation(chr, TEMP_MINOR);
    const tp = mt.corr >= nt.corr
      ? traduire("analyse.nom_majeur", NOMS_NOTES[mt.shift])
      : traduire("analyse.nom_mineur", NOMS_NOTES[nt.shift]);
    return [
      traduire("analyse.profil", `${traduire("analyse.kk")}    ${label}`, kk),
      traduire("analyse.profil", `${traduire("analyse.temp")}  ${label}`, tp),
    ];
  }

  lignes.push(traduire("analyse.par_moitiers"));
  lignes.push(...profilermoitie(chroma1, `0–${(duree / 2).toFixed(1)}s`));
  lignes.push(...profilermoitie(chroma2, `${(duree / 2).toFixed(1)}–${duree.toFixed(1)}s`));

  // ────── SONG VS INSTRUMENTAL ──────
  function classer(v: number, seuilHaut: number, seuilBas: number): "chanson" | "instrumental" | "incertain" {
    if (v > seuilHaut) return "chanson";
    if (v > seuilBas) return "incertain";
    return "instrumental";
  }

  const v1 = classer(ecCent, 500, 250);
  const v2 = classer(ecZCR, 0.08, 0.04);
  const v3 = classer(ecBand, 0.2, 0.1);

  lignes.push(traduire("analyse.type"));
  lignes.push(traduire("analyse.centroide", ecCent.toFixed(0), traduireType(v1)));
  lignes.push(traduire("analyse.zcr_taux", ecZCR.toFixed(4), traduireType(v2)));
  lignes.push(traduire("analyse.energie_300_3000", ecBand.toFixed(3), traduireType(v3)));

  const votesChanson = [v1, v2, v3].filter((v) => v === "chanson").length;
  const votesInstru = [v1, v2, v3].filter((v) => v === "instrumental").length;
  const songVsInstrumental: "chanson" | "instrumental" | "incertain" =
    votesChanson >= 2 ? "chanson" : votesInstru >= 2 ? "instrumental" : "incertain";
  lignes.push(traduire("analyse.verdict", traduireType(songVsInstrumental)));

  return {
    tempo: tempoFinal,
    tempoConfiance: Math.min(1, meilleur.corr * 20),
    tonalites: [{ debut: 0, fin: duree, tonalite: `${traduire(principale.mineur ? "analyse.nom_mineur" : "analyse.nom_majeur", principale.nom.split(" ")[0])} (K-K: ${kkGlobal.split(" : ")[1]}, Temp: ${tpGlobal.split(" : ")[1]})`, confiance: principale.conf }],
    mode: principale.mineur ? "mineur" : "majeur",
    modeConfiance: Math.min(1, principale.conf / 60),
    songVsInstrumental,
    description: lignes.join("\n"),
  };
}


/** L'analyse d'ensemble dans le fil : la mesure, puis son rapport. Seul le premier canal est lu. */
export function analyserAudio(buffer: AudioBuffer): AnalyseResultat {
  return decrireAnalyse(mesurerAnalyse({ mono: buffer.getChannelData(0), sampleRate: buffer.sampleRate }));
}


