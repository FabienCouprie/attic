// electron/ipc-scripts.cjs — Python, Julia et les scripts écrits dans l'éditeur : leurs IPC.
//
// TIRÉ DE `main.cjs` LE 2026-11-08, tel quel, par le lot 5 de la revue d'architecture du
// 2026-10-31. C'est le deuxième des six modules qui reprennent par famille les canaux de
// `main.cjs`, après `ipc-maj.cjs`. Aucune ligne de calcul n'a été retouchée : les quatre morceaux
// sont les mêmes, indentés d'un cran dans la fonction qui les installe.
//
// CE QUI EST VENU AVEC LES CANAUX, et pourquoi : rien d'autre dans `main.cjs` ne s'en servait.
//   · la question d'autorisation d'un script et le refus qu'elle rend ;
//   · la lecture de version d'un exécutable, sans shell ;
//   · la détection des deux interprètes et leurs chemins, que `python:definir-chemin` et
//     `julia:definir-chemin` changent.
//
// LA DÉTECTION SE FAIT DÉSORMAIS À L'APPEL, et non plus en tête de `main.cjs`. Elle a toujours lieu
// au chargement du module principal, avant que l'application soit prête, donc avant toute fenêtre.
// Entre son ancienne place et l'appel, aucune ligne ne lisait ces chemins : ils étaient propres à
// `main.cjs`, et seuls ces canaux les nomment.
//
// IL REÇOIT CE DONT IL A BESOIN, et ne requiert pas `electron` : c'est la forme de `ipc-maj.cjs`.
// `showOpenDialogSuivi` lui vient de `main.cjs`, parce que c'est lui qui fait naître une racine
// quand la personne désigne un exécutable ; une copie ici ferait deux portes à tenir.
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync, execFile } = require("child_process");
const { inscrireTravail } = require("./travaux.cjs");
const { scriptAutorise, autoriserScript, questionPourScript } = require("./scripts-autorises.cjs");
const { infoExecutable } = require("./executables.cjs");
const { fenetreDe } = require("./fenetres.cjs");

/**
 * Détecte Python et Julia, puis installe les neuf canaux `python:`, `julia:` et `scripts:`.
 *
 * @param ipcMain               le récepteur des IPC, déjà emballé par `main.cjs` ;
 * @param app                   pour `userData`, le dossier temporaire et la langue ;
 * @param BrowserWindow         pour trouver la fenêtre qui pose la question ;
 * @param dialog                pour la question d'autorisation d'un script ;
 * @param showOpenDialogSuivi   le dialogue d'ouverture de `main.cjs`, qui accorde la racine choisie.
 */
function installerIpcScripts({ ipcMain, app, BrowserWindow, dialog, showOpenDialogSuivi }) {
  /**
   * Le script peut-il s'exécuter ? Oui s'il est déjà autorisé ; sinon, la personne le lit et décide.
   *
   * LA QUESTION EST POSÉE ICI, DU CÔTÉ PRIVILÉGIÉ, par une boîte native : un script arrivé dans un
   * projet reçu ne peut pas y répondre à la place de la personne. Voir `electron/scripts-autorises.cjs`.
   */
  async function autorisationDuScript(event, langage, code) {
    if (scriptAutorise(code)) return true;
    const q = questionPourScript(langage, code, !app.getLocale().toLowerCase().startsWith("fr"));
    const fenetre = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const options = {
      type: "warning", title: q.titre, message: q.message, detail: q.detail,
      buttons: q.boutons, defaultId: 1, cancelId: 1, noLink: true,
    };
    const { response } = fenetre ? await dialog.showMessageBox(fenetre, options) : await dialog.showMessageBox(options);
    if (response !== 0) return false;
    autoriserScript(code);
    return true;
  }

  /** Le refus, dit comme un résultat et non comme une panne. */
  const SCRIPT_REFUSE = {
    ok: false, refuse: true,
    erreur: "Exécution refusée : ce script n'a pas été autorisé. Il sera montré à nouveau au prochain lancement.",
  };

  // Lance un exécutable pour lire sa version. SANS SHELL : `execFile` reçoit un
  // fichier et un tableau d'arguments, donc aucune citation à gérer et aucune
  // injection possible. `execSync` interpolait un chemin nu dans une commande
  // shell, ce qui cassait sur « C:\Program Files\… ».
  const lireVersion = (ms) => (fichier, args) => new Promise((resolve, reject) => {
    // `execFile` ET NON `execFileSync` : la version synchrone gelait le processus principal le temps
    // du delai — jusqu'a cinq secondes sans fenetre, sans menu et sans IPC, a chaque fois que
    // l'interface demandait la version de Python ou de Julia.
    //
    // TRAVAIL NON INSCRIT : ce n'est pas un travail mais une sonde, bornée par son propre délai et
    // jamais demandée par un nœud. L'inscrire mettrait « Arrêter » en face d'une lecture de version.
    execFile(fichier, args, { timeout: ms }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

  // ─── Détection de l'exécuteur Python (centralisée) ───
  // Cherche dans l'ordre : paramètre utilisateur (localStorage), variable d'env ATTIC_PYTHON,
  // chemins connus Windows, puis python/python3/py dans le PATH.
  let CHEMIN_PYTHON = null;

  function chercherPythonEnregistre() {
    try {
      const dataPath = path.join(app.getPath("userData"), "python-path.txt");
      if (fs.existsSync(dataPath)) {
        const p = fs.readFileSync(dataPath, "utf-8").trim();
        if (p && fs.existsSync(p)) return p;
      }
    } catch {}
    return null;
  }

  function detecterPython() {
    // 1. Chemin sauvegardé par l'utilisateur
    const sauvegarde = chercherPythonEnregistre();
    if (sauvegarde) { CHEMIN_PYTHON = sauvegarde; return; }

    // 2. Variable d'environnement
    if (process.env.ATTIC_PYTHON && fs.existsSync(process.env.ATTIC_PYTHON)) {
      CHEMIN_PYTHON = process.env.ATTIC_PYTHON;
      return;
    }

    // 3. Chemins connus Windows
    const cheminsConnus = process.platform === "win32" ? [
      "C:\\Python314\\python.exe", "C:\\Python313\\python.exe", "C:\\Python312\\python.exe",
      "C:\\Python311\\python.exe", "C:\\Python310\\python.exe", "C:\\Python39\\python.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python314", "python.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313", "python.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "python.exe"),
    ] : [];

    for (const c of cheminsConnus) {
      if (c && fs.existsSync(c)) { CHEMIN_PYTHON = c; return; }
    }

    // 4. PATH
    const candidats = process.platform === "win32"
      ? ["python", "python3", "py", "py -3"]
      : ["python3", "python"];
    for (const c of candidats) {
      try {
        // blocage accepté : sonde de demarrage, avant la fenetre : le retard se paie au lancement, jamais en cours de travail.
        execSync(`${c} --version`, { stdio: "pipe", timeout: 3000 });
        if (c.includes(" ")) {
          CHEMIN_PYTHON = c;
        } else {
          try {
            // blocage accepté : sonde de demarrage, avant la fenetre : le retard se paie au lancement, jamais en cours de travail.
            CHEMIN_PYTHON = execSync(`${c} -c "import sys; print(sys.executable)"`, { stdio: "pipe", timeout: 3000 }).toString().trim();
          } catch {
            CHEMIN_PYTHON = c;
          }
        }
        return;
      } catch {}
    }
  }
  detecterPython();

  // ─── Détection de l'exécuteur Julia (centralisée) ───
  let CHEMIN_JULIA = null;

  function chercherJuliaEnregistre() {
    try {
      const dataPath = path.join(app.getPath("userData"), "julia-path.txt");
      if (fs.existsSync(dataPath)) {
        const p = fs.readFileSync(dataPath, "utf-8").trim();
        if (p && fs.existsSync(p)) return p;
      }
    } catch {}
    return null;
  }

  function detecterJulia() {
    const sauvegarde = chercherJuliaEnregistre();
    if (sauvegarde) { CHEMIN_JULIA = sauvegarde; return; }

    if (process.env.ATTIC_JULIA && fs.existsSync(process.env.ATTIC_JULIA)) {
      CHEMIN_JULIA = process.env.ATTIC_JULIA;
      return;
    }

    // Chemins connus Windows
    const cheminsConnus = process.platform === "win32" ? [
      "C:\\Julia\\bin\\julia.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Julia", "bin", "julia.exe"),
      path.join(process.env.APPDATA || "", "Julia", "bin", "julia.exe"),
    ] : [];

    for (const c of cheminsConnus) {
      if (c && fs.existsSync(c)) { CHEMIN_JULIA = c; return; }
    }

    // PATH
    try {
      // blocage accepté : sonde de demarrage, avant la fenetre : le retard se paie au lancement, jamais en cours de travail.
      execSync("julia --version", { stdio: "pipe", timeout: 3000 });
      CHEMIN_JULIA = "julia";
    } catch {}
  }
  detecterJulia();

  // --- IPC : Informations sur l'exécuteur Python ---
  ipcMain.handle("python:info", async () => infoExecutable(CHEMIN_PYTHON, lireVersion(3000)));

  // --- IPC : Définir le chemin de l'exécuteur Python ---
  ipcMain.handle("python:definir-chemin", async (_event, chemin) => {
    try {
      if (!chemin || !fs.existsSync(chemin)) return { ok: false, erreur: "Fichier introuvable" };
      // Vérifier que c'est bien Python — une seule fois, sans shell. L'ancienne
      // version lançait le binaire DEUX fois (contrôle, puis lecture de version)
      // et citait le chemin à la main, là où `python:info` juste au-dessus ne le
      // citait pas : d'où un chemin accepté ici et cassé là.
      const info = await infoExecutable(chemin, lireVersion(3000));
      if (!info.disponible) return { ok: false, erreur: info.erreur ?? "Exécutable inutilisable" };
      CHEMIN_PYTHON = chemin;
      const dataPath = path.join(app.getPath("userData"), "python-path.txt");
      // fichier entier accepté : un chemin d'exécutable ; Python reste tel quel, décidé le 2026-11-07.
      fs.writeFileSync(dataPath, chemin, "utf-8");
      return { ok: true, chemin, version: info.version };
    } catch (err) {
      return { ok: false, erreur: String(err?.message || err) };
    }
  });

  // --- IPC : Choisir l'exécutable Python via dialogue ---
  ipcMain.handle("python:choisir-executable", async (event) => {
    const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
      title: "Sélectionner l'exécutable Python",
      filters: process.platform === "win32"
        ? [{ name: "Python", extensions: ["exe"] }, { name: "Tous", extensions: ["*"] }]
        : [{ name: "Tous", extensions: ["*"] }],
      properties: ["openFile"],
    });
    if (resultat.canceled || resultat.filePaths.length === 0) return null;
    return resultat.filePaths[0];
  });

  // ─── Un script écrit dans l'éditeur du nœud s'inscrit sans question ───
  //
  // SEUL L'ÉDITEUR DE CODE L'EMPRUNTE (`vues-domaine/vues-code.tsx`), avec le script livré par défaut :
  // on ne demande pas à quelqu'un s'il accepte ce qu'il vient de taper. Un script arrivé dans un
  // fichier n'y passe jamais. Le rendu ne transmet qu'un texte ; l'empreinte est calculée ici.
  ipcMain.handle("scripts:ecrit-ici", (_event, code) => {
    if (typeof code !== "string") return { ok: false };
    return { ok: true, empreinte: autoriserScript(code) };
  });

  // --- IPC : Exécuter un script Python ---
  // options: { code: string, inputs: { path: string, key: string }[], outputPath: string, timeout: number }
  ipcMain.handle("python:executer", async (event, options) => {
    if (!CHEMIN_PYTHON) {
      return { ok: false, erreur: "Python n'est pas installé ou introuvable. Définissez la variable d'environnement ATTIC_PYTHON ou installez Python." };
    }
    if (!(await autorisationDuScript(event, "python", options?.code))) return SCRIPT_REFUSE;
    try {
      // Écrire le script dans un fichier temporaire
      const scriptPath = path.join(app.getPath("temp"), `attic-script-${Date.now()}.py`);
      // fichier entier accepté : le script tapé dans le nœud ; Python reste tel quel, décidé le 2026-11-07.
      fs.writeFileSync(scriptPath, options.code, "utf-8");

      // Arguments : chemin du script + variables d'env
      const args = [scriptPath];
      const env = {
        ...process.env,
        ...options.env,
      };
      // Passer les chemins d'entrée comme arguments (garde défensif : un path
      // null/non-string ferait planter execFile avec ERR_INVALID_ARG_TYPE).
      if (options.inputs) {
        for (const inp of options.inputs) {
          if (inp.path && typeof inp.path === "string") args.push(inp.path);
        }
      }

      const result = await new Promise((resolve) => {
        let retirer = () => {};
        const enfant = execFile(CHEMIN_PYTHON, args, {
          env,
          timeout: options.timeout || 30000,
          maxBuffer: 10 * 1024 * 1024,
        }, (err, stdout, stderr) => {
          retirer();
          // Nettoyer le script temporaire
          try { fs.unlinkSync(scriptPath); } catch {}
          if (err) {
            resolve({ ok: false, erreur: stderr || err.message, stdout, python: CHEMIN_PYTHON });
          } else {
            resolve({ ok: true, stdout, stderr });
          }
        });
        // INSCRIT AU REGISTRE : un script de trente secondes doit pouvoir être arrêté. Voir
        // `electron/travaux.cjs`.
        retirer = inscrireTravail(enfant);
      });
      return result;
    } catch (err) {
      return { ok: false, erreur: String(err?.message || err) };
    }
  });

  // ─── IPC Julia ───
  ipcMain.handle("julia:info", async () => infoExecutable(CHEMIN_JULIA, lireVersion(5000)));

  ipcMain.handle("julia:definir-chemin", async (_event, chemin) => {
    try {
      if (!chemin || !fs.existsSync(chemin)) return { ok: false, erreur: "Fichier introuvable" };
      // Même traitement que Python : un seul lancement, sans shell.
      const info = await infoExecutable(chemin, lireVersion(5000));
      if (!info.disponible) return { ok: false, erreur: info.erreur ?? "Exécutable inutilisable" };
      CHEMIN_JULIA = chemin;
      const dataPath = path.join(app.getPath("userData"), "julia-path.txt");
      // fichier entier accepté : un chemin d'exécutable ; Julia reste tel quel, décidé le 2026-11-07.
      fs.writeFileSync(dataPath, chemin, "utf-8");
      return { ok: true, chemin, version: info.version };
    } catch (err) {
      return { ok: false, erreur: String(err?.message || err) };
    }
  });

  ipcMain.handle("julia:choisir-executable", async (event) => {
    const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
      title: "Sélectionner l'exécutable Julia",
      filters: [{ name: "Julia", extensions: ["exe"] }],
      properties: ["openFile"],
    });
    if (resultat.canceled || !resultat.filePaths.length) return null;
    return resultat.filePaths[0];
  });

  ipcMain.handle("julia:executer", async (event, options) => {
    if (!CHEMIN_JULIA) {
      return { ok: false, erreur: "Julia n'est pas installé ou introuvable. Définissez la variable d'environnement ATTIC_JULIA ou installez Julia." };
    }
    if (!(await autorisationDuScript(event, "julia", options?.code))) return SCRIPT_REFUSE;
    try {
      const scriptPath = path.join(app.getPath("temp"), `attic-script-${Date.now()}.jl`);
      // fichier entier accepté : le script tapé dans le nœud ; Julia reste tel quel, décidé le 2026-11-07.
      fs.writeFileSync(scriptPath, options.code, "utf-8");

      const args = [scriptPath];
      const env = {
        ...process.env,
        ...options.env,
      };
      // Garde défensif identique à python:executer (path null interdit pour execFile).
      if (options.inputs) {
        for (const inp of options.inputs) {
          if (inp.path && typeof inp.path === "string") args.push(inp.path);
        }
      }

      const result = await new Promise((resolve) => {
        let retirer = () => {};
        const enfant = execFile(CHEMIN_JULIA, args, {
          env,
          timeout: options.timeout || 30000,
          maxBuffer: 10 * 1024 * 1024,
        }, (err, stdout, stderr) => {
          retirer();
          try { fs.unlinkSync(scriptPath); } catch {}
          if (err) {
            resolve({ ok: false, erreur: stderr || err.message, stdout, python: CHEMIN_JULIA });
          } else {
            resolve({ ok: true, stdout, stderr });
          }
        });
        // MÊME INSCRIPTION QUE POUR PYTHON : les deux interprètes sont les deux seuls travaux que le
        // rendu peut lancer avec du code à lui. Voir `electron/travaux.cjs`.
        retirer = inscrireTravail(enfant);
      });
      return result;
    } catch (err) {
      return { ok: false, erreur: String(err?.message || err) };
    }
  });
}

module.exports = { installerIpcScripts };
