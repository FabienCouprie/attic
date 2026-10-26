// electron/chemin-sur.cjs — Ce que `shell.openPath` a le droit de lancer.
//
// POURQUOI CETTE BARRIERE, ET LA CHAINE ETAIT COMPLETE. Releve le 2026-10-25 :
//
//   · `fichier:ecrire` ecrit a N'IMPORTE QUEL CHEMIN, en creant les dossiers, sans validation ;
//   · `fichier:ouvrir-chemin` appelle `shell.openPath`, qui sous Windows LANCE le fichier avec son
//     programme associe — donc execute un `.bat`, un `.cmd`, un `.exe`, un `.ps1` ;
//   · et un noeud installe s'evalue par `new Function` dans le contexte principal de l'interface,
//     ou `window.api` reste joignable. Le commentaire « Sans window » y etait faux : `new Function`
//     ne cree aucun bac a sable, seuls ses parametres sont masques.
//
// « Ecrire un script puis l'ouvrir » etait donc un enchainement complet, a partir d'un simple
// fichier recu. Cette barriere en coupe le dernier maillon.
//
// ═══ UNE LISTE D'AUTORISATION, ET C'EST UNE DECISION PRISE LE 2026-10-26 ═══
//
// CE FICHIER A PORTE UNE LISTE DE REFUS, et disait pourquoi : elle risquait moins de casser un
// usage legitime qu'on ne connaissait pas. Mais une liste de refus est une course perdue — il y
// manquait `.dll`, `.cpl`, `.msc` et `.chm`, releves par une revue, et personne ne peut jurer que
// la liste est complete. Une liste d'autorisation, elle, se verifie : ce qui n'y est pas est
// refuse, et un refus se lit.
//
// MESURE AVANT DE LA RESSERRER, et c'est ce qui la rend sans risque. `shell.openPath` n'a QU'UN
// SITE D'APPEL dans le pont, et TROIS appelants y menent — `vues-cartes.tsx` deux fois et
// `vues-images.tsx` une fois. Les trois passent un `htmlPath`, et les trois sources qui
// l'ecrivent — `carte-sonore.ts`, `coordonnees-sur-carte.ts`, `galerie-exposition.ts` — produisent
// toutes `${dossierSortie}/index.html`. L'autorisation est donc exactement `.html`.
//
// ELLE N'EST PAS GENEREUSE D'UN POUCE, et c'est voulu : `.htm` n'y est pas, parce que rien n'en
// produit. Le jour ou un besoin neuf se presentera, c'est le refus qui le dira — et l'elargir sera
// une ligne, apres la meme mesure.
//
// CE QUE CETTE BARRIERE NE FAIT PAS : fermer le point 1. Le pont garde `fichier:ecrire` sans bornes,
// un noeud installe garde l'acces a `window`, et un composant peut encore ecraser un identifiant
// natif. Il faut un modele de capacites, une isolation dans un Worker et une confirmation a la
// premiere execution d'un fichier recu. Cette barriere coupe la voie la plus directe, elle ne
// remplace pas ce travail.

/**
 * Les extensions qui s'EXECUTENT a l'ouverture, sous Windows surtout.
 *
 * `.lnk` en fait partie : un raccourci designe une cible arbitraire, donc l'ouvrir revient a lancer
 * ce qu'il veut. `.js`, `.jse`, `.vbs`, `.wsf` et `.hta` passent par le Windows Script Host. `.msi`
 * et `.msp` installent. `.reg` ecrit dans le registre.
 */
const EXECUTABLES = new Set([
  ".bat", ".cmd", ".com", ".exe", ".pif", ".scr", ".msi", ".msp", ".lnk", ".url",
  ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta", ".reg",
  ".jar", ".app", ".command", ".sh", ".csh", ".zsh", ".py", ".rb", ".pl", ".jl",
]);
// `.jl` MANQUAIT, et c'est un cas de ce fichier qui l'a dit : il exigeait qu'un script
// d'interpreteur puisse s'ecrire SANS pouvoir s'ouvrir, et Julia etait absent de la liste. Si
// l'extension est associee sur la machine, l'ouvrir execute le script.

/**
 * L'extension d'un chemin, en minuscules, point compris. Vide quand il n'y en a pas.
 *
 * ELLE SE LIT APRES LE DERNIER SEPARATEUR, sans quoi un dossier nomme `v1.2` ferait passer un
 * fichier sans extension pour un `.2`.
 */
function extensionDe(chemin) {
  const nom = String(chemin ?? "").split(/[/\\]/).pop() ?? "";
  const i = nom.lastIndexOf(".");
  return i > 0 ? nom.slice(i).toLowerCase() : "";
}

/**
 * Ce que `shell.openPath` a le droit d'ouvrir. Tout le reste est refuse.
 *
 * UN SEUL ELEMENT, ET C'EST MESURE : les trois appelants du pont ouvrent un `index.html` que
 * l'application vient d'ecrire. Y ajouter une extension demande la meme mesure, pas une intuition.
 */
const OUVRABLES = new Set([".html"]);

/**
 * Ce chemin peut-il etre ouvert par le systeme ?
 *
 * REND LA RAISON ET NON UN SEUL BOOLEEN : un refus muet enverrait chercher la panne ailleurs, et
 * c'est exactement ce que ce depot reproche a ses propres messages d'erreur. Le refus NOMME ce qui
 * est permis, pour que celui qui le lit sache quoi faire.
 */
function ouvertureAutorisee(chemin) {
  const texte = String(chemin ?? "");
  if (!texte.trim()) return { ok: false, raison: "chemin vide" };
  // UN NOM AVEC DES ESPACES DE FIN PASSE POUR AUTRE CHOSE SOUS WINDOWS : « x.bat » et « x.bat »
  // suivi d'un espace designent le meme fichier, et l'extension lue naivement differe.
  const ext = extensionDe(texte.replace(/[\s.]+$/, ""));
  if (!OUVRABLES.has(ext)) {
    const dit = ext || "sans extension";
    return { ok: false, raison: `ouvrir un « ${dit} » n'est pas prevu : seuls ${[...OUVRABLES].join(", ")} le sont` };
  }
  return { ok: true };
}

/**
 * Ce que le pont n'a pas le droit d'ECRIRE, et c'est le premier maillon de la chaine.
 *
 * REFUSER L'OUVERTURE NE SUFFISAIT PAS : un fichier hostile peut deja etre la, ou etre lance
 * autrement — un raccourci depose dans le dossier de demarrage de Windows s'execute a la session
 * suivante sans que personne ne l'ouvre. Interdire l'ECRITURE coupe donc plus haut.
 *
 * LA LISTE N'EST PAS CELLE DE L'OUVERTURE, et la difference est mesuree. `python-processor` et
 * `julia-processor` materialisent de vrais scripts, et les lancent par un interpreteur declare —
 * jamais par `shell.openPath`. Un `.py` doit donc pouvoir s'ECRIRE alors qu'il ne doit pas
 * s'OUVRIR. Releve avant d'ecrire la regle : sur les quinze fichiers qui ecrivent par le pont,
 * AUCUN ne produit une extension executable de Windows.
 */
const INTERPRETES = new Set([".py", ".jl", ".rb", ".pl", ".sh", ".csh", ".zsh", ".command", ".app", ".jar"]);

/**
 * Ce chemin peut-il etre ecrit par le pont ?
 *
 * REND LA RAISON, pour la meme raison que l'ouverture : un refus muet enverrait chercher la panne
 * ailleurs, et c'est exactement ce que ce depot reproche a ses propres messages d'erreur.
 */
function ecritureAutorisee(chemin) {
  const texte = String(chemin ?? "");
  if (!texte.trim()) return { ok: false, raison: "chemin vide" };
  const ext = extensionDe(texte.replace(/[\s.]+$/, ""));
  if (EXECUTABLES.has(ext) && !INTERPRETES.has(ext)) {
    return { ok: false, raison: `ecrire un « ${ext} » deposerait un programme executable` };
  }
  return { ok: true };
}

// ═══ LE RELEVE DES DESTINATIONS REELLES ═══
//
// POURQUOI IL EXISTE, ET C'EST UNE DECISION DE FABIEN. Le modele de capacites du pont dit qu'un
// chemin n'est valide que venu d'un dialogue ou d'un dossier declare. Mesure avant d'y toucher :
// QUINZE fichiers ecrivent par ce pont, et leurs chemins viennent de dossiers choisis — parfois
// dans une session anterieure, par un reglage persiste. Poser les racines autorisees a l'aveugle
// casserait des fonctions EN SILENCE, ce qui est exactement la faute que ce depot paie le plus.
//
// Plutot que de deviner la liste, on la RELEVE : chaque ecriture et chaque ouverture s'inscrivent
// dans un journal, et les racines se derivent de ce qui a vraiment ete employe.
//
// IL NE TOURNE QUE SI ON LE DEMANDE, par `ATTIC_JOURNAL_CHEMINS=1`. Un journal sur chaque ecriture
// serait un cout permanent pour une mesure ponctuelle, et une ligne de plus a ecrire sur le disque
// de quelqu'un qui ne l'a pas demandee.
//
// IL N'EST PAS UNE BARRIERE : il observe. Les deux refus ci-dessus, eux, s'appliquent toujours.

const fsJournal = require("fs");
const pathJournal = require("path");

/** Ou le journal s'ecrit. Resolu une fois, pour qu'un relevé ne se disperse pas. */
let cheminJournal = null;

/**
 * Arme le journal, ou ne fait rien si on ne l'a pas demandé.
 *
 * `dossier` est celui des donnees de l'application : c'est `app.getPath("userData")` que `main.cjs`
 * passe, parce que ce module ne connait pas Electron et ne doit pas le connaitre — il est teste
 * sous node.
 */
function armerJournal(dossier) {
  if (process.env.ATTIC_JOURNAL_CHEMINS !== "1") return null;
  cheminJournal = pathJournal.join(dossier, "journal-chemins.jsonl");
  // UNE LIGNE D'ARMEMENT, ECRITE TOUT DE SUITE, et c'est le signal OBSERVABLE.
  //
  // MON PREMIER JET NE SIGNALAIT L'ARMEMENT QUE PAR UN `console.log`, et c'etait un mauvais signal
  // sous Windows : la sortie du processus PRINCIPAL d'Electron n'y apparait pas dans le terminal qui
  // l'a lance, sauf avec `ELECTRON_ENABLE_LOGGING=1`. On pouvait donc armer le releve, ne rien voir,
  // et conclure qu'il ne tournait pas.
  //
  // Le fichier, lui, s'observe partout et sans drapeau : il existe des que l'application demarre
  // avec le releve, meme si aucune destination n'a encore servi.
  try {
    // LE DOSSIER SE CREE, et un premier jet se contentait de CALCULER son nom sans rien en faire —
    // une ligne morte la ou il fallait un `mkdirSync`. Si le dossier de donnees n'existe pas encore,
    // `appendFileSync` leve, le `catch` l'avale, et le releve ne s'arme pas EN SILENCE.
    fsJournal.mkdirSync(pathJournal.dirname(cheminJournal), { recursive: true });
    fsJournal.appendFileSync(cheminJournal,
      `${JSON.stringify({ t: new Date().toISOString(), quoi: "arme" })}\n`);
  } catch { /* un journal muet vaut mieux qu'un demarrage casse */ }
  return cheminJournal;
}

/**
 * Inscrit une destination, si le journal est arme.
 *
 * UNE LIGNE PAR EVENEMENT, EN JSONL, parce qu'un relevé qui se relit en cours de route ne doit pas
 * dependre d'une fermeture propre : l'application peut etre tuee, et les lignes deja ecrites
 * restent lisibles. Un tableau JSON exigerait un crochet de fin que personne n'ecrirait.
 *
 * ET UN ECHEC D'ECRITURE NE REMONTE PAS : un journal d'observation qui ferait tomber une ecriture
 * legitime serait pire que pas de journal.
 */
function inscrireChemin(quoi, chemin, accepte, sousRacine) {
  if (!cheminJournal) return;
  try {
    // `sousRacine` EST LE CHAMP QUI SERT, et il est distinct d'`accepte` : pendant le relevé, un
    // chemin hors racine est accepté par tolérance. Confondre les deux ferait croire que toutes les
    // destinations sont déjà couvertes, et le relevé ne dirait plus rien.
    const ligne = JSON.stringify({
      t: new Date().toISOString(), quoi, chemin: String(chemin ?? ""), accepte,
      ...(sousRacine === undefined ? {} : { sousRacine }),
    });
    fsJournal.appendFileSync(cheminJournal, `${ligne}\n`);
  } catch { /* un journal muet vaut mieux qu'une ecriture perdue */ }
}

/**
 * Inscrit un APPEL DE CANAL, quel qu'il soit — l'instrument de diagnostic.
 *
 * POURQUOI IL EXISTE, ET C'EST UN ECHEC QUI L'A FAIT NAITRE. J'ai donne a Fabien une liste de
 * gestes censes passer par les canaux de fichier, DEDUITE des fichiers qui nomment le pont dans
 * leur source. Il les a faits, et le journal est reste vide. Ma liste etait donc une INFERENCE, et
 * elle etait fausse : savoir qu'un module mentionne `api.ecrireFichier` ne dit pas quel geste
 * l'appelle, ni meme s'il est appele.
 *
 * Plutot que de proposer une quatrieme liste, on releve TOUS les canaux. Le journal dit alors ce
 * qui s'allume vraiment, et la question ne se pose plus.
 *
 * IL NE TOURNE QUE SOUS LE MEME DRAPEAU, et il n'est pas une barriere : il observe.
 */
function inscrireCanal(canal) {
  if (!cheminJournal) return;
  try {
    fsJournal.appendFileSync(cheminJournal,
      `${JSON.stringify({ t: new Date().toISOString(), quoi: "canal", canal: String(canal) })}\n`);
  } catch { /* un journal muet vaut mieux qu'un appel perdu */ }
}

module.exports = {
  EXECUTABLES, INTERPRETES, extensionDe, ouvertureAutorisee, ecritureAutorisee,
  armerJournal, inscrireChemin, inscrireCanal,
};
