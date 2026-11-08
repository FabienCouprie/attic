const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, desktopCapturer, protocol } = require("electron");
const path = require("path");

// ═══ LES DIALOGUES FONT NAÎTRE LES RACINES, ET EUX SEULS ═══
//
// C'est la seule capacité que le rendu peut faire naître : il demande un dialogue, l'utilisateur
// désigne un endroit, et cet endroit devient autorisé. Un chemin simplement NOMMÉ par le rendu
// n'autorise rien — c'est tout l'objet du bornage décidé le 2026-10-25.
//
// ENVELOPPÉS UNE FOIS PLUTÔT QU'À DIX APPELS : dix sites à ne pas oublier seraient dix occasions
// d'en oublier un, et un seul oubli rouvrirait la porte sans que rien ne le dise.
// ET CE QU'UN DIALOGUE ACCORDE SURVIT À LA FERMETURE, mesuré sur deux chemins du code : le dossier
// de travail choisi est gardé dans `attic-repertoire` côté rendu, et les six écrivains à paramètre
// « Dossier de sortie » gardent le leur DANS LE PROJET. Dans les deux cas, le lancement suivant
// n'ouvre aucun dialogue — une racine qui ne durerait qu'une session casserait l'ouverture d'un
// projet en silence.
async function showSaveDialogSuivi(...args) {
  const r = await dialog.showSaveDialog(...args);
  if (!r.canceled && r.filePath) accorderRacineDuFichier(r.filePath);
  return r;
}
async function showOpenDialogSuivi(...args) {
  const r = await dialog.showOpenDialog(...args);
  // UN DIALOGUE DE DOSSIER REND LE DOSSIER, un dialogue de fichier rend un fichier : la racine
  // n'est pas la même, et la confondre autoriserait le parent du dossier choisi.
  const estDossier = (args[1]?.properties || []).includes("openDirectory");
  if (!r.canceled) {
    for (const p of r.filePaths || []) {
      if (estDossier) accorderRacine(p); else accorderRacineDuFichier(p);
    }
  }
  return r;
}
const fs = require("fs");
const { Readable } = require("stream");
const { armerJournal, inscrireCanal } = require("./chemin-sur.cjs");
const { avecProprietaire } = require("./travaux.cjs");
const { resumerManifeste } = require("./resume-node-zip.cjs");
const { memoriserLesScripts } = require("./scripts-autorises.cjs");

// ═══ CHAQUE TRAITEMENT S'EXÉCUTE AU NOM DE LA FENÊTRE QUI L'APPELLE ═══
//
// POSÉ ICI POUR LA MÊME RAISON QUE LE RELEVÉ CI-DESSOUS : avant tout `ipcMain.handle`. Un travail
// engendré pendant le traitement appartient ainsi à la fenêtre qui l'a demandé, et « Arrêter » dans
// une fenêtre ne tue plus ce qui tourne dans une autre. Voir `electron/travaux.cjs`.
{
  const handleSansProprietaire = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (canal, traitement) => handleSansProprietaire(canal, (event, ...args) =>
    avecProprietaire(event?.sender?.id, () => traitement(event, ...args)));
}

// ═══ LE RELEVÉ DE TOUS LES CANAUX, QUAND IL EST DEMANDÉ ═══
//
// POSÉ ICI, AVANT TOUT `ipcMain.handle`, et il le faut : les gestionnaires s'enregistrent au
// chargement du module, donc un emballage posé plus bas n'en verrait aucun.
//
// POURQUOI IL EXISTE. J'avais donné une liste de gestes censés passer par les canaux de fichier,
// DÉDUITE des modules qui nomment le pont dans leur source. Les gestes faits, le journal est resté
// vide : savoir qu'un module mentionne `api.ecrireFichier` ne dit pas quel geste l'appelle, ni même
// s'il est appelé. Plutôt qu'une quatrième liste devinée, on relève TOUS les canaux et le journal
// dit ce qui s'allume.
if (process.env.ATTIC_JOURNAL_CHEMINS === "1") {
  const handleBrut = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (canal, traitement) => handleBrut(canal, async (...args) => {
    inscrireCanal(canal);
    return traitement(...args);
  });
}
const {
  declarerRacine, racinesConnues,
  accorderRacine, accorderRacineDuFichier, memoriserLesAccords, declarerRacinesDeLEnvironnement, racinesStrictes,
} = require("./capacites-chemins.cjs");
const { extraireEntrees, dossierNode } = require("./extraire-node-zip.cjs");
const { installerIpcMaj } = require("./ipc-maj.cjs");
const { installerIpcScripts } = require("./ipc-scripts.cjs");
const { installerIpcFichiers } = require("./ipc-fichiers.cjs");
const { installerIpcModeles } = require("./ipc-modeles.cjs");
const { installerIpcMoteurs } = require("./ipc-moteurs.cjs");
const { installerSauvegardeAvantFermeture } = require("./fermeture-sauvegarde.cjs");
const {
  fenetreDe, uneSeuleFois, requeteDeFenetre, adresseDeDeveloppement,
} = require("./fenetres.cjs");
const { resoudreRessource } = require("./chemins-ressources.cjs");
const { dossierRessourcesVoulu, migrerRessources } = require("./dossier-ressources.cjs");
const { SCHEMA: SCHEMA_MEDIA, cheminDepuisUrl, typeMedia, analyserPlage } = require("./plage-media.cjs");
const { SCHEMA: SCHEMA_RESSOURCE, servir: servirRessource } = require("./ressource-locale.cjs");

// Racine des nœuds installés. Fonction et non constante : `app.getPath` ne
// répond qu'une fois Electron prêt.
const RACINE_NODES = () => path.join(app.getPath("home"), ".attic", "nodes");

// Sauvegarde des données utilisateur autour d'une mise à jour, même raison.
const CHEMIN_SAUVEGARDE_MAJ = () => path.join(app.getPath("userData"), "attic-backup.json");

// Contexte de résolution des chemins de ressources. Sept copies de ce même
// calcul vivaient dans ce fichier, dont une seule avec le repli `public/` du
// développement : un chemin relatif se résolvait par un gestionnaire et pas par
// un autre, en développement seulement. Voir chemins-ressources.cjs.
/**
 * Où vont les ressources téléchargées à la demande.
 *
 * `resources/` est dans « Program Files » : une application installée n'y écrit pas sans droits
 * d'administrateur. Ce dossier-ci est le seul inscriptible sans rien demander, et il reproduit la
 * même disposition — `oonx/x.onnx` ici répond au même chemin relatif que `oonx/x.onnx` là-bas —
 * si bien qu'aucun nœud n'a à savoir d'où vient son modèle. Le résolveur y regarde EN PREMIER,
 * de sorte qu'un modèle téléchargé répare un modèle livré abîmé.
 *
 * SOUS LINUX, CE N'EST PLUS `userData` (`~/.config/attic`) mais `~/.local/share/attic` : voir
 * `electron/dossier-ressources.cjs`. Le premier appel, au démarrage, y renomme l'ancien dossier ;
 * le résultat est retenu, si bien qu'un renommage refusé laisse servir l'ancien jusqu'au bout.
 */
let dossierRessourcesRetenu = null;
const dossierRessourcesUtilisateur = () => {
  if (dossierRessourcesRetenu) return dossierRessourcesRetenu;
  const ancien = path.join(app.getPath("userData"), "ressources");
  const voulu = dossierRessourcesVoulu({
    plateforme: process.platform, userData: app.getPath("userData"),
    home: app.getPath("home"), env: process.env,
  });
  const migration = migrerRessources(ancien, voulu);
  if (migration.action !== "aucune") {
    console.log(`[attic] ressources : ${migration.action} ${ancien} → ${migration.dossier}`
      + (migration.erreur ? ` (${migration.erreur})` : ""));
  }
  dossierRessourcesRetenu = migration.dossier;
  return dossierRessourcesRetenu;
};

const contexteRessources = () => ({
  empaquete: app.isPackaged,
  racineRessources: process.resourcesPath,
  racineProjet: path.resolve(__dirname, ".."),
  dossierUtilisateur: dossierRessourcesUtilisateur(),
});

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

// Supprimer le warning de sécurité Electron en mode dev. `unsafe-eval` ne vit plus que dans la page
// du cadre isolé ; l'avertissement resterait levé par `unsafe-inline`, que les vues emploient.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// Content-Security-Policy : une par destination. Le document n'a plus `unsafe-eval` ; seule la page
// du cadre isolé des nœuds installés le garde. Voir `electron/politique-securite.cjs`.
const { politiquePour } = require("./politique-securite.cjs");

// LE SCHÉMA QUI SERT UN FILM DU DISQUE, déclaré AVANT que l'application soit prête : un schéma
// enregistré après ne reçoit pas les privilèges, et un élément vidéo refuse alors de s'y déplacer.
// `stream` est ce qui autorise les réponses partielles, donc le déplacement dans un film ; `secure`
// et `standard` le font traiter comme une origine ordinaire, sans quoi la CSP le rejette.
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEMA_MEDIA,
  privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: false },
}, {
  // LE SCHÉMA QUI SERT UNE RESSOURCE LIVRÉE À UN WORKER, déclaré ici pour la même raison que le
  // précédent. Un Web Worker n'a pas de preload, donc pas d'`api.lireBinaire` ; et dans
  // l'application empaquetée la page vient de `file://`, où un `fetch` est refusé. Les modèles
  // Magenta, que la bibliothèque ne sait charger que par URL, passent par là.
  // `corsEnabled` EST INDISPENSABLE, et c'est ce qui manquait au premier essai : la page vient de
  // `file://` et le schéma est une AUTRE origine, de sorte qu'un `fetch` y est une requête croisée.
  // Sans cela Chromium refuse avant même d'appeler le gestionnaire — « Cross origin requests are
  // only supported for protocol schemes… » — et la CSP n'y est pour rien, elle autorisait déjà.
  scheme: SCHEMA_RESSOURCE,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: false },
}]);

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
  "midi",                                         // nœud Capture MIDI (navigator.requestMIDIAccess, pas de sysex)
]);

// LA PREMIÈRE FENÊTRE, pour les outils de développement ouverts au lancement. Rien d'autre ne la
// lit : un dialogue se rattache à la fenêtre qui le demande, voir `electron/fenetres.cjs`.
let fenetre = null;

// En dev, forcer un rechargement sans cache du renderer pour éviter qu'un ancien build Vite ne
// soit réutilisé par la session Electron (HTTP cache, V8 code cache, CacheStorage, localStorage,
// etc. entre deux redémarrages). UNE FOIS PAR PROCESSUS : fait à chaque fenêtre, il vidait le
// stockage de celle qui était déjà ouverte. Voir `electron/fenetres.cjs`.
const viderLesCachesDeDeveloppement = uneSeuleFois(async (sess) => {
  await sess.clearCache();
  await sess.clearCodeCaches({ urls: [] });
  await sess.clearStorageData();
  console.log("[attic] dev cache cleared (HTTP + V8 + storage)");
});

/** `nouvelle` : ouverte par « Nouvelle fenêtre », elle naît sur un canevas vide, sans fichier. */
async function creerFenetre({ nouvelle = false } = {}) {
  // UNE VARIABLE LOCALE, ET NON LA VARIABLE DE MODULE : celle-ci serait réaffectée par une seconde
  // ouverture pendant l'attente du vidage, et cette fenêtre-ci chargerait alors la page de l'autre.
  const f = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, DEV ? "../public/icon.png" : "../dist/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });
  if (!fenetre || fenetre.isDestroyed()) fenetre = f;

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
  f.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Sauvegarder le projet avant de fermer : la sauvegarde automatique écrit toutes les
  // 30 secondes, et ce qui a été fait depuis le dernier battement ne tient qu'en mémoire.
  // La séquence vit dans `fermeture-sauvegarde.cjs`, avec ses tests.
  installerSauvegardeAvantFermeture({ fenetre: f, ipcMain });

  if (DEV) {
    await viderLesCachesDeDeveloppement(f.webContents.session);
    f.loadURL(adresseDeDeveloppement("http://localhost:5175", nouvelle));
  } else {
    const cheminDist = path.join(__dirname, "..", "dist", "index.html");
    if (!fs.existsSync(cheminDist)) {
      f.loadURL("data:text/html;charset=utf-8,<h2>Build introuvable</h2><p>Lancez <code>npm run build</code> d'abord.</p>");
      return;
    }
    f.loadFile(cheminDist, { query: requeteDeFenetre(nouvelle) });
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

// --- IPC : la source de capture de la fenêtre qui demande (démonstration filmée) ---
ipcMain.handle("capture:ma-fenetre", (event) => {
  const fenetre = BrowserWindow.fromWebContents(event.sender);
  return fenetre ? fenetre.getMediaSourceId() : null;
});

// ─── Les fichiers et les dossiers ───
// Leurs vingt canaux vivent dans `ipc-fichiers.cjs` depuis le 2026-11-08, et s'enregistrent ici, à
// la place du premier de leurs trois blocs. L'appel rend le calcul du dossier de travail par défaut,
// que le démarrage déclare racine.
const { dossierDeTravailParDefaut } = installerIpcFichiers({
  ipcMain, app, BrowserWindow, shell, showSaveDialogSuivi, showOpenDialogSuivi, contexteRessources,
});

// ─── Les téléchargements et les modèles ───
// Leurs cinq canaux vivent dans `ipc-modeles.cjs` depuis le 2026-11-08, et s'enregistrent ici, à
// la place de leur bloc. L'appel rend ce dont deux moteurs ont besoin pour prendre eux-mêmes leur
// paquet à la première utilisation : le manifeste, les sondes, le téléchargement, et de quoi savoir
// s'il en tourne déjà un.
const {
  lireManifesteModeles, sondesModeles, telechargerModeles, telechargementEnCours,
} = installerIpcModeles({ ipcMain, contexteRessources, dossierRessourcesUtilisateur });

// ─── Les moteurs ───
// Leurs vingt canaux, Ollama compris, vivent dans `ipc-moteurs.cjs` depuis le 2026-11-08. Ils
// s'enregistrent ici, juste après les modèles : deux d'entre eux prennent eux-mêmes leur paquet par
// ce que l'appel du dessus rend, et ne peuvent le recevoir qu'une fois qu'il a été rendu.
installerIpcMoteurs({
  ipcMain, contexteRessources,
  lireManifesteModeles, sondesModeles, telechargerModeles, telechargementEnCours,
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

ipcMain.handle("nouvelle-fenetre", async () => {
  creerFenetre({ nouvelle: true });
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
ipcMain.handle("node:importer-zip", async (event, zipPath) => {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) return { ok: false, erreur: "manifest.json introuvable dans le zip." };
    const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
    if (!manifest.id || !manifest.nom) return { ok: false, erreur: "manifest.json invalide (id/nom manquant)." };

    // ON MONTRE CE QUI VA S'INSTALLER, AVANT D'EXTRAIRE UNE SEULE ENTRÉE. Le réglage « Exécution »
    // du Gestionnaire disait l'intention ; rien ne nommait le composant qu'on autorisait. La
    // question est posée ici, du côté privilégié, pour qu'aucun code du rendu ne puisse y répondre
    // à la place de la personne. Voir `electron/resume-node-zip.cjs`.
    const codeEntry = zip.getEntry("executer.js");
    const resume = resumerManifeste(manifest, codeEntry ? codeEntry.getData().toString("utf-8") : "",
      !app.getLocale().toLowerCase().startsWith("fr"));
    const fenetre = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "warning", title: resume.titre, message: resume.message, detail: resume.detail,
      buttons: resume.boutons, defaultId: 1, cancelId: 1, noLink: true,
    };
    const { response } = fenetre ? await dialog.showMessageBox(fenetre, options) : await dialog.showMessageBox(options);
    if (response !== 0) return { ok: false, annule: true, erreur: "Installation annulée." };

    // Répertoire d'installation. `manifest.id` vient du .zip, donc de
    // l'extérieur, et sert à construire un chemin : il est validé avant, sans
    // quoi « ../../x » sortirait de l'arborescence des nœuds — et la protection
    // Zip Slip plus bas, qui se mesure par rapport à CE dossier, validerait
    // alors tout ce qu'on y écrit.
    const nodesDir = dossierNode(RACINE_NODES(), manifest.id);
    if (!nodesDir) return { ok: false, erreur: `manifest.json invalide : identifiant « ${manifest.id} » refusé.` };
    if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });

    // Extraire tous les fichiers. La boucle vit dans extraire-node-zip.cjs :
    // elle référençait une variable inexistante (`resolvedTargetPath`), ce que
    // le try/catch de ce gestionnaire masquait en un simple { ok: false } —
    // l'import de nœud n'a donc jamais fonctionné dans l'application packagée.
    // La sortir de main.cjs la rend testable, elle et sa protection Zip Slip.
    const { fichiers, ignorees } = extraireEntrees(zip.getEntries(), nodesDir);
    for (const nom of ignorees) {
      console.warn(`[attic] node:importer-zip entrée ignorée (zip slip): ${nom}`);
    }

    // Chemin des assets
    const assetsPath = path.join(nodesDir, "assets");
    const hasAssets = fs.existsSync(assetsPath) && fs.readdirSync(assetsPath).length > 0;

    return {
      ok: true,
      manifest,
      empreinte: resume.empreinte,
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
  // En lecture seule, donc le moins exposé des trois — mais il passe par le
  // même validateur pour que les trois usages de `nodeId` ne divergent pas.
  const nodeDir = dossierNode(RACINE_NODES(), nodeId);
  if (!nodeDir) return null;
  const assetsPath = path.join(nodeDir, "assets");
  return fs.existsSync(assetsPath) ? assetsPath : null;
});

// --- IPC : Supprimer un node installé (assets) ---
ipcMain.handle("node:supprimer", async (_event, nodeId) => {
  try {
    // Le plus destructeur des trois usages de `nodeId` : `rmSync` en récursif.
    // Un identifiant refusé ne supprime RIEN, plutôt que de supprimer ailleurs.
    const nodeDir = dossierNode(RACINE_NODES(), nodeId);
    if (!nodeDir) { console.warn(`[attic] node:supprimer identifiant refusé: ${nodeId}`); return false; }
    if (fs.existsSync(nodeDir)) fs.rmSync(nodeDir, { recursive: true });
    return true;
  } catch { return false; }
});

// --- IPC : Sauvegarde du fichier (dialogue) ---
ipcMain.handle("node:sauvegarder-zip", async (event, { defaultPath }) => {
  const resultat = await showSaveDialogSuivi(fenetreDe(BrowserWindow, event), {
    defaultPath: defaultPath || "node.zip",
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (resultat.canceled || !resultat.filePath) return null;
  return resultat.filePath;
});

// --- IPC : Sélectionner un fichier zip pour import ---
ipcMain.handle("node:selectionner-zip", async (event) => {
  const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
    title: "Sélectionner un node .zip",
    filters: [{ name: "ZIP", extensions: ["zip"] }],
    properties: ["openFile"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  return resultat.filePaths[0];
});

// ─── Python, Julia et les scripts écrits dans l'éditeur ───
// Ils vivent dans `ipc-scripts.cjs` depuis le 2026-11-08, avec la détection des deux interprètes.
// L'appel reste ici, à la place des canaux qu'il remplace, pour qu'ils s'enregistrent dans le même
// ordre qu'avant.
installerIpcScripts({ ipcMain, app, BrowserWindow, dialog, showOpenDialogSuivi });

// ─── Auto-updater : configuration + IPC ───
// Les mises à jour vivent dans `ipc-maj.cjs` depuis le 2026-11-07. L'appel reste ici, à la place
// du code qu'il remplace, pour que les canaux s'enregistrent dans le même ordre qu'avant.
installerIpcMaj({ ipcMain, BrowserWindow, autoUpdater, CHEMIN_SAUVEGARDE_MAJ });

// Mémoire occupée par l'application entière : navigateur, onglets, GPU, utilitaires.
// `getAppMetrics` lit des compteurs déjà tenus par le système — pas de processus lancé, pas
// d'attente : la politique non bloquante du processus principal est respectée.
ipcMain.handle("memoire:mesurer", async () => {
  return app.getAppMetrics().map((m) => ({ type: m.type, memory: { workingSetSize: m.memory?.workingSetSize ?? 0 } }));
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // LE RELEVÉ DES DESTINATIONS, s'il est demandé par `ATTIC_JOURNAL_CHEMINS=1`. Il sert à DÉRIVER
  // les racines autorisées du pont au lieu de les deviner : quinze fichiers écrivent par là, et
  // leurs chemins viennent de dossiers choisis, parfois dans une session antérieure. Sans mesure,
  // poser les racines casserait des fonctions en silence.
  const journal = armerJournal(app.getPath("userData"));
  if (journal) console.log(`[attic] journal des chemins ARMÉ : ${journal}`);

  // ═══ LES RACINES DU PONT, DÉRIVÉES DE LA MESURE ═══
  //
  // DÉCLARÉES ICI, ET NON AU PREMIER APPEL DU RENDU. C'est la leçon du relevé de Fabien : son
  // journal portait une écriture vers `E:/attic/work/export.svg`, marquée HORS RACINE alors que
  // c'est l'endroit même où l'application est faite d'écrire. La cause n'était pas le dossier mais
  // le MOMENT : la racine naissait dans le gestionnaire `dossier:travail-defaut`, que l'interface
  // n'appelle que si son réglage est vide.
  //
  // QUATRE SOURCES, et chacune est mintée par ce côté-ci :
  //   · le dossier de travail, calculé ci-dessus dans une liste de candidats que le rendu ne nomme pas ;
  //   · `userData`, qui est à l'application ;
  //   · les accords relus, que des dialogues ont fait naître dans des sessions antérieures ;
  //   · `ATTIC_RACINES`, si le propriétaire en déclare.
  //
  // ET LE DOSSIER TEMPORAIRE N'EN EST PAS, quoi qu'il serait commode de le croire : AUCUNE des
  // destinations relevées n'y mène, et il est partagé avec toutes les autres applications de la
  // machine. Une racine que la mesure ne demande pas est une permission devinée.
  declarerRacine(app.getPath("userData"));
  // LES MODÈLES TÉLÉCHARGÉS, hors de `userData` sous Linux : ils y étaient couverts par la racine
  // ci-dessus, ils doivent l'être encore là où ils vont. L'appel fait aussi le déplacement, une
  // fois, avant que la fenêtre n'interroge l'inventaire.
  declarerRacine(dossierRessourcesUtilisateur());
  dossierDeTravailParDefaut();
  const accords = memoriserLesAccords(path.join(app.getPath("userData"), "racines-accordees.json"));
  // LES SCRIPTS AUTORISÉS SE RELISENT AVEC LES ACCORDS, et pour la même raison : la personne les a
  // accordés dans une session antérieure. Voir `electron/scripts-autorises.cjs`.
  memoriserLesScripts(path.join(app.getPath("userData"), "scripts-autorises.json"));
  const deLEnv = declarerRacinesDeLEnvironnement();
  console.log(`[attic] racines du pont : ${racinesConnues().length}`
    + ` (${accords.length} accordée(s) relue(s), ${deLEnv.length} par ATTIC_RACINES)`
    + (racinesStrictes() ? " · SANCTION ARMÉE" : " · sanction éteinte, hors racine est inscrit et passe"));

  // Configuration globale de la session (une seule fois, indépendamment du nombre
  // de fenêtres) pour éviter les handlers en double et les CSP multiples.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    // Retirer une CSP existante pour éviter les doublons
    delete headers["Content-Security-Policy"];
    delete headers["content-security-policy"];
    // PAR DESTINATION : la page du cadre isolé a la sienne, le reste celle du document.
    headers["Content-Security-Policy"] = [politiquePour(details.url)];
    callback({ responseHeaders: headers });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(PERMISSIONS_ACCORDEES.has(permission));
  });

  // LE FILM EST SERVI PAR MORCEAUX, comme le ferait un serveur : l'en-tête « Range » est honoré et
  // la réponse est un flux, jamais un tampon. C'est ce qui permet de se déplacer dans un film de
  // onze minutes sans jamais en tenir plus de quelques centaines de kilo-octets.
  // LES RESSOURCES LIVRÉES, pour les workers. Le résolveur est celui de tout le dépôt : il regarde
  // d'abord dans le dossier inscriptible de l'utilisateur, où tout modèle arrive désormais —
  // l'installeur n'en embarque plus aucun —, et où va aussi celui qu'on reprend pour réparer un
  // fichier abîmé, de sorte qu'il l'emporte sur celui de `resources/`.
  protocol.handle(SCHEMA_RESSOURCE, (requete) =>
    servirRessource(requete, (relatif) => resoudreRessource(relatif, contexteRessources())));

  protocol.handle(SCHEMA_MEDIA, async (requete) => {
    const chemin = cheminDepuisUrl(requete.url);
    const type = chemin && typeMedia(chemin);
    if (!chemin || !type) return new Response("chemin refusé", { status: 400 });
    let taille;
    try {
      taille = (await fs.promises.stat(chemin)).size;
    } catch {
      return new Response("fichier introuvable", { status: 404 });
    }
    const plage = analyserPlage(requete.headers.get("Range"), taille);
    if (plage?.invalide) {
      return new Response("plage hors du fichier", {
        status: 416, headers: { "Content-Range": `bytes */${taille}` },
      });
    }
    const options = plage ? { start: plage.debut, end: plage.fin } : {};
    const flux = Readable.toWeb(fs.createReadStream(chemin, options));
    return new Response(flux, {
      status: plage ? 206 : 200,
      headers: {
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        "Content-Length": String(plage ? plage.longueur : taille),
        ...(plage ? { "Content-Range": `bytes ${plage.debut}-${plage.fin}/${taille}` } : {}),
      },
    });
  });

  creerFenetre();
  if (DEV && fenetre) {
    fenetre.webContents.openDevTools({ mode: "detach" });
  }
  // F12 pour ouvrir/fermer les devTools (le menu par défaut qui le permettait a été supprimé),
  // CEUX DE LA FENÊTRE OÙ L'ON A APPUYÉ, et non ceux de la dernière ouverte.
  app.on("web-contents-created", (_e, contents) => {
    contents.on("before-input-event", (event, input) => {
      if (input.key === "F12") {
        const cible = BrowserWindow.fromWebContents(contents);
        if (cible && !cible.isDestroyed()) {
          if (cible.webContents.isDevToolsOpened()) {
            cible.webContents.closeDevTools();
          } else {
            cible.webContents.openDevTools({ mode: "detach" });
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
