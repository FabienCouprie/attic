// ui/fenetres-partagees.test.ts — « Employez-vous ce méta ? », et la réponse des autres fenêtres.
//
// La règle de Fabien, du 2026-10-29 : refuser de supprimer un méta qu'une autre fenêtre emploie. Ces
// cas tiennent les trois endroits où l'emploi se lit, et la question elle-même, sur de vrais
// `BroadcastChannel` — Node les a, et deux objets d'un même processus se parlent comme deux fenêtres.
import { describe, expect, it } from "vitest";

import { CANAL_FENETRES, type CanalMinimal, demanderEmploi, metaEmploye, repondreEmploi } from "./fenetres-partagees";

const n = (ficheId: string) => ({ data: { ficheId } });

/**
 * Des fenêtres sur de vrais `BroadcastChannel`, et de quoi clore une question quand tout y est répondu.
 *
 * C'EST CE QUI REMPLACE LE DÉLAI. Les cas attendaient 80 ms de temps réel. Le 2026-10-30, sous charge,
 * celui qui compte a rendu 0 pour 2, les réponses arrivant après la clôture ; et ceux qui attendent
 * zéro passaient au vert sur leur propre faute, la réponse fautive arrivant trop tard pour être vue.
 * La question se clôt maintenant quand chaque fenêtre l'a traitée ET que chaque réponse postée est
 * arrivée, quel qu'en soit le jeton : celle d'un intrus se fait attendre comme les autres. Les deux
 * comptes sont nécessaires : clore à la deuxième réponse reçue rendrait 2 quoi qu'il arrive, et
 * laisserait passer une fenêtre qui répond sans employer le méta.
 *
 * Les canaux ne sont qu'observés : chaque message passe par le vrai transport. Le témoin écoute après
 * le module, l'ordre d'inscription étant celui de l'appel, et il écoute pour son compte : un module
 * qui cesserait d'écouter trop tôt rendrait un mauvais compte, et non un cas qui attend sans fin.
 */
function reseau() {
  const type = (m: unknown) => (m as { type?: string } | null)?.type;
  let ouvertes = 0;
  let q: { traitee: number; postees: number; recues: number; clore?: () => void } | null = null;
  const verifier = () => {
    if (!q?.clore || q.traitee !== ouvertes || q.recues !== q.postees) return;
    const clore = q.clore;
    q = null;
    clore();
  };
  const canal = (repond: boolean) => (): CanalMinimal => {
    const c = new BroadcastChannel(CANAL_FENETRES);
    const temoin = (e: MessageEvent) => {
      if (!q) return;
      if (repond && type(e.data) === "qui-emploie") q.traitee++;
      if (!repond && type(e.data) === "emploie") q.recues++;
      verifier();
    };
    if (repond) ouvertes++;
    return {
      postMessage(m) {
        c.postMessage(m);
        if (type(m) === "qui-emploie") q = { traitee: 0, postees: 0, recues: 0 };
        else if (q && type(m) === "emploie") q.postees++;
      },
      addEventListener(t, f) { c.addEventListener(t, f); c.addEventListener(t, temoin); },
      removeEventListener(t, f) { c.removeEventListener(t, f); },
      close() { if (repond) ouvertes--; c.close(); },
    };
  };
  const differer = (clore: () => void) => { if (q) q.clore = clore; verifier(); };
  return {
    repondante: canal(true),
    /** Ce que demande la fenêtre « moi », clos par le témoin et non par une minuterie. */
    demander: (id: string) => demanderEmploi(id, { fenetre: "moi", canal: canal(false), differer }),
  };
}

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
    const r = reseau();
    const fins = [
      repondreEmploi((id) => id === "m1", { fenetre: "A", canal: r.repondante }),
      repondreEmploi((id) => id === "m1", { fenetre: "B", canal: r.repondante }),
      repondreEmploi(() => false, { fenetre: "C", canal: r.repondante }),
    ];
    try {
      expect(await r.demander("m1")).toBe(2);
      expect(await r.demander("m2"), "personne n'emploie m2").toBe(0);
    } finally { for (const f of fins) f(); }
  });

  it("UNE FENÊTRE NE SE RÉPOND PAS À ELLE-MÊME : chez soi, supprimer retire les instances", async () => {
    const r = reseau();
    const fin = repondreEmploi(() => true, { fenetre: "moi", canal: r.repondante });
    try {
      expect(await r.demander("m1")).toBe(0);
    } finally { fin(); }
  });

  it("une réponse à une autre question n'est pas comptée", async () => {
    // Un intrus répond oui à tout, sans regarder le jeton de la question.
    const r = reseau();
    const intrus = r.repondante();
    intrus.addEventListener("message", () => intrus.postMessage({ type: "emploie", jeton: "pas-le-bon", fenetre: "X" }));
    try {
      expect(await r.demander("m1")).toBe(0);
    } finally { intrus.close(); }
  });

  it("sans BroadcastChannel, il n'y a personne à qui demander", async () => {
    expect(await demanderEmploi("m1", { canal: () => null })).toBe(0);
  });
});
