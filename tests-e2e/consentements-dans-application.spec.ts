// tests-e2e/consentements-dans-application.spec.ts — Ce qu'un fichier reçu doit montrer avant d'agir.
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// Deux questions sont posées par le processus principal, par une boîte NATIVE : avant d'exécuter
// un script Python inconnu (`electron/scripts-autorises.cjs`), et avant d'installer un composant
// reçu (`electron/resume-node-zip.cjs`). Les cas unitaires tiennent le texte et la liste ; aucun ne
// dit que le gestionnaire POSE la question, ni qu'un refus ARRÊTE vraiment. Entre eux il y a le
// pont, un canal et un gestionnaire, et c'est là qu'une boîte oubliée passerait inaperçue.
//
// UNE BOÎTE NATIVE NE SE CLIQUE PAS. On remplace donc `dialog.showMessageBox` dans le processus
// principal par un témoin qui note ce qu'on lui montre et rend la réponse choisie par le cas. C'est
// le même objet que `main.cjs` appelle : la substitution se voit du gestionnaire.
//
// RIEN N'EST ÉCRIT HORS D'UN PROFIL JETABLE : `home` est détourné vers un dossier temporaire, et le
// détournement est VÉRIFIÉ avant qu'un composant ne s'installe.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

const SCRIPT_RECU = "print('attic-script-recu')";
const SCRIPT_ECRIT = "print('attic-script-ecrit-ici')";

test.describe("les consentements, dans l'application qui tourne", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(180000);

  test("UN SCRIPT INCONNU EST MONTRÉ, UN REFUS L'ARRÊTE ; UN COMPOSANT REÇU EST NOMMÉ AVANT D'ÊTRE DÉPLIÉ", async () => {
    const profil = mkdtempSync(join(tmpdir(), "attic-consent-"));
    const maison = mkdtempSync(join(tmpdir(), "attic-maison-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");

      // ── Le témoin de la boîte, et le détournement de `home` ──
      const maisonVue = await app.evaluate(({ dialog, app: a }, dossier) => {
        const etat = globalThis as Record<string, unknown>;
        etat.__boites__ = [];
        etat.__reponse__ = 1;
        (dialog as unknown as { showMessageBox: unknown }).showMessageBox = async (x: unknown, y?: unknown) => {
          const o = (y ?? x) as { detail?: string; buttons?: string[]; defaultId?: number; cancelId?: number };
          (etat.__boites__ as unknown[]).push({ detail: o.detail, boutons: o.buttons, defaut: o.defaultId, annuler: o.cancelId });
          return { response: etat.__reponse__ as number };
        };
        a.setPath("home", dossier);
        return a.getPath("home");
      }, maison);
      const repondre = (r: number) => app.evaluate((_e, v) => { (globalThis as Record<string, unknown>).__reponse__ = v; }, r);
      const boites = () => app.evaluate(() => (globalThis as Record<string, unknown>).__boites__ as
        { detail: string; boutons: string[]; defaut: number; annuler: number }[]);
      const executer = (code: string) => page.evaluate(async (c) => {
        const api = (globalThis as unknown as { api: { pythonExecuter: (o: unknown) => Promise<Record<string, unknown>> } }).api;
        return api.pythonExecuter({ code: c, inputs: [], timeout: 20000, env: {} });
      }, code);

      // ── 1. Un script inconnu : la boîte est posée, et le refus arrête ──
      const refuse = await executer(SCRIPT_RECU);
      expect(refuse.refuse, "un script inconnu refusé s'est exécuté").toBe(true);
      expect(String(refuse.stdout ?? "")).not.toContain("attic-script-recu");
      let vues = await boites();
      expect(vues, "aucune boîte n'a été posée avant le script inconnu").toHaveLength(1);
      expect(vues[0].detail, "la boîte ne montre pas le script").toContain(SCRIPT_RECU);
      expect(vues[0].detail).toContain(createHash("sha256").update(SCRIPT_RECU, "utf8").digest("hex"));
      expect(vues[0].defaut, "le bouton par défaut doit être Annuler").toBe(vues[0].annuler);

      // ── 2. Le même script, accepté : il s'exécute, et ne se redemande plus ──
      await repondre(0);
      const accepte = await executer(SCRIPT_RECU);
      expect(accepte.ok, `le script accepté n'a pas tourné : ${String(accepte.erreur ?? "")}`).toBe(true);
      expect(String(accepte.stdout)).toContain("attic-script-recu");
      await repondre(1);
      const encore = await executer(SCRIPT_RECU);
      expect(encore.ok, "un script autorisé a été redemandé et refusé").toBe(true);
      expect(await boites(), "un script autorisé a été redemandé").toHaveLength(2);

      // ── 3. Un script écrit ici : aucune question ──
      await page.evaluate(async (c) => {
        await (globalThis as unknown as { api: { scriptsEcritIci: (s: string) => Promise<unknown> } }).api.scriptsEcritIci(c);
      }, SCRIPT_ECRIT);
      const ecrit = await executer(SCRIPT_ECRIT);
      expect(ecrit.ok, "un script écrit ici a été refusé").toBe(true);
      expect(await boites(), "un script écrit ici a été questionné").toHaveLength(2);

      // ── 4. Un composant reçu : nommé avant d'être déplié, et le refus n'écrit rien ──
      expect(maisonVue, "`home` n'a pas été détourné : on n'installe rien").toBe(maison);
      const zip = new AdmZip();
      const manifeste = { id: "attic-essai-consent", nom: "Essai de consentement", univers: "Autres", famille: "Essai",
        resume: "x", entrees: [], sorties: [{ nom: "Audio", type: "audio" }], parametres: [{ nom: "Gain" }] };
      const code = "module.exports = async () => ({ valeurs: [null] });";
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifeste)));
      zip.addFile("executer.js", Buffer.from(code));
      const cheminZip = join(maison, "essai.zip");
      zip.writeZip(cheminZip);
      const installer = () => page.evaluate(async (p) =>
        (globalThis as unknown as { api: { importerNodeZip: (s: string) => Promise<Record<string, unknown>> } }).api.importerNodeZip(p),
      cheminZip);
      const dossierDuNoeud = join(maison, ".attic", "nodes", "attic-essai-consent");

      const annule = await installer();
      expect(annule.annule, "l'import refusé n'a pas été annulé").toBe(true);
      expect(existsSync(dossierDuNoeud), "un import refusé a déplié l'archive").toBe(false);
      vues = await boites();
      expect(vues).toHaveLength(3);
      expect(vues[2].detail).toContain("Essai de consentement");
      // LA BOÎTE PARLE LA LANGUE DU SYSTÈME, et le cas ne suppose pas laquelle.
      expect(/Réglages : Gain|Settings: Gain/.test(vues[2].detail), "la boîte ne nomme pas les réglages").toBe(true);
      expect(vues[2].detail).toContain(createHash("sha256").update(code, "utf8").digest("hex"));

      await repondre(0);
      const installe = await installer();
      expect(installe.ok, `l'import accepté a échoué : ${String(installe.erreur ?? "")}`).toBe(true);
      expect(installe.empreinte).toBe(createHash("sha256").update(code, "utf8").digest("hex"));
      expect(existsSync(dossierDuNoeud), "l'import accepté n'a rien déplié").toBe(true);
    } finally {
      await app.close();
    }
  });
});
