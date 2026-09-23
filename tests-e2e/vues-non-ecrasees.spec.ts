// tests-e2e/vues-non-ecrasees.spec.ts — Aucune vue de composant n'est écrasée à zéro pixel.
//
// POURQUOI CE BALAYAGE EXISTE.
//
// Le cercle pulsant a rendu son animation invisible pendant une journée : le SVG était dans la
// page, 20 488 signes, ses balises `animate` en place, et son conteneur mesurait zéro pixel de
// haut sous un `overflow: hidden`. Rien ne pouvait le voir. TypeScript ne connaît pas les noms de
// classe, et jsdom ne calcule aucune mise en page : il rend zéro pour toute mesure de boîte, donc
// une boîte écrasée y est indiscernable d'une boîte saine. Seul un vrai navigateur peut trancher.
//
// CE QUI EST VÉRIFIÉ, et c'est une propriété et non un rendu. Un élément DE CONTENU affiché dont
// une seule dimension vaut zéro est une boîte écrasée : large et sans hauteur, ou haute et sans
// largeur. Ce qu'il porte est alors invisible sans qu'aucune erreur ne le dise.
//
// Les éléments de contenu sont les quatre qui montrent quelque chose par eux-mêmes : `svg`,
// `canvas`, `img`, `audio`. La géométrie INTERNE d'un dessin est écartée, une ligne de portée
// étant un `path` de 97 sur 0 et une hampe un `path` de 0 sur 29, ce qui est leur forme et non un
// défaut. Un élément volontairement caché, par `display: none` ou `visibility: hidden`, ne compte
// pas ; un élément dont les deux dimensions sont nulles non plus, un conteneur vide étant
// légitime.
//
// CE QUI EST BALAYÉ. Les quatre-vingt-deux composants habillés d'une vue propre, lus dans
// `composants-vues.json`, que `npm run docs:interface` écrit depuis le registre : un composant
// nouvellement habillé entre donc dans le balayage sans qu'on ait à y penser. Ceux qui demandent
// un fichier, un modèle appris, un service réseau ou le disque sont écartés nommément, avec leur
// raison. Les autres reçoivent un son sur leur première entrée audio quand ils en ont une, sans
// quoi leur vue n'aurait rien à montrer.
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let devServer: ReturnType<typeof spawn> | null = null;
let devUrl = process.env.DEV_URL || "http://localhost:5175";

async function waitForServer(url: string, retries = 120): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try { const res = await fetch(url); if (res.ok) return; } catch { /* pas encore là */ }
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

/**
 * Les composants écartés du balayage, et pourquoi.
 *
 * Aucun n'est écarté parce qu'il échouait : chacun demande quelque chose qu'un balayage ne peut
 * pas lui donner, un fichier choisi à la main, un modèle de plusieurs dizaines de mégaoctets, un
 * service réseau, un dossier sur le disque, ou la fenêtre elle-même.
 */
const ECARTES: Record<string, string> = {
  // Un fichier que l'utilisateur désigne.
  "entree-audio": "demande un fichier audio",
  "entree-image": "demande un fichier image",
  "entree-pdf": "demande un fichier PDF",
  "lecteur-svg": "demande un fichier SVG",
  "lecteur-midi": "demande un fichier MIDI",
  "banque-sfz": "demande un fichier .sfz",
  "clavier-sfz": "demande un fichier .sfz",
  "sampler-personnalise": "demande un fichier audio",
  "clavier-apprentissage": "demande un fichier MIDI",
  "explorateur-musique": "demande un dossier de musiques",
  // Un modèle appris ou un service réseau.
  "separateur-ia": "charge un modèle de plusieurs dizaines de mégaoctets",
  "classificateur-genre": "charge un modèle appris",
  "score-esthetique": "charge un modèle appris",
  "comparaison-esthetique": "charge un modèle appris",
  "transcripteur-midi": "charge un modèle appris",
  "generateur-script-ia": "appelle un service de génération",
  "couleur-suno-ia": "appelle un service externe",
  // Un autre interpréteur installé sur la machine.
  "python-processor": "demande un interpréteur Python",
  "julia-processor": "demande un interpréteur Julia",
  "pure-data": "demande Pure Data",
  // Le disque, ou la fenêtre.
  "galerie-exposition": "écrit une galerie sur le disque",
  "carte-sonore": "écrit une carte sur le disque",
  "gestion-nodes": "installe des composants",
  "film-application": "filme la fenêtre",
  "demonstration": "encode une vidéo du graphe",
  "sortie-audio": "écrit un fichier",
  "sortie-midi": "écrit un fichier",
  "sortie-texte": "écrit un fichier",
  "convertisseur-audio": "écrit un fichier",
  "convertisseur-mp3-wav": "écrit un fichier",
  "collection-lecteur-musique": "lit un dossier du disque",
  "collection-midi-vers-mp3": "lit un dossier du disque",
  "collection-mp3-vers-wav": "lit un dossier du disque",
  "collection-vers-mp3": "lit un dossier du disque",
  "coordonnees-sur-carte": "attend une classification de collection",
};

interface EntreeBalayage {
  id: string;
  vue: string;
  entreeAudio: boolean;
  entreeRequiseAutre: boolean;
}

const LISTE: EntreeBalayage[] = JSON.parse(
  readFileSync(join(process.cwd(), "tests-e2e", "composants-vues.json"), "utf8"));

/** Ce qui est réellement balayé : tout ce qui a une vue et n'est pas écarté nommément. */
const A_BALAYER = LISTE.filter((e) => !(e.id in ECARTES));

/** Les lots, pour que l'exécution reste lisible et qu'un composant lent n'entraîne pas les autres. */
const TAILLE_LOT = 10;
const LOTS: EntreeBalayage[][] = [];
for (let i = 0; i < A_BALAYER.length; i += TAILLE_LOT) LOTS.push(A_BALAYER.slice(i, i + TAILLE_LOT));

interface Ecrasee { noeud: string; balise: string; classe: string; largeur: number; hauteur: number }

test.describe("les vues des composants ne sont pas écrasées", () => {
  test("la liste balayée couvre les composants habillés d'une vue", () => {
    // Un composant écarté qui n'existe plus laisserait une exception muette dans la table.
    const inconnus = Object.keys(ECARTES).filter((id) => !LISTE.some((e) => e.id === id));
    expect(inconnus, "ces composants écartés n'ont plus de vue : retirez-les de ECARTES").toEqual([]);
    expect(A_BALAYER.length).toBeGreaterThan(40);
  });

  for (const [n, lot] of LOTS.entries()) {
    test(`lot ${n + 1} sur ${LOTS.length} : ${lot.map((e) => e.id).join(", ")}`, async ({ page }) => {
      test.setTimeout(300000);

      // Une source audio alimente ceux qui acceptent un son : sans entrée, leur vue n'aurait rien
      // à montrer et le balayage ne verrait qu'un texte d'attente.
      const noeuds: any[] = [{
        id: "src", position: { x: 40, y: 40 }, width: 260, height: 200,
        data: { ficheId: "oscillateur", parametres: { "Durée": 2, "Fréquence": 220 } },
      }];
      const aretes: any[] = [];
      lot.forEach((e, i) => {
        noeuds.push({
          id: `n${i}`, position: { x: 400 + (i % 5) * 620, y: 40 + Math.floor(i / 5) * 700 },
          data: { ficheId: e.id, parametres: {} },
        });
        if (e.entreeAudio) {
          aretes.push({ id: `e${i}`, source: "src", target: `n${i}`, sourceHandle: "out:0", targetHandle: "in:0" });
        }
      });

      await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); },
        [JSON.stringify({ nodes: noeuds, edges: aretes })]);
      await page.goto(devUrl);
      await page.waitForSelector(".attic-app", { timeout: 20000 });
      await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length >= n,
        lot.length + 1, { timeout: 20000 });

      await page.click(".attic-btn-lancer");
      // Chaque nœud finit, en réussite ou en échec ; un échec est une vue en attente, pas un défaut.
      await page.waitForFunction(() => {
        const puces = [...document.querySelectorAll(".attic-node-statut-puce")];
        return puces.length > 0 && puces.every((p) => p.classList.contains("termine") || p.classList.contains("erreur"));
      }, null, { timeout: 240000 }).catch(() => { /* un lent : on mesure ce qui est là */ });
      await page.waitForTimeout(1500);

      const releve = await page.evaluate(() => {
        const out: { noeud: string; balise: string; classe: string; largeur: number; hauteur: number }[] = [];
        const etats: { noeud: string; statut: string }[] = [];
        for (const n of document.querySelectorAll<HTMLElement>(".react-flow__node")) {
          const id = n.dataset.id ?? "?";
          const puce = n.querySelector(".attic-node-statut-puce");
          etats.push({ noeud: id, statut: puce?.className.replace("attic-node-statut-puce", "").trim() ?? "?" });
          for (const e of n.querySelectorAll<HTMLElement>("svg, canvas, img, audio")) {
            // La geometrie INTERNE d'un dessin n'est pas une boite de mise en page : un `svg`
            // imbrique dans un `svg` suit son parent, qui est deja mesure.
            if (e.parentElement?.closest("svg")) continue;
            const cs = getComputedStyle(e);
            if (cs.display === "none" || cs.visibility === "hidden") continue;
            const r = e.getBoundingClientRect();
            const l = Math.round(r.width);
            const h = Math.round(r.height);
            // UNE BOITE ECRASEE : une dimension nulle quand l'autre ne l'est pas. Deux dimensions
            // nulles sont un conteneur vide, ce qui est legitime.
            if ((l === 0) === (h === 0)) continue;
            out.push({
              noeud: id, balise: e.tagName.toLowerCase(),
              classe: (typeof e.className === "string" ? e.className : "").slice(0, 60),
              largeur: l, hauteur: h,
            });
          }
        }
        return { ecrasees: out, etats };
      });

      const parFiche = (idNoeud: string) =>
        idNoeud === "src" ? "oscillateur" : lot[Number(idNoeud.slice(1))]?.id ?? idNoeud;
      console.log(lot.map((e, i) => `${e.id} : ${releve.etats.find((s) => s.noeud === `n${i}`)?.statut ?? "?"}`).join(" | "));

      const detail = (releve.ecrasees as Ecrasee[])
        .map((e) => `  ${parFiche(e.noeud)} : <${e.balise} class="${e.classe}"> ${e.largeur} × ${e.hauteur}`)
        .join("\n");
      expect(releve.ecrasees, [
        "Des boîtes affichées ont une dimension nulle et l'autre non : elles sont écrasées,",
        "et ce qu'elles contiennent est invisible sans qu'aucune erreur ne le dise.",
        detail,
      ].join("\n")).toEqual([]);
    });
  }
});
