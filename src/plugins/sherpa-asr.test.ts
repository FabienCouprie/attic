// plugins/sherpa-asr.test.ts — Tests structurels du nœud Sherpa-ONNX ASR.
import { describe, it, expect, vi } from "vitest";
import { fiches, resamplerLineaireVers16k, resamplerVers16k, sendInit } from "./sherpa-asr";

describe("sherpa-asr", () => {
  it("exposes a single Sherpa ASR node", () => {
    expect(fiches).toHaveLength(1);
    const fiche = fiches[0];
    expect(fiche.id).toBe("sherpa-asr");
    expect(fiche.nom).toBe("Sherpa ASR");
    expect(fiche.famille).toBe("Speech to Text");
    expect(fiche.entrees).toHaveLength(1);
    expect(fiche.entrees[0].type).toBe("audio");
    expect(fiche.sorties).toHaveLength(1);
    expect(fiche.sorties[0].type).toBe("texte");
    expect(typeof fiche.executer).toBe("function");
  });

  it("has a language choice parameter with Auto default", () => {
    const langue = fiches[0].parametres?.find((p) => p.nom === "Langue");
    expect(langue).toBeDefined();
    expect(langue?.type).toBe("choix");
    expect(langue?.defaut).toBe("Auto");
    expect(langue?.options).toContain("Russe");
    expect(langue?.options).toContain("Français");
  });

  it("exposes resampling quality and model cache parameters", () => {
    const resampling = fiches[0].parametres?.find((p) => p.nom === "Qualité resampling");
    expect(resampling).toBeDefined();
    expect(resampling?.type).toBe("choix");
    expect(resampling?.options).toContain("Haute (Web Audio)");
    expect(resampling?.options).toContain("Standard (linéaire)");

    const cache = fiches[0].parametres?.find((p) => p.nom === "Cache modèle");
    expect(cache).toBeDefined();
    expect(cache?.type).toBe("choix");
    expect(cache?.options).toContain("Auto (conservé entre sessions)");
    expect(cache?.options).toContain("Vider et re-télécharger");
  });

  it("linearly resamples to 16 kHz", () => {
    const sr = 44100;
    const mono = new Float32Array(sr);
    for (let i = 0; i < sr; i++) mono[i] = Math.sin((2 * Math.PI * 440 * i) / sr);
    const out = resamplerLineaireVers16k(mono, sr);
    expect(out.length).toBe(16000);
    expect(out).toBeInstanceOf(Float32Array);
  });

  it("falls back to linear resampling when Web Audio is unavailable", async () => {
    const sr = 44100;
    const mono = new Float32Array(sr);
    const out = await resamplerVers16k(mono, sr, "Haute (Web Audio)");
    expect(out.length).toBe(16000);
    expect(out).toBeInstanceOf(Float32Array);
  });
});

// ── Chien de garde d'initialisation ──
// Au premier usage, le worker télécharge ~104 Mo de modèles depuis HuggingFace.
// Le délai était auparavant une échéance ABSOLUE de 120 s couvrant ce
// téléchargement : en deçà de ~6,9 Mbit/s soutenus, un transfert parfaitement
// sain était tué en cours de route. Il porte désormais sur l'INACTIVITÉ.
describe("sherpa-asr — délai d'initialisation", () => {
  // Worker minimal : on pilote nous-mêmes les messages qu'il « émet ».
  // Les écouteurs sont rangés PAR TYPE. Une première version les mettait tous
  // dans une même liste : les messages étaient alors livrés aussi à l'écouteur
  // d'erreur, et les tests échouaient sur un défaut du double, pas du code.
  function workerFactice() {
    const ecouteurs = new Map<string, ((e: any) => void)[]>();
    const pour = (t: string) => ecouteurs.get(t) ?? (ecouteurs.set(t, []), ecouteurs.get(t)!);
    return {
      addEventListener: (t: string, f: any) => { pour(t).push(f); },
      removeEventListener: (t: string, f: any) => {
        const l = pour(t);
        const i = l.indexOf(f);
        if (i >= 0) l.splice(i, 1);
      },
      postMessage: () => {},
      emettre: (data: any) => { for (const f of [...pour("message")]) f({ data }); },
      emettreErreur: (message: string) => { for (const f of [...pour("error")]) f({ type: "error", message }); },
      get nbEcouteurs() { return [...ecouteurs.values()].reduce((n, l) => n + l.length, 0); },
    };
  }

  // Récupère le requestId que sendInit vient d'allouer, en interceptant le
  // premier postMessage.
  function poser() {
    const w = workerFactice() as any;
    let requestId: string | undefined;
    w.postMessage = (m: any) => { requestId = m.requestId; };
    const p = sendInit(w, {} as any);
    return { w, p, id: () => requestId! };
  }

  it("un téléchargement qui progresse ne déclenche pas le délai, même au-delà de la durée totale", async () => {
    vi.useFakeTimers();
    try {
      const { w, p, id } = poser();
      let resolu = false;
      p.then(() => { resolu = true; });
      // 10 minutes de téléchargement, un signe de vie toutes les 90 s :
      // largement au-delà des 120 s de l'ancienne échéance absolue.
      for (let i = 0; i < 7; i++) {
        await vi.advanceTimersByTimeAsync(90000);
        w.emettre({ requestId: id(), type: "progress", filename: "tiny-decoder.int8.onnx", percent: i * 14 });
      }
      expect(resolu).toBe(false);            // pas encore prêt…
      w.emettre({ requestId: id(), type: "ready" });
      await vi.advanceTimersByTimeAsync(0);
      expect(resolu).toBe(true);             // …mais surtout jamais rejeté
      await expect(p).resolves.toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it("un téléchargement réellement bloqué déclenche toujours le délai", async () => {
    vi.useFakeTimers();
    try {
      const { w, p, id } = poser();
      const attendu = expect(p).rejects.toThrow();
      w.emettre({ requestId: id(), type: "progress", filename: "tiny-encoder.int8.onnx", percent: 5 });
      await vi.advanceTimersByTimeAsync(120001);   // plus rien n'arrive
      await attendu;
    } finally { vi.useRealTimers(); }
  });

  it("n'accumule pas d'écouteur mort sur le worker partagé après une expiration", async () => {
    vi.useFakeTimers();
    try {
      const { w, p } = poser();
      const attendu = expect(p).rejects.toThrow();
      expect(w.nbEcouteurs).toBe(2);   // message + error
      await vi.advanceTimersByTimeAsync(120001);
      await attendu;
      expect(w.nbEcouteurs).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

// Un worker qui meurt au démarrage — script introuvable, importScripts en échec —
// n'envoie aucun message. Sans écouteur d'erreur, on attendait les deux minutes
// du chien de garde pour annoncer une « expiration », en laissant croire à un
// téléchargement trop lent alors que rien n'avait commencé.
describe("sherpa-asr — worker qui ne démarre pas", () => {
  function workerMort() {
    const ecouteurs = new Map<string, ((e: any) => void)[]>();
    const pour = (t: string) => ecouteurs.get(t) ?? (ecouteurs.set(t, []), ecouteurs.get(t)!);
    return {
      addEventListener: (t: string, f: any) => { pour(t).push(f); },
      removeEventListener: (t: string, f: any) => { const l = pour(t); const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); },
      postMessage: () => {},
      emettreErreur: (m: string) => { for (const f of [...pour("error")]) f({ type: "error", message: m }); },
      get nbEcouteurs() { return [...ecouteurs.values()].reduce((n, l) => n + l.length, 0); },
    };
  }

  it("rejette immédiatement, sans attendre le délai d'inactivité", async () => {
    vi.useFakeTimers();
    try {
      const w = workerMort() as any;
      const p = sendInit(w, {} as any);
      const attendu = expect(p).rejects.toThrow(/worker/i);
      w.emettreErreur("Failed to load script");
      await vi.advanceTimersByTimeAsync(0);   // aucun temps écoulé : pas d'attente
      await attendu;
      expect(w.nbEcouteurs).toBe(0);          // les deux écouteurs sont retirés
    } finally { vi.useRealTimers(); }
  });
});
