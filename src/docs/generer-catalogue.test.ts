// docs/generer-catalogue.test.ts — COMPONENTS.md : sa régénération, et la
// vérification qu'il est à jour.
//
// Régénération : `npm run docs:components`, qui passe ECRIRE_CATALOGUE=1. Un
// fichier de test et non un script, parce que l'ancien script passait par
// vite-node, qui n'est pas une dépendance du projet — la commande échouait sur
// toute machine où npx ne l'avait pas en cache. Vitest, lui, est installé.
//
// Vérification : le catalogue est versionné. Il avait pris 15 composants de
// retard quand il ne l'était pas, et le README renvoyait vers un fichier absent
// du dépôt. Ajouter ou modifier un nœud sans régénérer fait désormais échouer la
// suite, avec la commande à lancer.
import "node-web-audio-api/polyfill.js";
import { it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "../plugins";
import "../audio/adaptateur";
import { genererCatalogueMarkdown } from "./catalogue-markdown";

const CHEMIN = join(process.cwd(), "COMPONENTS.md");
const ecrire = process.env.ECRIRE_CATALOGUE === "1";

it.skipIf(!ecrire)("écrit COMPONENTS.md", () => {
  const md = genererCatalogueMarkdown(toutesLesFiches as any);
  writeFileSync(CHEMIN, md);
  console.log(`COMPONENTS.md : ${toutesLesFiches.length} composants, ${md.split("\n").length} lignes.`);
});

it.skipIf(ecrire)("le README et package.json annoncent le nombre réel de nœuds et d'effets", () => {
  // Ils annonçaient 247 nœuds quand le catalogue en comptait 260 : le nombre
  // était recopié à la main à quatre endroits, et rien ne le vérifiait.
  const sources = {
    "README.md": readFileSync(join(process.cwd(), "README.md"), "utf8"),
    "package.json (description)": JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).description as string,
  };
  for (const [nom, texte] of Object.entries(sources)) {
    const annonces = [...texte.matchAll(/\b(\d+) (?:plugin )?nodes\b/g)].map((m) => Number(m[1]));
    expect(annonces.length, `${nom} : aucun nombre de nœuds trouvé`).toBeGreaterThan(0);
    expect(annonces, `${nom} doit annoncer ${toutesLesFiches.length} nœuds`).toEqual(annonces.map(() => toutesLesFiches.length));
  }
  // Même chose pour les effets : le README en annonçait 85 quand la famille
  // Traitement → Effets en comptait 94.
  const effets = toutesLesFiches.filter((f) => f.univers === "Traitement" && f.famille === "Effets").length;
  const annoncesEffets = [...sources["README.md"].matchAll(/\b(\d+) effects\b/g)].map((m) => Number(m[1]));
  expect(annoncesEffets.length, "README.md : aucun nombre d'effets trouvé").toBeGreaterThan(0);
  expect(annoncesEffets, `README.md doit annoncer ${effets} effets`).toEqual(annoncesEffets.map(() => effets));
});

it.skipIf(ecrire)("AGENTS.md annonce le nombre réel de composants, et de gardes sur le dépôt", () => {
  // AGENTS.md ANNONÇAIT 469 COMPOSANTS QUAND LE CATALOGUE EN COMPTAIT 484, et « seize gardes » quand
  // il y en avait dix-neuf. Les deux chiffres étaient recopiés à la main et rien ne les surveillait,
  // alors que la première règle de ce fichier est qu'une affirmation s'y mesure : il échouait donc à
  // sa propre règle, sur la ligne qui la porte.
  const texte = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");

  // TROIS COMPTES DE COMPOSANTS Y VIVENT, et le garde les sépare plutôt que de les confondre :
  // celui du CATALOGUE, celui des composants SURVEILLÉS par la base d'empreintes, et celui des
  // composants QUI RENDENT DE L'AUDIO — trois nombres légitimement différents, chacun vérifié
  // contre sa propre source. Le qualificatif peut tomber sur la ligne suivante, le fichier étant
  // replié à cent colonnes, d'où les `\s+`.
  //
  // LE TROISIÈME EST ARRIVÉ AVEC LE CATALOGUE SONORE, et son absence a fait rougir une intégration
  // continue : « les 367 composants » était lu comme un compte du catalogue, donc comparé à 507. Un
  // garde qui ne connaît qu'une sorte de nombre force à ne plus en écrire d'autre, ou à mentir.
  //
  // LE QUATRIÈME EST ARRIVÉ LE MÊME JOUR, avec le garde des graines, et c'est la troisième fois que
  // ce cas attrapait la même forme en une journée. LA LEÇON EST DANS LA FORME DE LA RÈGLE : un
  // compte NU doit valoir le total, et tout compte QUALIFIÉ doit déclarer sa source ci-dessous.
  // Ajouter une sorte de nombre coûte une ligne ; l'oublier fait rougir l'intégration continue, ce
  // qui est le bon ordre des choses — mieux vaut un garde qui réclame une ligne qu'un dépôt où l'on
  // n'ose plus écrire un nombre.
  const composants = [...texte.matchAll(
    /\b(\d+) composants(\s+surveillés|\s+qui\s+rendent\s+de\s+l'audio|\s+à\s+graine)?\b/g)]
    .map((m) => ({ compte: Number(m[1]), qualificatif: (m[2] ?? "").replace(/\s+/g, " ").trim() }));
  const duCatalogue = composants.filter((c) => c.qualificatif === "").map((c) => c.compte);
  expect(duCatalogue.length, "AGENTS.md : aucun nombre de composants du catalogue trouvé").toBeGreaterThan(0);
  expect(duCatalogue, `AGENTS.md doit annoncer ${toutesLesFiches.length} composants`)
    .toEqual(duCatalogue.map(() => toutesLesFiches.length));

  const empreintes = JSON.parse(readFileSync(join(process.cwd(), "tests-e2e", "empreintes.json"), "utf8"));
  const surveilles = Object.keys(empreintes.composants ?? {}).length;
  const annoncesSurveilles = composants.filter((c) => c.qualificatif === "surveillés").map((c) => c.compte);
  expect(annoncesSurveilles.length, "AGENTS.md : aucun nombre de composants surveillés trouvé").toBeGreaterThan(0);
  expect(annoncesSurveilles, `AGENTS.md doit annoncer ${surveilles} composants surveillés`)
    .toEqual(annoncesSurveilles.map(() => surveilles));

  // ET CELUI DES COMPOSANTS QUI RENDENT DE L'AUDIO, compté sur le REGISTRE et non sur une liste :
  // c'est la portée du catalogue sonore, et des six verbes du pilote.
  const rendentDeLAudio = toutesLesFiches
    .filter((f) => (f.sorties ?? []).some((s) => s.type === "audio")).length;
  const annoncesAudio = composants
    .filter((c) => c.qualificatif === "qui rendent de l'audio").map((c) => c.compte);
  expect(annoncesAudio.length,
    "AGENTS.md : aucun nombre de composants qui rendent de l'audio trouvé").toBeGreaterThan(0);
  expect(annoncesAudio, `AGENTS.md doit annoncer ${rendentDeLAudio} composants qui rendent de l'audio`)
    .toEqual(annoncesAudio.map(() => rendentDeLAudio));

  // ET CELUI DES COMPOSANTS À GRAINE, compté sur le RÔLE `graine: true` du registre et non sur le
  // libellé du réglage. C'est la portée du garde des graines — et le compte où j'avais cité un
  // `grep` sur les fichiers, 73, là où le registre en porte 88.
  const aGraine = toutesLesFiches
    .filter((f) => (f.parametres ?? []).some((p) => (p as { graine?: true }).graine === true)).length;
  const annoncesGraine = composants.filter((c) => c.qualificatif === "à graine").map((c) => c.compte);
  expect(annoncesGraine.length, "AGENTS.md : aucun nombre de composants à graine trouvé").toBeGreaterThan(0);
  expect(annoncesGraine, `AGENTS.md doit annoncer ${aGraine} composants à graine`)
    .toEqual(annoncesGraine.map(() => aGraine));

  // LE COMPTE DES GARDES EST CELUI DES FICHIERS DE `src/docs`, ce que la ligne 115 dit elle-même :
  // « src/docs/*.test.ts — N contrats sur le dépôt lui-même ». Il est écrit en lettres, et c'est la
  // forme que ce cas cherche : le nombre, quel que soit le mot qui le porte.
  const combien = readdirSync(join(process.cwd(), "src", "docs")).filter((f) => f.endsWith(".test.ts")).length;
  const EN_LETTRES: Record<number, string> = {
    14: "quatorze", 15: "quinze", 16: "seize", 17: "dix-sept", 18: "dix-huit", 19: "dix-neuf",
    20: "vingt", 21: "vingt et un", 22: "vingt-deux", 23: "vingt-trois", 24: "vingt-quatre",
    25: "vingt-cinq",
  };
  const attendu = EN_LETTRES[combien];
  expect(attendu, `le compte de ${combien} gardes n'a pas son écriture en lettres dans ce cas`).toBeDefined();
  // CE CAS S'EST CONTREDIT LUI-MÊME EN FRANCHISSANT VINGT ET UN. Sa table portait bien « vingt et
  // un », mais son motif ne capturait QU'UN SEUL MOT avant « gardes » : il lisait « un », qui n'est
  // l'écriture d'aucun de ses nombres, et il refusait le compte juste en annonçant qu'aucun compte
  // n'était écrit en lettres. Les seules écritures en plusieurs mots du français — vingt et un,
  // trente et un — tombaient donc toutes. Le motif est maintenant bâti sur la TABLE elle-même,
  // de sorte qu'un nombre qu'elle sait écrire est un nombre qu'elle sait relire.
  const ECRITURES = Object.values(EN_LETTRES);
  for (const quoi of ["gardes", "contrats"]) {
    const trouves = [...texte.matchAll(new RegExp(`([\\wÀ-ÿ-]+) ${quoi} `, "g"))].map((m) => m[1]);
    expect(trouves.length, `AGENTS.md : aucun compte de ${quoi} trouvé`).toBeGreaterThan(0);
    // Seuls les comptes écrits en lettres de nombre comptent : « quatre contrats » est un autre
    // sujet, celui des scripts de contrat, et il a son propre compte.
    const comptes = [...texte.matchAll(new RegExp(`\\b(${ECRITURES.join("|")}) ${quoi} `, "g"))]
      .map((m) => m[1]);
    expect(comptes.length, `AGENTS.md : aucun compte de ${quoi} écrit en lettres de nombre`).toBeGreaterThan(0);
    expect(comptes, `AGENTS.md doit annoncer « ${attendu} ${quoi} », pour ${combien} fichiers dans src/docs`)
      .toEqual(comptes.map(() => attendu));
  }
});

it.skipIf(ecrire)("COMPONENTS.md correspond au registre", () => {
  expect(existsSync(CHEMIN), "COMPONENTS.md est absent : lancez « npm run docs:components »").toBe(true);
  // Git peut rendre le fichier avec des fins de ligne Windows : on compare le texte.
  const actuel = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n").split("\n");
  const attendu = genererCatalogueMarkdown(toutesLesFiches as any).split("\n");
  // La première ligne qui diffère, et non les 350 ko des deux versions.
  const n = Math.max(actuel.length, attendu.length);
  let ecart: string | null = null;
  for (let k = 0; k < n; k++) {
    if (actuel[k] !== attendu[k]) {
      ecart = `ligne ${k + 1} — dans le fichier : ${(actuel[k] ?? "(fin)").slice(0, 120)} — attendu : ${(attendu[k] ?? "(fin)").slice(0, 120)}`;
      break;
    }
  }
  expect(ecart, "COMPONENTS.md n'est plus à jour : lancez « npm run docs:components » et versionnez le résultat").toBeNull();
});
