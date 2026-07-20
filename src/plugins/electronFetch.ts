// plugins/electronFetch.ts — Patcher fetch pour télécharger les modèles via le main Electron.
// Utilisé par les nœuds qui chargent des modèles @magenta/music (DDSP, MusicVAE, MusicRNN, Piano Genie).
// Le processus principal n’a pas les contraintes CSP/CORS du renderer, donc on route les requêtes
// de modèles (tfhub.dev, storage.googleapis.com, kaggle.com…) par lui.

export function isModelDownloadUrl(url: string): boolean {
  return /tfhub\.dev|storage\.googleapis\.com|kagglesdsdata|kaggle\.com|googleusercontent\.com/i.test(url);
}

let fetchPatchActive = 0;
let originalFetch: typeof globalThis.fetch | null = null;
let patchedFetch: typeof globalThis.fetch | null = null;

export async function withElectronFetch<T>(fn: () => Promise<T>): Promise<T> {
  const api = (typeof window !== "undefined" ? (window as any).api : null);
  if (!api?.telechargerUrl) {
    return fn();
  }
  if (!patchedFetch) {
    originalFetch = globalThis.fetch;
    patchedFetch = async (input, init) => {
      const urlStr = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
      if (!isModelDownloadUrl(urlStr)) {
        return originalFetch!(input, init);
      }
      const res = await api.telechargerUrl(urlStr);
      if (res.erreur) {
        throw new Error(` téléchargement principal a échoué : ${res.erreur}`);
      }
      let body: Uint8Array;
      if (res.donnees instanceof Uint8Array) {
        body = res.donnees;
      } else if (Array.isArray(res.donnees)) {
        body = new Uint8Array(res.donnees);
      } else if (res.donnees && typeof res.donnees === "object") {
        body = new Uint8Array(res.donnees);
      } else {
        throw new Error(`No data received for ${urlStr}`);
      }
      const isJson = urlStr.includes("model.json") || urlStr.endsWith(".json");
      return new Response(body as unknown as BodyInit, {
        status: res.statut ?? 200,
        statusText: "OK",
        headers: { "content-type": isJson ? "application/json" : "application/octet-stream" },
      });
    };
  }
  fetchPatchActive++;
  globalThis.fetch = patchedFetch;
  try {
    return await fn();
  } finally {
    fetchPatchActive--;
    if (fetchPatchActive === 0 && originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
      patchedFetch = null;
    }
  }
}
