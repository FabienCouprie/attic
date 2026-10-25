// tests-e2e/format-projet.spec.ts — Le numéro de format et le rapport de chargement, DANS L'APPLICATION.
//
// ═══ POURQUOI CE FICHIER EXISTE ═══
//
// RELEVÉ LE 2026-10-25 par une revue critique du dépôt : « Le format de projet n'a ni version, ni
// migration, ni rapport de chargement. Toutes les pertes au chargement ne laissent qu'un
// console.warn : fiche inconnue, arête rejetée, fichier introuvable sur une autre machine. »
//
// LES CAS UNITAIRES NE SUFFISENT PAS ICI, et c'est la leçon de la journée. `core/format-projet.ts`
// et `ui/pertes-chargement.ts` sont éprouvés directement, mais rien ne dit qu'ils sont APPELÉS :
// le numéro pourrait n'être écrit nulle part, et le rapport calculé sans jamais paraître. Les deux
// gestes se font donc ici pour de vrai — un fichier déposé dans l'entrée de la barre d'outils, un
// enregistrement récupéré en téléchargement.
//
// ET LE FICHIER DÉPOSÉ PORTE LES QUATRE PERTES À LA FOIS : un format venu du futur, une fiche que
// rien ne connaît, un réglage que sa fiche ne déclare plus, un câble sans port. Un cas par nature
// laisserait passer un rapport qui n'en dirait qu'une.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5245);

/**
 * Un projet qui perd quelque chose de chaque nature.
 *
 * `oscillateur` existe, et « Fréquence inventée » n'est pas un de ses réglages. `composant-parti`
 * n'existe nulle part. Le câble `e-fantome` vise un nœud absent.
 */
const PROJET_ABIME = {
  formatVersion: 99,
  nodes: [
    { id: "n-1", type: "atelier", position: { x: 0, y: 0 },
      data: { ficheId: "oscillateur", parametres: { Forme: "Sinus", "Fréquence inventée": 440 } } },
    { id: "n-2", type: "atelier", position: { x: 300, y: 0 },
      data: { ficheId: "composant-parti", parametres: {} } },
  ],
  edges: [
    { id: "e-fantome", source: "n-1", target: "n-absent", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
  metas: [],
};

/** Un projet sain : un seul oscillateur, tous ses réglages déclarés. */
const PROJET_SAIN = {
  formatVersion: 1,
  nodes: [
    { id: "n-1", type: "atelier", position: { x: 0, y: 0 },
      data: { ficheId: "oscillateur", parametres: { Forme: "Sinus" } } },
  ],
  edges: [],
  metas: [],
};

test.describe("le format de projet", () => {
  test.setTimeout(180_000);

  test("LE RAPPORT DE CHARGEMENT PARAÎT À L'ÉCRAN, et nomme les quatre natures de perte", async ({ page }) => {
    const bac = mkdtempSync(join(tmpdir(), "attic-format-"));
    const fichier = join(bac, "projet-abime.json");
    writeFileSync(fichier, JSON.stringify(PROJET_ABIME, null, 2), "utf8");
    try {
      const messages: string[] = [];
      page.on("dialog", async (d) => { messages.push(d.message()); await d.accept(); });
      await page.goto(devUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow", { timeout: 60_000 });

      // L'ENTRÉE EST CACHÉE, et c'est normal : la barre d'outils la déclenche par son bouton.
      // `setInputFiles` la remplit comme un choix de fichier réel, ce qui déclenche `onImporter`.
      await page.setInputFiles('input[type="file"][accept=".json"]', fichier);
      await page.waitForTimeout(3000);

      const rapport = messages.join("\n");
      console.log(`rapport de chargement :\n${rapport || "(aucun message)"}`);
      expect(rapport, "aucun message : le rapport est calculé et jamais montré").not.toBe("");
      expect(rapport, "un format venu du futur se dit, sans quoi on enregistre par-dessus")
        .toContain("99");
      expect(rapport, "la fiche introuvable se nomme").toContain("composant-parti");
      expect(rapport, "le réglage orphelin se nomme").toContain("Fréquence inventée");
      expect(rapport, "le câble retiré se nomme").toContain("e-fantome");

      // ET LE GRAPHE S'EST BIEN OUVERT DERRIÈRE LE MESSAGE : un rapport n'est pas un refus.
      const noeuds = await page.locator(".react-flow__node").count();
      expect(noeuds, "les deux nœuds sont posés, rapport ou non").toBe(2);
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });

  test("ET UN PROJET SAIN N'EN DIT RIEN : un avertissement permanent ne se lit plus", async ({ page }) => {
    const bac = mkdtempSync(join(tmpdir(), "attic-format-sain-"));
    const fichier = join(bac, "projet-sain.json");
    writeFileSync(fichier, JSON.stringify(PROJET_SAIN, null, 2), "utf8");
    try {
      const messages: string[] = [];
      page.on("dialog", async (d) => { messages.push(d.message()); await d.accept(); });
      await page.goto(devUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow", { timeout: 60_000 });
      await page.setInputFiles('input[type="file"][accept=".json"]', fichier);
      await page.waitForTimeout(3000);
      console.log(`messages sur un projet sain : ${messages.length}`);
      expect(messages.join("\n")).toBe("");
      expect(await page.locator(".react-flow__node").count()).toBe(1);
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });

  test("ET CE QUE L'APPLICATION ÉCRIT PORTE SON NUMÉRO DE FORMAT", async ({ page }) => {
    await page.goto(devUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow", { timeout: 60_000 });
    // Un graphe d'un nœud suffit : ce qu'on mesure est l'en-tête du fichier, non son contenu.
    const bac = mkdtempSync(join(tmpdir(), "attic-format-ecrit-"));
    try {
      const fichier = join(bac, "depart.json");
      writeFileSync(fichier, JSON.stringify(PROJET_SAIN, null, 2), "utf8");
      page.on("dialog", async (d) => { await d.accept(); });
      await page.setInputFiles('input[type="file"][accept=".json"]', fichier);
      await page.waitForTimeout(2000);

      // EN MODE WEB, ENREGISTRER DÉCLENCHE UN TÉLÉCHARGEMENT — c'est écrit dans le hook. On le
      // récupère, ce qui donne l'octet pour octet de ce que l'application écrit.
      //
      // LE RACCOURCI PLUTÔT QUE LE BOUTON, et ce n'est pas un détour : le titre du bouton vient des
      // traductions, de sorte qu'un cas qui le cherche par son texte tombe au premier mot changé.
      // `Ctrl+Shift+S` est `onExporter` dans `BarreOutils.tsx`, qui force l'écriture.
      //
      // ET LE CANEVAS REÇOIT UN CLIC D'ABORD : le raccourci est ignoré quand le focus est dans un
      // champ de saisie, et `setInputFiles` vient de le poser sur l'entrée de fichier.
      await page.locator(".react-flow__pane").click({ position: { x: 500, y: 400 } });
      const [telechargement] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        page.keyboard.press("Control+Shift+S"),
      ]);
      const chemin = await telechargement.path();
      expect(chemin, "aucun fichier téléchargé").toBeTruthy();
      const ecrit = JSON.parse(readFileSync(chemin as string, "utf8"));
      console.log(`clés écrites : ${Object.keys(ecrit).join(", ")}`);
      expect(ecrit.formatVersion, "le fichier écrit doit porter son numéro de format").toBe(1);
      // ET LE NUMÉRO EST EN TÊTE : on le lit alors sans dérouler le reste du fichier.
      expect(Object.keys(ecrit)[0]).toBe("formatVersion");
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });
});
