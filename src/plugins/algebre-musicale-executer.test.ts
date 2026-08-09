// plugins/algebre-musicale-executer.test.ts — Test de bout en bout du nœud
// (décodage → extraction → classification → sorties), séparé du fichier
// principal pour isoler l'import du polyfill audio réel (nécessaire ici,
// contrairement aux autres tests de ce nœud qui appellent les fonctions
// pures directement sur des AudioBuffer déjà construits).
import "node-web-audio-api/polyfill.js";
import { describe, it, expect, vi } from "vitest";
import { fiches } from "./algebre-musicale";

function genererWavBase64(freq: number, dureeS: number): string {
  const sr = 44100;
  const n = Math.floor(sr * dureeS);
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, 36 + n * 2, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, "data"); view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sr) * 0.5;
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return Buffer.from(buf).toString("base64");
}

function pisteFactice(nom: string, freq: number) {
  return { nom, chemin: `/fake/${nom}`, freq };
}

describe("classification-pistes (executer, bout en bout)", () => {
  it("décode, classe et produit rapport + coordonnées + graphique", async () => {
    const pistes = [
      pisteFactice("grave-1.wav", 110), pisteFactice("grave-2.wav", 110), pisteFactice("grave-3.wav", 110),
      pisteFactice("aigu-1.wav", 1046.5), pisteFactice("aigu-2.wav", 1046.5), pisteFactice("aigu-3.wav", 1046.5),
    ];
    const api = {
      lireDossier: vi.fn(() => Promise.resolve(pistes.map((p) => ({ nom: p.nom, chemin: p.chemin })))),
      lireFichierAudio: vi.fn((chemin: string) => {
        const p = pistes.find((x) => x.chemin === chemin)!;
        return Promise.resolve({ url: `data:audio/wav;base64,${genererWavBase64(p.freq, 1.5)}` });
      }),
    };
    (globalThis as any).window = { api };

    const fiche = fiches.find((f) => f.id === "classification-pistes")!;
    const progressions: string[] = [];
    const ctx = {
      noeud: { data: {} },
      paramTexte: (nom: string, defaut: string) => (({ Dossier: "/fake" } as Record<string, string>)[nom] ?? defaut),
      paramNombre: (nom: string, defaut: number) => (({ "Nombre de groupes": 2 } as Record<string, number>)[nom] ?? defaut),
      onProgress: (msg: string) => progressions.push(msg),
    };

    const res = await fiche.executer(ctx as any);

    expect(res.erreur).toBeUndefined();
    const rapport = JSON.parse(res.valeurs[0] as string);
    const coordonnees = JSON.parse(res.valeurs[1] as string);
    expect(rapport.length).toBe(6);
    expect(coordonnees.length).toBe(6);
    expect(res.valeurs[2]).toBeInstanceOf(File);
    expect((res.valeurs[2] as File).type).toBe("image/svg+xml");

    // La progression cite chaque piste par son nom, pour diagnostiquer un
    // gros lot (voir le plantage par épuisement mémoire corrigé ici).
    expect(progressions.some((m) => m.includes("grave-1.wav"))).toBe(true);
    expect(progressions.some((m) => m.includes("aigu-3.wav"))).toBe(true);
  }, 30000);

  it("un fichier qui échoue au décodage est ignoré et listé dans le message, sans faire échouer le lot", async () => {
    const pistes = [
      pisteFactice("ok-1.wav", 220), pisteFactice("ok-2.wav", 220), pisteFactice("ok-3.wav", 220),
    ];
    const api = {
      lireDossier: vi.fn(() => Promise.resolve([...pistes, { nom: "corrompu.wav", chemin: "/fake/corrompu.wav" }].map((p) => ({ nom: p.nom, chemin: p.chemin })))),
      lireFichierAudio: vi.fn((chemin: string) => {
        if (chemin === "/fake/corrompu.wav") return Promise.resolve({ url: "data:audio/wav;base64,AAAA" });
        const p = pistes.find((x) => x.chemin === chemin)!;
        return Promise.resolve({ url: `data:audio/wav;base64,${genererWavBase64(p.freq, 1.5)}` });
      }),
    };
    (globalThis as any).window = { api };

    const fiche = fiches.find((f) => f.id === "classification-pistes")!;
    const ctx = {
      noeud: { data: {} },
      paramTexte: (nom: string, defaut: string) => (({ Dossier: "/fake" } as Record<string, string>)[nom] ?? defaut),
      paramNombre: (nom: string, defaut: number) => defaut,
      onProgress: () => {},
    };

    const res = await fiche.executer(ctx as any);
    expect(res.erreur).toBeUndefined();
    expect(res.message).toContain("corrompu.wav");
    const rapport = JSON.parse(res.valeurs[0] as string);
    expect(rapport.length).toBe(3);
  }, 30000);
});
