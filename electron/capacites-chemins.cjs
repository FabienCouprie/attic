// electron/capacites-chemins.cjs — Un chemin n'est valide que s'il vient d'un endroit declare.
//
// POURQUOI, ET C'EST LA DECISION DE FABIEN DU 2026-10-25. Le pont `fichier:ecrire` ecrivait a
// n'importe quel chemin, en creant les dossiers, sans une ligne de validation ; combine a
// `fichier:ouvrir-chemin`, « ecrire un script puis l'ouvrir » etait complet a partir d'un fichier
// recu. Et un noeud installe s'evalue dans le contexte principal de l'interface, ou `window.api`
// reste joignable — mesure, pas suppose : `src/core/node-essai.ts` le sonde, et
// `Function("return this")()` y rend l'objet global, ce qui rend tout masquage de noms illusoire.
//
// DEUX ROUTES EXISTAIENT. Isoler le noeud installe dans un Worker aurait oblige l'API des noeuds
// installes a devenir asynchrone — `ctx.entree(0)` est synchrone, une frontiere de Worker ne sert
// pas d'appel synchrone —, donc a CASSER LE CONTRAT du code tiers. Borner le pont protege quoi que
// le noeud atteigne, et ne change aucun contrat. C'est la route retenue.
//
// ═══ CE QUI FAIT UNE RACINE, ET POURQUOI CELLES-LA ═══
//
// UNE RACINE EST MINTEE PAR LE COTE PRIVILEGIE, jamais demandee par le rendu. Quatre sources :
//
//   · LE RETOUR D'UN DIALOGUE. Quand l'utilisateur a designe un fichier ou un dossier, il a donne
//     son accord a cet endroit-la. C'est la seule capacite que le rendu peut faire naitre, et il la
//     fait naitre en demandant un dialogue — pas en nommant un chemin.
//   · LES DOSSIERS DE L'APPLICATION, `userData` et LE DOSSIER DE TRAVAIL : ils sont a elle. Le
//     dossier de travail par defaut est choisi par le processus principal dans une liste de
//     candidats qu'il calcule lui-meme ; le rendu ne fait que le lui demander.
//   · ET CE QUE LE PROPRIETAIRE DECLARE, s'il le veut : la cle `racines` de `config.json`, ou
//     `ATTIC_RACINES` qui l'emporte.
//
// LE DOSSIER TEMPORAIRE N'EN EST PAS, et c'est delibere : aucune destination relevee n'y mene, et
// il est partage avec toutes les autres applications de la machine.
//
// CES SOURCES SONT DERIVEES D'UNE MESURE, et non supposees : le premier releve reel, celui de
// Fabien le 2026-10-25, portait UNE destination — `E:/attic/work/export.svg`, marquee HORS RACINE.
// C'est le dossier de travail du depot, l'endroit meme ou l'application est faite pour ecrire. La
// sanction rallumee sans cette racine aurait casse tous les exports.
//
// ═══ ET POURQUOI LES ACCORDS SURVIVENT A LA FERMETURE ═══
//
// UN DIALOGUE N'AUTORISE QUE LA SESSION OU IL S'EST OUVERT, et cela ne suffisait pas. Deux chemins
// mesures dans le code le montrent :
//
//   · `attic-repertoire` garde le dossier de travail CHOISI dans le stockage du rendu, et
//     `src/ui/App.tsx` ne redemande `dossier:travail-defaut` que s'il est vide. Au lancement
//     suivant, le dossier vient donc d'un reglage persiste, sans aucun dialogue.
//   · SIX ECRIVAINS prennent leur destination d'un parametre `type: "dossier"` pose sur le noeud —
//     rempli par un dialogue, puis ENREGISTRE DANS LE PROJET. Rouvrir le projet ne rouvre pas le
//     dialogue.
//
// Les accords sont donc ecrits par le cote privilegie, dans `userData`, et relus au lancement. Le
// rendu ne touche pas ce fichier et ne peut pas y ajouter une ligne : il n'obtient une racine qu'en
// faisant ouvrir un dialogue.
//
// CE QUE CELA COUTE, ET IL FAUT L'ASSUMER : un dossier designe une fois reste inscriptible
// ensuite. C'est pourquoi le nombre d'accords gardes est BORNE — au-dela, le plus ancien tombe.
//
// ═══ LA SANCTION EST ARMEE PAR DEFAUT DEPUIS LE 2026-10-27 ═══
//
// ELLE A ETE ETEINTE LE TEMPS D'UN RELEVE, et pour une raison mesuree : quinze fichiers ecrivent par
// ce pont, et refuser d'emblee aurait casse des fonctions EN SILENCE. Le silence etait le vrai
// danger, et c'est lui qui a ete leve avant d'armer :
//
//   · DIX ECRITURES IGNORAIENT LEUR REFUS, dont les deux sauvegardes de projet. Elles le disent
//     desormais — `ecrireOuLever` de `src/plugins/pont-electron.ts`, et un garde,
//     `src/docs/contrat-ecritures-refusees.test.ts`, refuse qu'une nouvelle le jette.
//   · UN PROJET OUVERT PAR DEPOT n'a pas de racine : Ctrl+S refuse, et ouvre alors le dialogue
//     d'enregistrement prerempli, qui accorde la racine d'un appui sur Entree.
//   · UN DOSSIER CHOISI AVANT CETTE VERSION — dossier de travail, « Dossier de sortie » d'un
//     projet — n'a pas de racine non plus, les accords n'etant memorises que depuis peu. Le refus
//     le dit en nommant le geste qui repare : choisir a nouveau le dossier par son bouton, dont le
//     dialogue accorde la racine. AUCUNE BOITE MODALE AU DEMARRAGE : elle bloquerait l'application,
//     et toute epreuve qui la lance sur un profil reel.
//
// `ATTIC_RACINES_STRICTES=0` eteint la sanction pour un diagnostic : hors racine, on inscrit au
// journal et l'on passe. Les racines manquantes se lisent alors par `npm run racines`.

const fs = require("node:fs");
const path = require("node:path");

/** Les racines autorisees, normalisees. Un ensemble, parce qu'un dialogue peut rendre deux fois la meme. */
const racines = new Set();

/**
 * Les racines ACCORDEES PAR UN DIALOGUE, dans l'ordre ou elles l'ont ete.
 *
 * Ce sont les seules qui survivent a la fermeture : les dossiers de l'application se recalculent a
 * chaque lancement, et les garder ici ferait tomber de vrais accords sous le plafond.
 *
 * UN ENSEMBLE GARDE SON ORDRE D'INSERTION en JavaScript, de sorte que le premier element est le
 * plus ancien accord — c'est lui qui tombe quand le plafond est atteint.
 */
const accordees = new Set();

/**
 * Combien d'accords survivent a la fermeture.
 *
 * IL Y A UN PLAFOND PARCE QU'UNE RACINE EST UNE CAPACITE PERMANENTE : un dossier designe une fois
 * resterait inscriptible des annees. Le borner ne rend pas la permanence agreable, mais il
 * l'empeche de croitre sans fin.
 */
const ACCORDS_GARDES = 64;

/** Ou les accords sont ecrits. `null` tant que le cote privilegie ne l'a pas dit. */
let fichierDesAccords = null;

/**
 * Un chemin comparable : `..` resolus, liens suivis, separateurs normalises, casse abaissee sous
 * Windows. `null` s'il ne se resout pas : il n'est alors sous aucune racine.
 *
 * LES QUATRE SONT NECESSAIRES, et chacune ferme un contournement.
 *
 *   · `path.resolve` resout les `..`, sans quoi `C:/permis/../interdit/x` passerait pour etre sous
 *     `C:/permis`. C'est le contournement le plus connu qui soit.
 *   · Les liens et les jonctions se suivent, sans quoi `C:/permis/lien/x` passerait pour etre sous
 *     `C:/permis` quand `lien` mene a `C:/interdit` : voir `resoudreLesLiens`.
 *   · Les separateurs se normalisent, sans quoi `C:\permis` et `C:/permis` seraient deux racines.
 *   · Et la casse s'abaisse SOUS WINDOWS SEULEMENT : `C:\Permis` et `c:\permis` y designent le meme
 *     dossier, alors que sous Linux ce sont deux dossiers differents. Abaisser partout rendrait la
 *     regle plus permissive qu'elle ne doit l'etre la ou elle ne le doit pas.
 */
function comparable(chemin) {
  const reel = resoudreLesLiens(path.resolve(String(chemin ?? "")));
  if (reel === null) return null;
  const resolu = reel.replace(/\\/g, "/");
  return process.platform === "win32" ? resolu.toLowerCase() : resolu;
}

/**
 * Le chemin tel que le disque le resout : chaque lien symbolique et chaque jonction suivis jusqu'a
 * ce qu'ils designent. `null` s'il ne se resout pas.
 *
 * POURQUOI, ET C'EST LA DECISION DE FABIEN DU 2026-11-19 (« Reparer d'abord »), avant d'ouvrir les
 * racines a `config.json`. `path.resolve` ne lit pas le disque : un lien pose DANS une racine, vers
 * un dossier qui n'en est pas une, passait pour etre dedans, et `fs` le suivait. Sous Linux comme
 * sous Windows, ou une jonction se pose sans aucun droit. Le chemin ET la racine sont donc compares
 * apres resolution : une racine qui est elle-meme un lien vaut pour ce qu'elle designe.
 *
 * UN CHEMIN QUI N'EXISTE PAS ENCORE — un fichier a ecrire, des dossiers a creer — se resout par son
 * plus proche parent existant, et la suite y est rattachee telle quelle : rien d'inexistant ne peut
 * etre un lien.
 *
 * UN LIEN PENDANT EST REFUSE, et c'est le piege de la regle precedente. Un lien dont la cible
 * n'existe pas ne se resout pas, et le traiter comme un nom inexistant le rattacherait a son dossier ;
 * or ecrire a travers lui CREE sa cible, au dehors. `lstat` le distingue d'un nom absent : il voit le
 * lien sans le suivre. Une boucle de liens, ou un parent illisible, est refuse de meme.
 */
function resoudreLesLiens(absolu) {
  const suite = [];
  let tete = absolu;
  for (;;) {
    try {
      const reel = fs.realpathSync.native(tete);
      return suite.length ? path.join(reel, ...suite.reverse()) : reel;
    } catch {
      if (fs.lstatSync(tete, { throwIfNoEntry: false })) return null;
      const parent = path.dirname(tete);
      if (parent === tete) return absolu;
      suite.push(path.basename(tete));
      tete = parent;
    }
  }
}

/** Declare une racine. Le dossier d'un fichier, ou le dossier lui-meme. */
function declarerRacine(chemin) {
  if (!chemin) return;
  const c = comparable(chemin);
  if (c !== null) racines.add(c);
}

/** Declare le DOSSIER du chemin donne : ce qu'un dialogue de sauvegarde rend est un fichier. */
function declarerRacineDuFichier(chemin) {
  if (!chemin) return;
  declarerRacine(path.dirname(String(chemin)));
}

/**
 * ACCORDE une racine : la declare, et la fait survivre a la fermeture.
 *
 * DEUX VERBES ET NON UN, parce que les deux sortes de racines n'ont pas la meme duree. Un dossier
 * de l'application se recalcule a chaque lancement et n'a rien a garder ; un dossier que
 * l'utilisateur a DESIGNE est un accord, et le lui redemander a chaque lancement reviendrait soit a
 * l'ennuyer, soit — c'est ce qui arriverait — a casser l'ouverture de ses projets en silence.
 */
function accorderRacine(chemin) {
  if (!chemin) return;
  declarerRacine(chemin);
  const c = comparable(chemin);
  if (c === null) return;
  // RETIRER AVANT D'AJOUTER remet l'accord en fin de file : sans cela, un dossier employe chaque
  // jour tomberait sous le plafond avant un dossier ouvert une seule fois.
  accordees.delete(c);
  accordees.add(c);
  while (accordees.size > ACCORDS_GARDES) accordees.delete(accordees.values().next().value);
  ecrireLesAccords();
}

/** Accorde le DOSSIER du chemin donne : ce qu'un dialogue de sauvegarde rend est un fichier. */
function accorderRacineDuFichier(chemin) {
  if (!chemin) return;
  accorderRacine(path.dirname(String(chemin)));
}

/**
 * Dit ou les accords vivent, relit ceux qui s'y trouvent, et les declare. Rend la liste relue.
 *
 * APPELE PAR LE COTE PRIVILEGIE, avec un chemin sous `userData`. Le rendu ne nomme pas ce fichier
 * et n'a aucun canal pour y ecrire : sans quoi il se fabriquerait des racines, ce que tout ce
 * module existe pour empecher.
 */
function memoriserLesAccords(fichier) {
  fichierDesAccords = fichier ? String(fichier) : null;
  if (!fichierDesAccords) return [];
  let lues = [];
  if (fs.existsSync(fichierDesAccords)) {
    try {
      const brut = JSON.parse(fs.readFileSync(fichierDesAccords, "utf8"));
      if (Array.isArray(brut)) lues = brut.filter((x) => typeof x === "string" && x.trim());
    } catch (e) {
      // UN FICHIER ABIME SE DIT. Il n'est pas dangereux — moins de racines donne plus de refus, et
      // non moins —, mais le taire ferait chercher la panne du cote du pont.
      console.error("[attic] accords de chemins illisibles :", e?.message || e);
    }
  }
  // LE PLAFOND S'APPLIQUE AUSSI A LA RELECTURE : un fichier edite a la main ne doit pas pouvoir
  // declarer mille racines d'un coup.
  for (const r of lues.slice(-ACCORDS_GARDES)) {
    const c = comparable(r);
    if (c === null) continue;
    racines.add(c);
    accordees.add(c);
  }
  return [...accordees];
}

function ecrireLesAccords() {
  if (!fichierDesAccords) return;
  try {
    fs.mkdirSync(path.dirname(fichierDesAccords), { recursive: true });
    fs.writeFileSync(fichierDesAccords, JSON.stringify([...accordees], null, 1));
  } catch (e) {
    console.error("[attic] accords de chemins non ecrits :", e?.message || e);
  }
}

/**
 * Les racines que le proprietaire declare lui-meme : la cle `racines` de `config.json`, ou
 * `ATTIC_RACINES` qui l'emporte, separee comme un PATH (piece C4 du fichier de configuration).
 *
 * LA LISTE VIENT DE `electron/configuration.cjs`, qui lit les deux, et non plus de l'environnement
 * lu ici : une seule lecture, une seule regle (des chemins absolus, sans quoi une racine se
 * resoudrait contre le dossier courant du lancement).
 *
 * ELLES NE SONT PAS PERSISTEES : le fichier et la variable sont deja des declarations explicites, et
 * les recopier dans les accords les rendrait permanentes apres les avoir retirees.
 */
function declarerRacinesDuProprietaire(liste) {
  const prises = [];
  for (const p of Array.isArray(liste) ? liste : []) {
    if (typeof p !== "string" || !p.trim()) continue;
    declarerRacine(p);
    const c = comparable(p);
    if (c !== null) prises.push(c);
  }
  return prises;
}

/** Les racines connues, pour qu'un message puisse les dire. */
function racinesConnues() {
  return [...racines].sort();
}

/**
 * Ce chemin est-il sous une racine declaree ?
 *
 * LE SEPARATEUR EST OBLIGATOIRE APRES LA RACINE, et c'est le piege du prefixe : sans lui,
 * `C:/ab/secret` passerait pour etre sous `C:/a`. Une racine ne contient que ce qui est DANS elle,
 * et elle-meme.
 */
function sousUneRacine(chemin) {
  const c = comparable(chemin);
  if (c === null) return false;
  for (const r of racines) {
    if (c === r) return true;
    if (c.startsWith(r.endsWith("/") ? r : `${r}/`)) return true;
  }
  return false;
}

/** La sanction est-elle armee ? Oui par defaut ; `ATTIC_RACINES_STRICTES=0` l'eteint pour un diagnostic. */
function racinesStrictes() {
  return process.env.ATTIC_RACINES_STRICTES !== "0";
}

/**
 * Le verdict sur un chemin : autorise, et s'il l'est par tolerance.
 *
 * TROIS ETATS ET NON DEUX, parce que « passe parce qu'on ne sanctionne pas encore » n'est pas
 * « passe parce qu'il est sous une racine ». Confondre les deux ferait croire le releve inutile.
 */
function verdictRacine(chemin) {
  if (sousUneRacine(chemin)) return { ok: true, sousRacine: true };
  if (racinesStrictes()) {
    return { ok: false, sousRacine: false,
      raison: "hors des racines declarees ; une racine naît d'un dialogue, pas d'un chemin nommé" };
  }
  return { ok: true, sousRacine: false };
}

/**
 * Pour les cas : repartir d'un ensemble vide.
 *
 * LE FICHIER DES ACCORDS EST OUBLIE LUI AUSSI, et il le faut : un cas qui aurait memorise un
 * fichier continuerait d'y ecrire pendant le cas suivant.
 */
function oublierLesRacines() {
  racines.clear();
  accordees.clear();
  fichierDesAccords = null;
}

module.exports = {
  comparable, declarerRacine, declarerRacineDuFichier, racinesConnues,
  accorderRacine, accorderRacineDuFichier, memoriserLesAccords, declarerRacinesDuProprietaire,
  sousUneRacine, racinesStrictes, verdictRacine, oublierLesRacines, ACCORDS_GARDES,
};
