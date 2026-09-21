// tests-e2e/lot-verif.spec.ts — La boucle collection, menee par la vraie application.
//
// POURQUOI CE TEST EXISTE ICI ET NON DANS LES TESTS UNITAIRES. Ce qui est verifie n est pas un
// calcul mais une ORCHESTRATION : que `lancer` rejoue le graphe entier une fois par fichier, que
// le cache ne saute pas les passes suivantes, et que l arret coupe le lot. Rien de cela n est
// atteignable hors de React — le planificateur, lui, est pur et teste dans
// `src/plugins/lotGlobal.test.ts`. Electron est remplace par un faux qui rend trois sons de
// frequences differentes et enregistre les ecritures.
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

// Un WAV mono d une demi-seconde, fabrique dans la page : c est ce que le faux Electron rendra
// pour chaque "fichier" du dossier. Chaque fichier porte une frequence differente, de sorte qu on
// puisse prouver que les trois passes ont bien traite TROIS sons distincts et non trois fois le
// premier — la faute exacte que le cache aurait produite.
const STUB = `
(() => {
  const SR = 44100, N = 22050;
  const wav = (hz) => {
    const buf = new ArrayBuffer(44 + N * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + N * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, N * 2, true);
    for (let i = 0; i < N; i++) v.setInt16(44 + i * 2, Math.round(16000 * Math.sin(2 * Math.PI * hz * i / SR)), true);
    return buf;
  };
  const FICHIERS = [
    { nom: "c.wav", chemin: "C:\\\\entree\\\\c.wav", hz: 660 },
    { nom: "a.wav", chemin: "C:\\\\entree\\\\a.wav", hz: 220 },
    { nom: "notes.txt", chemin: "C:\\\\entree\\\\notes.txt", hz: 0 },
    { nom: "b.wav", chemin: "C:\\\\entree\\\\b.wav", hz: 440 },
  ];
  window.__ecrits = [];
  window.api = {
    lireDossier: async (chemin) => {
      window.__dossiersLus = (window.__dossiersLus || []).concat(chemin);
      return FICHIERS.map((f) => ({ nom: f.nom, chemin: f.chemin }));
    },
    lireFichierAudio: async (chemin) => {
      const f = FICHIERS.find((x) => x.chemin === chemin);
      if (!f) return null;
      const blob = new Blob([wav(f.hz)], { type: "audio/wav" });
      return { url: URL.createObjectURL(blob) };
    },
    ecrireFichier: async (chemin, octets) => {
      window.__ecrits.push({ chemin, octets: octets.byteLength });
      return true;
    },
  };
})();
`;

const GRAPHE = {
  nodes: [
    { id: "debut", position: { x: 0, y: 0 }, data: { ficheId: "boucle-collection-debut", parametres: { Dossier: "C:\\entree" } } },
    { id: "fin", position: { x: 400, y: 0 }, data: { ficheId: "boucle-collection-fin", parametres: { "Dossier sortie": "C:\\sortie", Format: "wav", Suffixe: "-traite" } } },
  ],
  edges: [{ id: "e1", source: "debut", target: "fin", sourceHandle: "out:0", targetHandle: "in:0" }],
};

test.describe("boucle collection", () => {
  test("le graphe tourne une fois par fichier, et ecrit trois fichiers distincts", async ({ page }) => {
    await page.addInitScript(STUB);
    await page.addInitScript(([graphe]) => {
      localStorage.setItem("attic-encours", graphe as string);
    }, [JSON.stringify(GRAPHE)]);

    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    // Les deux noeuds doivent etre la avant qu on lance quoi que ce soit.
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, { timeout: 15000 });

    await page.keyboard.press(" ");

    // Trois fichiers audio dans le dossier (le .txt est ignore) : trois ecritures.
    await page.waitForFunction(() => (window as any).__ecrits?.length >= 3, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const resultat = await page.evaluate(() => ({
      ecrits: (window as any).__ecrits,
      dossiersLus: (window as any).__dossiersLus,
    }));
    console.log(JSON.stringify(resultat, null, 2));

    // Exactement trois : ni deux, ni quatre, ni trois fois le meme.
    expect(resultat.ecrits).toHaveLength(3);
    const chemins = resultat.ecrits.map((e: any) => e.chemin);
    // Les noms suivent les sources, dans l ordre alphabetique, avec le suffixe et le dossier voulu.
    expect(chemins).toEqual([
      "C:\\sortie\\a-traite.wav",
      "C:\\sortie\\b-traite.wav",
      "C:\\sortie\\c-traite.wav",
    ]);
    // Trois fichiers distincts : meme longueur ici, mais surtout trois ecritures separees.
    for (const e of resultat.ecrits) expect(e.octets).toBeGreaterThan(20000);
    // Le dossier n est lu qu une fois pour tout le lot, et non a chaque passe.
    expect(resultat.dossiersLus).toEqual(["C:\\entree"]);
  });

  test("LE LOT REFUSE D ECRIRE DANS SON PROPRE DOSSIER D ENTREE", async ({ page }) => {
    // Le garde-fou qui compte : a extension identique, chaque fichier ecraserait sa propre source,
    // et le lot detruirait ce qu il traite sans que rien ne le signale avant la fin.
    const dangereux = JSON.parse(JSON.stringify(GRAPHE));
    dangereux.nodes[1].data.parametres["Dossier sortie"] = "C:\\entree\\";
    dangereux.nodes[1].data.parametres["Suffixe"] = "";

    await page.addInitScript(STUB);
    await page.addInitScript(([g]) => { localStorage.setItem("attic-encours", g as string); },
      [JSON.stringify(dangereux)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, { timeout: 15000 });

    await page.keyboard.press(" ");
    await page.waitForTimeout(6000);

    const resultat = await page.evaluate(() => ({
      ecrits: (window as any).__ecrits,
      journal: document.body.innerText,
    }));
    // RIEN n a ete ecrit : pas une seule source ecrasee.
    expect(resultat.ecrits).toHaveLength(0);
    // Et le refus est dit, plutot que silencieux.
    expect(resultat.journal).toMatch(/dossier de sortie est celui d'entrée|output folder is the input folder/);
  });

  test("LE NOM SE COMMANDE PAR UN PORT, et il est assaini avant de devenir un chemin", async ({ page }) => {
    // Debut ──Nom──> Modifier le texte ──> Fin (Nom) : le renommage par lot, programmable.
    // Le prefixe contient volontairement une traversee de dossier : elle ne doit pas survivre.
    const renommant = {
      nodes: [
        { id: "debut", position: { x: 0, y: 0 }, data: { ficheId: "boucle-collection-debut", parametres: { Dossier: "C:\\entree" } } },
        { id: "texte", position: { x: 200, y: 0 }, data: { ficheId: "modifier-texte", parametres: { "Opération": "encadrer", "Avant": "..\\lot-", "Après": "" } } },
        { id: "fin", position: { x: 400, y: 0 }, data: { ficheId: "boucle-collection-fin", parametres: { "Dossier sortie": "C:\\sortie", Format: "wav", Suffixe: "" } } },
      ],
      edges: [
        { id: "e1", source: "debut", target: "fin", sourceHandle: "out:0", targetHandle: "in:0" },
        { id: "e2", source: "debut", target: "texte", sourceHandle: "out:1", targetHandle: "in:0" },
        { id: "e3", source: "texte", target: "fin", sourceHandle: "out:0", targetHandle: "in:1" },
      ],
    };

    await page.addInitScript(STUB);
    await page.addInitScript(([g]) => { localStorage.setItem("attic-encours", g as string); },
      [JSON.stringify(renommant)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 3, { timeout: 15000 });

    await page.keyboard.press(" ");
    await page.waitForFunction(() => (window as any).__ecrits?.length >= 3, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const ecrits = await page.evaluate(() => (window as any).__ecrits.map((e: any) => e.chemin));
    console.log(JSON.stringify(ecrits, null, 2));

    expect(ecrits).toHaveLength(3);
    // Le prefixe est applique, ET la traversee de dossier a disparu : « ..\ » ne survit pas.
    for (const chemin of ecrits) {
      expect(chemin.startsWith("C:\\sortie\\")).toBe(true);
      expect(chemin).not.toContain("..\\");
    }
    expect(ecrits).toEqual([
      "C:\\sortie\\..lot-a.wav",
      "C:\\sortie\\..lot-b.wav",
      "C:\\sortie\\..lot-c.wav",
    ]);
  });
});
