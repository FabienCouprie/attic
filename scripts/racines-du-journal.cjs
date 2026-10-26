// scripts/racines-du-journal.cjs — Derive les racines autorisees du pont a partir du releve reel.
//
// POURQUOI CE SCRIPT, ET C'EST UNE DECISION DE FABIEN. Le modele de capacites dit qu'un chemin
// n'est valide que venu d'un dialogue ou d'un dossier declare. QUINZE fichiers ecrivent par le pont
// `fichier:ecrire`, et leurs chemins viennent de dossiers choisis — parfois dans une session
// anterieure, par un reglage persiste. Poser les racines a l'aveugle casserait des fonctions EN
// SILENCE, ce qui est la faute que ce depot paie le plus souvent.
//
// On les RELEVE donc, puis on les derive :
//
//   ATTIC_JOURNAL_CHEMINS=1 npm run electron       (puis on emploie l'application)
//   node scripts/racines-du-journal.cjs            (lit le journal, propose les racines)
//
// CE QU'IL REND, ET CE QU'IL NE REND PAS. Il propose des racines ; il ne les installe pas. Une
// racine deduite d'un parcours est une HYPOTHESE sur tous les parcours — c'est au proprietaire de
// dire laquelle est une regle. Le script le dit en toutes lettres dans sa sortie.
//
// ET IL DIT CE QU'IL N'A PAS VU : un journal ne couvre que ce qu'on a employe. Les composants qui
// n'ont pas tourne n'y figurent pas, et leurs destinations restent inconnues. Un releve qui
// tairait son incompletude ferait prendre une liste partielle pour une liste.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

/**
 * Ou le journal vit — CHERCHE, et non devine.
 *
 * MON PREMIER JET DEVINAIT `Roaming/attic`, ET C'ETAIT FAUX. `app.getPath("userData")` porte le nom
 * de l'application, et ce nom n'est pas le meme selon qu'on lance l'application EMPAQUETEE ou
 * `electron .` en developpement : le second s'appelle « Electron ». Les deux dossiers existent sur
 * la machine, et le script annoncait « aucun journal » en regardant le mauvais.
 *
 * C'est exactement la faute que ce depot punit : une convention supposee la ou une mesure etait a
 * portee. On balaye donc les dossiers de donnees et l'on dit lequel a parle.
 */
function baseDonnees() {
  return process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".config");
}

/** Tous les journaux trouves, du plus recemment ecrit au plus ancien. */
function journauxTrouves() {
  const base = baseDonnees();
  if (!fs.existsSync(base)) return [];
  const trouves = [];
  for (const nom of fs.readdirSync(base)) {
    const candidat = path.join(base, nom, "journal-chemins.jsonl");
    try {
      if (fs.existsSync(candidat)) trouves.push({ chemin: candidat, mtime: fs.statSync(candidat).mtimeMs });
    } catch { /* un dossier illisible n'est pas une erreur du releve */ }
  }
  return trouves.sort((a, b) => b.mtime - a.mtime).map((t) => t.chemin);
}

function lire(chemin) {
  if (!fs.existsSync(chemin)) return null;
  return fs.readFileSync(chemin, "utf8").split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

/**
 * Le dossier d'un chemin, separateurs normalises.
 *
 * ON NE REMONTE PAS PLUS HAUT QUE LE DOSSIER DU FICHIER. Agreger par prefixe commun donnerait une
 * racine plus courte, donc plus permissive, et une racine trop large n'est plus une capacite — sur
 * deux ecritures dans `C:\a\b` et `C:\c\d`, le prefixe commun est `C:\`.
 */
function dossierDe(chemin) {
  const n = String(chemin).replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i > 0 ? n.slice(0, i) : n;
}

/** Les dossiers releves, avec combien de fois chacun a servi et pour quoi. */
function racines(lignes) {
  const parDossier = new Map();
  for (const l of lignes) {
    const d = dossierDe(l.chemin);
    const vu = parDossier.get(d) ?? { dossier: d, ecrire: 0, ouvrir: 0, refuses: 0, hors: false, exemples: [] };
    if (l.quoi === "ecrire") vu.ecrire++; else vu.ouvrir++;
    if (l.accepte === false) vu.refuses++;
    // UN SEUL EVENEMENT HORS RACINE SUFFIT A MARQUER LE DOSSIER : c'est lui qu'il faudra declarer,
    // et le marquer sur la moyenne le ferait disparaitre derriere les evenements conformes.
    if (l.sousRacine === false) vu.hors = true;
    if (vu.exemples.length < 3) vu.exemples.push(path.basename(String(l.chemin)));
    parDossier.set(d, vu);
  }
  return [...parDossier.values()].sort((a, b) => (b.ecrire + b.ouvrir) - (a.ecrire + a.ouvrir));
}

const trouves = process.argv[2] ? [process.argv[2]] : journauxTrouves();
const chemin = trouves[0];
const lignes = chemin ? lire(chemin) : null;
if (!lignes) {
  console.log(`Aucun journal sous ${baseDonnees()}${path.sep}*${path.sep}journal-chemins.jsonl`);
  console.log("");
  console.log("Pour en produire un, lancer l'application avec le releve arme, puis l'employer :");
  console.log("");
  console.log("  npm run build          (une fois, si le build n'est pas a jour)");
  console.log("  npm run electron:journal");
  console.log("");
  console.log("CETTE ROUTE EST LA PLUS COURTE, ET C'EST UN CAS QUI LE PROUVE :");
  console.log("`tests-e2e/journal-chemins-arme.spec.ts` lance l'application avec le drapeau et");
  console.log("verifie que le fichier parait. Elle n'a ni serveur de developpement, ni `wait-on`,");
  console.log("ni port a partager — trois pieces mobiles dont aucune n'est necessaire au releve.");
  console.log("");
  console.log("`npm run dev:electron:journal` marche aussi, mais passe par le serveur de");
  console.log("developpement : un port deja occupe suffit a le faire echouer sans rien dire.");
  console.log("");
  console.log("ET N'ECRIVEZ PAS LA VARIABLE A LA MAIN : `ATTIC_JOURNAL_CHEMINS=1 npm run ...` ne");
  console.log("marche que sous un shell POSIX. Sous cmd ou PowerShell, elle n'est pas posee et le");
  console.log("releve ne s'arme pas en silence. Les scripts ci-dessus passent par `cross-env`.");
  console.log("");
  console.log("LE RELEVE NE COUVRE QUE CE QU'ON EMPLOIE : un composant qui n'a pas tourne n'y");
  console.log("figure pas, et sa destination reste inconnue.");
  process.exit(0);
}

// LES LIGNES D'ARMEMENT NE SONT PAS DES DESTINATIONS : elles disent seulement que le releve a
// demarre. Les compter parmi les evenements ferait annoncer « 1 evenement » sur un releve vide.
const armements = lignes.filter((l) => l.quoi === "arme").length;
// LES APPELS DE CANAUX SONT UN DIAGNOSTIC, non des destinations : ils disent quel canal du pont
// s'allume quand on agit dans l'application. Ils sont nes d'un echec — une liste de gestes deduite
// de la source, et un journal reste vide.
const canaux = lignes.filter((l) => l.quoi === "canal");
const evenements = lignes.filter((l) => l.quoi !== "arme" && l.quoi !== "canal");

console.log(`journal : ${chemin}`);
console.log(`releve ARME ${armements} fois — l'application a demarre ${armements} fois avec le drapeau.`);
if (canaux.length) {
  const parCanal = new Map();
  for (const c of canaux) parCanal.set(c.canal, (parCanal.get(c.canal) ?? 0) + 1);
  console.log("");
  console.log(`CANAUX DU PONT EMPLOYES — ${canaux.length} appel(s), ${parCanal.size} canal(aux) :`);
  for (const [canal, n] of [...parCanal.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} × ${canal}`);
  }
}
if (evenements.length === 0) {
  console.log("");
  console.log("AUCUNE DESTINATION RELEVEE POUR L'INSTANT.");
  if (canaux.length) {
    console.log("");
    console.log("MAIS DES CANAUX ONT ETE EMPLOYES, ci-dessus : le pont sert, et aucun des gestes");
    console.log("faits n'a passe par un canal qui ECRIT un fichier. La liste ci-dessus dit lesquels");
    console.log("ont servi — c'est elle qui apprend quel geste mene ou, et non une deduction faite");
    console.log("sur la source.");
  } else {
    console.log("");
    console.log("ET AUCUN CANAL DU PONT N'A ETE EMPLOYE. Deux causes possibles : les gestes faits ne");
    console.log("passent pas par le pont du tout, ou bien l'instance employee n'est pas celle qui a");
    console.log("ete lancee avec le drapeau. Les erreurs « Unable to move the cache » au demarrage");
    console.log("signalent justement qu'une AUTRE instance tient deja ce profil.");
  }
  process.exit(0);
}
if (trouves.length > 1) {
  // PLUSIEURS JOURNAUX SE DISENT, et le plus recent est pris : l'application empaquetee et
  // `electron .` en developpement n'ecrivent pas dans le meme dossier de donnees. Taire les autres
  // ferait lire un releve en croyant lire l'autre.
  console.log(`(${trouves.length - 1} autre(s) journal(aux) trouve(s), plus ancien(s) :`);
  for (const a of trouves.slice(1)) console.log(`   ${a}`);
  console.log(" — passer son chemin en argument pour le lire a la place.)");
}
console.log(`evenements : ${evenements.length} — ${evenements.filter((l) => l.quoi === "ecrire").length} ecriture(s),`
  + ` ${evenements.filter((l) => l.quoi === "ouvrir").length} ouverture(s),`
  + ` ${evenements.filter((l) => l.accepte === false).length} refus`);
console.log("");
const horsRacine = evenements.filter((l) => l.sousRacine === false).length;
if (horsRacine) {
  console.log(`HORS DES RACINES DECLAREES : ${horsRacine} evenement(s) — passes par TOLERANCE,`);
  console.log("la sanction etant eteinte le temps du releve. C'est exactement la liste a couvrir");
  console.log("avant de rallumer `ATTIC_RACINES_STRICTES=1`.");
  console.log("");
}
console.log("DOSSIERS RELEVES, du plus employe au moins employe :");
for (const r of racines(evenements)) {
  console.log(`  ${r.dossier}${r.hors ? "   ← HORS RACINE" : ""}`);
  console.log(`      ${r.ecrire} ecriture(s), ${r.ouvrir} ouverture(s)`
    + (r.refuses ? `, ${r.refuses} REFUSEE(S)` : "")
    + ` — ex. ${r.exemples.join(", ")}`);
}
console.log("");
console.log("CE QUE CECI N'EST PAS : une liste de racines a installer. Une racine deduite d'un");
console.log("parcours est une hypothese sur tous les parcours. Et ce releve ne couvre que ce qui a");
console.log("tourne : les composants qui n'ont pas servi n'y figurent pas.");
