// ui/forme-port.test.ts — Le point d'un port garde sa taille, et chaque forme se distingue.
//
// CE QUE CES CAS TIENNENT. Un seul calcul habille la poignée du nœud et la pastille de l'infobulle :
// s'il changeait la taille ou le contour au passage, tous les ports du dépôt changeraient d'aspect
// d'un coup, et rien ne le dirait. Le cas du rond est donc une empreinte de ce que les poignées
// portaient avant les formes, à l'unité près.
import { describe, expect, it } from "vitest";
import { stylePort, TAILLE_PORT } from "./forme-port";

describe("le point d'un port", () => {
  it("LE ROND EST EXACTEMENT CE QUE LES POIGNÉES PORTAIENT, taille, contour et couleur", () => {
    expect(stylePort("rond", "#2a9d8f")).toEqual({
      background: "#2a9d8f",
      width: 10, height: 10,
      border: "2px solid var(--bg-node)",
      borderRadius: "50%",
    });
    expect(TAILLE_PORT).toBe(10);
  });

  it("le carré garde la taille et le contour, et n'arrondit presque pas", () => {
    const s = stylePort("carre", "#2f9e44");
    expect(s.width).toBe(10);
    expect(s.height).toBe(10);
    expect(s.border).toBe("2px solid var(--bg-node)");
    expect(s.borderRadius).toBe(2);
  });

  it("LE LOSANGE EST PLUS GRAND ET SANS CONTOUR, parce qu'un découpage emporte le contour", () => {
    // Un losange inscrit dans un carré n'en couvre que la moitié : à taille égale il paraîtrait
    // deux fois plus petit que les autres points.
    const s = stylePort("losange", "#e9a13b");
    expect(s.width).toBe(14);
    expect(s.border).toBe("none");
    expect(String(s.clipPath)).toContain("polygon");
  });

  it("les trois formes se distinguent, sinon l'axe ne servirait à rien", () => {
    const vus = ["rond", "carre", "losange"].map((f) => JSON.stringify(stylePort(f as never, "#fff")));
    expect(new Set(vus).size).toBe(3);
  });

  it("la taille se règle, pour la pastille de l'infobulle qui est plus petite", () => {
    expect(stylePort("rond", "#fff", 8).width).toBe(8);
    expect(stylePort("losange", "#fff", 8).width).toBe(11);
  });
});
