// electron/configuration.cjs — Le fichier de configuration lu au démarrage, sous Windows et sous Linux.
//
// POURQUOI CE MODULE. Demandé par Fabien le 2026-11-19 : un fichier qui charge une configuration à
// l'entrée du programme. C'est la pièce C0 du plan (`plan-fichier-configuration-2026-11-19.md`, dans
// les notes de la session) : le socle, sans aucune clé qui change un comportement. Chaque pièce
// suivante ajoute la sienne au SCHÉMA, avec son lecteur et sa ligne dans `CONFIGURATION.md`, et
// `src/docs/configuration.test.ts` refuse une clé qui n'aurait pas les deux.
//
// LE FICHIER : `app.getPath("userData")/config.json`, soit `%APPDATA%\attic\config.json` sous Windows
// et `~/.config/attic/config.json` sous Linux, le dossier que la convention XDG réserve aux réglages.
// Jamais à côté de l'exécutable : `Program Files` n'y est pas inscriptible, un AppImage non plus.
//
// CE MODULE EST PUR. Il reçoit le texte, le système, l'environnement et le dossier personnel, et rend
// les valeurs et les problèmes. Le système est INJECTÉ, et chaque branche parle `path.win32` ou
// `path.posix`, jamais `path` : la CI tourne sous Windows, où `path` rendrait un chemin Linux faux.
// C'est la leçon de `dossier-ressources.cjs`, écrite là par la PR #290.
//
// SES RÈGLES, et chacune a sa raison :
//   — une partie commune, et deux sections `windows` et `linux` qui la complètent. Un même fichier
//     recopié d'une machine à l'autre reste valable : la section de l'autre système est ignorée ;
//   — le BOM est retiré (le Bloc-notes de Windows en écrit un, et `JSON.parse` le refuse), et une
//     erreur de syntaxe donne sa ligne ;
//   — un chemin Windows peut s'écrire avec des barres obliques, `E:/modeles` : écrit `E:\modeles`,
//     le JSON exige `E:\\modeles`, et c'est l'erreur qu'on fera le plus. `~/` en tête désigne le
//     dossier personnel, sur les deux systèmes ; aucune autre expansion ;
//   — une variable d'environnement l'emporte sur le fichier, qui l'emporte sur le défaut ;
//   — une clé inconnue, hors de ses bornes ou du mauvais type est NOMMÉE, et le défaut s'applique :
//     un fichier faux ne doit jamais empêcher l'application de démarrer ;
//   — sous Linux, un fichier inscriptible par le groupe ou par tous n'est pas appliqué : il dit où
//     le pont peut écrire, et n'importe qui ne doit pas pouvoir l'élargir.
//
// LES PROBLÈMES SONT DES CODES, et non des phrases : le processus principal les écrit dans son
// journal par `formulerProbleme`, et l'interface pourra les traduire le jour où elle les montrera.
//
// ═══ LES CHEMINS PROPOSÉS SONT CEUX DE LA MACHINE, À CHAQUE LANCEMENT ═══
//
// Demandé par Fabien le 2026-11-19 : « les chemins doivent être liés à l'installeur et proposer les
// chemins actuels valides sur les machines cibles ». Il a choisi, entre trois, un fichier proposé
// régénéré à chaque lancement :
//   — UN DÉFAUT DE CHEMIN SE CALCULE, il ne s'écrit pas : `defaut` peut être une fonction du
//     contexte (`userData`, le dossier personnel, et `ressources`, ce que l'installeur a posé, soit
//     `process.resourcesPath`). Un chemin écrit en dur serait faux sur la machine suivante ;
//   — `config.propose.json`, à côté de `config.json`, porte à chaque lancement les valeurs EN
//     VIGUEUR sur cette machine, dans la section de son système, et se relit sans un problème. La
//     personne recopie dans `config.json` ce qu'elle veut changer, et rien d'autre ;
//   — RIEN N'EST FIGÉ : une version qui déplace un dossier par défaut s'applique, puisque
//     `config.json` ne porte que ce que la personne a écrit. Sous Linux, c'est même nécessaire : un
//     AppImage se monte à un chemin qui change à chaque lancement (`/tmp/.mount_…`).
"use strict";

const path = require("path");

/**
 * Les clés que le fichier peut porter.
 *
 * Une clé s'écrit `{ type, defaut, ...bornes, systemes?, env? }`, où `type` est l'un de `TYPES`,
 * `systemes` les systèmes où elle a un sens (`windows`, `linux`), et `env` la variable d'environnement
 * qui l'emporte sur le fichier. `defaut` est une valeur, ou une fonction du contexte pour un chemin :
 * voir l'en-tête. Chaque clé a sa ligne dans `CONFIGURATION.md` et un lecteur dans le code.
 */
const SCHEMA = Object.freeze({
  /**
   * LE PLAFOND D'UN PAQUET `.attic`, décompressé, à l'écriture comme à la lecture (pièce C1). Le
   * défaut est l'ancien `PLAFOND_PAQUET` de `src/ui/paquet/format-paquet.ts`, 1 Gio.
   *
   * LA BORNE HAUTE EST MESURÉE, et non choisie. Le plan proposait 3,5 Gio, sous les 4 Gio d'un zip
   * sans zip64. Relevé le 2026-11-19 dans Electron 43 sous Windows : le rendu n'alloue pas d'un
   * seul tenant plus de 2 145 386 496 octets (2 Gio moins 2 Mio), et l'archive y existe d'un seul
   * tenant à l'export comme à l'import. Avec les en-têtes du zip, 2000 Mio laissent 40 Mo de marge ;
   * 1,95 Gio a passé le pont dans les deux sens. Le coût en est dit dans `CONFIGURATION.md`.
   */
  plafondPaquetMio: Object.freeze({ type: "nombre", defaut: 1024, min: 256, max: 2000 }),
  /**
   * LE BUDGET MÉMOIRE, en Gio : ce que la personne accorde à Attic sur cette machine (pièce C2). Le
   * défaut est LU SUR LA MACHINE, comme le plan le proposait : sa mémoire vive, et sous Linux la
   * limite de son groupe de contrôle si elle est plus basse. Voir `budgetDeLaMachine`.
   *
   * IL NE BORNE PAS LA MÉMOIRE : le tas JavaScript reste à 4 Gio sur les deux systèmes. Il règle ce
   * qu'Attic choisit de garder (`src/ui/budget-memoire.ts`) : le seuil des aperçus, la profondeur de
   * l'historique, et l'alerte de l'indicateur de mémoire.
   */
  budgetMemoireGio: Object.freeze({ type: "nombre", defaut: budgetDeLaMachine, min: 2, max: 4096 }),
});

/** Un gibioctet. */
const GIO = 1024 ** 3;

/** La mémoire d'une « machine courante » : celle pour laquelle les seuils d'avant C2 ont été posés. */
const BUDGET_REFERENCE_GIO = 16;

/**
 * Ce que la machine offre, en Gio arrondis au dixième inférieur, dans les bornes de la clé.
 *
 * `memoire` est `{ totale, contrainte }` en octets : `os.totalmem()` et `process.constrainedMemory()`.
 * SOUS LINUX, LA PLUS BASSE DES DEUX : un conteneur ou une session bornée par `systemd` voit toute la
 * mémoire de la machine dans `totalmem`, et le noyau le tue à sa propre limite. `constrainedMemory`
 * rend 0 sans contrainte, et parfois un nombre immense : seule une limite plus basse compte. Sous
 * Windows, la machine. Sans mesure (un test, un contexte incomplet), la machine de référence.
 */
function budgetDeLaMachine({ systeme, memoire } = {}) {
  const totale = Number(memoire?.totale) || 0;
  const contrainte = Number(memoire?.contrainte) || 0;
  const octets = systeme === "linux" && contrainte > 0 && (totale === 0 || contrainte < totale) ? contrainte : totale;
  if (!(octets > 0)) return BUDGET_REFERENCE_GIO;
  return Math.min(4096, Math.max(2, Math.floor((octets / GIO) * 10) / 10));
}

/** Le nom de section de chaque plateforme de Node qu'Attic sert. */
const SYSTEMES = Object.freeze({ win32: "windows", linux: "linux" });
const SECTIONS = Object.freeze(Object.values(SYSTEMES));

const systemeDe = (plateforme) => SYSTEMES[plateforme] ?? null;
const estObjet = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** La ligne, comptée depuis un, où tombe ce décalage dans le texte. */
function ligneDe(texte, position) {
  return texte.slice(0, Math.max(0, position)).split("\n").length;
}

/** Le texte du fichier, en objet, ou l'erreur qui l'en empêche. */
function analyser(brut) {
  const texte = String(brut ?? "").replace(/^\uFEFF/, "");
  if (texte.trim() === "") return { objet: {} };
  let objet;
  try {
    objet = JSON.parse(texte);
  } catch (e) {
    const message = String(e?.message ?? e);
    const position = /position (\d+)/.exec(message);
    return { probleme: { code: "syntaxe", ligne: position ? ligneDe(texte, Number(position[1])) : undefined, detail: message } };
  }
  if (!estObjet(objet)) return { probleme: { code: "racine", detail: Array.isArray(objet) ? "tableau" : typeof objet } };
  return { objet };
}

/** Un chemin écrit dans le fichier, rendu absolu et normalisé pour ce système, ou `null`. */
function cheminDe(valeur, systeme, home) {
  if (typeof valeur !== "string" || valeur.trim() === "") return null;
  const p = systeme === "windows" ? path.win32 : path.posix;
  let v = valeur.trim();
  if (v === "~" || v.startsWith("~/") || (systeme === "windows" && v.startsWith("~\\"))) {
    if (!home) return null;
    v = p.join(home, v.slice(1));
  }
  const normal = p.normalize(v);
  // SOUS WINDOWS, UNE LETTRE DE LECTEUR OU UN PARTAGE RÉSEAU : `\dossier` est « absolu » pour
  // `path.win32`, mais se résout contre le lecteur courant, que personne n'a écrit.
  const absolu = systeme === "windows" ? /^([a-zA-Z]:\\|\\\\[^\\]+\\[^\\]+)/.test(normal) : p.isAbsolute(normal);
  return absolu ? normal : null;
}

/**
 * Ce que chaque type accepte. Chacun rend `{ valeur }` ou `{ code }`, et reçoit la valeur telle
 * qu'écrite dans le fichier, ou telle que lue dans l'environnement quand `depuisEnv` est vrai.
 */
const TYPES = Object.freeze({
  nombre(v, d, { depuisEnv }) {
    const n = depuisEnv ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return { code: "type" };
    if ((d.min !== undefined && n < d.min) || (d.max !== undefined && n > d.max)) return { code: "bornes" };
    return { valeur: n };
  },
  booleen(v, _d, { depuisEnv }) {
    if (depuisEnv) {
      if (["1", "true", "oui"].includes(String(v).toLowerCase())) return { valeur: true };
      if (["0", "false", "non"].includes(String(v).toLowerCase())) return { valeur: false };
      return { code: "type" };
    }
    return typeof v === "boolean" ? { valeur: v } : { code: "type" };
  },
  choix(v, d) {
    if (typeof v !== "string") return { code: "type" };
    return d.valeurs.includes(v) ? { valeur: v } : { code: "choix" };
  },
  texte(v) {
    return typeof v === "string" ? { valeur: v } : { code: "type" };
  },
  chemin(v, _d, { systeme, home }) {
    if (typeof v !== "string") return { code: "type" };
    const c = cheminDe(v, systeme, home);
    return c ? { valeur: c } : { code: "chemin" };
  },
  chemins(v, _d, { systeme, home, depuisEnv }) {
    // DANS L'ENVIRONNEMENT, UNE LISTE SE SÉPARE COMME UN `PATH` : `;` sous Windows, `:` sous Linux.
    const liste = depuisEnv
      ? String(v).split(systeme === "windows" ? path.win32.delimiter : path.posix.delimiter).filter((x) => x.trim() !== "")
      : v;
    if (!Array.isArray(liste)) return { code: "type" };
    const chemins = liste.map((x) => cheminDe(x, systeme, home));
    return chemins.every((c) => c) ? { valeur: Object.freeze(chemins) } : { code: "chemin" };
  },
});

/** Vérifie une valeur contre sa clé. */
function verifier(d, v, contexte) {
  const type = TYPES[d.type];
  if (!type) return { code: "schema" };
  return type(v, d, contexte);
}

/**
 * Les valeurs d'une configuration, à partir du texte du fichier.
 *
 * Rend `{ valeurs, sources, problemes }`, figés. `sources` dit d'où vient chaque valeur : `defaut`,
 * `fichier` ou `environnement`. `texte` peut être vide ou absent : ce sont alors les défauts, et
 * l'environnement.
 */
function lireConfiguration({ texte = "", plateforme, env = {}, home = "", userData = "", ressources = "", memoire = null, schema = SCHEMA } = {}) {
  const systeme = systemeDe(plateforme);
  const valeurs = {};
  const sources = {};
  const problemes = [];
  // LE DÉFAUT D'UN CHEMIN EST CELUI DE CETTE MACHINE, calculé depuis ce que l'installeur a posé ;
  // celui du budget, depuis la mémoire qu'elle offre (`memoire`, `{ totale, contrainte }` en octets).
  const contexte = Object.freeze({ systeme, home, userData, ressources, env, memoire });
  for (const [cle, d] of Object.entries(schema)) {
    valeurs[cle] = typeof d.defaut === "function" ? d.defaut(contexte) : d.defaut;
    sources[cle] = "defaut";
  }

  const lu = analyser(texte);
  if (lu.probleme) problemes.push(lu.probleme);
  const objet = lu.objet ?? {};

  // LA PARTIE COMMUNE D'ABORD, PUIS LA SECTION DE CE SYSTÈME, qui l'emporte sur elle.
  const commun = Object.entries(objet).filter(([cle]) => !SECTIONS.includes(cle));
  let propre = [];
  if (systeme && objet[systeme] !== undefined) {
    if (estObjet(objet[systeme])) propre = Object.entries(objet[systeme]);
    else problemes.push({ code: "section", cle: systeme });
  }
  for (const [ou, entrees] of [["commun", commun], [systeme, propre]]) {
    for (const [cle, v] of entrees) {
      const d = schema[cle];
      if (!d) { problemes.push({ code: "inconnue", cle, section: ou }); continue; }
      if (d.systemes && !d.systemes.includes(systeme)) { problemes.push({ code: "autre-systeme", cle, section: ou, detail: d.systemes.join(",") }); continue; }
      const r = verifier(d, v, { systeme, home, depuisEnv: false });
      if (r.code) { problemes.push({ code: r.code, cle, section: ou }); continue; }
      valeurs[cle] = r.valeur;
      sources[cle] = "fichier";
    }
  }

  // L'ENVIRONNEMENT L'EMPORTE : `ATTIC_RACINES` et ses voisines restent valables, et se posent
  // naturellement dans un lanceur `.desktop` ou un shell.
  for (const [cle, d] of Object.entries(schema)) {
    if (!d.env || env[d.env] === undefined || env[d.env] === "") continue;
    if (d.systemes && !d.systemes.includes(systeme)) continue;
    const r = verifier(d, env[d.env], { systeme, home, depuisEnv: true });
    if (r.code) { problemes.push({ code: r.code, cle, section: "environnement", detail: d.env }); continue; }
    valeurs[cle] = r.valeur;
    sources[cle] = "environnement";
  }

  return { valeurs: Object.freeze(valeurs), sources: Object.freeze(sources), problemes: Object.freeze(problemes.map(Object.freeze)) };
}

/**
 * Le fichier peut-il être appliqué ? Sous Linux, pas s'il est inscriptible par le groupe ou par
 * tous : il dira où le pont peut écrire. Sous Windows, le profil de la personne en tient lieu.
 */
function fichierAppliquable({ plateforme, mode }) {
  if (systemeDe(plateforme) !== "linux" || typeof mode !== "number") return true;
  return (mode & 0o022) === 0;
}

/**
 * Lit le fichier et rend sa configuration. N'échoue jamais : un fichier absent, illisible ou refusé
 * rend les défauts et l'environnement, et dit pourquoi.
 *
 * `systeme` y est, `windows` ou `linux` : l'interface en a besoin pour la marge du budget mémoire,
 * plus large sous Linux (pièce C2), et ne doit pas le deviner.
 */
function chargerConfiguration({ chemin, plateforme, env = {}, home = "", userData = "", ressources = "", memoire = null, lire, statut, schema = SCHEMA }) {
  const commun = { plateforme, env, home, userData, ressources, memoire, schema };
  let info;
  try {
    info = statut(chemin);
  } catch (e) {
    const absent = e?.code === "ENOENT";
    const base = lireConfiguration(commun);
    return { chemin, systeme: systemeDe(plateforme), fichier:absent ? "absent" : "illisible", ...base,
      problemes: absent ? base.problemes : Object.freeze([{ code: "illisible", detail: String(e?.code ?? e) }, ...base.problemes]) };
  }
  if (!fichierAppliquable({ plateforme, mode: info?.mode })) {
    const base = lireConfiguration(commun);
    const mode = (info.mode & 0o777).toString(8).padStart(3, "0");
    return { chemin, systeme: systemeDe(plateforme), fichier:"refuse", ...base, problemes: Object.freeze([{ code: "mode", detail: mode }, ...base.problemes]) };
  }
  let texte;
  try {
    texte = lire(chemin);
  } catch (e) {
    const base = lireConfiguration(commun);
    return { chemin, systeme: systemeDe(plateforme), fichier:"illisible", ...base, problemes: Object.freeze([{ code: "illisible", detail: String(e?.code ?? e) }, ...base.problemes]) };
  }
  return { chemin, systeme: systemeDe(plateforme), fichier: "lu", ...lireConfiguration({ ...commun, texte }) };
}

/**
 * Le contenu de `config.propose.json` : les valeurs en vigueur sur cette machine, dans la section de
 * son système, prêtes à être recopiées une à une dans `config.json`.
 *
 * SE RELIT SANS UN PROBLÈME, et c'est ce qui le rend sûr à recopier : seules y sont les clés qui ont
 * un sens sur ce système, et une valeur absente (`null`, `undefined`) n'y est pas écrite.
 */
function proposition({ valeurs, plateforme, schema = SCHEMA }) {
  const systeme = systemeDe(plateforme);
  const section = {};
  for (const [cle, d] of Object.entries(schema)) {
    if (d.systemes && !d.systemes.includes(systeme)) continue;
    if (valeurs[cle] === null || valeurs[cle] === undefined) continue;
    section[cle] = valeurs[cle];
  }
  return systeme ? { [systeme]: section } : {};
}

const PHRASES = Object.freeze({
  syntaxe: (p) => `le fichier n'est pas du JSON valide${p.ligne ? ` (ligne ${p.ligne})` : ""} : ${p.detail}`,
  racine: (p) => `le fichier doit contenir un objet, et non ${p.detail}`,
  section: (p) => `la section « ${p.cle} » doit être un objet`,
  inconnue: (p) => `clé inconnue « ${p.cle} »${p.section !== "commun" ? ` dans la section « ${p.section} »` : ""}, ignorée`,
  "autre-systeme": (p) => `« ${p.cle} » ne vaut que sous ${p.detail.replace(",", " et ")}, ignorée`,
  type: (p) => `« ${p.cle} » n'a pas le bon type${p.detail ? ` (variable ${p.detail})` : ""}, le défaut s'applique`,
  bornes: (p) => `« ${p.cle} » est hors de ses bornes${p.detail ? ` (variable ${p.detail})` : ""}, le défaut s'applique`,
  choix: (p) => `« ${p.cle} » n'est pas une valeur permise${p.detail ? ` (variable ${p.detail})` : ""}, le défaut s'applique`,
  chemin: (p) => `« ${p.cle} » n'est pas un chemin absolu${p.detail ? ` (variable ${p.detail})` : ""}, le défaut s'applique`,
  schema: (p) => `« ${p.cle} » a un type inconnu du schéma`,
  illisible: (p) => `le fichier est illisible (${p.detail}) ; les défauts s'appliquent`,
  mode: (p) => `le fichier est inscriptible par le groupe ou par tous (mode ${p.detail}) : il n'est pas appliqué`,
});

/** Un problème, en une phrase pour le journal du processus principal. */
function formulerProbleme(p) {
  return (PHRASES[p.code] ?? ((q) => `problème ${q.code}`))(p);
}

module.exports = { SCHEMA, TYPES, BUDGET_REFERENCE_GIO, budgetDeLaMachine, lireConfiguration, chargerConfiguration, fichierAppliquable, formulerProbleme, cheminDe, proposition };
