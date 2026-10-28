// electron/travaux.cjs — Les travaux confies au processus principal, et de quoi les arreter.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-26 ═══
//
// « Les travaux confies au processus principal ne s arretent pas. Douze canaux de progression, un
// seul canal d annulation -- celui des telechargements de modeles --, et aucun `.kill(` dans
// electron/. Arreter ne stoppe pas une generation de plusieurs minutes : l ordonnanceur attend sa
// fin avant de lancer la demande suivante, et la carte graphique reste occupee. »
//
// VERIFIE, ET VRAI. `onProgress` leve depuis le 2026-10-26 apres un arret demande, ce qui arrete
// l EXECUTEUR ; mais le travail, lui, continuait dans son processus enfant, faute de quiconque
// pour le tuer.
//
// ═══ QUATRE SITES D ENGENDREMENT, ET NON DOUZE ═══
//
// Releve avant d ecrire, et recompte apres : les sept modules de la famille audio.cpp -- apollo,
// ced, chatterbox, parakeet, parole, qwen3-asr, roformer -- passaient tous par le MEME lanceur,
// recopie dans `muscriptor.cjs` et dans `acestep.cjs`. Fondu ici, il ne fait plus qu UN site, et
// avec songsee et les deux interpretes cela porte le total a QUATRE. Les trois `execSync` qui
// restent sont des sondes de version, bornees a trois secondes et synchrones : personne ne peut
// les tuer pendant qu elles tournent, puisqu elles tiennent le fil qui les appelle.
//
// ET LES DEUX PRINCIPAUX ETAIENT IDENTIQUES, recopies d un fichier a l autre : meme spawn, meme
// avalement de lignes, meme resolution. Les fondre ici n est pas une coquetterie -- c est ce qui
// empeche l inscription au registre de diverger entre deux copies, ce que ce depot a deja paye
// plusieurs fois.
//
// ═══ L ANNULATION VISE LA FENETRE QUI LA DEMANDE, ET NON TOUT CE QUI TOURNE ═══
//
// ELLE TUAIT TOUT, ET C ETAIT FAUX DES QU IL Y A DEUX FENETRES. Releve par une revue le
// 2026-10-27 : l ordonnanceur serialise les runs D UNE fenetre, mais le canal `nouvelle-fenetre`
// en ouvre une seconde, et toutes partagent ce processus principal. « Arreter » dans l une tuait
// la separation en cours dans l autre.
//
// LE PROPRIETAIRE EST LA FENETRE, ET C EST EXACTEMENT LE RUN. Dans une fenetre, l ordonnanceur ne
// fait tourner qu un run a la fois : viser la fenetre, c est viser le run qui tourne. Porter un
// identifiant de run depuis le noeud jusqu au binaire aurait traverse onze composants pour une
// distinction que la fenetre fait deja.
//
// IL VOYAGE SANS QU ON LE PASSE, par `AsyncLocalStorage`. `main.cjs` emballe `ipcMain.handle` une
// fois, avant tout gestionnaire, et chaque traitement s execute sous l identifiant de la fenetre
// qui l a appele (`event.sender.id`). Le contexte suit les promesses et les rappels jusqu au
// `spawn`, de sorte que ni `acestep.cjs`, ni `muscriptor.cjs`, ni les interpretes n ont a le
// connaitre. Un enfant engendre hors de tout gestionnaire n a pas de proprietaire, et seule une
// annulation sans proprietaire l atteint.
//
// ═══ ET L ARBRE ENTIER TOMBE, PAS SEULEMENT L ENFANT ═══
//
// Sous Windows, `kill()` termine le processus direct et lui seul : un script Python qui lance ses
// propres sous-processus les laissait vivre, la carte graphique avec. `taskkill /T /F` emporte
// l arbre. Ailleurs, `kill()` suffit au cas present, aucun lanceur ne passant par un shell.
//
// LE TELECHARGEMENT DES MODELES GARDE LE SIEN, `modeles:annuler`, qui n est pas un processus
// enfant mais un `AbortController` sur des requetes.
//
// ═══ QUI DEMANDE L ARRET, ET PAR OU ═══
//
// Le canal est `travail:annuler`, et c est `src/plugins/arret-des-travaux.ts` qui l emprunte,
// abonne au SIGNAL du noeud et non a son avancement : un travail muet pendant deux minutes
// n apprendrait jamais autrement qu on l arrete. Treize noeuds y viennent par le relais commun,
// trois -- songsee et les deux interpretes -- s y abonnent eux-memes, n ayant pas de canal
// d avancement. Deux gardes tiennent la chaine : `travaux-inscrits.test.ts` du cote du principal,
// `src/plugins/arret-des-travaux.test.ts` du cote du rendu.
const { spawn, execFile } = require("child_process");
const { AsyncLocalStorage } = require("async_hooks");

/** Les enfants vivants. Un `Set` et non une liste : on n en retire jamais que par identite. */
const enCours = new Set();

/** A quelle fenetre appartient chaque enfant vivant. Absent : engendre hors de tout gestionnaire. */
const proprietaires = new WeakMap();

/** La fenetre sous laquelle le code courant s execute. Voir l en-tete. */
const contexte = new AsyncLocalStorage();

/** Execute `fn` au nom de `proprietaire` : tout enfant qu elle engendre lui appartiendra. */
function avecProprietaire(proprietaire, fn) {
  return contexte.run(proprietaire, fn);
}

function inscrire(enfant) {
  enCours.add(enfant);
  const p = contexte.getStore();
  if (p !== undefined) proprietaires.set(enfant, p);
}

/** Cet enfant est-il vise par une annulation demandee au nom de `proprietaire` ? */
function vise(enfant, proprietaire) {
  return proprietaire === undefined || proprietaires.get(enfant) === proprietaire;
}

/** Tue l enfant et, sous Windows, tout ce qu il a engendre. */
function tuerArbre(enfant) {
  if (process.platform === "win32" && enfant.pid) {
    execFile("taskkill", ["/pid", String(enfant.pid), "/T", "/F"], { windowsHide: true }, (err) => {
      // UN REFUS DE TASKKILL NE LAISSE PAS L ENFANT VIVANT : on retombe sur `kill`, qui atteint au
      // moins le processus direct.
      if (err) { try { enfant.kill(); } catch { /* deja mort */ } }
    });
    return;
  }
  enfant.kill();
}

/**
 * Lance un executable et rend sa sortie, en versant l avancement au fur et a mesure.
 *
 * L ENFANT EST INSCRIT TANT QU IL VIT, et retire a sa fin quelle qu elle soit -- fermeture,
 * erreur, ou mise a mort. Un registre qui garderait un mort ferait croire a un travail en cours.
 *
 * `separateur` coupe le flot en lignes. Par defaut la fin de ligne ; stable-diffusion.cpp fait
 * avancer sa barre d etapes par retour chariot seul, et ses etapes n arriveraient qu a la fin.
 */
function lancerTravail(binaire, args, surLigne, { separateur = /\r?\n/ } = {}) {
  return new Promise((resoudre) => {
    const enfant = spawn(binaire, args, { windowsHide: true });
    inscrire(enfant);
    let journal = "";
    let reste = "";
    const avaler = (donnees) => {
      journal += donnees;
      reste += donnees;
      const lignes = reste.split(separateur);
      reste = lignes.pop() ?? "";
      for (const l of lignes) if (l.trim() && surLigne) surLigne(l.trim());
    };
    enfant.stdout.setEncoding("utf8");
    enfant.stderr.setEncoding("utf8");
    enfant.stdout.on("data", avaler);
    enfant.stderr.on("data", avaler);
    enfant.on("error", (e) => {
      enCours.delete(enfant);
      resoudre({ code: -1, journal: `${journal}\n${e.message}` });
    });
    enfant.on("close", (code) => {
      enCours.delete(enfant);
      resoudre({ code, journal });
    });
  });
}

/** Inscrit un enfant engendre ailleurs -- `execFile` en rend un aussi. Rend de quoi le retirer. */
function inscrireTravail(enfant) {
  if (!enfant) return () => {};
  inscrire(enfant);
  return () => { enCours.delete(enfant); };
}

/**
 * Tue ce qui tourne au nom de `proprietaire`, et rend combien. Sans proprietaire, tue tout.
 *
 * ON NE SE FIE PAS AU RETOUR DE `kill` : il dit qu un signal a ete POSTE, non que le processus est
 * mort. C est l evenement `close` qui retire l enfant du registre, et lui seul.
 */
function annulerLesTravaux(proprietaire) {
  let n = 0;
  for (const enfant of [...enCours]) {
    if (!vise(enfant, proprietaire)) continue;
    try { tuerArbre(enfant); n += 1; } catch { /* deja mort : rien a faire */ }
  }
  return n;
}

/** Combien de travaux tournent, au nom de `proprietaire` s il est donne. */
function travauxEnCours(proprietaire) {
  let n = 0;
  for (const enfant of enCours) if (vise(enfant, proprietaire)) n += 1;
  return n;
}

module.exports = { lancerTravail, inscrireTravail, annulerLesTravaux, travauxEnCours, avecProprietaire };
