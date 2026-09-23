// src/ui/vues-hauteur.test.ts — Les classes de vue qui exigent un nœud de taille explicite.
//
// POURQUOI CE GARDE EXISTE. Les trois règles `.attic-node-vue-vexflow` d'`atelier.css` forment une
// chaîne de hauteur en pourcentage : `height: 100%` sur le nœud, `flex: 1` sur le conteneur,
// `height: 100%` sur le SVG. Elle ne se résout que si un ancêtre porte une hauteur en PIXELS. Or
// seuls les composants dont l'identifiant commence par `vexflow-` en reçoivent une : eux seuls
// obtiennent un `NodeResizer` (`AtelierNode.tsx`, `estVexFlow`), qui pose width et height sur le
// nœud.
//
// Une vue qui emprunte ces classes pour un AUTRE composant voit donc sa boîte s'écraser à zéro.
// Sans erreur, sans avertissement, et sans trace : le conteneur est en `overflow: hidden`, si bien
// que le dessin est bel et bien dans la page — mesurable, ses balises en place — et que rien ne
// s'en voit. C'est arrivé deux fois le même jour, au cercle pulsant et à la partition gravée, en
// remplaçant une vue qui portait son propre `NodeResizer` par une vue qui n'en a pas.
//
// Aucun outil ne pouvait le voir. TypeScript ne connaît pas les noms de classe ; jsdom ne calcule
// aucune mise en page, et rend zéro pour toute mesure de boîte. Le contrat n'était écrit nulle
// part : il l'est ici.
//
// CE QU'IL FAUT FAIRE si ce test échoue : ne pas ajouter l'identifiant à la liste. Donner à la vue
// un conteneur dont la hauteur ne dépend d'aucun ancêtre — `aspect-ratio` pour une image carrée,
// `height: auto` sur un SVG qui porte ses proportions —, comme `.attic-node-vue-animation` et
// `.attic-node-vue-gravure` le font.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(process.cwd(), "src/ui/vues.tsx"), "utf8");

/** Les composants de vue déclarés dans `vues.tsx`, chacun avec son corps. */
function vuesDeclarees(): Map<string, string> {
  const vues = new Map<string, string>();
  const debuts: { nom: string; index: number }[] = [];
  const re = /^function (Vue\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SOURCE)) !== null) debuts.push({ nom: m[1], index: m.index });
  debuts.forEach((d, i) => {
    const fin = i + 1 < debuts.length ? debuts[i + 1].index : SOURCE.length;
    vues.set(d.nom, SOURCE.slice(d.index, fin));
  });
  return vues;
}

/** Les identifiants de composant que le registre associe à cette vue. */
function identifiantsDe(nomVue: string): string[] {
  const ligne = SOURCE.split("\n").find((l) => l.includes(`vue: ${nomVue},`));
  if (!ligne) return [];
  // La seule partie qui nomme des composants est `correspond:` ; ce qui suit `vue:` est la vue et
  // sa position, dont les chaînes n'ont rien à faire ici.
  const condition = ligne.slice(0, ligne.indexOf(`vue: ${nomVue},`));
  return [...condition.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

describe("les vues qui empruntent les classes VexFlow", () => {
  it("n'habillent que des composants de taille explicite", () => {
    const fautives: string[] = [];
    for (const [nom, corps] of vuesDeclarees()) {
      if (!corps.includes("attic-node-vue-vexflow")) continue;
      const ids = identifiantsDe(nom);
      // Une vue branchée par préfixe (`f.startsWith("vexflow-")`) ne cite aucun identifiant : elle
      // ne couvre que la famille qui reçoit un NodeResizer, et c'est le cas voulu.
      for (const id of ids) {
        if (!id.startsWith("vexflow-")) fautives.push(`${nom} → « ${id} »`);
      }
    }
    expect(fautives, [
      "Ces vues posent les classes `attic-node-vue-vexflow` sur des composants qui ne reçoivent",
      "aucune hauteur en pixels : leur contenu sera écrasé à zéro, sans erreur ni trace.",
      "Voir l'en-tête de ce fichier pour le remède.",
      ...fautives.map((f) => `  — ${f}`),
    ].join("\n")).toEqual([]);
  });

  it("les deux conteneurs autonomes portent bien leur propre hauteur", () => {
    // Le remède se vérifie aussi : un conteneur « autonome » qui perdrait sa règle de hauteur
    // redeviendrait exactement le piège qu'il remplace.
    const css = readFileSync(join(process.cwd(), "src/ui/atelier.css"), "utf8");
    const regle = (selecteur: string) =>
      css.split("\n").find((l) => l.trimStart().startsWith(selecteur + " ")) ?? "";
    expect(regle(".attic-node-vue-animation-inner")).toContain("aspect-ratio");
    expect(regle(".attic-node-vue-gravure-inner svg")).toContain("height: auto");
  });
});
