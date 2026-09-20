// core/instrument-graphe.test.ts — Un instrument déplié doit rejouer la MÊME recette à chaque note.
//
// Deux promesses à tenir, et elles sont différentes de celles d'une boucle. La première : les copies
// sont INDÉPENDANTES — un instrument ne chaîne pas ses notes, contrairement à une boucle où chaque
// tour part du résultat du précédent. La seconde : la note est bien INJECTÉE dans chaque copie du
// nœud « Note », et nulle part ailleurs — les autres réglages sont ceux que l'utilisateur a posés.
import { describe, expect, it } from "vitest";
import {
  FICHE_FIN, FICHE_NOTE, NOTE_MAX, NOTE_MIN, ZONES_MAX,
  apparierRendus, deplierInstruments, racinesInstrument,
} from "./instrument-graphe";
import type { AreteG, NoeudG } from "./meta";

const n = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG =>
  ({ id, position: { x: 0, y: 0 }, data: { ficheId, parametres } });
const a = (id: string, source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

/** Le graphe d'usage : Note → filtre → réverbération → fin. */
function instrumentSimple(paramsFin: Record<string, unknown> = {}) {
  return {
    noeuds: [
      n("note", FICHE_NOTE, { Note: 60 }),
      n("filtre", "reponse-filtre"),
      n("reverbe", "reverbe-reseau"),
      n("fin", FICHE_FIN, { "Largeur de zone": 2, "Note basse": 21, "Note haute": 108, ...paramsFin }),
    ],
    aretes: [a("e1", "note", "filtre"), a("e2", "filtre", "reverbe"), a("e3", "reverbe", "fin")],
  };
}

describe("les racines", () => {
  it("couvrent les 88 touches en dix-huit notes à ±2 demi-tons", () => {
    const racines = racinesInstrument(n("fin", FICHE_FIN, { "Largeur de zone": 2, "Note basse": 21, "Note haute": 108 }));
    expect(racines.length, `${racines.length} racines`).toBe(18);
    expect(racines[0]).toBe(23);
    expect(racines[racines.length - 1]).toBeLessThanOrEqual(NOTE_MAX);
  });

  it("tombent TOUTES dans le clavier : chaque note rendue est une note jouable", () => {
    for (const largeur of [0, 1, 2, 3, 6]) {
      const racines = racinesInstrument(n("f", FICHE_FIN, { "Largeur de zone": largeur, "Note basse": 21, "Note haute": 108 }));
      for (const r of racines) {
        expect(r, `largeur ${largeur}`).toBeGreaterThanOrEqual(NOTE_MIN);
        expect(r).toBeLessThanOrEqual(NOTE_MAX);
      }
    }
  });

  it("couvrent l'étendue demandée, bornes comprises", () => {
    const racines = racinesInstrument(n("f", FICHE_FIN, { "Largeur de zone": 2, "Note basse": 48, "Note haute": 72 }));
    // La plus grave couvre 48, la plus aiguë atteint 72.
    expect(racines[0] - 2).toBeLessThanOrEqual(48);
    expect(racines[racines.length - 1] + 2).toBeGreaterThanOrEqual(72);
  });

  it("rendent une seule racine quand on ne demande qu'une note", () => {
    const racines = racinesInstrument(n("f", FICHE_FIN, { "Largeur de zone": 2, "Note basse": 60, "Note haute": 60 }));
    expect(racines).toEqual([60]);
  });

  it("donnent plus de racines quand on resserre les zones", () => {
    const serre = racinesInstrument(n("f", FICHE_FIN, { "Largeur de zone": 1, "Note basse": 21, "Note haute": 108 })).length;
    const large = racinesInstrument(n("f", FICHE_FIN, { "Largeur de zone": 6, "Note basse": 21, "Note haute": 108 })).length;
    expect(serre).toBeGreaterThan(large * 2);
  });
});

describe("graphe sans instrument", () => {
  it("ressort exactement tel quel", () => {
    const g = { noeuds: [n("a1", "x"), n("b1", "y")], aretes: [a("e", "a1", "b1")] };
    const r = deplierInstruments(g.noeuds, g.aretes);
    expect(r.noeuds).toBe(g.noeuds);
    expect(r.aretes).toBe(g.aretes);
    expect(r.problemes).toEqual([]);
  });
});

describe("le dépliage", () => {
  it("recopie la chaîne AUTANT DE FOIS qu'il y a de racines", () => {
    const g = instrumentSimple();
    const r = deplierInstruments(g.noeuds, g.aretes);
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "reponse-filtre").length).toBe(18);
    expect(r.noeuds.filter((x) => x.data.ficheId === FICHE_NOTE).length).toBe(18);
    // La fin, elle, reste unique : c'est elle qui rassemble.
    expect(r.noeuds.filter((x) => x.data.ficheId === FICHE_FIN).length).toBe(1);
  });

  it("INJECTE la note dans chaque copie du nœud « Note », et dans elle seule", () => {
    const g = instrumentSimple();
    const r = deplierInstruments(g.noeuds, g.aretes);
    const racines = racinesInstrument(g.noeuds[3]);
    const notes = r.noeuds.filter((x) => x.data.ficheId === FICHE_NOTE);
    const injectees = notes.map((x) => Number((x.data.parametres as any).Note)).sort((p, q) => p - q);
    expect(injectees).toEqual([...racines].sort((p, q) => p - q));
    // Les autres nœuds gardent leurs réglages : la recette ne change pas d'une note à l'autre.
    for (const x of r.noeuds.filter((y) => y.data.ficheId === "reponse-filtre")) {
      expect((x.data.parametres as any).Note).toBeUndefined();
    }
  });

  it("livre un rendu par racine à la fin, DANS L'ORDRE des racines", () => {
    const g = instrumentSimple();
    const r = deplierInstruments(g.noeuds, g.aretes);
    const versFin = r.aretes.filter((x) => x.target === "fin");
    expect(versFin.length).toBe(18);
    // L'ordre des arêtes doit suivre celui des racines : la fin s'en sert pour nommer ses zones.
    const racines = racinesInstrument(g.noeuds[3]);
    const notesParId = new Map(r.noeuds.map((x) => [x.id, x]));
    const ordre = versFin.map((arete) => {
      // Remonter de la copie du dernier nœud à la copie du nœud « Note » du même indice.
      const k = /@(\d+)::/.exec(arete.source)?.[1];
      const copieNote = [...notesParId.values()].find(
        (x) => x.data.ficheId === FICHE_NOTE && x.id.includes(`@${k}::`),
      );
      return Number((copieNote!.data.parametres as any).Note);
    });
    expect(ordre).toEqual(racines);
  });

  it("garde les copies INDÉPENDANTES : aucune ne reçoit le résultat d'une autre", () => {
    // C'est la différence avec une boucle, et elle se vérifie : aucune arête ne doit relier deux
    // copies d'indices différents.
    const g = instrumentSimple();
    const r = deplierInstruments(g.noeuds, g.aretes);
    for (const arete of r.aretes) {
      const ks = /@(\d+)::/.exec(arete.source)?.[1];
      const kt = /@(\d+)::/.exec(arete.target)?.[1];
      if (ks !== undefined && kt !== undefined) expect(ks, `${arete.source} → ${arete.target}`).toBe(kt);
    }
  });

  it("recopie une chaîne de plusieurs nœuds en gardant son câblage interne", () => {
    const g = instrumentSimple({ "Note haute": 33 }); // trois racines, pour lire le résultat
    const r = deplierInstruments(g.noeuds, g.aretes);
    const racines = racinesInstrument(g.noeuds[3]);
    for (let k = 0; k < racines.length; k++) {
      const versFiltre = r.aretes.filter((x) => x.target === `fin@${k}::filtre`);
      expect(versFiltre.length, `copie ${k}`).toBe(1);
      expect(versFiltre[0].source).toBe(`fin@${k}::note`);
    }
  });

  it("alimente chaque copie à l'identique depuis une source extérieure", () => {
    const g = instrumentSimple({ "Note haute": 33 });
    g.noeuds.push(n("courbe", "generateur-courbe"));
    g.aretes.push(a("ec", "courbe", "filtre", 0, 1));
    const r = deplierInstruments(g.noeuds, g.aretes);
    const racines = racinesInstrument(g.noeuds[3]);
    const depuisCourbe = r.aretes.filter((x) => x.source === "courbe");
    expect(depuisCourbe.length).toBe(racines.length);
  });

  it("ne laisse sortir qu'une fois ce qui quitte l'instrument par ailleurs", () => {
    const g = instrumentSimple({ "Note haute": 45 });
    g.noeuds.push(n("obs", "visualiseur-forme-onde"));
    g.aretes.push(a("eo", "filtre", "obs"));
    const r = deplierInstruments(g.noeuds, g.aretes);
    expect(r.aretes.filter((x) => x.target === "obs").length).toBe(1);
    // Et c'est la copie de la note la plus GRAVE qui sort, pour que le choix soit prévisible.
    expect(r.aretes.find((x) => x.target === "obs")!.source).toContain("@0::");
  });

  it("rattache chaque copie à son nœud d'origine, pour que les statuts s'affichent", () => {
    const g = instrumentSimple({ "Note haute": 33 });
    const r = deplierInstruments(g.noeuds, g.aretes);
    for (const [copie, origine] of r.origines) {
      expect(["note", "filtre", "reverbe"]).toContain(origine);
      expect(copie).toContain(origine);
    }
  });

  it("ne laisse aucun cycle derrière lui", () => {
    const g = instrumentSimple({ "Note haute": 45 });
    const r = deplierInstruments(g.noeuds, g.aretes);
    const sortants = new Map<string, string[]>();
    for (const x of r.aretes) sortants.set(x.source, [...(sortants.get(x.source) ?? []), x.target]);
    const vus = new Set<string>(), enCours = new Set<string>();
    const cycle = (id: string): boolean => {
      if (enCours.has(id)) return true;
      if (vus.has(id)) return false;
      vus.add(id); enCours.add(id);
      for (const s of sortants.get(id) ?? []) if (cycle(s)) return true;
      enCours.delete(id);
      return false;
    };
    for (const x of r.noeuds) expect(cycle(x.id), `cycle depuis ${x.id}`).toBe(false);
  });
});

describe("câblages fautifs", () => {
  it("signale une fin sans nœud « Note » en amont", () => {
    const r = deplierInstruments(
      [n("src", "oscillateur"), n("fin", FICHE_FIN)],
      [a("e", "src", "fin")],
    );
    expect(r.problemes).toEqual([{ noeudId: "fin", code: "fin-sans-note" }]);
  });

  it("signale deux nœuds « Note » en amont d'une même fin", () => {
    const r = deplierInstruments(
      [n("n1", FICHE_NOTE), n("n2", FICHE_NOTE), n("mix", "melangeur"), n("fin", FICHE_FIN)],
      [a("e1", "n1", "mix"), a("e2", "n2", "mix"), a("e3", "mix", "fin")],
    );
    expect(r.problemes).toEqual([{ noeudId: "fin", code: "notes-multiples" }]);
  });

  it("signale un instrument vide plutôt que de recopier le néant", () => {
    const r = deplierInstruments(
      [n("note", FICHE_NOTE), n("fin", FICHE_FIN)],
      [a("e", "note", "fin")],
    );
    expect(r.problemes).toEqual([{ noeudId: "note", code: "instrument-vide" }]);
  });

  it("REFUSE de déplier trop de zones, au lieu de lancer des centaines de rendus", () => {
    // Une largeur de zéro sur 88 touches demanderait 88 rendus de la chaîne entière. La borne
    // existe pour que le nœud le dise au lieu de figer l'application.
    const r = deplierInstruments(
      [n("note", FICHE_NOTE), n("f", "reponse-filtre"),
       n("fin", FICHE_FIN, { "Largeur de zone": 0, "Note basse": 21, "Note haute": 108 })],
      [a("e1", "note", "f"), a("e2", "f", "fin")],
    );
    expect(r.problemes).toEqual([{ noeudId: "fin", code: "trop-de-zones" }]);
    // Et le graphe ressort intact : refuser, ce n'est pas abîmer.
    expect(r.noeuds.filter((x) => x.data.ficheId === "reponse-filtre").length).toBe(1);
  });

  it("laisse tel quel un nœud « Note » sans fin en aval, pour qu'on puisse écouter une seule note", () => {
    const r = deplierInstruments(
      [n("note", FICHE_NOTE, { Note: 72 }), n("f", "reponse-filtre")],
      [a("e", "note", "f")],
    );
    expect(r.problemes).toEqual([]);
    const note = r.noeuds.find((x) => x.data.ficheId === FICHE_NOTE)!;
    expect((note.data.parametres as any).Note).toBe(72);
  });

  it("déplie deux instruments indépendants sans les confondre", () => {
    const r = deplierInstruments(
      [n("n1", FICHE_NOTE), n("f1", "reponse-filtre"), n("fin1", FICHE_FIN, { "Largeur de zone": 2, "Note basse": 21, "Note haute": 33 }),
       n("n2", FICHE_NOTE), n("f2", "tremolo"), n("fin2", FICHE_FIN, { "Largeur de zone": 2, "Note basse": 60, "Note haute": 72 })],
      [a("a1", "n1", "f1"), a("a2", "f1", "fin1"), a("b1", "n2", "f2"), a("b2", "f2", "fin2")],
    );
    expect(r.problemes).toEqual([]);
    expect(r.noeuds.filter((x) => x.data.ficheId === "reponse-filtre").length).toBe(3);
    expect(r.noeuds.filter((x) => x.data.ficheId === "tremolo").length).toBe(3);
  });

  it("borne le nombre de zones à une valeur qui reste calculable", () => {
    expect(ZONES_MAX).toBeLessThanOrEqual(88);
    expect(ZONES_MAX).toBeGreaterThanOrEqual(18);
  });
});

describe("l'appariement des rendus avec leurs notes", () => {
  // CE QUI SE JOUE ICI. La fin d'instrument reçoit une entrée PAR ARÊTE, dans l'ordre des copies, et
  // une copie qui a échoué livre `null`. Filtrer les nulls puis prendre les n premières racines —
  // ce que faisait le nœud — décale TOUTES les notes suivantes dès qu'une copie du milieu échoue :
  // la banque a alors le bon nombre de zones et de fausses hauteurs, et aucun message ne le dit.
  const estNombre = (v: unknown): v is number => typeof v === "number";

  it("apparie chaque rendu à sa note quand tout arrive", () => {
    const r = apparierRendus([10, 20, 30], [60, 65, 70], estNombre);
    expect(r.nonDeplie).toBe(false);
    expect(r.parCopie).toBe(1);
    expect(r.manquantes).toEqual([]);
    expect(r.paires).toEqual([
      { racine: 60, valeur: 10 }, { racine: 65, valeur: 20 }, { racine: 70, valeur: 30 },
    ]);
  });

  it("NE DÉCALE PAS les notes suivantes quand une copie du milieu échoue", () => {
    const r = apparierRendus([10, null, 30], [60, 65, 70], estNombre);
    expect(r.manquantes).toEqual([65]);
    // 30 appartient à la note 70, et non à 65 comme le donnait un simple filtrage.
    expect(r.paires).toEqual([{ racine: 60, valeur: 10 }, { racine: 70, valeur: 30 }]);
  });

  it("nomme toutes les notes manquantes quand une seule copie survit", () => {
    const racines = [23, 28, 33, 38, 43];
    const r = apparierRendus([null, null, 7, null, null], racines, estNombre);
    expect(r.paires).toEqual([{ racine: 33, valeur: 7 }]);
    expect(r.manquantes).toEqual([23, 28, 38, 43]);
  });

  it("DIT que la chaîne n'a pas été dépliée quand le compte ne correspond pas", () => {
    // Le cas vécu : une fin réglée sur dix-huit notes, mais une seule arête entrante — le dépliage
    // n'a pas eu lieu, faute de « Note d'instrument » en amont. Rendre une banque ici la rendrait
    // désaccordée en silence : la note 60 serait étiquetée 23.
    const r = apparierRendus([42], Array.from({ length: 18 }, (_, i) => 23 + 5 * i), estNombre);
    expect(r.nonDeplie).toBe(true);
    expect(r.paires).toEqual([]);
    expect(r.manquantes.length).toBe(18);
  });

  it("accepte plusieurs nœuds de la chaîne aboutissant à la fin, et garde le premier de chaque note", () => {
    // Deux arêtes par copie : [note1-brancheA, note1-brancheB, note2-brancheA, …].
    const r = apparierRendus([1, 2, 3, 4], [60, 65], estNombre);
    expect(r.parCopie).toBe(2);
    expect(r.paires).toEqual([{ racine: 60, valeur: 1 }, { racine: 65, valeur: 3 }]);
  });

  it("se rabat sur la seconde branche quand la première d'une note a échoué", () => {
    const r = apparierRendus([null, 2, 3, null], [60, 65], estNombre);
    expect(r.paires).toEqual([{ racine: 60, valeur: 2 }, { racine: 65, valeur: 3 }]);
    expect(r.manquantes).toEqual([]);
  });

  it("ne dit rien d'une liste de racines vide", () => {
    expect(apparierRendus([], [], estNombre)).toEqual({ paires: [], manquantes: [], parCopie: 0, nonDeplie: false });
  });
});
