const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, desktopCapturer } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const { execSync, execFile } = require("child_process");
const { URL: UrlModele } = require("url");
const { separerDemucs } = require("./demucs.cjs");
const { generate: genererStableAudio3 } = require("./stable-audio-3.cjs");
const { genererSongsee } = require("./songsee.cjs");

const DEV = process.env.NODE_ENV === "development" || process.argv.includes("--dev");
console.log(`[attic] main.cjs loaded from ${__dirname} — DEV=${DEV}`);

// ─── Auto-updater (electron-updater) ───
// En mode dev, autoUpdater ne fonctionne pas (pas d'app packagée).
// On l'importe conditionnellement pour éviter les erreurs.
let autoUpdater = null;
if (!DEV) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
  } catch {}
}

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
      execSync(`${c} --version`, { stdio: "pipe", timeout: 3000 });
      if (c.includes(" ")) {
        CHEMIN_PYTHON = c;
      } else {
        try {
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
    execSync("julia --version", { stdio: "pipe", timeout: 3000 });
    CHEMIN_JULIA = "julia";
  } catch {}
}
detecterJulia();

// Supprimer le warning de sécurité Electron en mode dev (unsafe-eval est intentionnel)
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// Content-Security-Policy : unsafe-eval requis pour le chargement dynamique
// de nodes installés (new Function). unsafe-inline pour les vues canvas/inline.
const CSP = [
  "default-src 'self' display-capture",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "media-src 'self' blob: data: stream:",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://huggingface.co https://cdn.jsdelivr.net https://*.hf.co https://*.xet-bridge-us.hf.co https://tfhub.dev https://*.tfhub.dev https://storage.googleapis.com https://*.kaggle.com https://*.googleusercontent.com http://127.0.0.1:11434 http://localhost:11434 blob: data:",
].join("; ");

// GESTIONNAIRE DE PERMISSIONS UNIQUE — liste d'autorisation explicite.
// Ne pas en installer un second ailleurs : setPermissionRequestHandler
// REMPLACE le précédent (le dernier gagne), et webContents.session EST la
// session par défaut. Une première tentative en deux handlers laissait
// celui-ci écraser un accord de « persistent-storage » posé plus haut —
// neutralisant la protection anti-éviction du cache de modèles IA.
const PERMISSIONS_ACCORDEES = new Set([
  "media", "display-capture", "audioCapture",     // micro + capture système
  "persistent-storage",                           // cache modèles HuggingFace (main.tsx)
  "clipboard-read", "clipboard-sanitized-write",  // bouton copier (ui/copier.ts)
]);

let fenetre = null;

async function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  // Les liens externes (favoris « Banque de son », `<a target="_blank">`) doivent
  // s'ouvrir dans le NAVIGATEUR du système, pas dans une fenêtre Electron : sinon
  // les téléchargements atterrissent dans une fenêtre sans gestionnaire de
  // téléchargement au lieu du dossier Téléchargements de Windows. En dev, l'app
  // tourne déjà dans un vrai navigateur, d'où le « ça marche en dev seulement ».
  //
  // Mitigation GHSA-f3pv-wv63-48x8 (CVE-2026-34765) : ce handler ne crée jamais
  // de fenêtre enfant et n'accorde jamais de webPreferences élevées. Tous les
  // window.open() sont refusés ({ action: "deny" }). De plus nodeIntegration est
  // désactivé et contextIsolation est activé. L'application n'est donc pas
  // affectée par l'alerte même si la version d'Electron est vulnérable.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV) {
    // En dev, forcer un rechargement sans cache du renderer pour éviter qu'un
    // ancien build Vite ne soit réutilisé par la session Electron (HTTP cache,
    // V8 code cache, CacheStorage, localStorage, etc. entre deux redémarrages).
    const sess = fenetre.webContents.session;
    await sess.clearCache();
    await sess.clearCodeCaches({ urls: [] });
    await sess.clearStorageData();
    console.log("[attic] dev cache cleared (HTTP + V8 + storage)");
    fenetre.loadURL("http://localhost:5175");
    // fenetre.webContents.openDevTools({ mode: "detach" });
  } else {
    const cheminDist = path.join(__dirname, "..", "dist", "index.html");
    if (!fs.existsSync(cheminDist)) {
      fenetre.loadURL("data:text/html;charset=utf-8,<h2>Build introuvable</h2><p>Lancez <code>npm run build</code> d'abord.</p>");
      return;
    }
    fenetre.loadFile(cheminDist);
  }
}

// --- IPC : sources desktopCapturer pour capture système audio ---
ipcMain.handle("capture:systeme-audio", async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    if (!sources) return [];
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (e) {
    console.error("[attic] capture:systeme-audio erreur:", e);
    return [];
  }
});

// --- IPC : enregistrer un fichier (dialogue + écriture) ---
ipcMain.handle("fichier:sauvegarder", async (_event, options) => {
  const { defaultPath, filters, data } = options;
  const resultat = await dialog.showSaveDialog(fenetre, {
    defaultPath: defaultPath || undefined,
    filters: filters || [{ name: "Tous", extensions: ["*"] }],
  });
  if (resultat.canceled || !resultat.filePath) return null;
  fs.writeFileSync(resultat.filePath, data, "utf-8");
  return resultat.filePath;
});

// --- IPC : ouvrir un fichier binaire (dialogue + lecture brute) ---
ipcMain.handle("fichier:ouvrir-binaire", async (_event, options) => {
  const { defaultPath, filters } = options;
  const resultat = await dialog.showOpenDialog(fenetre, {
    defaultPath: defaultPath || undefined,
    filters: filters || [{ name: "Tous", extensions: ["*"] }],
    properties: ["openFile"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  const chemin = resultat.filePaths[0];
  const contenu = fs.readFileSync(chemin);
  return { donnees: contenu, nom: path.basename(chemin), chemin };
});

// --- IPC : ouvrir un fichier (dialogue + lecture) ---
ipcMain.handle("fichier:ouvrir", async (_event, options) => {
  const { defaultPath, filters } = options;
  const resultat = await dialog.showOpenDialog(fenetre, {
    defaultPath: defaultPath || undefined,
    filters: filters || [{ name: "Tous", extensions: ["*"] }],
    properties: ["openFile"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  const chemin = resultat.filePaths[0];
  const contenu = fs.readFileSync(chemin, "utf-8");
  return { chemin, contenu, nom: path.basename(chemin) };
});

// --- IPC : sauvegarder un fichier binaire (audio WAV) ---
ipcMain.handle("fichier:sauvegarder-binaire", async (_event, options) => {
  const { defaultPath, filters, buffer } = options;
  const resultat = await dialog.showSaveDialog(fenetre, {
    defaultPath: defaultPath || undefined,
    filters: filters || [{ name: "Tous", extensions: ["*"] }],
  });
  if (resultat.canceled || !resultat.filePath) return null;
  const buf = Buffer.from(buffer);
  fs.writeFileSync(resultat.filePath, buf);
  return resultat.filePath;
});

// --- IPC : choisir un dossier ---
ipcMain.handle("dossier:choisir", async () => {
  const resultat = await dialog.showOpenDialog(fenetre, {
    properties: ["openDirectory"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  return resultat.filePaths[0];
});

// --- IPC : lister les fichiers audio d'un dossier ---
ipcMain.handle("dossier:lire", async (_event, cheminDossier) => {
  try {
    // En production, résoudre les chemins relatifs vers resourcesPath
    let chemin = cheminDossier;
    if (!path.isAbsolute(chemin)) {
      const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
      chemin = path.join(base, chemin);
    }
    const fichiers = fs.readdirSync(chemin);
    const audios = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".mid", ".midi"];
    const resultats = [];
    for (const f of fichiers) {
      const ext = path.extname(f).toLowerCase();
      if (audios.includes(ext)) {
        resultats.push({ nom: f, chemin: path.join(chemin, f) });
      }
    }
    resultats.sort((a, b) => a.nom.localeCompare(b.nom));
    return resultats;
  } catch {
    return null;
  }
});

// --- IPC : lire un fichier audio et retourner son buffer ---
ipcMain.handle("fichier:lire-audio", async (_event, cheminFichier) => {
  try {
    let chemin = cheminFichier;
    if (!path.isAbsolute(chemin)) {
      const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
      chemin = path.join(base, chemin);
    }
    const buf = fs.readFileSync(chemin);
    const ext = path.extname(cheminFichier).toLowerCase();
    const mime = ext === ".mp3" ? "audio/mpeg" : ext === ".ogg" ? "audio/ogg" : "audio/wav";
    return { url: `data:${mime};base64,${buf.toString("base64")}`, donnees: buf, nom: path.basename(cheminFichier) };
  } catch {
    return null;
  }
});

// --- IPC : écrire un fichier binaire à un chemin donné (sans dialogue) ---
ipcMain.handle("fichier:ecrire", async (_event, { chemin, buffer }) => {
  try {
    const dir = path.dirname(chemin);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = typeof buffer === "string" ? Buffer.from(buffer, "utf-8") : Buffer.from(buffer);
    fs.writeFileSync(chemin, data);
    console.log(`[attic] fichier:ecrire OK: ${chemin} (${data.length} octets)`);
    return chemin;
  } catch (err) {
    console.error(`[attic] fichier:ecrire ECHEC: ${chemin} — ${err?.message || err}`);
    return null;
  }
});

// --- IPC : copier un fichier binaire d'un chemin à un autre ---
ipcMain.handle("fichier:copier", async (_event, { source, cible }) => {
  try {
    const dir = path.dirname(cible);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(source, cible);
    return cible;
  } catch {
    return null;
  }
});

// --- IPC : ouvrir un chemin dans l'application par défaut (navigateur pour .html) ---
ipcMain.handle("fichier:ouvrir-chemin", async (_event, chemin) => {
  try {
    const resultat = await shell.openPath(chemin);
    return { ok: resultat === "", erreur: resultat || undefined };
  } catch (err) {
    return { ok: false, erreur: err?.message || String(err) };
  }
});

// --- IPC : extraire l'image (pochette) d'un fichier MP3 (tag ID3 APIC) ---
ipcMain.handle("mp3:extraire-pochette", async (_event, cheminFichier) => {
  try {
    const buf = fs.readFileSync(cheminFichier);
    if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
      const versionMinor = buf[3]; // 3 = ID3v2.3, 4 = ID3v2.4
      const headerSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
      let offset = 10;
      const end = 10 + headerSize;
      while (offset + 10 < end) {
        const frameId = buf.toString("ascii", offset, offset + 4);
        if (frameId.charCodeAt(0) === 0) break; // padding
        let frameSize;
        if (versionMinor === 4) {
          // ID3v2.4: synchint
          frameSize = ((buf[offset + 4] & 0x7f) << 21) | ((buf[offset + 5] & 0x7f) << 14) | ((buf[offset + 6] & 0x7f) << 7) | (buf[offset + 7] & 0x7f);
        } else {
          // ID3v2.3: taille sur 4 octets, big-endian (pas synchint)
          frameSize = buf.readUInt32BE(offset + 4);
        }
        if (frameSize <= 0 || offset + 10 + frameSize > buf.length) break;

        if (frameId === "APIC") {
          let pos = offset + 10;
          const encoding = buf[pos]; pos++;
          // MIME type (null-terminated ASCII)
          let mimeEnd = pos;
          while (mimeEnd < pos + 80 && buf[mimeEnd] !== 0) mimeEnd++;
          const mime = buf.toString("ascii", pos, mimeEnd);
          pos = mimeEnd + 1;
          pos++;
          // Description (null-terminated, encoding-dependent)
          if (encoding === 1 || encoding === 2) {
            // UTF-16: null-terminated with 2 bytes
            while (pos + 1 < buf.length && !(buf[pos] === 0 && buf[pos + 1] === 0)) pos += 2;
            pos += 2;
          } else {
            while (pos < buf.length && buf[pos] !== 0) pos++;
            pos++;
          }
          // Le reste = données de l'image
          const imgStart = pos;
          const imgEnd = offset + 10 + frameSize;
          if (imgEnd > imgStart && imgEnd <= buf.length) {
            const imgData = buf.subarray(imgStart, imgEnd);
            const b64 = imgData.toString("base64");
            return { ok: true, mime: mime || "image/jpeg", data: b64 };
          }
        }
        offset += 10 + frameSize;
      }
    }
    return { ok: false };
  } catch (err) {
    console.error(`[attic] mp3:extraire-pochette ECHEC: ${cheminFichier} — ${err?.message || err}`);
    return { ok: false };
  }
});

// --- IPC : séparation Demucs en natif (onnxruntime-node) ---
// onnxruntime-web (WASM) ne peut pas charger ce modèle de 166 Mo ; on l'exécute
// donc dans le process principal, sans limite mémoire du WASM.
ipcMain.handle("demucs:separer", async (_event, options) => {
  try {
    const { modelePath: cheminExplicite, canaux, utiliserModeleEmbarque, modele6s } = options;
    let modelePath = cheminExplicite;
    if (utiliserModeleEmbarque || !modelePath) {
      const fichier6s = "htdemucs_6s.onnx";
      const fichier4s = "htdemucs_fp16weights.onnx";
      const cible = modele6s ? fichier6s : fichier4s;
      const candidats = [
        path.join(__dirname, "..", "htdemucs", cible),
        path.join(__dirname, "..", "public", "oonx", cible),
        path.join(__dirname, "..", "dist", "oonx", cible),
        path.join(process.resourcesPath || "", "oonx", cible),
      ];
      modelePath = candidats.find((p) => p && fs.existsSync(p)) || modelePath;
    }
    if (!modelePath || !fs.existsSync(modelePath)) {
      return { ok: false, erreur: `Fichier modèle introuvable : ${modelePath}` };
    }
    const nbStems = modele6s ? 6 : 4;
    const chans = canaux.map((c) => (c instanceof Float32Array ? c : Float32Array.from(c)));
    const stems = await separerDemucs(modelePath, chans, undefined, options.chevauchement, nbStems);
    return { ok: true, stems };
  } catch (err) {
    return { ok: false, erreur: String(err && err.message ? err.message : err) };
  }
});

// --- IPC : Stable Audio 3 text-to-audio (process principal, onnxruntime-node) ---
ipcMain.handle("stable-audio-3:generer", async (_event, options) => {
  try {
    const { prompt, seconds, steps, seed, modelPath: cheminExplicite } = options;
    let modelDir = cheminExplicite;
    if (!modelDir) {
      const cible = "stable-audio-3-small-music";
      const candidats = [
        path.join(__dirname, "..", "public", "oonx", cible),
        path.join(__dirname, "..", "dist", "oonx", cible),
        path.join(process.resourcesPath || "", "oonx", cible),
      ];
      modelDir = candidats.find((p) => p && fs.existsSync(p)) || null;
    } else if (!path.isAbsolute(modelDir)) {
      const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
      modelDir = path.join(base, modelDir);
    }
    if (!modelDir || !fs.existsSync(modelDir)) {
      return { ok: false, erreur: `Bundle Stable Audio 3 introuvable : ${modelDir}` };
    }
    const result = await genererStableAudio3({ prompt, seconds, steps, seed, modelDir });
    return { ok: true, ...result };
  } catch (err) {
    console.error("[attic] stable-audio-3:generer erreur:", err);
    return { ok: false, erreur: String(err && err.message ? err.message : err) };
  }
});

// --- IPC : télécharger le contenu d'une URL (via Node.js, sans CORS) ---
function telechargerRedirections(url, profondeur = 0) {
  return new Promise((resolve) => {
    if (profondeur > 5) {
      return resolve({ erreur: "Trop de redirections" });
    }
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "Attic/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const suivante = new UrlModele(res.headers.location, url);
        return resolve(telechargerRedirections(suivante, profondeur + 1));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ donnees: Buffer.concat(chunks), statut: res.statusCode }));
    });
    req.on("error", (err) => resolve({ erreur: err.message }));
  });
}
ipcMain.handle("telecharger:url", async (_event, urlStr) => {
  try {
    const url = new UrlModele(urlStr);
    return await telechargerRedirections(url, 0);
  } catch (err) {
    return { erreur: String(err) };
  }
});

ipcMain.handle("app:quitter", () => app.quit());

// Ouvre la documentation en ligne dans le navigateur par défaut.
const URL_DOC = "https://github.com/FabienCouprie/attic/wiki";
ipcMain.handle("doc:ouvrir", async () => {
  try {
    await shell.openExternal(URL_DOC);
    return { ok: true, url: URL_DOC };
  } catch (err) {
    console.error("[attic] doc:ouvrir erreur :", err);
    return { ok: false, erreur: String(err) };
  }
});

// Retourne le chemin <projet>/Music s'il existe, sinon null.
ipcMain.handle("dossier:music-projet", () => {
  const candidat = path.resolve(__dirname, "..", "..", "Music");
  return fs.existsSync(candidat) ? candidat : null;
});

// Retourne (en le créant au besoin) le dossier de travail par défaut :
// <projet>/work en dev, <dossier de l'exécutable>/work en version packagée.
// C'est le répertoire par défaut des dialogues d'export/import.
ipcMain.handle("dossier:travail-defaut", () => {
  // En packagé, le dossier de l'exécutable est souvent C:\Program Files\… : y
  // créer « work » exige les droits administrateur et échouait silencieusement,
  // laissant les scripts Python/Julia sans nulle part où écrire leurs sorties.
  // On tente donc l'emplacement historique, puis on se rabat sur userData.
  const candidats = app.isPackaged
    ? [path.join(path.dirname(app.getPath("exe")), "work"), path.join(app.getPath("userData"), "work")]
    : [path.join(path.resolve(__dirname, ".."), "work")];
  for (const dossier of candidats) {
    try {
      fs.mkdirSync(dossier, { recursive: true });
      // Sonde d'écriture RÉELLE : accessSync(W_OK) ne consulte pas les ACL sous
      // Windows (il ne reflète que l'attribut lecture-seule, ignoré pour les
      // dossiers) — un work/ pré-existant dans Program Files passait le test
      // alors que toute écriture échouait ensuite.
      const temoin = path.join(dossier, `.attic-sonde-${Date.now()}`);
      fs.writeFileSync(temoin, "");
      fs.unlinkSync(temoin);
      return dossier;
    } catch { /* candidat suivant */ }
  }
  console.error("[attic] Aucun répertoire de travail inscriptible parmi :", candidats);
  return null;
});

ipcMain.handle("nouvelle-fenetre", async () => {
  creerFenetre();
});

// --- IPC : Exporter un node en .zip ---
// Crée un zip contenant manifest.json + executer.js + notice.json + dependencies.json + assets/
ipcMain.handle("node:exporter-zip", async (_event, { manifest, executerCode, notice, dependencies, assetsDir, outputPath }) => {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
    zip.addFile("executer.js", Buffer.from(executerCode, "utf-8"));
    if (notice) zip.addFile("notice.json", Buffer.from(JSON.stringify(notice, null, 2), "utf-8"));
    zip.addFile("dependencies.json", Buffer.from(JSON.stringify({ dependencies: dependencies || [] }, null, 2), "utf-8"));
    // Ajouter les assets s'ils existent
    if (assetsDir && fs.existsSync(assetsDir)) {
      const fichiers = fs.readdirSync(assetsDir);
      for (const f of fichiers) {
        const chemin = path.join(assetsDir, f);
        if (fs.statSync(chemin).isFile()) {
          zip.addLocalFile(chemin, "assets");
        }
      }
    }
    zip.writeZip(outputPath);
    console.log(`[attic] node:exporter-zip OK: ${outputPath}`);
    return { ok: true, path: outputPath };
  } catch (err) {
    console.error(`[attic] node:exporter-zip ECHEC: ${err?.message || err}`);
    return { ok: false, erreur: String(err?.message || err) };
  }
});

// --- IPC : Importer un node depuis un .zip ---
// Décompresse dans ~/.attic/nodes/{id}/ et renvoie le contenu des fichiers
ipcMain.handle("node:importer-zip", async (_event, zipPath) => {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) return { ok: false, erreur: "manifest.json introuvable dans le zip." };
    const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
    if (!manifest.id || !manifest.nom) return { ok: false, erreur: "manifest.json invalide (id/nom manquant)." };

    // Répertoire d'installation
    const nodesDir = path.join(app.getPath("home"), ".attic", "nodes", manifest.id);
    if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });

    // Extraire tous les fichiers
    const entries = zip.getEntries();
    const fichiers = {};
    const resolvedNodesDir = path.resolve(nodesDir);
    for (const entry of entries) {
      const entryName = entry.entryName;
      if (entry.isDirectory) continue;

      // Protection contre le Zip Slip : s'assurer que l'entrée reste dans nodesDir
      const targetPath = path.resolve(nodesDir, entryName);
      const relativePath = path.relative(resolvedNodesDir, targetPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        console.warn(`[attic] node:importer-zip entrée ignorée (zip slip): ${entryName}`);
        continue;
      }

      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const entryData = entry.getData(); // force read
      fs.writeFileSync(resolvedTargetPath, entryData);
      // Lire le contenu des fichiers texte pour le retourner
      if (entryName === "manifest.json" || entryName === "executer.js" || entryName === "notice.json" || entryName === "dependencies.json") {
        fichiers[entryName] = entry.getData().toString("utf-8");
      }
    }

    // Chemin des assets
    const assetsPath = path.join(nodesDir, "assets");
    const hasAssets = fs.existsSync(assetsPath) && fs.readdirSync(assetsPath).length > 0;

    return {
      ok: true,
      manifest,
      executerCode: fichiers["executer.js"] || "",
      notice: fichiers["notice.json"] ? JSON.parse(fichiers["notice.json"]) : null,
      dependencies: fichiers["dependencies.json"] ? JSON.parse(fichiers["dependencies.json"]).dependencies : [],
      assetsDir: hasAssets ? assetsPath : null,
    };
  } catch (err) {
    console.error(`[attic] node:importer-zip ECHEC: ${err?.message || err}`);
    return { ok: false, erreur: String(err?.message || err) };
  }
});

// --- IPC : Obtenir le chemin des assets d'un node installé ---
ipcMain.handle("node:chemin-assets", async (_event, nodeId) => {
  const assetsPath = path.join(app.getPath("home"), ".attic", "nodes", nodeId, "assets");
  return fs.existsSync(assetsPath) ? assetsPath : null;
});

// --- IPC : Supprimer un node installé (assets) ---
ipcMain.handle("node:supprimer", async (_event, nodeId) => {
  try {
    const nodeDir = path.join(app.getPath("home"), ".attic", "nodes", nodeId);
    if (fs.existsSync(nodeDir)) fs.rmSync(nodeDir, { recursive: true });
    return true;
  } catch { return false; }
});

// --- IPC : Sauvegarde du fichier (dialogue) ---
ipcMain.handle("node:sauvegarder-zip", async (_event, { defaultPath }) => {
  const resultat = await dialog.showSaveDialog(fenetre, {
    defaultPath: defaultPath || "node.zip",
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (resultat.canceled || !resultat.filePath) return null;
  return resultat.filePath;
});

// --- IPC : Sélectionner un fichier zip pour import ---
ipcMain.handle("node:selectionner-zip", async () => {
  const resultat = await dialog.showOpenDialog(fenetre, {
    title: "Sélectionner un node .zip",
    filters: [{ name: "ZIP", extensions: ["zip"] }],
    properties: ["openFile"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  return resultat.filePaths[0];
});

// --- IPC : Informations sur l'exécuteur Python ---
ipcMain.handle("python:info", async () => {
  return {
    disponible: !!CHEMIN_PYTHON,
    chemin: CHEMIN_PYTHON,
    version: CHEMIN_PYTHON ? execSync(`${CHEMIN_PYTHON} --version`, { stdio: "pipe", timeout: 3000 }).toString().trim() : null,
  };
});

// --- IPC : Définir le chemin de l'exécuteur Python ---
ipcMain.handle("python:definir-chemin", async (_event, chemin) => {
  try {
    if (!chemin || !fs.existsSync(chemin)) return { ok: false, erreur: "Fichier introuvable" };
    // Vérifier que c'est bien Python
    execSync(`"${chemin}" --version`, { stdio: "pipe", timeout: 3000 });
    CHEMIN_PYTHON = chemin;
    // Sauvegarder
    const dataPath = path.join(app.getPath("userData"), "python-path.txt");
    fs.writeFileSync(dataPath, chemin, "utf-8");
    return { ok: true, chemin, version: execSync(`"${chemin}" --version`, { stdio: "pipe", timeout: 3000 }).toString().trim() };
  } catch (err) {
    return { ok: false, erreur: String(err?.message || err) };
  }
});

// --- IPC : Choisir l'exécutable Python via dialogue ---
ipcMain.handle("python:choisir-executable", async () => {
  const resultat = await dialog.showOpenDialog(fenetre, {
    title: "Sélectionner l'exécutable Python",
    filters: process.platform === "win32"
      ? [{ name: "Python", extensions: ["exe"] }, { name: "Tous", extensions: ["*"] }]
      : [{ name: "Tous", extensions: ["*"] }],
    properties: ["openFile"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  return resultat.filePaths[0];
});

// --- IPC : Exécuter un script Python ---
// options: { code: string, inputs: { path: string, key: string }[], outputPath: string, timeout: number }
ipcMain.handle("python:executer", async (_event, options) => {
  if (!CHEMIN_PYTHON) {
    return { ok: false, erreur: "Python n'est pas installé ou introuvable. Définissez la variable d'environnement ATTIC_PYTHON ou installez Python." };
  }
  try {
    // Écrire le script dans un fichier temporaire
    const scriptPath = path.join(app.getPath("temp"), `attic-script-${Date.now()}.py`);
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
      execFile(CHEMIN_PYTHON, args, {
        env,
        timeout: options.timeout || 30000,
        maxBuffer: 10 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        // Nettoyer le script temporaire
        try { fs.unlinkSync(scriptPath); } catch {}
        if (err) {
          resolve({ ok: false, erreur: stderr || err.message, stdout, python: CHEMIN_PYTHON });
        } else {
          resolve({ ok: true, stdout, stderr });
        }
      });
    });
    return result;
  } catch (err) {
    return { ok: false, erreur: String(err?.message || err) };
  }
});

// ─── IPC Julia ───
ipcMain.handle("julia:info", async () => {
  return {
    disponible: !!CHEMIN_JULIA,
    chemin: CHEMIN_JULIA,
    version: CHEMIN_JULIA ? execSync(`${CHEMIN_JULIA} --version`, { stdio: "pipe", timeout: 5000 }).toString().trim() : null,
  };
});

ipcMain.handle("julia:definir-chemin", async (_event, chemin) => {
  try {
    if (!chemin || !fs.existsSync(chemin)) return { ok: false, erreur: "Fichier introuvable" };
    execSync(`"${chemin}" --version`, { stdio: "pipe", timeout: 5000 });
    CHEMIN_JULIA = chemin;
    const dataPath = path.join(app.getPath("userData"), "julia-path.txt");
    fs.writeFileSync(dataPath, chemin, "utf-8");
    return { ok: true, chemin, version: execSync(`"${chemin}" --version`, { stdio: "pipe", timeout: 5000 }).toString().trim() };
  } catch (err) {
    return { ok: false, erreur: String(err?.message || err) };
  }
});

ipcMain.handle("julia:choisir-executable", async () => {
  const resultat = await dialog.showOpenDialog(fenetre, {
    title: "Sélectionner l'exécutable Julia",
    filters: [{ name: "Julia", extensions: ["exe"] }],
    properties: ["openFile"],
  });
  if (resultat.canceled || !resultat.filePaths.length) return null;
  return resultat.filePaths[0];
});

ipcMain.handle("julia:executer", async (_event, options) => {
  if (!CHEMIN_JULIA) {
    return { ok: false, erreur: "Julia n'est pas installé ou introuvable. Définissez la variable d'environnement ATTIC_JULIA ou installez Julia." };
  }
  try {
    const scriptPath = path.join(app.getPath("temp"), `attic-script-${Date.now()}.jl`);
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
      execFile(CHEMIN_JULIA, args, {
        env,
        timeout: options.timeout || 30000,
        maxBuffer: 10 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        try { fs.unlinkSync(scriptPath); } catch {}
        if (err) {
          resolve({ ok: false, erreur: stderr || err.message, stdout, python: CHEMIN_JULIA });
        } else {
          resolve({ ok: true, stdout, stderr });
        }
      });
    });
    return result;
  } catch (err) {
    return { ok: false, erreur: String(err?.message || err) };
  }
});

// --- IPC : Ollama (LLM local) ---
// Proxy vers le serveur Ollama local (port 11434) depuis le main process : évite
// la CSP et le CORS du renderer. fetch global (Node 18+ via Electron).
const OLLAMA_BASE = process.env.ATTIC_OLLAMA_URL || "http://127.0.0.1:11434";
function erreurOllama(e) {
  const s = String(e?.cause?.code || e?.message || e);
  if (e?.name === "AbortError") return "Délai dépassé — le premier appel doit charger le modèle en mémoire (plusieurs minutes pour un gros modèle). Augmentez « Délai max » sur le nœud.";
  if (/ECONNREFUSED|ENOTFOUND|fetch failed/i.test(s)) return "Serveur Ollama injoignable sur :11434 (lancez « ollama serve »).";
  return s;
}
ipcMain.handle("ollama:generer", async (_event, options) => {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options?.timeout || 120000);
    // Use /api/chat endpoint (more reliable for newer models like qwen3)
    const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options?.model || "llama3.2",
        messages: [{ role: "user", content: options?.prompt || "" }],
        stream: false,
        think: false,
        options: options?.options || {},
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      let detail = "";
      try { const b = await r.json(); if (b && b.error) detail = ` — ${b.error}`; } catch {}
      return { erreur: `Ollama HTTP ${r.status}${detail}` };
    }
    const data = await r.json();
    console.log("[attic] Ollama response:", JSON.stringify(data).slice(0, 500));
    // Qwen3 and similar models put reasoning in message.thinking and answer in message.content
    // If content is empty, use thinking as fallback
    const content = (data && data.message && data.message.content) || "";
    const thinking = (data && data.message && data.message.thinking) || "";
    let reponse = content;
    const thinkEnd = content.indexOf("</think>");
    
    if (options && options.thinking) {
      // Node thinking : retourner le raisonnement
      if (thinkEnd !== -1) {
        reponse = content.slice(0, thinkEnd).replace(/<\/?think>/g, "").trim();
      } else if (thinking && thinking.trim()) {
        reponse = thinking.trim();
      } else {
        // Pas de tag : tout est du thinking
        reponse = content.replace(/<\/?think>/g, "").trim();
      }
    } else {
      // Node normal : retourner la reponse (apres  si present
      if (thinkEnd !== -1) {
        reponse = content.slice(thinkEnd + 8).trim();
      } else {
        reponse = content.replace(/<\/?think>/g, "").trim();
      }
    }
    
    if (!reponse) reponse = content.trim() || (data && data.response) || "";
    return { reponse };
  } catch (e) {
    return { erreur: erreurOllama(e) };
  }
});
ipcMain.handle("ollama:modeles", async () => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!r.ok) return { erreur: `Ollama HTTP ${r.status}` };
    const data = await r.json();
    return { modeles: (data.models || []).map((m) => m.name) };
  } catch (e) {
    return { erreur: erreurOllama(e) };
  }
});

// --- IPC : Lire un fichier binaire par chemin (sans dialogue) ---
ipcMain.handle("fichier:lire-binaire", async (_event, cheminRelatif) => {
  try {
    let chemin = cheminRelatif;
    if (!path.isAbsolute(chemin)) {
      const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
      chemin = path.join(base, chemin);
      // En dev, le dossier public/ est servi par Vite mais n'est pas à la racine :
      // on essaie donc aussi public/<chemin> si le fichier n'est pas à la racine.
      if (!app.isPackaged && !fs.existsSync(chemin)) {
        const cheminPublic = path.join(base, "public", cheminRelatif);
        if (fs.existsSync(cheminPublic)) chemin = cheminPublic;
      }
    }
    if (!fs.existsSync(chemin)) return null;
    const buf = fs.readFileSync(chemin);
    return { donnees: buf, nom: path.basename(chemin) };
  } catch {
    return null;
  }
});

// --- IPC : Lire un fichier texte par chemin ---
ipcMain.handle("fichier:lire-texte", async (_event, cheminRelatif) => {
  try {
    let chemin = cheminRelatif;
    if (!path.isAbsolute(chemin)) {
      const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
      chemin = path.join(base, chemin);
    }
    if (!fs.existsSync(chemin)) return null;
    return fs.readFileSync(chemin, "utf-8");
  } catch {
    return null;
  }
});

// --- IPC : Supprimer un fichier ---
ipcMain.handle("fichier:supprimer", async (_event, chemin) => {
  try {
    if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
    return true;
  } catch {
    return false;
  }
});

// --- IPC : Générer une visualisation Songsee depuis un fichier audio ---
ipcMain.handle("songsee:generer", async (_event, { cheminEntree, options }) => {
  try {
    const result = await genererSongsee(cheminEntree, options);
    return { ok: true, ...result };
  } catch (err) {
    console.error("[attic] songsee:generer a échoué :", err);
    return { ok: false, erreur: err?.message || String(err) };
  }
});

// ─── Auto-updater : configuration + IPC ───
let infoMaj = { disponible: false, version: "", notes: "", progression: 0, statut: "" };

if (autoUpdater) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    infoMaj.statut = "verification";
    envoyerInfoMaj();
  });
  autoUpdater.on("update-available", (info) => {
    infoMaj = { disponible: true, version: info.version, notes: info.releaseNotes || "", progression: 0, statut: "disponible" };
    envoyerInfoMaj();
  });
  autoUpdater.on("update-not-available", () => {
    infoMaj.statut = "a-jour";
    envoyerInfoMaj();
  });
  autoUpdater.on("download-progress", (progress) => {
    infoMaj.progression = Math.round(progress.percent);
    infoMaj.statut = "telechargement";
    envoyerInfoMaj();
  });
  autoUpdater.on("update-downloaded", (info) => {
    infoMaj.statut = "pret";
    infoMaj.version = info.version;
    // Sauvegarder les métas et l'en-cours avant l'installation
    try {
      // Le renderer ne peut pas écrire directement dans userData,
      // mais on peut sauvegarder le localStorage via le main process
      // en demandant au renderer de nous l'envoyer
      fenetre?.webContents.send("maj:backup-demande");
    } catch {}
    envoyerInfoMaj();
  });
  autoUpdater.on("error", (err) => {
    const msg = String(err?.message || err);
    console.error("[attic] Auto-updater error:", err);
    infoMaj.statut = "erreur";
    infoMaj.notes = msg;
    envoyerInfoMaj();
  });
}

function envoyerInfoMaj() {
  if (fenetre && !fenetre.isDestroyed()) {
    fenetre.webContents.send("maj:info", infoMaj);
  }
}

ipcMain.handle("maj:verifier", async () => {
  if (!autoUpdater) return { disponible: false, statut: "indisponible" };
  try {
    infoMaj = { disponible: false, version: "", notes: "", progression: 0, statut: "verification" };
    envoyerInfoMaj();
    const result = await autoUpdater.checkForUpdates();
    // checkForUpdates retourne UpdateCheckResult si update disponible
    if (result && result.updateInfo) {
      infoMaj = { disponible: true, version: result.updateInfo.version, notes: "", progression: 0, statut: "disponible" };
      envoyerInfoMaj();
      return infoMaj;
    }
    infoMaj.statut = "a-jour";
    envoyerInfoMaj();
    return infoMaj;
  } catch (e) {
    infoMaj.statut = "erreur";
    infoMaj.notes = String(e?.message || e);
    envoyerInfoMaj();
    return { disponible: false, statut: "erreur", notes: String(e?.message || e) };
  }
});

ipcMain.handle("maj:info", async () => infoMaj);

ipcMain.handle("maj:installer-relancer", async () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle("maj:telecharger", async () => {
  if (autoUpdater) {
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      console.error("[attic] Téléchargement erreur:", e);
    }
  }
});

// Sauvegarde des données avant mise à jour
ipcMain.handle("maj:sauvegarder-backup", async (_event, data) => {
  try {
    const dataPath = path.join(app.getPath("userData"), "attic-backup.json");
    fs.writeFileSync(dataPath, JSON.stringify(data), "utf-8");
    console.log("[attic] Backup sauvegardé:", dataPath);
    return true;
  } catch (e) {
    console.error("[attic] Backup échoué:", e);
    return false;
  }
});

// Restauration des données après mise à jour (synchrone)
ipcMain.on("maj:restaurer-backup-sync", (event) => {
  try {
    const dataPath = path.join(app.getPath("userData"), "attic-backup.json");
    if (!fs.existsSync(dataPath)) { event.returnValue = null; return; }
    const data = fs.readFileSync(dataPath, "utf-8");
    fs.unlinkSync(dataPath);
    console.log("[attic] Backup restauré (sync)");
    event.returnValue = JSON.parse(data);
  } catch {
    event.returnValue = null;
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // Configuration globale de la session (une seule fois, indépendamment du nombre
  // de fenêtres) pour éviter les handlers en double et les CSP multiples.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    // Retirer une CSP existante pour éviter les doublons
    delete headers["Content-Security-Policy"];
    delete headers["content-security-policy"];
    headers["Content-Security-Policy"] = [CSP];
    callback({ responseHeaders: headers });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(PERMISSIONS_ACCORDEES.has(permission));
  });

  creerFenetre();
  if (DEV && fenetre) {
    fenetre.webContents.openDevTools({ mode: "detach" });
  }
  // F12 pour ouvrir/fermer les devTools (le menu par défaut qui le permettait a été supprimé)
  app.on("web-contents-created", (_e, contents) => {
    contents.on("before-input-event", (event, input) => {
      if (input.key === "F12") {
        if (fenetre && !fenetre.isDestroyed()) {
          if (fenetre.webContents.isDevToolsOpened()) {
            fenetre.webContents.closeDevTools();
          } else {
            fenetre.webContents.openDevTools({ mode: "detach" });
          }
          event.preventDefault();
        }
      }
    });
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
});
