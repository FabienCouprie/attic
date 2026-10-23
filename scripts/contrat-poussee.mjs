#!/usr/bin/env node
// scripts/contrat-poussee.mjs : dire, au moment de la poussée, que des commits viennent de rester
// hors de `master`.
//
// POURQUOI CE SCRIPT EXISTE. Le défaut s'est produit DEUX FOIS LE 2026-10-21, et il ne s'annonce
// par rien. La pull request est fusionnée pendant que `git push` tourne ; la fusion prend la branche
// à l'état où elle était, c'est-à-dire sans les commits qui arrivent, et ceux-là restent sur une
// branche dont la pull request est désormais close. `git push` réussit, la branche distante est à
// jour, `git status` est propre, et c'est `master` qui ne les a pas. La première fois, un composant
// entier et son garde ont disparu de la ligne principale, le modèle étant déjà publié sur la release
// et le manifeste qui le référence nulle part ; la seconde, l'épreuve Electron qui venait d'être
// écrite. Dans les deux cas, rien ne l'a dit, et il a fallu y penser.
//
// CE QU'IL LIT, ET POURQUOI C'EST LE BON SIGNE. Les commits que `master` a et que ma tête n'a pas,
// soit `HEAD..origin/<base>`, et parmi eux les FUSIONS. Si le second parent d'une de ces fusions est
// un ancêtre de ma tête, alors cette fusion a pris MA branche, et tout ce qui vient après le point
// pris est dehors. Le nombre de commits orphelins s'en déduit, et le point pris est celui sur lequel
// repartir.
//
// CE QUI DISTINGUE LA FAUTE DE SON SOSIE, et c'est tout l'intérêt de la plage `HEAD..` : repartir
// d'une branche neuve après une fusion produit la MÊME configuration vue de loin — `master` porte
// une fusion dont le second parent est un ancêtre de ma tête. Mais la fusion elle-même est alors un
// ancêtre de ma tête, donc elle n'est pas dans `HEAD..origin/<base>`, et la règle se tait. Le
// premier jet de ce garde cherchait les fusions dans tout l'historique de `master` : il criait sur
// chaque branche saine ouverte après une fusion, ce qui est l'état normal du dépôt.
//
// IL COUVRE AUSSI LA RÈGLE DE LA BRANCHE NEUVE, par la même condition et sans l'avoir cherché. Un
// commit ajouté sur une branche dont la pull request vient d'être fusionnée tombe exactement dans
// `point pris..HEAD` : il est hors de toute pull request, ce qui est arrivé quatre fois de suite en
// octobre avant que la règle ne soit posée.
//
// Branché en `PostToolUse` : il n'y a rien à refuser, la poussée a eu lieu et elle a réussi. Ce qui
// manquait est l'annonce, au moment où l'on peut encore sauver les commits d'un `git cherry-pick`.
//
// Code de sortie 2 : stderr est rendu à l'agent. Toute erreur interne sort en 0 — un garde-fou qui
// casse la session ne garde plus rien, et celui-ci touche au réseau.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Un `git` qui rend sa sortie, ou `null` s'il a échoué. Aucune commande d'écriture ici. */
function faireGit(racine) {
  return (args) => {
    try {
      return execFileSync("git", args, {
        cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 25000,
      }).trim();
    } catch {
      return null;
    }
  };
}

/**
 * La branche de base, DEMANDÉE AU DISTANT et non lue dans une référence locale.
 *
 * `refs/remotes/origin/HEAD` est posé une fois par `git clone` et ne bouge plus : un clone fait
 * depuis un dépôt dont la tête était sur une branche de travail le fait pointer là, et le garde
 * mesurerait alors contre la mauvaise branche. Relevé en montant le banc du cas réel, où la base
 * s'est annoncée « travaux/pont-isoler-voix ». Le distant, lui, répond ce qu'il est vraiment ;
 * le réseau coûte un aller-retour, que la récupération qui suit coûte déjà.
 */
export function baseDistante(git) {
  const dit = git(["ls-remote", "--symref", "origin", "HEAD"]);
  const vu = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(dit || "");
  if (vu) return vu[1];

  // Hors réseau, la référence locale vaut mieux que rien : elle est juste dans un clone ordinaire.
  const local = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const nom = (local || "").replace(/^origin\//, "");
  return nom || "master";
}

const estAncetre = (git, a, b) => git(["merge-base", "--is-ancestor", a, b]) !== null;

/**
 * Le commit auquel `master` a pris ma branche en vol, ou `null` si rien n'est resté dehors.
 *
 * `tete` est ma tête, `ref` la base distante. Les deux sont des révisions que `git` sait résoudre.
 */
export function priseEnVol(git, tete, ref) {
  // TOUT DE MA BRANCHE EST DANS LA BASE : il n'y a rien à sauver, et c'est par là que passe le cas
  // de la fusion qui a pris ma tête exacte — ma tête est alors le second parent de cette fusion,
  // donc atteignable depuis la base. Une seconde garde sur `second === tete` dans la boucle paraît
  // naturelle et ne peut jamais s'exécuter : défaut planté, aucun cas ne bouge. Un garde qui ne
  // peut pas tomber n'en est pas un, et ce dépôt en a déjà retiré un de `.gitignore` le même jour.
  if (estAncetre(git, tete, ref)) return null;

  const lignes = git(["rev-list", "--merges", "--parents", `${tete}..${ref}`]);
  if (!lignes) return null;

  const candidats = [];
  for (const ligne of lignes.split("\n")) {
    const [fusion, , second] = ligne.trim().split(/\s+/);
    if (!second) continue;
    // LA FUSION EST GARDÉE AVEC LE POINT PRIS : c'est dans son message que se lit le nom de la
    // branche qu'elle a prise, et ce nom est la seule chose qui sépare la faute d'un empilement.
    if (estAncetre(git, second, tete)) candidats.push({ fusion, prise: second });
  }
  if (candidats.length === 0) return null;

  // PLUSIEURS PRISES POSSIBLES : garder la PLUS ANCIENNE, qui laisse dehors le plus de commits.
  // `rev-list` rend du plus récent au plus ancien, donc c'est la dernière retenue.
  return candidats[candidats.length - 1];
}

/**
 * La branche que cette fusion a prise, lue dans son message, ou `null` si on ne sait pas.
 *
 * POURQUOI LE NOM, ET NON LA TOPOLOGIE. Le 2026-10-23 ce contrat a crié sur un état parfaitement
 * sain, et c'était ma faute : une branche partie du SOMMET d'une autre branche, laquelle a ensuite
 * fusionné. La configuration est alors indiscernable de la faute — la base porte une fusion dont le
 * second parent est un ancêtre de ma tête, et mes commits suivent ce point. La différence n'est pas
 * dans le graphe, elle est dans le NOM : cette fusion a pris une AUTRE branche, dont je me suis
 * servi comme base, et mes commits ont leur propre pull request qui les attend.
 *
 * LE CAS VOISIN QUI EXISTAIT DÉJÀ ne couvrait pas celui-là : il partait d'AVANT la fusion, donc le
 * sommet fusionné n'était pas un ancêtre de ma tête et la topologie suffisait à se taire.
 *
 * ON RESTE CONSERVATEUR : un message dont on ne sait rien tirer laisse l'alerte. Une fausse alerte
 * coûte une vérification ; un commit perdu a coûté un composant entier.
 */
export function brancheFusionnee(git, fusion) {
  const sujet = git(["log", "-1", "--format=%s", fusion]) || "";
  const pr = /Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(sujet);
  if (pr) return pr[1];
  const simple = /Merge branch '([^']+)'/.exec(sujet);
  return simple ? simple[1] : null;
}

/** Ce que le contrat a à dire, ou `null` s'il doit se taire. */
export function releve(git, base) {
  const tete = git(["rev-parse", "HEAD"]);
  if (!tete) return null;
  const ref = `origin/${base}`;
  if (git(["rev-parse", "--verify", "--quiet", ref]) === null) return null;

  const enVol = priseEnVol(git, tete, ref);
  if (!enVol) return null;
  const { fusion, prise } = enVol;

  const branche = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "(tête détachée)";
  // CETTE FUSION A-T-ELLE PRIS MA BRANCHE, OU UNE AUTRE ? Si elle nomme une autre branche, je suis
  // simplement parti de son sommet : mes commits ne sont pas orphelins, ils attendent leur propre
  // pull request. Lire ce nom est ce qui manquait au contrat le 2026-10-23, où il a crié sur un
  // état sain. Un nom illisible laisse l'alerte, par prudence.
  const brancheDeLaFusion = brancheFusionnee(git, fusion);
  if (brancheDeLaFusion !== null && brancheDeLaFusion !== branche) return null;

  const orphelins = (git(["log", "--format=%h %s", `${prise}..${tete}`]) || "")
    .split("\n").filter((l) => l.length > 0);
  if (orphelins.length === 0) return null;

  return { prise: prise.slice(0, 7), base, branche, orphelins };
}

/** Le texte de l'alerte. Il nomme les commits et donne la sortie, qui est la seule chose utile. */
export function direLAlerte({ prise, base, branche, orphelins }) {
  const n = orphelins.length;
  return [
    `CONTRAT DE POUSSÉE — ${n} commit${n > 1 ? "s" : ""} ${n > 1 ? "sont" : "est"} hors de « ${base} ».`,
    "",
    `« ${base} » porte une fusion de « ${branche} » prise à ${prise}.`,
    "Ce qui suit ce point n'y est pas. La poussée a réussi et la branche distante est à jour :",
    "c'est la ligne principale qui ne les a pas, et rien d'autre ne le dira.",
    "",
    ...orphelins.map((l) => `  · ${l}`),
    "",
    "LA SORTIE : repartir d'une branche neuve sur la base à jour, et y reporter ces commits.",
    `  git fetch origin && git checkout -b <branche-neuve> origin/${base}`,
    `  git cherry-pick ${prise}..${orphelins.length > 1 ? "<ancienne-tête>" : orphelins[0].split(" ")[0]}`,
    "",
    "Puis pousser cette branche et ouvrir une pull request pour elle.",
  ].join("\n");
}

/** La commande vient-elle de pousser ? Le mot seul suffit : une fausse alerte se tait d'elle-même. */
export const aPousse = (commande) => /\bgit\b[^\n]*\bpush\b/.test(commande);

function main() {
  let entree = "";
  try {
    entree = readFileSync(0, "utf8");
  } catch {
    return 0;
  }
  let charge;
  try {
    charge = JSON.parse(entree);
  } catch {
    return 0;
  }
  const outil = charge?.tool_name ?? "";
  if (outil !== "Bash" && outil !== "PowerShell") return 0;
  if (!aPousse(String(charge?.tool_input?.command ?? ""))) return 0;

  const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const git = faireGit(racine);
  const base = baseDistante(git);
  // LA BASE EST RAFRAÎCHIE AVANT DE LIRE : sans cela on lirait l'état d'avant la fusion, c'est-à-dire
  // exactement celui qui ne montre rien. L'échec est toléré, un dépôt peut être hors réseau.
  git(["fetch", "--quiet", "origin", base]);

  const dit = releve(git, base);
  if (!dit) return 0;

  process.stderr.write(direLAlerte(dit) + "\n");
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0;
}
process.exit(code);
