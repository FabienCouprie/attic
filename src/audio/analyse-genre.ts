// audio/analyse-genre.ts — Le classement par genre : le modèle, et l'heuristique qui le double.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage, hormis l'entrée du modèle, corrigée le 2026-11-07.

import { creerFenetreHann } from "./commun";
import { fft } from "./fft";
import { traduire } from "../i18n";
import { noteMidiDeFrequence } from "./commun";
import { reechantillonnerCanal } from "./convertir-frequence";

// LE REPLI VERS HUGGINGFACE A ÉTÉ RETIRÉ, et il était contraire à la règle du dépôt : tous les
// modèles viennent de la release `assets`, et aucun nœud ne va les chercher chez un tiers. Celui-ci
// le faisait en silence quand le fichier local manquait, vers un dépôt qui rend 401 depuis le
// 2026-09-22 — un chemin qui ne pouvait donc plus que rater, sans que personne le sache : l'échec
// du `fetch` n'était même pas signalé, le nœud retombant sur son heuristique.
//
// Le modèle se prend désormais comme les autres, par l'icône « Récupérer les modèles IA », et
// `modele_genre.onnx` est au manifeste avec son adresse et son empreinte.


const ETIQUETTES_GENRE = [
  "blues", "classique", "country", "disco", "hip-hop",
  "jazz", "metal", "pop", "reggae", "rock",
];


// LE MODÈLE EST UN HUBERT RÉGLÉ SUR GTZAN (voir `scripts/modeles.cjs`) : il lit la forme d'onde à
// 16 kHz, centrée et réduite comme le fait l'extracteur de HuBERT, et rend dix logits. Il recevait un
// spectrogramme en mels de 128 bandes, aplati en une seule ligne, et ses logits s'affichaient tels
// quels : « metal 400 % » ou « hip-hop 374 % » sur toute la collection de Fabien, le classement
// tombant presque toujours sur metal, hip-hop ou jazz quelle que soit la musique.
const FREQUENCE_MODELE_GENRE = 16000;

/** La forme d'onde qu'attend le modèle : mono à 16 kHz, de moyenne nulle et d'écart type un. */
function ondeDuModele(mono: Float64Array, sr: number): Float32Array {
  const x = reechantillonnerCanal(mono, sr, FREQUENCE_MODELE_GENRE);
  let moyenne = 0;
  for (let i = 0; i < x.length; i++) moyenne += x[i];
  moyenne /= x.length;
  let variance = 0;
  for (let i = 0; i < x.length; i++) variance += (x[i] - moyenne) ** 2;
  const ecart = Math.sqrt(variance / x.length + 1e-7);
  for (let i = 0; i < x.length; i++) x[i] = (x[i] - moyenne) / ecart;
  return x;
}

/** Les logits du modèle en probabilités : un seul genre par morceau, comme dans GTZAN. */
function softmax(logits: Float32Array): number[] {
  const max = Math.max(...logits);
  const e = Array.from(logits, (v) => Math.exp(v - max));
  const somme = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / somme);
}


export interface ResultatGenre { genre: string; confiance: number; description?: string }


export async function classerGenre(buffer: AudioBuffer, dureeAnalyse: number = 30, modeleBuffer?: ArrayBuffer): Promise<ResultatGenre[]> {
  const sr = buffer.sampleRate, nCh = buffer.numberOfChannels;
  const dMax = Math.min(buffer.duration, dureeAnalyse), nb = Math.floor(dMax * sr);
  const mono = new Float64Array(nb);
  for (let i = 0; i < nb; i++) { let s = 0; for (let c = 0; c < nCh; c++) s += buffer.getChannelData(c)[i] / nCh; mono[i] = s; }
  const srC = 22050, r = srC / sr, nbC = Math.floor(nb * r);
  const monoC = new Float64Array(nbC);
  for (let i = 0; i < nbC; i++) {
    const src = i / r, idx = Math.floor(src), frac = src - idx;
    monoC[i] = idx + 1 < nb ? mono[idx] * (1 - frac) + mono[idx + 1] * frac : mono[Math.min(idx, nb - 1)];
  }

  // ── Analyse heuristique (toujours exécutée) ──
  const hopA = 512;
  const nFramesA = Math.max(1, Math.floor(monoC.length / hopA));
  const env = new Float64Array(nFramesA);
  for (let f = 0; f < nFramesA; f++) {
    const off = f * hopA; const n = Math.min(hopA, monoC.length - off);
    let sum = 0; for (let i = 0; i < n; i++) sum += monoC[off + i] ** 2;
    env[f] = Math.sqrt(sum / n);
  }
  const onsets = new Float64Array(nFramesA - 1);
  for (let i = 0; i < nFramesA - 1; i++) onsets[i] = Math.max(0, env[i + 1] - env[i]);

  // Tempo
  function tempoAuto(seq: Float64Array, hop: number): { bpm: number; corr: number } {
    const minL = Math.round(60 * srC / hop / 200), maxL = Math.round(60 * srC / hop / 40);
    let bestL = 0, bestC = 0;
    for (let lag = minL; lag <= Math.min(maxL, Math.floor(seq.length / 2)); lag++) {
      let corr = 0, n = 0;
      for (let i = 0; i + lag < seq.length; i++, n++) corr += seq[i] * seq[i + lag];
      if (n > 0) corr /= n;
      if (corr > bestC) { bestC = corr; bestL = lag; }
    }
    return { bpm: bestL > 0 ? Math.round(60 * srC / hop / bestL) : 0, corr: bestC };
  }
  const t1 = tempoAuto(onsets, hopA);

  // Flux spectral
  const fftFlux = 1024, hopFlux = 512;
  const fenFlux = creerFenetreHann(fftFlux);
  const nbFrFlux = Math.max(0, Math.floor((monoC.length - fftFlux) / hopFlux) + 1);
  const flux = new Float64Array(nbFrFlux);
  const nbBinsFlux = fftFlux / 2 + 1;
  let prevM = new Float64Array(nbBinsFlux);
  for (let f = 0; f < nbFrFlux; f++) {
    const re = new Float64Array(fftFlux), im = new Float64Array(fftFlux);
    for (let i = 0; i < fftFlux; i++) re[i] = monoC[f * hopFlux + i] * fenFlux[i];
    fft(re, im, false);
    let s = 0;
    for (let b = 1; b < nbBinsFlux; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      s += Math.max(0, mag - prevM[b]);
      prevM[b] = mag;
    }
    flux[f] = s / nbBinsFlux;
  }
  const t2 = tempoAuto(flux, hopFlux);
  const accordTempo = t1.bpm && t2.bpm && Math.abs(t1.bpm - t2.bpm) <= 10;
  const tFinal = accordTempo ? Math.round((t1.bpm + t2.bpm) / 2) : (t1.corr >= t2.corr ? t1.bpm : t2.bpm);

  // Chromagramme + tonalité
  const fftC = 2048, hopC = 512;
  const fenC = creerFenetreHann(fftC);
  const nbFrC = Math.max(0, Math.floor((monoC.length - fftC) / hopC) + 1);
  const chroma = new Float64Array(12);
  for (let f = 0; f < nbFrC; f++) {
    const re = new Float64Array(fftC), im = new Float64Array(fftC);
    for (let i = 0; i < fftC; i++) re[i] = monoC[f * hopC + i] * fenC[i];
    fft(re, im, false);
    const nbBinsC = fftC / 2 + 1;
    for (let b = 1; b < nbBinsC; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const freq = (b * srC) / fftC;
      if (freq < 65 || freq > 8000) continue;
      const midi = noteMidiDeFrequence(freq);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
  }
  const maxC = Math.max(...chroma, 1e-10);
  for (let i = 0; i < 12; i++) chroma[i] /= maxC;

  const KK_M = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_m = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function bestKey(c: Float64Array, p: number[]): { s: number; v: number } {
    let bs = 0, bv = -Infinity;
    for (let s = 0; s < 12; s++) { let v = 0; for (let i = 0; i < 12; i++) v += c[(i + s) % 12] * p[i]; if (v > bv) { bv = v; bs = s; } }
    return { s: bs, v: bv };
  }
  const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const kM = bestKey(chroma, KK_M), km = bestKey(chroma, KK_m);
  const cle = kM.v >= km.v ? `${NOMS[kM.s]} majeur` : `${NOMS[km.s]} mineur`;
  const confCle = Math.round(Math.max(kM.v, km.v) / 60 * 100);

  // Centroïde spectral, rolloff, flatness
  const fftS = 2048, hopS = 1024;
  const fenS = creerFenetreHann(fftS);
  const nbFrS = Math.max(0, Math.floor((monoC.length - fftS) / hopS) + 1);
  const nbBinsS = fftS / 2 + 1;
  const centroides: number[] = [], rolloffs: number[] = [], flatness: number[] = [];
  let sumBasse = 0, sumMid = 0, sumAigue = 0;
  const zcrVals: number[] = [];

  for (let f = 0; f < nbFrS; f++) {
    const re = new Float64Array(fftS), im = new Float64Array(fftS);
    for (let i = 0; i < fftS; i++) re[i] = monoC[f * hopS + i] * fenS[i];
    fft(re, im, false);

    let sMag = 0, sFreq = 0;
    let rMag = 0; const rThresh = 0.85;
    let geoMean = 0, ariMean = 0;
    for (let b = 1; b < nbBinsS; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const freq = (b * srC) / fftS;
      sMag += mag; sFreq += freq * mag;
      if (sMag > 0) {
        rMag += mag;
        if (rMag / sMag >= rThresh && rolloffs.length > f - 1 ? f === rolloffs.length : true) {
          if (rolloffs.length <= f) rolloffs.push(freq);
        }
      }
      const magD = Math.max(mag, 1e-10);
      geoMean += Math.log(magD); ariMean += magD;
      if (b > 0) {
        if (freq <= 250) sumBasse += mag;
        else if (freq <= 2000) sumMid += mag;
        else sumAigue += mag;
      }
    }
    if (sMag > 0) centroides.push(sFreq / sMag);
    if (rolloffs.length <= f) rolloffs.push(0);
    const nB = nbBinsS - 1;
    if (ariMean > 0 && geoMean > -Infinity) flatness.push(Math.exp(geoMean / nB) / (ariMean / nB));
  }

  // ZCR frames
  for (let d = 0; d + 1024 <= monoC.length; d += 512) {
    let z = 0;
    for (let i = 1; i < 1024; i++) if ((monoC[d + i] >= 0) !== (monoC[d + i - 1] >= 0)) z++;
    zcrVals.push(z / 1024);
  }

  const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

  const centM = mean(centroides), centS = std(centroides);
  const flatM = mean(flatness);
  const zcrM = mean(zcrVals);
  const rmsM = mean(Array.from(env));

  // Énergie par bande
  const totalE = sumBasse + sumMid + sumAigue + 1e-10;
  const eBasse = sumBasse / totalE, eMid = sumMid / totalE, eAigue = sumAigue / totalE;

  // ── Scoring multi-genre ──
  const scoresGenre: Record<string, number> = {};

  function add(g: string, s: number) { scoresGenre[g] = (scoresGenre[g] || 0) + s; }

  // Énergie / distorsion
  if (rmsM > 0.25) { add("metal", 3); add("hard rock", 2); }
  else if (rmsM > 0.12) { add("rock", 2); add("punk", 1); add("electro", 1); }
  else if (rmsM < 0.03) { add("ambient", 3); add("classique", 1); }

  // Tempo
  if (tFinal > 160) { add("metal", 2); add("drum & bass", 2); add("punk", 1); }
  else if (tFinal > 120) { add("rock", 2); add("house", 2); add("disco", 1); add("pop", 1); }
  else if (tFinal > 90) { add("hip-hop", 2); add("pop", 2); add("rnb", 1); add("reggae", 1); }
  else if (tFinal > 60) { add("jazz", 2); add("blues", 2); add("classique", 1); }
  else { add("ambient", 3); add("classique", 2); add("downtempo", 2); }

  // Centroïde spectral (brillance)
  if (centM > 2000) { add("electro", 2); add("house", 1); add("pop", 1); }
  else if (centM > 1200) { add("rock", 1); add("pop", 1); }
  else if (centM < 800) { add("classique", 2); add("jazz", 2); add("ambient", 1); }

  // Variance centroïde (voix / instrumental)
  if (centS > 600) { add("pop", 2); add("soul", 1); }  // voix
  else if (centS < 200) { add("classique", 2); add("ambient", 1); }  // instrumental stable

  // ZCR (attaque / bruit)
  if (zcrM > 0.3) { add("metal", 2); add("electro", 1); add("rock", 1); }
  else if (zcrM > 0.15) { add("pop", 2); add("rock", 1); add("rnb", 1); }
  else if (zcrM < 0.08) { add("classique", 2); add("ambient", 2); add("jazz", 1); }

  // Platitude spectrale (tonalité spectrale)
  if (flatM < 0.3) { add("classique", 2); add("jazz", 2); add("blues", 1); }  // tonal
  else if (flatM > 0.6) { add("metal", 2); add("electro", 1); add("noise", 1); }  // bruité

  // Énergie basses
  if (eBasse > 0.4) { add("hip-hop", 3); add("dubstep", 2); add("drum & bass", 2); add("reggae", 1); }
  else if (eBasse > 0.25) { add("rock", 1); add("house", 1); add("pop", 1); }
  else if (eBasse < 0.12) { add("classique", 2); add("ambient", 1); }

  // Énergie aiguës
  if (eAigue > 0.35) { add("metal", 2); add("electro", 1); }
  else if (eAigue > 0.2) { add("pop", 1); add("rock", 1); }

  // Tonalité → genres
  if (cle.includes("mineur")) { add("blues", 2); add("classique", 1); add("jazz", 1); }

  // ── Description textuelle ──
  const isMineur = cle.includes("mineur");
  const noteCle = cle.split(" ")[0];
  const descr: string[] = [];
  descr.push(traduire("analyse.caracteristiques"));
  descr.push(traduire("analyse.tempo_label", tFinal > 0 ? `${tFinal} BPM` : traduire("analyse.non_detecte")));
  descr.push(traduire("analyse.tonalite_label", traduire(isMineur ? "analyse.nom_mineur" : "analyse.nom_majeur", noteCle), confCle));
  descr.push(traduire("analyse.energie_rms", (rmsM * 1000).toFixed(0)));
  descr.push(traduire("analyse.centroide_label", centM.toFixed(0), centS.toFixed(0)));
  descr.push(traduire("analyse.zcr_moyen", (zcrM * 100).toFixed(1)));
  descr.push(traduire("analyse.platitude", (flatM * 100).toFixed(0)));
  descr.push("");
  descr.push(traduire("analyse.repartition"));
  descr.push(traduire("analyse.graves", (eBasse * 100).toFixed(0)));
  descr.push(traduire("analyse.mediums", (eMid * 100).toFixed(0)));
  descr.push(traduire("analyse.aigus", (eAigue * 100).toFixed(0)));

  // ── Essai ONNX pour les étiquettes de genre ──
  let genresOnnx: { genre: string; score: number }[] | null = null;
  let erreurOnnx = "";
  if (nb > 0) {
    try {
      const ort = await import("onnxruntime-web");
      // SANS MODÈLE LOCAL, ON NE CHERCHE PLUS AILLEURS : on le dit et l'on retombe sur
      // l'heuristique, ce que la suite fait déjà quand la session échoue.
      if (!modeleBuffer) throw new Error(traduire("msg.classification_modele_absent"));
      const sess = await ort.InferenceSession.create(new Uint8Array(modeleBuffer), { executionProviders: ["wasm"] });
      // LE MODÈLE REÇOIT LA FORME D'ONDE, ET REND DES LOGITS. Il déclare une seule entrée,
      // `input_values` de forme [lot, longueur], et une sortie, `logits`, sur dix genres. Il recevait un
      // spectrogramme en mels aplati, lu comme une forme d'onde, et ses logits s'affichaient comme des
      // probabilités : « metal 400 % » ou « hip-hop 374 % » sur toute la collection de Fabien, relevé
      // le 2026-11-07. Il reçoit maintenant ce que son extracteur lui donnait à l'entraînement.
      const onde = ondeDuModele(mono, sr);
      const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", onde, [1, onde.length]) });
      const probabilites = softmax(out[sess.outputNames[0]].data as Float32Array);
      const nC = probabilites.length;
      const scoresOnnx: { idx: number; score: number }[] = [];
      for (let i = 0; i < nC; i++) scoresOnnx.push({ idx: i, score: probabilites[i] });
      scoresOnnx.sort((a, b) => b.score - a.score);
      const mL = Math.min(nC, ETIQUETTES_GENRE.length) - 1;
      genresOnnx = scoresOnnx.slice(0, 5).map((s) => ({
        genre: s.idx <= mL ? ETIQUETTES_GENRE[s.idx] : `#${s.idx}`,
        score: s.score,
      }));
    } catch (e: any) { erreurOnnx = e.message || String(e); }
  }

  let genres: { genre: string; confiance: number }[];
  if (genresOnnx && genresOnnx.length > 0) {
    genres = genresOnnx.map((g) => ({ genre: g.genre, confiance: g.score }));
    descr.push("");
    descr.push(traduire("msg.genres_modele_onnx"));
    descr.push(genres.slice(0, 3).map((g) => `${g.genre} (${Math.round(g.confiance * 100)}%)`).join(" · "));
  } else {
    const scSorted = Object.entries(scoresGenre).map(([g, s]) => ({ genre: g, score: s })).sort((a, b) => b.score - a.score);
    const scTotal = scSorted.reduce((s, v) => s + v.score, 0);
    genres = scSorted.slice(0, 5).map((s) => ({ genre: s.genre, confiance: scTotal > 0 ? s.score / scTotal : 0 }));
    descr.push("");
    // LA RAISON SE DIT DANS TOUS LES CAS, et non seulement quand un modèle avait été fourni.
    // L'ancienne condition taisait précisément le cas le plus fréquent : modèle absent, repli
    // réseau raté, heuristique rendue sans que rien n'explique pourquoi.
    if (erreurOnnx) {
      descr.push(traduire("msg.genres_onnx_echou"));
      descr.push(traduire("msg.erreur_var_0", erreurOnnx));
    }
    descr.push(traduire("msg.genres_heuristiques"));
    descr.push(genres.map((g) => `${g.genre} (${Math.round(g.confiance * 100)}%)`).join(" · "));
  }

  return [{ genre: genres[0]?.genre || traduire("msg.inconnu"), confiance: genres[0]?.confiance || 0, description: descr.join("\n") }];
}

// ─── Générateur musical par script descriptif ───


