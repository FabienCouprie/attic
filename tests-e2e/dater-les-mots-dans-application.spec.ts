// tests-e2e/dater-les-mots-dans-application.spec.ts — La reconnaissance horodatée, dans la vraie
// application.
//
// CE CAS PEUT EXIGER PLUS QUE SES VOISINS, et c'est une chance qu'il faut saisir. Les autres
// composants à modèle sont éprouvés sur un métronome, parce que ce qu'un modèle en tire n'importe
// pas : seule la traversée du pont compte. Ici le composant rend du TEXTE, et le dépôt porte un
// synthétiseur : on peut donc lui faire dire une phrase choisie et vérifier qu'il la retrouve.
//
// LA PHRASE EST DONC CONNUE, et le cas tient trois choses qu'un métronome ne permettrait pas : que
// les mots reconnus soient ceux qu'on a fait dire, que leurs instants montent, et qu'ils tiennent
// tous dans la durée du son.
//
// SANS LE CLONEUR, L'ÉPREUVE S'IGNORE EN LE DISANT. Deux modèles sont nécessaires — celui qui parle
// et celui qui écoute — et aucun n'est présent en intégration continue.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE = join(RACINE, "public", "audiocpp", "parakeet-tdt-0.6b-v3-q8_0.gguf");
const PIPER = join(RACINE, "public", "piper-tts");

/** La phrase qu'on fait dire, et dont on exige le retour. Des mots courants, sans nom propre. */
const PHRASE = "Le chat noir dort sur le tapis rouge du salon.";
const ATTENDUS = ["chat", "noir", "dort", "tapis", "rouge", "salon"];

function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

test.describe("dater les mots, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE), "Modèle Parakeet absent : le récupérer depuis le panneau des modèles.");
  test.skip(!existsSync(PIPER), "Voix Piper absente : c'est elle qui prononce la phrase à reconnaître.");
  test.setTimeout(420000);

  test("« DATER LES MOTS » TRAVERSE LE PONT ET REND DES INSTANTS QUI MONTENT", async () => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      // LA PHRASE EST PASSÉE EN ARGUMENT : `page.evaluate` s'exécute dans la page, où les
      // constantes de ce fichier n'existent pas. Sans cela, « PHRASE is not defined ».
      await page.evaluate((phrase) => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "dit", position: { x: -360, y: 0 },
              data: { ficheId: "source-texte", parametres: { "Texte": phrase } } },
            // LA VOIX EST CHOISIE, ET IL FALLAIT Y PENSER : le défaut de ce synthétiseur est
            // « Irina (russe) ». Elle lisait la phrase française avec une phonétique russe, et le
            // moteur de reconnaissance y entendait du cyrillique — « Ладшатма доцал латап » — ce
            // qui était sa bonne réponse à une mauvaise question.
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "tts-piper", parametres: { "Voix": "FR-siwis-medium" } } },
            { id: "dat", position: { x: 360, y: 0 },
              data: { ficheId: "dater-les-mots", parametres: { "Calcul": "" } } },
            { id: "txt", position: { x: 720, y: 0 }, data: { ficheId: "sortie-texte", parametres: {} } },
          ],
          edges: [
            { id: "e0", source: "dit", target: "src", sourceHandle: "out:0", targetHandle: "in:0" },
            { id: "e1", source: "src", target: "dat", sourceHandle: "out:0", targetHandle: "in:0" },
            { id: "e2", source: "dat", target: "txt", sourceHandle: "out:1", targetHandle: "in:0" },
          ],
        }));
      }, PHRASE);
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const noeud = page.locator('[data-id="dat"]');
      await noeud.waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer/ }).click();

      // LE CHIFFRE EST EXIGÉ DEVANT LE MOT, et ce n'est pas une coquetterie : « Mots » est aussi le
      // nom d'un PORT, affiché dès que le nœud est posé. Écrit sans le chiffre, ce cas se
      // satisfaisait du nom du port et lisait le nœud à l'étape 2 sur 3, pendant qu'il travaillait
      // encore — vert en ne prouvant rien. La leçon était déjà écrite dans
      // `pont-electron-vivant.spec.ts`, où « Étiquettes » avait tendu le même piège.
      //
      // L'UNE OU L'AUTRE RÉPONSE EST ACCEPTÉE : sur un métronome le moteur peut n'entendre aucun
      // mot, et le composant le dit alors en clair. Les deux sont des réponses ; ce qui ne va pas,
      // c'est que le pont manque ou que le modèle soit introuvable.
      await expect(noeud).toContainText(/\d+\s*mots|Aucun mot|No word/i, { timeout: 360000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);
      expect(rendu, "l'entrée doit arriver").not.toMatch(/Brancher un son/);

      // LES INSTANTS MONTENT, ET TIENNENT DANS LE SON. C'est ce qu'on peut exiger sans connaître le
      // texte : la ligne des mots est lue à l'écran, et ses instants doivent croître sans jamais
      // dépasser la durée du métronome.
      const lignes = await page.locator('[data-id="txt"] textarea, [data-id="txt"] pre')
        .first().inputValue().catch(() => "");
      const instants = [...lignes.matchAll(/(\d\d):(\d\d\.\d\d)/g)]
        .map((m) => Number(m[1]) * 60 + Number(m[2]));
      // LES MOTS SONT EXIGÉS, ET C'EST LA PHRASE QU'ON A FAIT DIRE. Écrit d'abord sur un
      // métronome, ce cas n'avait aucun mot à lire — le moteur n'y entendait rien, à juste titre —
      // et cette partie ne pouvait pas tomber. Un garde qui ne peut pas tomber n'en est pas un.
      const manquants = ATTENDUS.filter((m) => !new RegExp(m, "i").test(lignes));
      expect(manquants, `ces mots de « ${PHRASE} » n'ont pas été retrouvés, lu : ${lignes.slice(0, 200)}`)
        .toEqual([]);

      expect(instants.length, "chaque mot doit porter son instant").toBeGreaterThanOrEqual(ATTENDUS.length);
      const monte = instants.every((t, i) => i === 0 || t >= instants[i - 1] - 1e-9);
      expect(monte, `les instants doivent monter : ${instants.slice(0, 8).join(" ")}`).toBe(true);
      // LA DURÉE DU SON EST LA BORNE : aucun mot ne peut être prononcé après la fin.
      const duree = await page.evaluate(() => {
        const r = (globalThis as unknown as { __attic_execution__?: { resultats?: Map<string, unknown> } })
          .__attic_execution__?.resultats;
        const v = r instanceof Map ? r.get("src") : null;
        const b = (Array.isArray(v) ? v[0] : v) as AudioBuffer | null;
        return b && typeof b.duration === "number" ? b.duration : null;
      });
      expect(duree, "la synthèse doit avoir rendu du son").not.toBe(null);
      expect(Math.max(...instants), "aucun mot ne tombe après la fin du son")
        .toBeLessThanOrEqual(duree! + 0.1);
    } finally {
      await app.close();
    }
  });
});
