// @vitest-environment jsdom
// ui/ligne-temps-mesure.test.ts — La ligne de temps mesure-t-elle la place qu'on lui laisse ?
//
// POURQUOI CE FICHIER EXISTE. Relevé par Fabien : « le graphique sur le nœud est comme coupé en deux
// avec une partie opaque à gauche », et, plus précisément, « même les pointillés de délimitation
// n'apparaissent plus à la moitié de l'écran jusqu'à la fin ». Le dessin s'arrêtait au milieu du
// nœud. Mesuré dans l'application : conteneur de 644 pixels, dessin de 400, soit 244 pixels de vide
// à droite où même les graduations cessaient.
//
// LA CAUSE ÉTAIT UN OBSERVATEUR POSÉ PAR UN EFFET AU MONTAGE. Un effet aux dépendances vides ne
// s'exécute qu'une fois, sur l'élément présent À CET INSTANT ; or tant que la ligne de temps n'a
// aucune piste à montrer, elle rend un AUTRE div, celui du message, qui ne portait pas la référence.
// L'observateur n'était donc jamais posé, la référence restait vide, et la largeur gardait sa valeur
// de départ pour toujours — 400 pixels, quelle que soit la taille du nœud.
//
// CE QUE CE CAS TIENT EST LA RÈGLE, PAS LE SYMPTÔME : quelle que soit la branche rendue, l'élément
// qui porte la ligne de temps est observé. Il ne mesure pas des pixels, qu'aucun test hors
// navigateur ne peut juger ; il vérifie que la mesure est BRANCHÉE, ce qui est exactement ce qui
// manquait. Le défaut est resté invisible longtemps parce qu'il ne se voit que sur un nœud plus
// large que son défaut, et qu'il faut alors regarder le vide plutôt que le dessin.
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";

import { LigneDeTemps } from "./LigneDeTemps";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** Les éléments que quelqu'un a demandé à observer, dans l'ordre. */
const observes: Element[] = [];
(globalThis as Record<string, unknown>).ResizeObserver = class {
  observe(el: Element) { observes.push(el); }
  unobserve() {}
  disconnect() {}
};

/** Monte une ligne de temps et rend de quoi la faire changer d'avis. */
function monter(branchees: number[]) {
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  let racine: Root;
  const rendre = (b: number[]) => createElement(
    ReactFlowProvider, null,
    createElement(LigneDeTemps, {
      pistes: [], branchees: b, params: {}, onChanger: () => {},
    }),
  );
  act(() => { racine = createRoot(hote); racine.render(rendre(branchees)); });
  return {
    hote,
    redessiner: (b: number[]) => act(() => { racine.render(rendre(b)); }),
    demonter: () => act(() => { racine.unmount(); hote.remove(); }),
  };
}

describe("la ligne de temps observe la place qu'on lui laisse", () => {
  it("SANS AUCUNE PISTE, elle rend son message ET l'observe", () => {
    observes.length = 0;
    const c = monter([]);
    const vide = c.hote.querySelector(".ligne-temps-vide");
    expect(vide, "la branche du message doit être rendue").toBeTruthy();
    expect(observes.includes(vide!), "le message doit être observé").toBe(true);
    c.demonter();
  });

  it("ET QUAND LES PISTES ARRIVENT, C'EST LE DESSIN QUI EST OBSERVÉ, non le div d'avant", () => {
    // Le cas même du relevé : le nœud naît sans piste, puis ses câbles se déclarent. C'est là que
    // l'observateur se perdait, et que la largeur se figeait.
    observes.length = 0;
    const c = monter([]);
    c.redessiner([0, 1]);
    const dessin = c.hote.querySelector(".ligne-temps:not(.ligne-temps-vide)");
    expect(dessin, "la branche du dessin doit être rendue").toBeTruthy();
    expect(observes.includes(dessin!), "le dessin doit être observé").toBe(true);
    c.demonter();
  });

  it("et le va-et-vient ne le perd pas : on observe toujours ce qui est dans le document", () => {
    observes.length = 0;
    const c = monter([0]);
    c.redessiner([]);
    c.redessiner([0, 1, 2]);
    const dessin = c.hote.querySelector(".ligne-temps:not(.ligne-temps-vide)");
    expect(dessin).toBeTruthy();
    expect(observes.includes(dessin!)).toBe(true);
    expect(document.contains(observes[observes.length - 1])).toBe(true);
    c.demonter();
  });
});
