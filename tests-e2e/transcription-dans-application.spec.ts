// tests-e2e/transcription-dans-application.spec.ts — Le Transcripteur MIDI rend le même fichier par
// son worker que dans le fil.
//
// ═══ POURQUOI CETTE SPEC, ET NON LA BASE D'EMPREINTES ═══
//
// Le composant calcule hors du fil depuis le 2026-11-07 : son tempo deviné et sa transcription
// monophonique passent par `workers/transcription-worker.ts`. La base d'empreintes surveille les
// autres workers de calcul, mais elle exige une sortie audio, et celui-ci ne rend qu'un fichier
// MIDI. `src/docs/couverture-empreintes.test.ts` accepte donc ce worker sur la preuve faite ici, et
// seulement si cette spec le nomme.
//
// ═══ CE QU'ELLE COMPARE ═══
//
// LE MÊME COMPOSANT, DEUX FOIS, DANS LA MÊME PAGE : par son worker, puis sans constructeur `Worker`,
// ce qui le fait calculer dans le fil, comme en test unitaire. Le fichier MIDI rendu et le message
// doivent être identiques à l'octet près. Sans la seconde moitié, la spec vérifierait le worker
// contre lui-même ; sans la première, elle ne verrait jamais le worker.
//
// TROIS PRÉCAUTIONS. Le worker doit avoir été créé, et sous son nom : un composant qui retomberait
// dans le fil passerait la comparaison sans rien prouver. Un cas doit trouver des notes, et un cas
// doit DEVINER un tempo autre que 120, sans quoi le chemin du tempo ne serait pas éprouvé. Et les
// canaux reçus doivent rester entiers : ils partent copiés, le tampon appartenant au nœud amont.
//
// Vue rouge le 2026-11-07 sur la vélocité de la première note changée d'un, dans le seul worker.
//
// ═══ ET LE POLYPHONIQUE, PAR LE WORKER D'INFÉRENCE ONNX ═══
//
// Depuis le même jour, Basic Pitch calcule dans `workers/inference-onnx-worker.ts`, que la base
// d'empreintes couvre déjà par « Débruitage IA ». Le second cas fait la même comparaison sur ce
// chemin-là : sans `Worker`, le client d'inférence calcule dans la page. Il se saute sans le modèle,
// que la page lit par `fetch` dans `public/oonx/`. Vu rouge le même jour sur la même vélocité
// changée, dans le seul `inference-onnx-worker.ts` : le module d'inférence sert aussi le calcul
// dans le fil, et une faute plantée là ne pourrait pas se voir.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5278);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

test("le Transcripteur MIDI rend par son worker le fichier qu'il rend dans le fil", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 15000 });

  const r = await page.evaluate(async () => {
    const urls: string[] = [];
    const Origine = window.Worker;
    class Espion extends Origine {
      constructor(u: string | URL, o?: WorkerOptions) { super(u, o); urls.push(String(u)); }
    }
    const { fiches } = await import("/src/plugins/analyse.ts");
    const fiche = (fiches as any[]).find((f) => f.id === "transcripteur-midi");

    // Une mélodie de huit notes, avec ou sans frappes de bruit, et deux notes graves : des sons dont
    // on sait qu'ils donnent des notes, et deux tempos devinés différents de 120.
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const melodie = [60, 62, 64, 65, 67, 69, 71, 72];
    let graine = 4242;
    const hasard = () => { graine = (graine * 1103515245 + 12345) >>> 0; return graine / 4294967296 - 0.5; };
    const sons: Record<string, { sr: number; canaux: number; sec: number; f: (t: number, c: number) => number }> = {
      melodie: { sr: 44100, canaux: 2, sec: 4, f: (t, c) => {
        const k = Math.floor(t / 0.5), l = t - k * 0.5;
        return (c ? 0.3 : 0.5) * Math.sin(2 * Math.PI * hz(melodie[k % 8]) * t) * Math.min(1, l * 50) * Math.exp(-l * 3);
      } },
      melodieEtBatterie: { sr: 48000, canaux: 2, sec: 4, f: (t, c) => {
        const k = Math.floor(t / 0.5), l = t - k * 0.5;
        return 0.4 * Math.sin(2 * Math.PI * hz(melodie[(k * 3) % 8] - 12) * t) * Math.min(1, l * 50)
          + ((t % 0.25) < 0.02 ? hasard() * (c ? 0.6 : 0.8) : 0);
      } },
      graves: { sr: 22050, canaux: 1, sec: 3, f: (t) => 0.6 * Math.sin(2 * Math.PI * (t < 1.5 ? 55 : 82.41) * t) },
    };

    const tempoDuFichier = (o: Uint8Array): number | null => {
      for (let i = 0; i + 5 < o.length; i++) {
        if (o[i] === 0xff && o[i + 1] === 0x51 && o[i + 2] === 0x03) {
          return Math.round(60e6 / ((o[i + 3] << 16) | (o[i + 4] << 8) | o[i + 5]));
        }
      }
      return null;
    };

    const cas: any[] = [];
    for (const [nom, s] of Object.entries(sons)) {
      const n = Math.round(s.sec * s.sr);
      const b = new AudioBuffer({ numberOfChannels: s.canaux, length: n, sampleRate: s.sr });
      for (let c = 0; c < s.canaux; c++) {
        const d = new Float32Array(n);
        for (let i = 0; i < n; i++) d[i] = s.f(i / s.sr, c);
        b.copyToChannel(d, c);
      }
      for (const tempo of [120, 90]) {
        const ctx = {
          noeud: { id: "x", data: {} }, runtime: null, repertoireTravail: null,
          entree: () => b, entrees: () => [b],
          paramNombre: (p: string, def: number) => (p === "Tempo du fichier MIDI" ? tempo : def),
          paramTexte: (_p: string, def: string) => def,
          onProgress: () => {}, signal: new AbortController().signal,
        };
        const lire = async () => {
          const res = await fiche.executer(ctx);
          const f = res.valeurs[0] as File | null;
          return { message: res.message as string, octets: f ? Array.from(new Uint8Array(await f.arrayBuffer())) : null };
        };
        (window as any).Worker = Espion;
        const parWorker = await lire();
        (window as any).Worker = undefined;
        const dansLeFil = await lire();
        (window as any).Worker = Origine;
        cas.push({
          nom, tempo, message: parWorker.message,
          egaux: parWorker.message === dansLeFil.message
            && JSON.stringify(parWorker.octets) === JSON.stringify(dansLeFil.octets),
          aDesNotes: parWorker.octets !== null,
          tempoEcrit: parWorker.octets ? tempoDuFichier(new Uint8Array(parWorker.octets)) : null,
          canauxEntiers: Array.from({ length: s.canaux }, (_, c) => b.getChannelData(c).length === n).every(Boolean),
        });
      }
    }
    return { urls, cas };
  });

  console.log(JSON.stringify(r, null, 2));
  expect(r.urls.filter((u) => u.includes("transcription-worker.ts")).length,
    "le composant n'a pas créé son worker : la comparaison ne prouverait rien").toBe(r.cas.length);
  for (const c of r.cas) {
    expect(c.egaux, `${c.nom} à ${c.tempo} : le worker ne rend pas le fichier du fil`).toBe(true);
    expect(c.canauxEntiers, `${c.nom} : un canal reçu a été vidé`).toBe(true);
  }
  expect(r.cas.some((c) => c.aDesNotes), "aucun cas ne trouve de notes").toBe(true);
  expect(r.cas.some((c) => c.tempo === 120 && c.tempoEcrit !== null && c.tempoEcrit !== 120),
    "aucun cas ne devine un tempo autre que 120 : le chemin du tempo n'est pas éprouvé").toBe(true);
});

test("le Transcripteur MIDI polyphonique rend par le worker d'inférence le fichier qu'il rend dans le fil", async ({ page }) => {
  test.skip(!existsSync(join(RACINE, "public", "oonx", "basic-pitch.onnx")), "modèle Basic Pitch absent de public/oonx");
  test.setTimeout(180_000);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 15000 });

  const r = await page.evaluate(async () => {
    const urls: string[] = [];
    const Origine = window.Worker;
    class Espion extends Origine {
      constructor(u: string | URL, o?: WorkerOptions) { super(u, o); urls.push(String(u)); }
    }
    const { fiches } = await import("/src/plugins/analyse.ts");
    const fiche = (fiches as any[]).find((f) => f.id === "transcripteur-midi");
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const sr = 44100, n = sr * 6;
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    for (let c = 0; c < 2; c++) {
      const d = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr, accord = [[60, 64, 67], [57, 60, 64], [53, 57, 60]][Math.floor(t / 2) % 3];
        d[i] = accord.reduce((s, m) => s + 0.2 * Math.sin(2 * Math.PI * hz(m + (c ? 12 : 0)) * t), 0) * Math.min(1, (t % 2) * 20);
      }
      b.copyToChannel(d, c);
    }
    const cas: any[] = [];
    for (const tempo of [90, 120]) {
      const ctx = {
        noeud: { id: "x", data: {} }, runtime: null, repertoireTravail: null,
        entree: () => b, entrees: () => [b],
        paramNombre: (p: string, def: number) => (p === "Tempo du fichier MIDI" ? tempo : def),
        paramTexte: (p: string, def: string) => (p === "Méthode" ? "poly" : def),
        onProgress: () => {}, signal: new AbortController().signal,
      };
      const lire = async () => {
        const res = await fiche.executer(ctx);
        const f = res.valeurs[0] as File | null;
        return { message: res.message as string, octets: f ? Array.from(new Uint8Array(await f.arrayBuffer())) : null };
      };
      (window as any).Worker = Espion;
      const parWorker = await lire();
      (window as any).Worker = undefined;
      const dansLeFil = await lire();
      (window as any).Worker = Origine;
      cas.push({
        tempo, message: parWorker.message, aDesNotes: parWorker.octets !== null,
        egaux: parWorker.message === dansLeFil.message && JSON.stringify(parWorker.octets) === JSON.stringify(dansLeFil.octets),
        canauxEntiers: b.getChannelData(0).length === n && b.getChannelData(1).length === n,
      });
    }
    return { urls, cas };
  });

  console.log(JSON.stringify(r, null, 2));
  expect(r.urls.some((u) => u.includes("inference-onnx-worker")),
    "Basic Pitch n'a pas calculé par le worker d'inférence : la comparaison ne prouverait rien").toBe(true);
  for (const c of r.cas) {
    expect(c.egaux, `tempo ${c.tempo} : le worker ne rend pas le fichier du fil`).toBe(true);
    expect(c.canauxEntiers, "un canal reçu a été vidé").toBe(true);
    expect(c.aDesNotes, `tempo ${c.tempo} : aucune note`).toBe(true);
  }
});
