// tests-e2e/moss-dans-application.spec.ts — Une mise en page devient une image, dans l'application réelle.
//
// CE QUE LES CAS UNITAIRES NE PEUVENT PAS DIRE. `texte-image-moss.test.ts` tient ce qui part vers le
// pont, `electron/sdcpp.test.ts` ce que le pont dit au moteur. Aucun des deux ne lance
// stable-diffusion.cpp avec ses quatre fichiers, ni n'écrit le prompt dans un fichier qu'il relit.
//
// QUATRE CHOSES Y SONT TENUES :
//   1. LE PROMPT EST UN JSON DE MISE EN PAGE QUI PORTE DES ACCENTS. C'est le chemin par fichier
//      UTF-8 qu'on éprouve ; sur la ligne de commande, il traverserait l'encodage de Windows ;
//   2. L'AVANCEMENT ARRIVE ÉTAPE PAR ÉTAPE, compté en étapes distinctes vues sur le nœud. Un cas qui
//      se contenterait d'en apercevoir une resterait vert sans le séparateur de `lancerTravail` :
//      la barre entière arrive alors en une ligne à la fin, et le nœud en montre une un instant ;
//   3. L'IMAGE A LA TAILLE DEMANDÉE ;
//   4. L'IMAGE SE VOIT DANS LE NŒUD. Relevé le 2026-10-29 : le nœud passait à « Terminé » et ne
//      montrait rien, faute de vue au registre ; l'image n'existait que dans le magasin des résultats.
//
// IL NE JUGE PAS L'IMAGE, et ses huit étapes en 512 × 512 ne sont pas faites pour la juger : c'est
// le chemin qu'il tient. Il se saute sans le moteur, sans les quatre fichiers ou sans build.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MOTEUR = join(RACINE, "bin", "sdcpp", "sd-cli.exe");
const FICHIERS = ["moss-image-sft-q4_k.gguf", "qwen3.5-9b-q4_k_m.gguf", "flux2-vae.safetensors", "moss-image-tokenizer.json"]
  .map((f) => join(RACINE, "public", "sdcpp", f));
const ETAPES = 8;

const MISE_EN_PAGE = JSON.stringify({
  summary: { meta: ["album cover"], canvas: "single", caption: "An album cover with a brass gramophone in a dusty attic." },
  items: [
    { label: "text", caption: "The title in white capital letters at the top.", text: "LE GRENIER", bbox: [-220, -200, -150, 200] },
    { label: "object", caption: "A brass gramophone horn.", bbox: [-120, -150, 130, 150] },
    { label: "text", caption: "A subtitle in white italic at the bottom.", text: "musique concrète", bbox: [170, -180, 210, 180] },
  ],
  bbox_coord_space: "abs_centralized", bbox_format: "yxyx",
});

function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

test.describe("MOSS-Image, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MOTEUR), "stable-diffusion.cpp absent : « npm run outils ».");
  test.skip(!FICHIERS.every(existsSync), "MOSS-Image absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(900000);

  test("UNE MISE EN PAGE ACCENTUÉE DEVIENT UNE IMAGE, et l'avancement arrive pendant", async ({}, info) => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(([prompt, etapes]) => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [{ id: "moss", position: { x: 0, y: 0 }, data: { ficheId: "texte-image-moss", parametres: {
            "Prompt": prompt, "Largeur": 512, "Hauteur": 512, "Étapes": etapes, "Guidage": 3, "Graine": 42, "Calcul": "" } } }],
          edges: [],
        }));
      }, [MISE_EN_PAGE, ETAPES] as const);
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="moss"]').waitFor({ timeout: 60000 });
      await page.evaluate((etapes) => {
        const vues = new Set<string>();
        (window as unknown as { __etapes__: Set<string> }).__etapes__ = vues;
        const noeud = document.querySelector('[data-id="moss"]')!;
        const motif = new RegExp(`(\\d+)\\/${etapes}(?!\\d)`, "g");
        new MutationObserver(() => {
          for (const m of (noeud.textContent ?? "").matchAll(motif)) vues.add(m[1]);
        }).observe(noeud, { subtree: true, childList: true, characterData: true });
      }, ETAPES);
      const debut = Date.now();
      await page.getByRole("button", { name: /Lancer/ }).click();
      await expect(page.locator('[data-id="moss"]')).toContainText(/Graine 42|Seed 42/, { timeout: 840000 });
      const duree = Math.round((Date.now() - debut) / 1000);

      const rendu = await page.evaluate(async () => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown[]> } })
          .__attic_execution__?.resultats;
        const image = (r instanceof Map ? r.get("moss")?.[0] : null) as File | null;
        if (!image) return null;
        const bitmap = await createImageBitmap(image);
        return { largeur: bitmap.width, hauteur: bitmap.height, octets: Array.from(new Uint8Array(await image.arrayBuffer())) };
      });
      const etapes = await page.evaluate(() => (window as unknown as { __etapes__: Set<string> }).__etapes__.size);
      expect(rendu, "le composant doit avoir rendu une image").not.toBe(null);
      writeFileSync(info.outputPath("moss-dans-application.png"), Buffer.from(rendu!.octets));
      console.log(`image ${rendu!.largeur} × ${rendu!.hauteur} · ${rendu!.octets.length} octets · ${duree} s · étapes vues ${etapes} sur ${ETAPES}`);

      // ═══ 2. L'AVANCEMENT, PENDANT ET NON À LA FIN ═══
      expect(etapes, "les étapes ne sont pas arrivées une à une sur le nœud").toBeGreaterThanOrEqual(ETAPES - 2);
      // ═══ 3. LA TAILLE DEMANDÉE ═══
      expect([rendu!.largeur, rendu!.hauteur]).toEqual([512, 512]);
      // ═══ 4. L'IMAGE DANS LE NŒUD, décodée, et qui y occupe une place ═══
      const vue = page.locator('[data-id="moss"] img');
      await expect(vue, "le nœud ne montre pas l'image qu'il a rendue").toHaveCount(1, { timeout: 10000 });
      await expect.poll(() => vue.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([512, 512]);
      const place = await vue.evaluate((i: HTMLImageElement) => [i.offsetWidth, i.offsetHeight]);
      await page.locator('[data-id="moss"]').screenshot({ path: info.outputPath("moss-dans-le-noeud.png") });
      console.log(`image dans le nœud : ${place[0]} × ${place[1]} px de mise en page`);
      expect(Math.min(...place), "l'image doit occuper une place dans le nœud").toBeGreaterThanOrEqual(120);
    } finally {
      await app.close();
    }
  });

  // UNE PHRASE RÉÉCRITE EN MISE EN PAGE, demandé par Fabien le 2026-10-30. Ce cas tient la chaîne
  // entière : Ollama rédige, le compilateur convertit, le modèle se décharge, MOSS dessine sur la carte
  // libérée, et la sortie « Mise en page » arrive dans « Sortie texte ». Il se saute sans Ollama ou
  // sans le modèle de langue par défaut.
  test("UNE PHRASE DEVIENT UNE MISE EN PAGE RÉDIGÉE, qui part au moteur et sort en texte", async ({}, info) => {
    const MODELE = "gemma4:12b";
    const pret = await fetch("http://127.0.0.1:11434/api/tags").then((r) => r.json())
      .then((d: { models?: { name: string }[] }) => !!d.models?.some((m) => m.name === MODELE)).catch(() => false);
    test.skip(!pret, `Ollama injoignable ou ${MODELE} absent.`);
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(([etapes]) => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "moss", position: { x: 0, y: 0 }, data: { ficheId: "texte-image-moss", parametres: {
              "Prompt": "une pochette d'album intitulée LE GRENIER, avec un gramophone en laiton dans un grenier poussiéreux, et le sous-titre musique concrète en bas",
              "Réécriture": "mise-en-page", "Largeur": 512, "Hauteur": 512, "Étapes": etapes, "Graine": 42, "Calcul": "" } } },
            { id: "texte", position: { x: 420, y: 0 }, data: { ficheId: "sortie-texte", parametres: {} } },
          ],
          edges: [{ id: "e1", source: "moss", sourceHandle: "out:1", target: "texte", targetHandle: "in:0" }],
        }));
      }, [ETAPES] as const);
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="moss"]').waitFor({ timeout: 60000 });
      const debut = Date.now();
      await page.getByRole("button", { name: /Lancer/ }).click();
      await expect(page.locator('[data-id="moss"]')).toContainText(/Graine 42|Seed 42/, { timeout: 840000 });
      const duree = Math.round((Date.now() - debut) / 1000);
      const json = await page.evaluate(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown[]> } }).__attic_execution__?.resultats;
        return (r instanceof Map ? r.get("moss")?.[1] : null) as string | null;
      });
      await expect(page.locator('[data-id="texte"] textarea')).toHaveValue(json ?? "(rien)", { timeout: 10000 });
      writeFileSync(info.outputPath("mise-en-page.json"), json ?? "");
      await page.locator('[data-id="moss"]').screenshot({ path: info.outputPath("mise-en-page-dans-le-noeud.png") });
      const m = JSON.parse(json ?? "null") as { items: { label: string; text?: string; bbox: number[] }[]; bbox_coord_space: string; bbox_format: string };
      console.log(`mise en page en ${duree} s, ${m.items.length} éléments : ${json}`);

      expect([m.bbox_coord_space, m.bbox_format]).toEqual(["abs_centralized", "yxyx"]);
      // DES BOÎTES ENTIÈRES, DANS LA TOILE, DEPUIS SON CENTRE : sur 512 de côté, de moins 256 à 256.
      for (const { bbox: [y1, x1, y2, x2] } of m.items) {
        expect([y1, x1, y2, x2].every((v) => Number.isInteger(v) && v >= -256 && v <= 256) && y1 < y2 && x1 < x2, json!).toBe(true);
      }
      // LES MOTS DEMANDÉS DEVIENNENT DES ÉLÉMENTS TEXTE, tels qu'ils ont été écrits.
      expect(m.items.filter((i) => i.label === "text").map((i) => i.text), json!).toContain("LE GRENIER");
      await expect(page.locator('[data-id="moss"] img'), "le nœud ne montre pas l'image").toHaveCount(1);
    } finally {
      await app.close();
    }
  });
});
