#!/usr/bin/env node
// scripts/contrat-heredoc.mjs : refuser les trois façons connues de perdre du texte en route.
//
// POURQUOI CE SCRIPT EXISTE. Retoucher un fichier par un script envoyé dans le shell a échoué de
// trois manières distinctes, longtemps confondues sous « le heredoc casse tout ». Elles ont été
// mesurées, et elles n'ont ni la même cause ni le même remède :
//
//   1. LES ACCENTS. Les octets traversent le heredoc intacts et corrects en UTF-8. C'est Python qui
//      décode son entrée en cp1252 sur cette machine : `sys.stdin.encoding` vaut `cp1252`, et
//      « celui-là » devient du charabia avant toute comparaison. `PYTHONUTF8=1` le corrige, et rien
//      d'autre ne le corrige.
//
//   2. LES ANTISLASHS. Le heredoc à délimiteur quoté ne touche à rien : `\n` arrive tel quel. C'est
//      Python qui interprète son propre littéral. Le shell n'y est pour rien, et mieux échapper au
//      niveau du shell ne change donc rien du tout.
//
//   3. LES FINS DE LIGNE. Le dépôt est mixte, 554 fichiers en CRLF contre 229 en LF, parce que
//      `core.autocrlf` vaut `true`. Un motif écrit avec `\n` ne peut pas correspondre à un fichier
//      CRLF, et le script échoue en annonçant « motif introuvable ».
//
// CE QUE CE CONTRAT TIENT, ET CE QU'IL NE TIENT PAS. Il refuse les trois formes ci-dessus avant que
// la commande ne s'exécute. Il ne dit pas quoi écrire à la place : la vraie économie est ailleurs,
// et le message la rappelle — une retouche d'un ou deux fichiers se fait avec Edit, qui compare les
// octets déjà lus, si bien que ni l'encodage ni les fins de ligne ne peuvent mordre. Un script ne se
// justifie que pour un travail répétitif sur beaucoup de fichiers.
//
// Branché en `PreToolUse` : refuser AVANT est tout l'objet. Après, le fichier est déjà abîmé, et
// c'est précisément le temps qu'on cherche à ne plus perdre.
//
// Code de sortie 2 : la commande est bloquée et le texte de stderr est rendu à l'agent. Toute erreur
// interne sort en 0 : un garde-fou qui casse la session ne garde plus rien.

const RAPPEL = [
  "CONTRAT DE RETOUCHE — cette commande est refusée.",
  "",
  "Une retouche d'un ou deux fichiers se fait avec Edit, jamais par un script : Edit compare les",
  "octets déjà lus, donc ni l'encodage ni les fins de ligne ne peuvent mordre. Un script ne se",
  "justifie que pour un travail répétitif sur beaucoup de fichiers ; il s'écrit alors avec Write",
  "dans un fichier, il se lance avec PYTHONUTF8=1, et il lit et écrit en",
  "encoding='utf-8', newline=''.",
].join("\n");

/** Un heredoc, quel que soit son délimiteur, et son contenu. */
function heredocs(commande) {
  const out = [];
  const re = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*\n([\s\S]*?)\n\s*\2\s*(?:\n|$)/g;
  let m;
  while ((m = re.exec(commande)) !== null) out.push(m[3]);
  return out;
}

const FAUTES = [
  {
    // Le cas mesuré : du source envoyé dans python sans forcer l'UTF-8.
    voir: (cmd) => /(^|[\s;|&])(python|python3|py)\b[^\n]*(-\s*$|-\s|<<)/m.test(cmd)
      && !/PYTHONUTF8\s*=\s*1/.test(cmd) && !/\s-X\s*utf8/.test(cmd),
    dire: "Python lit son entrée en cp1252 sur cette machine : les accents sont détruits avant"
      + " toute comparaison. Préfixer la commande par PYTHONUTF8=1.",
  },
  {
    // Du code transporté par le shell plutôt qu'écrit dans un fichier.
    voir: (cmd) => heredocs(cmd).some((c) => /^\s*(import|from|def |class |const |let |function )/m.test(c)),
    dire: "Ce heredoc transporte du code. L'écrire avec Write dans un fichier, puis le lancer :"
      + " le shell ne doit pas être sur le chemin d'un source.",
  },
  {
    // Une fin de ligne dans un motif, tant que l'arbre est mixte.
    // `\\n` est un antislash suivi d'un n, c'est-à-dire la fin de ligne telle qu'un script l'écrit.
    // Le cas `\r\n` la contient, donc le chercher séparément serait redondant. Une première version
    // écrivait `\\r?\\n`, où le `?` ne porte que sur le `r` : elle exigeait DEUX antislashs et ne
    // pouvait donc jamais correspondre. La règle est restée muette jusqu'à ce que son test la prenne.
    voir: (cmd) => heredocs(cmd).some((c) => /\.(replace|index|find|split)\([^)]*\\n/.test(c)),
    dire: "Un motif contenant une fin de ligne ne peut pas correspondre : l'arbre est mixte,"
      + " CRLF et LF. Comparer sans fin de ligne, ou passer par Edit.",
  },
];

function main() {
  let entree = "";
  try {
    entree = require("node:fs").readFileSync(0, "utf8");
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
  const commande = String(charge?.tool_input?.command ?? "");
  if (!commande) return 0;

  const releves = FAUTES.filter((f) => {
    try { return f.voir(commande); } catch { return false; }
  }).map((f) => `  · ${f.dire}`);
  if (releves.length === 0) return 0;

  process.stderr.write([RAPPEL, "", "CE QUI EST REFUSÉ ICI :", ...releves].join("\n") + "\n");
  return 2;
}

let code = 0;
try {
  const { createRequire } = await import("node:module");
  globalThis.require = createRequire(import.meta.url);
  code = main();
} catch {
  code = 0;
}
process.exit(code);
