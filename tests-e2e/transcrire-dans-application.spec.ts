// tests-e2e/transcrire-dans-application.spec.ts — La transcription, dans la vraie application.
//
// CE CAS EXIGE DU CONTENU, comme son voisin « Dater les mots », et pour la même raison : le dépôt
// porte un synthétiseur, donc on peut faire dire une phrase choisie et exiger qu'elle revienne. Les
// autres composants à modèle sont éprouvés sur un métronome, parce que seule la traversée du pont
// compte ; ici le composant ne rend QUE du texte, et un cas qui ne lirait pas ce texte ne vérifierait
// rien.
//
// IL TIENT UNE CHOSE DE PLUS QUE SON VOISIN : que le compte annoncé soit celui du texte rendu. Le
// dépôt a déjà payé un nœud qui montrait l'instantané d'avant le lancement ; un compte recalculé sur
// place et confronté à celui de l'écran attrape ce décalage.
//
// SANS LES DEUX MODÈLES, L'ÉPREUVE S'IGNORE EN LE DISANT : celui qui parle et celui qui écoute, dont
// aucun n'est présent en intégration continue.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE = join(RACINE, "public", "audiocpp", "qwen3-asr-0.6b-q8_0.gguf");
const PIPER = join(RACINE, "public", "piper-tts");

/** La phrase qu'on fait dire, et dont on exige le retour. Des mots courants, sans nom propre. */
const PHRASE = "Le chat noir dort sur le tapis rouge du salon.";

/**
 * Les mots exigés, chacun avec la graphie qu'on accepte pour lui.
 *
 * « DORT » EST HOMOPHONE DE « D'OR », ET CE MOTEUR CHOISIT L'UNE OU L'AUTRE GRAPHIE d'un lancement
 * à l'autre : deux passes de ce cas ont rendu les deux. Les deux formes sont donc acceptées, ce qui
 * garde le mot sans rendre le cas instable. Son voisin « Dater les mots » exige « dort » seul, parce
 * que son moteur, lui, l'écrit toujours ainsi — c'est une différence entre les deux, pas un défaut.
 */
const ATTENDUS: Array<[string, RegExp]> = [
  ["chat", /chat/i],
  ["noir", /noir/i],
  ["dort", /dort|d'or/i],
  ["tapis", /tapis/i],
  ["rouge", /rouge/i],
  ["salon", /salon/i],
];

/** La règle du composant, recopiée pour confronter son compte à ce qu'il a rendu. */
function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

test.describe("transcrire, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE), "Modèle Qwen3-ASR absent : le récupérer depuis le panneau des modèles.");
  test.skip(!existsSync(PIPER), "Voix Piper absente : c'est elle qui prononce la phrase à transcrire.");
  test.setTimeout(420000);

  test("« TRANSCRIRE » TRAVERSE LE PONT ET REND LA PHRASE QU'ON A FAIT DIRE", async () => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      // LA PHRASE EST PASSÉE EN ARGUMENT : `page.evaluate` s'exécute dans la page, où les
      // constantes de ce fichier n'existent pas.
      await page.evaluate((phrase) => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "dit", position: { x: -360, y: 0 },
              data: { ficheId: "source-texte", parametres: { "Texte": phrase } } },
            // LA VOIX EST CHOISIE, ET C'EST UNE LEÇON PAYÉE : le défaut de ce synthétiseur est
            // « Irina (russe) », qui lisait la phrase française avec une phonétique russe, et le
            // moteur de reconnaissance y entendait du cyrillique.
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "tts-piper", parametres: { "Voix": "FR-siwis-medium" } } },
            { id: "trs", position: { x: 360, y: 0 },
              data: { ficheId: "transcrire", parametres: { "Calcul": "" } } },
            { id: "txt", position: { x: 720, y: 0 }, data: { ficheId: "sortie-texte", parametres: {} } },
          ],
          edges: [
            { id: "e0", source: "dit", target: "src", sourceHandle: "out:0", targetHandle: "in:0" },
            { id: "e1", source: "src", target: "trs", sourceHandle: "out:0", targetHandle: "in:0" },
            { id: "e2", source: "trs", target: "txt", sourceHandle: "out:0", targetHandle: "in:0" },
          ],
        }));
      }, PHRASE);
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const noeud = page.locator('[data-id="trs"]');
      await noeud.waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer/ }).click();

      // LE CHIFFRE EST EXIGÉ DEVANT LE MOT, et ce n'est pas une coquetterie : écrit sans lui, un
      // cas voisin se satisfaisait du nom d'un PORT et lisait le nœud pendant qu'il travaillait
      // encore — vert en ne prouvant rien.
      await expect(noeud).toContainText(/\d+\s*(?:mots|words)/i, { timeout: 360000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);
      expect(rendu, "l'entrée doit arriver").not.toMatch(/Brancher un son/);

      // LA PHRASE EST EXIGÉE : c'est tout ce que ce composant rend, et ce moteur a été retenu pour
      // sa fidélité sur les extraits courts et nets, ce que celui-ci est.
      const texte = await page.locator('[data-id="txt"] textarea, [data-id="txt"] pre')
        .first().inputValue().catch(() => "");
      const manquants = ATTENDUS.filter(([, motif]) => !motif.test(texte)).map(([mot]) => mot);
      expect(manquants, `ces mots de « ${PHRASE} » n'ont pas été transcrits, lu : ${texte.slice(0, 200)}`)
        .toEqual([]);

      // LE COMPTE ANNONCÉ EST CELUI DU TEXTE RENDU, et non d'un état d'avant le lancement.
      const annonce = /(\d+)\s*(?:mots|words)/i.exec(rendu);
      expect(annonce, `le nœud doit annoncer un compte, lu : ${rendu.slice(0, 200)}`).not.toBe(null);
      expect(Number(annonce![1]), `annoncé ${annonce![1]} pour « ${texte.slice(0, 120)} »`)
        .toBe(compterMots(texte));
    } finally {
      await app.close();
    }
  });
});
