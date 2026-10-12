// tests-e2e/apercu-en-deux-temps.spec.ts — Un nœud terminé n'est jamais sans moyen d'écoute.
//
// RELEVÉ PAR FABIEN le 2026-10-12 : « Le Paulstretch perd son lecteur après exécution », et après
// mesure : « il n'y a pas de bouton écouter ». Le lecteur n'était pas perdu, il arrivait tard. Le
// moteur encodait l'aperçu écoutable de CHAQUE nœud audio avant de poser quoi que ce soit, et le
// seul `setNodes` n'avait lieu qu'après le dernier encodage : jusque-là le nœud affichait
// « Terminé » sans lecteur, sans bouton et SANS SON MESSAGE.
//
// MESURÉ AVANT CORRECTION, source de sept secondes étirée quatre-vingt-dix fois, nœud terminal :
// statut « Terminé » à 17 669 ms, lecteur à 22 402 ms, soit 4,7 s de vide. Et ce vide suit la durée
// rendue, à 8,5 ms par seconde de sortie : 2,3 s pour cinq minutes, 23 s pour quarante-cinq
// minutes, 46 s pour une heure. Une minute de source étirée soixante fois laisse donc le nœud vide
// une minute entière après avoir annoncé qu'il avait fini.
//
// ET LE VIDE NE FRAPPAIT QUE LE NŒUD QU'ON REGARDE. Un intermédiaire non sélectionné ne construit
// aucun aperçu — la garde des dix minutes le lui épargne — et recevait donc son bouton tout de
// suite. C'est le nœud sélectionné ou terminal, celui qu'on a sous les yeux, qui payait l'attente.
//
// POURQUOI CELA NE SE TESTE QUE DANS L'APPLICATION. Ce qui a changé est l'ORDRE de deux travaux
// asynchrones dans la boucle de fin de run, et ce que l'écran porte entre les deux. Le magasin des
// statuts et l'écriture par tranches ont leurs cas à part, dans `src/ui/statuts.test.ts` et
// `src/audio/io.test.ts` ; l'invariant qui suit, lui, porte sur ce que montre un nœud à un instant
// donné, et il n'existe qu'ici.
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

/**
 * Sept secondes de source étirées quatre-vingt-dix fois : dix minutes et demie de sortie.
 *
 * LE FACTEUR EST CHOISI POUR QUE L'ENCODAGE DURE, et non au hasard. À 630 secondes de sortie il
 * prend 5,6 s, assez pour qu'un échantillonnage à cinquante millisecondes traverse largement
 * l'intervalle où le défaut vivait. Une source plus longue le rendrait plus net encore, au prix
 * d'un cas qui dure des minutes.
 */
const GRAPHE = {
  nodes: [
    { id: "gen", position: { x: 0, y: 0 }, data: { ficheId: "generateur-frequence", parametres: { "Durée": 7, "Fréquence": 220 } } },
    { id: "paul", position: { x: 340, y: 0 }, data: { ficheId: "paulstretch", parametres: { "Stretch": 90 } } },
  ],
  edges: [{ id: "e1", source: "gen", target: "paul", sourceHandle: "out:0", targetHandle: "in:0" }],
};

test.describe("l'aperçu écoutable se construit après que le résultat est posé", () => {
  test("un nœud terminé porte toujours un lecteur ou un bouton, et dit où en est le lecteur", async ({ page }) => {
    test.setTimeout(180000);
    await page.addInitScript(([g]: string[]) => { localStorage.setItem("attic-encours", g); }, [JSON.stringify(GRAPHE)]);
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length >= 2, null, { timeout: 20000 });

    // L'ÉCHANTILLONNAGE EST ARMÉ AVANT LE CLIC, et il tourne dans la page : lire depuis Playwright
    // à chaque pas laisserait passer l'intervalle, qui dure quelques secondes et n'a aucune raison
    // de tomber entre deux allers-retours.
    await page.evaluate(() => {
      const w = window as unknown as { __releve?: unknown[] };
      const releve: unknown[] = [];
      w.__releve = releve;
      const noeud = () => document.querySelector('.react-flow__node[data-id="paul"]');
      setInterval(() => {
        const el = noeud();
        if (!el) return;
        const texte = el.textContent ?? "";
        releve.push({
          termine: /Terminé/.test(texte),
          lecteur: el.querySelectorAll("audio").length > 0,
          bouton: /Écouter|Listen/.test(texte),
          message: /90,0 ×|90\.0 ×/.test(texte),
          mention: !!el.querySelector(".attic-node-apercu"),
          part: el.querySelector(".attic-node-apercu")?.textContent?.trim() ?? null,
        });
      }, 50);
    });

    await page.click(".attic-btn-lancer");
    await page.waitForFunction(
      () => document.querySelectorAll('.react-flow__node[data-id="paul"] audio').length > 0,
      null, { timeout: 150000 },
    );

    const releve = await page.evaluate(() => (window as unknown as { __releve: {
      termine: boolean; lecteur: boolean; bouton: boolean; message: boolean; mention: boolean;
      part: string | null;
    }[] }).__releve);

    // L'INVARIANT. Un nœud qui dit « Terminé » offre un moyen d'écoute : le lecteur construit, ou le
    // bouton qui le construit au clic. C'est exactement ce qui manquait.
    const muets = releve.filter((e) => e.termine && !e.lecteur && !e.bouton);
    expect(muets.length, `${muets.length} instants sur ${releve.length} montrent « Terminé » sans moyen d'écoute`).toBe(0);

    // ET IL PORTE SON MESSAGE DÈS QU'IL EST TERMINÉ. Le message partait dans le même retard que le
    // lecteur, de sorte que le nœud ne disait même pas ce qu'il avait produit.
    const sansMessage = releve.filter((e) => e.termine && !e.message);
    expect(sansMessage.length, `${sansMessage.length} instants sur ${releve.length} montrent « Terminé » sans message`).toBe(0);

    // LA MENTION A PARU PENDANT L'ENCODAGE, ET ELLE A AVANCÉ. Sans elle, l'attente qui reste — 46 s
    // pour une heure de son — serait muette, et c'est ce silence qui faisait croire à une perte.
    //
    // C'EST SUR L'AVANCE QUE PORTE LE CAS, et non sur la présence. Mon premier jet n'exigeait que la
    // présence, et il PASSAIT en ayant retiré du moteur le rapport d'avancement : la mention est
    // posée à zéro avant l'écriture, de sorte qu'elle paraît même quand plus rien ne la nourrit, et
    // reste à « 0 % » tout du long. Exiger trois valeurs distinctes éprouve le branchement.
    const parts = [...new Set(releve.map((e) => e.part).filter((p): p is string => !!p))];
    expect(parts.length, `parts vues : ${parts.join(" | ") || "aucune"}`).toBeGreaterThanOrEqual(3);
    const mentionApresLecteur = releve.filter((e) => e.lecteur && e.mention);
    expect(mentionApresLecteur.length, "la mention survit au lecteur qu'elle annonçait").toBe(0);

    // ET LE LECTEUR PORTE BIEN LA DURÉE ÉTIRÉE, pour que le cas ne puisse pas passer sur un aperçu
    // qui serait celui d'un autre nœud. La durée s'attend plutôt qu'elle ne se lit : l'élément
    // existe dès que son adresse est posée, et `duration` vaut `NaN` jusqu'à `loadedmetadata`.
    await page.waitForFunction(() => {
      const a = document.querySelector('.react-flow__node[data-id="paul"] audio') as HTMLAudioElement | null;
      return !!a && Number.isFinite(a.duration) && a.duration > 0;
    }, null, { timeout: 30000 });
    const duree = await page.evaluate(
      () => (document.querySelector('.react-flow__node[data-id="paul"] audio') as HTMLAudioElement).duration);
    expect(duree).toBeGreaterThan(600);
  });
});
