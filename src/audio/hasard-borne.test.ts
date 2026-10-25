// audio/hasard-borne.test.ts — Une substitution bornee se restaure, meme quand le rendu leve.
//
// POURQUOI CE FICHIER EXISTE. `audio/tone-synths.ts` est le seul endroit du depot autorise a
// remplacer `Math.random`, et `core/hasard-couverture.test.ts` en tient l'inventaire. Mais un
// inventaire ne prouve rien d'un COMPORTEMENT : il dit qu'on a le droit, pas qu'on le fait bien.
//
// LA FAUTE D'ORIGINE, celle qui a fait ecrire ce garde absolu, etait precisement une substitution
// QUI NE RESTAURAIT PAS : apres une execution, tout le reste de l'application tirait sur le
// generateur congruentiel d'un noeud. Le chemin par lequel cela arrive le plus facilement n'est pas
// l'oubli pur — c'est l'EXCEPTION : un rendu qui leve, et la restauration qu'on n'a mise qu'apres
// l'appel. C'est donc ce chemin-la que ce fichier eprouve en premier.
//
// POURQUOI TONE N'EST PAS CHARGE ICI. `avecHasardSeme` ne sait rien de Tone : elle encadre un appel
// quelconque. L'eprouver sur une fonction d'essai la met a nu, sans un moteur audio entre elle et
// le cas — et c'est ce qui permet de lui demander de lever.
import { describe, expect, it } from "vitest";

import { avecHasardSeme } from "./tone-synths";

describe("la substitution bornee du hasard", () => {
  it("RESTAURE APRES UN SUCCES", async () => {
    const avant = Math.random;
    const dedans = await avecHasardSeme(1234, "voix", async () => Math.random);
    expect(dedans, "le rappel doit voir le generateur seme").not.toBe(avant);
    expect(Math.random).toBe(avant);
  });

  it("RESTAURE APRES UNE EXCEPTION, et c'est le chemin par lequel la faute arrive", async () => {
    const avant = Math.random;
    await expect(avecHasardSeme(1234, "voix", async () => { throw new Error("rendu impossible"); }))
      .rejects.toThrow("rendu impossible");
    expect(Math.random, "une exception ne doit pas laisser l'application sur le generateur seme")
      .toBe(avant);
  });

  it("SANS GRAINE, elle ne touche a rien", async () => {
    const avant = Math.random;
    const dedans = await avecHasardSeme(undefined, "voix", async () => Math.random);
    expect(dedans, "sans graine, le rendu est celui qu'il a toujours ete").toBe(avant);
    expect(Math.random).toBe(avant);
  });

  it("MEME GRAINE ET MEME CLE rendent la meme suite", async () => {
    const suite = async () => await avecHasardSeme(4242, "snarenoise|0.2|null", async () =>
      Array.from({ length: 6 }, () => Math.random()));
    expect(await suite()).toEqual(await suite());
  });

  it("DEUX CLES DIFFERENTES rendent deux suites differentes, sous la meme graine", async () => {
    // CHAQUE ECHANTILLON REPART D'UN POINT CONNU, et c'est ce qui rend le rendu independant de
    // l'ORDRE des voix et du nombre de tirages que chacune consomme. Semer une seule fois pour
    // toute la batterie ferait dependre la caisse claire de ce que le charleston a consomme avant
    // elle : une mise a jour du moteur de synthese changerait alors le son sans rien dire.
    const tirer = async (cle: string) => await avecHasardSeme(4242, cle, async () =>
      Array.from({ length: 6 }, () => Math.random()));
    expect(await tirer("snarenoise|0.2|null")).not.toEqual(await tirer("clap|0.1|null"));
  });

  it("ET DEUX GRAINES DIFFERENTES aussi, sans quoi la graine serait decorative", async () => {
    const tirer = async (graine: number) => await avecHasardSeme(graine, "voix", async () =>
      Array.from({ length: 6 }, () => Math.random()));
    expect(await tirer(1)).not.toEqual(await tirer(2));
  });
});
