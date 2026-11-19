"use strict";

// electron/affichage-linux.cjs — Sous Linux, X11 ou Wayland, choisi par `config.json`.
//
// POURQUOI CE MODULE. Pièce C6 du plan du fichier de configuration (2026-11-19). Electron 43 choisit
// lui-même entre X11 et Wayland ; le rendu de React Flow, les canevas et l'audio n'ont jamais été vus
// sous Wayland, et `BUILD-LINUX.md` §10.5 donne `--ozone-platform=x11` comme repli. La clé
// `affichage` de la section `linux` le rend écrivable sans toucher au lanceur : `auto` (le choix
// d'Electron, rien n'est posé), `x11` ou `wayland`.
//
// ═══ NON VÉRIFIÉ, ET IL FAUT LE DIRE ═══
//
// Aucune construction Linux n'existe. Que `--ozone-platform` posé par `app.commandLine.appendSwitch`,
// avant que l'application soit prête, soit encore entendu de Chromium est À ÉPROUVER : la plateforme
// d'affichage se choisit très tôt. S'il ne l'est pas, le journal dira pourtant l'option posée, et le
// repli reste de la passer au lanceur. Ce module est pur, et ses cas tiennent ce qui se tient ailleurs
// que sous Linux : quelle option pour quel choix, et rien sous Windows.

/** Les options de Chromium pour ce choix, sur ce système : des paires `[nom, valeur]`. */
function optionsDAffichage(affichage, systeme) {
  if (systeme !== "linux") return [];
  if (affichage === "x11" || affichage === "wayland") return [["ozone-platform", affichage]];
  return [];
}

/**
 * Pose les options sur la ligne de commande de Chromium, et rend celles qui ont été posées.
 *
 * UNE OPTION DÉJÀ DONNÉE AU LANCEMENT L'EMPORTE : qui écrit `--ozone-platform=x11` dans son lanceur
 * sait ce qu'il fait, et le fichier ne doit pas le contredire.
 */
function appliquerAffichage(ligneDeCommande, affichage, systeme) {
  const posees = [];
  for (const [nom, valeur] of optionsDAffichage(affichage, systeme)) {
    if (ligneDeCommande.hasSwitch(nom)) continue;
    ligneDeCommande.appendSwitch(nom, valeur);
    posees.push(`--${nom}=${valeur}`);
  }
  return posees;
}

module.exports = { optionsDAffichage, appliquerAffichage };
