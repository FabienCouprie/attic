// electron/sauvegarde-maj.cjs — Sauvegarde et restauration des données
// utilisateur autour d'une mise à jour.
//
// CE QUE CETTE SAUVEGARDE PROTÈGE
//
// Les méta-composants de l'utilisateur, son workflow en cours et ses nœuds
// installés (cf. BarreOutils.tsx, `majBackupDemande`). Du travail, pas des
// préférences.
//
// QUAND ELLE EST PRISE
//
// Juste avant qu'electron-updater installe une nouvelle version et relance
// l'application. C'est le pire moment possible pour une écriture : le process
// est sur le point d'être tué. Une écriture directe interrompue laisse un
// fichier tronqué.
//
// LES DEUX DÉFAUTS CORRIGÉS ICI
//
// 1. La restauration SUPPRIMAIT LE FICHIER AVANT DE L'ANALYSER :
//
//        const data = fs.readFileSync(dataPath, "utf-8");
//        fs.unlinkSync(dataPath);
//        event.returnValue = JSON.parse(data);
//
//    Sur un JSON corrompu, `JSON.parse` levait, le catch rendait `null` — et la
//    sauvegarde n'existait plus. L'échec de la restauration détruisait ce que la
//    sauvegarde protégeait, précisément dans le cas où elle aurait servi.
//
// 2. L'ÉCRITURE N'ÉTAIT PAS ATOMIQUE. `writeFileSync` tronque le fichier puis
//    écrit : interrompue, elle laisse un fichier partiel là où il y avait
//    peut-être une sauvegarde valide. On écrit donc à côté, puis on renomme —
//    `rename` est atomique sur un même volume, donc le fichier de destination
//    est soit l'ancien, soit le nouveau, jamais un mélange.
const fs = require("fs");

/** Fichier voisin où l'on écrit avant de renommer. */
const suffixeTemporaire = (chemin) => `${chemin}.tmp`;

/**
 * Écrit la sauvegarde de façon atomique.
 * @returns true si la sauvegarde est en place, false sinon
 */
function ecrireSauvegarde(chemin, donnees) {
  const temporaire = suffixeTemporaire(chemin);
  try {
    fs.writeFileSync(temporaire, JSON.stringify(donnees), "utf-8");
    // Le renommage est l'opération qui « publie » la sauvegarde. Avant lui,
    // l'ancien fichier est intact ; après, le nouveau est complet.
    fs.renameSync(temporaire, chemin);
    return true;
  } catch {
    // Ne pas laisser traîner un fichier temporaire partiel, qu'une reprise
    // pourrait prendre pour une sauvegarde.
    try { if (fs.existsSync(temporaire)) fs.unlinkSync(temporaire); } catch {}
    return false;
  }
}

/**
 * Lit la sauvegarde, et ne la supprime QUE si elle a pu être analysée.
 *
 * @returns { donnees, erreur } — `donnees` vaut null s'il n'y a rien à
 *          restaurer ou si le contenu est illisible ; dans ce dernier cas
 *          `erreur` est renseignée et LE FICHIER EST CONSERVÉ, pour qu'une
 *          récupération manuelle reste possible.
 */
function lireSauvegarde(chemin) {
  if (!fs.existsSync(chemin)) return { donnees: null, erreur: null };

  let brut;
  try {
    brut = fs.readFileSync(chemin, "utf-8");
  } catch (err) {
    return { donnees: null, erreur: `lecture impossible : ${err?.message || err}` };
  }

  let donnees;
  try {
    donnees = JSON.parse(brut);
  } catch (err) {
    // Le point de tout ce module : on sort SANS supprimer.
    return { donnees: null, erreur: `contenu illisible, sauvegarde conservée : ${err?.message || err}` };
  }

  // Analyse réussie : la sauvegarde a rempli son office, on peut l'effacer.
  // Un échec de suppression n'est pas un échec de restauration — les données
  // sont déjà entre les mains de l'appelant.
  try { fs.unlinkSync(chemin); } catch {}
  return { donnees, erreur: null };
}

module.exports = { ecrireSauvegarde, lireSauvegarde };
