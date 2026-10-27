// tests-e2e/csp-dans-application.spec.ts — La politique de sécurité s'applique-t-elle à l'application livrée ?
//
// ═══ POURQUOI CETTE ÉPREUVE ═══
//
// La CSP est posée par `session.webRequest.onHeadersReceived`, comme un EN-TÊTE de réponse. Or
// l'application empaquetée se charge par `loadFile`, donc depuis `file://`, et une réponse de
// fichier n'a pas d'en-têtes à réécrire. Que la politique y parvienne ne se lit dans aucun fichier :
// cela se mesure, dans l'application lancée comme on la livre.
//
// L'INSTRUMENT. Une requête vers un hôte que `connect-src` ne nomme pas. Si la politique s'applique,
// le navigateur la refuse AVANT le réseau et émet un `securitypolicyviolation` ; sinon, la requête
// part et échoue sur le réseau, sans violation. Le témoin inverse est posé dans le même lancement :
// une requête vers `data:`, que la politique autorise, ne doit lever aucune violation.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(RACINE, "dist", "index.html");

test.describe("la politique de sécurité de l'application livrée", () => {
  test.skip(!existsSync(BUILD), "Aucun build : lancer « npm run build » avant cette épreuve.");
  test.setTimeout(120000);

  test("CONNECT-SRC REFUSE UN HÔTE QU'IL NE NOMME PAS, dans la page chargée depuis le build", async () => {
    const profil = mkdtempSync(join(tmpdir(), "attic-csp-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState("domcontentloaded");
      const releve = await page.evaluate(async () => {
        const violations: { directive: string; bloque: string }[] = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          violations.push({ directive: e.effectiveDirective, bloque: e.blockedURI });
        });
        const essayer = async (url: string) => { try { await fetch(url); return "passe"; } catch { return "echoue"; } };
        const temoin = await essayer("data:text/plain,attic");
        const avantTemoin = violations.length;
        const interdit = await essayer("https://attic-csp-sonde.invalid/");
        await new Promise((r) => setTimeout(r, 300));
        return { protocole: location.protocol, temoin, avantTemoin, interdit, violations };
      });
      console.log("[csp] relevé", JSON.stringify(releve));
      expect(releve.protocole, "la page n'est pas celle du build : l'épreuve ne mesurerait rien").toBe("file:");
      expect(releve.temoin, "le témoin autorisé n'a pas passé : l'instrument est faux").toBe("passe");
      expect(releve.avantTemoin, "le témoin autorisé a levé une violation").toBe(0);
      expect(releve.violations.some((v) => v.directive === "connect-src"),
        "aucune violation de connect-src : la politique ne s'applique pas à la page livrée").toBe(true);
    } finally {
      await app.close();
    }
  });

  test("LE DOCUMENT REFUSE EVAL, COMPILE ENCORE LE WEBASSEMBLY, ET LE CADRE ISOLÉ ÉVALUE ENCORE", async () => {
    // ═══ CE QUE CE CAS TIENT ═══
    //
    // `unsafe-eval` a quitté la politique du document le 2026-10-27 : il n'existait plus que pour le
    // code des nœuds installés, qui s'évalue dans un cadre isolé servi par sa propre page
    // (`cadre-noeud.html`), sous sa propre politique. Trois moitiés à tenir ensemble, dans
    // l'application construite : le document refuse, le WebAssembly — Csound, Verovio, onnxruntime —
    // compile toujours, et le cadre, lui, évalue.
    const profil = mkdtempSync(join(tmpdir(), "attic-csp-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });
    try {
      const page = await app.firstWindow();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const releve = await page.evaluate(async () => {
        // HORS DE LA TÂCHE DE DEVTOOLS. Le code qu'injecte `page.evaluate` est évalué par l'inspecteur,
        // qui lève l'interdiction de générer du code le temps de sa propre évaluation : un `eval` écrit
        // directement ici PASSAIT sous la politique stricte. Différé d'une tâche, il s'exécute comme le
        // code de la page, et c'est ce qu'on veut mesurer.
        const essayer = (f: () => unknown) => new Promise<string>((r) => setTimeout(() => {
          try { f(); r("passe"); } catch (e) { r((e as Error).name); }
        }, 0));
        // eslint-disable-next-line no-eval
        const evalDirect = await essayer(() => eval("1 + 1"));
        const constructeur = await essayer(() => new Function("return 1")());
        let wasm = "?";
        try {
          await WebAssembly.compile(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
          wasm = "passe";
        } catch (e) { wasm = (e as Error).name; }
        const bac = (globalThis as unknown as { __attic_bac__?: {
          executer: (cle: string, code: string, ctx: Record<string, unknown>, p: (m: string) => void) => Promise<Record<string, unknown>>;
          oublier: (cle: string) => void;
        } }).__attic_bac__;
        let cadre: unknown = "absent";
        let violationsCadre: string[] = [];
        if (bac) {
          try {
            // LE CADRE DOIT ÉVALUER, ET NE JOINDRE QUE LES ADRESSES PERMISES. La seconde moitié se lit
            // à une violation `connect-src` levée DANS le cadre : sans elle, rien ne dirait qu'une
            // politique l'atteint, une page chargée depuis `file://` pouvant n'en recevoir aucune.
            const code = "module.exports = async () => { const v = [];"
              + " document.addEventListener('securitypolicyviolation', (e) => v.push(e.effectiveDirective));"
              + " try { await fetch('https://attic-csp-sonde.invalid/'); } catch (e) {}"
              + " await new Promise((r) => setTimeout(r, 300));"
              + " return { valeurs: [], sept: new Function('return 7')(), violations: v }; };";
            const r = await bac.executer("essai-csp", code, {
              noeud: { id: "n", data: {} }, repertoireTravail: "", parametres: {}, entrees: [],
              sortiesBranchees: [], reglagesDeProjet: {},
            }, () => {});
            cadre = r.sept;
            violationsCadre = (r.violations as string[]) ?? [];
          } catch (e) { cadre = `leve: ${(e as Error).message}`; }
          bac.oublier("essai-csp");
        }
        return { evalDirect, constructeur, wasm, cadre, violationsCadre };
      });
      console.log("[csp] document et cadre", JSON.stringify(releve));
      expect(releve.evalDirect, "le document évalue encore : unsafe-eval est revenu").toBe("EvalError");
      expect(releve.constructeur, "le document construit encore des fonctions").toBe("EvalError");
      expect(releve.wasm, "le WebAssembly ne compile plus : wasm-unsafe-eval manque").toBe("passe");
      expect(releve.cadre, "le cadre isolé n'évalue plus le code d'un nœud installé").toBe(7);
      // ET C'EST BIEN SA POLITIQUE QUI L'ATTEINT : elle refuse un hôte non nommé, et permet `eval`
      // — celle du document le lui refuserait. Mesuré le 2026-10-27 : une page de cadre chargée depuis
      // `file://` reçoit sa politique ; un script de WORKER, lui, n'en reçoit aucune.
      expect(releve.violationsCadre, "aucune politique n'atteint le cadre : il joint n'importe quelle adresse").toContain("connect-src");
    } finally {
      await app.close();
    }
  });

  test("LE WORKER DE VOSK, SERVI PAR SON FICHIER, DÉMARRE ; LE MÊME CODE EN BLOB BUTE SUR LA POLITIQUE DU DOCUMENT", async () => {
    // ═══ CE QUE CE CAS TIENT ═══
    //
    // Le code Emscripten de Vosk construit des fonctions (embind). Relevé le 2026-10-27 : son worker
    // naissait d'un blob, qui hérite la politique du document, et Vosk ne démarrait plus. Il est servi
    // désormais par `vosk-worker.js` (`src/audio/vosk-travailleur.ts`).
    //
    // CE QUE CE CAS NE TIENT PAS, ET IL A FAILLI LE PRÉTENDRE : que le worker reçoive SA politique.
    // Dans l'application livrée, un worker chargé depuis `file://` n'en reçoit AUCUNE — mesuré : avec
    // `connect-src 'none'` réservé à ce fichier, il a tout de même joint le réseau. Le premier jet de
    // ce cas restait vert quand on retirait la politique du worker, et c'est ainsi que la mesure a été
    // faite. Ce qui fait démarrer Vosk ici, c'est d'être sorti du blob.
    //
    // LE TÉMOIN EST LE MÊME CODE, LANCÉ EN BLOB : il DOIT tomber sur `EvalError`. Sans lui, un worker
    // qui échouerait avant d'initialiser son moteur passerait pour un worker qui l'a initialisé. Le
    // modèle demandé n'existe pas : le worker servi par fichier doit aller jusqu'au téléchargement, et
    // y échouer — ce qui prouve qu'embind s'est construit.
    const profil = mkdtempSync(join(tmpdir(), "attic-csp-vosk-"));
    const app = await electron.launch({
      args: [RACINE, `--user-data-dir=${profil}`],
      env: { ...process.env, NODE_ENV: "test", ATTIC_SANS_MAJ: "1" },
    });
    try {
      const page = await app.firstWindow();
      await page.waitForSelector(".attic-app", { timeout: 60000 });
      const ESSAI = { action: "load", modelUrl: "https://storage.googleapis.com/attic-modele-inexistant/m.tar.gz" };
      const parFichier = await page.evaluate((essai) => new Promise<string>((resoudre) => {
        const w = new Worker(new URL("vosk-worker.js", document.baseURI));
        w.onerror = (e) => resoudre(`ERREUR ${String((e as ErrorEvent).message)}`);
        w.onmessage = (e) => resoudre(`MESSAGE ${JSON.stringify(e.data)}`);
        w.postMessage(essai);
        setTimeout(() => resoudre("SILENCE"), 20000);
      }), ESSAI);
      const enBlob = await page.evaluate(async ([chemin, essai]) => {
        const api = (globalThis as unknown as { api: { lireTexte: (c: string) => Promise<unknown> } }).api;
        const lu = await api.lireTexte(chemin);
        const texte = typeof lu === "string" ? lu : (lu as { contenu?: string })?.contenu ?? "";
        const w = new Worker(URL.createObjectURL(new Blob([texte], { type: "application/javascript" })));
        return await new Promise<string>((resoudre) => {
          w.onerror = (e) => resoudre(`ERREUR ${String((e as ErrorEvent).message)}`);
          w.onmessage = (e) => resoudre(`MESSAGE ${JSON.stringify(e.data)}`);
          w.postMessage(essai);
          setTimeout(() => resoudre("SILENCE"), 20000);
        });
      }, [join(RACINE, "dist", "vosk-worker.js"), ESSAI] as const);
      console.log("[csp] vosk par fichier :", parFichier.slice(0, 160));
      console.log("[csp] vosk en blob    :", enBlob.slice(0, 160));
      expect(enBlob, "le témoin en blob n'a pas buté sur la politique : le cas ne prouverait rien").toMatch(/unsafe-eval|EvalError/);
      expect(parFichier, "le worker servi par fichier bute sur la politique du document").not.toMatch(/unsafe-eval|EvalError/);
      expect(parFichier, "le worker servi par fichier n'est pas allé jusqu'au téléchargement du modèle").toMatch(/HTTP error/);
    } finally {
      await app.close();
    }
  });
});
