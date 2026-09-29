// src/docs/compte-lignes.ts — Le décompte des lignes de `src/`, calculé plutôt que recopié.
//
// POURQUOI CE MODULE EXISTE. `LINE-COUNT.md` était versionné depuis longtemps sans que rien ne le
// tienne : il annonçait des fichiers disparus et ignorait ceux qui étaient nés. Un fichier engendré
// que rien ne régénère ne vaut pas mieux qu'un commentaire périmé, et il vaut moins qu'un fichier
// absent, parce qu'on le croit.
//
// CE QU'IL COMPTAIT, ET POURQUOI C'ÉTAIT ABSURDE. Il comptait TOUTES les lignes, vides et
// commentaires compris, en disant que décider ce qu'est une ligne de code serait une querelle sans
// fin. Relevé par Fabien : « compter les commentaires est absurde ». Il a raison, et pour une raison
// précise : LA NORME DE CE DÉPÔT EST « DE DEUX CENTS À QUATRE CENTS LIGNES, HORS DOCUMENTATION ET
// TRADUCTIONS ». Un tableau qui compte les commentaires ne mesure donc pas la norme, et l'on ne
// pouvait pas s'en servir pour savoir quels fichiers la dépassent. Pire : il punissait un fichier
// bien commenté, ce qui est l'inverse de ce que ce dépôt veut encourager.
//
// CE QU'IL COMPTE MAINTENANT. Deux nombres par fichier. Le POIDS, toutes lignes confondues, qui dit
// ce qu'il en coûte d'ouvrir le fichier. Et le CODE, qui est ce que la norme mesure : ni ligne vide,
// ni commentaire, ni documentation, ni traduction.
//
// LES QUATRE EXCLUSIONS, ET LEUR RÈGLE EXACTE.
//  · Ligne vide : elle ne dit rien.
//  · Commentaire : une ligne dont le premier caractère non blanc ouvre un commentaire, et toute
//    ligne comprise dans un bloc `/* … */`. Un commentaire EN FIN DE LIGNE ne retire pas la ligne :
//    il y a du code devant.
//  · Documentation : la valeur d'un champ `notice`, `doc` ou `resume`, qui sont les trois champs par
//    lesquels un composant s'explique. Ces valeurs tiennent souvent sur une ligne de plusieurs
//    milliers de signes, et parfois sur un gabarit de plusieurs lignes ; les deux sont suivis
//    jusqu'à la fermeture de la chaîne.
//  · Traduction : un champ dont le nom finit par `En`, et une entrée de table de traduction,
//    c'est-à-dire une ligne qui n'est qu'une clé entre guillemets suivie d'une chaîne.
//
// CE QUE CETTE RÈGLE NE SAIT PAS FAIRE, DIT PLUTÔT QUE TU. Une chaîne qui contiendrait `*/` ferme
// un bloc de commentaire qui n'était pas ouvert, et une accolade dans une documentation ne compte
// pas. Ces cas n'existent pas dans le dépôt et le comptage n'a pas à être exact au signe près : il
// sert à voir quels fichiers dépassent la norme, pas à mesurer une productivité.
//
// POURQUOI UN SEUIL. Deux cent quarante fichiers dans un tableau ne se lisent pas. Le seuil est
// celui de la norme elle-même, deux cents lignes de code : en deçà, un fichier n'a rien à dire.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Les extensions retenues : ce qui s'écrit à la main dans `src/`. */
const EXTENSIONS = [".ts", ".tsx", ".css"];

/** Le bas de la norme : en deçà, un fichier n'est pas listé. */
export const SEUIL_LIGNES = 200;

/** Le haut de la norme, fixé par Fabien : au-delà, un fichier est à découper. */
export const NORME_MAX = 400;

export interface Compte {
  /** Le chemin depuis la racine du dépôt, en barres obliques. */
  fichier: string;
  /** Toutes les lignes, vides et commentaires compris. */
  lignes: number;
  /** Celles que la norme mesure : ni vide, ni commentaire, ni documentation, ni traduction. */
  code: number;
}

/** Les champs par lesquels un composant s'explique : leur valeur est de la documentation. */
const CHAMPS_DOCUMENTATION = /^\s*(notice|doc|resume)\s*:/;

/** Un champ dont le nom finit par `En` porte une traduction. */
const CHAMP_TRADUIT = /^\s*[A-Za-z_$][\w$]*En\s*:/;

/**
 * Une entrée de table de traduction, sous les deux formes que le dépôt emploie : une clé entre
 * guillemets suivie d'une chaîne, ou suivie d'une paire `{ fr: …, en: … }`.
 *
 * LA SECONDE FORME EST CELLE DE `i18n.tsx`, et l'oublier laissait ce fichier annoncer treize cents
 * lignes de code quand il n'est presque que de la traduction.
 */
const ENTREE_DE_TRADUCTION = [
  /^\s*"[^"]*"\s*:\s*(["'`]).*\1\s*,?\s*$/,
  /^\s*"[^"]*"\s*:\s*\{\s*fr\s*:.*\}\s*,?\s*$/,
];

/**
 * Le nombre de lignes, et celles qui sont du code.
 *
 * SÉPARÉE DU PARCOURS DE FICHIERS pour qu'un cas de test puisse l'éprouver sur un texte construit,
 * ce qui est la seule façon de vérifier une règle de comptage : sur le dépôt réel, on ne saurait
 * pas ce qu'on attend.
 */
export function compterUnTexte(texte: string): { lignes: number; code: number } {
  // Un fichier qui ne finit pas par un saut de ligne a quand même sa dernière ligne.
  const lignes = texte.split("\n");
  let code = 0;
  let dansBloc = false;
  let dansChaine: string | null = null;

  for (const brute of lignes) {
    const l = brute.trim();

    // Une valeur de documentation ou de traduction écrite sur plusieurs lignes : on la suit
    // jusqu'à la fermeture de sa chaîne, et aucune de ses lignes ne compte.
    if (dansChaine) {
      if (l.includes(dansChaine)) dansChaine = null;
      continue;
    }
    if (dansBloc) {
      if (l.includes("*/")) dansBloc = false;
      continue;
    }
    if (l === "") continue;
    if (l.startsWith("//")) continue;
    if (l.startsWith("/*")) {
      if (!l.includes("*/")) dansBloc = true;
      continue;
    }

    const documentation = CHAMPS_DOCUMENTATION.test(brute)
      || CHAMP_TRADUIT.test(brute)
      || ENTREE_DE_TRADUCTION.some((r) => r.test(brute));
    if (documentation) {
      // La valeur tient-elle sur cette ligne ? On le sait au délimiteur ouvrant et à sa fermeture.
      const ouvre = brute.match(/:\s*(["'`])/);
      if (ouvre) {
        const apres = brute.slice(brute.indexOf(ouvre[1], brute.indexOf(":")) + 1);
        if (!apres.includes(ouvre[1])) dansChaine = ouvre[1];
      }
      continue;
    }
    code++;
  }
  return { lignes: lignes.length, code };
}

function parcourir(dossier: string, out: string[]): void {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) parcourir(p, out);
    else if (EXTENSIONS.some((x) => e.name.endsWith(x))) out.push(p);
  }
}

/** Le décompte de chaque fichier de `src/`, du plus lourd en CODE au plus léger. */
export function compterLignes(racine: string): Compte[] {
  const chemins: string[] = [];
  parcourir(join(racine, "src"), chemins);
  const comptes = chemins.map((p) => ({
    fichier: relative(racine, p).split(sep).join("/"),
    ...compterUnTexte(readFileSync(p, "utf8")),
  }));
  return comptes.sort((a, b) => b.code - a.code || a.fichier.localeCompare(b.fichier));
}

/** Le tableau versionné, tel qu'il s'écrit dans `LINE-COUNT.md`. */
export function tableEnTexte(comptes: Compte[]): string {
  const total = comptes.reduce((s, c) => s + c.lignes, 0);
  const totalCode = comptes.reduce((s, c) => s + c.code, 0);
  const gros = comptes.filter((c) => c.code >= SEUIL_LIGNES);
  const petits = comptes.length - gros.length;
  const lignesPetits = total - gros.reduce((s, c) => s + c.lignes, 0);
  const horsNorme = comptes.filter((c) => c.code > NORME_MAX);

  const l: string[] = [];
  l.push("# File Line Count");
  l.push("");
  l.push("Generated from `src/` — every `.ts`, `.tsx` and `.css` file.");
  l.push("Regenerate with `npm run docs:lignes`; a test fails when this file no longer matches the sources.");
  l.push("");
  l.push("**Weight** counts every line. **Code** counts what the repository's size norm measures:");
  l.push("neither blank lines, nor comments, nor documentation (`notice`, `doc`, `resume`), nor");
  l.push("translations (any field whose name ends in `En`, and translation-table entries).");
  l.push("");
  l.push(`**${comptes.length} files, ${total} lines, of which ${totalCode} are code.**`);
  l.push(`The table lists the ${gros.length} files of ${SEUIL_LIGNES} code lines or more, heaviest first;`);
  l.push(`the remaining ${petits} account for ${lignesPetits} lines.`);
  l.push("");
  l.push(`**${horsNorme.length} files exceed the ${NORME_MAX}-code-line norm** and are marked « ! ».`);
  l.push("");
  l.push("| File | Code | Weight | |");
  l.push("|---|---:|---:|---|");
  for (const c of gros) {
    l.push(`| ${c.fichier} | ${c.code} | ${c.lignes} | ${c.code > NORME_MAX ? "!" : ""} |`);
  }
  l.push("");
  return l.join("\n");
}
