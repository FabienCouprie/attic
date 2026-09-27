// plugins/cercle-transformations.test.ts — Un cercle varie-t-il vraiment d'une passe à l'autre ?
//
// CE QUI SE VÉRIFIE ICI, ET QUI N'EST PAS DANS `audio/cercle.ts`. Les opérations elles-mêmes y sont
// éprouvées ; ce qui appartient à ces composants est la façon dont leur quantité change d'une passe
// à l'autre. C'est la différence entre une répétition et une variation : sans elle, une chaîne
// posée dans une boucle rendrait quatre fois le même cercle, et rien à l'écran ne le dirait.
//
// ET LA PREUVE INVERSE : HORS D'UNE BOUCLE, RIEN NE CHANGE. Un composant qui lirait un rang absent
// prendrait une valeur au hasard dans son champ ; celui-ci prend la première, et se règle donc comme
// n'importe quel autre.
import { describe, expect, it } from "vitest";

import { estCercle, type Cercle } from "../audio/cercle";
import { publierBoucle, publierBoucles, type BoucleCourante } from "./boucleSequencesGlobal";
import { fiches, quantiteDeLaPasse } from "./cercle-transformations";

const par = (id: string) => fiches.find((f) => f.id === id)!;

const perc = (positions: number, places: number[], valeur = 36): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur })),
});
const melo = (positions: number, paires: [number, number][]): Cercle => ({
  positions, sorte: "hauteur", sommets: paires.map(([position, valeur]) => ({ position, valeur })),
});

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

/** Une boucle de `passes` tours, posée comme le pilote la pose. */
function poserBoucle(passes: number, index: number): void {
  const etat: BoucleCourante = {
    debutId: "b", finsIds: ["f"], index,
    // Le pilote n'y range que le compte : ce que porte chaque morceau ne regarde pas ces composants.
    morceaux: new Array(passes).fill({ notes: [], tempo: 120 }) as never,
    recoltes: [],
  };
  publierBoucle(etat);
}

const places = (c: Cercle) => c.sommets.map((s) => s.position).sort((a, b) => a - b);
const sons = (c: Cercle) => c.sommets.map((s) => s.valeur);

describe("la quantité de la passe", () => {
  it("HORS D'UNE BOUCLE, C'EST LA PREMIÈRE VALEUR DU CHAMP", () => {
    publierBoucles([]);
    expect(quantiteDeLaPasse("0:3", 99)).toBe(0);
    expect(quantiteDeLaPasse("5", 99)).toBe(5);
    expect(quantiteDeLaPasse("7 2 9", 99)).toBe(7);
  });

  it("un champ illisible rend le défaut, et non zéro", () => {
    publierBoucles([]);
    expect(quantiteDeLaPasse("", 4)).toBe(4);
    expect(quantiteDeLaPasse("abc", 4)).toBe(4);
  });

  it("UNE RAMPE S'ÉTALE SUR LES PASSES, bornes comprises", () => {
    for (const [passe, attendu] of [[0, 0], [1, 1], [2, 2], [3, 3]] as const) {
      poserBoucle(4, passe);
      expect(quantiteDeLaPasse("0:3", 99), `passe ${passe}`).toBe(attendu);
    }
  });

  it("une suite donne ses valeurs puis répète la dernière", () => {
    for (const [passe, attendu] of [[0, 7], [1, 2], [2, 9], [3, 9], [4, 9]] as const) {
      poserBoucle(5, passe);
      expect(quantiteDeLaPasse("7 2 9", 99), `passe ${passe}`).toBe(attendu);
    }
  });

  it("un rang hors des passes ne sort pas du champ", () => {
    poserBoucle(3, 99);
    expect(quantiteDeLaPasse("0:2", 99)).toBe(2);
  });
});

describe("tourner un cercle", () => {
  it("LA ROTATION SUIT LA PASSE : c'est ce qui fait la variation", async () => {
    const source = perc(8, [0, 3, 6]);
    const vus: number[][] = [];
    for (let passe = 0; passe < 4; passe++) {
      poserBoucle(4, passe);
      const r = await par("cercle-tourner").executer!(contexte([source], { Pas: "0:3" }) as never) as any;
      vus.push(places(r.valeurs[0]));
    }
    expect(vus).toEqual([[0, 3, 6], [1, 4, 7], [0, 2, 5], [1, 3, 6]]);
    // Et les quatre ne sont pas la même chose, ce qui est tout l'enjeu.
    expect(new Set(vus.map((v) => v.join(","))).size).toBe(4);
  });

  it("le message dit le pas et le rang", async () => {
    poserBoucle(4, 2);
    const r = await par("cercle-tourner").executer!(contexte([perc(8, [0])], { Pas: "0:3" }) as never) as any;
    expect(r.message).toContain("2");
    expect(r.message).toContain("3/4");
  });

  it("sans cercle à l'entrée, il le dit et n'invente rien", async () => {
    publierBoucles([]);
    const r = await par("cercle-tourner").executer!(contexte([null]) as never) as any;
    expect(r.erreur).toBe(true);
    expect(r.valeurs[0]).toBeNull();
  });
});

describe("le miroir", () => {
  it("l'axe suit la passe, et la place de l'axe reste en place", async () => {
    poserBoucle(3, 1);
    const r = await par("cercle-miroir").executer!(contexte([perc(8, [0, 1, 3])], { Axe: "0:2" }) as never) as any;
    // Axe 1 sur trois passes : la rampe 0:2 donne 0, 1, 2 ; la place 1 reste, 0 va en 1-0=1... non :
    // la réflexion d'axe a envoie p sur a-p, donc 0→1, 1→0, 3→6 modulo 8.
    expect(places(r.valeurs[0])).toEqual([0, 1, 6]);
  });
});

describe("inverser une mélodie", () => {
  it("L'ORDRE DES NOTES SE LIT À REBOURS, et les places ne bougent pas", async () => {
    publierBoucles([]);
    const source = melo(8, [[0, 60], [2, 64], [5, 67]]);
    const r = await par("cercle-inverser").executer!(contexte([source], { Inversion: "ordre" }) as never) as any;
    expect(places(r.valeurs[0])).toEqual([0, 2, 5]);
    expect(sons(r.valeurs[0])).toEqual([67, 64, 60]);
  });

  it("LES INTERVALLES SE RENVERSENT AUTOUR DE LA NOTE LA PLUS GRAVE quand l'axe est vide", async () => {
    publierBoucles([]);
    const source = melo(8, [[0, 60], [2, 64], [5, 67]]);
    const r = await par("cercle-inverser").executer!(contexte([source], { Inversion: "intervalles", Axe: "" }) as never) as any;
    expect(sons(r.valeurs[0])).toEqual([60, 56, 53]);
    expect(r.message).toContain("grave");
  });

  it("un axe donné suit la passe", async () => {
    poserBoucle(2, 1);
    const source = melo(4, [[0, 60]]);
    const r = await par("cercle-inverser").executer!(contexte([source], { Inversion: "intervalles", Axe: "60:72" }) as never) as any;
    expect(sons(r.valeurs[0])).toEqual([84]);
  });
});

describe("permuter les notes", () => {
  it("LE RYTHME NE BOUGE PAS, seules les notes changent de place", async () => {
    publierBoucles([]);
    const source = melo(8, [[0, 60], [2, 64], [5, 67], [6, 72]]);
    const r = await par("cercle-permuter").executer!(contexte([source], { Graine: "3" }) as never) as any;
    expect(places(r.valeurs[0])).toEqual([0, 2, 5, 6]);
    expect([...sons(r.valeurs[0])].sort((a, b) => a - b)).toEqual([60, 64, 67, 72]);
  });

  it("LA GRAINE SUIT LA PASSE, et deux passes ne donnent pas le même ordre", async () => {
    const source = melo(8, [[0, 60], [1, 62], [2, 64], [3, 65], [4, 67], [5, 69], [6, 71], [7, 72]]);
    const vus: string[] = [];
    for (let passe = 0; passe < 4; passe++) {
      poserBoucle(4, passe);
      const r = await par("cercle-permuter").executer!(contexte([source], { Graine: "1:4" }) as never) as any;
      vus.push(sons(r.valeurs[0]).join(","));
    }
    expect(new Set(vus).size).toBe(4);
  });

  it("la même graine rend toujours la même permutation", async () => {
    publierBoucles([]);
    const source = melo(8, [[0, 60], [2, 64], [5, 67], [6, 72]]);
    const un = await par("cercle-permuter").executer!(contexte([source], { Graine: "7" }) as never) as any;
    const deux = await par("cercle-permuter").executer!(contexte([source], { Graine: "7" }) as never) as any;
    expect(sons(un.valeurs[0])).toEqual(sons(deux.valeurs[0]));
  });
});

describe("le complémentaire", () => {
  it("il prend les places libres, et rien d'autre", async () => {
    publierBoucles([]);
    const r = await par("cercle-complementaire").executer!(contexte([perc(8, [0, 3, 6])], { Percussion: "38" }) as never) as any;
    expect(places(r.valeurs[0])).toEqual([1, 2, 4, 5, 7]);
    expect(new Set(sons(r.valeurs[0]))).toEqual(new Set([38]));
  });

  it("UN CERCLE MÉLODIQUE VIDE EST REFUSÉ, et non rempli d'une note arbitraire", async () => {
    publierBoucles([]);
    const r = await par("cercle-complementaire").executer!(contexte([melo(8, [])]) as never) as any;
    expect(r.erreur).toBe(true);
    expect(r.valeurs[0]).toBeNull();
  });
});

describe("la chaîne entière, menée comme le pilote la mène", () => {
  // CE QUI SE VÉRIFIE ICI EST LA FORME QUE FABIEN A CHOISIE : une boucle par créneau, et dedans un
  // cercle, une transformation, le rendu. Chaque passe remplit son créneau, et les quatre créneaux
  // ne portent pas la même chose. C'est la preuve que la variation arrive jusqu'au son, et non
  // seulement jusqu'au cercle.
  it("QUATRE CRÉNEAUX, QUATRE ROTATIONS, ET ILS DIFFÈRENT", async () => {
    const { fiches: fichesCercle } = await import("./cercle");
    const { fiches: fichesCreneau } = await import("./boucle-creneau");
    const debut = fichesCreneau.find((f) => f.id === "boucle-creneau-debut")!;
    const finBoucle = fichesCreneau.find((f) => f.id === "boucle-creneau-fin")!;
    const rendu = fichesCercle.find((f) => f.id === "rendu-cercles")!;
    const source = perc(16, [0, 3, 6, 10, 12]);

    const etat: BoucleCourante = { debutId: "d", finsIds: ["f"], index: 0, morceaux: [], recoltes: [] };
    publierBoucle(etat);
    const parPasse: number[][] = [];
    let sortie: unknown = null;
    try {
      for (;;) {
        // Le début découvre ses créneaux à la première passe, comme dans le pilote.
        await debut.executer!({ ...contexte([], { Créneaux: 4 }), noeud: { id: "d", data: {} } } as never);
        const tourne = await par("cercle-tourner")
          .executer!(contexte([source], { Pas: "0:3" }) as never) as any;
        parPasse.push(places(tourne.valeurs[0]));
        const rendue = await rendu.executer!(contexte([tourne.valeurs[0]], { Tours: 1 }) as never) as any;
        const f = await finBoucle.executer!({
          ...contexte([rendue.valeurs[0]]), noeud: { id: "f", data: {} },
        } as never) as any;
        sortie = f.valeurs[0];
        if (etat.index >= etat.morceaux.length - 1) break;
        etat.index++;
      }
    } finally {
      publierBoucle(null);
    }

    expect(parPasse).toEqual([[0, 3, 6, 10, 12], [1, 4, 7, 11, 13], [2, 5, 8, 12, 14], [3, 6, 9, 13, 15]]);
    const s = sortie as { notes: { debut: number }[]; duree?: number };
    // Cinq attaques par créneau, quatre créneaux : la réunion les porte toutes.
    expect(s.notes).toHaveLength(20);
    // Et les quatre créneaux occupent bien les quatre places de la ligne de temps.
    const parCreneau = [0, 1, 2, 3].map((k) =>
      s.notes.filter((n) => n.debut >= k * 2 - 1e-9 && n.debut < (k + 1) * 2).length);
    expect(parCreneau).toEqual([5, 5, 5, 5]);
  });
});

describe("ce que les cinq composants ont en commun", () => {
  it("TOUS RENDENT UN CERCLE VALIDE, qu'une entrée de rendu saura lire", async () => {
    publierBoucles([]);
    const source = melo(8, [[0, 60], [2, 64], [5, 67]]);
    for (const f of fiches) {
      const r = await f.executer!(contexte([source]) as never) as any;
      expect(estCercle(r.valeurs[0]), f.id).toBe(true);
    }
  });

  it("tous refusent une entrée qui n'est pas un cercle", async () => {
    publierBoucles([]);
    for (const f of fiches) {
      const r = await f.executer!(contexte(["ceci n'est pas un cercle"]) as never) as any;
      expect(r.erreur, f.id).toBe(true);
    }
  });
});
