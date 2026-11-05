"use strict";

// electron/dossier-ressources.cjs — Où vivent les modèles téléchargés, selon la plateforme.
//
// POURQUOI CE N'EST PLUS `userData` SOUS LINUX. `userData` y est `~/.config/attic`, et `~/.config`
// est, par convention XDG, le dossier des RÉGLAGES : des fichiers légers, qu'on sauvegarde en bloc
// et qu'on recopie d'une machine à l'autre. Les modèles pèsent des dizaines de gigaoctets (26 Go
// mesurés chez Fabien le 2026-11-05). Leur place est `$XDG_DATA_HOME`, `~/.local/share` par défaut.
// Sous Windows et macOS, rien ne change : `userData` y est déjà un dossier de données.
//
// LE DÉPLACEMENT EST UN RENOMMAGE, ET RIEN D'AUTRE. Les deux dossiers sont presque toujours sur le
// même système de fichiers, et un renommage y est instantané quelle que soit la taille. Quand ils
// ne le sont pas (`EXDEV`), on NE RECOPIE PAS : recopier 26 Go au lancement, sans l'avoir demandé,
// figerait l'application de longues minutes. On garde l'ancien dossier, qui fonctionne, et on le
// dit dans le journal.
//
// LES DEUX DOSSIERS PRÉSENTS : on prend le nouveau et l'on ne touche pas à l'ancien. Fusionner
// supposerait de décider, fichier par fichier, lequel est le bon ; l'inventaire retéléchargera ce
// qui manque, et l'ancien dossier reste là pour qui veut le récupérer à la main.

const fs = require("fs");
const path = require("path");

/**
 * Le dossier des ressources téléchargées, tel qu'il DEVRAIT être.
 *
 * `XDG_DATA_HOME` n'est retenu que s'il est absolu : la spécification XDG demande d'ignorer une
 * valeur relative, qui se résoudrait sinon contre le dossier courant du lancement.
 */
function dossierRessourcesVoulu({ plateforme, userData, home, env = {} }) {
  if (plateforme !== "linux") return path.join(userData, "ressources");
  const xdg = env.XDG_DATA_HOME;
  const donnees = xdg && path.isAbsolute(xdg) ? xdg : path.join(home, ".local", "share");
  return path.join(donnees, "attic", "ressources");
}

/**
 * Amène les ressources de l'ancien dossier au nouveau, une fois, et rend celui à utiliser.
 *
 * Rend `{ dossier, action, erreur? }`, `action` valant :
 *   · `"aucune"`     — rien à déplacer (même dossier, ou ancien absent) ;
 *   · `"deplace"`    — l'ancien a été renommé en le nouveau ;
 *   · `"deux"`       — les deux existent : le nouveau sert, l'ancien reste ;
 *   · `"conserve"`   — le renommage a échoué : l'ancien continue de servir.
 */
function migrerRessources(ancien, nouveau, { existe = fs.existsSync, renommer = fs.renameSync,
  creerDossier = (d) => fs.mkdirSync(d, { recursive: true }) } = {}) {
  if (path.resolve(ancien) === path.resolve(nouveau)) return { dossier: nouveau, action: "aucune" };
  if (!existe(ancien)) return { dossier: nouveau, action: "aucune" };
  if (existe(nouveau)) return { dossier: nouveau, action: "deux" };
  try {
    creerDossier(path.dirname(nouveau));
    renommer(ancien, nouveau);
    return { dossier: nouveau, action: "deplace" };
  } catch (err) {
    return { dossier: ancien, action: "conserve", erreur: err?.code ?? String(err) };
  }
}

module.exports = { dossierRessourcesVoulu, migrerRessources };
