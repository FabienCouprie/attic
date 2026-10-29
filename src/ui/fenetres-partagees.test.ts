// ui/fenetres-partagees.test.ts — « Employez-vous ce méta ? », et la réponse des autres fenêtres.
//
// La règle de Fabien, du 2026-10-29 : refuser de supprimer un méta qu'une autre fenêtre emploie. Ces
// cas tiennent les trois endroits où l'emploi se lit, et la question elle-même, sur de vrais
// `BroadcastChannel` — Node les a, et deux objets d'un même processus se parlent comme deux fenêtres.
import { describe, expect, it } from "vitest";

import { CANAL_FENETRES, demanderEmploi, metaEmploye, repondreEmploi } from "./fenetres-partagees";

const n = (ficheId: string) => ({ data: { ficheId } });

describe("l'emploi d'un méta dans une fenêtre", () => {
  it("se lit dans le graphe affiché", () => {
    expect(metaEmploye("m1", [[n("gain"), n("m1")]], [])).toBe(true);
    expect(metaEmploye("m1", [[n("gain")]], [])).toBe(false);
  });

  it("DANS LE GRAPHE RACINE MIS DE CÔTÉ, quand on est entré dans un autre méta", () => {
    expect(metaEmploye("m1", [[n("gain")], [n("m1")]], [{ metaId: "m2" }])).toBe(true);
  });

  it("ET DANS LA PILE : on peut être en train d'éditer l'intérieur du méta visé", () => {
    expect(metaEmploye("m1", [[n("gain")], null], [{ metaId: "m1" }])).toBe(true);
  });
});

describe("la question aux autres fenêtres", () => {
  it("COMPTE LES FENÊTRES QUI L'EMPLOIENT, et elles seules", async () => {
    const fins = [
      repondreEmploi((id) => id === "m1", { fenetre: "A" }),
      repondreEmploi((id) => id === "m1", { fenetre: "B" }),
      repondreEmploi(() => false, { fenetre: "C" }),
    ];
    try {
      expect(await demanderEmploi("m1", { fenetre: "moi", delaiMs: 80 })).toBe(2);
      expect(await demanderEmploi("m2", { fenetre: "moi", delaiMs: 80 }), "personne n'emploie m2").toBe(0);
    } finally { for (const f of fins) f(); }
  });

  it("UNE FENÊTRE NE SE RÉPOND PAS À ELLE-MÊME : chez soi, supprimer retire les instances", async () => {
    const fin = repondreEmploi(() => true, { fenetre: "moi" });
    try {
      expect(await demanderEmploi("m1", { fenetre: "moi", delaiMs: 80 })).toBe(0);
    } finally { fin(); }
  });

  it("une réponse à une autre question n'est pas comptée", async () => {
    // Un intrus répond oui à tout, sans regarder le jeton de la question.
    const intrus = new BroadcastChannel(CANAL_FENETRES);
    intrus.onmessage = () => intrus.postMessage({ type: "emploie", jeton: "pas-le-bon", fenetre: "X" });
    try {
      expect(await demanderEmploi("m1", { fenetre: "moi", delaiMs: 80 })).toBe(0);
    } finally { intrus.close(); }
  });

  it("sans BroadcastChannel, il n'y a personne à qui demander", async () => {
    expect(await demanderEmploi("m1", { canal: () => null })).toBe(0);
  });
});
