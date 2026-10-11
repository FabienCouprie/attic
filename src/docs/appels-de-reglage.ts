// src/docs/appels-de-reglage.ts — Chaque appel de `reglageModule` écrit dans la source des greffons.
//
// POURQUOI CE FICHIER EXISTE, et c'est une fragilité de mes propres gardes qu'il répare.
//
// Deux contrats portent sur ce qu'un APPEL dit, et non sur ce qu'une fiche déclare : le repli des
// bornes quand un nœud ne les porte pas encore, et l'échelle d'une course en unité multiplicative.
// Ni l'un ni l'autre ne laisse de trace dans la définition, puisque ce sont des arguments. Il faut
// donc lire la source, et c'est ce que fait ce module.
//
// CE QU'IL RÉPARE. Mes deux premiers gardes lisaient une FENÊTRE DE LIGNES FIXE après l'appel, six
// pour l'un et sept pour l'autre. Un appel qui porte trois lignes de commentaire dépasse la fenêtre,
// et le garde annonce alors qu'un argument manque alors qu'il est écrit deux lignes plus bas : c'est
// arrivé sur la fréquence de l'aigu de la réverbération à réseau. Un garde qui ne voit pas tout
// l'appel rend un faux positif, ce qui est pire que de ne rien voir, puisqu'on le croit.
//
// LE BLOC SE LIT JUSQU'À SA FERMETURE, et non sur un nombre de lignes : les accolades et les
// parenthèses sont comptées depuis l'appel, et le bloc s'arrête quand le compte revient à zéro.
//
// LA FICHE D'UN APPEL EST CELLE QUI LE PRÉCÈDE LE PLUS PRÈS, un `id: "..."` ou un `effet("...")`.
// C'est une approximation, et la seule possible : un exécuteur est une fermeture, et le nom de sa
// fiche n'apparaît pas dans son texte. Un faux rattachement ferait comparer un appel à la mauvaise
// déclaration ; l'ordre d'un fichier de greffons rend le cas improbable, chaque fiche portant son
// `id` avant son `executer`.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface AppelDeReglage {
  /** Le fichier de greffons, sans son chemin. */
  fichier: string;
  /** La ligne de l'appel, comptée depuis un. */
  ligne: number;
  /** L'identifiant de la fiche qui précède l'appel le plus près. */
  fiche: string;
  /** Le nom du réglage lu, tel que `reglage:` le donne. */
  reglage: string;
  /** Tout le texte de l'appel, de son ouverture à sa fermeture. */
  bloc: string;
}

/** Le texte d'un appel, lu depuis sa ligne jusqu'à ce que ses parenthèses se referment. */
function blocDepuis(lignes: string[], depart: number): string {
  let profondeur = 0;
  let vu = false;
  const morceaux: string[] = [];
  for (let i = depart; i < lignes.length; i++) {
    const ligne = lignes[i];
    morceaux.push(ligne);
    for (const c of ligne) {
      if (c === "(" || c === "{") { profondeur++; vu = true; }
      else if (c === ")" || c === "}") profondeur--;
    }
    if (vu && profondeur <= 0) break;
  }
  return morceaux.join(" ");
}

/**
 * Tous les appels `paramNombre("Nom", littéral)` des fiches, avec la fiche qui les précède.
 *
 * POURQUOI LE LITTÉRAL COMPTE ENCORE. Depuis que `paramNombre` retombe sur le `defaut` DÉCLARÉ du
 * réglage, le littéral d'un appel n'est plus qu'une redondance : il ne sert que là où la fiche ne
 * déclare pas le nom lu, ce qui est le cas d'une lecture de MIGRATION, un réglage qu'une fiche
 * portait autrefois et que les projets enregistrés portent encore. Une redondance qui dérive est
 * trompeuse : elle annonce une valeur que le run n'emploie plus.
 */
export function appelsDeParamNombre(racineSrc: string): {
  fichier: string; ligne: number; fiche: string; reglage: string; litteral: number;
}[] {
  const racine = join(racineSrc, "plugins");
  const out: { fichier: string; ligne: number; fiche: string; reglage: string; litteral: number }[] = [];
  for (const fichier of readdirSync(racine)) {
    if (!/\.ts$/.test(fichier) || /\.test\./.test(fichier)) continue;
    const lignes = readFileSync(join(racine, fichier), "utf-8").split(/\r?\n/);
    let fiche = "";
    for (let i = 0; i < lignes.length; i++) {
      const mId = /id: "([a-z0-9-]+)"/.exec(lignes[i]) ?? /effet\("([a-z0-9-]+)"/.exec(lignes[i]);
      if (mId) fiche = mId[1];
      for (const m of lignes[i].matchAll(/paramNombre\(\s*"([^"]+)"\s*,\s*(-?[0-9][0-9.e-]*)\s*\)/g)) {
        out.push({ fichier, ligne: i + 1, fiche, reglage: m[1], litteral: Number(m[2]) });
      }
    }
  }
  return out;
}

/** Tous les appels de `reglageModule` des fiches écrites à la main. */
export function appelsDeReglage(racineSrc: string): AppelDeReglage[] {
  const racine = join(racineSrc, "plugins");
  const out: AppelDeReglage[] = [];
  for (const fichier of readdirSync(racine)) {
    if (!/\.ts$/.test(fichier) || /\.test\./.test(fichier)) continue;
    const lignes = readFileSync(join(racine, fichier), "utf-8").split(/\r?\n/);
    let fiche = "";
    for (let i = 0; i < lignes.length; i++) {
      const mId = /id: "([a-z0-9-]+)"/.exec(lignes[i]) ?? /effet\("([a-z0-9-]+)"/.exec(lignes[i]);
      if (mId) fiche = mId[1];
      if (!/reglageModule\(/.test(lignes[i])) continue;
      const bloc = blocDepuis(lignes, i);
      const r = /reglage: "([^"]+)"/.exec(bloc);
      if (!r) continue;
      out.push({ fichier, ligne: i + 1, fiche, reglage: r[1], bloc });
    }
  }
  return out;
}
