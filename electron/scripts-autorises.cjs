// electron/scripts-autorises.cjs — Quel script Python ou Julia a le droit de s'executer.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-27 ═══
//
// « Le dernier chemin d'execution de code recu passe par Python et Julia. Le noeud .zip etant
// isole, un projet recu ne peut plus executer de code que par un script Python ou Julia. Ce script
// s'execute au premier Lancer, sans confirmation, avec tous les droits de l'utilisateur. »
//
// VRAI. Le script est le reglage « Code » du noeud, donc il voyage dans le fichier de projet, et
// `python:executer` l'executait tel qu'il arrivait.
//
// ═══ LA REGLE : UN SCRIPT S'AUTORISE PAR SON EMPREINTE, UNE FOIS ═══
//
// L'AUTORISATION PORTE SUR LE CONTENU, et non sur le noeud ni sur le projet : un noeud recu porte
// le script qu'il veut, et c'est ce script-la qu'on autorise. Modifier le script en change
// l'empreinte, donc retire l'autorisation -- c'est voulu.
//
// DEUX PORTES, ET SEULEMENT DEUX :
//
//   · LA PERSONNE LE LIT ET DIT OUI, dans une boite NATIVE posee par ce processus. Le script y est
//     montre, avec son nombre de lignes et son empreinte entiere.
//   · OU ELLE L'A ECRIT ICI, dans l'editeur de code du noeud. L'editeur le declare par
//     `scripts:ecrit-ici`, et le script s'inscrit sans question : on ne demande pas a quelqu'un s'il
//     accepte ce qu'il vient de taper. Un script arrive dans un fichier ne passe JAMAIS par
//     l'editeur, et c'est ce qui separe les deux.
//
// CE QUI REND LA SECONDE PORTE SURE : seul le code de l'application peut l'emprunter. Un noeud
// installe s'execute dans un cadre isole sans acces au pont, et un projet est de la donnee. Un
// script ecrit ailleurs que dans l'editeur -- dans le champ de l'inspecteur, par exemple -- passe
// simplement par la premiere porte.
//
// LA LISTE VIT ICI, sous `userData`, et le rendu n'a aucun canal pour y ecrire autre chose qu'une
// empreinte calculee par ce processus sur un texte qu'il a recu. Elle est BORNEE : au-dela, la plus
// ancienne tombe, et un script oublie se redemande.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** Combien d'empreintes on garde. Un script retouche cent fois en laisse cent ; la borne les absorbe. */
const EMPREINTES_GARDEES = 512;

/** Combien de lignes la boite montre. Au-dela, elle dit combien elle en tait. */
const LIGNES_MONTREES = 30;

const autorisees = new Set();
let fichier = null;

/** L'empreinte SHA-256 d'un script, en hexadecimal. */
function empreinteDuScript(code) {
  return crypto.createHash("sha256").update(String(code ?? ""), "utf8").digest("hex");
}

/** Dit ou la liste vit, et relit celle qui s'y trouve. Appele par le cote privilegie. */
function memoriserLesScripts(chemin) {
  fichier = chemin ? String(chemin) : null;
  autorisees.clear();
  if (!fichier || !fs.existsSync(fichier)) return 0;
  try {
    const brut = JSON.parse(fs.readFileSync(fichier, "utf8"));
    if (Array.isArray(brut)) {
      for (const h of brut.slice(-EMPREINTES_GARDEES)) {
        if (typeof h === "string" && /^[0-9a-f]{64}$/.test(h)) autorisees.add(h);
      }
    }
  } catch (e) {
    // UN FICHIER ABIME SE DIT, et il ne rend rien de plus dangereux : moins d'empreintes donne plus
    // de questions, et non moins.
    console.error("[attic] scripts autorises illisibles :", e?.message || e);
  }
  return autorisees.size;
}

function ecrire() {
  if (!fichier) return;
  try {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, JSON.stringify([...autorisees], null, 1));
  } catch (e) {
    console.error("[attic] scripts autorises non ecrits :", e?.message || e);
  }
}

/** Ce script a-t-il deja ete autorise ? */
function scriptAutorise(code) {
  return autorisees.has(empreinteDuScript(code));
}

/** Inscrit l'empreinte du script, la plus recente en dernier, et rend l'empreinte. */
function autoriserScript(code) {
  const h = empreinteDuScript(code);
  autorisees.delete(h);
  autorisees.add(h);
  while (autorisees.size > EMPREINTES_GARDEES) autorisees.delete(autorisees.values().next().value);
  ecrire();
  return h;
}

/**
 * Le texte de la question posee avant d'executer un script inconnu.
 *
 * LE SCRIPT EST MONTRE, et c'est tout l'objet : une autorisation donnee sans le lire serait le
 * consentement a l'aveugle que la revue reprochait au Gestionnaire de composants.
 */
function questionPourScript(langage, code, en) {
  const texte = String(code ?? "");
  const lignes = texte.split(/\r?\n/);
  const montrees = lignes.slice(0, LIGNES_MONTREES);
  const taites = lignes.length - montrees.length;
  const empreinte = empreinteDuScript(texte);
  const nomLangage = langage === "julia" ? "Julia" : "Python";
  const suite = taites > 0
    ? (en ? `\n[… ${taites} more line(s) not shown]` : `\n[… ${taites} ligne(s) de plus, non montrée(s)]`)
    : "";
  const entete = en ? [
    `This ${nomLangage} script was not written in this application, or has changed since it was last authorised.`,
    `It runs with your user rights: it can read, write and delete your files, and reach the network.`,
    `${lignes.length} line(s), SHA-256 ${empreinte}`,
    "",
  ] : [
    `Ce script ${nomLangage} n'a pas été écrit dans l'application, ou il a changé depuis sa dernière autorisation.`,
    `Il s'exécute avec vos droits d'utilisateur : il peut lire, écrire et supprimer vos fichiers, et joindre le réseau.`,
    `${lignes.length} ligne(s), SHA-256 ${empreinte}`,
    "",
  ];
  return {
    titre: en ? `Run a ${nomLangage} script` : `Exécuter un script ${nomLangage}`,
    message: en ? `Run this ${nomLangage} script?` : `Exécuter ce script ${nomLangage} ?`,
    detail: entete.join("\n") + montrees.join("\n") + suite,
    boutons: en ? ["Run", "Cancel"] : ["Exécuter", "Annuler"],
    empreinte,
  };
}

module.exports = {
  empreinteDuScript, memoriserLesScripts, scriptAutorise, autoriserScript, questionPourScript,
  EMPREINTES_GARDEES, LIGNES_MONTREES,
};
