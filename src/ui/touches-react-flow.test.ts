// ui/touches-react-flow.test.ts — Une touche donnée à React Flow ne s'écrit pas comme un tableau neuf
// dans le rendu.
//
// POURQUOI CE GARDE. React Flow suit les touches enfoncées par des écouteurs qu'il repose chaque fois
// que la touche qu'on lui donne change d'identité. `deleteKeyCode={["Delete"]}` dans `App.tsx` était
// un tableau neuf à chaque rendu : les écouteurs étaient retirés et reposés à chaque rendu, et un
// relâchement tombé entre les deux n'était jamais vu. MESURÉ le 2026-11-10 : après un tournage de la
// démonstration, un Ctrl+Z fait quatre rendus entre l'appui de Z et son relâchement ; Z restait
// « enfoncé » pour React Flow, et le Suppr suivant, qui ne correspondait plus à la touche seule,
// était perdu. `tests-e2e/demonstration.spec.ts` tient le parcours dans l'application.
//
// CE QU'IL CHERCHE : UNE FORME. Une des cinq props de touche de React Flow suivie d'un tableau ou
// d'un objet écrit sur place, dans `src/ui` et `src/vues-domaine`, commentaires retirés. Une
// constante déclarée hors du rendu passe ; elle se lit par son nom.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const DOSSIERS = ["ui", "vues-domaine"];
const PROPS = ["deleteKeyCode", "selectionKeyCode", "multiSelectionKeyCode", "panActivationKeyCode", "zoomActivationKeyCode"];

/** Une prop de touche suivie d'un tableau ou d'un objet écrit sur place. */
const SUR_PLACE = new RegExp(`\\b(${PROPS.join("|")})\\s*=\\s*\\{\\s*[[{]`, "g");

const sansCommentaires = (texte: string) =>
  texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Les props de touche écrites sur place dans un texte source. */
export const fautes = (texte: string) => [...sansCommentaires(texte).matchAll(SUR_PLACE)].map((m) => m[1]);

function sources(dossier: string): string[] {
  const rendu: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) rendu.push(...sources(chemin));
    else if (nom.endsWith(".tsx") && !nom.endsWith(".test.tsx")) rendu.push(chemin);
  }
  return rendu;
}

describe("les touches données à React Flow", () => {
  it("LE MOTIF VOIT UN TABLEAU ÉCRIT SUR PLACE, et laisse passer une constante", () => {
    expect(fautes(`<ReactFlow deleteKeyCode={["Delete"]} />`)).toEqual(["deleteKeyCode"]);
    expect(fautes(`<ReactFlow multiSelectionKeyCode={ ["Control"] } />`)).toEqual(["multiSelectionKeyCode"]);
    expect(fautes(`<ReactFlow deleteKeyCode={TOUCHES_SUPPRESSION} />`)).toEqual([]);
    expect(fautes(`// deleteKeyCode={["Delete"]}\n<ReactFlow deleteKeyCode={TOUCHES} />`)).toEqual([]);
  });

  it("AUCUNE TOUCHE N'EST UN TABLEAU NEUF À CHAQUE RENDU, dans l'interface", () => {
    const releve: string[] = [];
    let lus = 0;
    for (const d of DOSSIERS) {
      for (const f of sources(join(SRC, d))) {
        const texte = readFileSync(f, "utf8");
        if (texte.includes("<ReactFlow")) lus++;
        for (const prop of fautes(texte)) releve.push(`${relative(SRC, f).replace(/\\/g, "/")} : ${prop}`);
      }
    }
    // LE DÉNOMINATEUR : le canevas de `ui/App.tsx` au moins. Sans lui, le garde ne lit rien.
    expect(lus, "aucun <ReactFlow> lu : le garde regarde ailleurs").toBeGreaterThanOrEqual(1);
    expect(releve, "une touche de React Flow se déclare en constante hors du rendu").toEqual([]);
  });
});
