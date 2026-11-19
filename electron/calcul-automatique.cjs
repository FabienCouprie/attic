"use strict";

// electron/calcul-automatique.cjs — Ce que « Automatique » veut dire sur cette machine.
//
// POURQUOI CE MODULE. Pièce C5 du plan du fichier de configuration (2026-11-19). La clé `calcul` de
// `config.json` vaut `auto`, `processeur` ou `carte`. Fabien a choisi, entre trois, qu'elle règle LE
// SENS D'« AUTOMATIQUE » et non le défaut des nœuds posés : un nœud garde « Automatique » dans son
// graphe, et c'est la machine qui dit ce que cela veut dire. Aucun graphe enregistré ne change, et
// un choix explicite dans un nœud l'emporte toujours.
//
// DEUX VOCABULAIRES, et chacun a sa traduction (`src/plugins/parametre-calcul.ts`) :
//   — LES BINAIRES DU PONT (audio.cpp, acestep.cpp, stable-diffusion.cpp) : « Automatique » est la
//     chaîne vide, le moteur choisit. `processeur` y met `CPU`. `carte` y LAISSE LE MOTEUR CHOISIR :
//     le numéro de la carte discrète dépend de la machine (`Vulkan0` est le circuit intégré sur celle
//     de développement), et un numéro deviné enverrait le calcul sur le mauvais circuit ;
//   — DIRECTML (onnxruntime-node) : « Automatique » est `auto`, la carte puis le processeur.
//     `processeur` y met `processeur`, `carte` y met `carte`, qui ne replie pas. SOUS LINUX, DirectML
//     n'existe pas : `carte` y est sans effet, et `main.cjs` le dit dans le journal.
//
// UN ÉTAT DE MODULE, posé une fois par `main.cjs` après la lecture de la configuration : les quinze
// sites qui traduisent un réglage de nœud le consultent quand le nœud ne choisit rien.

let preference = "auto";
let systeme = null;

/** Pose la préférence lue dans `config.json`. Une valeur inconnue vaut `auto`. */
function poserCalculAutomatique(valeur, sys) {
  preference = ["auto", "processeur", "carte"].includes(valeur) ? valeur : "auto";
  systeme = sys ?? null;
}

/** Le périphérique d'un binaire du pont pour « Automatique » : `""` (le moteur choisit) ou `"CPU"`. */
function automatiquePont() {
  return preference === "processeur" ? "CPU" : "";
}

/** Le fournisseur DirectML pour « Automatique » : `auto`, `processeur`, ou `carte` sous Windows seulement. */
function automatiqueDirectML() {
  if (preference === "processeur") return "processeur";
  if (preference === "carte" && systeme === "windows") return "carte";
  return "auto";
}

/** Le réglage « Calcul » d'un nœud du pont, « Automatique » (la chaîne vide) traduit pour cette machine. */
const calculDuPont = (reglage) => reglage || automatiquePont();

/** Le réglage « Calcul » d'un nœud DirectML, « Automatique » (`auto` ou rien) traduit pour cette machine. */
const fournisseurDirectML = (reglage) => (!reglage || reglage === "auto" ? automatiqueDirectML() : reglage);

/** La préférence, pour le journal et les épreuves. */
const calculAutomatique = () => ({ preference, systeme, pont: automatiquePont(), directML: automatiqueDirectML() });

module.exports = { poserCalculAutomatique, automatiquePont, automatiqueDirectML, calculDuPont, fournisseurDirectML, calculAutomatique };
