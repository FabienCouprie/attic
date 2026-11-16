// src/docs/compatibilite-ecarts.test.ts — La frontière entre compatible et rupture, sur des contrats
// écrits à la main dont la réponse est connue.
//
// Le registre vivant ne porte aucun renommage déclaré, aucun ancien réglage retiré, aucun alias qui
// perd un réglage : ces cas-là ne peuvent s'éprouver que sur des contrats d'essai. Ceux du registre
// sont dans `compatibilite-cecite.test.ts`.
import { describe, expect, it } from "vitest";

import {
  homonymesDuContrat, manifesteDuRegistre, manifesteEnTexte, relecteurDuManifeste,
  type ComposantManifeste, type FicheContrat, type Manifeste,
} from "./compatibilite";
import { comparerManifestes, type Ecart } from "./compatibilite-ecarts";

const gain = { nom: "Gain", type: "curseur", defaut: 50, min: 0, max: 100, unite: "%" };
const forme = { nom: "Forme", type: "choix", defaut: "sine", choix: ["sine", "square"] };
const base = (): ComposantManifeste => ({
  version: 1,
  entrees: [{ nom: "Audio", type: "audio" }, { nom: "Courbe", type: "courbe", requis: false, module: "Gain" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  reglages: [structuredClone(gain), structuredClone(forme)],
});
const manifeste = (composants: Record<string, ComposantManifeste>): Manifeste => ({ forme: 1, composants, retires: {} });

/** Les écarts de `a` à `b`, en lignes lisibles, les ruptures marquées d'un point d'exclamation. */
function ecarts(a: Manifeste, b: Manifeste): string[] {
  return comparerManifestes(a, b, relecteurDuManifeste(b)).map((e: Ecart) => `${e.rupture ? "!" : "~"} ${e.composant} · ${e.texte}`);
}

describe("un réglage se tient par sa clé", () => {
  it("RENOMMÉ AVEC SON ANCIEN NOM DÉCLARÉ, il est compatible, et son contrat se compare encore", () => {
    const b = base();
    b.reglages[0] = { ...b.reglages[0], nom: "Niveau", nomsHerites: ["Gain"] };
    b.entrees[1].module = "Niveau";
    expect(ecarts(manifeste({ x: base() }), manifeste({ x: b })))
      .toEqual(["~ x · réglage « Gain » renommé « Niveau », l'ancien nom est relu"]);
    b.reglages[0].defaut = 40;
    expect(ecarts(manifeste({ x: base() }), manifeste({ x: b }))).toContain("! x · réglage « Gain » : défaut 50 → 40");
  });

  it("RENOMMÉ SANS SON ANCIEN NOM, c'est une valeur perdue et un réglage ajouté", () => {
    const b = base();
    b.reglages[0] = { ...b.reglages[0], nom: "Niveau" };
    b.entrees[1].module = "Niveau";
    expect(ecarts(manifeste({ x: base() }), manifeste({ x: b }))).toEqual([
      "! x · entrée 1 « Courbe » : module \"Gain\" → \"Niveau\"",
      "! x · réglage « Gain » retiré, plus rien ne le relit",
      "~ x · réglage « Niveau » ajouté",
    ]);
  });

  it("RETIRÉ DE LA FICHE ET ENCORE LU PAR L'EXÉCUTEUR, il est compatible", () => {
    // La courbe qui pilotait « Gain » ne pilote plus rien : cela, en revanche, est rompu.
    const b = base();
    b.reglages.shift();
    delete b.entrees[1].module;
    b.anciensReglages = ["Gain"];
    const vus = ecarts(manifeste({ x: base() }), manifeste({ x: b }));
    expect(vus.filter((l) => l.startsWith("!"))).toEqual(["! x · entrée 1 « Courbe » : module \"Gain\" → aucun"]);
    expect(vus).toContain("~ x · réglage « Gain » retiré de la fiche, encore lu par l'exécuteur");
  });

  it("UNE MIGRATION RETIRÉE EST UNE RUPTURE : le nom hérité ne se relit plus", () => {
    const a = base();
    a.reglages[0] = { ...a.reglages[0], nomsHerites: ["Volume"] };
    expect(ecarts(manifeste({ x: a }), manifeste({ x: base() })))
      .toEqual(["! x · réglage « Volume » retiré, plus rien ne le relit"]);
  });
});

describe("une valeur de choix se tient si le chargement la reconnaît", () => {
  it("RETIRÉE AVEC UNE OPTION HÉRITÉE qui la ramène à une autre, elle est relue", () => {
    const b = base();
    b.reglages[1] = { ...b.reglages[1], choix: ["sine"], optionsHeritees: { square: "sine" } };
    expect(ecarts(manifeste({ x: base() }), manifeste({ x: b })))
      .toEqual(["~ x · réglage « Forme » : la valeur « square » se relit « sine »"]);
  });

  it("RETIRÉE SANS RIEN, elle est perdue ; et l'option héritée retirée l'est aussi", () => {
    const a = base();
    a.reglages[1] = { ...a.reglages[1], optionsHeritees: { Carré: "square", Rond: "rond" } };
    const b = base();
    b.reglages[1].choix = ["sine"];
    expect(ecarts(manifeste({ x: a }), manifeste({ x: b }))).toEqual([
      "! x · réglage « Forme » : la valeur « square » n'est plus reconnue",
      "! x · réglage « Forme » : la valeur « Carré » n'est plus reconnue",
    ]);
  });

  it("UN DÉFAUT RÉÉCRIT SOUS UN AUTRE NOM DE LA MÊME VALEUR n'est pas un défaut changé", () => {
    // Le passage d'un choix à ses identifiants : l'ancien défaut était le libellé, il se relit.
    const a = base();
    a.reglages[1] = { ...a.reglages[1], defaut: "Sinus", choix: ["Sinus", "Carré"] };
    const b = base();
    b.reglages[1] = { ...b.reglages[1], optionsHeritees: { Carré: "square", Sinus: "sine" } };
    expect(ecarts(manifeste({ x: a }), manifeste({ x: b })).filter((l) => l.startsWith("!"))).toEqual([]);
  });
});

describe("un port se tient par son rang", () => {
  it("DEUX PORTS DU MÊME TYPE QUI ÉCHANGENT LEUR RANG se voient, et les deux câbles avec", () => {
    const a = base();
    a.sorties = [{ nom: "Gauche", type: "audio" }, { nom: "Droite", type: "audio" }];
    const b = base();
    b.sorties = [{ nom: "Droite", type: "audio" }, { nom: "Gauche", type: "audio" }];
    expect(ecarts(manifeste({ x: a }), manifeste({ x: b }))).toEqual([
      "! x · sortie 0 « Gauche » : renommée « Droite »",
      "! x · sortie 1 « Droite » : renommée « Gauche »",
    ]);
  });

  it("UNE ENTRÉE FACULTATIVE AJOUTÉE À LA FIN est compatible ; obligatoire, elle ne l'est pas", () => {
    const b = base();
    b.entrees.push({ nom: "Clé", type: "midi", requis: false });
    expect(ecarts(manifeste({ x: base() }), manifeste({ x: b }))).toEqual(["~ x · entrée 2 « Clé » ajoutée"]);
    delete b.entrees[2].requis;
    expect(ecarts(manifeste({ x: base() }), manifeste({ x: b }))).toEqual(["! x · entrée 2 « Clé » ajoutée, obligatoire"]);
  });
});

describe("un composant se tient par son identifiant, ou par un alias", () => {
  it("UN ALIAS NE VAUT QUE CE QUE LE COMPOSANT D'ARRIVÉE REPREND", () => {
    const arrivee = base();
    arrivee.alias = ["ancien"];
    arrivee.reglages.pop();
    const vus = ecarts(manifeste({ ancien: base(), y: base() }), manifeste({ y: arrivee }));
    expect(vus).toContain("~ ancien · remplacé par l'alias vers « y »");
    expect(vus).toContain("! ancien · par l'alias vers « y », réglage « Forme » retiré, plus rien ne le relit");
  });

  it("UN ALIAS RETIRÉ se range sous le composant qui le portait, que le journal connaît", () => {
    const a = base();
    a.alias = ["vieux"];
    expect(ecarts(manifeste({ y: a }), manifeste({ y: base() }))).toEqual(["! y · l'alias « vieux » est retiré"]);
  });
});

describe("le manifeste en texte", () => {
  const fiche = (id: string): FicheContrat => ({
    id,
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Courbe", type: "courbe", requis: false, module: "Gain" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Gain", defaut: 50, plage: [0, 100], unite: "%", nomsHerites: ["Volume"] },
      { nom: "Forme", type: "choix", options: ["Sinus", "Carré"], optionIds: ["sine", "square"], defaut: "Sinus",
        optionsHeritees: { Sine: "sine" } },
      { nom: "Graine", type: "nombre", defaut: 0, graine: true },
    ],
    anciensReglages: ["Fondu"],
  });

  it("SE RELIT À L'IDENTIQUE, et range les composants par identifiant", () => {
    const m = manifesteDuRegistre([fiche("b"), fiche("a")], { vieux: "a" }, new Map([["b", 3], ["parti", 2]]));
    expect(JSON.parse(manifesteEnTexte(m))).toEqual(m);
    expect(Object.keys(m.composants)).toEqual(["a", "b"]);
    expect(m.composants.a.alias).toEqual(["vieux"]);
    expect([m.composants.a.version, m.composants.b.version]).toEqual([1, 3]);
    expect(m.retires).toEqual({ parti: { version: 2, alias: null } });
    // Le défaut d'un choix est canonique, le genre absent est un curseur.
    expect(m.composants.a.reglages[1].defaut).toBe("sine");
    expect(m.composants.a.reglages[0].type).toBe("curseur");
  });

  it("UNE BORNE INFINIE NE S'ÉCRIT PAS, et la fermer reste une rupture une fois relue du fichier", () => {
    // Le JSON écrit `Infinity` comme `null`, et `1000 < null` est faux : la borne fermée passait.
    const ouverte = fiche("a");
    ouverte.parametres[0].plage = [0, Infinity];
    const m = manifesteDuRegistre([ouverte], {}, new Map());
    const relu = JSON.parse(manifesteEnTexte(m)) as Manifeste;
    expect(relu).toEqual(m);
    expect(ecarts(relu, manifesteDuRegistre([fiche("a")], {}, new Map())))
      .toEqual(["! a · réglage « Gain » : bornes [0, aucun] → [0, 100]"]);
  });

  it("UN RÉGLAGE PAR LIGNE, pour que le diff d'un défaut changé montre ce réglage-là", () => {
    const lignes = manifesteEnTexte(manifesteDuRegistre([fiche("a")], {}, new Map())).split("\n");
    expect(lignes.filter((l) => l.includes("\"nom\":\"Gain\""))).toHaveLength(1);
  });

  it("REFUSE CE QUI LE RENDRAIT AMBIGU", () => {
    const f = fiche("a");
    f.parametres.push({ nom: "Gain", defaut: 1 });
    f.anciensReglages = ["Forme"];
    expect(homonymesDuContrat([f, fiche("b")], { b: "a", perdu: "nulle-part" })).toEqual([
      "a · deux réglages se nomment « Gain »",
      "a · l'ancien réglage « Forme » porte le nom d'un réglage vivant",
      "l'alias « b » porte l'identifiant d'un composant inscrit",
      "l'alias « perdu » mène à « nulle-part », qui n'est pas inscrit",
    ]);
  });
});
