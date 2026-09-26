// src/docs/compte-lignes.ts — Le décompte des lignes de `src/`, calculé plutôt que recopié.
//
// POURQUOI CE MODULE EXISTE. `LINE-COUNT.md` était versionné depuis longtemps sans que rien ne le
// tienne : il annonçait des fichiers disparus et ignorait ceux qui étaient nés. Un fichier engendré
// que rien ne régénère ne vaut pas mieux qu'un commentaire périmé, et il vaut moins qu'un fichier
// absent, parce qu'on le croit.
//
// CE QU'IL COMPTE. Toutes les lignes, y compris vides et commentaires. Compter autre chose
// demanderait de décider ce qu'est une ligne de code, ce qui est une querelle sans fin et sans
// intérêt ici : ce tableau sert à voir où le poids se concentre, pas à mesurer une productivité.
//
// POURQUOI UN SEUIL. Deux cent quarante fichiers dans un tableau ne se lisent pas. Ceux qui pèsent
// moins que le seuil sont comptés dans un total, ce qui garde la somme juste sans noyer la liste.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Les extensions retenues : ce qui s'écrit à la main dans `src/`. */
const EXTENSIONS = [".ts", ".tsx", ".css"];

/** En deçà, un fichier est compté dans le total mais pas listé. */
export const SEUIL_LIGNES = 200;

export interface Compte {
  /** Le chemin depuis la racine du dépôt, en barres obliques. */
  fichier: string;
  lignes: number;
}

function parcourir(racine: string, dossier: string, out: string[]): void {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) parcourir(racine, p, out);
    else if (EXTENSIONS.some((x) => e.name.endsWith(x))) out.push(p);
  }
}

/** Le décompte de chaque fichier de `src/`, du plus lourd au plus léger. */
export function compterLignes(racine: string): Compte[] {
  const chemins: string[] = [];
  parcourir(racine, join(racine, "src"), chemins);
  const comptes = chemins.map((p) => ({
    fichier: relative(racine, p).split(sep).join("/"),
    // Un fichier qui ne finit pas par un saut de ligne a quand même sa dernière ligne.
    lignes: readFileSync(p, "utf8").split("\n").length,
  }));
  return comptes.sort((a, b) => b.lignes - a.lignes || a.fichier.localeCompare(b.fichier));
}

/** Le tableau versionné, tel qu'il s'écrit dans `LINE-COUNT.md`. */
export function tableEnTexte(comptes: Compte[]): string {
  const total = comptes.reduce((s, c) => s + c.lignes, 0);
  const gros = comptes.filter((c) => c.lignes >= SEUIL_LIGNES);
  const petits = comptes.length - gros.length;
  const lignesPetits = total - gros.reduce((s, c) => s + c.lignes, 0);

  const l: string[] = [];
  l.push("# File Line Count");
  l.push("");
  l.push("Generated from `src/` — all `.ts`, `.tsx` and `.css` files, blank lines and comments included.");
  l.push("Regenerate with `npm run docs:lignes`; a test fails when this file no longer matches the sources.");
  l.push("");
  l.push(`**${comptes.length} files, ${total} lines.** The table lists the ${gros.length} files of ${SEUIL_LIGNES} lines or more;`);
  l.push(`the remaining ${petits} account for ${lignesPetits} lines.`);
  l.push("");
  l.push("| File | Lines |");
  l.push("|---|---:|");
  for (const c of gros) l.push(`| ${c.fichier} | ${c.lignes} |`);
  l.push("");
  return l.join("\n");
}
