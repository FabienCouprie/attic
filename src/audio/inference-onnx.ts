// audio/inference-onnx.ts — Ce que le worker d'inférence ONNX calcule, et que la page ne calcule plus.
//
// POURQUOI HORS DU FIL. Relevé au banc le 2026-11-06, dans le fil de l'interface : le séparateur
// MDX-Net gelait la page 9 811 ms d'un bloc sur trois secondes de son, et « Débruitage IA » 769 ms.
// `session.run` d'onnxruntime-web calcule dans le fil qui l'appelle quand le mandataire (`proxy`)
// n'est pas armé, et `numThreads = 1` n'y change rien. Tout ce qui touche une session vit donc ici,
// derrière `workers/inference-onnx-worker.ts` ; la page n'envoie que des octets et des échantillons.
//
// LE MÊME CALCUL QUE CELUI QUI TOURNAIT DANS LA PAGE, déplacé et non réécrit : la boucle de trames
// de GTCRN est celle de `plugins/debruitage-ia.ts`, la séparation celle d'`ia.ts`. Sans worker, en
// test, `plugins/onnx-hors-fil.ts` appelle ces fonctions dans le fil.
import * as ort from "onnxruntime-web";
import { preparerSession, separerAvecSession, type ResultatSeparation } from "./ia";
import { debruiterParTrames, GTCRN_BINS } from "./gtcrn";

/** Débruiter un signal 16 kHz mono par GTCRN. */
export interface DemandeGtcrn {
  type: "debruiter-gtcrn";
  /** La clé sous laquelle la session reste prête d'une exécution à la suivante. */
  cle: string;
  modele: ArrayBuffer;
  signal: Float32Array;
  force: number;
}

/** Séparer la voix d'un mélange par MDX-Net. */
export interface DemandeMdx {
  type: "separer-mdx";
  cle: string;
  modele: ArrayBuffer;
  /** Le fournisseur d'exécution, tel que `ia.ts` le nomme (« Auto », « CPU (WASM) »…). */
  fournisseur: string;
  canaux: Float32Array[];
}

export type DemandeOnnx = DemandeGtcrn | DemandeMdx;
export type ResultatOnnx = Float32Array | ResultatSeparation;

/** Formes des trois caches, relevées sur la signature de l'ONNX. */
const FORMES_CACHE = {
  conv_cache: [2, 1, 16, 16, 33],
  tra_cache: [2, 3, 1, 1, 16],
  inter_cache: [2, 1, 33, 16],
} as const;

const tailleCache = (forme: readonly number[]) => forme.reduce((a, b) => a * b, 1);
const cacheVide = (forme: readonly number[]) =>
  new ort.Tensor("float32", new Float32Array(tailleCache(forme)), forme as unknown as number[]);

/** Le signal débruité, de même longueur ; `avancement` reçoit une fraction entre 0 et 1. */
export async function debruiterGtcrn(d: DemandeGtcrn, avancement: (fraction: number) => void): Promise<Float32Array> {
  // CPU (WASM) explicitement, et non « Auto ».
  //
  // « Auto » essaie WebGPU d'abord. Mesuré ici sur 3 s d'audio, avec le même
  // modèle et le même signal : WASM prend 0,58 s et rend un gain de 7,8 dB de
  // rapport signal/bruit ; WebGPU prend 41,4 s — 71 fois plus — et rend un
  // signal ENTIÈREMENT NUL, sans lever d'erreur. Deux raisons de ne pas lui
  // laisser la main : le résultat est faux, et le profil de calcul lui est
  // hostile. GTCRN pèse 344 ko et se déroule image par image ; on l'appelle
  // 62 fois par seconde d'audio, sur des tenseurs minuscules. Le coût est
  // alors celui des allers-retours vers le GPU, pas celui du calcul.
  const session = await preparerSession(d.modele, "CPU (WASM)", d.cle);

  // Les caches sont l'état récurrent du modèle : ils se passent d'une trame à
  // la suivante, et repartent de zéro pour chaque piste. Les oublier ferait un
  // débruitage sans mémoire, donc sans la moindre tenue temporelle.
  let convCache: ort.Tensor = cacheVide(FORMES_CACHE.conv_cache);
  let traCache: ort.Tensor = cacheVide(FORMES_CACHE.tra_cache);
  let interCache: ort.Tensor = cacheVide(FORMES_CACHE.inter_cache);

  return debruiterParTrames(
    d.signal,
    async (spectre) => {
      const r = await session.run({
        mix: new ort.Tensor("float32", spectre, [1, GTCRN_BINS, 1, 2]),
        conv_cache: convCache, tra_cache: traCache, inter_cache: interCache,
      });
      convCache = r.conv_cache_out as ort.Tensor;
      traCache = r.tra_cache_out as ort.Tensor;
      interCache = r.inter_cache_out as ort.Tensor;
      return r.enh.data as Float32Array;
    },
    { force: d.force, surProgres: avancement },
  );
}

/** La voix et le reste, canal par canal ; `avancement` reçoit un pourcentage. */
export async function separerMdx(d: DemandeMdx, avancement: (pct: number) => void): Promise<ResultatSeparation> {
  const session = await preparerSession(d.modele, d.fournisseur, d.cle);
  return separerAvecSession({ canaux: d.canaux }, session, avancement);
}

/** Ce que le worker sert : une demande, une réponse. */
export function traiterDemandeOnnx(d: DemandeOnnx, avancement: (valeur: number) => void): Promise<ResultatOnnx> {
  return d.type === "debruiter-gtcrn" ? debruiterGtcrn(d, avancement) : separerMdx(d, avancement);
}
