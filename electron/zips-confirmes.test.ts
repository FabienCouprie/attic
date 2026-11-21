// electron/zips-confirmes.test.ts — Une archive confirmée ne se déplie qu'une fois, et que par son jeton.
//
// CE QUE CES CAS TIENNENT. `node:deplier-zip` écrit sur le disque l'archive que `node:importer-zip`
// a fait confirmer à la personne. Le jeton est tout ce qui relie les deux temps : un jeton inventé
// par le rendu ne doit rien déplier, sans quoi la boîte de confirmation ne protégerait plus rien, et
// un jeton servi deux fois redéplierait une archive par-dessus un nœud peut-être déjà modifié.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { creerZipsConfirmes, CAPACITE } = require_("./zips-confirmes.cjs");

describe("les archives confirmées", () => {
  it("UN JETON REND SON ARCHIVE, UNE SEULE FOIS", () => {
    const z = creerZipsConfirmes();
    const archive = { nom: "a.zip" };
    const jeton = z.retenir(archive, "mon-noeud");
    expect(z.reprendre(jeton)).toEqual({ zip: archive, id: "mon-noeud" });
    expect(z.reprendre(jeton), "servi deux fois").toBeNull();
  });

  it("UN JETON INVENTÉ NE REND RIEN, et un jeton qui n'est pas une chaîne non plus", () => {
    const z = creerZipsConfirmes();
    z.retenir({}, "x");
    expect(z.reprendre("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(z.reprendre(undefined)).toBeNull();
    expect(z.reprendre({ toString: () => "x" })).toBeNull();
  });

  it("DEUX ARCHIVES ONT DEUX JETONS, et chacune rend la sienne", () => {
    const z = creerZipsConfirmes();
    const a = z.retenir({ n: 1 }, "a");
    const b = z.retenir({ n: 2 }, "b");
    expect(a).not.toBe(b);
    expect(z.reprendre(b)?.id).toBe("b");
    expect(z.reprendre(a)?.id).toBe("a");
  });

  it("UNE ARCHIVE REFUSÉE PAR LE REGISTRE S'OUBLIE AUSSITÔT, et ne se déplie plus", () => {
    const z = creerZipsConfirmes();
    const jeton = z.retenir({ nom: "refusee.zip" }, "reverberation");
    const autre = z.retenir({ nom: "autre.zip" }, "autre");
    expect(z.oublier(jeton), "elle était gardée").toBe(true);
    expect(z.taille(), "elle ne tient plus la mémoire").toBe(1);
    expect(z.reprendre(jeton), "et son jeton ne déplie plus rien").toBeNull();
    expect(z.oublier(jeton), "l'oublier deux fois ne fait rien").toBe(false);
    expect(z.oublier("inventé"), "ni oublier un jeton inventé").toBe(false);
    expect(z.reprendre(autre)?.id, "l'autre archive n'est pas touchée").toBe("autre");
  });

  it("RIEN NE S'ACCUMULE : une archive dont la fenêtre n'a jamais rien dit finit oubliée", () => {
    const z = creerZipsConfirmes();
    const premier = z.retenir({}, "premier");
    for (let i = 0; i < CAPACITE; i++) z.retenir({}, `n${i}`);
    expect(z.taille()).toBe(CAPACITE);
    expect(z.reprendre(premier), "la plus ancienne est sortie").toBeNull();
  });
});
