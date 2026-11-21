#!/usr/bin/env node
// scripts/contrat-arbre.mjs : refuser d'ouvrir un arbre git hors des dossiers de la session.
//
// POURQUOI CE SCRIPT EXISTE. Le 2026-11-17, la session des pièces P0 et P2 du plan de l'architecture
// par messages a ouvert l'arbre de P2 dans `E:\attic-p2-instantane`, hors des dossiers de la
// session. L'application a alors demandé à Fabien d'approuver chaque écriture et chaque commande
// faites là-bas, et elle a ajouté le dossier à la session. Ce coût ne se voit pas du côté de la
// session : il a duré toute une série de commandes avant que Fabien ne demande « Pourquoi me
// demandes-tu plus d'autorisation qu'avant ? », puis ne pose la règle : « cela ne doit plus arriver
// sauf exception justifiée. A contractualiser ».
//
// LA LECTURE QUI L'A CAUSÉE. Le plan des messages demandait de voir les gardes rouges « hors de
// E:\attic ». Cela voulait dire hors du checkout principal, que plusieurs sessions partagent, et non
// hors des dossiers de la session : un arbre sous `.claude/worktrees/` est à la fois hors du
// checkout principal et dans les dossiers de session.
//
// CE N'ÉTAIT PAS LA PREMIÈRE FOIS. Le même jour, `git worktree list` inscrit encore dix-sept arbres
// hors de ces dossiers, de `E:/attic-a6-naissances` à `E:/attic-verif-pilote`.
//
// LES DEUX DOSSIERS DE LA SESSION. Le dossier des arbres de session du dépôt, `.claude/worktrees/`,
// où l'application ouvre l'arbre de chaque session ; et le bac à sable, le dossier temporaire propre
// à la session (`…/<identifiant de la session>/scratchpad`), où rien ne demande d'approbation. Le
// premier se lit sous le checkout PRINCIPAL, que `git rev-parse --git-common-dir` désigne : depuis
// un arbre de session, `--show-toplevel` rend l'arbre lui-même, et son voisin sous
// `.claude/worktrees/`, l'arbre d'une autre session, passe alors pour un dossier étranger. Vu en
// plantant cette lecture-là : le cas de la session voisine tombe dans le test.
//
// LES CHEMINS SE COMPARENT SOUS LEUR FORME RÉELLE. git rend le chemin que le système lui donne,
// noms courts dépliés et jonctions suivies, et la commande se lit depuis le dossier tel que la
// charge l'écrit. Sur la PR 416, la CI Windows a refusé trois arbres légitimes : son `TEMP` vaut
// `C:\Users\RUNNER~1\…`, un nom court 8.3, et git rendait `runneradmin`. Chaque côté passe donc par
// `realpathSync.native`, sur son plus long ancêtre qui existe, l'arbre à ouvrir n'existant pas encore.
//
// L'EXCEPTION CONNUE. Le 2026-11-08, `npm ci` a échoué en EBUSY dans un arbre de session : le
// processus Node de l'application Claude tenait `node_modules/electron/dist/resources/default_app.asar`,
// et rien ne le libère tant qu'elle tourne. La vérification se fait alors dans un arbre détaché hors
// des dossiers de session. Une exception se dit d'abord à Fabien, puis se déclare sur la commande
// même, par un commentaire `# exception-arbre: <raison>` que Bash et PowerShell ignorent tous deux.
//
// CE QU'IL TIENT, ET CE QU'IL NE TIENT PAS. Il refuse `git worktree add` vers un chemin hors de ces
// deux dossiers, lu comme git le lirait : relatif au dossier de la commande après ses `cd` et ses
// `-C`, sous la forme `/e/…` de Git Bash comme sous `E:\…`, les variables d'environnement dépliées.
// Un chemin qu'il ne sait pas lire, une substitution ou une variable inconnue, est refusé : le
// laisser passer ouvrirait une porte à toute commande qu'il ne comprend pas. Il ne voit ni
// `git clone` vers un dossier étranger, ni `git worktree move`, ni une écriture faite hors de la
// session par un autre chemin : la règle les couvre quand même, et l'application les fait déjà
// payer d'une approbation.
//
// Branché en `PreToolUse` : refuser AVANT est tout l'objet. Après, l'arbre existe, et chaque geste
// qui suit coûte une approbation.
//
// Code de sortie 2 : la commande est bloquée et le texte de stderr est rendu à l'agent. Toute erreur
// interne sort en 0 : un garde-fou qui casse la session ne garde plus rien.

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import chemins from "node:path";
import { fileURLToPath } from "node:url";

const WINDOWS = process.platform === "win32";
const P = WINDOWS ? chemins.win32 : chemins.posix;

/** L'exception déclarée : un commentaire, et une raison écrite sur la même ligne. */
const EXCEPTION = /#\s*exception-arbre\s*:[ \t]*\S/i;

const EST_GIT = /^(?:.*[\\/])?git(?:\.exe)?$/i;
const EST_SHELL = /^(?:.*[\\/])?(?:bash|sh|zsh|dash|cmd|powershell|pwsh)(?:\.exe)?$/i;
const DRAPEAU_DE_CODE = /^(?:-[a-z]*c|\/c|\/k|-command)$/i;
const AFFECTATION = /^[A-Za-z_]\w*=/;
const CHANGE_DE_DOSSIER = new Set(["cd", "chdir", "pushd", "set-location", "sl"]);
const OPTIONS_DE_GIT_A_VALEUR = new Set(["-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env"]);

/**
 * Les commandes simples d'une ligne de shell, chacune en liste de mots, guillemets retirés.
 *
 * LES CORPS DE HEREDOC ET LES CHAÎNES MULTILIGNES DE POWERSHELL SONT RETIRÉS D'ABORD : un message de
 * commit qui cite `git worktree add` sur une ligne à lui serait sinon lu comme une commande, et ce
 * dépôt écrit ses messages de commit de cette façon.
 */
export function commandesSimples(ligne) {
  const texte = ligne
    .replace(/<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\r?\n|$)/g, " $3")
    .replace(/@(['"])[ \t]*\r?\n[\s\S]*?\r?\n\1@/g, '""')
    // Une ligne continuée, par `\` en Bash et par un accent grave en PowerShell, reste une ligne.
    .replace(/[\\`]\r?\n/g, " ");
  const commandes = [[]];
  let mot = null;
  const poser = () => {
    if (mot !== null) commandes[commandes.length - 1].push(mot);
    mot = null;
  };
  const couper = () => {
    poser();
    if (commandes[commandes.length - 1].length > 0) commandes.push([]);
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === "'") {
      const fin = texte.indexOf("'", i + 1);
      const j = fin < 0 ? texte.length : fin;
      mot = (mot ?? "") + texte.slice(i + 1, j);
      i = j;
    } else if (c === '"') {
      let lu = "";
      let j = i + 1;
      for (; j < texte.length && texte[j] !== '"'; j++) {
        // `\"` en Bash, `` `" `` en PowerShell : un guillemet dans la chaîne, et non sa fin.
        if ((texte[j] === "\\" || texte[j] === "`") && texte[j + 1] === '"') { lu += '"'; j++; }
        else lu += texte[j];
      }
      mot = (mot ?? "") + lu;
      i = j;
    } else if (c === "#" && mot === null) {
      const fin = texte.indexOf("\n", i);
      i = fin < 0 ? texte.length : fin - 1;
    } else if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      couper();
    } else if (/\s/.test(c)) {
      poser();
    } else {
      mot = (mot ?? "") + c;
    }
  }
  poser();
  return commandes.filter((mots) => mots.length > 0);
}

/** Un mot dont les variables d'environnement sont dépliées, ou `null` s'il en reste une. */
function deplier(mot) {
  const valeur = (tout, nom) => process.env[nom] ?? tout;
  let lu = mot
    .replace(/\$env:([A-Za-z_]\w*)/gi, valeur)
    .replace(/\$\{([A-Za-z_]\w*)\}/g, valeur)
    .replace(/\$([A-Za-z_]\w*)/g, valeur)
    .replace(/%([A-Za-z_]\w*)%/g, valeur);
  if (/^~(?=$|[\\/])/.test(lu)) lu = homedir() + lu.slice(1);
  return /\$|`|%[A-Za-z_]\w*%/.test(lu) ? null : lu;
}

/** Le chemin absolu qu'un mot désigne depuis `base`, ou `null` s'il ne se lit pas. */
export function lire(mot, base) {
  let lu = deplier(mot);
  if (lu === null || lu === "") return null;
  if (WINDOWS) {
    // La forme de Git Bash, `/e/attic`, pour `E:/attic`.
    const disque = /^\/([a-zA-Z])(?=\/|$)/.exec(lu);
    if (disque) lu = `${disque[1].toUpperCase()}:${lu.slice(2) || "/"}`;
  }
  if (base === null) return P.isAbsolute(lu) ? P.resolve(lu) : null;
  return P.resolve(base, lu);
}

/** Ce que `git … worktree add …` ouvre, lu dans les mots qui suivent `git`, ou `null`. */
function arbreDeGit(args, ici) {
  let dossier = ici;
  let j = 0;
  while (j < args.length && args[j].startsWith("-")) {
    if (args[j] === "-C") { dossier = lire(args[j + 1] ?? "", dossier); j += 2; }
    else if (OPTIONS_DE_GIT_A_VALEUR.has(args[j])) j += 2;
    else j += 1;
  }
  if (args[j] !== "worktree" || args[j + 1] !== "add") return null;
  for (j += 2; j < args.length; j++) {
    const a = args[j];
    if (a === "--") { j++; break; }
    if (a === "-b" || a === "-B" || a === "--reason") { j++; continue; }
    if (!a.startsWith("-")) break;
  }
  const ecrit = args[j];
  return ecrit === undefined ? null : { ecrit, cible: lire(ecrit, dossier) };
}

/**
 * Chaque arbre que la commande ouvre : le chemin tel qu'écrit, et tel que git le lirait (`null`
 * quand il ne se lit pas). Le dossier courant suit les `cd` de la ligne, et une commande passée à un
 * shell par `-c`, `/c` ou `-Command` est lue comme les autres.
 */
export function arbresOuverts(ligne, depart, profondeur = 0) {
  const ouverts = [];
  let ici = depart;
  for (const mots of commandesSimples(ligne)) {
    if (CHANGE_DE_DOSSIER.has(mots[0].toLowerCase())) {
      const cible = mots.slice(1).find((m) => m === "-" || !m.startsWith("-"));
      ici = cible === undefined ? homedir() : cible === "-" ? null : lire(cible, ici);
      continue;
    }
    if (EST_SHELL.test(mots[0])) {
      const f = mots.findIndex((m, i) => i > 0 && DRAPEAU_DE_CODE.test(m));
      if (f > 0 && profondeur < 3) ouverts.push(...arbresOuverts(mots.slice(f + 1).join(" "), ici, profondeur + 1));
      continue;
    }
    let k = 0;
    while (k < mots.length && AFFECTATION.test(mots[k])) k++;
    if (k >= mots.length || !EST_GIT.test(mots[k])) continue;
    const ouvert = arbreDeGit(mots.slice(k + 1), ici);
    if (ouvert) ouverts.push(ouvert);
  }
  return ouverts;
}

/** `cible` est-il `racine` ou en dessous ? Comparé par segments : `worktrees-voisin` n'est pas dessous. */
export function sous(racine, cible) {
  const rel = P.relative(racine, cible);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + P.sep) && !P.isAbsolute(rel));
}

/**
 * La forme réelle d'un chemin, celle que git rend : son plus long ancêtre qui existe, lu par le
 * système (noms courts 8.3 dépliés, jonctions et liens suivis), puis le reste tel qu'écrit.
 */
export function canonique(chemin) {
  const ecrit = P.resolve(chemin);
  const reste = [];
  for (let tete = ecrit; ; ) {
    try {
      return P.join(realpathSync.native(tete), ...reste);
    } catch {
      const parent = P.dirname(tete);
      if (parent === tete) return ecrit;
      reste.unshift(P.basename(tete));
      tete = parent;
    }
  }
}

/** Le dossier des arbres de session du dépôt, lu sous son checkout principal. */
export function dossierDesArbres(depart) {
  let principal = depart;
  try {
    const commun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: depart, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000,
    }).trim();
    if (commun) principal = P.dirname(P.resolve(commun));
  } catch {
    // Hors d'un dépôt : le dossier de départ tient lieu de dépôt.
  }
  return P.join(principal, ".claude", "worktrees");
}

/** `cible` est-il dans le bac à sable de cette session : `<temporaire>/…/<session>/scratchpad/…` ? */
export function dansLeBac(cible, session) {
  if (!session) return false;
  const rel = P.relative(canonique(tmpdir()), canonique(cible));
  if (rel === "" || rel === ".." || rel.startsWith(".." + P.sep) || P.isAbsolute(rel)) return false;
  const egal = (a, b) => (WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b);
  const segments = rel.split(P.sep);
  return segments.some((s, i) => egal(s, session) && egal(segments[i + 1] ?? "", "scratchpad"));
}

/** Le texte du refus : la règle, sa raison, et comment déclarer une exception. */
export function direLeRefus(refus, arbres, session) {
  return [
    "CONTRAT D'ARBRE — cette commande est refusée.",
    "",
    "Une session n'ouvre d'arbre git ni ne travaille hors de ses propres dossiers, sauf exception",
    "justifiée et déclarée. Hors d'eux, l'application demande à Fabien d'approuver chaque écriture et",
    "chaque commande, et ce coût ne se voit pas du côté de la session.",
    "",
    "CE QUI EST REFUSÉ ICI :",
    ...refus.map(({ ecrit, cible }) => (cible === null
      ? `  · git worktree add ${ecrit} : ce chemin ne se lit pas (substitution, variable inconnue ou dossier de départ inconnu). L'écrire en clair.`
      : `  · git worktree add ${ecrit} : ${cible} est hors des dossiers de la session.`)),
    "",
    "LES DOSSIERS DE LA SESSION :",
    `  · les arbres de session du dépôt : ${arbres}`,
    session
      ? `  · le bac à sable de cette session : …${P.sep}${session}${P.sep}scratchpad, sous ${tmpdir()}`
      : "  · le bac à sable : inconnu, le harnais n'a pas donné l'identifiant de la session.",
    "",
    "Une pièce neuve se fait dans l'arbre de la session, sur une branche neuve :",
    "  git switch --no-track -c <branche> origin/master",
    "Une épreuve jetable va dans le bac à sable.",
    "",
    "UNE EXCEPTION se justifie d'abord auprès de Fabien, puis se déclare sur la commande même :",
    "  git worktree add --detach <chemin> <commit>  # exception-arbre: <raison>",
    "La seule connue : `npm ci` en EBUSY dans l'arbre de session, l'application Claude tenant l'asar",
    "de node_modules/electron. La vérification se fait alors dans un arbre détaché, ailleurs.",
  ].join("\n");
}

/** Les arbres que la commande ouvrirait hors des dossiers de la session, et ces dossiers. */
export function juger(commande, depart, session) {
  if (!/worktree/i.test(commande) || EXCEPTION.test(commande)) return null;
  const ouverts = arbresOuverts(commande, depart);
  if (ouverts.length === 0) return null;
  const arbres = dossierDesArbres(depart);
  const reels = canonique(arbres);
  const refus = ouverts.filter(({ cible }) => cible === null || !(sous(reels, canonique(cible)) || dansLeBac(cible, session)));
  return refus.length === 0 ? null : { refus, arbres };
}

function main() {
  let charge;
  try {
    charge = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }
  const outil = charge?.tool_name ?? "";
  if (outil !== "Bash" && outil !== "PowerShell") return 0;
  const commande = String(charge?.tool_input?.command ?? "");
  if (!commande) return 0;
  // LE DOSSIER DE LA SESSION EST CELUI DE LA CHARGE : `CLAUDE_PROJECT_DIR` a désigné le checkout
  // principal pendant qu'une session travaillait dans son arbre (relevé le 2026-10-29 sur le crochet
  // de notice), et la charge dit où la session est.
  const depart = charge?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const session = String(charge?.session_id ?? "");
  const juge = juger(commande, depart, session);
  if (!juge) return 0;
  process.stderr.write(direLeRefus(juge.refus, juge.arbres, session) + "\n");
  return 2;
}

// LE SCRIPT NE TOURNE QUE LANCÉ, et non importé.
if (process.argv[1] && chemins.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code = 0;
  try {
    code = main();
  } catch {
    code = 0;
  }
  process.exit(code);
}
