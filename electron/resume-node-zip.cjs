// electron/resume-node-zip.cjs — Ce qu'on montre avant d'installer un composant recu.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-27 ═══
//
// « Le consentement se donne a l'aveugle. On choisit "Autoriser" avant d'avoir vu le fichier : le
// nom du composant, ses ports et son empreinte ne sont montres nulle part au moment de dire oui. »
//
// VRAI. Le reglage « Execution » du Gestionnaire disait l'INTENTION -- installer ce qu'on va
// choisir --, et le dialogue d'ouverture designait ensuite n'importe quel .zip. Rien entre les deux
// ne nommait ce qui allait s'installer.
//
// LA DEMANDE SE FAIT DU COTE PRIVILEGIE, et c'est ce qui la rend sure : le processus principal lit
// le manifeste AVANT D'EXTRAIRE une seule entree, et pose la question par une boite native. Une
// confirmation posee dans le rendu se contournerait par le rendu.
//
// L'EMPREINTE EST CELLE DU CODE, `executer.js`, et non de l'archive : deux .zip qui ne different que
// par leur date de compression portent le meme code, et c'est le code qu'on autorise. Elle se lit en
// entier pour qui veut la comparer a celle qu'un auteur publie ; l'abreger lui retirerait cet usage.
//
// CE MODULE EST PUR -- ni Electron, ni disque --, pour etre charge par un cas sous Node : main.cjs
// demarre Electron, et aucun cas ne peut le charger.
const crypto = require("crypto");

/** L'empreinte SHA-256 d'un texte, en hexadecimal. */
function empreinteDuCode(code) {
  return crypto.createHash("sha256").update(String(code ?? ""), "utf8").digest("hex");
}

/** Les noms d'une liste de ports ou de reglages, dans la langue demandee. */
function noms(liste, en) {
  if (!Array.isArray(liste) || liste.length === 0) return en ? "none" : "aucun";
  return liste.map((p) => String((en && p?.nomEn) || p?.nom || "?")).join(", ");
}

/**
 * Le texte de la question posee avant l'installation.
 *
 * TOUT CE QUI EST MONTRE VIENT DE L'ARCHIVE, et c'est dit : un manifeste peut porter le nom qu'il
 * veut. Seule l'empreinte ne se choisit pas, et c'est pourquoi elle figure en entier.
 */
function resumerManifeste(manifest, executerCode, en) {
  const m = manifest || {};
  const code = String(executerCode ?? "");
  const dependances = Array.isArray(m.dependencies) && m.dependencies.length
    ? m.dependencies.join(", ") : (en ? "none" : "aucune");
  const lignes = en ? [
    `Name: ${m.nomEn || m.nom} (${m.id})`,
    `Family: ${m.univers ?? "?"} / ${m.famille ?? "?"}`,
    `Inputs: ${noms(m.entrees, true)}`,
    `Outputs: ${noms(m.sorties, true)}`,
    `Settings: ${noms(m.parametres, true)}`,
    `Dependencies: ${dependances}`,
    `Code: ${code.length} characters, SHA-256 ${empreinteDuCode(code)}`,
    "",
    "Everything above is declared by the archive itself, except the fingerprint.",
    "The component's code runs in an isolated frame: it cannot read, write or delete files, and"
      + " reaches only the network addresses the application allows.",
  ] : [
    `Nom : ${m.nom} (${m.id})`,
    `Famille : ${m.univers ?? "?"} / ${m.famille ?? "?"}`,
    `Entrées : ${noms(m.entrees, false)}`,
    `Sorties : ${noms(m.sorties, false)}`,
    `Réglages : ${noms(m.parametres, false)}`,
    `Dépendances : ${dependances}`,
    `Code : ${code.length} caractères, SHA-256 ${empreinteDuCode(code)}`,
    "",
    "Tout ce qui précède est déclaré par l'archive elle-même, sauf l'empreinte.",
    "Le code du composant s'exécute dans un cadre isolé : il ne peut ni lire, ni écrire, ni"
      + " supprimer de fichier, et ne joint que les adresses réseau que l'application autorise.",
  ];
  return {
    titre: en ? "Install a received component" : "Installer un composant reçu",
    message: en ? `Install « ${m.nomEn || m.nom} »?` : `Installer « ${m.nom} » ?`,
    detail: lignes.join("\n"),
    boutons: en ? ["Install", "Cancel"] : ["Installer", "Annuler"],
    empreinte: empreinteDuCode(code),
  };
}

module.exports = { resumerManifeste, empreinteDuCode };
