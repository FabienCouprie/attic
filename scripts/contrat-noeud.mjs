#!/usr/bin/env node
// scripts/contrat-noeud.mjs : le contrat de composant, rappelé à chaque création ou modification.
//
// POURQUOI CE SCRIPT EXISTE, demandé par Fabien : « ces règles de reset et de prise en compte de
// tous les paramètres au run sont à contractualiser pour les créations et les modifications de
// nodes ». Les deux défauts qu'il vise se sont produits, et chacun deux fois.
//
//   LE RÉSULTAT QUI SURVIT À LA REMISE À ZÉRO. Un exécuteur écrit sur `ctx.noeud.data`, la fusion
//   générique de `lancer()` recopie tout champ préfixé d'un blanc souligné dans l'état React, et la
//   remise à zéro n'efface que `CHAMPS_RESULTAT`. Un champ oublié de cette liste reste donc à
//   l'écran sur un nœud redevenu « en attente ». Vu sur le dessin du générateur de courbe, puis sur
//   les barres et l'onde du Montage, puis sur douze composants d'un coup.
//
//   LE RÉGLAGE QUI NE FAIT RIEN. Un paramètre déclaré, visible, documenté, avec sa plage et son
//   défaut, que l'exécuteur ne lit pas, ou lit puis jette un niveau plus bas. Vu sur « Seuil de
//   silence » du générateur vidéo, et sur les candidats de la revue des 448.
//
// CE QUE LE BALAYAGE VOIT, ET CE QU'IL NE VOIT PAS. Il compare des noms : un paramètre dont le nom
// n'apparaît qu'à sa déclaration n'est lu nulle part, et c'est sûr. L'INVERSE N'EST PAS VRAI — un
// paramètre lu puis versé dans un champ que personne ne consomme passe ce contrôle sans être
// attrapé, et c'est exactement ce qui est arrivé à « Seuil de silence ». Le balayage signale donc
// des symptômes ; c'est la vérification du composant, réglage par réglage, qui fait foi.
//
// Code de sortie 2 : le texte de stderr est rendu à l'agent. Toute erreur interne sort en 0, un
// garde-fou qui casse la session ne gardant plus rien.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CONTRAT = `CONTRAT DE COMPOSANT. Un composant vient d'être créé ou modifié.

DEUX RÈGLES, À VÉRIFIER SUR CE COMPOSANT AVANT DE PASSER À AUTRE CHOSE.

1. TOUT CE QUE L'EXÉCUTEUR POSE SUR LE NŒUD A UNE CLASSE. Un champ écrit sur \`ctx.noeud.data\`
   appartient à l'une de ces trois-là, et à une seule :

     CHAMPS_RESULTAT      produit par le run et ne décrivant que lui ; la remise à zéro l'efface.
                          Le critère : si le nœud n'a pas tourné, le champ ne veut rien dire.
     CHAMPS_UTILISATEUR   vient de la personne : un fichier chargé, un choix. Rien ne l'efface,
                          le copier-coller le recopie, le projet l'écrit.
     CHAMPS_SIGNAL_UNIQUE un déclencheur ponctuel. SEULE EXCEPTION LÉGITIME, et sa propriété se
                          vérifie : \`lancer()\` le remet à \`undefined\` lui-même, donc il ne
                          survit pas au run qui l'a posé.

   Il n'y a pas de quatrième cas. Un champ hors des trois reste à l'écran sur un nœud redevenu
   « en attente », et décrit une exécution qui n'a plus lieu.

2. TOUS LES PARAMÈTRES DÉCLARÉS SONT PRIS EN COMPTE AU RUN. Chaque paramètre est lu par
   l'exécuteur ET agit sur le résultat. Un paramètre lu puis versé dans un champ que personne ne
   consomme ne compte pas : c'est un curseur qui ne peut rien changer.

   La vérification se fait réglage par réglage, sur CE composant : changer la valeur doit changer
   le résultat. Un réglage légitimement inerte porte sa raison écrite à côté de lui, par exemple
   parce qu'il n'agit que dans un autre mode, ce que sa documentation doit dire.

3. UN LECTEUR DE COMPOSANT NE S'OUVRE PAS À PLEINE PUISSANCE. Tout ce qui se fait entendre depuis
   un nœud passe par \`NIVEAU_ECOUTE\` de \`ui/niveau-ecoute.ts\` : un élément audio par
   \`onLoadedMetadata={ouvrirAuNiveauDEcoute}\`, une écoute montée en direct par un gain de sortie.

   Seule exception : un lecteur dont le niveau est un RÉGLAGE DÉCLARÉ du composant, visible et
   documenté. Le niveau du fichier produit, lui, ne change pas : c'est le confort d'écoute qui se
   règle, pas le son.

ET LA NOTICE SUIT. Un paramètre ajouté, retiré ou renommé s'écrit dans la notice, dans les deux
langues ; un paramètre absent de la notice est un réglage que personne ne saura employer.`;

/** Le bloc `parametres: [ ... ]` d'un fichier, par équilibrage des crochets. */
function blocParametres(source) {
  const depart = source.indexOf("parametres:");
  if (depart < 0) return "";
  const ouvrant = source.indexOf("[", depart);
  if (ouvrant < 0) return "";
  let profondeur = 0;
  for (let i = ouvrant; i < source.length; i++) {
    const c = source[i];
    if (c === "[") profondeur++;
    else if (c === "]") {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvrant, i + 1);
    }
  }
  return "";
}

/**
 * Les noms de paramètre déclarés, TELS QU'ÉCRITS DANS LA SOURCE.
 *
 * On garde l'expression et non sa valeur, parce que les familles de paramètres sont engendrées :
 * « Début » d'un montage s'écrit `Début ${k + 1}` à la déclaration comme à la lecture. Comparer les
 * valeurs résolues demanderait d'exécuter le module ; comparer les expressions suffit et ne ment pas.
 */
function nomsDeParametres(source) {
  const bloc = blocParametres(source);
  const noms = [];
  // `nom:` suivi d'une chaîne ou d'un gabarit ; `nomEn:` est une autre clé, donc hors de portée.
  for (const m of bloc.matchAll(/(?<![A-Za-z])nom:\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) noms.push(m[1]);
  return [...new Set(noms)];
}

/** Les trois classes, lues dans la source pour qu'elles ne soient pas recopiées ici. */
function classes(racine) {
  const source = readFileSync(join(racine, "src/ui/hooks/useExecutionGraphe.ts"), "utf8");
  const set = (nom) => {
    const m = source.match(new RegExp(`${nom}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    return new Set(m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []);
  };
  return new Set([...set("CHAMPS_UTILISATEUR"), ...set("CHAMPS_RESULTAT"), ...set("CHAMPS_SIGNAL_UNIQUE")]);
}

const ECRITURE = /(?<![A-Za-z0-9_])data(?:\s+as\s+any)?\s*\)?\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g;

/**
 * Tout `src/` d'un seul tenant, où chercher si un nom de paramètre est employé.
 *
 * LE FICHIER DÉCLARANT NE SUFFIT PAS, mesuré : restreint à lui, le balayage signalait treize
 * paramètres dont aucun n'était mort. « Chemin » est posé par l'inspecteur au chargement d'un
 * fichier et lu par la machinerie de rechargement, dans un autre fichier ; « Graine », « Modèle »
 * et « Niveau » de même. Un réglage peut être consommé loin de sa déclaration, et le compter comme
 * inerte pour cette seule raison serait exactement le substitut pris pour la propriété.
 */
function corpusSrc(racine) {
  const morceaux = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const c = join(d, e.name);
      if (e.isDirectory()) parcourir(c);
      else if (/\.tsx?$/.test(e.name)) morceaux.push(readFileSync(c, "utf8"));
    }
  };
  parcourir(join(racine, "src"));
  return morceaux.join("\n");
}

function main() {
  const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--name-only", "--", "src/plugins"],
      { cwd: racine, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return 0; // hors dépôt, ou git absent : le garde-fou se tait.
  }
  let nouveaux = "";
  try {
    nouveaux = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", "src/plugins"],
      { cwd: racine, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch { /* un dépôt sans fichier neuf */ }

  const fichiers = [...new Set([...diff.split("\n"), ...nouveaux.split("\n")])]
    .map((f) => f.trim())
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  if (fichiers.length === 0) return 0;

  // Une seule alerte par modification réelle, comme le contrat de notice.
  const empreinte = createHash("sha256").update(fichiers.join("\n")).digest("hex");
  const marque = join(racine, ".claude", ".noeud-empreinte");
  try {
    if (readFileSync(marque, "utf8").trim() === empreinte) return 0;
  } catch { /* première fois */ }
  try {
    mkdirSync(dirname(marque), { recursive: true });
    writeFileSync(marque, empreinte);
  } catch { /* tant pis : le contrat repartira, ce qui est le moindre mal */ }

  const connues = classes(racine);
  const corpus = corpusSrc(racine);
  const releves = [];
  const aVerifier = [];
  for (const f of fichiers) {
    let source = "";
    try { source = readFileSync(join(racine, f), "utf8"); } catch { continue; }

    // Règle 1 : un champ posé sur le nœud sans classe.
    for (const m of source.matchAll(ECRITURE)) {
      if (!connues.has(m[1])) {
        releves.push(`  ${f} : « data.${m[1]} » n'appartient à aucune des trois classes (règle 1)`);
      }
    }

    // Règle 2 : un nom de paramètre qui n'apparaît nulle part ailleurs que dans sa déclaration.
    const noms = nomsDeParametres(source);
    for (const nom of noms) {
      if (corpus.split(nom).length - 1 <= 1) {
        releves.push(`  ${f} : le paramètre ${nom} n'apparaît qu'à sa déclaration (règle 2)`);
      }
    }
    if (noms.length > 0) aVerifier.push(`  ${f} : ${noms.length} paramètre(s) déclaré(s)`);
  }

  const sortie = [CONTRAT, ""];
  if (aVerifier.length > 0) {
    sortie.push("COMPOSANTS TOUCHÉS, à vérifier sur TOUS leurs paramètres :", ...aVerifier);
  }
  if (releves.length > 0) {
    sortie.push("",
      "RELEVÉ DU BALAYAGE. Il compare des noms : ce qu'il montre est sûr, ce qu'il tait ne l'est pas.",
      "Un paramètre lu puis jeté un niveau plus bas passe ce contrôle sans être attrapé.",
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
