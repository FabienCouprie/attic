#!/usr/bin/env node
// scripts/contrat-graphe.mjs : le contrat de graphe, vérifié à chaque écriture d'un graphe.
//
// POURQUOI CE SCRIPT EXISTE.
//
// Un graphe livré en exemple portait un « Début de boucle par créneau » relié à RIEN. Le moteur
// l'accepte : une boucle se repère par l'identifiant de son nœud, et son corps se désigne par ce
// qui alimente sa fin, non par un câble parti du début. J'en ai conclu que la forme était bonne, et
// j'ai écrit dans le graphe une note disant que ce nœud orphelin était voulu. C'est l'inverse qui
// est vrai : dans un éditeur de nœuds, un nœud sans câble ne participe à rien, et un nœud qui
// gouverne tout le reste sans un seul câble ne se lit pas. Relevé par Fabien.
//
// LA FAUTE N'EST PAS DE NE PAS AVOIR VU, ELLE EST D'AVOIR JUSTIFIÉ. Partir de ce que le moteur
// accepte plutôt que de ce qui se lit à l'écran est la même erreur que celle que
// `fiabilite-des-diagnostics` nomme déjà. Un script ne juge pas une forme ; il peut compter les
// câbles, et c'est ce qui manquait.
//
// CE QU'IL VÉRIFIE, ET CE QU'IL LAISSE AU TEST. Ici, tout ce qui se lit dans le seul fichier :
// nœuds orphelins, arêtes pendantes, identifiants en double. Ce qui demande de connaître les fiches
// — une entrée requise laissée libre, une poignée hors des ports du composant — vit dans
// `src/docs/contrat-graphe.test.ts`, qui a le registre sous la main.
//
// Code de sortie 2 : le texte de stderr est rendu à l'agent, qui doit en tenir compte. Toute erreur
// interne sort en 0 : un garde-fou qui casse la session ne garde plus rien.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Où l'on range des graphes. Un graphe écrit ailleurs échappe à ce contrôle, et le test le rattrape. */
const DOSSIERS = ["", "presets", "exemples", "tests-e2e"];

/**
 * Le dossier `exemples/` est tout entier sous contrat, et son nom suffit à le dire.
 *
 * LES DEUX DOSSIERS N'ONT PAS LE MÊME RÔLE, et c'est ce qui permet la différence. `presets/` n'est
 * pas versionné : c'est là qu'on travaille, et un graphe qu'on est en train de câbler y est
 * momentanément incomplet par nature. `exemples/` est versionné et livré : ce qui s'y trouve est
 * montré à quelqu'un d'autre, et n'a donc pas le droit d'être à moitié fait. Un travail en cours se
 * range dans `presets/`.
 */
const estExemple = (dossier, nom) =>
  dossier === "exemples" ? /\.json$/i.test(nom) : EXEMPLE.test(nom);

/**
 * Seuls les graphes D'EXEMPLE sont tenus, et leur nom le dit.
 *
 * LE CONTRAT NE S'APPLIQUE PAS À UN GRAPHE EN COURS DE CONSTRUCTION. L'application enregistre le
 * travail en cours dans le même dossier, et un graphe qu'on est en train de câbler est
 * momentanément incomplet par nature : le contrôler reviendrait à reprocher à quelqu'un de ne pas
 * avoir fini. Il a tiré une fois sur le fichier de Fabien pendant qu'il le câblait, ce qui est
 * exactement le bruit qu'un garde-fou ne doit pas faire.
 *
 * LA CONVENTION EST DONC À MA CHARGE : un graphe livré en exemple se nomme « quelque-chose-exemple
 * .json », et c'est ce nom qui l'expose au contrôle.
 */
const EXEMPLE = /-exemple\.json$/i;

/**
 * Les nœuds qui n'ont pas de port, donc pas de câble à attendre.
 *
 * Une note et un cadre sont des annotations posées sur le canevas : les exiger reliés n'aurait
 * aucun sens, et c'est la seule exemption.
 */
const SANS_PORTS = new Set(["comment", "frame"]);

const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** Les fichiers JSON des dossiers surveillés, sans descendre plus bas. */
function fichiersCandidats() {
  const sortie = [];
  for (const d of DOSSIERS) {
    const chemin = join(racine, d);
    let entrees;
    try {
      entrees = readdirSync(chemin);
    } catch {
      continue;
    }
    for (const nom of entrees) {
      if (!estExemple(d, nom)) continue;
      const complet = join(chemin, nom);
      try {
        if (!statSync(complet).isFile()) continue;
      } catch {
        continue;
      }
      sortie.push(complet);
    }
  }
  return sortie;
}

/** Le graphe d'un fichier, ou null si ce n'en est pas un. */
function lireGraphe(chemin) {
  let brut;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch {
    return null;
  }
  // Un coup d'œil avant d'analyser : `package-lock.json` fait des mégaoctets et n'est pas un graphe.
  if (!brut.includes("\"nodes\"") || !brut.includes("\"edges\"")) return null;
  let json;
  try {
    json = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.edges)) return null;
  return json;
}

/** Ce qu'un graphe enfreint, en clair. */
function fautes(graphe) {
  const relies = new Set();
  const dits = new Set();
  const trouvees = [];

  for (const n of graphe.nodes) {
    if (dits.has(n.id)) trouvees.push(`identifiant en double : « ${n.id} »`);
    dits.add(n.id);
  }
  for (const e of graphe.edges) {
    relies.add(e.source);
    relies.add(e.target);
    if (!dits.has(e.source)) trouvees.push(`l'arête « ${e.id} » part d'un nœud absent : « ${e.source} »`);
    if (!dits.has(e.target)) trouvees.push(`l'arête « ${e.id} » arrive sur un nœud absent : « ${e.target} »`);
  }
  // UN NŒUD SEUL DANS UN GRAPHE D'UN SEUL NŒUD n'est pas un orphelin : il n'y a rien à quoi le
  // relier, et le refuser interdirait d'enregistrer un composant en cours d'essai.
  if (graphe.nodes.length > 1) {
    for (const n of graphe.nodes) {
      const fiche = n?.data?.ficheId ?? "?";
      if (SANS_PORTS.has(fiche)) continue;
      if (!relies.has(n.id)) trouvees.push(`nœud relié à rien : « ${n.id} » (${fiche})`);
    }
  }
  return trouvees;
}

const CONTRAT = `CONTRAT DE GRAPHE. Un graphe d'exemple enfreint ce qui suit.

UN GRAPHE SE LIT À L'ÉCRAN, il ne se déduit pas du moteur. Ce que le moteur tolère n'est pas ce
qu'un lecteur comprend : un nœud sans câble ne participe à rien, et rien à l'écran ne dira qu'il
gouverne le reste.

  1. Tout nœud est relié par au moins une arête, en entrée ou en sortie. Seules les notes et les
     cadres en sont exemptés, n'ayant pas de ports.
  2. Toute arête part d'un nœud du graphe et arrive sur un nœud du graphe.
  3. Deux nœuds ne portent pas le même identifiant.

Une boucle dont le début n'est branché à rien ne respecte pas la première clause, quoi qu'en dise
la planification : il faut alors une boucle dont le début parle le type de ce qu'elle transforme.`;

function main() {
  const rapports = [];
  for (const chemin of fichiersCandidats()) {
    const graphe = lireGraphe(chemin);
    if (!graphe) continue;
    const trouvees = fautes(graphe);
    if (trouvees.length > 0) {
      rapports.push(`${relative(racine, chemin) || chemin} :\n${trouvees.map((f) => `  - ${f}`).join("\n")}`);
    }
  }
  if (rapports.length === 0) return 0;

  // Une seule alerte tant que les mêmes fautes subsistent : le contrat tire à l'écriture, non à
  // chaque commande lancée ensuite.
  const empreinte = createHash("sha256").update(rapports.join("\n")).digest("hex");
  const marque = join(racine, ".claude", ".graphe-empreinte");
  try {
    if (readFileSync(marque, "utf8").trim() === empreinte) return 0;
  } catch { /* première fois */ }
  try {
    mkdirSync(dirname(marque), { recursive: true });
    writeFileSync(marque, empreinte);
  } catch { /* tant pis : le contrat repartira, ce qui est le moindre mal */ }

  process.stderr.write([CONTRAT, "", ...rapports].join("\n") + "\n");
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0;
}
process.exit(code);
