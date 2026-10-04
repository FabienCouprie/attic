// src/docs/composition.test.ts — La racine de composition est importée avant l'application.
//
// POURQUOI CE TEST, ET IL EST NÉ D'UNE PANNE QUE J'AI PROVOQUÉE.
//
// Le shell ne nomme plus aucun domaine : il demande le registre actif, qu'une racine de composition
// dépose. J'avais écrit ce dépôt dans le CORPS de `main.tsx`, en affirmant que tous les usages du
// registre avaient lieu dans des fonctions. C'était faux : `ui/App.tsx` fait son démarrage au
// chargement du module — sauvegarde restaurée, méta-composants relus, nodes installés —, et les
// imports d'un module sont évalués avant son corps. L'application s'est arrêtée sur « Registre UI
// non configuré » avant de peindre une seule fois.
//
// LA CONTRAINTE EST DONC UN ORDRE D'IMPORTS, et un ordre d'imports ne survit pas au premier outil
// qui les trie, ni à la première relecture qui les range par longueur. Écrit dans un commentaire, il
// se perdrait ; écrit ici, il se casse bruyamment.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "..");
const lire = (f: string) => readFileSync(resolve(RACINE, f), "utf8");

describe("la racine de composition", () => {
  it("EST IMPORTÉE AVANT TOUT LE RESTE dans main.tsx", () => {
    const imports = [...lire("main.tsx").matchAll(/^\s*(?:import|export)[^\n]*?"([^"]+)"/gm)]
      .map((m) => m[1]);
    expect(imports.length, "aucun import trouvé dans main.tsx : la lecture est cassée")
      .toBeGreaterThan(3);
    expect(imports[0], [
      "`./composition` doit être le PREMIER import de main.tsx.",
      "Les imports sont évalués avant le corps du module, et `ui/App.tsx` réclame le registre",
      "dès son chargement : déposé plus tard, il arrive trop tard.",
    ].join("\n")).toBe("./composition");
  });

  it("DÉPOSE LE REGISTRE ET LES LIENS, et c'est tout ce qu'elle fait", () => {
    const src = lire("composition.ts");
    expect(src).toContain("configurerRegistreUI(");
    expect(src).toContain("configurerFavoris(");
  });

  it("ELLE SEULE JOINT LES DEUX CÔTÉS : aucun autre fichier ne dépose le registre", () => {
    // Un second dépôt ailleurs ferait dépendre le résultat de l'ordre des imports, c'est-à-dire du
    // hasard. Les tests, eux, en déposent un : ils n'ont pas de racine de composition.
    const deposants = [...["main.tsx", "composition.ts"], "ui/App.tsx", "ui/registre-actif.ts"]
      .filter((f) => /configurerRegistreUI\s*\(/.test(lire(f)));
    expect(deposants.sort(), [
      "Le registre ne doit être déposé qu'à la racine de composition.",
      "`ui/registre-actif.ts` le DÉCLARE, `composition.ts` l'APPELLE.",
    ].join("\n")).toEqual(["composition.ts", "ui/registre-actif.ts"]);
  });
});
