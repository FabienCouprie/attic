// tests-e2e/parole-dans-application.spec.ts — La diarisation et l'alignement, dans la vraie application.
//
// POURQUOI CES DEUX CAS NE PEUVENT PAS ÊTRE DES CAS UNITAIRES. Les deux nœuds traversent le pont
// d'Electron, où `window.api` existe ; la suite unitaire tourne sans lui et n'emprunte donc jamais
// le chemin qui compte. Et chacun des deux porte un piège que seule l'application révèle.
//
// LE PIÈGE DE LA DIARISATION EST LA CADENCE. Le moteur refuse net tout ce qui n'est pas du seize
// kilohertz — « MOSS-Transcribe-Diarize requires SOXR for non-16-kHz audio », le binaire publié
// n'embarquant pas SOXR — alors que le reste du dépôt travaille à quarante-huit mille. Le nœud
// descend donc le son avant de le passer, et RIEN hors de l'application ne vérifie que cette
// descente a bien lieu : le son y vient d'un contexte réel et non d'un tampon fabriqué. Le cas
// tient l'absence du refus, qui est la signature exacte d'une descente oubliée.
//
// LE PIÈGE DE L'ALIGNEMENT EST SON COMPTE DE MOTS. Un aligneur forcé ne reconnaît rien : il reçoit
// les mots et les date. Il doit donc en rendre AUTANT que le texte en porte, quel que soit le son
// qu'on lui donne — ici un métronome, où les mots tomberont n'importe où. C'est ce qui rend ce cas
// solide sans témoin de parole : le compte est exigible, le placement non.
//
// LE SON VIENT D'UN MÉTRONOME, et non d'un fichier, pour la raison écrite dans
// `pont-electron-vivant.spec.ts` : « Entrée audio » réclamerait un dialogue système que rien ne
// sait piloter ici.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE_DIAR = join(RACINE, "public", "audiocpp", "moss-transcribe-diarize-q4_k.gguf");
const MODELE_ALIGN = join(RACINE, "public", "audiocpp", "qwen3-forced-aligner-0.6b-q8_0.gguf");

/** Le texte aligné, et son compte de mots : c'est lui que le moteur doit rendre. */
const TEXTE = "Le chat noir dort sur le tapis rouge devant la grande fenetre ouverte du salon";
const MOTS_ATTENDUS = TEXTE.split(/\s+/).length;

/** L'application hors mode développement : elle charge `dist/index.html` et n'attend aucun serveur. */
function lancer(): Promise<ElectronApplication> {
  return electron.launch({ args: [RACINE], cwd: RACINE, env: { ...process.env, NODE_ENV: "" } });
}

/** Sème un graphe, recharge, lance, et rend le texte du nœud visé. */
async function jouer(app: ElectronApplication, graphe: unknown, id: string, attendu: RegExp) {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((g) => { localStorage.setItem("attic-encours", g as string); },
    JSON.stringify(graphe));
  await page.reload();
  await page.waitForSelector(".attic-app", { timeout: 60000 });
  const noeud = page.locator(`[data-id="${id}"]`);
  await noeud.waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: /Lancer/ }).click();
  await expect(noeud).toContainText(attendu, { timeout: 240000 });
  return noeud.innerText();
}

/**
 * Le texte qu'un nœud « Sortie texte » affiche.
 *
 * POURQUOI PASSER PAR LUI. Un nœud ne montre que son message ; ses sorties de texte ne s'affichent
 * nulle part dans son corps. Brancher le rapport sur une « Sortie texte » le met donc à l'écran, et
 * c'est le seul moyen de lire DANS L'APPLICATION ce que `traduire` a réellement rendu. Le dépôt a
 * payé ce manque le 2026-10-22 : six messages écrits avec `{0}` au lieu de `{__VAR_0__}` sont
 * passés par toute la suite unitaire, qui appelle les exécuteurs mais ne rend jamais leurs textes.
 */
async function texteAffiche(app: ElectronApplication, id: string): Promise<string> {
  const page = await app.firstWindow();
  return page.locator(`[data-id="${id}"] textarea, [data-id="${id}"] pre`).first().inputValue()
    .catch(() => page.locator(`[data-id="${id}"]`).innerText());
}

/** Les reproches communs aux deux cas : le pont manquant, le modèle absent, la cadence refusée. */
function aucunRefus(rendu: string) {
  expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
  expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);
  expect(rendu, "LA DESCENTE À SEIZE KILOHERTZ DOIT AVOIR EU LIEU : ce refus est sa signature")
    .not.toMatch(/SOXR|n'accepte que du|only accepts/i);
}

test.describe("qui parle quand, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE_DIAR), "Modèle de diarisation absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(300000);

  test("« QUI PARLE QUAND » TRAVERSE LE PONT, ET LE SON Y EST DESCENDU À 16 kHz", async () => {
    const app = await lancer();
    try {
      const rendu = await jouer(app, {
        nodes: [
          { id: "src", position: { x: 0, y: 0 },
            data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 8 } } },
          { id: "dia", position: { x: 360, y: 0 },
            data: { ficheId: "qui-parle-quand",
              parametres: { "Locuteur": "Tous", "Montage": "Garder la place", "Fondu": 10, "Calcul": "" } } },
          { id: "rap", position: { x: 720, y: 0 }, data: { ficheId: "sortie-texte", parametres: {} } },
        ],
        edges: [
          { id: "e1", source: "src", target: "dia", sourceHandle: "out:0", targetHandle: "in:0" },
          { id: "e2", source: "dia", target: "rap", sourceHandle: "out:3", targetHandle: "in:0" },
        ],
      }, "dia", /\d+\s*·\s*\d+\s*·\s*\d+\s*%/);

      aucunRefus(rendu);
      // LE RAPPORT EST LU À L'ÉCRAN, et il doit être en français lisible : une clé non trouvée
      // s'afficherait sous son nom brut, et un marqueur non remplacé sous ses accolades.
      const rapport = await texteAffiche(app, "rap");
      expect(rapport, "le rapport doit être rendu, et non la clé de traduction")
        .toMatch(/tours de parole|speaker turns/i);
      expect(rapport, "AUCUN MARQUEUR NE DOIT RESTER : ni « {0} » ni « {__VAR_0__} »")
        .not.toMatch(/\{\s*(?:\d|__VAR_)/);
      // LE MESSAGE EST « t · l · p % » : tours, locuteurs, part de la durée. Ce qu'un métronome
      // porte de parole n'est pas exigible ; que la chaîne réponde dans cette forme l'est.
      const lu = /(\d+)\s*·\s*(\d+)\s*·\s*(\d+)\s*%/.exec(rendu);
      expect(lu, `le message doit porter les trois chiffres, lu : « ${rendu.replace(/\n/g, " | ")} »`)
        .not.toBe(null);
      expect(Number(lu![2]), "il ne peut pas y avoir plus de locuteurs que de tours")
        .toBeLessThanOrEqual(Number(lu![1]));
    } finally {
      await app.close();
    }
  });
});

test.describe("aligner un texte, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE_ALIGN), "Modèle d'alignement absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(300000);

  test("« ALIGNER UN TEXTE » REND AUTANT DE MOTS QUE LE TEXTE EN PORTE", async () => {
    const app = await lancer();
    try {
      const rendu = await jouer(app, {
        nodes: [
          { id: "src", position: { x: 0, y: 0 },
            data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 8 } } },
          { id: "txt", position: { x: 0, y: 240 },
            data: { ficheId: "source-texte", parametres: { "Texte": TEXTE } } },
          { id: "ali", position: { x: 360, y: 0 },
            data: { ficheId: "aligner-texte",
              parametres: { "Du mot": 1, "Au mot": 0, "Marge": 40, "Montage": "Garder la place",
                "Fondu": 10, "Langue": "Français", "Calcul": "" } } },
          { id: "rap", position: { x: 720, y: 0 }, data: { ficheId: "sortie-texte", parametres: {} } },
        ],
        edges: [
          { id: "e1", source: "src", target: "ali", sourceHandle: "out:0", targetHandle: "in:0" },
          { id: "e2", source: "txt", target: "ali", sourceHandle: "out:0", targetHandle: "in:1" },
          { id: "e3", source: "ali", target: "rap", sourceHandle: "out:2", targetHandle: "in:0" },
        ],
      }, "ali", /\d+\s*·\s*\d+\s*·\s*[\d.,]+\s*s/);

      aucunRefus(rendu);
      const rapport = await texteAffiche(app, "rap");
      expect(rapport, "le rapport doit être rendu, et non la clé de traduction")
        .toMatch(/mots placés|words placed/i);
      expect(rapport, "AUCUN MARQUEUR NE DOIT RESTER : ni « {0} » ni « {__VAR_0__} »")
        .not.toMatch(/\{\s*(?:\d|__VAR_)/);
      expect(rendu, "le texte doit arriver au nœud").not.toMatch(/Brancher le texte|Connect the spoken text/i);
      // LE COMPTE EST EXIGIBLE, ET C'EST TOUT L'INTÉRÊT D'UN ALIGNEUR FORCÉ : il ne devine pas les
      // mots, il les reçoit. En rendre moins voudrait dire qu'il en a jeté.
      const lu = /(\d+)\s*·\s*(\d+)\s*·/.exec(rendu);
      expect(lu, `le message doit porter ses chiffres, lu : « ${rendu.replace(/\n/g, " | ")} »`).not.toBe(null);
      expect(Number(lu![1]), `le texte porte ${MOTS_ATTENDUS} mots`).toBe(MOTS_ATTENDUS);
      expect(Number(lu![2]), "tous les mots sont demandés, du premier au dernier").toBe(MOTS_ATTENDUS);
    } finally {
      await app.close();
    }
  });
});
