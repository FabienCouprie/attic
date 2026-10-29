// CE FICHIER NE REQUIERT QUE « electron », ET C'EST UNE CONTRAINTE, NON UN STYLE. Le préchargement
// est exécuté en bac à sable : `require` n'y donne accès ni aux modules de Node ni à un fichier
// voisin, et une seule ligne fautive fait échouer le fichier ENTIER, donc `window.api` avec lui.
// L'application perd alors tous ses boutons d'un coup, sans message. Ce qui doit être partagé avec
// le processus principal passe par l'IPC, ou est réécrit côté fenêtre sous garde d'un test.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,

  // Résout le chemin disque absolu d'un File choisi via <input type=file>.
  // (Electron 32+ a retiré File.path ; webUtils.getPathForFile le remplace.)
  cheminFichier: (fichier) => webUtils.getPathForFile(fichier),

  separerDemucs: (options) => ipcRenderer.invoke("demucs:separer", options),
  genererStableAudio3: (options) => ipcRenderer.invoke("stable-audio-3:generer", options),
  genererImageSdxs: (options) => ipcRenderer.invoke("sdxs-image:generer", options),
  noterTrancheEsthetique: (options) => ipcRenderer.invoke("esthetique:noter-tranche", options),
  genererSongsee: (options) => ipcRenderer.invoke("songsee:generer", options),

  sauvegarderFichier: (options) => ipcRenderer.invoke("fichier:sauvegarder", options),

  ouvrirFichier: (options) => ipcRenderer.invoke("fichier:ouvrir", options),
  // Le dossier des graphes d'exemple, pour y ouvrir le classeur. `null` s'il n'est pas livré.
  dossierExemples: () => ipcRenderer.invoke("exemples:dossier"),

  sauvegarderBinaire: (options) => ipcRenderer.invoke("fichier:sauvegarder-binaire", options),

  choisirDossier: () => ipcRenderer.invoke("dossier:choisir"),

  // Le dialogue qui rend un chemin de fichier, et rien d'autre : ce que demande un paramètre de
  // type « fichier », là où `ouvrirFichier` et `ouvrirFichierBinaire` lisent tout le contenu.
  choisirFichier: (options) => ipcRenderer.invoke("fichier:choisir", options),

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
  // Un script écrit dans l'éditeur du nœud s'inscrit parmi les scripts autorisés. Voir
  // `electron/scripts-autorises.cjs`.
  scriptsEcritIci: (code) => ipcRenderer.invoke("scripts:ecrit-ici", code),
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
  // La taille et une plage d'octets : de quoi lire un gros fichier sans le tenir en mémoire.
  tailleFichier: (chemin) => ipcRenderer.invoke("fichier:taille", chemin),
  lirePlage: (chemin, debut, fin) => ipcRenderer.invoke("fichier:lire-plage", { chemin, debut, fin }),
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

  // Arrête les travaux lancés dans le processus principal — les processus enfants, qu'aucun arrêt
  // n'atteignait. Sans argument : l'ordonnanceur sérialise les runs, il n'y en a qu'un en vol.
  travauxAnnuler: () => ipcRenderer.invoke("travail:annuler"),

  // La chanson locale. `acestepProgression` rend de quoi se désabonner, comme celle des modèles :
  // un nœud qui se démonte sans le faire laisserait un écouteur par exécution.
  acestepPlanifier: (options) => ipcRenderer.invoke("acestep:planifier", options),
  acestepRendre: (options) => ipcRenderer.invoke("acestep:rendre", options),
  acestepProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("acestep:progression", ecouteur);
    return () => ipcRenderer.removeListener("acestep:progression", ecouteur);
  },

  // La transcription d'un audio en MIDI, par audio.cpp. Même désabonnement, même raison.
  muscriptorTranscrire: (options) => ipcRenderer.invoke("muscriptor:transcrire", options),
  muscriptorProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("muscriptor:progression", ecouteur);
    return () => ipcRenderer.removeListener("muscriptor:progression", ecouteur);
  },
  // Une image tirée d'un texte, par stable-diffusion.cpp et MOSS-Image. Même désabonnement.
  sdcppMoss: (options) => ipcRenderer.invoke("sdcpp:moss", options),
  sdcppProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("sdcpp:progression", ecouteur);
    return () => ipcRenderer.removeListener("sdcpp:progression", ecouteur);
  },
  chatterboxConvertir: (options) => ipcRenderer.invoke("chatterbox:convertir", options),
  chatterboxConversionProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("chatterbox:conversion-progression", ecouteur);
    return () => ipcRenderer.removeListener("chatterbox:conversion-progression", ecouteur);
  },
  chatterboxCloner: (options) => ipcRenderer.invoke("chatterbox:cloner", options),
  chatterboxProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("chatterbox:progression", ecouteur);
    return () => ipcRenderer.removeListener("chatterbox:progression", ecouteur);
  },

  // La transcription par le second moteur. Même désabonnement, même raison.
  qwen3AsrTranscrire: (options) => ipcRenderer.invoke("qwen3asr:transcrire", options),
  qwen3AsrProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("qwen3asr:progression", ecouteur);
    return () => ipcRenderer.removeListener("qwen3asr:progression", ecouteur);
  },

  // Les mots d'un enregistrement et l'instant de chacun. Même désabonnement, même raison.
  parakeetTranscrire: (options) => ipcRenderer.invoke("parakeet:transcrire", options),
  parakeetProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("parakeet:progression", ecouteur);
    return () => ipcRenderer.removeListener("parakeet:progression", ecouteur);
  },

  // La restauration d'un son abîmé par la compression. Même désabonnement, même raison.
  apolloRestaurer: (options) => ipcRenderer.invoke("apollo:restaurer", options),
  apolloProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("apollo:progression", ecouteur);
    return () => ipcRenderer.removeListener("apollo:progression", ecouteur);
  },

  // La parole : qui parle quand, et où tombe chaque mot. Deux modèles, un seul exécutable, et
  // deux canaux d'avancement distincts pour que deux tâches lancées ensemble ne mêlent pas leurs
  // lignes de journal.
  paroleDiariser: (options) => ipcRenderer.invoke("parole:diariser", options),
  paroleDiarisationProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("parole:diarisation-progression", ecouteur);
    return () => ipcRenderer.removeListener("parole:diarisation-progression", ecouteur);
  },
  paroleAligner: (options) => ipcRenderer.invoke("parole:aligner", options),
  paroleAlignementProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("parole:alignement-progression", ecouteur);
    return () => ipcRenderer.removeListener("parole:alignement-progression", ecouteur);
  },

  // L'étiquetage d'un audio par CED, cinq cent vingt-sept classes d'AudioSet. Même désabonnement.
  cedEtiqueter: (options) => ipcRenderer.invoke("ced:etiqueter", options),
  cedProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("ced:progression", ecouteur);
    return () => ipcRenderer.removeListener("ced:progression", ecouteur);
  },

  // La séparation d'une voix et de son accompagnement. Elle rend DEUX pistes, là où les trois
  // autres familles du même exécutable n'en rendent qu'une. Même désabonnement.
  roformerSeparer: (options) => ipcRenderer.invoke("roformer:separer", options),
  roformerProgression: (callback) => {
    const ecouteur = (_e, etat) => callback(etat);
    ipcRenderer.on("roformer:progression", ecouteur);
    return () => ipcRenderer.removeListener("roformer:progression", ecouteur);
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
