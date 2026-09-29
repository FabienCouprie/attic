// plugins/jamais-cache.test.ts — L'exception au cache porte sa raison, sur toutes les fiches.
//
// POURQUOI CE BANC EXISTE. `jamaisCache` coûte cher, et ce coût ne se voit pas là où le drapeau se
// pose : un composant qui ne se cache jamais entraîne TOUTE sa descendance à chaque run, même quand
// il rend deux fois exactement la même chose. `core/cache-execution.ts` dit pourquoi cela ne peut
// pas se corriger en comparant les sorties, et `core/cache-execution.test.ts` le démontre.
//
// CE QUE CE BANC EMPÊCHE. Que le drapeau se pose par confort, pour faire rejouer un composant qu'on
// trouve trop obstiné, sans que personne ne sache plus des mois après si la raison tient encore.
// Deux fiches sur neuf l'avaient déjà posé sans une ligne pour l'expliquer.
//
// LA RÈGLE EST SIMPLE ET SE VÉRIFIE À L'ŒIL : une ligne de commentaire juste au-dessus du drapeau.
// Pas dans l'en-tête du fichier, où le lecteur du drapeau ne la trouvera pas.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "./index";

/** Toutes les sources de composants, hors cas de test. */
function sources(dossier = join("src", "plugins")): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...sources(join(dossier, e.name)));
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(join(dossier, e.name));
  }
  return out;
}

/** Chaque endroit où le drapeau est posé, avec la ligne qui le précède. */
function declarations(): { fichier: string; ligne: number; avant: string }[] {
  const out: { fichier: string; ligne: number; avant: string }[] = [];
  for (const f of sources()) {
    const lignes = readFileSync(f, "utf8").split(/\r?\n/);
    lignes.forEach((l, i) => {
      if (/^\s*jamaisCache:\s*true\s*,?\s*$/.test(l)) {
        out.push({ fichier: f, ligne: i + 1, avant: (lignes[i - 1] ?? "").trim() });
      }
    });
  }
  return out;
}

describe("l'exception au cache", () => {
  it("EST DÉCLARÉE QUELQUE PART, sinon ce banc ne garderait rien", () => {
    // Le témoin : si le drapeau disparaissait du dépôt, les cas suivants passeraient à vide.
    expect(declarations().length).toBeGreaterThan(5);
    expect(toutesLesFiches.some((f) => (f as { jamaisCache?: boolean }).jamaisCache === true)).toBe(true);
  });

  it("PORTE SA RAISON JUSTE AU-DESSUS DU DRAPEAU, sur chaque fiche qui la pose", () => {
    const muettes = declarations()
      .filter((d) => !d.avant.startsWith("//"))
      .map((d) => `${d.fichier}:${d.ligne}`);
    expect(
      muettes,
      "écrire au-dessus de `jamaisCache: true` ce que les empreintes du cache ne regardent pas,\n"
      + "et que ce composant rejoue pour cette raison. Voir `core/cache-execution.ts`.",
    ).toEqual([]);
  });

  it("NE SE POSE QUE SUR CE QUE LES EMPREINTES NE REGARDENT PAS, et la raison le dit", () => {
    // Un drapeau se justifie par un état extérieur aux empreintes : un fichier ou un dossier du
    // disque, le graphe entier, le registre, un champ que la vue modifie sans passer par le moteur.
    // Ce cas ne juge pas la raison, il vérifie qu'elle en est une : une phrase, et pas un mot.
    const courtes = declarations()
      .filter((d) => d.avant.startsWith("//") && d.avant.replace(/^\/+\s*/, "").length < 20)
      .map((d) => `${d.fichier}:${d.ligne} — « ${d.avant} »`);
    expect(courtes, "une raison, non une étiquette").toEqual([]);
  });
});
