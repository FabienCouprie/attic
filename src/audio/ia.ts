import * as ort from "onnxruntime-web";
import { fft } from "./fft";
import { fenetreHann } from "./stft";

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

// LE WASM EST CELUI DU PAQUET, servi par l'application, et non celui de jsdelivr. Relevé le
// 2026-11-06 au banc, `HORS_LIGNE=1` : « Débruitage IA » et le séparateur MDX échouaient sur « no
// available backend found », la seule requête coupée étant `ort-wasm-simd-threaded.jsep.mjs` sur
// jsdelivr. Le paquet par défaut (`ort.bundle.min.mjs`) porte son code de liaison et ne demande que
// ce wasm ; `new URL` le fait émettre par Vite à la construction, sous le même nom haché que celui
// que la construction émettait déjà. Ce module ne tourne plus que dans `inference-onnx-worker.ts`.
ort.env.wasm.wasmPaths = {
  wasm: new URL("../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm", import.meta.url).href,
};
ort.env.wasm.numThreads = 1;

const sessionCache = new Map<string, ort.InferenceSession>();

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
  if (cleCache) sessionCache.set(cleCache, session);
  return session;
}

/**
 * Un mélange vu par ses canaux, et les pistes séparées de même, canal par canal.
 *
 * DES TABLEAUX ET NON DES `AudioBuffer` : ce calcul tourne dans un worker, où `AudioBuffer` n'existe
 * pas. C'est l'appelant, dans la page, qui en refait des sons à la fréquence de l'entrée.
 */
export interface Melange { canaux: Float32Array[] }
export interface ResultatSeparation {
  voix: Float32Array[] | null;
  autre: Float32Array[] | null;
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

// ─── STFT / iSTFT CENTRÉES, comme `torch.stft(center=True)` ───
//
// POURQUOI CENTRÉES, ET C'ÉTAIT LE DÉFAUT. Les trames commençaient au premier échantillon du
// segment, si bien que ses bords n'étaient couverts que par la pointe d'une seule fenêtre. Or la
// synthèse divise par la somme des fenêtres au carré : aux bords, cette somme tend vers zéro, et un
// spectre qui n'est pas EXACTEMENT celui d'un signal — ce que rend tout modèle — y était multiplié
// par des dizaines de milliers. Relevé au banc le 2026-11-06, la sortie « Voix » du séparateur :
// crête 3 948 sur le son d'essai, +30 dB dans la première demi-seconde du son de référence et −60 dB
// ensuite. Centrées, les trames débordent d'une demi-fenêtre de chaque côté, prolongée en miroir, et
// la somme des fenêtres reste au-dessus de 1,25 sur tout ce qu'on garde.

const N_FFT = 4096;
const HOP = 1024;
const NB_BINS = N_FFT / 2;
/** La demi-fenêtre dont chaque segment est prolongé de chaque côté. */
const BORD = N_FFT / 2;

/** Hann périodique : celle de l'entraînement (`torch.hann_window`). */
const FENETRE = fenetreHann(N_FFT);

/** Le segment prolongé de `BORD` échantillons de chaque côté, en miroir (`pad_mode="reflect"`). */
function prolongerEnMiroir(x: Float32Array): Float64Array {
  const n = x.length;
  const p = new Float64Array(n + 2 * BORD);
  for (let i = 0; i < p.length; i++) {
    let j = i - BORD;
    if (j < 0) j = -j;
    else if (j >= n) j = 2 * (n - 1) - j;
    p[i] = x[j];
  }
  return p;
}

function stft(audio: Float32Array): { real: Float64Array; imag: Float64Array; nframes: number } {
  const p = prolongerEnMiroir(audio);
  const nframes = Math.floor((p.length - N_FFT) / HOP) + 1;
  const r = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const nbValeurs = nframes * NB_BINS;
  const realOut = new Float64Array(nbValeurs);
  const imagOut = new Float64Array(nbValeurs);

  for (let f = 0; f < nframes; f++) {
    const offset = f * HOP;
    im.fill(0);
    for (let i = 0; i < N_FFT; i++) r[i] = p[offset + i] * FENETRE[i];
    fftAvant(r, im);
    const dst = f * NB_BINS;
    for (let b = 0; b < NB_BINS; b++) {
      realOut[dst + b] = r[b];
      imagOut[dst + b] = im[b];
    }
  }
  return { real: realOut, imag: imagOut, nframes };
}

/** Le signal de `longueur` échantillons dont `real`/`imag` sont les trames centrées. */
function istft(real: Float64Array, imag: Float64Array, nframes: number, longueur: number): Float32Array {
  const total = longueur + 2 * BORD;
  const out = new Float64Array(total);
  const norm = new Float64Array(total);
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
      if (pos < total) {
        out[pos] += r[i] * FENETRE[i];
        norm[pos] += FENETRE[i] * FENETRE[i];
      }
    }
  }

  const result = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) {
    const k = BORD + i;
    result[i] = norm[k] > 1e-10 ? out[k] / norm[k] : 0;
  }
  return result;
}

// ─── Traitement MDX-Net (spectrogramme, segments de ~5,9 s) ───
//
// LA DÉCOUPE EST CELLE DE L'ENTRAÎNEMENT DU MODÈLE (UVR, `ConvTDFNet`) : un segment de
// `HOP × (256 − 1)` échantillons donne les 256 trames centrées que le modèle attend, et l'on n'en
// garde que le cœur, une demi-fenêtre retirée de chaque côté. Le segment suivant reprend exactement
// là où le cœur s'arrête : chaque échantillon rendu a donc son contexte entier, et deux segments se
// touchent sans fondu. L'ancienne découpe fondait des segments dont la fin, prise à plein poids,
// portait le défaut des bords.

const MDX_TRAMES = 256;
const MDX_SEGMENT = HOP * (MDX_TRAMES - 1);
const MDX_COEUR = MDX_SEGMENT - 2 * BORD;

async function traiterMdx(
  mix: Melange,
  session: ort.InferenceSession,
  surProgres?: (pct: number) => void
): Promise<ResultatSeparation> {
  const longueur = mix.canaux[0].length;
  const ch0 = mix.canaux[0];
  const ch1 = mix.canaux[1] ?? ch0;
  const nbSegments = Math.max(1, Math.ceil(longueur / MDX_COEUR));
  const voix = [new Float32Array(longueur), new Float32Array(longueur)];
  const autre = [new Float32Array(longueur), new Float32Array(longueur)];
  const nomEntree = session.inputNames[0];

  for (let s = 0; s < nbSegments; s++) {
    // Le segment commence une demi-fenêtre avant le cœur qu'il rend ; hors du mélange, des zéros.
    const debut = s * MDX_COEUR - BORD;
    const bufCh0 = new Float32Array(MDX_SEGMENT);
    const bufCh1 = new Float32Array(MDX_SEGMENT);
    for (let i = 0; i < MDX_SEGMENT; i++) {
      const pos = debut + i;
      if (pos >= 0 && pos < longueur) {
        bufCh0[i] = ch0[pos];
        bufCh1[i] = ch1[pos];
      }
    }

    const s0 = stft(bufCh0);
    const s1 = stft(bufCh1);
    const nf = Math.min(s0.nframes, MDX_TRAMES);

    // Le tenseur d'entrée est [1, 4, dim_f=NB_BINS, dim_t=MDX_TRAMES] en
    // ordre C : l'axe fréquence (b) est AVANT l'axe temps (f). L'ancienne
    // version écrivait dans l'ordre inverse (f puis b), ce qui transposait
    // fréquence et temps et donnait un spectrogramme incohérent au modèle.
    const entree = new Float32Array(4 * NB_BINS * MDX_TRAMES);
    for (let f = 0; f < nf; f++) {
      for (let b = 0; b < NB_BINS; b++) {
        const idx = f * NB_BINS + b;
        entree[b * MDX_TRAMES + f] = s0.real[idx];
        entree[(1 * NB_BINS + b) * MDX_TRAMES + f] = s0.imag[idx];
        entree[(2 * NB_BINS + b) * MDX_TRAMES + f] = s1.real[idx];
        entree[(3 * NB_BINS + b) * MDX_TRAMES + f] = s1.imag[idx];
      }
    }

    const tenseur = new ort.Tensor("float32", entree, [1, 4, NB_BINS, MDX_TRAMES]);
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

    const voixCh0 = istft(r0Voix, i0Voix, mF, MDX_SEGMENT);
    const voixCh1 = istft(r1Voix, i1Voix, mF, MDX_SEGMENT);

    // SEUL LE CŒUR EST GARDÉ, et il tombe à `s × MDX_COEUR` dans le mélange.
    for (let i = BORD; i < BORD + MDX_COEUR; i++) {
      const pos = debut + i;
      if (pos >= longueur) break;
      voix[0][pos] = voixCh0[i];
      voix[1][pos] = voixCh1[i];
      autre[0][pos] = bufCh0[i] - voixCh0[i];
      autre[1][pos] = bufCh1[i] - voixCh1[i];
    }

    surProgres?.(Math.round(((s + 1) / nbSegments) * 100));
  }

  const garderSiSonore = (piste: Float32Array[]) =>
    piste.some((c) => c.some((v) => Math.abs(v) > 1e-6)) ? piste : null;
  return { voix: garderSiSonore(voix), autre: garderSiSonore(autre) };
}

// ─── Point d'entrée unique ───

/** La voix et le reste d'un mélange, par le modèle MDX-Net de `session`. */
export async function separerAvecSession(
  mix: Melange,
  session: ort.InferenceSession,
  surProgres?: (pct: number) => void,
): Promise<ResultatSeparation> {
  return traiterMdx(mix, session, surProgres);
}
