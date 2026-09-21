// tests-e2e/multicanal.spec.ts — L'espace composé, vérifié dans la vraie application.
//
// TROIS CHOSES NE SE VÉRIFIENT QU'ICI :
//  - la disposition voyage à travers le MOTEUR : un effet ordinaire placé après un spatialiseur doit
//    rendre un fichier dont l'en-tête dit encore « 7.1.4 » ;
//  - l'ORIENTATION du binaural : une source à gauche doit sortir plus fort dans l'oreille gauche. Une
//    erreur de signe entre la convention des angles et le repère du moteur audio retournerait toute
//    la pièce au casque sans que rien ne le signale, puisque le son sort ;
//  - les fonctions de transfert de la tête, qui n'existent que dans un vrai navigateur.
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

test.describe("multicanal", () => {
  test("LA DISPOSITION TRAVERSE UN EFFET ORDINAIRE, et l'export la dit encore", async ({ page }) => {
    const graphe = {
      nodes: [
        { id: "osc", position: { x: 0, y: 0 }, data: { ficheId: "oscillateur", parametres: {} } },
        { id: "spat", position: { x: 300, y: 0 }, data: { ficheId: "spatialiseur", parametres: { Disposition: "7.1.4", Azimut: 90 } } },
        { id: "gain", position: { x: 600, y: 0 }, data: { ficheId: "amplificateur", parametres: {} } },
      ],
      edges: [
        { id: "e1", source: "osc", target: "spat", sourceHandle: "out:0", targetHandle: "in:0" },
        { id: "e2", source: "spat", target: "gain", sourceHandle: "out:0", targetHandle: "in:0" },
      ],
    };
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(graphe)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 3, { timeout: 15000 });
    await page.keyboard.press(" ");
    await page.waitForFunction(() => {
      const n = document.querySelector('.react-flow__node[data-id="gain"] audio') as HTMLAudioElement | null;
      return !!n?.src;
    }, { timeout: 60000 });

    const entetes = await page.evaluate(async () => {
      const lire = async (id: string) => {
        const a = document.querySelector(`.react-flow__node[data-id="${id}"] audio`) as HTMLAudioElement;
        const ab = await (await fetch(a.src)).arrayBuffer();
        const v = new DataView(ab);
        let o = 12;
        while (o + 8 <= v.byteLength) {
          const tag = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
          const taille = v.getUint32(o + 4, true);
          if (tag === "fmt ") return { format: v.getUint16(o + 8, true), canaux: v.getUint16(o + 10, true), masque: v.getUint32(o + 28, true) };
          o += 8 + taille + (taille % 2);
        }
        return null;
      };
      return { spat: await lire("spat"), gain: await lire("gain") };
    });
    console.log(JSON.stringify(entetes));

    // Le spatialiseur écrit un 7.1.4 : douze canaux, format étendu, douze bits de masque.
    expect(entetes.spat).toEqual({ format: 0xfffe, canaux: 12, masque: 0x2d63f });
    // Et l'amplificateur, qui ne sait rien du multicanal, rend un fichier qui le dit encore.
    expect(entetes.gain).toEqual({ format: 0xfffe, canaux: 12, masque: 0x2d63f });
  });

  test("UNE SOURCE À GAUCHE SORT PLUS FORT DANS L'OREILLE GAUCHE — dans les quatre familles", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    const r = await page.evaluate(async () => {
      const { registre } = await import("/src/audio/adaptateur.ts");
      const spat: any = registre.trouverDef("spatialiseur");
      const ecoute: any = registre.trouverDef("ecoute-binaurale");
      const SR = 48000, N = SR;
      let e = 3;
      const bruit = new AudioBuffer({ numberOfChannels: 1, length: N, sampleRate: SR });
      const x = new Float32Array(N);
      for (let i = 0; i < N; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.3 * (e / 4294967296 * 2 - 1); }
      bruit.copyToChannel(x, 0);
      const ctx = (entrees: unknown[], params: Record<string, unknown>) => ({
        entree: (i: number) => entrees[i] ?? null, entrees: () => entrees,
        paramTexte: (n: string, d: string) => String(params[n] ?? d),
        paramNombre: (n: string, d: number) => Number(params[n] ?? d),
        onProgress: () => {}, noeud: { data: {} }, runtime: null,
      });
      const db = (c: Float32Array) => { let s = 0; for (const v of c) s += v * v; return 10 * Math.log10(s / c.length); };
      const ecart: Record<string, number> = {};
      for (const disposition of ["octo", "7.1.4", "quad", "hoa3"]) {
        for (const az of [90, -90]) {
          const s = await spat.executer(ctx([bruit], { Disposition: disposition, Azimut: az }));
          const b = await ecoute.executer(ctx([s.valeurs[0]], {}));
          const casque = b.valeurs[0] as AudioBuffer;
          ecart[`${disposition} ${az}`] = db(casque.getChannelData(0)) - db(casque.getChannelData(1));
        }
      }
      return ecart;
    });
    console.log(JSON.stringify(r));
    for (const disposition of ["octo", "7.1.4", "quad", "hoa3"]) {
      // Gauche (+90°) : l'oreille gauche domine nettement ; droite (−90°) : l'inverse.
      expect(r[`${disposition} 90`], disposition).toBeGreaterThan(6);
      expect(r[`${disposition} -90`], disposition).toBeLessThan(-6);
    }
  });

  test("DES OBJETS SE RENDENT DANS DEUX SALLES SANS RIEN RÉÉCRIRE", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    const r = await page.evaluate(async () => {
      const { registre } = await import("/src/audio/adaptateur.ts");
      const { dispositionDe } = await import("/src/audio/multicanal.ts");
      const objet: any = registre.trouverDef("objet-sonore");
      const rendu: any = registre.trouverDef("rendu-objets");
      const son = new AudioBuffer({ numberOfChannels: 1, length: 24000, sampleRate: 48000 });
      son.copyToChannel(Float32Array.from({ length: 24000 }, (_, i) => Math.sin(i / 10)), 0);
      const ctx = (entrees: unknown[], params: Record<string, unknown>) => ({
        entree: (i: number) => entrees[i] ?? null, entrees: () => entrees,
        paramTexte: (n: string, d: string) => String(params[n] ?? d),
        paramNombre: (n: string, d: number) => Number(params[n] ?? d),
        onProgress: () => {}, noeud: { data: {} }, runtime: null,
      });
      const a = (await objet.executer(ctx([son], { Azimut: 45, Nom: "voix" }))).valeurs[0];
      const b = (await objet.executer(ctx([son], { Azimut: -120, Nom: "vent" }))).valeurs[0];
      const salles: Record<string, unknown> = {};
      for (const d of ["7.1.4", "anneau-16", "hoa2"]) {
        const out = await rendu.executer(ctx([a, b], { Disposition: d }));
        salles[d] = { canaux: out.valeurs[0].numberOfChannels, etiquette: dispositionDe(out.valeurs[0])?.id, message: out.message };
      }
      return salles;
    });
    console.log(JSON.stringify(r));
    expect(r["7.1.4"]).toMatchObject({ canaux: 12, etiquette: "7.1.4" });
    expect(r["anneau-16"]).toMatchObject({ canaux: 16, etiquette: "anneau-16" });
    expect(r["hoa2"]).toMatchObject({ canaux: 9, etiquette: "hoa2" });
  });
});
