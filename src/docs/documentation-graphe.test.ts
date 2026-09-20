// docs/documentation-graphe.test.ts — La documentation d'un graphe.
//
// Ce qui se teste ici est ce qui distingue cette documentation du catalogue : elle décrit un
// graphe PARTICULIER, donc ses valeurs réglées, son câblage, son ordre d'exécution et ses
// défauts de câblage. Le graphe d'essai est un synthétiseur soustractif minuscule — un
// oscillateur, un filtre, une sortie — parce que c'est le cas d'usage qui a fait naître le
// nœud : confier un instrument construit dans Attic à quelqu'un qui doit bâtir dessus.
import { describe, expect, it } from "vitest";
import type { AreteG, NoeudG } from "../core/meta";
import type { FicheAudio } from "../audio/types-domaine";
import {
  documenterGraphe, documentationVersHtml, documentationVersMarkdown,
} from "./documentation-graphe";

const fiche = (o: Partial<FicheAudio> & { id: string }): FicheAudio => ({
  nom: o.id, univers: "Traitement", famille: "Effets", resume: "",
  entrees: [], sorties: [], parametres: [],
  executer: async () => ({ valeurs: [] }),
  ...o,
} as FicheAudio);

const FICHES: FicheAudio[] = [
  fiche({
    id: "oscillateur", nom: "Oscillateur", nomEn: "Oscillator", univers: "Entrées", famille: "Génération",
    resume: "Génère une forme d'onde pure.", resumeEn: "Generates a pure waveform.",
    notice: "Notice longue de l'oscillateur.", noticeEn: "Long notice of the oscillator.",
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Forme", nomEn: "Waveform", type: "choix",
        options: ["Sinus", "Dent de scie"], optionsEn: ["Sine", "Sawtooth"],
        optionIds: ["sine", "sawtooth"], defaut: "Sinus", defautEn: "Sine" },
      { nom: "Fréquence", nomEn: "Frequency", plage: [20, 4000], pas: 1, defaut: 220, unite: "Hz" },
    ],
  }),
  fiche({
    id: "filtre", nom: "Filtre", nomEn: "Filter",
    resume: "Filtre le son.", resumeEn: "Filters the sound.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Modulation", type: "controle", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Coupure", nomEn: "Cutoff", plage: [20, 20000], pas: 1, defaut: 1000, unite: "Hz" },
      { nom: "Programme", nomEn: "Program", type: "texte", defaut: "court" },
      { nom: "Caché", nomEn: "Hidden", type: "texte", defaut: "", hidden: true },
    ],
  }),
  fiche({
    id: "sortie", nom: "Sortie", nomEn: "Output", univers: "Sorties", famille: "Audio",
    resume: "Joue le son.", resumeEn: "Plays the sound.",
    entrees: [{ nom: "Audio", type: "audio" }],
  }),
];

const noeud = (id: string, ficheId: string, parametres: Record<string, unknown> = {},
  position = { x: 0, y: 0 }): NoeudG =>
  ({ id, type: "atelier", position, width: 280, height: 160, data: { ficheId, parametres } });

const arete = (id: string, source: string, target: string, s = 0, t = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${s}`, targetHandle: `in:${t}` });

/** Le synthétiseur d'essai : osc → filtre → sortie, avec deux réglages non standard. */
const SYNTHE = {
  noeuds: [
    noeud("osc", "oscillateur", { "Forme": "Dent de scie", "Fréquence": 110 }, { x: 0, y: 0 }),
    noeud("flt", "filtre", { "Coupure": 800 }, { x: 400, y: 40 }),
    noeud("out", "sortie", {}, { x: 800, y: 40 }),
  ],
  aretes: [arete("a1", "osc", "flt"), arete("a2", "flt", "out")],
  fiches: FICHES,
};

const doc = (o: Partial<Parameters<typeof documenterGraphe>[0]> = {}) =>
  documenterGraphe({ ...SYNTHE, ...o });

describe("le modèle de documentation", () => {
  it("compte les nœuds, les connexions et les composants distincts", () => {
    const d = doc();
    expect(d.compte).toEqual({ noeuds: 3, aretes: 2, composants: 3 });
  });

  it("ne compte un composant qu'une fois, quel que soit le nombre d'exemplaires", () => {
    const d = doc({
      noeuds: [...SYNTHE.noeuds, noeud("osc2", "oscillateur")],
      aretes: [...SYNTHE.aretes, arete("a3", "osc2", "flt", 0, 1)],
    });
    expect(d.compte.composants).toBe(3);
    expect(d.composants.find((c) => c.ficheId === "oscillateur")!.compte).toBe(2);
  });

  it("range les nœuds dans l'ordre d'exécution, source avant cible", () => {
    // Les nœuds sont donnés dans l'ordre ; on les mélange pour que l'ordre vienne du câblage.
    const d = doc({ noeuds: [SYNTHE.noeuds[2], SYNTHE.noeuds[0], SYNTHE.noeuds[1]] });
    expect(d.ordre).toEqual(["osc", "flt", "out"]);
    expect(d.noeuds.map((n) => n.id)).toEqual(["osc", "flt", "out"]);
  });

  it("dit par où le graphe commence et où il aboutit", () => {
    const d = doc();
    expect(d.sources).toEqual(["osc"]);
    expect(d.terminaux).toEqual(["out"]);
  });

  it("relève la valeur RÉGLÉE et distingue ce qui reste au défaut", () => {
    const osc = doc().noeuds[0];
    const forme = osc.parametres.find((p) => p.nom === "Forme")!;
    const freq = osc.parametres.find((p) => p.nom === "Fréquence")!;
    expect(forme.valeur).toBe("Dent de scie");
    expect(forme.defaut).toBe("Sinus");
    expect(forme.parDefaut).toBe(false);
    expect(freq.valeur).toBe("110 Hz");
    // Le filtre garde son programme par défaut : c'est dit, pour qu'un agent ne le cherche pas.
    const prog = doc().noeuds[1].parametres.find((p) => p.nom === "Programme")!;
    expect(prog.parDefaut).toBe(true);
  });

  it("laisse les paramètres cachés hors du document", () => {
    // Ce sont des chemins de fichier posés par l'inspecteur, pas des réglages.
    expect(doc().noeuds[1].parametres.map((p) => p.nom)).toEqual(["Coupure", "Programme"]);
  });

  it("donne les valeurs admises, pour qu'un agent sache quoi écrire", () => {
    const osc = doc().noeuds[0];
    expect(osc.parametres.find((p) => p.nom === "Forme")!.valeurs).toBe("Sinus / Dent de scie");
    expect(osc.parametres.find((p) => p.nom === "Fréquence")!.valeurs).toBe("20 – 4000 Hz, pas 1");
  });

  it("met une valeur longue ou multiligne en bloc plutôt qu'en cellule", () => {
    // Un orchestre Csound, un programme : l'aplatir dans un tableau le rendrait illisible.
    const d = doc({
      noeuds: [noeud("flt", "filtre", { "Programme": "ligne une\nligne deux" })],
      aretes: [],
    });
    const prog = d.noeuds[0].parametres.find((p) => p.nom === "Programme")!;
    expect(prog.bloc).toBe(true);
    expect(d.noeuds[0].parametres.find((p) => p.nom === "Coupure")!.bloc).toBe(false);
  });

  it("nomme les deux bouts de chaque câble, avec le port d'en face", () => {
    const flt = doc().noeuds[1];
    expect(flt.entrees[0].liens).toEqual([{ noeud: "osc", nomNoeud: "Oscillateur", port: "Audio" }]);
    expect(flt.sorties[0].liens).toEqual([{ noeud: "out", nomNoeud: "Sortie", port: "Audio" }]);
    // Une entrée facultative non branchée n'a pas de lien, et ne fait pas d'avertissement.
    expect(flt.entrees[1].liens).toEqual([]);
  });

  it("garde le nom donné à la main au nœud", () => {
    const n = noeud("osc", "oscillateur");
    n.data.nom = "Mon oscillateur grave";
    expect(doc({ noeuds: [n], aretes: [] }).noeuds[0].nom).toBe("Mon oscillateur grave");
  });

  it("compte les types de flux qui circulent", () => {
    const d = doc({ libelleFlux: (t) => (t === "audio" ? "Audio" : t) });
    expect(d.typesFlux).toEqual([{ type: "audio", libelle: "Audio", compte: 2 }]);
  });
});

describe("ce que la documentation signale", () => {
  it("une entrée obligatoire laissée libre — le graphe ne tournerait pas", () => {
    const d = doc({ noeuds: [noeud("flt", "filtre")], aretes: [] });
    expect(d.avertissements.some((a) => a.includes("Audio"))).toBe(true);
    // Mais pas l'entrée facultative.
    expect(d.avertissements.some((a) => a.includes("Modulation"))).toBe(false);
  });

  it("un composant que le registre ne connaît pas", () => {
    const d = doc({ noeuds: [noeud("x", "venu-d-ailleurs")], aretes: [] });
    expect(d.noeuds[0].inconnu).toBe(true);
    expect(d.avertissements.some((a) => a.includes("venu-d-ailleurs"))).toBe(true);
  });

  it("un cycle, que le tri topologique laisse de côté", () => {
    const d = doc({
      noeuds: [noeud("a", "filtre"), noeud("b", "filtre")],
      aretes: [arete("e1", "a", "b"), arete("e2", "b", "a")],
    });
    expect(d.avertissements.some((a) => /cycle/i.test(a))).toBe(true);
    // Les nœuds du cycle restent documentés : c'est le graphe de quelqu'un.
    expect(d.noeuds.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("un graphe vide", () => {
    const d = doc({ noeuds: [], aretes: [] });
    expect(d.avertissements.length).toBeGreaterThan(0);
    expect(d.compte.noeuds).toBe(0);
  });
});

describe("le JSON rendu", () => {
  it("rejoue le graphe : les nœuds, leurs réglages et les arêtes", () => {
    const relu = JSON.parse(doc().json);
    expect(relu.nodes.map((n: any) => n.id)).toEqual(["osc", "flt", "out"]);
    expect(relu.nodes[0].data).toEqual({
      ficheId: "oscillateur", parametres: { "Forme": "Dent de scie", "Fréquence": 110 },
    });
    expect(relu.edges[0]).toEqual({
      id: "a1", source: "osc", target: "flt", sourceHandle: "out:0", targetHandle: "in:0",
    });
  });
});

describe("le Markdown, pour un agent", () => {
  const md = documentationVersMarkdown(doc({ titre: "Synthétiseur soustractif" }));

  it("porte le titre demandé et les comptes", () => {
    expect(md.startsWith("# Synthétiseur soustractif")).toBe(true);
    expect(md).toContain("3 nœuds · 2 connexions · 3 composants");
  });

  it("donne l'ordre d'exécution avant les notices", () => {
    expect(md.indexOf("Ordre d'exécution")).toBeLessThan(md.indexOf("Notice longue de l'oscillateur"));
  });

  it("met en gras la valeur réglée, et laisse le défaut en clair", () => {
    expect(md).toContain("| Fréquence | **110 Hz** | 220 Hz |");
    expect(md).toContain("| Programme | court | court |");
  });

  it("porte la notice de chaque composant employé", () => {
    expect(md).toContain("Notice longue de l'oscillateur.");
  });

  it("ne coupe pas ses tableaux sur une valeur à barre verticale", () => {
    const d = doc({ noeuds: [noeud("flt", "filtre", { "Programme": "a | b" })], aretes: [] });
    expect(documentationVersMarkdown(d)).toContain("a \\| b");
  });

  it("finit par le JSON du graphe", () => {
    expect(md.trimEnd().endsWith("```")).toBe(true);
    expect(md).toContain("\"ficheId\": \"oscillateur\"");
  });

  it("se laisse alléger : sans notices, il est bien plus court", () => {
    const court = documentationVersMarkdown(doc({ notices: false }));
    expect(court).not.toContain("Notice longue de l'oscillateur.");
    expect(court.length).toBeLessThan(md.length);
  });

  it("parle anglais quand on le lui demande", () => {
    const en = documentationVersMarkdown(doc({ langue: "en" }));
    expect(en).toContain("Execution order");
    expect(en).toContain("Long notice of the oscillator.");
    expect(en).toContain("Sawtooth");
    // La PROSE est en anglais — mais le JSON de la fin garde la valeur telle qu'elle est
    // enregistrée dans le graphe, « Dent de scie », faute de quoi il ne le rejouerait plus.
    const prose = en.slice(0, en.indexOf("```json"));
    expect(prose).not.toContain("Dent de scie");
    expect(en.slice(en.indexOf("```json"))).toContain("Dent de scie");
  });
});

describe("le site, pour un humain", () => {
  const html = documentationVersHtml(doc({ titre: "Synthétiseur soustractif" }));

  it("est une page complète et autonome — aucune ressource à charger", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain("<title>Synthétiseur soustractif</title>");
    expect(html).not.toMatch(/<(script|link)\b/);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("dessine le graphe aux positions réelles des nœuds", () => {
    // Le filtre est posé à x=400 : on doit le retrouver là, pas dans une colonne inventée.
    expect(html).toContain("<svg viewBox=");
    expect(html).toMatch(/<rect x="400" y="40"/);
    // Un câble par arête.
    expect((html.match(/class="cable"/g) ?? []).length).toBe(2);
  });

  it("a un sommaire qui pointe sur chaque nœud et chaque composant", () => {
    expect(html).toContain('href="#noeud-osc"');
    expect(html).toContain('href="#composant-oscillateur"');
    expect(html).toContain('id="noeud-flt"');
  });

  it("marque la valeur réglée d'une classe, pour qu'elle se voie", () => {
    expect(html).toContain('<td class="regle">110 Hz</td>');
  });

  it("échappe ce qui viendrait d'un nom de nœud ou d'un programme", () => {
    const n = noeud("x", "filtre", { "Programme": "<script>alert(1)</script>" });
    n.data.nom = "<b>gras</b>";
    const sale = documentationVersHtml(doc({ noeuds: [n], aretes: [] }));
    expect(sale).not.toContain("<script>alert(1)</script>");
    expect(sale).not.toContain("<b>gras</b>");
    expect(sale).toContain("&lt;b&gt;gras&lt;/b&gt;");
  });

  it("tient debout sur un graphe vide", () => {
    const vide = documentationVersHtml(doc({ noeuds: [], aretes: [] }));
    expect(vide.startsWith("<!doctype html>")).toBe(true);
    expect(vide).not.toContain("<svg viewBox=");
  });
});

describe("la génération est reproductible", () => {
  it("deux documentations du même graphe donnent le même texte", () => {
    // Sans cela, la documentation ne peut pas être mise sous contrôle de version à côté du
    // graphe : chaque génération ferait un diff.
    expect(documentationVersMarkdown(doc())).toBe(documentationVersMarkdown(doc()));
    expect(documentationVersHtml(doc())).toBe(documentationVersHtml(doc()));
  });

  it("ne porte ni date ni version", () => {
    const md = documentationVersMarkdown(doc());
    expect(md).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });
});
