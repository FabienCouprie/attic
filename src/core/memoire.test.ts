// core/memoire.test.ts — Ce qu'un noeud exige, et s'il merite qu'on retienne son resultat.
//
// CE QUI PARLAIT D'OCTETS EST PARTI DANS LE DOMAINE (`audio/memoire-audio.test.ts`) : compter des
// flottants 32 bits et des en-tetes WAV suppose un son. Ce qui reste ici est du graphe et de
// l'interface, que tout domaine partage.
import { describe, it, expect } from "vitest";
import { noeudRegarde, resultatRetenu } from "./memoire";

describe("quel nœud est regardé", () => {
  // source → filtre → sortie
  const chaine = [{ source: "source" }, { source: "filtre" }];

  it("le dernier de la chaîne : rien ne consomme sa sortie", () => {
    expect(noeudRegarde({ id: "sortie", selectionne: false, aretes: chaine })).toBe(true);
  });

  it("un intermédiaire non sélectionné : un passage, pas une destination", () => {
    expect(noeudRegarde({ id: "filtre", selectionne: false, aretes: chaine })).toBe(false);
  });

  it("le même intermédiaire, une fois cliqué", () => {
    expect(noeudRegarde({ id: "filtre", selectionne: true, aretes: chaine })).toBe(true);
  });

  it("un nœud seul, sans aucune arête, est terminal", () => {
    expect(noeudRegarde({ id: "seul", selectionne: false, aretes: [] })).toBe(true);
  });

  it("une branche qui se divise : les deux feuilles sont regardées, pas le tronc", () => {
    const fourche = [{ source: "tronc" }, { source: "tronc" }];
    expect(noeudRegarde({ id: "tronc", selectionne: false, aretes: fourche })).toBe(false);
    expect(noeudRegarde({ id: "feuilleA", selectionne: false, aretes: fourche })).toBe(true);
  });
});

describe("dans un méta-composant, personne n'est une destination", () => {
  const dedans = [{ source: "premier" }, { source: "milieu" }];

  it("le dernier nœud du dedans n'est terminal que par accident de découpage", () => {
    expect(noeudRegarde({ id: "dernier", selectionne: false, aretes: dedans, dansUnMeta: true })).toBe(false);
  });

  it("le même nœud, hors d'un méta, est bien la fin de la chaîne", () => {
    expect(noeudRegarde({ id: "dernier", selectionne: false, aretes: dedans, dansUnMeta: false })).toBe(true);
  });

  it("la sélection reste le seul moyen de désigner ce qu'on veut entendre", () => {
    expect(noeudRegarde({ id: "milieu", selectionne: true, aretes: dedans, dansUnMeta: true })).toBe(true);
  });

  it("un intermédiaire du dedans n'est pas regardé non plus", () => {
    expect(noeudRegarde({ id: "milieu", selectionne: false, aretes: dedans, dansUnMeta: true })).toBe(false);
  });

});

describe("ce qu'une bulle repliée garde de son intérieur", () => {
  it("un membre caché ne garde pas son résultat", () => {
    expect(resultatRetenu({ cacheParBulle: true })).toBe(false);
  });

  it("un nœud ordinaire garde le sien", () => {
    expect(resultatRetenu({ cacheParBulle: false })).toBe(true);
  });

  it("l'économie de mémoire coupée, tout est gardé : c'est le même arbitrage que les aperçus", () => {
    expect(resultatRetenu({ cacheParBulle: true, economie: false })).toBe(true);
  });

});

describe("ce qu'une boucle dépliée garde de ses tours", () => {
  // RELEVÉ PAR FABIEN : « est-ce que la mémoire des caches intermédiaires est libérée à chaque
  // passage en fin de boucle ? » Elle ne l'était pas, et pas même à la fin du run : les copies
  // portent des identifiants engendrés et ne figurent pas parmi les nœuds visibles, de sorte que le
  // ménage ne les examinait jamais. Mesuré sur huit tours d'un écho : 134,6 Mo pour le seul corps.
  it("UN TOUR INTERMÉDIAIRE NE GARDE PAS SON RÉSULTAT", () => {
    expect(resultatRetenu({ cacheParBulle: false, corpsDeBoucle: true })).toBe(false);
  });

  it("ET CE QUE LA FIN DE BOUCLE REND RESTE, LUI : c'est l'échafaudage qu'on lâche, pas l'ouvrage", () => {
    // La fin de boucle est un nœud visible, et rien ne la désigne comme corps de boucle.
    expect(resultatRetenu({ cacheParBulle: false, corpsDeBoucle: false })).toBe(true);
  });

  it("l'économie de mémoire coupée, les tours sont gardés comme avant", () => {
    expect(resultatRetenu({ cacheParBulle: false, corpsDeBoucle: true, economie: false })).toBe(true);
  });

  it("un membre de bulle QUI EST AUSSI un tour de boucle ne se garde pas deux fois moins", () => {
    // Les deux raisons se cumulent sans se contredire : une seule suffit à lâcher.
    expect(resultatRetenu({ cacheParBulle: true, corpsDeBoucle: true })).toBe(false);
  });

  it("SANS RAISON DE LÂCHER, ON GARDE : le défaut ne change pour personne", () => {
    // Clause décisive : tous les nœuds du catalogue passent par ici, et aucun ne devait changer de
    // sort du seul fait qu'un argument s'ajoute.
    expect(resultatRetenu({ cacheParBulle: false })).toBe(true);
    expect(resultatRetenu({ cacheParBulle: false, economie: true })).toBe(true);
  });

  it("huit tours d'une chaîne qui allonge son signal, ce sont les 134,6 Mo mesurés", () => {
    // Les durées relevées dans l'application, tour par tour : la queue de l'écho s'ajoute à chaque
    // passage, si bien que le coût croît avec le carré du nombre de tours et non avec lui.
    const tours = [5.1, 8.4, 11.7, 15.1, 18.5, 21.9, 25.3, 28.6];
    expect(+tours.reduce((s, t) => s + t, 0).toFixed(1)).toBe(134.6);
    expect(tours[7] / tours[0]).toBeGreaterThan(5);
  });
});

describe("dans une bulle repliée, personne n'est regardé", () => {
  const chaine = [{ source: "a" }, { source: "b" }];

  it("un membre caché n'est pas une destination, même s'il termine la chaîne", () => {
    expect(noeudRegarde({ id: "c", selectionne: false, aretes: chaine, cacheParBulle: true })).toBe(false);
  });

  it("un membre caché n'est pas regardé même s'il était resté sélectionné", () => {
    // On ne peut pas cliquer sur un nœud qu'on ne voit pas ; une sélection d'avant le repli ne doit
    // pas ressusciter un aperçu que le repli vient de rendre inutile.
    expect(noeudRegarde({ id: "b", selectionne: true, aretes: chaine, cacheParBulle: true })).toBe(false);
  });

  it("la bulle ouverte, les règles ordinaires reviennent", () => {
    expect(noeudRegarde({ id: "c", selectionne: false, aretes: chaine, cacheParBulle: false })).toBe(true);
    expect(noeudRegarde({ id: "b", selectionne: true, aretes: chaine, cacheParBulle: false })).toBe(true);
  });

});
