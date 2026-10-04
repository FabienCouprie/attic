// @vitest-environment jsdom
// ui/ligne-temps-raccourcis.test.ts — Les raccourcis de morceaux n'appartiennent qu'à qui a le focus.
//
// POURQUOI CE FICHIER EXISTE. Relevé par Fabien : « quand le composant montage est sur la palette,
// cela désactive le copier coller sur toute la palette pour les autres nœuds ». La ligne de temps
// écoute Ctrl+C, Ctrl+X, Ctrl+V et Suppr sur la FENÊTRE, en phase de capture, et les arrête net
// quand elle les traite — il le faut, sans quoi couper un morceau couperait aussi le nœud qui le
// porte. Mais elle se gardait par un porteur unique, une variable de module prise au clic sur un
// morceau, QUI NE SE RENDAIT JAMAIS : après avoir seulement touché un morceau, le montage
// interceptait ces quatre raccourcis pour toute l'application, et copier un nœud ne faisait plus
// rien, silencieusement.
//
// CE QUE CES CAS TIENNENT EST LA RÈGLE DU NAVIGATEUR : le focus n'est qu'à UN endroit, et il se rend
// de lui-même dès qu'on clique ailleurs. Aucune variable de module ne peut en dire autant, parce
// qu'aucune ne sait qu'on l'a quittée.
//
// LE TÉMOIN EST POSÉ EN PHASE DE BULLE, comme l'écoute du canevas : si la ligne de temps a arrêté
// l'événement, il ne lui parvient pas. C'est exactement ce que le canevas voit, ou ne voit pas.
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";

import { LigneDeTemps } from "./LigneDeTemps";
import type { Morceau } from "../audio/montage-morceaux";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

const MORCEAU: Morceau = {
  id: "m1", piste: 0, debut: 0, dans: 0, duree: 0, gain: 0, entree: 10, sortie: 10,
};

function monter() {
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  const ecrits: Morceau[][] = [];
  let racine: Root;
  act(() => {
    racine = createRoot(hote);
    racine.render(createElement(
      ReactFlowProvider, null,
      createElement(LigneDeTemps, {
        pistes: [{ piste: 0, duree: 8 }], branchees: [0], params: {}, onChanger: () => {},
        noeudId: "montage-1", morceaux: [MORCEAU], onMorceaux: (m: Morceau[]) => { ecrits.push(m); },
      }),
    ));
  });
  const ligne = hote.querySelector(".ligne-temps") as HTMLElement;
  /** Clique la première barre, ce qui choisit son morceau et donne le focus à la ligne de temps. */
  const choisirUnMorceau = () => {
    const barre = ligne.querySelector("rect.ligne-temps-barre") as SVGElement;
    // jsdom ne capture pas les pointeurs : la prise s'en passe, elle ne sert qu'au glissement.
    (barre as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    act(() => {
      barre.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: 1,
      }));
    });
  };
  return {
    hote, ligne, ecrits, choisirUnMorceau,
    demonter: () => act(() => { racine.unmount(); hote.remove(); }),
  };
}

/**
 * Envoie une touche comme un vrai clavier l'envoie, et dit si elle est parvenue jusqu'au canevas.
 *
 * ELLE PART DE L'ÉLÉMENT FOCALISÉ, ET NON DE LA FENÊTRE, et la nuance décide de tout. Un événement
 * dispatché SUR `window` a `window` pour cible : capture et bulle s'y confondent, et les écoutes
 * partent dans leur ordre d'inscription, si bien qu'une capture n'a aucune priorité. Un vrai clavier
 * vise l'élément focalisé, l'événement descend depuis la fenêtre, et la capture passe alors bien
 * avant la bulle. Dispatcher sur la fenêtre aurait donc éprouvé un ordre qui n'existe pas.
 */
function frapper(touche: string, ctrl = false): boolean {
  let parvenue = false;
  const temoin = () => { parvenue = true; };
  window.addEventListener("keydown", temoin);
  const cible = (document.activeElement as HTMLElement | null) ?? document.body;
  act(() => {
    cible.dispatchEvent(new KeyboardEvent("keydown", {
      key: touche, ctrlKey: ctrl, bubbles: true, cancelable: true,
    }));
  });
  window.removeEventListener("keydown", temoin);
  return parvenue;
}

describe("les raccourcis de morceaux n'appartiennent qu'à qui a le focus", () => {
  it("SANS LE FOCUS, LE CTRL+C NE LUI APPARTIENT PAS et poursuit sa route", () => {
    // LE RELEVÉ MÊME, et il demande qu'un morceau ait été CHOISI : c'est le clic sur une barre qui
    // armait l'ancien porteur, et il ne se rendait plus ensuite. Sans cette presse, Ctrl+C ne
    // désignerait aucun morceau et traverserait de toute façon : le cas ne prouverait rien.
    const c = monter();
    c.choisirUnMorceau();
    expect(c.ligne.querySelector(".ligne-temps-choisi"), "un morceau doit être choisi").toBeTruthy();
    c.ligne.blur();
    expect(frapper("c", true), "Ctrl+C doit parvenir au canevas").toBe(true);
    expect(frapper("x", true), "Ctrl+X doit parvenir au canevas").toBe(true);
    expect(frapper("v", true), "Ctrl+V doit parvenir au canevas").toBe(true);
    expect(frapper("Delete"), "Suppr doit parvenir au canevas").toBe(true);
    expect(c.ecrits.length, "et rien ne doit être écrit sur les morceaux").toBe(0);
    c.demonter();
  });

  it("ET LA TOUCHE DE COUPE NON PLUS : elle ne coupe rien tant qu'on regarde ailleurs", () => {
    const c = monter();
    (document.body as HTMLElement).focus();
    expect(frapper("s")).toBe(true);
    expect(c.ecrits.length).toBe(0);
    c.demonter();
  });

  it("AVEC LE FOCUS, LA COUPE AGIT et l'événement est arrêté avant le canevas", () => {
    const c = monter();
    c.ligne.focus();
    expect(document.activeElement).toBe(c.ligne);
    expect(frapper("s"), "la touche ne doit pas parvenir au canevas").toBe(false);
    expect(c.ecrits.length, "et la coupe doit avoir écrit").toBe(1);
    c.demonter();
  });

  it("le focus se rend en cliquant ailleurs, et les raccourcis avec lui", () => {
    // C'est la clause qui manquait : le porteur d'avant ne se rendait jamais.
    const c = monter();
    c.ligne.focus();
    expect(frapper("s")).toBe(false);
    // `blur` PLUTÔT QUE DE FOCALISER LE CORPS : en jsdom, `focus()` sur un élément qui n'est pas
    // focalisable ne fait rien, et le focus resterait sur la ligne de temps. Rendre le focus est ce
    // qu'un clic ailleurs produit, et c'est cela qu'on éprouve.
    c.ligne.blur();
    expect(document.activeElement).not.toBe(c.ligne);
    expect(frapper("s"), "le focus rendu, la ligne de temps n'intercepte plus").toBe(true);
    c.demonter();
  });

  it("une ligne de temps SANS morceaux n'intercepte rien, focus ou pas", () => {
    // La maquette porte la même ligne de temps sans lui donner de morceaux : elle ne doit toucher à
    // aucun raccourci, ni pour elle ni pour le canevas.
    const hote = document.createElement("div");
    document.body.appendChild(hote);
    let racine: Root;
    act(() => {
      racine = createRoot(hote);
      racine.render(createElement(
        ReactFlowProvider, null,
        createElement(LigneDeTemps, {
          pistes: [{ piste: 0, duree: 8 }], branchees: [0], params: {}, onChanger: () => {},
        }),
      ));
    });
    (hote.querySelector(".ligne-temps") as HTMLElement).focus();
    expect(frapper("s")).toBe(true);
    expect(frapper("c", true)).toBe(true);
    act(() => { racine.unmount(); hote.remove(); });
  });
});
