"use strict";

// electron/etat-maj.cjs — Ce qu'une vérification de mise à jour permet de conclure.
//
// LE DÉFAUT QUE CE MODULE EXISTE POUR EMPÊCHER, relevé par Fabien : « l'icône de mise à jour reste
// orange après la mise à jour, on réappuie et cela génère une erreur ».
//
// `maj:verifier` concluait ainsi :
//
//     const result = await autoUpdater.checkForUpdates();
//     // checkForUpdates retourne UpdateCheckResult si update disponible
//     if (result && result.updateInfo) { … statut: "disponible" … }
//
// LE COMMENTAIRE ÉTAIT FAUX, ET C'EST LUI QUI A FAIT ÉCRIRE LA LIGNE. `checkForUpdates` rend un
// `UpdateCheckResult` dès que la vérification ABOUTIT, et son `updateInfo` décrit la dernière
// version publiée — qu'elle soit plus récente que celle qui tourne ou non. Le champ qui répond à
// la question est `isUpdateAvailable`, et il était ignoré.
//
// CE QUE CELA DONNAIT, UNE FOIS LA MISE À JOUR FAITE. L'application tourne en 5.0.1, la release
// annonce 5.0.1 : `update-not-available` posait bien « à jour », puis ce retour l'écrasait par
// « disponible » avec la version COURANTE. Le bouton orange « ↓ v5.0.1 » revenait donc proposer la
// version déjà installée. Un clic appelait `downloadUpdate()`, qui n'avait rien à prendre et
// échouait ; l'événement `error` posait alors « erreur », et c'est l'erreur qui se voyait.
//
// LES ÉVÉNEMENTS TRANCHENT, CE MODULE NE SERT QUE DE FILET. `update-available` et
// `update-not-available` disent juste, et ils portent en plus les notes de version, que l'ancien
// retour effaçait en les remplaçant par une chaîne vide. On ne s'en remet à `isUpdateAvailable`
// que lorsque la promesse a abouti sans qu'aucun événement ne soit passé.

/** L'état neutre, celui d'une application qui n'a encore rien demandé. */
function etatNeutre() {
  return { disponible: false, version: "", notes: "", progression: 0, statut: "" };
}

/** L'état d'une vérification en cours : il efface ce qu'une vérification précédente avait conclu. */
function etatVerification() {
  return { ...etatNeutre(), statut: "verification" };
}

/**
 * Ce qu'il faut conclure quand `checkForUpdates` a abouti sans qu'aucun événement n'ait tranché.
 *
 * `resultat.updateInfo` NE RÉPOND PAS À LA QUESTION : il décrit la dernière version publiée, et il
 * est rendu même quand c'est celle qui tourne déjà. Seul `isUpdateAvailable` la tranche.
 */
function etatApresVerification(resultat) {
  if (!resultat || !resultat.isUpdateAvailable) return { ...etatNeutre(), statut: "a-jour" };
  return {
    disponible: true,
    version: String(resultat.updateInfo?.version ?? ""),
    notes: String(resultat.updateInfo?.releaseNotes ?? ""),
    progression: 0,
    statut: "disponible",
  };
}

/**
 * L'état à poser après l'attente, événements compris.
 *
 * `courant` est ce que les écouteurs ont déjà posé. S'ils ont tranché, on les garde : ils savent
 * davantage que le retour de la promesse, et notamment les notes de version. S'ils n'ont rien dit
 * — la promesse a abouti, aucun événement n'est passé —, on conclut du résultat.
 */
function etatApresAttente(courant, resultat) {
  return courant && courant.statut !== "verification" && courant.statut !== ""
    ? courant
    : etatApresVerification(resultat);
}

module.exports = { etatNeutre, etatVerification, etatApresVerification, etatApresAttente };
