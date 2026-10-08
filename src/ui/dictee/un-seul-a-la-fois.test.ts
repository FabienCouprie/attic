// ui/dictee/un-seul-a-la-fois.test.ts — Deux clics pendant un démarrage n'en font qu'un.
//
// CE QUE CES CAS TIENNENT, ET POURQUOI ILS SONT ICI PLUTÔT QUE SUR LE HOOK. Le défaut relevé
// par Fabien était un second démarrage lancé pendant le premier, le bouton paraissant inerte
// tant que le modèle charge. Le dépôt n'a pas de rendu de composants dans ses batteries, et
// monter React pour éprouver une règle de concurrence reviendrait à mesurer autre chose : la
// règle est donc un module à elle seule, et c'est elle qu'on éprouve.
import { describe, expect, it } from "vitest";
import { unSeulALaFois, verrou } from "./un-seul-a-la-fois";

/** Une promesse qu'on résout à la main, pour tenir deux appels ouverts en même temps. */
function enAttente<T>() {
  let resoudre!: (v: T) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<T>((ok, ko) => { resoudre = ok; rejeter = ko; });
  return { promesse, resoudre, rejeter };
}

describe("un seul démarrage à la fois", () => {
  it("LE SECOND APPEL NE LANCE RIEN tant que le premier n'a pas rendu", async () => {
    const v = verrou();
    const attente = enAttente<string>();
    let lancements = 0;
    const faire = () => { lancements++; return attente.promesse; };

    const premier = unSeulALaFois(v, faire);
    const second = unSeulALaFois(v, faire);
    expect(lancements).toBe(1);
    expect(await second).toBeUndefined();

    attente.resoudre("fait");
    expect(await premier).toBe("fait");
    expect(lancements).toBe(1);
  });

  it("et un troisième non plus, ce qui est le cas relevé : trois clics, une seule écoute", async () => {
    const v = verrou();
    const attente = enAttente<number>();
    let lancements = 0;
    const faire = () => { lancements++; return attente.promesse; };
    const rendus = [unSeulALaFois(v, faire), unSeulALaFois(v, faire), unSeulALaFois(v, faire)];
    attente.resoudre(1);
    expect(await Promise.all(rendus)).toEqual([1, undefined, undefined]);
    expect(lancements).toBe(1);
  });

  it("UNE FOIS LE PREMIER RENDU, UN NOUVEL APPEL PART, sans quoi le bouton resterait mort", async () => {
    const v = verrou();
    let lancements = 0;
    const faire = async () => { lancements++; return lancements; };
    expect(await unSeulALaFois(v, faire)).toBe(1);
    expect(await unSeulALaFois(v, faire)).toBe(2);
  });

  it("ET UN ÉCHEC RELÂCHE LE VERROU, une permission refusée n'étant pas une panne", async () => {
    const v = verrou();
    await expect(unSeulALaFois(v, () => Promise.reject(new Error("micro refusé"))))
      .rejects.toThrow("micro refusé");
    expect(v.pris).toBe(false);
    expect(await unSeulALaFois(v, async () => "repris")).toBe("repris");
  });

  it("le verrou est relâché aussi quand tout se passe bien", async () => {
    const v = verrou();
    await unSeulALaFois(v, async () => "fait");
    expect(v.pris).toBe(false);
  });

  it("un verrou neuf n'est pas pris", () => {
    expect(verrou().pris).toBe(false);
  });
});
