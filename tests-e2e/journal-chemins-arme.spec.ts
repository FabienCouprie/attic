// tests-e2e/journal-chemins-arme.spec.ts — Le relevé des chemins s'arme vraiment, dans l'application.
//
// POURQUOI CE CAS EXISTE, ET IL VIENT D'UN ÉCHEC RÉPÉTÉ. J'ai demandé trois fois à Fabien de lancer
// l'application avec le relevé armé ; trois fois aucun journal n'est apparu, et trois fois j'ai
// cherché la panne au mauvais endroit — d'abord dans un chemin que j'avais DEVINÉ au lieu de le
// chercher, puis dans un signal de console INVISIBLE sous Windows pour le processus principal
// d'Electron, puis dans une consigne qui nommait un script `npm run electron` QUI N'EXISTE PAS.
//
// À chaque tour je lui faisais refaire l'essai pour découvrir ma faute suivante. C'est exactement ce
// qu'un cas automatique évite : il lance l'application LUI-MÊME, et il dit ce qui s'est passé.
//
// ET IL DEMANDE À L'APPLICATION OÙ ELLE ÉCRIT, au lieu de le supposer. `app.getPath("userData")` ne
// porte pas le même nom selon qu'on lance l'application empaquetée ou `electron .` : les deux
// dossiers existent sur la machine de Fabien, et j'ai regardé le mauvais. Ici, c'est l'application
// qui le dit.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, _electron as electron } from "@playwright/test";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");
const BUILD = join(RACINE, "dist", "index.html");

test.describe("le relevé des chemins", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(180_000);

  test("S'ARME DANS L'APPLICATION, et le fichier parait des le demarrage", async () => {
    // UN PROFIL JETABLE, et c'est une faute réparée. Ce cas partait du profil réel : le journal y
    // s'accumulant d'un lancement à l'autre, il lisait des lignes de l'exécution d'AVANT, et il a
    // fini par échouer pour une raison qui n'était pas la sienne. Pire, il mêlait ses témoins au
    // relevé de Fabien — celui-là même qu'on lui demandait de produire.
    const profil = mkdtempSync(join(tmpdir(), "attic-journal-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      // LE DRAPEAU EST POSÉ ICI, dans l'environnement du processus principal — c'est le seul endroit
      // qui compte, et c'est précisément ce qui n'avait jamais été éprouvé.
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1", ATTIC_JOURNAL_CHEMINS: "1" },
    });
    try {
      // ON DEMANDE À L'APPLICATION, et l'on ne devine pas : c'est la faute que ce cas répare.
      const userData = await app.evaluate(({ app: a }) => a.getPath("userData"));
      const journal = join(userData, "journal-chemins.jsonl");
      await app.firstWindow();

      expect(existsSync(journal), [
        "",
        `Le relevé ne s'est pas armé : aucun fichier à ${journal}`,
        "",
        "`armerJournal` est appelé dans `app.whenReady()` de `electron/main.cjs` et n'écrit que si",
        "`ATTIC_JOURNAL_CHEMINS` vaut « 1 ». Si ce cas échoue, c'est le MÉCANISME qui est en cause,",
        "et non la consigne donnée à l'utilisateur — ce cas pose le drapeau lui-même.",
        "",
      ].join("\n")).toBe(true);

      const lignes = readFileSync(journal, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      expect(lignes[0], "la première ligne dit l'armement, avant tout événement")
        .toMatchObject({ quoi: "arme" });
      console.log(`relevé armé · userData = ${userData}`);

      /**
       * La destination cherchée, RECONNUE PAR SON CHEMIN.
       *
       * UN PREMIER JET LISAIT `ecritures[0]`, et c'était un vert qui ne prouvait rien : le journal
       * s'accumule d'un lancement à l'autre — voulu, un relevé qui s'effacerait ne dirait rien de
       * l'usage d'une semaine —, de sorte qu'à la deuxième exécution cette ligne venait de la
       * première. L'assertion aurait tenu même si l'écriture du jour était refusée. Le profil
       * jetable ci-dessus l'évite déjà ; reconnaître la destination par son nom le ferme deux fois.
       */
      const inscriteDe = (cible: string) => {
        const toutes = readFileSync(journal, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
        const base = cible.replace(/\\/g, "/").split("/").pop();
        return toutes
          .filter((l) => l.quoi === "ecrire" && String(l.chemin).replace(/\\/g, "/").endsWith(`/${base}`));
      };

      // ET LE RELEVÉ DES CANAUX DOIT VOIR QUELQUE CHOSE, sans quoi il ne répondra jamais à la
      // question pour laquelle il existe. Il est né d'un échec : une liste de gestes déduite de la
      // source, et un journal resté vide après que Fabien les ait tous faits. Un instrument qu'on
      // n'a pas vu fonctionner est une quatrième supposition.
      //
      // ON DÉCLENCHE UN CANAL CONNU plutôt que d'attendre que le démarrage en allume un : un premier
      // jet supposait qu'au moins un s'allumerait tout seul, et il ne s'en allumait aucun. Supposer
      // ce qui s'allume était exactement la faute que cet instrument répare. `dossier:travail-defaut`
      // est en lecture et ne touche à rien.
      const fenetre = await app.firstWindow();
      await fenetre.evaluate(async () => {
        const api = (window as unknown as { api?: { obtenirRepertoireTravail?: () => Promise<unknown> } }).api;
        await api?.obtenirRepertoireTravail?.();
      });
      await new Promise((r) => setTimeout(r, 1500));
      const apres = readFileSync(journal, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const canaux = apres.filter((l) => l.quoi === "canal").map((l) => l.canal);
      console.log(`canaux relevés au démarrage : ${[...new Set(canaux)].join(", ") || "aucun"}`);
      // ET UNE ÉCRITURE RÉELLE PAR LE PONT, inscrite comme telle. C'est le chemin pour lequel tout
      // ce relevé existe, et il n'avait jamais été éprouvé dans l'application : j'ai successivement
      // accusé l'armement, l'instance employée, puis l'absence d'un dossier de travail — trois
      // suppositions, trois fausses. Celle-ci est une mesure.
      const dansTemp = join(tmpdir(), `attic-essai-pont-${Date.now()}.txt`);
      const ecrit = await fenetre.evaluate(async (cible) => {
        const api = (window as unknown as {
          api?: { ecrireFichier?: (c: string, d: unknown) => Promise<unknown> };
        }).api;
        return await api?.ecrireFichier?.(cible, new TextEncoder().encode("essai")) ?? null;
      }, dansTemp);
      await new Promise((r) => setTimeout(r, 800));
      const ecritures = inscriteDe(dansTemp);
      console.log(`écriture par le pont : rendu=${JSON.stringify(ecrit)} · ${ecritures.length} inscrite(s)`);
      expect(ecritures.length, [
        "", "Une écriture par `api.ecrireFichier` n'a pas été inscrite au journal.",
        "C'est le chemin pour lequel ce relevé existe : s'il ne s'inscrit pas, le relevé ne",
        "servira jamais, quoi que l'utilisateur fasse dans l'application.", "",
      ].join("\n")).toBeGreaterThan(0);
      // LE DOSSIER TEMPORAIRE N'EST PAS UNE RACINE, et c'est délibéré : aucune destination relevée
      // n'y mène, et il est partagé avec toutes les autres applications de la machine. La sanction
      // étant ARMÉE PAR DÉFAUT depuis le 2026-10-27, l'écriture est REFUSÉE — le pont rend `null`,
      // aucun fichier n'apparaît —, et le journal le note. Ce cas attendait auparavant qu'elle passe
      // par tolérance ; c'est l'état d'avant l'armement, qui s'obtient désormais par
      // `ATTIC_RACINES_STRICTES=0`.
      expect(ecritures.at(-1), "hors racine : refusé par la sanction armée, et noté")
        .toMatchObject({ quoi: "ecrire", accepte: false, sousRacine: false });
      expect(ecrit, "le pont a écrit hors racine : la sanction n'est pas armée par défaut").toBeNull();
      expect(existsSync(dansTemp), "un fichier est apparu hors racine").toBe(false);
      rmSync(dansTemp, { force: true });

      // ET LE DOSSIER DE TRAVAIL EST UNE RACINE, lui. C'est la leçon du premier relevé réel : il
      // portait une écriture dans `<dépôt>/work` marquée HORS RACINE, alors que c'est l'endroit où
      // l'application est faite pour écrire. Sans cette déclaration, rallumer la sanction aurait
      // cassé tous les exports.
      const travail = await fenetre.evaluate(async () => {
        const api = (window as unknown as {
          api?: { obtenirRepertoireTravail?: () => Promise<string | null> };
        }).api;
        return (await api?.obtenirRepertoireTravail?.()) ?? null;
      });
      expect(travail, "l'application doit savoir où est son dossier de travail").toBeTruthy();
      const dansTravail = join(travail as string, `essai-racine-${Date.now()}.txt`);
      await fenetre.evaluate(async (cible) => {
        const api = (window as unknown as {
          api?: { ecrireFichier?: (c: string, d: unknown) => Promise<unknown> };
        }).api;
        await api?.ecrireFichier?.(cible, new TextEncoder().encode("essai"));
      }, dansTravail);
      await new Promise((r) => setTimeout(r, 800));
      const celle = inscriteDe(dansTravail).at(-1);
      // LE TÉMOIN EST RETIRÉ AVANT L'ASSERTION, et non après : le dossier de travail est celui de
      // l'utilisateur, et un cas qui échoue n'a pas à y laisser ses miettes.
      rmSync(dansTravail, { force: true });
      console.log(`écriture dans le dossier de travail : sousRacine=${celle?.sousRacine}`);
      expect(celle, [
        "",
        "Une écriture dans le dossier de travail doit être SOUS une racine.",
        "",
        "C'est la ligne que le premier relevé réel portait en « ← HORS RACINE ».",
        "",
        "CE CAS-CI NE PROUVE PAS LE MOMENT DE LA DÉCLARATION : il vient d'appeler",
        "`obtenirRepertoireTravail` ci-dessus, et ce canal déclare la racine en chemin. Ce qu'il",
        "vérifie est l'INSCRIPTION — que le journal distingue bien dedans de dehors. Le moment,",
        "lui, est éprouvé par le cas de la sanction rallumée, qui ne demande rien à l'application.",
        "",
      ].join("\n")).toMatchObject({ sousRacine: true });

      expect(canaux.length, [
        "",
        "Le relevé des canaux n'a rien vu, pas même au démarrage de l'application.",
        "L'emballage d'`ipcMain.handle` est posé AVANT tout enregistrement de gestionnaire dans",
        "`electron/main.cjs` ; s'il ne voit rien, c'est lui qui est en cause.",
        "",
      ].join("\n")).toBeGreaterThan(0);
    } finally {
      await app.close();
      rmSync(profil, { recursive: true, force: true });
    }
  });

  // ═══ LA SANCTION, RALLUMÉE, DANS L'APPLICATION ═══
  //
  // CE CAS EST CELUI QUE J'AVAIS PROMIS : « un garde qui vérifie qu'une écriture hors racine est
  // refusée, et un autre que les destinations relevées passent toujours. » Les deux moitiés sont
  // ici, dans le même lancement, parce que séparées elles ne diraient rien — un refus de tout
  // passerait la première, et une acceptation de tout passerait la seconde.
  //
  // IL TOURNE AVEC `ATTIC_RACINES_STRICTES=1` alors que l'application ne l'a pas encore allumé par
  // défaut. C'est exactement ce qu'un garde doit faire ici : éprouver le jour d'après avant qu'il
  // n'arrive, pour que le drapeau n'ait plus qu'à être renversé.
  test("ET SA SANCTION, RALLUMEE, REFUSE HORS RACINE et laisse passer le dossier de travail", async () => {
    const profil = mkdtempSync(join(tmpdir(), "attic-strict-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: {
        ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1",
        ATTIC_JOURNAL_CHEMINS: "1", ATTIC_RACINES_STRICTES: "1",
      },
    });
    try {
      const fenetre = await app.firstWindow();
      const ecrire = (cible: string) => fenetre.evaluate(async (c) => {
        const api = (window as unknown as {
          api?: { ecrireFichier?: (c: string, d: unknown) => Promise<unknown> };
        }).api;
        return (await api?.ecrireFichier?.(c, new TextEncoder().encode("essai"))) ?? null;
      }, cible);

      // LA MOITIÉ QUI REFUSE. Le temporaire n'est pas une racine : aucune destination relevée n'y
      // mène, et il est partagé avec toutes les autres applications de la machine.
      const hors = join(tmpdir(), `attic-strict-hors-${Date.now()}.txt`);
      const rendu = await ecrire(hors);
      console.log(`strict · hors racine : rendu=${JSON.stringify(rendu)} · fichier=${existsSync(hors)}`);
      expect(rendu, "hors racine, la sanction rallumée doit refuser").toBeNull();
      expect(existsSync(hors), "et RIEN NE DOIT ÊTRE ÉCRIT : un refus qui écrit n'est pas un refus")
        .toBe(false);

      // LA MOITIÉ QUI PASSE, et c'est elle qui dit que la sanction est vivable. C'est la ligne même
      // du relevé de Fabien, `E:/attic/work/export.svg`, qui était marquée HORS RACINE.
      //
      // ═══ ET CE CAS NE DEMANDE SURTOUT PAS LE DOSSIER À L'APPLICATION ═══
      //
      // UN PREMIER JET APPELAIT `obtenirRepertoireTravail` pour savoir où écrire, ET IL ÉTAIT VERT
      // SUR LE DÉFAUT QU'IL DEVAIT ATTRAPER. J'ai retiré du démarrage la déclaration de la racine,
      // relancé : vert. La cause est que cet appel passe par `dossier:travail-defaut`, dont le
      // gestionnaire DÉCLARE la racine en chemin — mon instrument frappait lui-même la capacité
      // qu'il prétendait vérifier. C'est précisément le défaut mesuré, puisque l'interface, elle,
      // n'appelle ce canal que si son réglage `attic-repertoire` est vide.
      //
      // LE CHEMIN EST DONC CALCULÉ ICI, et l'hypothèse qui le permet est VÉRIFIÉE, non supposée :
      // hors empaquetage, le dossier de travail est `<dépôt>/work`.
      expect(await app.evaluate(({ app: a }) => a.isPackaged),
        "ce cas calcule le dossier de travail de la branche NON empaquetée").toBe(false);
      const travail = join(RACINE, "work");
      const dedans = join(travail, `attic-strict-dedans-${Date.now()}.txt`);
      const renduDedans = await ecrire(dedans);
      const ecrit = existsSync(dedans);
      rmSync(dedans, { force: true });
      console.log(`strict · dossier de travail : rendu=${JSON.stringify(renduDedans)} · fichier=${ecrit}`);
      expect(renduDedans, [
        "",
        "La sanction rallumée refuse une écriture dans le DOSSIER DE TRAVAIL de l'application.",
        "",
        "C'est la régression à ne jamais laisser passer : tous les exports y vont. Le dossier est",
        "déclaré racine dans `app.whenReady` de `electron/main.cjs`, et non au premier appel du",
        "rendu — l'interface ne demande `dossier:travail-defaut` que si son réglage est vide.",
        "",
      ].join("\n")).not.toBeNull();
      expect(ecrit, "et le fichier doit exister pour de vrai").toBe(true);
    } finally {
      await app.close();
      rmSync(profil, { recursive: true, force: true });
    }
  });

  test("ET IL RESTE INERTE SANS LE DRAPEAU : rien ne s'ecrit sur le disque de qui n'a rien demande", async () => {
    // ═══ CE CAS A SON PROPRE PROFIL, ET C'EST UNE FAUTE RÉPARÉE ═══
    //
    // Un premier jet partait du profil réel et faisait `rmSync(journal)` pour avoir un disque
    // propre : il EFFAÇAIT LE RELEVÉ DE FABIEN à chaque exécution — le relevé même qu'on lui
    // demandait de produire, et que j'ai déjà supprimé deux fois à la main dans cette session.
    //
    // `--user-data-dir` donne un profil jetable. Le cas y prouve exactement ce qu'il annonce, sans
    // toucher à quoi que ce soit qui appartienne à quelqu'un.
    const profil = mkdtempSync(join(tmpdir(), "attic-profil-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1", ATTIC_JOURNAL_CHEMINS: "" },
    });
    try {
      const userData = await app.evaluate(({ app: a }) => a.getPath("userData"));
      expect(userData, "le profil jetable doit bien être celui qu'emploie l'application")
        .toBe(profil);
      const journal = join(userData, "journal-chemins.jsonl");
      await app.firstWindow();
      expect(existsSync(journal),
        "un relevé qui s'armerait sans qu'on le demande serait un coût permanent imposé").toBe(false);
    } finally {
      await app.close();
      rmSync(profil, { recursive: true, force: true });
    }
  });
});
