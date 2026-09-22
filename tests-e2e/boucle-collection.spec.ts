// tests-e2e/boucle-collection.spec.ts — Le traitement par lot, et le nom des fichiers écrits.
//
// CE QUI NE SE TESTE PAS AILLEURS : le lot lit un dossier, exécute le graphe une fois par fichier
// et ÉCRIT sur le disque, par le processus principal — qui n'existe pas dans un navigateur. On
// pose donc une fausse `window.api` : deux pistes en entrée, et l'on note ce qui serait écrit.
// C'est la seule façon de vérifier le suffixe de nommage de bout en bout.
import { test, expect } from "@playwright/test";
import { spawn } from "child_process";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5175";

async function waitForServer(url: string, retries = 120): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore la */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

test.beforeAll(async () => {
  if (process.env.DEV_URL) { await waitForServer(devUrl); return; }
  const port = 5175;
  devUrl = `http://localhost:${port}`;
  devServer = spawn("cmd", ["/c", "npm", "run", "dev", "--", "--port", String(port)], { cwd: process.cwd(), stdio: "pipe" });
  let log = "";
  devServer.stdout?.on("data", (d) => { log += d.toString(); });
  devServer.stderr?.on("data", (d) => { log += d.toString(); });
  for (let i = 0; i < 160; i++) {
    if (log.includes(`http://localhost:${port}`)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await waitForServer(devUrl);
});

test.afterAll(async () => {
  if (devServer) {
    devServer.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (devServer.exitCode === null) devServer.kill("SIGKILL");
  }
});

/** Deux pistes dans « entree », un dossier « sortie » qui note ce qu'on y écrit. */
const FAUSSE_API = () => {
  const sr = 44100, n = sr / 2;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sr) * 8000, true);
  const octets = new Uint8Array(buf);
  (window as any).__ecrits = [];
  (window as any).__sortie = (window as any).__sortie ?? [];
  (window as any).api = {
    lireDossier: async (chemin: string) => String(chemin).includes("entree")
      ? [{ nom: "Piste une.wav", chemin: "C:/entree/Piste une.wav" }, { nom: "deux.mp3", chemin: "C:/entree/deux.mp3" }]
      // Le dossier de sortie : ce que le test y a posé, plus ce que le lot vient d'y écrire.
      : ((window as any).__sortie ?? []).concat((window as any).__ecrits.map((e: any) => ({ nom: String(e.chemin).split("/").pop(), chemin: e.chemin }))),
    // Le nœud lit l'adresse `data:`, comme le fait le préchargement d'Electron.
    lireFichierAudio: async (chemin: string) => {
      const b64 = btoa(Array.from(octets, (o: number) => String.fromCharCode(o)).join(""));
      return { url: `data:audio/wav;base64,${b64}`, donnees: octets, nom: String(chemin).split("/").pop() };
    },
    ecrireFichier: async (chemin: string, donnees: ArrayBuffer) => {
      (window as any).__ecrits.push({ chemin, octets: donnees.byteLength });
      return { ok: true };
    },
    choisirDossier: async () => null,
  };
};

const graphe = (suffixe: string, format = "WAV", siExiste = "Écraser") => ({
  nodes: [
    { id: "d", position: { x: 0, y: 0 }, data: { ficheId: "boucle-collection-debut", parametres: { Dossier: "C:/entree" } } },
    { id: "g", position: { x: 300, y: 0 }, data: { ficheId: "amplificateur", parametres: {} } },
    { id: "f", position: { x: 620, y: 0 }, data: { ficheId: "boucle-collection-fin", parametres: { "Dossier sortie": "C:/sortie", Suffixe: suffixe, Format: format, "Si le fichier existe": siExiste } } },
  ],
  edges: [
    { id: "e1", source: "d", target: "g", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e2", source: "g", target: "f", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
});

async function lancerLot(page: any, suffixe: string, format = "WAV", siExiste = "Écraser", dejaLa: string[] = []) {
  await page.addInitScript(([noms]: string[][]) => { (window as any).__sortie = noms.map((n) => ({ nom: n, chemin: `C:/sortie/${n}` })); }, [dejaLa]);
  await page.addInitScript(FAUSSE_API);
  await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe(suffixe, format, siExiste))]);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 3, { timeout: 15000 });
  await page.click(".attic-btn-lancer");
  try {
    await page.waitForFunction(() => {
      const f = document.querySelector('.react-flow__node[data-id="f"]');
      return !!f?.querySelector(".attic-node-statut-puce.termine, .attic-node-statut-puce.erreur")
        && !document.querySelector(".attic-btn-arreter");
    }, null, { timeout: 90000 });
  } catch (e) {
    console.log("ÉTAT " + JSON.stringify(await page.evaluate(() => ({
      ecrits: (window as any).__ecrits,
      noeuds: [...document.querySelectorAll(".react-flow__node")].map((n: any) => n.dataset.id + " :: " + n.innerText.replace(/\s+/g, " ").slice(0, 150)),
    }))));
    throw e;
  }
  return page.evaluate(() => ({
    ecrits: (window as any).__ecrits,
    journal: (document.querySelector('.react-flow__node[data-id="f"]') as HTMLElement).innerText.replace(/\s+/g, " "),
    ports: [...document.querySelectorAll('.react-flow__node[data-id="d"] .attic-node-ports-col.right .attic-node-port-label')].map((e) => e.textContent),
    portsFin: [...document.querySelectorAll('.react-flow__node[data-id="f"] .attic-node-ports-col:not(.right) .attic-node-port-label')].map((e) => e.textContent),
  }));
}

test.describe("boucle collection", () => {
  test("LE SUFFIXE S'AJOUTE AVANT L'EXTENSION, ET L'EXTENSION SUIT LE FORMAT", async ({ page }) => {
    test.setTimeout(180000);
    const r = await lancerLot(page, "-traite");
    console.log(JSON.stringify(r.ecrits));
    // L'ordre est celui du dossier, trié par le lot : on compare l'ensemble des noms.
    expect(r.ecrits.map((e: any) => e.chemin).sort()).toEqual([
      "C:/sortie/Piste une-traite.wav",
      "C:/sortie/deux-traite.wav",
    ].sort());
    // Chaque fichier écrit a bien un contenu, et non zéro octet.
    expect(r.ecrits.every((e: any) => e.octets > 1000)).toBe(true);
    expect(r.journal).toContain("Piste une-traite.wav");
  });

  test("SANS SUFFIXE, LE NOM DE LA SOURCE ; EN MP3, L'EXTENSION CHANGE", async ({ page }) => {
    test.setTimeout(180000);
    const r = await lancerLot(page, "", "MP3");
    console.log(JSON.stringify(r.ecrits));
    expect(r.ecrits.map((e: any) => e.chemin).sort()).toEqual([
      "C:/sortie/Piste une.mp3",
      "C:/sortie/deux.mp3",
    ].sort());
  });

  test("LES DEUX NŒUDS N'ONT PLUS DE PORT « NOM »", async ({ page }) => {
    test.setTimeout(180000);
    const r = await lancerLot(page, "-x");
    expect(r.ports).toEqual(["Audio"]);
    expect(r.portsFin).toEqual(["Audio"]);
  });
test("UN FICHIER DÉJÀ LÀ : LA PASSE EST REFUSÉE ET LE FICHIER RESTE INTACT", async ({ page }) => {
    test.setTimeout(180000);
    const r = await lancerLot(page, "-traite", "WAV", "Signaler une erreur", ["Piste une-traite.wav"]);
    console.log(JSON.stringify({ ecrits: r.ecrits.map((e: any) => e.chemin), journal: r.journal.slice(0, 200) }));
    // La piste dont le résultat existait déjà n'est pas réécrite ; l'autre passe normalement.
    expect(r.ecrits.map((e: any) => e.chemin)).toEqual(["C:/sortie/deux-traite.wav"]);
    expect(r.journal).toMatch(/déjà dans le dossier de sortie|already in the output folder/);
  });

  test("ET AVEC « ÉCRASER », ELLE PASSE", async ({ page }) => {
    test.setTimeout(180000);
    const r = await lancerLot(page, "-traite", "WAV", "Écraser", ["Piste une-traite.wav"]);
    expect(r.ecrits.map((e: any) => e.chemin).sort()).toEqual([
      "C:/sortie/Piste une-traite.wav",
      "C:/sortie/deux-traite.wav",
    ].sort());
  });
});
