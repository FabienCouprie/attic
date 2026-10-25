// @vitest-environment jsdom
// vues-domaine/touche-nommee-par-le-son.test.ts — Ce qu'une touche porte écrit est ce qu'elle joue.
//
// POURQUOI CE FICHIER EXISTE. Relevé par Fabien : « Clavier SFZ » écrivait `F4` sur la touche 65
// pendant qu'elle faisait entendre `E4+42`. Le nom était celui du demi-ton qu'elle OCCUPE —
// l'identité de la touche —, non celui de la hauteur qu'elle produit. Sur un clavier ordinaire les
// deux coïncident, et personne ne peut voir la différence ; sur une banque étalée en degrés il y a
// jusqu'à un demi-ton entre les deux. Côte à côte avec le réseau isomorphe, qui nomme des HAUTEURS,
// les deux claviers disaient deux choses du même son : mesurés, ils sonnaient à 0,000 cent l'un de
// l'autre, seuls leurs noms divergeaient.
//
// CE QUE CE FICHIER TIENT, ET CE QU'IL NE TIENT PAS. La justesse du son est mesurée ailleurs, au
// tampon, par `plugins/banque-sonne-au-degre.test.ts` — qui éprouve aussi `hauteurJouee`, la source
// du nom. Ici on tient le DERNIER MÈTRE : que le composant écrive bien ce nom dans le DOM. Un nom
// juste calculé puis non employé serait invisible à toute mesure acoustique, et le défaut d'origine
// était exactement de cette nature.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";

import { accordageDepuisCents, hauteurDuDegre } from "../audio/accordage";
import { construireBanque, hauteurJouee, type Banque } from "../audio/clavier-banque";
import { nomNote } from "../audio/nom-note";
import { TouchesClavier, useClavierJouable, type VoixVivante } from "./clavier-jouable";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom n'a pas de `ResizeObserver`, et le clavier en pose un pour mesurer la place qu'on lui
// laisse. Sans mesure, la largeur de blanche retombe sur son minimum : les quatre-vingt-huit
// touches sont toutes là, ce qui est tout ce qui compte pour les nommer.
(globalThis as Record<string, unknown>).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const TONIQUE = 60;

/** L'échelle d'une cloche, inégale et sans octave : treize degrés, période de 1282 cents. */
const CLOCHE = accordageDepuisCents(
  [0, 137, 192, 241, 306, 442, 547, 684, 815, 935, 1013, 1127, 1176], 1282, TONIQUE,
);

/**
 * Une banque, accordée ou non. Le son n'a aucune importance ici : seuls comptent les champs que le
 * nom traverse — la hauteur de l'échantillon d'une zone, et le désaccord de chaque touche.
 */
function banque(accordee: boolean): Banque {
  const source = new AudioBuffer({ numberOfChannels: 1, length: 1024, sampleRate: 44100 });
  return construireBanque(source, {
    racineSource: TONIQUE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 90,
    transposer: (a) => a,
    ...(accordee ? { accordage: CLOCHE, toniqueTouche: TONIQUE } : {}),
  });
}

/** Monte les touches d'un clavier avec cette banque, et rend les boutons produits. */
function monter(b: Banque | null) {
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  let racine: Root;
  const presseur = (): VoixVivante => ({ arreter: () => {} });

  function Sonde() {
    const clavier = useClavierJouable("sonde", presseur);
    return createElement(TouchesClavier, { clavier, banque: b });
  }
  act(() => {
    racine = createRoot(hote);
    racine.render(createElement(ReactFlowProvider, null, createElement(Sonde)));
  });

  const touches = new Map<number, HTMLElement>();
  for (const el of hote.querySelectorAll("[data-note]")) {
    touches.set(Number(el.getAttribute("data-note")), el as HTMLElement);
  }
  return { touches, hote, demonter: () => act(() => { racine.unmount(); hote.remove(); }) };
}

/** Les touches qui portent leur nom écrit. */
const etiquetees = (m: { touches: Map<number, HTMLElement> }) => [...m.touches]
  .filter(([, el]) => el.querySelector(".clavier-etiquette"))
  .map(([note]) => note)
  .sort((x, y) => x - y);

/** Les touches marquées comme toniques, nommables ou non. */
const marquees = (m: { touches: Map<number, HTMLElement> }) => [...m.touches]
  .filter(([, el]) => el.classList.contains("tonique"))
  .map(([note]) => note)
  .sort((x, y) => x - y);

describe("une touche porte le nom de ce qu'elle fait entendre", () => {
  it("BANQUE ACCORDÉE : chaque touche écrit la hauteur que la banque dit jouer", () => {
    const b = banque(true);
    const m = monter(b);
    try {
      let vues = 0;
      for (const [note, el] of m.touches) {
        const attendue = hauteurJouee(b, note);
        if (attendue === null) continue;
        expect(el.getAttribute("data-pitch"), `touche ${note}`).toBe(nomNote(attendue));
        vues++;
      }
      expect(vues, "le clavier doit porter ses quatre-vingt-huit touches").toBeGreaterThan(80);
    } finally { m.demonter(); }
  });

  it("ET CE N'EST PAS LE NOM DU DEMI-TON, sans quoi le défaut serait encore là", () => {
    const b = banque(true);
    const m = monter(b);
    try {
      const divergentes = [...m.touches].filter(([note, el]) =>
        el.getAttribute("data-pitch") !== nomNote(note));
      // La touche 65 est le cas que Fabien a relevé : elle occupe un fa 4 et sonne un mi 4 plus
      // quarante-deux cents.
      expect(m.touches.get(65)!.getAttribute("data-pitch")).toBe(nomNote(hauteurDuDegre(CLOCHE, 5)));
      expect(m.touches.get(65)!.getAttribute("data-pitch")).not.toBe("F4");
      expect(divergentes.length, "presque toutes les touches doivent diverger du tempéré")
        .toBeGreaterThan(35);
    } finally { m.demonter(); }
  });

  it("LES REPÈRES ÉCRITS SONT LES TONIQUES, et non les do, qui ne veulent plus rien dire", () => {
    const b = banque(true);
    const m = monter(b);
    try {
      const noms = etiquetees(m);
      // Treize degrés par période : les toniques tombent de treize en treize depuis la touche 60.
      expect(noms.length, "il doit en rester quelques-unes").toBeGreaterThan(2);
      // Le modulo canonique, celui du code : `-39 % 13` vaut `-0` en JavaScript, que `toBe` refuse
      // face à `+0`. La touche 21 est bien une tonique, trois périodes sous la touche 60.
      for (const note of noms) {
        expect((((note - TONIQUE) % 13) + 13) % 13, `touche ${note}`).toBe(0);
      }
      expect(noms).toContain(TONIQUE);
      expect(noms).not.toContain(72); // un do, mais pas une tonique
    } finally { m.demonter(); }
  });

  it("ET UNE TONIQUE SUR UNE TOUCHE NOIRE est marquée, puisqu'elle ne peut pas être nommée", () => {
    const b = banque(true);
    const m = monter(b);
    try {
      const toniques = marquees(m);
      for (const note of toniques) {
        expect((((note - TONIQUE) % 13) + 13) % 13, `touche ${note}`).toBe(0);
      }
      // La touche 73 est une tonique ET une touche noire : trop étroite pour un nom, donc la
      // couleur est sa seule marque. Un marquage posé avec l'étiquette l'aurait oubliée.
      const noire = m.touches.get(73)!;
      expect(noire.className).toContain("clavier-noire");
      expect(noire.classList.contains("tonique"), "la tonique noire doit être marquée").toBe(true);
      expect(noire.querySelector(".clavier-etiquette"), "et elle ne porte pas de nom").toBeNull();
      expect(toniques.length, "il y a plus de toniques marquées que de toniques nommables")
        .toBeGreaterThan(etiquetees(m).length);
    } finally { m.demonter(); }
  });

  it("SANS BANQUE ACCORDÉE, RIEN NE CHANGE : les demi-tons tempérés et les do", () => {
    for (const b of [null, banque(false)]) {
      const m = monter(b);
      try {
        for (const [note, el] of m.touches) {
          expect(el.getAttribute("data-pitch"), `touche ${note}`).toBe(nomNote(note));
        }
        const noms = etiquetees(m);
        expect(noms.length).toBeGreaterThan(2);
        for (const note of noms) expect(note % 12, `touche ${note}`).toBe(0);
        // ET AUCUNE TOUCHE PEINTE : un clavier tempéré garderait sinon sept do en jaune.
        expect(marquees(m), "aucune tonique marquée sur un clavier tempéré").toEqual([]);
      } finally { m.demonter(); }
    }
  });
});
