// tests-e2e/deux-fenetres-dans-application.spec.ts — Deux fenêtres de la vraie application, et ce
// qu'elles se partagent.
//
// ═══ CE QUI A ÉTÉ MESURÉ LE 2026-10-29, AVANT CETTE ÉPREUVE ═══
//
// Deux fenêtres ouvertes par « Nouvelle fenêtre », sur le build :
//   · Ctrl+C dans l'une laissait le presse-papiers du système intact, et Ctrl+V dans l'autre
//     n'ajoutait rien — le presse-papiers de nœuds était une variable de la fenêtre ;
//   · un méta-composant créé dans l'une n'apparaissait dans l'autre qu'après rechargement : le
//     registre n'était lu qu'au chargement, alors que l'événement `storage` arrivait bien ;
//   · créer un méta dans la seconde effaçait du stockage celui de la première, la bibliothèque
//     étant réécrite entière depuis la mémoire de chaque fenêtre — à la relance, les nœuds qui
//     l'employaient s'affichaient sous un identifiant brut, sans un port ;
//   · la seconde s'ouvrait sur le graphe ET le fichier de la première, et les deux sauvegardes
//     automatiques réécrivaient ce fichier à tour de rôle.
//
// CHAQUE CAS CI-DESSOUS A ÉTÉ VU ROUGE, la faute plantée dans le code qu'il garde, avant d'être
// laissé vert : le CHANGELOG dit lesquelles.
//
// ═══ CE QU'IL NE TOUCHE PAS ═══
//
// Chaque lancement prend un profil jetable (`--user-data-dir`) : le stockage de l'application de la
// personne n'est ni lu ni écrit. LE PRESSE-PAPIERS DU SYSTÈME, LUI, EST LE SIEN : le cas qui copie
// des nœuds le relève avant et le remet après — texte, HTML, RTF et image.
//
// L'APPLICATION EST LANCÉE HORS MODE DÉVELOPPEMENT, sur `dist/`, comme `pont-electron-vivant.spec.ts`.
// Le vidage du stockage propre au mode développement est tenu par `electron/fenetres.test.ts`.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

/** Les sources que ce lot a touchées : le build doit être plus récent qu'elles. */
const SOURCES_DU_LOT = [
  "src/ui/fenetre.ts", "src/ui/metasLocaux.ts", "src/ui/fenetres-partagees.ts",
  "src/ui/presse-papiers-noeuds.ts", "src/ui/hooks/useCopierColler.ts", "src/ui/hooks/useFenetresPartagees.ts",
];

// LES SEMENCES SONT DATÉES DANS LE PASSÉ, et ce n'est pas un détail : le journal de session tient un
// en-cours SANS date pour celui d'une autre fenêtre, et ne l'écrase jamais (`ui/journal-de-session.ts`).
// Semé sans date, le graphe resterait dans l'en-cours partagé quoi que fassent les fenêtres — relevé
// par une sonde au premier passage de ce spec.
const PASSE = "2000-01-01T00:00:00.000Z";

const GRAPHE = JSON.stringify({
  nodes: [
    { id: "n1", position: { x: 80, y: 120 }, data: { ficheId: "oscillateur", parametres: {} } },
    { id: "n2", position: { x: 520, y: 120 }, data: { ficheId: "echo", parametres: {} } },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: "out:0", targetHandle: "in:0" }],
  date: PASSE,
});

interface Lancement { app: ElectronApplication; profil: string; dialogues: string[] }

async function lancer(profil = mkdtempSync(join(tmpdir(), "attic-deux-fenetres-"))): Promise<Lancement> {
  const app = await electron.launch({
    args: [RACINE, `--user-data-dir=${profil}`],
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
  });
  const dialogues: string[] = [];
  const suivre = (p: Page) => p.on("dialog", (d) => { dialogues.push(d.message()); void d.accept(); });
  app.on("window", suivre);
  for (const p of app.windows()) suivre(p);
  return { app, profil, dialogues };
}

async function fermer(l: Lancement, garderLeProfil = false) {
  await l.app.close().catch(() => {});
  if (!garderLeProfil) rmSync(l.profil, { recursive: true, force: true });
}

async function prete(w: Page) {
  await w.waitForSelector(".attic-app", { timeout: 30000 });
  await w.waitForTimeout(1500);
}

/** La première fenêtre, semée du graphe d'essai comme le fait le pilote : poser, puis recharger. */
async function premiereFenetre(l: Lancement, graphe = GRAPHE): Promise<Page> {
  const w = await l.app.firstWindow();
  await prete(w);
  await w.evaluate((g) => localStorage.setItem("attic-encours", g), graphe);
  await w.reload();
  await prete(w);
  return w;
}

/** La seconde fenêtre, par le chemin de l'interface : le bouton appelle ce même canal. */
async function nouvelleFenetre(l: Lancement, depuis: Page): Promise<Page> {
  const [w] = await Promise.all([l.app.waitForEvent("window"), depuis.evaluate(() => (window as any).api.nouvelleFenetre())]);
  await prete(w);
  return w;
}

const noeuds = (w: Page) => w.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => n.getAttribute("data-id")!));

/** Le compteur « Méta-composants » de la palette. */
const compteurMetas = (w: Page) => w.evaluate(() => {
  const t = [...document.querySelectorAll(".palette-univers-titre")].find((e) => /Méta-composants|Meta-components/.test(e.textContent || ""));
  return t ? Number(t.querySelector(".palette-compteur")?.textContent) : 0;
});

const clesDeMetas = (w: Page) => w.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("attic-meta:")).sort());

/** Un point du nœud qui soit réellement le sien au premier plan : un nœud collé en couvre souvent un autre. */
async function cliquerNoeud(w: Page, id: string, ajouter = false) {
  const p = await w.evaluate((id) => {
    const noeud = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!noeud) return null;
    for (const z of [noeud.querySelector(".attic-node-entete"), noeud].filter(Boolean) as Element[]) {
      const r = z.getBoundingClientRect();
      for (let fy = 0.15; fy < 1; fy += 0.1) for (let fx = 0.03; fx < 1; fx += 0.06) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const el = document.elementFromPoint(x, y);
        if (el?.closest(".react-flow__node")?.getAttribute("data-id") === id
          && !el.closest("input,textarea,select,button,canvas,.react-flow__handle")) return { x, y };
      }
    }
    return null;
  }, id);
  expect(p, `aucun point libre sur ${id}`).not.toBeNull();
  if (ajouter) await w.keyboard.down("Control");
  await w.mouse.click(p!.x, p!.y);
  if (ajouter) await w.keyboard.up("Control");
}

async function cliquerVide(w: Page) {
  const p = await w.evaluate(() => {
    const r = document.querySelector(".react-flow__pane")!.getBoundingClientRect();
    for (let fy = 0.95; fy > 0.05; fy -= 0.05) for (let fx = 0.95; fx > 0.05; fx -= 0.05) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
    }
    return null;
  });
  await w.mouse.click(p!.x, p!.y);
}

async function grouper(w: Page, ids: string[]) {
  for (const [i, id] of ids.entries()) await cliquerNoeud(w, id, i > 0);
  await w.getByRole("button", { name: /Grouper en outil|Group into tool/ }).click();
  await w.waitForTimeout(500);
}

/** Retire un méta du catalogue par la croix de la palette, comme la personne le fait. */
async function supprimerDeLaPalette(w: Page, nom: string) {
  // L'UNIVERS EST REPLIÉ AU DÉPART, SES FAMILLES NE LE SONT PAS : on n'ouvre que lui, et seulement
  // s'il le faut — cliquer la famille la replierait.
  const composant = w.locator(".palette-composant", { hasText: nom });
  if (!(await composant.count())) {
    await w.locator(".palette-univers-titre", { hasText: /Méta-composants|Meta-components/ }).click();
  }
  await composant.hover();
  await composant.locator(".palette-composant-suppr").click();
  await w.waitForTimeout(800);
}

test.describe("deux fenêtres de l'application", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  // Deux fenêtres, parfois une relance : chaque cas en lance au moins une.
  test.setTimeout(90000);

  test("LE BUILD PORTE CE LOT, sans quoi tout ce qui suit éprouve une autre application", () => {
    const build = statSync(BUILD).mtimeMs;
    for (const s of SOURCES_DU_LOT) {
      expect(statSync(join(RACINE, s)).mtimeMs, `${s} est plus récent que le build : relancer « npm run build »`).toBeLessThanOrEqual(build);
    }
  });

  test("UNE FENÊTRE NEUVE NAÎT VIDE ET SANS FICHIER, et ne retire pas celui de la première", async () => {
    const l = await lancer();
    try {
      const w1 = await l.app.firstWindow();
      await prete(w1);
      await w1.evaluate((g) => {
        localStorage.setItem("attic-encours", g);
        localStorage.setItem("attic-current-file-path", "E:/essai/projet.json");
      }, GRAPHE);
      await w1.reload();
      await prete(w1);
      expect(await w1.title()).toBe("[Attic] projet.json");
      const w2 = await nouvelleFenetre(l, w1);
      expect(await noeuds(w2), "la fenêtre neuve n'hérite pas du graphe").toEqual([]);
      expect(await w2.title(), "ni du fichier").toBe("Attic");
      await w2.waitForTimeout(2000);
      expect(await w1.evaluate(() => localStorage.getItem("attic-current-file-path")),
        "et elle n'efface pas le fichier que la première reprendra au lancement").toBe("E:/essai/projet.json");
    } finally { await fermer(l); }
  });

  test("COPIER DANS UNE FENÊTRE ET COLLER DANS L'AUTRE AJOUTE LE NŒUD", async () => {
    const l = await lancer();
    await l.app.evaluate(({ clipboard }) => {
      (globalThis as any).__ppSauve = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() };
    });
    try {
      const w1 = await premiereFenetre(l);
      const w2 = await nouvelleFenetre(l, w1);
      // TÉMOIN : un texte quelconque dans le presse-papiers ne devient pas un nœud.
      await l.app.evaluate(({ clipboard }) => clipboard.writeText("un texte copié ailleurs"));
      await w2.bringToFront();
      await cliquerVide(w2);
      await w2.keyboard.press("Control+v");
      await w2.waitForTimeout(500);
      expect(await noeuds(w2), "un texte quelconque ne colle rien").toEqual([]);

      await w1.bringToFront();
      await cliquerNoeud(w1, "n1");
      await w1.keyboard.press("Control+c");
      await w1.waitForTimeout(300);
      expect(await l.app.evaluate(({ clipboard }) => clipboard.readText()), "la copie est dans le presse-papiers du système")
        .toContain("attic/noeuds");
      await w2.bringToFront();
      await cliquerVide(w2);
      await w2.keyboard.press("Control+v");
      await w2.waitForTimeout(800);
      const colles = await noeuds(w2);
      expect(colles, "le nœud copié dans la première est collé dans la seconde").toHaveLength(1);
      expect(await w2.locator(`.react-flow__node[data-id="${colles[0]}"]`).textContent(), "et c'est bien l'oscillateur")
        .toMatch(/Oscillat/);
    } finally {
      await l.app.evaluate(({ clipboard }) => {
        const s = (globalThis as any).__ppSauve;
        const d: Record<string, unknown> = {};
        if (s?.text) d.text = s.text;
        if (s?.html) d.html = s.html;
        if (s?.rtf) d.rtf = s.rtf;
        if (s?.image && !s.image.isEmpty()) d.image = s.image;
        if (Object.keys(d).length) clipboard.write(d as never); else clipboard.clear();
      }).catch(() => {});
      await fermer(l);
    }
  });

  test("UN MÉTA CRÉÉ DANS UNE FENÊTRE PARAÎT DANS L'AUTRE SANS RECHARGEMENT, et les deux survivent", async () => {
    const l = await lancer();
    try {
      const w1 = await premiereFenetre(l);
      const w2 = await nouvelleFenetre(l, w1);
      const depart = await compteurMetas(w2);
      await grouper(w1, ["n1", "n2"]);
      await expect.poll(() => compteurMetas(w2), { timeout: 3000, message: "la palette de la seconde fenêtre le montre" })
        .toBe(depart + 1);

      // La seconde fenêtre crée le sien, sur un graphe semé chez elle.
      await w2.evaluate((g) => localStorage.setItem("attic-encours", g), GRAPHE);
      await w2.reload();
      await prete(w2);
      await grouper(w2, ["n1", "n2"]);
      await expect.poll(() => compteurMetas(w1), { timeout: 3000 }).toBe(depart + 2);
      expect(await clesDeMetas(w1), "chacun sous sa clé").toHaveLength(2);
      await fermer(l, true);

      // À LA RELANCE, LES DEUX SONT LÀ, et aucun nœud repris ne s'affiche sous l'identifiant brut
      // d'un méta disparu — c'est ainsi que le défaut se voyait. (Un méta groupé sans câble vers
      // l'extérieur n'a pas de port : le compte des ports ne dit rien ici.)
      const r = await lancer(l.profil);
      try {
        const w = await r.app.firstWindow();
        await prete(w);
        expect(await compteurMetas(w)).toBe(depart + 2);
        const textes = await w.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => n.textContent ?? ""));
        expect(textes.length, "le graphe repris n'est pas vide").toBeGreaterThan(0);
        expect(textes.filter((t) => /meta-[a-z0-9]+-\d/.test(t)), "aucun nœud sous un identifiant brut").toEqual([]);
      } finally { await fermer(r); }
    } catch (e) { await fermer(l); throw e; }
  });

  test("SUPPRIMER UN MÉTA QU'UNE AUTRE FENÊTRE EMPLOIE EST REFUSÉ", async () => {
    const l = await lancer();
    try {
      const w1 = await premiereFenetre(l);
      await grouper(w1, ["n1", "n2"]);
      const [meta] = await noeuds(w1);
      const nom = await w1.evaluate(() => {
        const cle = Object.keys(localStorage).find((k) => k.startsWith("attic-meta:"))!;
        return JSON.parse(localStorage.getItem(cle)!).nom as string;
      });
      const w2 = await nouvelleFenetre(l, w1);
      const avant = await compteurMetas(w2);

      await supprimerDeLaPalette(w2, nom);
      expect(l.dialogues.at(-1), "le refus est dit").toMatch(/autre\(s\) fenêtre|other window/);
      expect(await compteurMetas(w2), "et le méta reste au catalogue").toBe(avant);
      expect(await clesDeMetas(w2)).toHaveLength(1);

      // TÉMOIN : la fenêtre qui l'employait le retire de son graphe, et la suppression passe.
      await cliquerNoeud(w1, meta);
      await w1.keyboard.press("Delete");
      await w1.waitForTimeout(300);
      await supprimerDeLaPalette(w2, nom);
      expect(l.dialogues.at(-1), "on demande confirmation, sans refus").toMatch(/Supprimer|Remove/);
      expect(await compteurMetas(w2)).toBe(avant - 1);
      await expect.poll(() => compteurMetas(w1), { timeout: 3000, message: "et la première le voit partir" }).toBe(avant - 1);
    } finally { await fermer(l); }
  });

  test("UNE FENÊTRE RECHARGÉE REND SON PROPRE GRAPHE, et non celui que l'autre a écrit après elle", async () => {
    const l = await lancer();
    try {
      const w1 = await premiereFenetre(l);
      const w2 = await nouvelleFenetre(l, w1);
      const seul = JSON.stringify({ nodes: [{ id: "s1", position: { x: 100, y: 100 }, data: { ficheId: "oscillateur", parametres: {} } }], edges: [], date: PASSE });
      await w2.evaluate((g) => localStorage.setItem("attic-encours", g), seul);
      await w2.reload();
      await prete(w2);
      expect(await noeuds(w2)).toEqual(["s1"]);
      await w2.waitForTimeout(2000); // le journal de la seconde écrit
      await cliquerNoeud(w1, "n2");
      await w1.keyboard.press("Delete");
      expect(await noeuds(w1), "la première a bien changé").toEqual(["n1"]);
      await w1.waitForTimeout(2500); // celui de la première écrit APRÈS
      expect(await w1.evaluate(() => JSON.parse(localStorage.getItem("attic-encours")!).nodes.map((n: { id: string }) => n.id)),
        "l'en-cours partagé est celui de la première").toEqual(["n1"]);
      await w2.reload();
      await prete(w2);
      expect(await noeuds(w2), "la seconde rechargée rend le sien").toEqual(["s1"]);
    } finally { await fermer(l); }
  });
});
