// tests-e2e/pont-electron-vivant.spec.ts — La première épreuve qui lance la VRAIE application.
//
// CE QUE LES TRENTE-SIX AUTRES NE PEUVENT PAS FAIRE. Elles tournent en Chromium sur le serveur
// Vite, où `window.api` n'existe pas : trente et un composants dépendent du pont, soixante-deux
// canaux le traversent, et aucune épreuve n'en a jamais emprunté un seul. Le garde statique
// `electron/pont-canaux.test.ts` apparie les NOMS des deux côtés, ce qui attrape une faute de
// frappe ; il ne dit rien de ce qui se passe quand on appelle.
//
// TROIS PROPRIÉTÉS, DU PLUS BAS AU PLUS HAUT :
//   1. le préchargement s'exécute, donc `window.api` est là ;
//   2. tout canal que le préchargement invoque a un gestionnaire VIVANT dans le processus
//      principal, lu dans le processus lui-même et non dans un fichier ;
//   3. un aller-retour réel aboutit et rend une valeur.
//
// LE DEUXIÈME CAS EST CELUI QUI VALAIT LE HARNAIS. `ipcMain` tient ses gestionnaires dans une table
// que `app.evaluate` peut lire, puisque Playwright évalue DANS le processus principal. On compare
// donc ce que le préchargement promet à ce que le principal tient réellement, à l'exécution. Un
// `ipcMain.handle` écrit dans une branche jamais prise, ou après un `return` hâtif, passerait le
// garde statique et tomberait ici.
//
// L'APPLICATION EST LANCÉE HORS MODE DÉVELOPPEMENT, donc elle charge `dist/index.html` et n'a
// besoin d'aucun serveur. Sans build, l'épreuve s'ignore en le disant : un harnais qui échouerait
// faute d'artefact apprendrait seulement qu'on n'a pas construit.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE_CED = join(RACINE, "public", "audiocpp", "ced-base-f32.gguf");

/**
 * La source la plus récemment modifiée du projet, pour la comparer à l'âge du build.
 *
 * POURQUOI CE DÉTOUR. Hors mode développement, l'application charge `dist/index.html` : elle éprouve
 * donc l'artefact, et non le code posé sur le disque. Un build vieux de vingt heures a fait échouer
 * la seconde épreuve de ce fichier sur un nœud qui n'existait pas encore dedans, et le symptôme
 * n'était pas lisible : le composant s'affichait sous son identifiant brut, suivi d'« Erreur ».
 * Un harnais qui éprouve silencieusement une AUTRE application que celle qu'on écrit ne vaut rien.
 */
function sourceLaPlusRecente(dossiers: string[]): number {
  let recente = 0;
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) { parcourir(chemin); continue; }
      if (!/\.(ts|tsx|cjs|css)$/.test(entree.name)) continue;
      const t = statSync(chemin).mtimeMs;
      if (t > recente) recente = t;
    }
  };
  for (const d of dossiers) if (existsSync(d)) parcourir(d);
  return recente;
}

/** Lance l'application comme un utilisateur la lance, et non en mode développement. */
function lancer(): Promise<ElectronApplication> {
  return electron.launch({
    args: [RACINE],
    // NI MODE DÉVELOPPEMENT NI MISE À JOUR : l'un chercherait un serveur, l'autre sortirait sur le
    // réseau au démarrage. L'épreuve doit tenir sur une machine hors ligne.
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
  });
}

/** Les canaux que le préchargement invoque, lus dans son source. */
function canauxInvoques(): string[] {
  const source = readFileSync(join(RACINE, "electron", "preload.cjs"), "utf8");
  const trouves = new Set<string>();
  for (const m of source.matchAll(/ipcRenderer\.invoke\(\s*["']([^"']+)["']/g)) trouves.add(m[1]);
  return [...trouves].sort();
}

// CE CAS PASSE AVANT TOUS LES AUTRES, et il ÉCHOUE au lieu de s'ignorer. Un build ABSENT rend les
// épreuves sans objet, ce qui se saute ; un build PÉRIMÉ les rend trompeuses, ce qui se signale.
test.describe("l'artefact que ces épreuves lancent", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant ces épreuves.");

  test("LE BUILD EST À JOUR, sans quoi tout ce qui suit éprouve une autre application", () => {
    const build = statSync(BUILD).mtimeMs;
    const source = sourceLaPlusRecente([join(RACINE, "src"), join(RACINE, "electron")]);
    const retard = Math.round((source - build) / 60000);
    expect(source <= build, [
      `« dist/index.html » a ${retard} minute(s) de retard sur la source la plus récente.`,
      "Hors mode développement, l'application charge cet artefact : ces épreuves porteraient donc",
      "sur un code qui n'est plus celui du dépôt, et un composant ajouté depuis s'y afficherait",
      "sous son identifiant brut, suivi d'« Erreur ». Lancer « npm run build », puis reprendre.",
    ].join("\n")).toBe(true);
  });
});

test.describe("le pont, dans l'application qui tourne", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(120000);

  test("LE PONT EST VIVANT : préchargement posé, canaux tenus, aller-retour abouti", async () => {
    const app = await lancer();

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      // 1. LE PRÉCHARGEMENT S'EST EXÉCUTÉ. Une seule ligne fautive y fait échouer le fichier
      // ENTIER, et l'application perd tous ses boutons d'un coup, sans message : c'est écrit en
      // tête de `preload.cjs`, et rien ne le vérifiait.
      const pont = await page.evaluate(() => {
        const api = (globalThis as unknown as { api?: Record<string, unknown> }).api;
        return { present: !!api, fonctions: api ? Object.keys(api).length : 0 };
      });
      expect(pont.present, "« window.api » doit exister : sinon le préchargement a échoué en bloc").toBe(true);
      expect(pont.fonctions).toBeGreaterThan(40);

      // 2. CHAQUE CANAL INVOQUÉ A UN GESTIONNAIRE VIVANT, lu dans le processus principal lui-même.
      const tenus: string[] = await app.evaluate(({ ipcMain }) => {
        const table = (ipcMain as unknown as { _invokeHandlers?: Map<string, unknown> })._invokeHandlers;
        return table ? [...table.keys()] : [];
      });
      expect(tenus.length, "la table des gestionnaires doit être lisible").toBeGreaterThan(0);
      const orphelins = canauxInvoques().filter((c) => !tenus.includes(c));
      expect(orphelins, [
        "Ces canaux sont invoqués par le préchargement et aucun gestionnaire ne les tient dans",
        "l'application qui tourne. Le nœud qui les emprunte échouera sur « No handler registered",
        "for … ». Un « ipcMain.handle » écrit dans une branche jamais prise passe le garde",
        "statique et tombe ici.",
      ].join("\n")).toEqual([]);

      // 3. UN ALLER-RETOUR RÉEL ABOUTIT. Le répertoire de travail est choisi parce qu'il ne touche
      // à rien : il lit un chemin et le rend, sans écrire ni réseau ni modèle.
      const repertoire = await page.evaluate(async () => {
        const api = (globalThis as unknown as { api: { obtenirRepertoireTravail: () => Promise<unknown> } }).api;
        return api.obtenirRepertoireTravail();
      });
      expect(typeof repertoire, "l'aller-retour doit rendre un chemin").toBe("string");
      expect((repertoire as string).length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});

// LE CHEMIN COMPLET D'UN COMPOSANT À MODÈLE, qui n'avait jamais tourné. « Décrire un audio » a été
// mesuré par la ligne de commande de son moteur, sa lecture de journal est tenue par cinq cas, et
// son câblage par le garde des canaux. Mais la suite composant, préchargement, processus principal,
// exécutable, retour, décodage du journal, affichage, n'avait jamais été parcourue d'un bout à
// l'autre : trois fois signalée comme le seul trou qui restait.
//
// LE SON VIENT D'UN MÉTRONOME, et non d'un fichier. « Entrée audio » réclamerait un dialogue
// système, que rien ne sait piloter ici ; un générateur rend un vrai `AudioBuffer` sans rien
// demander. Ce que l'étiqueteur entend d'un métronome n'a pas d'importance : ce cas tient que la
// CHAÎNE répond, non ce qu'elle trouve.
//
// SANS LE MODÈLE, L'ÉPREUVE S'IGNORE EN LE DISANT. Il pèse trois cent quarante-deux mégaoctets et
// se télécharge depuis l'application ; échouer faute de lui n'apprendrait rien sur le pont.
test.describe("un composant à modèle, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE_CED), "Modèle CED absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(300000);

  test("« DÉCRIRE UN AUDIO » TRAVERSE LE PONT ET REND SES ÉTIQUETTES", async () => {
    const app = await lancer();

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      // LE GRAPHE EST SEMÉ PUIS LA PAGE RECHARGÉE : c'est la voie que le dépôt emploie déjà dans
      // ses autres épreuves, et elle évite de piloter un glisser-déposer.
      await page.evaluate(() => {
        const graphe = {
          nodes: [
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 8 } } },
            { id: "dec", position: { x: 360, y: 0 },
              data: { ficheId: "decrire-audio", parametres: { "Nombre d'étiquettes": 8, "Seuil": 0, "Calcul": "" } } },
          ],
          edges: [{ id: "e1", source: "src", target: "dec", sourceHandle: "out:0", targetHandle: "in:0" }],
        };
        localStorage.setItem("attic-encours", JSON.stringify(graphe));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="dec"]').waitFor({ timeout: 60000 });

      await page.getByRole("button", { name: /Lancer/ }).click();

      // LE MODÈLE SE CHARGE AVANT DE RÉPONDRE, et il pèse trois cent quarante-deux mégaoctets :
      // l'attente porte sur le MESSAGE du nœud, non sur une durée devinée.
      //
      // LE CHIFFRE EST EXIGÉ DEVANT LE MOT, et ce n'est pas une coquetterie : « Étiquettes » est
      // aussi le nom d'un PORT, affiché dès que le nœud est posé. Sans le chiffre, l'attente se
      // satisfaisait du nom du port et lisait le nœud pendant qu'il travaillait encore.
      const noeud = page.locator('[data-id="dec"]');
      await expect(noeud).toContainText(/\d+\s*(?:étiquette|label)/i, { timeout: 240000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);

      // LE COMPTE EST LU DANS LE MESSAGE : « n étiquette(s) · temps réel ×r ». Zéro étiquette
      // voudrait dire que le journal du moteur a été lu sans y trouver de schéma, c'est-à-dire que
      // la chaîne a répondu sans rien rapporter.
      const compte = Number(/(\d+)\s*(?:étiquette|label)/i.exec(rendu)?.[1] ?? 0);
      expect(compte, `le moteur doit rendre des étiquettes, message lu : « ${rendu.replace(/\n/g, " | ")} »`)
        .toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
