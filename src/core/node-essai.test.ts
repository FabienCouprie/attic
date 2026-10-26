// @vitest-environment jsdom
// core/node-essai.test.ts — Ce qu'un noeud installe atteint vraiment, mesure et non lu.
//
// POURQUOI CES CAS EXISTENT. Le dossier portait un commentaire affirmant « Sans window — le code
// installe n'a pas acces au DOM/localStorage ». C'etait FAUX : `new Function` ne cree aucun bac a
// sable, seuls ses parametres masquent des noms, et le corps s'execute dans la portee globale.
//
// UN COMMENTAIRE FAUX SUR UNE PROPRIETE DE SECURITE EST PIRE QUE PAS DE COMMENTAIRE : il arrete
// celui qui serait venu regarder. Ces cas remplacent l'affirmation par une MESURE, et la mesure
// reste la — si quelqu'un isole un jour ce code, c'est ici que l'effet se verra.
//
// LA SONDE NE COMMET RIEN. Elle n'ecrit aucun fichier, n'ouvre rien : elle rapporte ce qui est a sa
// portee. Un noeud d'essai qui demontrerait l'attaque en la commettant serait une attaque dans le
// depot.
import { describe, expect, it } from "vitest";

import { SONDE_ENVIRONNEMENT } from "./node-essai";

/**
 * Evalue le code d'un noeud comme `charger()` le fait, et rend ce que la sonde a vu.
 *
 * C'EST LA MEME MECANIQUE, volontairement recopiee ici et nulle part ailleurs : si `nodes-installes`
 * change de mecanique, ce cas ne le verra pas tout seul, et c'est pourquoi il y a aussi un cas qui
 * tient la FORME de l'appel dans `nodes-installes.ts`.
 */
async function sonder(contexteAttic: Record<string, unknown>) {
  const moduleObj = { exports: null as unknown as (c: unknown) => Promise<{ valeurs: string[] }> };
  const fn = new Function("module", "exports", "attic", `"use strict";\n${SONDE_ENVIRONNEMENT}`);
  fn(moduleObj, moduleObj.exports, contexteAttic);
  const res = await moduleObj.exports({});
  return JSON.parse(res.valeurs[0]) as Record<string, string>;
}

describe("ce qu'un noeud installe atteint", () => {
  it("ATTEINT `window` ET `globalThis` — le commentaire « Sans window » etait faux", async () => {
    const vu = await sonder({});
    expect(vu.window, "`new Function` n'isole rien : le corps tourne dans la portee globale")
      .toBe("object");
    expect(vu.globalThis).toBe("object");
    expect(vu.document).toBe("object");
    expect(vu.localStorage).toBe("object");
  });

  it("ET IL ATTEINT LE PONT D'ELECTRON quand il est pose, par `window.api`", async () => {
    // Dans l'application reelle, `preload.cjs` pose `window.api`. On le simule : ce cas ne mesure
    // pas Electron, il mesure la PORTEE — un nom pose sur `window` est joignable depuis le noeud.
    (window as unknown as { api?: unknown }).api = { fichier: {} };
    try {
      const vu = await sonder({});
      expect(vu.windowApi, "le pont reste joignable depuis un noeud installe").toBe("object");
    } finally {
      delete (window as unknown as { api?: unknown }).api;
    }
  });

  it("CE QUE LE DOMAINE PRETE ARRIVE BIEN, et c'est compte sans etre nomme", async () => {
    // `atticCtx` met des outils sous la main. C'est une COMMODITE, pas une barriere — mais elle doit
    // marcher, sinon un noeud installe ne peut rien fabriquer.
    //
    // LE COMPTE PLUTOT QUE LE NOM, et c'est `frontiere-domaine.test.ts` qui l'a impose : le coeur ne
    // nomme aucun type du domaine, meme dans une chaine de caracteres. La sonde en sort meilleure —
    // elle eprouve le MECANISME du pret, donc elle servira a n'importe quel domaine.
    expect((await sonder({})).pretsDuDomaine, "aucun pret : le compte est nul").toBe(0);
    expect((await sonder({ a: 1, b: 2, c: 3 })).pretsDuDomaine, "trois prets arrives").toBe(3);
  });

  it("ET MASQUER LES NOMS NE SUFFIRAIT PAS : `Function(\"return this\")()` rend le global", async () => {
    // CECI EST LA RAISON POUR LAQUELLE UN MASQUAGE SERAIT UN FAUX REMPART. On pourrait passer
    // `window`, `document`, `api` comme parametres valant `undefined` : les noms seraient masques,
    // et cette ligne-ci donnerait quand meme l'objet global. Une veritable isolation demande un
    // autre contexte d'execution — un Worker —, ou que le PONT lui-meme soit borne.
    const vu = await sonder({});
    expect(vu.parFonction).toBe("object");
  });
});
