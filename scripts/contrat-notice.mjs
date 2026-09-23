#!/usr/bin/env node
// scripts/contrat-notice.mjs : le contrat de notice, rappelé à chaque modification d'une notice.
//
// POURQUOI CE SCRIPT EXISTE.
//
// Une notice est un MODE D'EMPLOI. Ce ton dérive : on y glisse une figure de style, un souvenir de
// conception, un relevé d'essai, une comparaison avec un autre composant. Un test peut attraper un
// mot interdit, jamais un ton ; cela a été constaté, et redit. Le seul remède est de relire la
// phrase, et pour la relire il faut être averti qu'on vient d'en écrire une.
//
// Ce script est branché en `PostToolUse` : il se déclenche après Edit, Write, MultiEdit et Bash,
// et regarde si le diff de travail contient une ligne AJOUTÉE portant un champ de notice ou de
// documentation. Si oui, il rappelle le contrat et signale les tournures connues pour être des
// fautes récurrentes. Sinon il se tait.
//
// IL NE SE RÉPÈTE PAS. L'empreinte du diff de notices est gardée dans `.claude/.notice-empreinte` :
// tant que ce diff ne change pas, le contrat ne repart pas. Il tire donc une fois par modification
// réelle, et non à chaque commande lancée ensuite.
//
// Code de sortie 2 : le texte de stderr est rendu à l'agent, qui doit en tenir compte. Toute
// erreur interne sort en 0 : un garde-fou qui casse la session ne garde plus rien.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CHAMPS = /^\+.*\b(notice|noticeEn|resume|resumeEn|doc|docEn)\s*:\s*"/;

/** Les fautes qui reviennent. Un motif ne voit pas le ton ; il voit ses symptômes les plus nets. */
const MOTIFS = [
  [/\b(c'est (là )?(tout|toute) (le|la) (sujet|question|intérêt)|et c'est (là )?(tout|toute)|voilà (tout|pourquoi))\b/i,
    "formule frappante ; dire le fait, pas son importance"],
  [/\b(se taisent ensemble|regardée deux fois|qui respire|une horloge et non|porte un instant)\b/i,
    "figure de style : personnification, chiasme, métaphore"],
  // Le RELEVÉ, c'est-à-dire « Mesuré, 6 202 Hz » en tête de proposition, et non l'adjectif
  // ordinaire de « le chiffre mesuré ».
  [/(?:^|[.;:!?]\s+|—\s)(mesuré|mesurée|measured)\s*[,:]/, "relevé d'essai ; énoncer la propriété, pas l'expérience"],
  [/\b(c'est testé|this is tested|vérifié dans|il faut l'écrire|and it must be written)\b/i,
    "relevé d'essai ou annonce de plan"],
  [/\b(ce qui manquait|le chaînon manquant|un premier jet|ne connaissait|comptait (déjà )?(huit|sept|six|cinq))\b/i,
    "journal de conception ; la notice décrit l'état présent"],
  [/\b(branchez|réglez|choisissez|imposez|convertissez|ignorez|vous pouvez|vous devez|idéal pour|parfait pour)\b/i,
    "recette ou adresse au lecteur ; décrire, pas prescrire"],
  [/\b(ce n'est pas un bogue|pas (un )?défaut du (composant|nœud)|this is not a bug)\b/i,
    "défense ; un comportement se décrit, il ne se justifie pas"],
  [/\b((trois|quatre|deux|cinq) choses (à savoir|valent)|ce qu'il faut (savoir|écrire)|à savoir avant|worth knowing)\b/i,
    "annonce de plan ; écrire le contenu, pas son sommaire"],
  [/\bAttic\b/, "le nom de l'application n'a pas sa place dans une notice"],
  [/\b(dites? plutôt que tues?|assumée|le dit franchement|le fameux|mieux vaut)\b/i,
    "appréciation, la notice ne juge pas ce qu'elle décrit"],
  [/—|–/, "tiret cadratin ou demi-cadratin interdit : employer un point, une virgule ou un point-virgule"],
];

const CONTRAT = `CONTRAT DE NOTICE. Une notice ou une documentation de paramètre vient d'être modifiée.

UNE NOTICE EST UN MODE D'EMPLOI. Ton neutre et professionnel, agrémenté si besoin est de
références scientifiques. Rien d'autre.

Elle dit, dans cet ordre :
  1. ce que le composant FAIT ; première phrase, à l'indicatif présent, sujet le composant
  2. comment chaque réglage agit, réglage par réglage
  3. ce que rend chaque sortie

Listes à points, clarté, sobriété. Chaque terme employé doit se retrouver à l'écran : nom de port,
nom de paramètre, libellé d'option.

PONCTUATION. Le tiret cadratin « — » et le demi-cadratin « – » sont interdits. Employer un point,
une virgule ou un point-virgule : une incise se met entre virgules, une explication s'introduit par
deux points, deux propositions indépendantes se séparent par un point-virgule ou un point.

SONT PROSCRITS :
  - la figure de style : métaphore, personnification, chiasme, formule frappante
  - le journal de conception : ce qui manquait, un premier jet, le chaînon manquant
  - le relevé d'essai : mesuré, c'est testé, vérifié
  - la comparaison avec un autre composant, et le nom de l'application
  - la recette et l'adresse au lecteur : branchez, réglez, vous pouvez, idéal pour
  - l'annonce de plan : trois choses à savoir, ce qu'il faut écrire
  - la défense : ce n'est pas un bogue, pas un défaut du composant

RELIRE LA PHRASE D'OUVERTURE. Elle doit dire ce que le composant fait : ni ce qu'il n'est pas, ni
ce qui existait avant lui, ni la définition d'un autre composant.`;

function main() {
  const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let diff = "";
  try {
    // `stdio` écarte la sortie d'erreur de git : ses avertissements de fins de ligne se
    // mêleraient au contrat et le rendraient illisible.
    diff = execFileSync("git", ["diff", "-U0", "--", "src/plugins", "src/docs"],
      { cwd: racine, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return 0; // hors dépôt, ou git absent : le garde-fou se tait.
  }

  const ajouts = diff.split("\n").filter((l) => CHAMPS.test(l));
  if (ajouts.length === 0) return 0;

  // Une seule alerte par modification réelle.
  const empreinte = createHash("sha256").update(ajouts.join("\n")).digest("hex");
  const marque = join(racine, ".claude", ".notice-empreinte");
  try {
    if (readFileSync(marque, "utf8").trim() === empreinte) return 0;
  } catch { /* première fois */ }
  try {
    mkdirSync(dirname(marque), { recursive: true });
    writeFileSync(marque, empreinte);
  } catch { /* tant pis : le contrat repartira, ce qui est le moindre mal */ }

  const releves = [];
  for (const ligne of ajouts) {
    for (const [motif, raison] of MOTIFS) {
      const m = ligne.match(motif);
      if (m) releves.push(`  « ${m[0]} » : ${raison}`);
    }
  }

  const sortie = [
    CONTRAT,
    "",
    `${ajouts.length} champ(s) de notice ou de documentation modifié(s) dans le diff de travail.`,
  ];
  if (releves.length > 0) {
    sortie.push("",
      "TOURNURES RELEVÉES par le balayage ; elles ne couvrent pas le ton, seulement ses symptômes :",
      ...[...new Set(releves)]);
  }
  process.stderr.write(sortie.join("\n") + "\n");
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0;
}
process.exit(code);
