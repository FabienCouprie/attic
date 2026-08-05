import * as ort from "onnxruntime-web";
import { fft } from "./audio/fft";

export const TAILLE_TRANCHE = 343980;
export const CHEVAUCHEMENT = 4410;

export const NOMS_STEMS = ["Batterie", "Basse", "Voix", "Autre"] as const;

// Fournisseurs d'exécution réellement disponibles avec l'import par défaut
// d'onnxruntime-web : le backend « wasm » et, via le même module WASM/JSEP,
// « webgpu ». Le backend « webgl » historique n'est PAS enregistré par ce
// bundle (il faudrait un import séparé), d'où son retrait. Chaque option
// inclut « wasm » en repli pour ne jamais échouer si le GPU est indisponible.
const PROVIDERS: Record<string, string[]> = {
  "CPU (WASM)": ["wasm"],
  "GPU (WebGPU)": ["webgpu", "wasm"],
  Auto: ["webgpu", "wasm"],
};

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
ort.env.wasm.numThreads = 1;

const bufferCache = new Map<string, ArrayBuffer>();
const sessionCache = new Map<string, ort.InferenceSession>();

export async function telechargerDepuisUrl(url: string, surProgres?: (pct: number) => void): Promise<ArrayBuffer> {
  const existant = bufferCache.get(url);
  if (existant) return existant;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Impossible de télécharger le modèle (${reponse.status})`);
  const total = Number(reponse.headers.get("content-length") ?? 0);
  if (!total || !reponse.body) {
    const buffer = await reponse.arrayBuffer();
    bufferCache.set(url, buffer);
    return buffer;
  }
  const lecteur = reponse.body.getReader();
  const morceaux: Uint8Array[] = [];
  let recu = 0;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    morceaux.push(value);
    recu += value.length;
    surProgres?.(Math.round((recu / total) * 100));
  }
  const donnees = new Uint8Array(recu);
  let pos = 0;
  for (const m of morceaux) {
    donnees.set(m, pos);
    pos += m.length;
  }
  const buffer = donnees.buffer;
  bufferCache.set(url, buffer);
  return buffer;
}

export async function preparerSession(
  donnees: ArrayBuffer,
  fournisseur: string,
  cleCache?: string
): Promise<ort.InferenceSession> {
  if (cleCache) {
    const existante = sessionCache.get(cleCache);
    if (existante) return existante;
  }
  const providers = PROVIDERS[fournisseur] ?? ["wasm"];
  const options = {
    intraOpNumThreads: 1,
    enableCpuMemArena: false,
    enableMemPattern: false,
    executionMode: "sequential" as const,
    graphOptimizationLevel: "all" as const,
  };
  let session: ort.InferenceSession;
  try {
    session = await ort.InferenceSession.create(donnees, {
      ...options,
      executionProviders: providers,
    });
  } catch (err) {
    // Repli sur le CPU (WASM) si le fournisseur demandé (ex. WebGPU) échoue.
    if (providers.length === 1 && providers[0] === "wasm") throw err;
    session = await ort.InferenceSession.create(donnees, {
      ...options,
      executionProviders: ["wasm"],
    });
  }
  if (cleCache) {
    sessionCache.set(cleCache, session);
    bufferCache.delete(cleCache);
  }
  return session;
}

export interface ResultatSeparation {
  voix: AudioBuffer | null;
  batterie: AudioBuffer | null;
  basse: AudioBuffer | null;
  autre: AudioBuffer | null;
}

// ─── FFT radix-2 (délégation au module partagé) ───

function fftAvant(real: Float64Array, imag: Float64Array): void {
  fft(real, imag, false);
}

function ifft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fft(real, imag, false);
  for (let i = 0; i < n; i++) { real[i] /= n; imag[i] = -imag[i] / n; }
}

// ─── STFT / iSTFT ───

const N_FFT = 4096;
const HOP = 1024;
const NB_BINS = N_FFT / 2;

function hann(len: number): Float64Array {
  const w = new Float64Array(len);
  for (let i = 0; i < len; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)));
  return w;
}

const FENETRE = hann(N_FFT);

function stft(audio: Float32Array): { real: Float64Array; imag: Float64Array; nframes: number } {
  const n = audio.length;
  const nframes = Math.max(1, Math.ceil((n - N_FFT) / HOP) + 1);
  const r = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const nbValeurs = nframes * NB_BINS;
  const realOut = new Float64Array(nbValeurs);
  const imagOut = new Float64Array(nbValeurs);

  for (let f = 0; f < nframes; f++) {
    const offset = f * HOP;
    r.fill(0); im.fill(0);
    for (let i = 0; i < N_FFT; i++) {
      const pos = offset + i;
      r[i] = pos < n ? audio[pos] * FENETRE[i] : 0;
    }
    fftAvant(r, im);
    const dst = f * NB_BINS;
    for (let b = 0; b < NB_BINS; b++) {
      realOut[dst + b] = r[b];
      imagOut[dst + b] = im[b];
    }
  }
  return { real: realOut, imag: imagOut, nframes };
}

function istft(real: Float64Array, imag: Float64Array, nframes: number, longueur: number): Float32Array {
  const out = new Float64Array(longueur);
  const norm = new Float64Array(longueur);
  const r = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);

  for (let f = 0; f < nframes; f++) {
    const src = f * NB_BINS;
    r.fill(0); im.fill(0);
    for (let b = 0; b < NB_BINS; b++) {
      r[b] = real[src + b];
      im[b] = imag[src + b];
    }
    for (let b = 1; b < NB_BINS; b++) {
      r[N_FFT - b] = r[b];
      im[N_FFT - b] = -im[b];
    }
    ifft(r, im);
    const offset = f * HOP;
    for (let i = 0; i < N_FFT; i++) {
      const pos = offset + i;
      if (pos < longueur) {
        out[pos] += r[i] * FENETRE[i];
        norm[pos] += FENETRE[i] * FENETRE[i];
      }
    }
  }

  const result = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) result[i] = norm[i] > 1e-10 ? out[i] / norm[i] : 0;
  return result;
}

// ─── Extraction de stems pour différents formats de modèles ───

function extraireStems(
  tenseur: ort.Tensor,
  tailleTranche: number
): Float32Array[] {
  const d = tenseur.dims;
  const data = tenseur.data as Float32Array;

  if (d.length === 4 && d[1] === 4) {
    const chunk = d[3];
    const canauxSortie = d[2];
    const stems: Float32Array[] = [];
    for (let s = 0; s < 4; s++) {
      const buf = new Float32Array(tailleTranche * 2);
      for (let c = 0; c < Math.min(canauxSortie, 2); c++) {
        const offsetSrc = s * canauxSortie * chunk + c * chunk;
        const offsetDst = c * tailleTranche;
        for (let i = 0; i < tailleTranche; i++) buf[offsetDst + i] = data[offsetSrc + i];
      }
      if (canauxSortie < 2) {
        const src = buf.subarray(0, tailleTranche);
        buf.set(src, tailleTranche);
      }
      stems.push(buf);
    }
    return stems;
  }

  if (d.length === 3) return [data];
  return [];
}

// ─── Traitement Demucs (temps réel, chunk ~7.8s) ───

async function traiterDemucs(
  mix: AudioBuffer,
  session: ort.InferenceSession,
  surProgres?: (pct: number) => void,
  chevauchement?: number
): Promise<ResultatSeparation> {
  const chunk = TAILLE_TRANCHE;
  const chev = chevauchement ?? CHEVAUCHEMENT;
  const nbCanaux = Math.min(2, mix.numberOfChannels);
  const longueur = mix.length;
  const pas = chunk - chev;
  const nbTranches = Math.max(1, Math.ceil((longueur - chev) / pas));

  const accumulateurs: Float64Array[] = NOMS_STEMS.map(() => new Float64Array(longueur));
  const enveloppes: Float64Array[] = NOMS_STEMS.map(() => new Float64Array(longueur));
  const nomEntree = session.inputNames[0];

  for (let t = 0; t < nbTranches; t++) {
    const debut = t * pas;
    const fin = Math.min(debut + chunk, longueur);
    const tailleTranche = fin - debut;

    const donnees = new Float32Array(nbCanaux * chunk);
    for (let c = 0; c < nbCanaux; c++) {
      const ch = mix.getChannelData(c);
      const decalage = c * chunk;
      for (let i = 0; i < tailleTranche; i++) donnees[decalage + i] = ch[debut + i];
    }

    const tenseur = new ort.Tensor("float32", donnees, [1, nbCanaux, chunk]);
    const sorties = await session.run({ [nomEntree]: tenseur });
    const tenseurSortie = sorties[session.outputNames[0]];
    if (!tenseurSortie) continue;

    const stems = extraireStems(tenseurSortie, tailleTranche);

    for (let s = 0; s < Math.min(NOMS_STEMS.length, stems.length); s++) {
      const acc = accumulateurs[s];
      const env = enveloppes[s];
      const valeurs = stems[s];
      for (let c = 0; c < nbCanaux; c++) {
        const decalageCanal = c * tailleTranche;
        for (let i = 0; i < tailleTranche; i++) {
          const pos = debut + i;
          if (pos >= longueur) break;
          const poids = i < chev ? 0.5 * (1 - Math.cos((Math.PI * i) / chev)) : 1;
          acc[pos] += valeurs[decalageCanal + i] * poids;
          env[pos] += poids;
        }
      }
    }
    surProgres?.(Math.round(((t + 1) / nbTranches) * 100));
  }

  return reconstruireStems(accumulateurs, enveloppes, longueur, nbCanaux, mix.sampleRate);
}

// ─── Traitement MDX-Net (spectrogramme, chunk ~5.9s) ───
// Le modèle `UVR_MDXNET_9482` produit un masque de séparation vocale (2 stems).
// Sortie : voix (masque appliqué), autre (mix - voix).

async function traiterMdx(
  mix: AudioBuffer,
  session: ort.InferenceSession,
  surProgres?: (pct: number) => void
): Promise<ResultatSeparation> {
  const longueur = mix.length;
  const nframesModele = 256;
  const tailleTrame = (nframesModele - 1) * HOP + N_FFT;
  const chevauchementTrames = N_FFT;
  const pas = tailleTrame - chevauchementTrames;
  const nbTranches = Math.max(1, Math.ceil((longueur - chevauchementTrames) / pas));

  // Accumulateurs séparés par canal (stéréo) : l'ancienne version additionnait
  // les deux canaux dans un seul accumulateur mono puis dupliquait ce mono sur
  // les deux sorties. L'enveloppe (somme des poids) est commune car les poids
  // de recouvrement sont identiques pour voix/autre et pour les deux canaux.
  const accVoix0 = new Float64Array(longueur);
  const accVoix1 = new Float64Array(longueur);
  const accAutre0 = new Float64Array(longueur);
  const accAutre1 = new Float64Array(longueur);
  const env = new Float64Array(longueur);
  const nomEntree = session.inputNames[0];

  for (let t = 0; t < nbTranches; t++) {
    const debut = t * pas;
    const fin = Math.min(debut + tailleTrame, longueur);
    const tailleTranche = fin - debut;

    const bufCh0 = new Float32Array(tailleTrame);
    const bufCh1 = new Float32Array(tailleTrame);
    const ch0 = mix.getChannelData(0);
    const ch1 = mix.numberOfChannels > 1 ? mix.getChannelData(1) : ch0;
    for (let i = 0; i < tailleTranche; i++) {
      bufCh0[i] = ch0[debut + i];
      bufCh1[i] = ch1[debut + i];
    }

    const s0 = stft(bufCh0);
    const s1 = stft(bufCh1);
    const nf = s0.nframes;
    const nbFramesEffectif = Math.min(nf, nframesModele);

    // Le tenseur d'entrée est [1, 4, dim_f=NB_BINS, dim_t=nframesModele] en
    // ordre C : l'axe fréquence (b) est AVANT l'axe temps (f). L'ancienne
    // version écrivait dans l'ordre inverse (f puis b), ce qui transposait
    // fréquence et temps et donnait un spectrogramme incohérent au modèle.
    const entree = new Float32Array(4 * NB_BINS * nframesModele);
    for (let f = 0; f < nbFramesEffectif; f++) {
      for (let b = 0; b < NB_BINS; b++) {
        const idx = f * NB_BINS + b;
        entree[b * nframesModele + f] = s0.real[idx];
        entree[(1 * NB_BINS + b) * nframesModele + f] = s0.imag[idx];
        entree[(2 * NB_BINS + b) * nframesModele + f] = s1.real[idx];
        entree[(3 * NB_BINS + b) * nframesModele + f] = s1.imag[idx];
      }
    }

    const tenseur = new ort.Tensor("float32", entree, [1, 4, NB_BINS, nframesModele]);
    const sorties = await session.run({ [nomEntree]: tenseur });
    const tenseurSortie = sorties[session.outputNames[0]];
    if (!tenseurSortie) continue;

    // La sortie du modèle est directement le spectrogramme complexe estimé de
    // la voix (4 canaux : [ch0 réel, ch0 imag, ch1 réel, ch1 imag]), et NON un
    // masque : ses valeurs sont à l'échelle d'un spectrogramme, pas bornées à
    // ~1. On la lit donc telle quelle (dans le même ordre C fréquence-puis-temps
    // que l'entrée), sans la multiplier par le mix.
    const sortieData = tenseurSortie.data as Float32Array;
    const mDims = tenseurSortie.dims;
    const mBins = mDims[2];
    const mFrames = mDims[3];
    const mF = Math.min(mFrames, nf);

    const r0Voix = new Float64Array(mF * NB_BINS);
    const i0Voix = new Float64Array(mF * NB_BINS);
    const r1Voix = new Float64Array(mF * NB_BINS);
    const i1Voix = new Float64Array(mF * NB_BINS);

    for (let f = 0; f < mF; f++) {
      for (let b = 0; b < Math.min(mBins, NB_BINS); b++) {
        const dst = f * NB_BINS + b;
        r0Voix[dst] = sortieData[b * mFrames + f];
        i0Voix[dst] = sortieData[(1 * mBins + b) * mFrames + f];
        r1Voix[dst] = sortieData[(2 * mBins + b) * mFrames + f];
        i1Voix[dst] = sortieData[(3 * mBins + b) * mFrames + f];
      }
    }

    const voixCh0 = istft(r0Voix, i0Voix, mF, tailleTrame);
    const voixCh1 = istft(r1Voix, i1Voix, mF, tailleTrame);

    for (let i = 0; i < tailleTranche; i++) {
      const pos = debut + i;
      if (pos >= longueur) break;
      const poids = i < chevauchementTrames ? 0.5 * (1 - Math.cos((Math.PI * i) / chevauchementTrames)) : 1;
      accVoix0[pos] += voixCh0[i] * poids;
      accVoix1[pos] += voixCh1[i] * poids;
      accAutre0[pos] += (bufCh0[i] - voixCh0[i]) * poids;
      accAutre1[pos] += (bufCh1[i] - voixCh1[i]) * poids;
      env[pos] += poids;
    }

    surProgres?.(Math.round(((t + 1) / nbTranches) * 100));
    await yieldToMain();
  }

  const resultat: ResultatSeparation = { voix: null, batterie: null, basse: null, autre: null };
  for (const { c0, c1, nom } of [
    { c0: accVoix0, c1: accVoix1, nom: "voix" as const },
    { c0: accAutre0, c1: accAutre1, nom: "autre" as const },
  ]) {
    let aUnSignal = false;
    const chA = new Float32Array(longueur);
    const chB = new Float32Array(longueur);
    for (let i = 0; i < longueur; i++) {
      const e = env[i];
      chA[i] = e > 1e-6 ? c0[i] / e : 0;
      chB[i] = e > 1e-6 ? c1[i] / e : 0;
      if (Math.abs(chA[i]) > 1e-6 || Math.abs(chB[i]) > 1e-6) aUnSignal = true;
    }
    if (aUnSignal) {
      const buf = new AudioBuffer({ numberOfChannels: 2, length: longueur, sampleRate: mix.sampleRate });
      buf.getChannelData(0).set(chA);
      buf.getChannelData(1).set(chB);
      resultat[nom] = buf;
    }
  }
  return resultat;
}

function reconstruireStems(
  accumulateurs: Float64Array[],
  enveloppes: Float64Array[],
  longueur: number,
  nbCanaux: number,
  sampleRate: number
): ResultatSeparation {
  // Le modèle Demucs (HT) embarqué produit les stems dans l'ordre observé :
  // [batterie, basse, voix, autre].  On corrige le nommage ici pour que
  // resultat.voix contienne bien la voix, resultat.batterie la batterie, etc.
  const resultat: ResultatSeparation = { voix: null, batterie: null, basse: null, autre: null };
  const sortiesNom = ["batterie", "basse", "voix", "autre"] as const;

  for (let s = 0; s < NOMS_STEMS.length; s++) {
    const acc = accumulateurs[s];
    const env = enveloppes[s];
    let aUnSignal = false;
    const canaux: Float32Array[] = [];
    for (let c = 0; c < nbCanaux; c++) {
      const ch = new Float32Array(longueur);
      for (let i = 0; i < longueur; i++) {
        ch[i] = env[i] > 1e-6 ? acc[i] / env[i] : 0;
        if (Math.abs(ch[i]) > 1e-6) aUnSignal = true;
      }
      canaux.push(ch);
    }
    if (aUnSignal) {
      const buf = new AudioBuffer({ numberOfChannels: canaux.length, length: longueur, sampleRate });
      for (let c = 0; c < canaux.length; c++) buf.getChannelData(c).set(canaux[c]);
      resultat[sortiesNom[s]] = buf;
    }
  }
  return resultat;
}

// ─── Point d'entrée unique ───

export async function separerAvecSession(
  mix: AudioBuffer,
  session: ort.InferenceSession,
  surProgres?: (pct: number) => void,
  architecture = "demucs",
  chevauchement?: number
): Promise<ResultatSeparation> {
  if (architecture === "mdx") return traiterMdx(mix, session, surProgres);
  return traiterDemucs(mix, session, surProgres, chevauchement);
}

function yieldToMain(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
