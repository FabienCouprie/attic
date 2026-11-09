// tests-e2e/persistance-aller-retour.spec.ts — Un projet fait l'aller-retour par le disque, sans rien
// perdre ni rien gagner, dans l'application construite.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// Demandée par Fabien le 2026-11-08, au découpage de `ui/hooks/usePersistance.ts` : une fonction de
// 435 lignes qui écrit le fichier de projet et l'en-cours, et qui les relit. Aucun test ne monte ce
// crochet, et les épreuves qui l'exercent tiennent chacune un geste : le rapport de chargement et le
// numéro de format, le journal de session, le refus du pont. AUCUNE NE TIENT LE TRAJET ENTIER, et
// c'est lui qu'un déplacement de code peut casser sans qu'un geste isolé le voie.
//
// ═══ CE QU'ELLE TIENT, profil et dossier jetables, dialogues remplacés par un témoin ═══
//
// 1. OUVRIR PAR LE DIALOGUE un projet qui porte chaque champ que la persistance enregistre, une
//    bulle repliée, une note bilingue, un méta employé, un méta qui ne l'est pas et un champ que rien
//    n'enregistre ; puis ENREGISTRER (Ctrl+S). Le fichier garde chaque champ, et eux seuls ; son
//    numéro de format vient en premier ; il n'emporte que le méta employé ; aucune arête de
//    substitution n'y entre.
// 2. DÉPLACER UN NŒUD et attendre la SAUVEGARDE AUTOMATIQUE : elle écrit sans dialogue, et le
//    fichier ne change que de la position déplacée.
// 3. EXPORTER (Ctrl+Maj+S) : le dialogue propose le fichier courant, et l'export est le fichier que
//    la sauvegarde automatique vient d'écrire, octet pour octet. L'en-cours partagé et celui de la
//    fenêtre sont le même texte, et ne disent rien que le fichier ne dise.
// 4. DANS UNE SECONDE APPLICATION, sur un profil neuf, OUVRIR L'EXPORT ET L'EXPORTER À NOUVEAU : le
//    second export est le premier, octet pour octet, vue comprise.
// Et aucune alerte de tout le trajet : le projet est sain, et un rapport qui paraîtrait dirait une
// perte.
//
// ═══ LE RELEVÉ, POUR COMPARER DEUX VERSIONS DU CODE ═══
//
// `RELEVE_PERSISTANCE=<chemin>` écrit tout ce que le trajet a produit : les quatre fichiers, les deux
// en-cours sans leur date ni la signature de leur fenêtre, ce qu'on a proposé aux dialogues, les
// alertes et les lignes de console de la persistance, le dossier jetable remplacé par `<D>`. Deux
// relevés pris avant et après une modification qui ne doit rien changer sont identiques.
//
// RIEN N'EST ÉCRIT HORS D'UN PROFIL ET D'UN DOSSIER JETABLES, et les trois sont retirés à la fin.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");
const EXEMPLE = join(RACINE, "exemples", "un-synthe-et-sa-bulle-d-effets.json");
const BOUTON_IMPORTER = 'button[aria-label^="Importer un projet"], button[aria-label^="Import a project"]';

/** Ce que le nœud porteur reçoit en plus : un champ de chaque genre enregistré, chacun reconnaissable. */
const CHAMPS_DU_PORTEUR: Record<string, unknown> = {
  zonesSelectionnees: [{ debut: 0.5, duree: 1.25 }],
  audioNom: "voix.wav", audioChemin: "C:/sons/voix.wav",
  midiNom: "theme.mid", imageNom: "pochette.png", svgNom: "trace.svg",
  sfzChemin: "C:/instruments/piano.sfz", sfzNom: "piano.sfz",
  sequenceNotes: [{ note: 60, debut: 0, duree: 0.5 }, { note: 64, debut: 0.5, duree: 0.5 }],
  morceaux: [{ id: "m1", piste: 0, debut: 0, duree: 1 }],
  portsVisibles: 3, portsVisiblesSortie: 2,
  nomFichier: "courbe.json",
};
/** Un champ que rien n'enregistre : le fichier écrit ne doit pas le porter. */
const CHAMP_INCONNU = "champInconnu";

/** Un méta que le graphe n'emploie pas : la bibliothèque le reçoit, le fichier écrit ne doit pas. */
const META_NON_EMPLOYE = {
  id: "meta-temoin-non-employe", nom: "Témoin non employé", nomEn: "Unused witness",
  entrees: [], sorties: [{ nom: "Out 1", nomEn: "Out 1", type: "audio" }],
  mapEntrees: [], mapSorties: [{ noeudInterne: "o", portIndex: 0 }],
  sousNoeuds: [{ id: "o", position: { x: 0, y: 0 }, data: { ficheId: "oscillateur", parametres: {} } }],
  sousAretes: [],
};

type Noeud = { id: string; position: { x: number; y: number }; data: Record<string, unknown> };
type Projet = { nodes: Noeud[]; edges: { id: string }[]; metas?: { id: string }[]; viewport?: unknown };

/** Le projet ouvert : un exemple livré, enrichi de ce que la persistance doit garder ou écarter. */
function semence(): Projet {
  const g = JSON.parse(readFileSync(EXEMPLE, "utf8")) as Projet;
  const porteur = g.nodes.find((n) => n.id === "courbe");
  const note = g.nodes.find((n) => n.data.ficheId === "comment");
  if (!porteur || !note) throw new Error("l'exemple a changé : il n'a plus de nœud « courbe » ou de note");
  Object.assign(porteur.data, CHAMPS_DU_PORTEUR, { [CHAMP_INCONNU]: "rien ne l'enregistre" });
  note.data.couleur = "#6a4cff";
  g.metas = [META_NON_EMPLOYE];
  // UNE VUE QUI LAISSE LE NŒUD DÉPLACÉ À L'ÉCRAN : la vue du fichier étant rendue, celle-ci décide de
  // ce que la souris peut saisir. À 0,75, « ecoute » tombait sous l'inspecteur. ET UN ZOOM DANS LES
  // BORNES DE REACT FLOW, de 0,5 à 2, les seuls que l'application écrive : en dessous, le premier
  // cran de molette ramène la vue à 0,5.
  g.viewport = { x: -200, y: 40, zoom: 0.55 };
  return g;
}

const ANTISLASH = String.fromCharCode(92);
/** Le dossier jetable change à chaque passe : il est remplacé par `<D>`, sous ses deux écritures. */
const normaliser = (texte: string, d: string) =>
  texte.split(d).join("<D>").split(d.split(ANTISLASH).join("/")).join("<D>");

/** Les lignes de console que la persistance écrit, et elles seules : le reste dépend de l'horloge. */
const LIGNES_DE_PERSISTANCE = [
  "[persistance]", "[attic] Sauvegardé", "[attic] Import", "[attic] chargement",
  "[attic] Données non-sérialisables", "[attic] Sauvegarde automatique", "[attic] Impossible de recharger",
];

/** L'application, ses dialogues remplacés par un témoin qui note ce qu'on lui propose. */
async function lancer(profil: string, ouvrir: string[], enregistrer: string[], journal: string[]) {
  const app = await electron.launch({
    args: [RACINE, `--user-data-dir=${profil}`],
    env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
  });
  await app.evaluate(({ dialog }, files) => {
    const proposes: string[] = [];
    (globalThis as Record<string, unknown>).__proposes__ = proposes;
    const aOuvrir = [...files.ouvrir];
    const aEnregistrer = [...files.enregistrer];
    const d = dialog as unknown as Record<string, unknown>;
    d.showOpenDialog = async (x: unknown, y?: unknown) => {
      proposes.push(`ouvrir ${String(((y ?? x) as { defaultPath?: string }).defaultPath ?? "")}`);
      const p = aOuvrir.shift();
      return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] };
    };
    d.showSaveDialog = async (x: unknown, y?: unknown) => {
      proposes.push(`enregistrer ${String(((y ?? x) as { defaultPath?: string }).defaultPath ?? "")}`);
      const p = aEnregistrer.shift();
      return p ? { canceled: false, filePath: p } : { canceled: true };
    };
  }, { ouvrir, enregistrer });
  const page = await app.firstWindow();
  page.on("console", (m) => {
    const t = m.text();
    if (LIGNES_DE_PERSISTANCE.some((p) => t.startsWith(p))) journal.push(t);
  });
  await page.waitForSelector(".attic-app", { timeout: 60_000 });
  // LES ALERTES SONT RECUEILLIES ET NON AFFICHÉES : une boîte modale arrêterait l'épreuve.
  await page.evaluate(() => {
    const w = window as unknown as { __alertes__: string[]; alert: (m: unknown) => void };
    w.__alertes__ = [];
    w.alert = (m) => { w.__alertes__.push(String(m)); };
  });
  return { app, page };
}

const proposes = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as Record<string, unknown>).__proposes__ as string[]);
const alertes = (page: Page) => page.evaluate(() => (window as unknown as { __alertes__: string[] }).__alertes__);

/** Ouvre un projet par le bouton de la barre, donc par le dialogue, et attend qu'il soit posé. */
async function ouvrirParLeDialogue(page: Page) {
  await page.locator(BOUTON_IMPORTER).first().click();
  await page.waitForSelector('.react-flow__node[data-id="ecoute"]', { timeout: 30_000 });
  await page.waitForTimeout(1000);
}

/**
 * Un raccourci de la barre, frappé hors de tout champ de saisie.
 *
 * LE FOCUS EST POSÉ ET VÉRIFIÉ, parce qu'un raccourci frappé dans un champ est ignoré, à bon droit, et
 * sans rien dire. Relevé le 2026-11-08 : un clic sur le canevas à (20, 20) tombait, selon le cadrage,
 * dans la zone de texte de la note, et l'export ne partait pas. Le titre de la barre ne prend pas le
 * focus : y cliquer le rend au document.
 */
async function raccourci(page: Page, touches: string) {
  await page.locator(".attic-titre").click();
  expect(await page.evaluate(() => document.activeElement?.tagName), "le focus est resté dans un champ").toBe("BODY");
  await page.keyboard.press(touches);
}

/** Le texte d'un fichier quand il est entier : écrit par le processus principal, il peut être en cours. */
function lireQuandEntier(chemin: string): string | null {
  if (!existsSync(chemin)) return null;
  const texte = readFileSync(chemin, "utf8");
  try { JSON.parse(texte); return texte; } catch { return null; }
}

/** Les deux en-cours de la fenêtre, une fois qu'ils portent le fichier attendu. */
async function enCours(page: Page, fichier: string) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("attic-current-file-path")), {
    timeout: 15_000, message: "l'en-cours partagé n'a pas reçu le fichier exporté",
  }).toBe(fichier);
  return page.evaluate(() => ({
    partage: localStorage.getItem("attic-encours"),
    propre: sessionStorage.getItem("attic-encours"),
  }));
}

/** Un en-cours sans ce qui change à chaque passe : sa date et la signature de sa fenêtre. */
function sansHorloge(texte: string | null) {
  const o = JSON.parse(texte ?? "null") as Record<string, unknown> | null;
  if (!o) return null;
  expect(typeof o.date, "un en-cours porte sa date").toBe("string");
  expect(typeof o.fenetre, "un en-cours porte la signature de sa fenêtre").toBe("string");
  delete o.date;
  delete o.fenetre;
  return o;
}

test.describe("l'aller-retour d'un projet par le disque", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(240_000);

  test("UN PROJET FAIT L'ALLER-RETOUR PAR LE DISQUE, et n'en revient ni amputé ni grossi", async () => {
    const d = mkdtempSync(join(tmpdir(), "attic-aller-retour-"));
    const profils = [mkdtempSync(join(tmpdir(), "attic-aller-retour-profil-")), mkdtempSync(join(tmpdir(), "attic-aller-retour-profil-"))];
    const entree = join(d, "entree.json");
    const exporte = join(d, "export.json");
    const reexporte = join(d, "reexport.json");
    const g = semence();
    // LES CONDITIONS DU CAS, vérifiées avant de conclure : sans elles il ne prouverait rien.
    expect(g.nodes.some((n) => n.data.bulle) && g.nodes.some((n) => n.data.bulleOuverte === false), "une bulle repliée").toBe(true);
    expect(g.nodes.some((n) => n.data.nomEn), "une note bilingue").toBe(true);
    expect(g.nodes.some((n) => n.data.ficheId === META_NON_EMPLOYE.id), "le méta témoin n'est pas employé").toBe(false);
    writeFileSync(entree, JSON.stringify(g, null, 2), "utf8");
    const journal: string[] = [];
    const releve: Record<string, unknown> = {};
    try {
      // ═══ 1. OUVRIR PAR LE DIALOGUE, PUIS ENREGISTRER ═══
      const un = await lancer(profils[0], [entree], [exporte], journal);
      try {
        await ouvrirParLeDialogue(un.page);
        await raccourci(un.page, "Control+s");
        let a = "";
        await expect.poll(() => { a = lireQuandEntier(entree) ?? ""; return a.startsWith('{\n  "formatVersion"'); }, {
          timeout: 15_000, message: "Ctrl+S n'a pas réécrit le projet ouvert",
        }).toBe(true);
        const A = JSON.parse(a) as Projet;
        expect(Object.keys(A)[0], "le numéro de format vient en premier").toBe("formatVersion");
        expect(A.nodes.map((n) => n.id)).toEqual(g.nodes.map((n) => n.id));
        const porteur = A.nodes.find((n) => n.id === "courbe")!;
        for (const [champ, valeur] of Object.entries(CHAMPS_DU_PORTEUR)) {
          expect(porteur.data[champ], `« ${champ} » perdu à l'enregistrement`).toEqual(valeur);
        }
        // CHAQUE NŒUD REVIENT AVEC SES CHAMPS, TOUS ET RIEN DE PLUS : ceux de l'exemple sont tous des
        // champs enregistrés, et le seul que le projet ouvert porte en trop est le champ inconnu.
        for (const n of A.nodes) {
          const avant = g.nodes.find((m) => m.id === n.id)!;
          const attendus = Object.keys(avant.data).filter((c) => c !== CHAMP_INCONNU).sort();
          expect(Object.keys(n.data).sort(), `${n.id} : un champ perdu ou gagné à l'enregistrement`).toEqual(attendus);
          for (const c of attendus) expect(n.data[c], `${n.id}.${c}`).toEqual(avant.data[c]);
        }
        expect(CHAMP_INCONNU in porteur.data, "un champ que rien n'enregistre a été écrit").toBe(false);
        expect(A.edges.map((e) => e.id), "une arête de substitution, ou une arête perdue").toEqual(g.edges.map((e) => e.id));
        expect((A.metas ?? []).map((m) => m.id), "le projet n'emporte que le méta qu'il emploie").toEqual(["meta-synth-soustractif"]);
        // LA VUE DU FICHIER EST RENDUE À L'OUVERTURE. Elle ne l'était pas : l'import remet la pile des
        // métas à zéro, et l'effet d'`App.tsx` qui recadre à chaque navigation dans un méta écrasait
        // la vue lue. Relevé le 2026-11-08, `{ x: 40, y: 80, zoom: 0.75 }` revenait
        // `{ x: -4, y: 300.75, zoom: 0.5 }` ; réparé le 2026-11-09.
        expect(A.viewport, "la vue du fichier n'a pas été rendue à l'ouverture").toEqual(g.viewport);

        // ═══ 2. DÉPLACER UN NŒUD, ET LAISSER LA SAUVEGARDE AUTOMATIQUE ÉCRIRE ═══
        const entete = un.page.locator('.react-flow__node[data-id="ecoute"] .attic-node-entete');
        const b = (await entete.boundingBox())!;
        // LE POINT SAISI EST SUR LE NŒUD, et non sur ce qui le couvre : sans cela le glisser ne déplace
        // rien, et l'échec se lit cinquante secondes plus tard comme une sauvegarde qui n'écrit pas.
        expect(await un.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".react-flow__node")?.getAttribute("data-id") ?? null,
          [b.x + 12, b.y + b.height / 2]), "le nœud à déplacer n'est pas sous la souris").toBe("ecoute");
        await un.page.mouse.move(b.x + 12, b.y + b.height / 2);
        await un.page.mouse.down();
        await un.page.mouse.move(b.x + 72, b.y + b.height / 2 + 40, { steps: 8 });
        await un.page.mouse.up();
        let autoTexte = "";
        await expect.poll(() => { autoTexte = lireQuandEntier(entree) ?? a; return autoTexte !== a; }, {
          timeout: 50_000, message: "la sauvegarde automatique n'a rien écrit en cinquante secondes",
        }).toBe(true);
        const B = JSON.parse(autoTexte) as Projet;
        const deplace = (p: Projet) => p.nodes.find((n) => n.id === "ecoute")!.position;
        expect(deplace(B), "le nœud n'a pas bougé").not.toEqual(deplace(A));
        expect({ ...B, nodes: B.nodes.map((n) => (n.id === "ecoute" ? { ...n, position: deplace(A) } : n)) },
          "la sauvegarde automatique a changé autre chose que la position déplacée").toEqual(A);
        expect((await proposes(un.app)).filter((p) => p.startsWith("enregistrer")), "un dialogue s'est ouvert").toEqual([]);

        // ═══ 3. EXPORTER ═══
        await raccourci(un.page, "Control+Shift+S");
        let c = "";
        await expect.poll(() => { c = lireQuandEntier(exporte) ?? ""; return c.length > 0; }, {
          timeout: 15_000, message: "l'export n'a rien écrit",
        }).toBe(true);
        expect(c, "l'export n'est pas le fichier que la sauvegarde automatique venait d'écrire").toBe(autoTexte);
        expect((await proposes(un.app)).filter((p) => p.startsWith("enregistrer")), "le dialogue ne proposait pas le fichier courant")
          .toEqual([`enregistrer ${entree}`]);
        const ec = await enCours(un.page, exporte);
        expect(ec.propre, "l'en-cours de la fenêtre n'est pas l'en-cours partagé").toBe(ec.partage);
        const E = sansHorloge(ec.partage) as unknown as Projet;
        const C = JSON.parse(c) as Projet;
        expect(E.nodes.map((n) => [n.id, n.position])).toEqual(C.nodes.map((n) => [n.id, n.position]));
        for (const n of E.nodes) {
          const f = C.nodes.find((m) => m.id === n.id)!;
          for (const k of Object.keys(n.data)) expect(n.data[k], `l'en-cours dit de ${n.id}.${k} autre chose que le fichier`).toEqual(f.data[k]);
        }
        expect(E.viewport).toEqual(C.viewport);
        expect(await alertes(un.page), "une alerte a paru").toEqual([]);
        Object.assign(releve, {
          enregistre: a, automatique: autoTexte, exporte: c,
          enCoursPartage: sansHorloge(ec.partage), enCoursFenetre: sansHorloge(ec.propre),
          proposesPremiere: (await proposes(un.app)).map((p) => normaliser(p, d)),
        });
      } finally {
        await un.app.close();
      }

      // ═══ 4. DANS UNE SECONDE APPLICATION, OUVRIR L'EXPORT ET L'EXPORTER À NOUVEAU ═══
      const deux = await lancer(profils[1], [exporte], [reexporte], journal);
      try {
        await ouvrirParLeDialogue(deux.page);
        await raccourci(deux.page, "Control+Shift+S");
        let f = "";
        await expect.poll(() => { f = lireQuandEntier(reexporte) ?? ""; return f.length > 0; }, {
          timeout: 15_000, message: "le second export n'a rien écrit",
        }).toBe(true);
        // VUE COMPRISE : la réouverture rend la vue du fichier (voir le point 1). Tant qu'elle
        // recadrait, le nœud déplacé changeait les bornes du graphe, et `x` passait de -4 à -30.
        expect(f, "l'aller-retour a changé le projet").toBe(releve.exporte);
        expect(await alertes(deux.page), "une alerte a paru à la réouverture").toEqual([]);
        Object.assign(releve, { reexporte: f, proposesSeconde: (await proposes(deux.app)).map((p) => normaliser(p, d)) });
      } finally {
        await deux.app.close();
      }

      const sortie = process.env.RELEVE_PERSISTANCE;
      if (sortie) {
        releve.console = journal.map((l) => normaliser(l, d));
        writeFileSync(sortie, JSON.stringify(releve, null, 2), "utf8");
      }
    } finally {
      for (const dossier of [d, ...profils]) {
        try { rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* retiré plus tard */ }
      }
    }
  });

  // ═══ UN EXEMPLE LIVRÉ S'OUVRE CADRÉ, et lui seul ═══
  //
  // Décidé par Fabien le 2026-11-09, quand la vue d'un projet ouvert a enfin été rendue : seize des
  // vingt exemples portaient une vue que personne n'avait vue, et sous elle sept s'ouvraient sur un
  // canevas presque vide. Celui-ci en est un : sa vue ne montre entier aucun de ses cinq nœuds. Le
  // même bouton ouvre aussi un projet pris hors du dossier des exemples, et celui-là garde sa vue.
  test("UN EXEMPLE S'OUVRE CADRÉ QUELLE QUE SOIT SA VUE, et un projet pris à côté garde la sienne", async () => {
    const exemple = EXEMPLE;
    const avant = readFileSync(exemple);
    const vueDuFichier = (JSON.parse(avant.toString("utf8")) as Projet).viewport;
    const d = mkdtempSync(join(tmpdir(), "attic-exemple-cadre-"));
    const profil = mkdtempSync(join(tmpdir(), "attic-exemple-cadre-profil-"));
    const projet = join(d, "a-cote.json");
    const g = semence();
    writeFileSync(projet, JSON.stringify(g, null, 2), "utf8");
    const { app, page } = await lancer(profil, [exemple, projet], [], []);
    /** La vue rendue, lue sur le canevas, et combien de nœuds visibles y tiennent entiers. */
    const relever = () => page.evaluate(() => {
      const t = (document.querySelector(".react-flow__viewport") as HTMLElement).style.transform;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t);
      const cadre = document.querySelector(".react-flow")!.getBoundingClientRect();
      const entiers = [...document.querySelectorAll<HTMLElement>(".react-flow__node")]
        .filter((n) => getComputedStyle(n).visibility !== "hidden")
        .map((n) => n.getBoundingClientRect())
        .filter((b) => b.left >= cadre.left && b.right <= cadre.right && b.top >= cadre.top && b.bottom <= cadre.bottom).length;
      return { vue: m ? { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) } : null, entiers };
    });
    const ouvrirUnExemple = async () => {
      await page.locator('button[aria-label^="Ouvrir un exemple"], button[aria-label^="Open an example"]').first().click();
      await page.waitForSelector('.react-flow__node[data-id="synth"]', { timeout: 30_000 });
      await page.waitForTimeout(1000);
    };
    try {
      await ouvrirUnExemple();
      const r = await relever();
      expect(r.vue, "l'exemple s'est ouvert sous la vue de son fichier").not.toEqual(vueDuFichier);
      expect(r.entiers, "cadré, l'exemple montre au moins un nœud entier").toBeGreaterThan(0);
      expect(await page.evaluate(() => localStorage.getItem("attic-current-file-path")), "un exemple n'est le fichier de personne").toBeNull();

      await ouvrirUnExemple();
      expect((await relever()).vue, "un projet pris hors des exemples a perdu sa vue").toEqual(g.viewport);
      expect(await alertes(page), "une alerte a paru").toEqual([]);
    } finally {
      await app.close();
      for (const dossier of [d, profil]) {
        try { rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* retiré plus tard */ }
      }
    }
    expect(readFileSync(exemple).equals(avant), "le fichier de l'exemple a été réécrit").toBe(true);
  });
});
