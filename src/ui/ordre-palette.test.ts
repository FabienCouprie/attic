// ui/ordre-palette.test.ts — L'ordre des rubriques ne doit pas dépendre de ce qu'on cherche.
//
// LE TEST QUI COMPTE EST LE PREMIER, et il reproduit le défaut signalé : on cherche un mot que
// seuls des nœuds de Traitement portent, plus un nœud d'Entrées, et l'on vérifie que les Entrées
// restent en tête. Avant correction, la palette rangeait les univers dans l'ordre où les fiches
// RETENUES se présentaient : la première correspondance décidait du premier titre.
//
// LE SECOND éprouve la même chose sur le vrai catalogue, où l'ordre des univers doit être
// identique pour n'importe quelle recherche — c'est la formulation la plus proche de ce qu'un
// utilisateur constate.
import { describe, expect, it } from "vitest";
import { grouperFiches } from "./ordre-palette";
import { filtrerFiches } from "./recherche-palette";
import { toutesLesFiches } from "../plugins";
import { ORDRE_UNIVERS } from "../audio/ordre-catalogue";
import type { FicheAudio } from "../audio/types-domaine";

const fiche = (id: string, univers: string, famille: string, nom = id, resume = ""): FicheAudio => ({
  id, nom, univers, famille, resume,
  entrees: [], sorties: [], parametres: [],
  executer: async () => ({ valeurs: [] }),
} as unknown as FicheAudio);

const nomDe = (f: FicheAudio) => f.nom;
const familleDe = (f: string) => f;
const universDe = (fiches: FicheAudio[]) => grouperFiches(fiches, nomDe, familleDe).map((g) => g.univers);

describe("l'ordre des rubriques de la palette", () => {
  // Une liste où un nœud de Traitement se présente AVANT celui d'Entrées : c'est ce que produit
  // une recherche dont la première correspondance n'est pas une entrée.
  const melange = [
    fiche("reverb", "Traitement", "Effets"),
    fiche("micro", "Entrées", "Audio"),
    fiche("zip", "Autres", "Installation"),
    fiche("gonio", "Visualisation", "Analyse"),
    fiche("wav", "Sorties", "Export"),
  ];

  it("LES ENTRÉES RESTENT EN TÊTE, quel que soit l'ordre d'arrivée des fiches", () => {
    expect(universDe(melange)[0]).toBe("Entrées");
  });

  it("l'ordre suit celui du catalogue, et « Autres » ferme la marche", () => {
    expect(universDe(melange)).toEqual(["Entrées", "Traitement", "Visualisation", "Sorties", "Autres"]);
  });

  it("RANGER LA MÊME LISTE À L'ENVERS NE CHANGE RIEN", () => {
    expect(universDe([...melange].reverse())).toEqual(universDe(melange));
  });

  it("un univers inconnu de la liste vient après, sans rien déranger", () => {
    const avecInconnu = [...melange, fiche("truc", "Zone inconnue", "Divers")];
    const ordre = universDe(avecInconnu);
    expect(ordre[0]).toBe("Entrées");
    expect(ordre[ordre.length - 1]).toBe("Zone inconnue");
  });

  it("les familles et les nœuds sont rangés par leur nom affiché", () => {
    const g = grouperFiches([
      fiche("b", "Traitement", "Zebre", "Beta"),
      fiche("a", "Traitement", "Alpha", "Alpha"),
      fiche("c", "Traitement", "Alpha", "Zeta"),
    ], nomDe, familleDe);
    expect(g[0].familles.map((f) => f.famille)).toEqual(["Alpha", "Zebre"]);
    expect(g[0].familles[0].defs.map((d) => d.nom)).toEqual(["Alpha", "Zeta"]);
  });

  it("la traduction du libellé décide du rang des familles, pas le terme stocké", () => {
    const g = grouperFiches([
      fiche("a", "Traitement", "Zebre"),
      fiche("b", "Traitement", "Alpha"),
    ], nomDe, (f) => (f === "Zebre" ? "Aardvark" : "Zulu"));
    expect(g[0].familles.map((f) => f.famille)).toEqual(["Zebre", "Alpha"]);
  });
});

describe("sur le vrai catalogue", () => {
  const sansRecherche = universDe(toutesLesFiches as FicheAudio[]);

  it("les univers sont ceux qu'on attend, dans l'ordre qu'on attend", () => {
    expect(sansRecherche[0]).toBe("Entrées");
    expect(sansRecherche[sansRecherche.length - 1]).toBe("Autres");
    for (const u of sansRecherche) expect(ORDRE_UNIVERS).toContain(u);
  });

  it("AUCUNE RECHERCHE NE CHANGE L'ORDRE DES RUBRIQUES", () => {
    // Des requêtes choisies pour que la première correspondance tombe dans des univers différents.
    for (const requete of ["reverb", "midi", "image", "collection", "spectral", "a", "son"]) {
      const retenues = filtrerFiches(toutesLesFiches as FicheAudio[], requete, () => "");
      const ordre = universDe(retenues);
      // L'ordre obtenu est celui du catalogue complet, privé des univers sans correspondance.
      expect(ordre, `recherche « ${requete} »`).toEqual(sansRecherche.filter((u) => ordre.includes(u)));
    }
  });
});
