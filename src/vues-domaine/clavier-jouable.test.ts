// @vitest-environment jsdom
// ui/clavier-jouable.test.ts — Une voix lancée est une voix qu'on peut encore éteindre.
//
// POURQUOI CE FICHIER EXISTE. Relevé par Fabien : « quand on étale un son sur le clavier, un son
// reste même après les touches relâchées et ne s'éteint jamais ». Le clavier ne garde qu'UNE voix
// par note, dans une table `note → de quoi l'arrêter`. Y poser une seconde voix sur la même note
// écrase la première : plus personne ne détient son `arreter`, et elle sonne jusqu'à la fermeture
// de l'application. Avec une banque d'échantillons qui boucle, ce n'est pas une note qui traîne,
// c'est une note éternelle.
//
// CE QUE CE FICHIER TIENT EST UN INVARIANT, PAS UN SCÉNARIO. Ce n'est pas « le pointeur ne doit pas
// presser deux fois », c'est « aucune voix lancée ne reste sans personne pour l'éteindre ». La
// nuance compte : les chemins qui pressent sont quatre — le pointeur, le glissando, le clavier de
// l'ordinateur, et demain un autre — et un invariant posé au seul endroit qui lance les voix les
// couvre tous, quand un garde recopié dans chacun d'eux se perd au premier ajouté.
//
// POURQUOI L'ÉTAT REACT NE POUVAIT PAS SERVIR DE GARDE. `onPointerMove` se gardait sur `touches`,
// qui est un état React : il ne change qu'au rendu suivant. Un `pointermove` est un événement
// CONTINU, que React ne vide pas sur-le-champ ; deux d'entre eux dans la même image lisent donc le
// même `touches`, celui d'avant la presse. La table des voix, elle, est une référence : elle est à
// jour à l'instant même. C'est la différence entre ce qu'on affiche et ce qui sonne.
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";

import { useClavierJouable, type Presseur, type VoixVivante } from "./clavier-jouable";

// React exige qu'on se déclare dans un environnement de test, sinon `act` proteste à chaque rendu.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom n'a pas de `ResizeObserver`, et le clavier en pose un pour mesurer la place qu'on lui
// laisse. Sans mesure, la largeur de blanche retombe sur son minimum — ce qui suffit ici, la
// géométrie ayant ses propres tests dans `clavier-disposition.test.ts`.
(globalThis as Record<string, unknown>).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** Ce qu'a fait le presseur : une voix lancée, une voix arrêtée. */
function journal() {
  const lancees: number[] = [];
  const arretees: number[] = [];
  const presseur: Presseur = (note) => {
    lancees.push(note);
    return { arreter: () => arretees.push(note) } satisfies VoixVivante;
  };
  /** Les voix lancées que personne n'a arrêtées. */
  const abandonnees = () => {
    const reste = [...lancees];
    for (const n of arretees) {
      const i = reste.indexOf(n);
      if (i >= 0) reste.splice(i, 1);
    }
    return reste;
  };
  return { lancees, arretees, abandonnees, presseur };
}

type Clavier = ReturnType<typeof useClavierJouable>;

/**
 * Monte un clavier et rend de quoi le piloter.
 *
 * `rendu()` donne l'objet du DERNIER rendu ; le garder dans une variable donne au contraire les
 * fonctions d'un rendu passé, ce qui est exactement la situation qu'on veut éprouver.
 */
function monter(presseur: Presseur) {
  let dernier: Clavier | null = null;
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  let racine: Root;

  function Sonde() {
    const clavier = useClavierJouable("sonde", presseur);
    dernier = clavier;
    return createElement("div", { ref: clavier.touchesRef });
  }

  // LE FOURNISSEUR EST INDISPENSABLE, et ce n'est pas un détail de montage : le clavier écrit la
  // séquence enregistrée dans les données de son nœud, et lit s'il est sélectionné pour savoir si
  // le clavier de l'ordinateur lui revient. Les deux passent par le magasin de React Flow.
  act(() => {
    racine = createRoot(hote);
    racine.render(createElement(ReactFlowProvider, null, createElement(Sonde)));
  });

  return {
    rendu: () => dernier!,
    demonter: () => act(() => { racine.unmount(); hote.remove(); }),
  };
}

/**
 * Un événement de pointeur, réduit à ce que le clavier en lit.
 *
 * Les coordonnées sont des pixels de mise en page : jsdom rend un rectangle nul, donc l'échelle
 * vaut 1 et `clientX` arrive tel quel. À huit pixels la blanche, x = 20 tombe sur la troisième
 * blanche et x = 60 sur la huitième ; y = 80 passe sous les noires, qui s'arrêtent à 55.
 */
const evenement = (x: number, y: number) => ({
  button: 0,
  buttons: 1,
  pointerId: 1,
  clientX: x,
  clientY: y,
  preventDefault() {},
  target: { setPointerCapture() {} },
}) as unknown as React.PointerEvent;

describe("le clavier jouable n'abandonne jamais une voix", () => {
  it("PRESSER DEUX FOIS LA MÊME NOTE NE LANCE QU'UNE VOIX", () => {
    const j = journal();
    const c = monter(j.presseur);

    act(() => { c.rendu().presser(60); });
    act(() => { c.rendu().presser(60); });
    act(() => { c.rendu().relacher(60); });

    expect(j.lancees).toEqual([60]);
    expect(j.abandonnees()).toEqual([]);
    c.demonter();
  });

  it("UN POINTEUR QUI BOUGE SUR LA MÊME TOUCHE NE LA RELANCE PAS", () => {
    const j = journal();
    const c = monter(j.presseur);
    const geste = c.rendu();

    // Les deux événements dans le même `act` : React n'a pas rendu entre eux, donc `touches` est
    // encore celui d'avant la presse. C'est le cas que le garde sur l'état ne pouvait pas voir.
    act(() => {
      geste.onPointerDown(evenement(20, 80));
      geste.onPointerMove(evenement(22, 80));
    });
    act(() => { geste.onPointerUp(); });

    expect(j.lancees.length).toBe(1);
    expect(j.abandonnees()).toEqual([]);
    c.demonter();
  });

  it("UN GLISSANDO ÉTEINT TOUT CE QU'IL A FAIT SONNER", () => {
    const j = journal();
    const c = monter(j.presseur);
    const geste = c.rendu();

    act(() => {
      geste.onPointerDown(evenement(20, 80));
      geste.onPointerMove(evenement(36, 80));
      geste.onPointerMove(evenement(52, 80));
      geste.onPointerMove(evenement(52, 80));
    });
    act(() => { geste.onPointerUp(); });

    expect(j.lancees.length).toBeGreaterThan(1);
    expect(j.abandonnees()).toEqual([]);
    c.demonter();
  });

  it("LA MÊME TOUCHE PEUT RESONNER APRÈS AVOIR ÉTÉ RELÂCHÉE", () => {
    // Le garde ne doit pas museler le clavier : une note relâchée n'est plus vivante, et la
    // reprendre doit la faire sonner de nouveau.
    const j = journal();
    const c = monter(j.presseur);

    act(() => { c.rendu().presser(60); });
    act(() => { c.rendu().relacher(60); });
    act(() => { c.rendu().presser(60); });
    act(() => { c.rendu().relacher(60); });

    expect(j.lancees).toEqual([60, 60]);
    expect(j.arretees).toEqual([60, 60]);
    c.demonter();
  });

  it("UN CLAVIER QUI DISPARAÎT EMPORTE SES VOIX", () => {
    // Un nœud supprimé, un graphe rechargé, une bulle repliée : la vue s'en va, et la table des
    // voix avec elle. Sans cette clause, la voix reste sur la carte son sans personne au monde qui
    // détienne son `arreter` — et c'est bien « un son qui ne s'éteint jamais ».
    const j = journal();
    const c = monter(j.presseur);

    act(() => { c.rendu().presser(60); });
    expect(j.abandonnees()).toEqual([60]);

    c.demonter();
    expect(j.abandonnees()).toEqual([]);
  });
});
