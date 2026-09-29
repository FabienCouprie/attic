// core/boucle-graphe.test.ts — Une boucle dépliée doit faire ce qu'une boucle fait.
//
// Le moteur exécute un graphe acyclique : la boucle est donc dépliée avant l'exécution,
// chaque tour recevant le résultat du précédent. Ces tests vérifient les deux promesses
// qui comptent — les effets s'ACCUMULENT d'un tour à l'autre, et la fin de boucle reçoit
// les n résultats DANS L'ORDRE — ainsi que les cas où l'utilisateur se trompe de câblage.
import { describe, expect, it } from "vitest";
import {
  COPIES_MAX, FICHES_FIN, FICHE_DEBUT, FICHE_FIN, FICHE_FIN_B, FICHE_FIN_C, TOURS_MAX,
  deplierBoucles, estFinDeBoucle,
} from "./boucle-graphe";
import type { AreteG, NoeudG } from "./meta";

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
const a = (id: string, source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

/** Le graphe d'usage : source → début → transposeur → fin. */
function grapheSimple(tours: number) {
  return {
    noeuds: [
      n("src", "generateur-frequence"),
      n("d", FICHE_DEBUT, { Tours: tours }),
      n("tr", "transposition"),
      n("f", FICHE_FIN),
    ],
    aretes: [a("e1", "src", "d"), a("e2", "d", "tr"), a("e3", "tr", "f")],
  };
}

describe("graphe sans boucle", () => {
  it("ressort exactement tel quel", () => {
    const g = { noeuds: [n("a1", "x"), n("b1", "y")], aretes: [a("e", "a1", "b1")] };
    const r = deplierBoucles(g.noeuds, g.aretes);
    expect(r.noeuds).toBe(g.noeuds);
    expect(r.aretes).toBe(g.aretes);
    expect(r.problemes).toEqual([]);
  });
});

describe("dépliage", () => {
  it("recopie le contenu autant de fois qu'il y a de tours", () => {
    const g = grapheSimple(3);
    const r = deplierBoucles(g.noeuds, g.aretes);
    const copies = r.noeuds.filter((x) => x.data.ficheId === "transposition");
    expect(copies.length).toBe(3);
    // Le début de boucle disparaît, la fin reste : c'est elle qui rend le résultat.
    expect(r.noeuds.some((x) => x.data.ficheId === FICHE_DEBUT)).toBe(false);
    expect(r.noeuds.some((x) => x.data.ficheId === FICHE_FIN)).toBe(true);
  });

  it("CHAÎNE les tours : chaque copie reçoit le résultat de la précédente", () => {
    // C'est toute la demande : si la chaîne monte d'un demi-ton, le deuxième tour part
    // d'un signal déjà transposé, et monte donc de deux demi-tons au total.
    const r = deplierBoucles(...Object.values(grapheSimple(3)) as [NoeudG[], AreteG[]]);
    const copies = r.noeuds.filter((x) => x.data.ficheId === "transposition").map((x) => x.id);
    const entree = (id: string) => r.aretes.filter((x) => x.target === id).map((x) => x.source);
    expect(entree(copies[0])).toEqual(["src"]);
    expect(entree(copies[1])).toEqual([copies[0]]);
    expect(entree(copies[2])).toEqual([copies[1]]);
  });

  it("livre les n résultats à la fin de boucle, DANS L'ORDRE des tours", () => {
    const r = deplierBoucles(...Object.values(grapheSimple(4)) as [NoeudG[], AreteG[]]);
    const copies = r.noeuds.filter((x) => x.data.ficheId === "transposition").map((x) => x.id);
    const versFin = r.aretes.filter((x) => x.target === "f").map((x) => x.source);
    expect(versFin).toEqual(copies);
  });

  it("n'invente rien quand il n'y a qu'un tour", () => {
    const r = deplierBoucles(...Object.values(grapheSimple(1)) as [NoeudG[], AreteG[]]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(1);
    expect(r.aretes.filter((x) => x.target === "f").length).toBe(1);
  });

  it("borne le nombre de tours, plutôt que de déplier un graphe démesuré", () => {
    const r = deplierBoucles(...Object.values(grapheSimple(9999)) as [NoeudG[], AreteG[]]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(TOURS_MAX);
    const r0 = deplierBoucles(...Object.values(grapheSimple(0)) as [NoeudG[], AreteG[]]);
    expect(r0.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(1);
  });

  it("garde trois tours par défaut quand le paramètre manque", () => {
    const g = grapheSimple(3);
    const sansParam = g.noeuds.map((x) => (x.id === "d" ? n("d", FICHE_DEBUT) : x));
    const r = deplierBoucles(sansParam, g.aretes);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(3);
  });

  it("rattache chaque copie à son nœud d'origine, pour que les statuts s'affichent", () => {
    const r = deplierBoucles(...Object.values(grapheSimple(2)) as [NoeudG[], AreteG[]]);
    const copies = r.noeuds.filter((x) => x.data.ficheId === "transposition");
    for (const c of copies) expect(r.origines.get(c.id)).toBe("tr");
  });

  it("recopie une chaîne de plusieurs nœuds en gardant son câblage interne", () => {
    const noeuds = [n("src", "gen"), n("d", FICHE_DEBUT, { Tours: 2 }), n("m1", "x"), n("m2", "y"), n("f", FICHE_FIN)];
    const aretes = [a("e1", "src", "d"), a("e2", "d", "m1"), a("e3", "m1", "m2"), a("e4", "m2", "f")];
    const r = deplierBoucles(noeuds, aretes);
    const x = r.noeuds.filter((c) => c.data.ficheId === "x").map((c) => c.id);
    const y = r.noeuds.filter((c) => c.data.ficheId === "y").map((c) => c.id);
    expect(x.length).toBe(2);
    // Dans chaque tour, x alimente y ; et le tour 2 part du y du tour 1.
    expect(r.aretes.some((e) => e.source === x[0] && e.target === y[0])).toBe(true);
    expect(r.aretes.some((e) => e.source === x[1] && e.target === y[1])).toBe(true);
    expect(r.aretes.some((e) => e.source === y[0] && e.target === x[1])).toBe(true);
  });

  it("alimente chaque tour à l'identique depuis une source extérieure", () => {
    // Un deuxième port du nœud interne, nourri par un réglage qui n'est pas dans la
    // boucle : il doit arriver à CHAQUE tour, sans quoi les tours ne se ressemblent pas.
    const noeuds = [n("src", "gen"), n("cfg", "reglage"), n("d", FICHE_DEBUT, { Tours: 3 }), n("m", "x"), n("f", FICHE_FIN)];
    const aretes = [a("e1", "src", "d"), a("e2", "d", "m"), a("e3", "cfg", "m", 0, 1), a("e4", "m", "f")];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.aretes.filter((e) => e.source === "cfg").length).toBe(3);
  });

  it("ne laisse sortir qu'une fois ce qui quitte la boucle par ailleurs", () => {
    const noeuds = [n("src", "gen"), n("d", FICHE_DEBUT, { Tours: 3 }), n("m", "x"), n("f", FICHE_FIN), n("obs", "sortie")];
    const aretes = [a("e1", "src", "d"), a("e2", "d", "m"), a("e3", "m", "f"), a("e4", "m", "obs")];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.aretes.filter((e) => e.target === "obs").length).toBe(1);
  });

  it("ne laisse aucun cycle derrière lui — c'est la raison d'être du dépliage", () => {
    const r = deplierBoucles(...Object.values(grapheSimple(4)) as [NoeudG[], AreteG[]]);
    // Un parcours en profondeur qui repasserait sur un nœud signalerait un cycle.
    const sortants = new Map<string, string[]>();
    for (const e of r.aretes) sortants.set(e.source, [...(sortants.get(e.source) ?? []), e.target]);
    const enCours = new Set<string>(), vus = new Set<string>();
    const visiter = (id: string): boolean => {
      if (enCours.has(id)) return true;
      if (vus.has(id)) return false;
      enCours.add(id);
      for (const s of sortants.get(id) ?? []) if (visiter(s)) return true;
      enCours.delete(id);
      vus.add(id);
      return false;
    };
    expect(r.noeuds.some((x) => visiter(x.id))).toBe(false);
  });
});

describe("câblages fautifs", () => {
  it("signale une fin sans début", () => {
    const r = deplierBoucles([n("src", "gen"), n("f", FICHE_FIN)], [a("e", "src", "f")]);
    expect(r.problemes).toEqual([{ noeudId: "f", code: "fin-sans-debut" }]);
  });

  it("signale un début sans fin", () => {
    const r = deplierBoucles([n("src", "gen"), n("d", FICHE_DEBUT), n("m", "x")], [a("e1", "src", "d"), a("e2", "d", "m")]);
    expect(r.problemes).toEqual([{ noeudId: "d", code: "debut-sans-fin" }]);
  });

  it("signale une boucle vide plutôt que de répéter le néant", () => {
    const r = deplierBoucles([n("d", FICHE_DEBUT), n("f", FICHE_FIN)], [a("e", "d", "f")]);
    expect(r.problemes).toEqual([{ noeudId: "d", code: "boucle-vide" }]);
  });

  it("REFUSE DEUX BOUCLES QUI ABOUTISSENT À LA MÊME FIN SANS S'EMBOÎTER, qui est bien ambigu", () => {
    // Deux débuts en amont d'une fin ne sont pas fautifs par eux-mêmes : c'est la forme d'une
    // imbrication. Ce qui l'est, c'est que ni l'un ni l'autre ne descende de son voisin, faute de
    // quoi rien ne dit laquelle des deux boucles cette fin referme.
    const noeuds = [
      n("s", "gen"), n("d1", FICHE_DEBUT), n("d2", FICHE_DEBUT), n("m", "x"), n("f", FICHE_FIN),
    ];
    const aretes = [
      a("e1", "s", "d1"), a("e2", "s", "d2"), a("e3", "d1", "m"), a("e4", "d2", "m"), a("e5", "m", "f"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toContainEqual({ noeudId: "f", code: "debuts-multiples" });
    expect(r.depliees).toEqual([]);
  });

  it("déplie deux boucles indépendantes sans les confondre", () => {
    const noeuds = [
      n("s1", "gen"), n("d1", FICHE_DEBUT, { Tours: 2 }), n("m1", "x"), n("f1", FICHE_FIN),
      n("s2", "gen"), n("d2", FICHE_DEBUT, { Tours: 3 }), n("m2", "y"), n("f2", FICHE_FIN),
    ];
    const aretes = [
      a("a1", "s1", "d1"), a("a2", "d1", "m1"), a("a3", "m1", "f1"),
      a("b1", "s2", "d2"), a("b2", "d2", "m2"), a("b3", "m2", "f2"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "x").length).toBe(2);
    expect(r.noeuds.filter((x) => x.data.ficheId === "y").length).toBe(3);
  });
});

// Trois fins de boucle, un seul dépliage : c'est la promesse à tenir ici. Ce que chacune
// fait des n résultats se vérifie sur son exécution (plugins/montage.test.ts) ; ce que le
// dépliage doit garantir, c'est que B et C reçoivent exactement ce que reçoit A.
describe("les trois fins de boucle", () => {
  for (const [nomVariante, fiche] of [["B", FICHE_FIN_B], ["C", FICHE_FIN_C]] as const) {
    it(`déplie une boucle refermée par la variante ${nomVariante} comme par A`, () => {
      const avecA = deplierBoucles(
        [n("src", "gen"), n("d", FICHE_DEBUT, { Tours: 3 }), n("m", "x"), n("f", FICHE_FIN)],
        [a("e1", "src", "d"), a("e2", "d", "m"), a("e3", "m", "f")],
      );
      const avecVariante = deplierBoucles(
        [n("src", "gen"), n("d", FICHE_DEBUT, { Tours: 3 }), n("m", "x"), n("f", fiche)],
        [a("e1", "src", "d"), a("e2", "d", "m"), a("e3", "m", "f")],
      );
      expect(avecVariante.problemes).toEqual([]);
      // Les trois tours sont bien recopiés, et les trois résultats arrivent sur la fin.
      expect(avecVariante.noeuds.filter((x) => x.data.ficheId === "x").length).toBe(3);
      expect(avecVariante.aretes.filter((x) => x.target === "f").length).toBe(3);
      // Et le dépliage est le MÊME qu'avec A, à l'identifiant de fiche de la fin près.
      expect(avecVariante.aretes).toEqual(avecA.aretes);
    });
  }

  it("chaîne les tours vers B comme vers A : le dernier tour part bien du précédent", () => {
    const r = deplierBoucles(
      [n("src", "gen"), n("d", FICHE_DEBUT, { Tours: 3 }), n("m", "x"), n("f", FICHE_FIN_B)],
      [a("e1", "src", "d"), a("e2", "d", "m"), a("e3", "m", "f")],
    );
    // La copie du tour 2 est alimentée par celle du tour 1, et par rien d'autre.
    const versDernier = r.aretes.filter((x) => x.target === "d#2::m");
    expect(versDernier.length).toBe(1);
    expect(versDernier[0].source).toBe("d#1::m");
  });

  it("EMBOÎTE UNE VARIANTE DANS UNE AUTRE, chacune gardant sa façon de rassembler ses tours", () => {
    const noeuds = [
      n("s", "gen"), n("d1", FICHE_DEBUT, { Tours: 2 }), n("d2", FICHE_DEBUT, { Tours: 3 }),
      n("m", "x"), n("f2", FICHE_FIN_C), n("f1", FICHE_FIN_B),
    ];
    const aretes = [
      a("e0", "s", "d1"), a("e1", "d1", "d2"), a("e2", "d2", "m"), a("e3", "m", "f2"), a("e4", "f2", "f1"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toEqual([]);
    expect(r.depliees).toEqual([{ debutId: "d2", tours: 3 }, { debutId: "d1", tours: 2 }]);
    // Les deux fins restent, avec leur variante : c'est chacune qui dit ce qu'elle fait de ses tours.
    expect(r.noeuds.filter((x) => x.data.ficheId === FICHE_FIN_B).length).toBe(1);
    expect(r.noeuds.filter((x) => x.data.ficheId === FICHE_FIN_C).length).toBe(2);
  });

  it("signale une variante sans début, plutôt que de la laisser passer pour un montage", () => {
    const r = deplierBoucles([n("src", "gen"), n("f", FICHE_FIN_C)], [a("e", "src", "f")]);
    expect(r.problemes).toEqual([{ noeudId: "f", code: "fin-sans-debut" }]);
  });

  it("reconnaît une fin de boucle quelle que soit sa variante, et rien d'autre", () => {
    for (const fiche of FICHES_FIN) expect(estFinDeBoucle(fiche)).toBe(true);
    expect(FICHES_FIN).toContain(FICHE_FIN); // l'identifiant historique de A reste une fin
    expect(estFinDeBoucle("simple-boucle")).toBe(false);
    expect(estFinDeBoucle(undefined)).toBe(false);
  });
});

describe("boucles imbriquées", () => {
  // DEMANDÉ PAR FABIEN, après un banc d'épreuve où deux boucles emboîtées ne dépliaient rien : les
  // deux fins annonçaient « Terminé · 1 tours » en vert, et la vraie raison ne vivait que dans la
  // console. Le dépliage va désormais de la plus intérieure vers la plus extérieure : une fois
  // l'intérieure dépliée, l'extérieure ne voit plus qu'une chaîne de nœuds ordinaires.
  const imbriquees = (toursDehors: number, toursDedans: number) => ({
    noeuds: [
      n("s", "gen"),
      n("d1", FICHE_DEBUT, { Tours: toursDehors }),
      n("d2", FICHE_DEBUT, { Tours: toursDedans }),
      n("m", "transposition"),
      n("f2", FICHE_FIN), n("f1", FICHE_FIN),
    ],
    aretes: [
      a("e0", "s", "d1"), a("e1", "d1", "d2"), a("e2", "d2", "m"),
      a("e3", "m", "f2"), a("e4", "f2", "f1"),
    ],
  });

  it("LE COMPTE EST LE PRODUIT DES DEUX, et non leur somme", () => {
    const g = imbriquees(2, 3);
    const r = deplierBoucles(g.noeuds, g.aretes);
    expect(r.problemes).toEqual([]);
    // Le ventre de l'intérieure est recopié trois fois, et tout cela deux fois par l'extérieure.
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(2 * 3);
  });

  it("ET LA FIN INTÉRIEURE SE RECOPIE À CHAQUE TOUR DU DEHORS, chacun ayant son propre résultat", () => {
    const g = imbriquees(2, 3);
    const r = deplierBoucles(g.noeuds, g.aretes);
    const fins = r.noeuds.filter((x) => estFinDeBoucle(x.data.ficheId));
    // Deux copies de la fin intérieure, plus la fin extérieure qui reste seule.
    expect(fins.length).toBe(3);
    expect(fins.filter((x) => x.id.includes("::f2")).length).toBe(2);
    expect(fins.some((x) => x.id === "f1")).toBe(true);
  });

  it("LES IDENTIFIANTS DISENT L'EMBOÎTEMENT, du dehors vers le dedans", () => {
    const g = imbriquees(2, 3);
    const r = deplierBoucles(g.noeuds, g.aretes);
    const ids = r.noeuds.map((x) => x.id).filter((i) => i.endsWith("::m")).sort();
    expect(ids).toEqual([
      "d1#0::d2#0::m", "d1#0::d2#1::m", "d1#0::d2#2::m",
      "d1#1::d2#0::m", "d1#1::d2#1::m", "d1#1::d2#2::m",
    ]);
  });

  it("LES DEUX SONT NOMMÉES, LA PLUS INTÉRIEURE D'ABORD", () => {
    const g = imbriquees(2, 3);
    expect(deplierBoucles(g.noeuds, g.aretes).depliees)
      .toEqual([{ debutId: "d2", tours: 3 }, { debutId: "d1", tours: 2 }]);
  });

  it("ET LES TOURS DU DEHORS S'ENCHAÎNENT : chacun part du résultat du précédent", () => {
    const g = imbriquees(2, 3);
    const r = deplierBoucles(g.noeuds, g.aretes);
    // Le premier tour du dehors part de la source ; le second, de ce que le premier a déposé.
    const versPremier = r.aretes.filter((x) => x.target === "d1#0::d2#0::m");
    expect(versPremier.map((x) => x.source)).toEqual(["s"]);
    const versSecond = r.aretes.filter((x) => x.target === "d1#1::d2#0::m");
    expect(versSecond.map((x) => x.source)).toEqual(["d1#0::f2"]);
  });

  it("L'ORDRE DES NŒUDS DANS LE FICHIER NE DÉCIDE PAS DE L'EMBOÎTEMENT, les arêtes le font", () => {
    // La fin extérieure écrite AVANT l'intérieure : le dépliage doit lire l'emboîtement sur les
    // câbles, et non sur l'ordre où les nœuds se trouvent.
    const g = imbriquees(2, 3);
    const inverse = { ...g, noeuds: [...g.noeuds].reverse() };
    const r = deplierBoucles(inverse.noeuds, inverse.aretes);
    expect(r.problemes).toEqual([]);
    expect(r.depliees).toEqual([{ debutId: "d2", tours: 3 }, { debutId: "d1", tours: 2 }]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(6);
  });

  it("TROIS NIVEAUX S'EMBOÎTENT AUSSI, rien dans la règle ne s'arrête à deux", () => {
    const noeuds = [
      n("s", "gen"),
      n("d1", FICHE_DEBUT, { Tours: 2 }), n("d2", FICHE_DEBUT, { Tours: 2 }), n("d3", FICHE_DEBUT, { Tours: 2 }),
      n("m", "transposition"),
      n("f3", FICHE_FIN), n("f2", FICHE_FIN), n("f1", FICHE_FIN),
    ];
    const aretes = [
      a("e0", "s", "d1"), a("e1", "d1", "d2"), a("e2", "d2", "d3"), a("e3", "d3", "m"),
      a("e4", "m", "f3"), a("e5", "f3", "f2"), a("e6", "f2", "f1"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toEqual([]);
    expect(r.depliees.map((d) => d.debutId)).toEqual(["d3", "d2", "d1"]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(8);
  });

  it("UN PLAFOND ARRÊTE CE QUI FERAIT S'EFFONDRER L'EXÉCUTION, plutôt que de le laisser passer", () => {
    // Trente-deux sur trente-deux, sur un ventre de quatre nœuds : plus de quatre mille copies,
    // dont chacune tiendrait un tampon audio. Le dépliage refuse et le dit sur le nœud.
    const noeuds = [
      n("s", "gen"),
      n("d1", FICHE_DEBUT, { Tours: 32 }), n("d2", FICHE_DEBUT, { Tours: 32 }),
      n("m1", "x"), n("m2", "x"), n("m3", "x"), n("m4", "x"),
      n("f2", FICHE_FIN), n("f1", FICHE_FIN),
    ];
    const aretes = [
      a("e0", "s", "d1"), a("e1", "d1", "d2"), a("e2", "d2", "m1"), a("e3", "m1", "m2"),
      a("e4", "m2", "m3"), a("e5", "m3", "m4"), a("e6", "m4", "f2"), a("e7", "f2", "f1"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toContainEqual({ noeudId: "d1", code: "trop-de-copies" });
    // L'INTÉRIEURE A TOUT DE MÊME ÉTÉ DÉPLIÉE : elle tient dans le plafond, et refuser tout le
    // graphe pour une extérieure trop large priverait de ce qui marche.
    expect(r.depliees).toEqual([{ debutId: "d2", tours: 32 }]);
  });

  it("et le plafond laisse passer ce qui tient : seize sur seize sur un ventre de quatre", () => {
    const noeuds = [
      n("s", "gen"),
      n("d1", FICHE_DEBUT, { Tours: 16 }), n("d2", FICHE_DEBUT, { Tours: 16 }),
      n("m", "x"), n("f2", FICHE_FIN), n("f1", FICHE_FIN),
    ];
    const aretes = [
      a("e0", "s", "d1"), a("e1", "d1", "d2"), a("e2", "d2", "m"), a("e3", "m", "f2"), a("e4", "f2", "f1"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "x").length).toBe(16 * 16);
    expect(16 * 16).toBeLessThanOrEqual(COPIES_MAX);
  });
});

describe("ce que le dépliage rend de ce qu'il a fait", () => {
  // RELEVÉ PAR FABIEN. Un début de boucle est RETIRÉ du graphe exécuté : il ne tourne jamais, ne
  // rend rien, et restait « En attente » pour toujours, ce qui ne dit rien de ce qui s'est passé.
  // Le nombre de tours se lirait bien dans les identifiants engendrés, mais le déduire d'une
  // convention de nommage est ce qu'on ne veut pas : le dépliage le SAIT, il le rend.
  it("IL NOMME LA BOUCLE DÉPLIÉE ET SON NOMBRE DE TOURS", () => {
    const g = grapheSimple(7);
    expect(deplierBoucles(g.noeuds, g.aretes).depliees).toEqual([{ debutId: "d", tours: 7 }]);
  });

  it("ET IL REND LE NOMBRE VRAIMENT EMPLOYÉ, non celui qu'on a écrit", () => {
    // Le réglage est borné : au-delà de trente-deux, la boucle n'en fait que trente-deux, et c'est
    // ce nombre-là que le nœud doit annoncer, sans quoi il mentirait sur ce qui a tourné.
    const g = grapheSimple(999);
    const r = deplierBoucles(g.noeuds, g.aretes);
    expect(r.depliees).toEqual([{ debutId: "d", tours: TOURS_MAX }]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "transposition").length).toBe(TOURS_MAX);
  });

  it("deux boucles en série sont nommées toutes les deux, chacune avec son compte", () => {
    const noeuds = [
      n("src", "generateur-frequence"),
      n("d1", FICHE_DEBUT, { Tours: 3 }), n("t1", "transposition"), n("f1", FICHE_FIN),
      n("d2", FICHE_DEBUT, { Tours: 5 }), n("t2", "transposition"), n("f2", FICHE_FIN),
    ];
    const aretes = [
      a("a1", "src", "d1"), a("a2", "d1", "t1"), a("a3", "t1", "f1"),
      a("a4", "f1", "d2"), a("a5", "d2", "t2"), a("a6", "t2", "f2"),
    ];
    const r = deplierBoucles(noeuds, aretes);
    expect(r.depliees).toEqual([{ debutId: "d1", tours: 3 }, { debutId: "d2", tours: 5 }]);
  });

  it("UNE BOUCLE QUI NE SE DÉPLIE PAS N'EST PAS NOMMÉE : elle a un problème, et c'est lui qu'on dit", () => {
    const r = deplierBoucles([n("src", "gen"), n("d", FICHE_DEBUT)], [a("e", "src", "d")]);
    expect(r.depliees).toEqual([]);
    expect(r.problemes).toEqual([{ noeudId: "d", code: "debut-sans-fin" }]);
  });

  it("et un graphe sans la moindre boucle n'en nomme aucune", () => {
    expect(deplierBoucles([n("a1", "x")], []).depliees).toEqual([]);
  });
});
