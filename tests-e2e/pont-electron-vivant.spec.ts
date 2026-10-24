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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const MODELE_CED = join(RACINE, "public", "audiocpp", "ced-base-f32.gguf");
const MODELE_ROFORMER = join(RACINE, "public", "audiocpp", "mel-band-roformer-f16.gguf");

/**
 * La source la plus récemment modifiée du projet, pour la comparer à l'âge du build.
 *
 * POURQUOI CE DÉTOUR. Hors mode développement, l'application charge `dist/index.html` : elle éprouve
 * donc l'artefact, et non le code posé sur le disque. Un build vieux de vingt heures a fait échouer
 * la seconde épreuve de ce fichier sur un nœud qui n'existait pas encore dedans, et le symptôme
 * n'était pas lisible : le composant s'affichait sous son identifiant brut, suivi d'« Erreur ».
 * Un harnais qui éprouve silencieusement une AUTRE application que celle qu'on écrit ne vaut rien.
 *
 * SEUL `src/` EST REGARDÉ, ET C'EST UNE CORRECTION. La comparaison incluait d'abord `electron/`, et
 * le cas s'est mis à exiger une reconstruction après une retouche dans ce dossier : à tort, car
 * `dist/` est bâti depuis `src/` seul. Les fichiers du processus principal sont lus EN DIRECT sur
 * le disque à chaque lancement, donc ils sont toujours à jour et ne peuvent pas périmer l'artefact.
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
    const source = sourceLaPlusRecente([join(RACINE, "src")]);
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

// LA CLASSE DE DÉFAUT QUI A COÛTÉ LA v3.1.4, et que seul ce harnais peut atteindre. Un chemin de
// modèle se résout d'une façon en développement, où Vite sert la racine, et d'une autre une fois la
// page chargée depuis `file://`, où un `fetch` enraciné pointe vers la racine du DISQUE. Le worker
// Sherpa fonctionnait et ne trouvait plus rien une fois empaqueté ; `chemins-ressources.cjs` porte
// ce récit, et `base-modeles.ts` la réponse : sous `file:`, on passe par le schéma `attic-res:`.
//
// RIEN NE VÉRIFIAIT QUE CETTE RÉPONSE TIENT. Le calcul de la base est une fonction pure, qu'un cas
// unitaire peut lire ; que le schéma soit enregistré, que le dossier soit déclaré servi, et qu'un
// fichier en ressorte, ne se voit que dans l'application qui tourne.
//
// LE CONTENU EST EXIGÉ, PAS SEULEMENT LE CODE DE RETOUR : un protocole qui répondrait par une page
// d'erreur rendrait un 200 honorable, et c'est le piège déjà rencontré sur le miroir des modèles,
// où un chemin inconnu rendait 200 avec du `text/html`.
test.describe("les modèles livrés, sous le protocole de l'application empaquetée", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(join(RACINE, "public", "oonx", "whisper-base-en", "config.json")),
    "Paquet Whisper absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(120000);

  test("LA BASE SE RÉSOUT EN « attic-res: » ET UN FICHIER EN SORT VRAIMENT", async () => {
    const app = await lancer();

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      // LA PAGE VIENT BIEN DE `file:`, sans quoi cette épreuve ne prouverait rien : c'est la
      // condition même du défaut qu'elle garde.
      expect(await page.evaluate(() => location.protocol),
        "hors `file:`, cette épreuve ne garde rien").toBe("file:");

      const releve = await page.evaluate(async () => {
        const base = `attic-res://oonx/whisper-base-en`;
        const r = await fetch(`${base}/config.json`);
        const texte = await r.text();
        let lisible = false;
        try { lisible = typeof JSON.parse(texte) === "object"; } catch { lisible = false; }
        return { base, ok: r.ok, statut: r.status, octets: texte.length, lisible };
      });

      expect(releve.ok, `le schéma doit servir le fichier, statut reçu ${releve.statut}`).toBe(true);
      expect(releve.octets, "un fichier vide vaudrait un fichier absent").toBeGreaterThan(0);
      expect(releve.lisible, "le protocole doit rendre le fichier, et non une page d'erreur").toBe(true);

      // ET CE QU'IL NE SERT PAS DOIT ÊTRE REFUSÉ : la liste des dossiers servis est ce qui rend ce
      // schéma sûr, et un refus qui n'en serait pas un l'ouvrirait sur tout le disque.
      const interdit = await page.evaluate(async () => {
        try {
          const r = await fetch("attic-res://ailleurs/secret.txt");
          return { refuse: !r.ok, statut: r.status };
        } catch {
          return { refuse: true, statut: 0 };
        }
      });
      expect(interdit.refuse, "un dossier non déclaré doit être refusé").toBe(true);
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

// LE SECOND COMPOSANT À MODÈLE, ET IL EXERCE DEUX CHOSES QUE LE PREMIER N'EXERCE PAS.
//
// DEUX PISTES AU RETOUR. Les trois autres familles de cet exécutable rendent un seul fichier ;
// celle-ci en dépose plusieurs dans un dossier, et `--out` y est refusé en clair au profit de
// `--out-dir`. Le chemin du retour est donc différent : on lit un DOSSIER, et deux décodages
// suivent au lieu d'un.
//
// ET UN ALLER-RETOUR DE FRÉQUENCE. Le modèle exige quarante-quatre mille cent hertz et refuse net
// les quarante-huit mille où travaille le reste du dépôt : le composant rééchantillonne à l'aller
// et ramène les deux pistes à la fréquence reçue. Rien ne vérifiait que cette traversée tient dans
// l'application, où l'audio vient d'un contexte réel et non d'un tampon fabriqué.
test.describe("le séparateur, de bout en bout", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.skip(!existsSync(MODELE_ROFORMER), "Modèle RoFormer absent : le récupérer depuis le panneau des modèles.");
  test.setTimeout(300000);

  test("« ISOLER LA VOIX » TRAVERSE LE PONT ET REND SES DEUX PISTES", async () => {
    const app = await lancer();

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      await page.evaluate(() => {
        const graphe = {
          nodes: [
            { id: "src", position: { x: 0, y: 0 },
              data: { ficheId: "metronome", parametres: { "Tempo": 120, "Durée": 6 } } },
            { id: "sep", position: { x: 360, y: 0 },
              data: { ficheId: "isoler-voix", parametres: { "Calcul": "" } } },
          ],
          edges: [{ id: "e1", source: "src", target: "sep", sourceHandle: "out:0", targetHandle: "in:0" }],
        };
        localStorage.setItem("attic-encours", JSON.stringify(graphe));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="sep"]').waitFor({ timeout: 60000 });

      await page.getByRole("button", { name: /Lancer/ }).click();

      // LE MOTIF EXIGE LE FACTEUR DE TEMPS RÉEL, et non le mot « Voix » : celui-ci est aussi le nom
      // d'une SORTIE, affiché dès que le nœud est posé. La leçon est celle de l'épreuve voisine, où
      // l'attente se satisfaisait d'un nom de port et lisait le nœud en plein travail.
      const noeud = page.locator('[data-id="sep"]');
      await expect(noeud).toContainText(/temps réel|real time/i, { timeout: 240000 });

      const rendu = await noeud.innerText();
      expect(rendu, "le pont doit répondre, et non manquer").not.toMatch(/nécessite Electron|requires Electron/i);
      expect(rendu, "le modèle doit être trouvé").not.toMatch(/Modèle absent|Model missing/i);
      // UNE PISTE MANQUANTE EST RAPPORTÉE PAR SON NOM, et l'adaptateur refuse alors : c'est le
      // seul cas où le dossier de sortie répond à moitié.
      expect(rendu, "aucune piste ne doit manquer").not.toMatch(/Piste « \w+ » absente/i);
    } finally {
      await app.close();
    }
  });
});

// ═══ L'EXPORT SFZ POSE UN FICHIER, ET IL GARDE LE DÉSACCORD ═══
//
// CE QUE LES ÉPREUVES EN MÉMOIRE NE PEUVENT PAS FAIRE. `audio/sfz-aller-retour.test.ts` prouve que
// `versSfz` écrit le `tune` d'une zone et que l'analyseur du dépôt le relit. Il ne prouve rien du
// FICHIER : « Export SFZ » refuse d'emblée hors Electron, sa première ligne cherchant
// `window.api.ecrireFichier`. Entre « la chaîne est juste » et « le fichier posé est juste », il
// reste l'écriture, l'encodage des échantillons et la construction du chemin de travail.
//
// LE PARCOURS ÉPROUVÉ EST CELUI D'UN UTILISATEUR : importer un SFZ désaccordé, le ré-exporter. C'est
// aussi le seul chemin par lequel une banque d'Attic porte aujourd'hui un désaccord, les siennes
// étant justes par construction.
//
// CE QUI RESTE HORS DE PORTÉE, ET QUI N'EST PAS PRÉTENDU : qu'un échantillonneur tiers joue le
// fichier juste. Aucune épreuve ne le dira ; il faut le charger dans sfizz ou Sforzando et écouter.

/** Un WAV minuscule et valide : seize bits, un canal, quarante-quatre mille cent hertz. */
function wavMinimal(echantillons = 512): Buffer {
  const octetsSon = echantillons * 2;
  const b = Buffer.alloc(44 + octetsSon);
  b.write("RIFF", 0); b.writeUInt32LE(36 + octetsSon, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(octetsSon, 40);
  // Une sinusoïde plutôt que du silence : un décodeur peut écarter un fichier vide, et une zone
  // muette ne prouverait pas que l'échantillon a fait l'aller-retour.
  for (let i = 0; i < echantillons; i++) {
    b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / 44100) * 12000), 44 + i * 2);
  }
  return b;
}

test.describe("l'export SFZ écrit sur le disque", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(180_000);

  test("UN SFZ DÉSACCORDÉ IMPORTÉ PUIS RÉ-EXPORTÉ GARDE SON `tune` DANS LE FICHIER", async () => {
    const travail = mkdtempSync(join(tmpdir(), "attic-sfz-"));
    const entree = join(travail, "entree.sfz");
    writeFileSync(join(travail, "la.wav"), wavMinimal());
    // Un désaccord de vingt-cinq cents, soit un quart de demi-ton : assez pour qu'un arrondi à
    // l'entier le garde, et impossible à obtenir par hasard.
    writeFileSync(entree, [
      "<region>", "sample=la.wav", "lokey=56 hikey=58 pitch_keycenter=57", "tune=-25", "",
    ].join("\n"));

    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(([dossier, sfz]) => {
        // LE RÉPERTOIRE DE TRAVAIL EST SEMÉ, et sans lui l'export refuse : il vient normalement
        // d'une boîte de dialogue système, qu'une épreuve ne pilote pas.
        localStorage.setItem("attic-repertoire", dossier);
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [
            { id: "b", position: { x: 0, y: 0 },
              // `sfzChemin` est posé sur la donnée du nœud, là où le bouton 📂 l'écrit.
              data: { ficheId: "banque-sfz", parametres: { "Source": "Fichier SFZ" }, sfzChemin: sfz } },
            { id: "x", position: { x: 380, y: 0 },
              data: { ficheId: "export-sfz", parametres: { "Nom": "sortie.sfz" } } },
          ],
          edges: [{ id: "e1", source: "b", target: "x", sourceHandle: "out:0", targetHandle: "in:0" }],
        }));
      }, [travail, entree]);
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      await page.locator('[data-id="x"]').waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: /Lancer/ }).click();

      const ecrit = join(travail, "sortie.sfz");
      await expect.poll(() => existsSync(ecrit), { timeout: 90000, message: "le fichier doit être posé" })
        .toBe(true);

      const rendu = await page.locator('[data-id="x"]').innerText();
      expect(rendu, "l'export ne doit pas manquer le pont").not.toMatch(/nécessite Electron|requires Electron/i);

      const texte = readFileSync(ecrit, "utf8");
      // LE DÉSACCORD A TRAVERSÉ : lecture du fichier d'entrée, construction de la banque, écriture.
      expect(texte, "le fichier posé doit porter le désaccord").toMatch(/tune=-25\b/);
      // Et les échantillons sont là, à côté : un SFZ dont les sons manquent ne se joue pas.
      const dossierEch = join(travail, "sortie");
      expect(existsSync(dossierEch), "le dossier des échantillons doit exister").toBe(true);
      expect(readdirSync(dossierEch).filter((f) => f.endsWith(".wav")).length).toBeGreaterThan(0);
    } finally {
      await app.close();
      rmSync(travail, { recursive: true, force: true });
    }
  });
});

// ═══ LE CLAVIER DE FRAPPE JOUE UNE POSITION, NON UN CARACTÈRE ═══
//
// CE QU'AUCUNE ÉPREUVE EN MÉMOIRE NE PEUT DIRE. `vues-domaine/clavier-frappe.test.ts` prouve que la
// table associe des positions à des notes. Il ne prouve rien de ce que le NŒUD lit : le crochet
// pouvait parfaitement garder `e.key.toUpperCase()` et laisser tous ces cas verts, qui est
// exactement le piège du lot précédent — les épreuves et le composant ne passant pas par le même
// code. Entre « la table est juste » et « la touche joue juste » il reste l'écoute du clavier.
//
// LE COUPLE DE FRAPPES ÉPROUVÉ EST CELUI D'UN CLAVIER FRANÇAIS, relevé par
// `navigator.keyboard.getLayoutMap()` : la touche en bas à gauche y envoie `code: "KeyZ"` avec
// `key: "w"`, et celle de la rangée du haut `code: "KeyW"` avec `key: "z"`. Les deux moitiés
// comptent — la première doit jouer le do, la seconde ne doit rien jouer. Un retour au caractère
// les échange, donc chacune tombe sur l'autre.

test.describe("le clavier de l'ordinateur fait sonner le nœud", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(180_000);

  test("UNE TOUCHE ENVOYÉE AVEC SA POSITION JOUE LA NOTE DE CETTE POSITION", async () => {
    const app = await lancer();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => {
        localStorage.setItem("attic-encours", JSON.stringify({
          nodes: [{ id: "cla", position: { x: 40, y: 40 },
            data: { ficheId: "clavier-melodie", parametres: {} } }],
          edges: [],
        }));
      });
      await page.reload();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const noeud = page.locator('[data-id="cla"]');
      await noeud.waitFor({ timeout: 60000 });
      // Les quatre-vingt-huit touches sont dessinées avant qu'on frappe : sans cela, l'absence
      // d'une touche allumée ne distinguerait pas « pas jouée » de « pas encore là ».
      await expect(noeud.locator(".clavier-blanche")).toHaveCount(52, { timeout: 60000 });

      // LE NŒUD DOIT ÊTRE SÉLECTIONNÉ, c'est la règle de `clavier-physique.ts`. On clique son
      // en-tête et non son corps : un clic sur le clavier jouerait une note au passage.
      await noeud.locator(".attic-node-entete").click();
      await expect(noeud).toHaveClass(/selected/, { timeout: 10000 });

      /** Une frappe telle qu'un clavier français l'envoie : la position, et le caractère imprimé. */
      const frapper = (code: string, key: string, type: "keydown" | "keyup") =>
        page.evaluate(([c, k, t]) => {
          window.dispatchEvent(new KeyboardEvent(t, { code: c, key: k, bubbles: true }));
        }, [code, key, type] as const);

      // La touche en bas à gauche — lue « w » sur un clavier français — est le do.
      await frapper("KeyZ", "w", "keydown");
      await expect(noeud.locator('.clavier-blanche.enfoncee[data-pitch="C3"]'))
        .toHaveCount(1, { timeout: 10000 });
      await frapper("KeyZ", "w", "keyup");
      await expect(noeud.locator(".clavier-blanche.enfoncee")).toHaveCount(0, { timeout: 10000 });

      // Et la touche de la rangée du haut — lue « z » — ne joue rien : le do n'est pas là.
      await frapper("KeyW", "z", "keydown");
      await page.waitForTimeout(400);
      await expect(noeud.locator(".clavier-blanche.enfoncee, .clavier-noire.enfoncee"))
        .toHaveCount(0);
      await frapper("KeyW", "z", "keyup");

      // Les sept blanches de la rangée du bas, dans l'ordre : c'est la gamme, et c'est la
      // GÉOMÉTRIE des deux rangées que le défaut avait défaite.
      const rangee = [
        ["KeyZ", "w", "C3"], ["KeyX", "x", "D3"], ["KeyC", "c", "E3"], ["KeyV", "v", "F3"],
        ["KeyB", "b", "G3"], ["KeyN", "n", "A3"], ["KeyM", ",", "B3"],
      ] as const;
      for (const [code, key, hauteur] of rangee) {
        await frapper(code, key, "keydown");
        await expect(noeud.locator(`.clavier-blanche.enfoncee[data-pitch="${hauteur}"]`),
          `la position ${code} doit jouer ${hauteur}`).toHaveCount(1, { timeout: 10000 });
        await frapper(code, key, "keyup");
      }
    } finally {
      await app.close();
    }
  });
});
