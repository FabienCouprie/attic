const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,

  // Résout le chemin disque absolu d'un File choisi via <input type=file>.
  // (Electron 32+ a retiré File.path ; webUtils.getPathForFile le remplace.)
  cheminFichier: (fichier) => webUtils.getPathForFile(fichier),

  separerDemucs: (options) => ipcRenderer.invoke("demucs:separer", options),

  sauvegarderFichier: (options) => ipcRenderer.invoke("fichier:sauvegarder", options),

  ouvrirFichier: (options) => ipcRenderer.invoke("fichier:ouvrir", options),

  sauvegarderBinaire: (options) => ipcRenderer.invoke("fichier:sauvegarder-binaire", options),

  choisirDossier: () => ipcRenderer.invoke("dossier:choisir"),

  lireDossier: (chemin) => ipcRenderer.invoke("dossier:lire", chemin),

  lireFichierAudio: (chemin) => ipcRenderer.invoke("fichier:lire-audio", chemin),

  ecrireFichier: (chemin, buffer) => ipcRenderer.invoke("fichier:ecrire", { chemin, buffer }),
  copierFichier: (source, cible) => ipcRenderer.invoke("fichier:copier", { source, cible }),
  extrairePochetteMp3: (chemin) => ipcRenderer.invoke("mp3:extraire-pochette", chemin),
  exporterNodeZip: (options) => ipcRenderer.invoke("node:exporter-zip", options),
  importerNodeZip: (zipPath) => ipcRenderer.invoke("node:importer-zip", zipPath),
  sauvegarderNodeZip: (options) => ipcRenderer.invoke("node:sauvegarder-zip", options),
  cheminAssetsNode: (nodeId) => ipcRenderer.invoke("node:chemin-assets", nodeId),
  supprimerNode: (nodeId) => ipcRenderer.invoke("node:supprimer", nodeId),
  selectionnerNodeZip: () => ipcRenderer.invoke("node:selectionner-zip"),
  pythonInfo: () => ipcRenderer.invoke("python:info"),
  pythonExecuter: (options) => ipcRenderer.invoke("python:executer", options),
  pythonDefinirChemin: (chemin) => ipcRenderer.invoke("python:definir-chemin", chemin),
  pythonChoisirExecutable: () => ipcRenderer.invoke("python:choisir-executable"),

  juliaInfo: () => ipcRenderer.invoke("julia:info"),
  juliaExecuter: (options) => ipcRenderer.invoke("julia:executer", options),
  juliaDefinirChemin: (chemin) => ipcRenderer.invoke("julia:definir-chemin", chemin),
  juliaChoisirExecutable: () => ipcRenderer.invoke("julia:choisir-executable"),

  // Ollama (LLM local) — appelé côté main pour éviter CSP/CORS du renderer.
  ollamaGenerer: (options) => ipcRenderer.invoke("ollama:generer", options),
  ollamaModeles: () => ipcRenderer.invoke("ollama:modeles"),
  lireBinaire: (chemin) => ipcRenderer.invoke("fichier:lire-binaire", chemin),
  lireTexte: (chemin) => ipcRenderer.invoke("fichier:lire-texte", chemin),
  supprimerFichier: (chemin) => ipcRenderer.invoke("fichier:supprimer", chemin),

  telechargerUrl: (url) => ipcRenderer.invoke("telecharger:url", url),

  ouvrirFichierBinaire: (options) => ipcRenderer.invoke("fichier:ouvrir-binaire", options),

  obtenirRepertoireMusicProjet: () => ipcRenderer.invoke("dossier:music-projet"),

  obtenirRepertoireTravail: () => ipcRenderer.invoke("dossier:travail-defaut"),

  quitter: () => ipcRenderer.invoke("app:quitter"),

  nouvelleFenetre: () => ipcRenderer.invoke("nouvelle-fenetre"),

  captureSources: () => ipcRenderer.invoke("capture:systeme-audio"),

  majVerifier: () => ipcRenderer.invoke("maj:verifier"),
  majInfo: () => ipcRenderer.invoke("maj:info"),
  majInstallerRelancer: () => ipcRenderer.invoke("maj:installer-relancer"),
  majTelecharger: () => ipcRenderer.invoke("maj:telecharger"),
  majEvenement: (callback) => ipcRenderer.on("maj:info", (_e, info) => callback(info)),
  majSauvegarderBackup: (data) => ipcRenderer.invoke("maj:sauvegarder-backup", data),
  majRestaurerBackupSync: () => ipcRenderer.sendSync("maj:restaurer-backup-sync"),
  majBackupDemande: (callback) => ipcRenderer.on("maj:backup-demande", () => callback()),
});
