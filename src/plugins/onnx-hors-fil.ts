// plugins/onnx-hors-fil.ts — Ce que la page demande au worker d'inférence ONNX, et comment elle attend.
//
// UN SEUL OUVRIER, GARDÉ D'UNE EXÉCUTION À L'AUTRE. Il garde ses sessions prêtes comme la page les
// gardait (`ia.ts`, clé par modèle) : sans cela, chaque exécution recompilerait les 26 Mo du wasm
// et rechargerait le modèle. Le garde de `garde-worker.ts` l'oublie s'il meurt, et la demande en vol
// échoue avec la raison qu'il donne au lieu d'attendre toujours.
//
// L'ARRÊT TERMINE L'OUVRIER. Une inférence ne s'interrompt pas de l'extérieur : `ctx.signal` et un
// `onProgress` qui lève après un arrêt demandé tuent donc le worker, et le suivant repart à neuf.
// Sans cela, le travail abandonné continuerait de tourner et ferait attendre la demande suivante.
//
// LES OCTETS PARTENT COPIÉS, NON TRANSFÉRÉS. Le signal appartient souvent au nœud amont, et le
// modèle peut sortir d'un cache : les transférer les viderait sous leurs détenteurs. Seule la
// réponse revient transférée.
import { ErreurAnnulation } from "../core/annulation";
import type { DemandeOnnx, ResultatOnnx } from "../audio/inference-onnx";
import { installerGardeWorker } from "./garde-worker";

let ouvrier: Worker | null = null;
let compteur = 0;

function ouvrierPret(): Worker {
  if (ouvrier) return ouvrier;
  const w = new Worker(new URL("../workers/inference-onnx-worker.ts", import.meta.url), { type: "module" });
  installerGardeWorker(w, () => { if (ouvrier === w) ouvrier = null; });
  ouvrier = w;
  return w;
}

function oublier(w: Worker): void {
  w.terminate();
  if (ouvrier === w) ouvrier = null;
}

export interface OptionsInference {
  /** La valeur que rend le calcul : une fraction pour GTCRN, un pourcentage pour MDX. */
  surAvancement?: (valeur: number) => void;
  signal?: AbortSignal;
}

/** Fait faire `demande` au worker, ou dans le fil quand il n'y a pas de `Worker` (tests). */
export async function inferer<R extends ResultatOnnx>(demande: DemandeOnnx, o: OptionsInference = {}): Promise<R> {
  if (o.signal?.aborted) throw new ErreurAnnulation();
  if (typeof Worker === "undefined") {
    const { traiterDemandeOnnx } = await import("../audio/inference-onnx");
    return (await traiterDemandeOnnx(demande, (v) => o.surAvancement?.(v))) as R;
  }
  const w = ouvrierPret();
  const requestId = `onnx-${++compteur}`;
  return new Promise<R>((resolve, reject) => {
    const fin = () => {
      w.removeEventListener("message", ecoute);
      o.signal?.removeEventListener("abort", surArret);
    };
    const abandonner = (raison: unknown) => { fin(); oublier(w); reject(raison); };
    const surArret = () => abandonner(new ErreurAnnulation());
    const ecoute = (e: MessageEvent) => {
      const d = e.data;
      if (d?.requestId !== requestId) return;
      if (d.type === "progress") {
        try { o.surAvancement?.(d.avancement); } catch (err) { abandonner(err); }
        return;
      }
      fin();
      if (d.type === "done") resolve(d.resultat as R);
      else reject(new Error(d.msg ?? d.error));
    };
    w.addEventListener("message", ecoute);
    o.signal?.addEventListener("abort", surArret, { once: true });
    w.postMessage({ requestId, ...demande });
  });
}

const telechargements = new Map<string, ArrayBuffer>();

/**
 * Le modèle désigné par une URL, avec l'avancement en pour cent.
 *
 * DANS LA PAGE, ET C'EST VOULU : c'est un téléchargement que l'utilisateur a demandé, non un calcul,
 * et il ne gèle rien. Il vivait dans `ia.ts`, que seul le worker charge désormais.
 */
export async function telechargerDepuisUrl(url: string, surProgres?: (pct: number) => void): Promise<ArrayBuffer> {
  const existant = telechargements.get(url);
  if (existant) return existant;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Impossible de télécharger le modèle (${reponse.status})`);
  const total = Number(reponse.headers.get("content-length") ?? 0);
  if (!total || !reponse.body) {
    const buffer = await reponse.arrayBuffer();
    telechargements.set(url, buffer);
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
  telechargements.set(url, buffer);
  return buffer;
}
