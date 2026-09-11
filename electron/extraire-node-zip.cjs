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

// Un identifiant de nœud sert à construire un CHEMIN — celui du dossier
// d'installation — et il est lu dans le manifest.json d'un .zip reçu de
// quelqu'un d'autre. Sans ce filtre, « ../../Documents » faisait deux choses :
//
//   - à l'import, `path.join(home, ".attic", "nodes", id)` désignait un dossier
//     hors de l'arborescence des nœuds, que `mkdirSync` créait — et comme la
//     protection Zip Slip ci-dessous se mesure PAR RAPPORT à ce dossier, elle
//     validait sans broncher tout ce qu'on y écrivait. Le garde-fou était
//     relatif à une racine que l'attaquant choisissait ;
//   - à la suppression, `fs.rmSync(..., { recursive: true })` effaçait ce
//     dossier. Détruire, là où l'import se contentait d'écrire.
//
// D'où un filtre par LISTE BLANCHE et non par exclusion : on décrit ce qu'un
// identifiant a le droit d'être, plutôt que de tenter d'énumérer les formes
// d'évasion. Les 263 identifiants du catalogue le respectent, ainsi que ceux
// des nœuds installés (« couleur-suno-ia », « test-export »).
const MOTIF_IDENTIFIANT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LONGUEUR_MAX = 100;

/**
 * L'identifiant est-il utilisable comme unique segment de chemin ?
 *
 * Rejette notamment « . » et « .. », que le motif laisserait passer puisqu'ils
 * ne contiennent que des caractères autorisés — le premier caractère ne peut
 * être un point, ce qui les écarte, mais on le vérifie explicitement plutôt que
 * de le déduire d'une lecture attentive de l'expression régulière.
 */
function identifiantNodeValide(id) {
  if (typeof id !== "string") return false;
  if (id.length === 0 || id.length > LONGUEUR_MAX) return false;
  if (id === "." || id === "..") return false;
  return MOTIF_IDENTIFIANT.test(id);
}

/**
 * Dossier d'installation d'un nœud, ou `null` si l'identifiant est refusé.
 * Les deux appelants (import et suppression) passent par ici, de sorte qu'ils
 * ne peuvent pas diverger.
 */
function dossierNode(racineNodes, id) {
  if (!identifiantNodeValide(id)) return null;
  return path.join(racineNodes, id);
}

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

module.exports = { extraireEntrees, identifiantNodeValide, dossierNode, FICHIERS_TEXTE };
