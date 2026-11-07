// electron/ipc-maj.cjs — Les mises à jour de l'application : leur état, leurs événements, leurs IPC.
//
// TIRÉ DE `main.cjs` LE 2026-11-07, tel quel, par le lot 5 de la revue d'architecture du
// 2026-10-31 : `main.cjs` portait les soixante et onze `ipcMain.handle` d'`electron/` en deux mille
// cent lignes, et ce module est le premier des six qui les reprennent par famille. Aucune ligne de
// calcul n'a été retouchée : le bloc est le même, indenté d'un cran dans la fonction qui l'installe.
//
// IL REÇOIT CE DONT IL A BESOIN, et ne requiert pas `electron` : c'est la forme de
// `fermeture-sauvegarde.cjs`, et `main.cjs` l'appelle à l'endroit même où ce code vivait, pour que
// les canaux s'enregistrent dans le même ordre qu'avant.
"use strict";

const { etatNeutre, etatVerification, etatApresAttente, peutEcraser } = require("./etat-maj.cjs");
const { ecrireSauvegarde, lireSauvegarde } = require("./sauvegarde-maj.cjs");
const { uneFenetreVivante } = require("./fenetres.cjs");

/**
 * Installe l'état des mises à jour, les événements d'`autoUpdater` et les six canaux `maj:`.
 *
 * @param ipcMain                 le récepteur des IPC ;
 * @param BrowserWindow           pour écrire à toutes les fenêtres ;
 * @param autoUpdater             celui d'`electron-updater`, ou `null` en développement ;
 * @param CHEMIN_SAUVEGARDE_MAJ   le chemin de la sauvegarde prise avant l'installation.
 */
function installerIpcMaj({ ipcMain, BrowserWindow, autoUpdater, CHEMIN_SAUVEGARDE_MAJ }) {
  // ─── Auto-updater : configuration + IPC ───
  let infoMaj = etatNeutre();

  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // UNE VÉRIFICATION N'EFFACE PAS UN TÉLÉCHARGEMENT EN COURS, et ces deux gardes sont ce qui le
    // tient. Relevé par Fabien : la barre retombait au début à chaque clic sur l'icône. Rien ne
    // recommençait — `autoDownload` est à faux, une vérification ne télécharge pas — mais l'état
    // était écrasé, ici d'abord par le statut, puis par une progression remise à zéro. Un affichage
    // qui ment sur l'avancement d'un téléchargement de plusieurs minutes est un défaut à part
    // entière : il fait croire à une perte qui n'a pas eu lieu.
    autoUpdater.on("checking-for-update", () => {
      if (!peutEcraser(infoMaj)) return;
      infoMaj.statut = "verification";
      envoyerInfoMaj();
    });
    autoUpdater.on("update-available", (info) => {
      if (!peutEcraser(infoMaj)) return;
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
        // en demandant au renderer de nous l'envoyer. À UNE SEULE FENÊTRE : toutes lisent le même
        // stockage, et deux réponses écriraient le même fichier en même temps.
        uneFenetreVivante(BrowserWindow.getAllWindows())?.webContents.send("maj:backup-demande");
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

  // À TOUTES LES FENÊTRES : chacune a son bouton de mise à jour. L'envoi reste écrit en toutes
  // lettres, `webContents.send("maj:info", …)` : c'est la forme que `pont-canaux.test.ts` lit.
  function envoyerInfoMaj() {
    for (const f of BrowserWindow.getAllWindows()) {
      if (!f.isDestroyed()) f.webContents.send("maj:info", infoMaj);
    }
  }

  ipcMain.handle("maj:verifier", async () => {
    if (!autoUpdater) return { disponible: false, statut: "indisponible" };
    try {
      infoMaj = etatVerification();
      envoyerInfoMaj();
      const result = await autoUpdater.checkForUpdates();
      // CE SONT LES ÉVÉNEMENTS QUI TRANCHENT, et non ce retour. `checkForUpdates` rend un
      // `UpdateCheckResult` dès que la vérification ABOUTIT, et son `updateInfo` décrit la dernière
      // version publiée — même quand c'est celle qui tourne. Conclure de sa seule présence faisait
      // reparaître le bouton orange après la mise à jour, proposant la version déjà installée ; le
      // clic suivant appelait un téléchargement qui n'avait rien à prendre, et c'est son échec que
      // l'utilisateur voyait. Voir `electron/etat-maj.cjs`.
      infoMaj = etatApresAttente(infoMaj, result);
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
    // Écriture ATOMIQUE (cf. sauvegarde-maj.cjs) : cette sauvegarde est prise
    // juste avant qu'electron-updater installe et relance, donc au moment où le
    // process est le plus susceptible d'être tué en cours d'écriture.
    const dataPath = CHEMIN_SAUVEGARDE_MAJ();
    const ok = ecrireSauvegarde(dataPath, data);
    if (ok) console.log("[attic] Backup sauvegardé:", dataPath);
    else console.error("[attic] Backup échoué:", dataPath);
    return ok;
  });

  // Restauration des données après mise à jour (synchrone)
  ipcMain.on("maj:restaurer-backup-sync", (event) => {
    // La sauvegarde n'est supprimée QU'APRÈS analyse réussie. L'ancienne version
    // supprimait avant : sur un contenu corrompu, `JSON.parse` levait et le
    // fichier n'existait plus — l'échec de la restauration détruisait ce que la
    // sauvegarde protégeait, exactement dans le cas où elle aurait servi.
    const { donnees, erreur } = lireSauvegarde(CHEMIN_SAUVEGARDE_MAJ());
    if (erreur) console.error("[attic] Backup non restauré —", erreur);
    else if (donnees) console.log("[attic] Backup restauré (sync)");
    // blocage accepté : l'etat est demande AVANT que la page ne s'ouvre, il n'y a encore rien a geler, et la reponse doit arriver avant le premier rendu.
    event.returnValue = donnees;
  });
}

module.exports = { installerIpcMaj };
