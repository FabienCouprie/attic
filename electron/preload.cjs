const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,

  // Résout le chemin disque absolu d'un File choisi via <input type=file>.
  // (Electron 32+ a retiré File.path ; webUtils.getPathForFile le remplace.)
  cheminFichier: (fichier) => webUtils.getPathForFile(fichier),

  separerDemucs: (options) => ipcRenderer.invoke("demucs:separer", options),
  genererStableAudio3: (options) => ipcRenderer.invoke("stable-audio-3:generer", options),
  continuerStableAudio3: (options) => ipcRenderer.invoke("stable-audio-3:continuer", options),
  genererImageSdxs: (options) => ipcRenderer.invoke("sdxs-image:generer", options),
  noterTrancheEsthetique: (options) => ipcRenderer.invoke("esthetique:noter-tranche", options),
  genererSongsee: (options) => ipcRenderer.invoke("songsee:generer", options),

  sauvegarderFichier: (options) => ipcRenderer.invoke("fichier:sauvegarder", options),

  ouvrirFichier: (options) => ipcRenderer.invoke("fichier:ouvrir", options),

  sauvegarderBinaire: (options) => ipcRenderer.invoke("fichier:sauvegarder-binaire", options),

  choisirDossier: () => ipcRenderer.invoke("dossier:choisir"),

  lireDossier: (chemin) => ipcRenderer.invoke("dossier:lire", chemin),

  // L'adresse `data:` que les appelants attendent est fabriquée ICI, dans la fenêtre, et non plus
  // dans le processus principal, qui gardait la chaîne base64 sans jamais la rendre (cf. main.cjs).
  // `FileReader` encode nativement, et la fenêtre, elle, libère sa mémoire : mesuré, elle revient à
  // son niveau de départ en vingt secondes. Les deux champs d'avant sont rendus à l'identique, de
  // sorte qu'aucun des appelants n'a à changer.
  lireFichierAudio: async (chemin) => {
    const r = await ipcRenderer.invoke("fichier:lire-audio", chemin);
    if (!r) return null;
    const url = await new Promise((resoudre, rejeter) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resoudre(lecteur.result);
      lecteur.onerror = () => rejeter(lecteur.error);
      lecteur.readAsDataURL(new Blob([r.donnees], { type: r.mime }));
    });
    return { url, donnees: r.donnees, nom: r.nom };
  },

  // Les octets tels quels, avec leur type MIME : à la fenêtre d'en faire une adresse `blob:` si elle
  // en veut une. Rien n'est recopié en base64, contrairement à `lireFichierAudio` ci-dessus.
  lireFichierBinaire: (chemin) => ipcRenderer.invoke("fichier:lire-binaire", chemin),

  ecrireFichier: (chemin, buffer) => ipcRenderer.invoke("fichier:ecrire", { chemin, buffer }),
  copierFichier: (source, cible) => ipcRenderer.invoke("fichier:copier", { source, cible }),
  ouvrirChemin: (chemin) => ipcRenderer.invoke("fichier:ouvrir-chemin", chemin),
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

  ouvrirDoc: () => ipcRenderer.invoke("doc:ouvrir"),

  captureSources: () => ipcRenderer.invoke("capture:systeme-audio"),
  captureMaFenetre: () => ipcRenderer.invoke("capture:ma-fenetre"),

  // Les modèles ONNX téléchargés à la demande. `modelesProgression` rend de quoi se désabonner :
  // un composant qui se démonte sans le faire laisserait un écouteur par montage.
  modelesEtat: () => ipcRenderer.invoke("modeles:etat"),
  modelesTelecharger: (ids) => ipcRenderer.invoke("modeles:telecharger", ids),
  modelesAnnuler: () => ipcRenderer.invoke("modeles:annuler"),
  modelesProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("modeles:progression", ecouteur);
    return () => ipcRenderer.removeListener("modeles:progression", ecouteur);
  },

  majVerifier: () => ipcRenderer.invoke("maj:verifier"),
  majInfo: () => ipcRenderer.invoke("maj:info"),
  majInstallerRelancer: () => ipcRenderer.invoke("maj:installer-relancer"),
  majTelecharger: () => ipcRenderer.invoke("maj:telecharger"),
  majEvenement: (callback) => ipcRenderer.on("maj:info", (_e, info) => callback(info)),
  majSauvegarderBackup: (data) => ipcRenderer.invoke("maj:sauvegarder-backup", data),
  // blocage accepté : lu au tout debut du chargement de la page, avant qu'il y ait une interface a geler ;
  // la restauration doit etre connue avant le premier rendu, sans quoi on afficherait un graphe vide.
  majRestaurerBackupSync: () => ipcRenderer.sendSync("maj:restaurer-backup-sync"),
  majBackupDemande: (callback) => ipcRenderer.on("maj:backup-demande", () => callback()),

  // Fermeture de la fenêtre : le processus principal l'interrompt, demande la sauvegarde
  // du projet — ce que le renderer ne peut pas faire depuis `beforeunload`, l'écriture
  // passant par IPC — puis ferme dès que `fermeturePrete` lui répond.
  fermetureDemandeSauvegarde: (callback) => ipcRenderer.on("fermeture:sauvegarder", () => callback()),
  fermeturePrete: () => ipcRenderer.send("fermeture:prete"),

  // Mémoire occupée par TOUS les processus de l'application. Seul le processus principal la
  // connaît : un onglet ne voit que son propre tas, et un tampon audio n'y est pas (cf.
  // ui/memoire-vive.ts). Interrogée toutes les deux secondes par la barre d'outils.
  mesurerMemoire: () => ipcRenderer.invoke("memoire:mesurer"),
});
