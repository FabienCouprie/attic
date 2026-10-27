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
// ═══ L ANNULATION EST GROSSIERE, ET C EST ASSUME ═══
//
// `annulerLesTravaux` tue TOUT ce qui tourne, sans distinguer lequel. C est juste parce que
// l ordonnanceur SERIALISE les runs : il n y a au plus qu une famille de travaux en vol. Un canal
// par travail demanderait de porter un identifiant depuis le noeud jusqu au binaire, a travers
// onze composants, pour une distinction qui ne se presente pas. Le jour ou deux travaux
// tourneraient vraiment ensemble, c est ici que l identifiant se poserait.
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
const { spawn } = require("child_process");

/** Les enfants vivants. Un `Set` et non une liste : on n en retire jamais que par identite. */
const enCours = new Set();

/**
 * Lance un executable et rend sa sortie, en versant l avancement au fur et a mesure.
 *
 * L ENFANT EST INSCRIT TANT QU IL VIT, et retire a sa fin quelle qu elle soit -- fermeture,
 * erreur, ou mise a mort. Un registre qui garderait un mort ferait croire a un travail en cours.
 */
function lancerTravail(binaire, args, surLigne) {
  return new Promise((resoudre) => {
    const enfant = spawn(binaire, args, { windowsHide: true });
    enCours.add(enfant);
    let journal = "";
    let reste = "";
    const avaler = (donnees) => {
      journal += donnees;
      reste += donnees;
      const lignes = reste.split(/\r?\n/);
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
  enCours.add(enfant);
  return () => { enCours.delete(enfant); };
}

/**
 * Tue tout ce qui tourne, et rend combien.
 *
 * ON NE SE FIE PAS AU RETOUR DE `kill` : il dit qu un signal a ete POSTE, non que le processus est
 * mort. C est l evenement `close` qui retire l enfant du registre, et lui seul.
 */
function annulerLesTravaux() {
  let n = 0;
  for (const enfant of [...enCours]) {
    try { enfant.kill(); n += 1; } catch { /* deja mort : rien a faire */ }
  }
  return n;
}

/** Combien de travaux tournent. Pour les cas, et pour dire ce qu une annulation a touche. */
function travauxEnCours() {
  return enCours.size;
}

module.exports = { lancerTravail, inscrireTravail, annulerLesTravaux, travauxEnCours };
