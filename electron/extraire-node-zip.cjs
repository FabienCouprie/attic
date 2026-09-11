// electron/extraire-node-zip.cjs — Extraction d'un node .zip vers son dossier
// d'installation.
//
// Sorti de main.cjs pour UNE raison précise : ce code s'exécute dans le process
// principal d'Electron, donc il n'était couvert par aucun test, et il contenait
// une référence à une variable inexistante (`resolvedTargetPath`) qui levait une
// ReferenceError dès la première entrée. Le try/catch du gestionnaire IPC
// l'avalait et rendait `{ ok: false }` : l'import de nœud, pourtant documenté
// dans le README, ne pouvait pas fonctionner dans l'application packagée.
//
// La protection contre le Zip Slip vit ici aussi, et c'est le second motif de
// l'extraction : elle défend contre une attaque réelle — un `.zip` de nœud est
// un fichier qu'on reçoit de quelqu'un d'autre — et elle n'avait jamais été
// vérifiée.
//
// À NOTER sur adm-zip : on n'appelle JAMAIS `extractAllTo` ni `extractEntryTo`.
// C'est cette API-là que vise l'avis de sécurité GHSA sur le suivi des liens
// symboliques à l'extraction, et pour laquelle aucun correctif n'existe (0.6.0
// est la dernière version publiée). Ici, chaque entrée est lue puis écrite
// nous-mêmes, après validation du chemin — la bibliothèque ne décide d'aucune
// destination.
const fs = require("fs");
const path = require("path");

/** Fichiers texte dont le contenu est renvoyé à l'appelant. */
const FICHIERS_TEXTE = ["manifest.json", "executer.js", "notice.json", "dependencies.json"];

/**
 * Écrit les entrées du zip dans `nodesDir`, en refusant celles qui en
 * sortiraient.
 *
 * @param entries entrées adm-zip (`zip.getEntries()`)
 * @param nodesDir dossier d'installation du nœud
 * @returns { fichiers, ignorees } — contenu des fichiers texte, et noms des
 *          entrées écartées par la protection Zip Slip
 */
function extraireEntrees(entries, nodesDir) {
  const fichiers = {};
  const ignorees = [];
  const resolvedNodesDir = path.resolve(nodesDir);

  for (const entry of entries) {
    const entryName = entry.entryName;
    if (entry.isDirectory) continue;

    // Zip Slip : une entrée nommée « ../../.bashrc » se résout hors du dossier
    // d'installation. On compare le chemin RÉSOLU, seul moyen fiable — filtrer
    // la chaîne « .. » laisserait passer les formes encodées ou mixtes.
    const targetPath = path.resolve(nodesDir, entryName);
    const relativePath = path.relative(resolvedNodesDir, targetPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      ignorees.push(entryName);
      continue;
    }

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const entryData = entry.getData();
    fs.writeFileSync(targetPath, entryData);

    if (FICHIERS_TEXTE.includes(entryName)) {
      fichiers[entryName] = entryData.toString("utf-8");
    }
  }

  return { fichiers, ignorees };
}

module.exports = { extraireEntrees, FICHIERS_TEXTE };
