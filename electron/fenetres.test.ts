// electron/fenetres.test.ts — À quelle fenêtre le processus principal parle, et ce qu'une neuve reçoit.
//
// Relevé le 2026-10-29, deux fenêtres ouvertes : les dialogues s'ouvraient sur la dernière fenêtre
// créée, et le mode développement vidait le stockage de la première à chaque ouverture. Ces cas
// tiennent les pièces dont `main.cjs` se sert pour l'éviter.
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

import { PARAMETRE_FENETRE as PARAMETRE_RENDU, VALEUR_NOUVELLE as VALEUR_RENDU } from "../src/ui/fenetre";

const require_ = createRequire(import.meta.url);
const {
  PARAMETRE_FENETRE, VALEUR_NOUVELLE, fenetreDe, uneSeuleFois, requeteDeFenetre, adresseDeDeveloppement,
  uneFenetreVivante,
} = require_("./fenetres.cjs");

describe("les fenêtres du processus principal", () => {
  it("LE PARAMÈTRE QUI MARQUE UNE FENÊTRE NEUVE EST LE MÊME DES DEUX CÔTÉS", () => {
    // Le principal le pose, le rendu le lit : un nom qui diverge ferait naître chaque fenêtre neuve
    // sur le document de la première, sans que rien ne casse.
    expect(PARAMETRE_FENETRE).toBe(PARAMETRE_RENDU);
    expect(VALEUR_NOUVELLE).toBe(VALEUR_RENDU);
  });

  it("une fenêtre neuve est marquée, la première ne l'est pas", () => {
    expect(requeteDeFenetre(true)).toEqual({ [PARAMETRE_FENETRE]: VALEUR_NOUVELLE });
    expect(requeteDeFenetre(false)).toEqual({});
    expect(adresseDeDeveloppement("http://localhost:5175", true)).toBe(`http://localhost:5175/?${PARAMETRE_FENETRE}=${VALEUR_NOUVELLE}`);
    expect(adresseDeDeveloppement("http://localhost:5175", false)).toBe("http://localhost:5175/");
  });

  it("UN DIALOGUE SE RATTACHE À LA FENÊTRE QUI LE DEMANDE", () => {
    const f1 = { id: 1 }; const f2 = { id: 2 };
    const BrowserWindow = { fromWebContents: (wc: { f: unknown }) => wc.f };
    expect(fenetreDe(BrowserWindow, { sender: { f: f1 } })).toBe(f1);
    expect(fenetreDe(BrowserWindow, { sender: { f: f2 } })).toBe(f2);
    expect(fenetreDe(BrowserWindow, {}), "sans émetteur, pas de parent plutôt qu'un faux").toBeNull();
    expect(fenetreDe(BrowserWindow, { sender: { f: undefined } })).toBeNull();
  });

  it("LE VIDAGE DU MODE DÉVELOPPEMENT N'A LIEU QU'UNE FOIS, et la seconde fenêtre l'attend", async () => {
    let fin: () => void = () => {};
    const vider = vi.fn(() => new Promise<void>((ok) => { fin = ok; }));
    const unique = uneSeuleFois(vider);
    const premiere = unique("session");
    const seconde = unique("session");
    let secondeFinie = false;
    void seconde.then(() => { secondeFinie = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(vider).toHaveBeenCalledTimes(1);
    expect(secondeFinie, "la seconde ne charge pas sa page avant la fin du vidage").toBe(false);
    fin();
    await premiere; await seconde;
    expect(secondeFinie).toBe(true);
    await unique("session");
    expect(vider, "ni à la troisième").toHaveBeenCalledTimes(1);
  });

  it("ce qui ne doit se faire qu'une fois va à une fenêtre vivante", () => {
    const b = { isDestroyed: () => false };
    const morte = { isDestroyed: () => true };
    expect(uneFenetreVivante([morte, b])).toBe(b);
    expect(uneFenetreVivante([morte])).toBeNull();
  });
});
