// ui/exemples.test.ts — Le catalogue des graphes livrés.
//
// CE QU'IL TIENT. Que le catalogue suive le dossier, d'abord : compilé par un glob, il se viderait
// en silence si le dossier changeait de nom, et le bouton de la barre ouvrirait une liste vide sans
// qu'une seule erreur paraisse. Et que le nom affiché se déduise bien du nom de fichier, puisque
// c'est ce qui permet de déposer un graphe dans le dossier sans rien tenir à jour à côté.
//
// AUCUN CAS NE NOMME UN EXEMPLE, ET AUCUN N'EN EXIGE UN. Le dossier n'est plus versionné : on y
// ajoute et on y retire constamment, et un test qui désignait un fichier par son nom faisait échouer
// la suite au premier qu'on en retirait. Les propriétés du nommage se tiennent donc sur des graphes
// écrits ici, qui ne dépendent de rien ; celles du catalogue se tiennent sur ce qui est là, quoi que
// ce soit, y compris rien du tout sur un dépôt fraîchement cloné.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  EXEMPLES, fichierDExemple, identifiantDepuisChemin, nomDeLExemple, nomDepuisIdentifiant, titreDepuisNote,
} from "./exemples";

/** Les graphes réellement posés dans `exemples/`, sous-dossiers compris. */
function jsonSurLeDisque(dossier = "exemples"): number {
  if (!existsSync(dossier)) return 0;
  let n = 0;
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.name.startsWith(".")) continue;
    const complet = join(dossier, entree.name);
    if (entree.isDirectory()) n += jsonSurLeDisque(complet);
    else if (/\.json$/i.test(entree.name)) n++;
  }
  return n;
}

describe("le catalogue des exemples", () => {
  it("IL SUIT LE DOSSIER : autant d'exemples compilés que de graphes posés", () => {
    // LE GARDE-FOU EST LÀ, et il ne tient plus à un nombre écrit d'avance : un dossier renommé, un
    // glob qui cesse de mordre, et le compte ne correspondrait plus. Un dossier vide donne zéro des
    // deux côtés, ce qui est l'état normal d'un dépôt cloné sans ses exemples.
    expect(EXEMPLES.length).toBe(jsonSurLeDisque());
  });

  it("chaque exemple porte un graphe, avec ses nœuds et ses arêtes", () => {
    for (const ex of EXEMPLES) {
      const g = ex.graphe as { nodes: unknown[]; edges: unknown[] };
      expect(Array.isArray(g.nodes), ex.id).toBe(true);
      expect(Array.isArray(g.edges), ex.id).toBe(true);
      expect(g.nodes.length, ex.id).toBeGreaterThan(0);
    }
  });

  it("deux exemples ne portent pas le même identifiant", () => {
    const vus = new Set(EXEMPLES.map((e) => e.id));
    expect(vus.size).toBe(EXEMPLES.length);
  });

  it("ils sont rangés par ordre alphabétique", () => {
    const noms = EXEMPLES.map((e) => e.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
  });

  it("l'identifiant est le chemin sous « exemples », sans extension", () => {
    expect(identifiantDepuisChemin("/exemples/un-effet-sur-un-passage.json")).toBe("un-effet-sur-un-passage");
    expect(identifiantDepuisChemin("exemples\\deux-effets.json")).toBe("deux-effets");
  });

  it("UN SOUS-DOSSIER FAIT PARTIE DE L'IDENTIFIANT, sans quoi deux exemples homonymes se confondraient", () => {
    expect(identifiantDepuisChemin("/exemples/rythme/canon.json")).toBe("rythme/canon");
    expect(identifiantDepuisChemin("/exemples/spectre/canon.json")).toBe("spectre/canon");
    // Le nom affiché, lui, ne garde que le dernier segment : le dossier se lit dans le classeur.
    expect(nomDepuisIdentifiant("rythme/canon-de-proportions")).toBe("Canon de proportions");
  });

  it("LE NOM AFFICHÉ SE DÉDUIT DU NOM DE FICHIER, et rien n'est à tenir à jour à côté", () => {
    expect(nomDepuisIdentifiant("un-effet-sur-un-passage")).toBe("Un effet sur un passage");
    expect(nomDepuisIdentifiant("traiter-tout-sauf-un-passage")).toBe("Traiter tout sauf un passage");
  });

  // RELEVÉ EN REGARDANT LA LISTE, ET NON LE CODE. Le nom tiré du fichier donnait « Une
  // reverberation qui deborde » : un nom de fichier ne porte pas d'accents. La note du graphe, si.
  it("LE TITRE VIENT DE LA NOTE DU GRAPHE, qui porte les accents", () => {
    const g = { nodes: [{ data: { ficheId: "comment", nom: "UNE RÉVERBÉRATION QUI DÉBORDE\n\nLe reste." } }] };
    expect(titreDepuisNote(g, "repli")).toBe("Une réverbération qui déborde");
  });

  it("une première ligne déjà en minuscules est prise telle quelle", () => {
    const g = { nodes: [{ data: { ficheId: "comment", nom: "Deux effets, deux passages" } }] };
    expect(titreDepuisNote(g, "repli")).toBe("Deux effets, deux passages");
  });

  it("sans note, sans première ligne, ou avec une ligne trop longue, on retombe sur le nom du fichier", () => {
    expect(titreDepuisNote({ nodes: [{ data: { ficheId: "oscillateur" } }] }, "repli")).toBe("repli");
    expect(titreDepuisNote({ nodes: [{ data: { ficheId: "comment", nom: "   \n  " } }] }, "repli")).toBe("repli");
    expect(titreDepuisNote({ nodes: [{ data: { ficheId: "comment", nom: "A".repeat(61) } }] }, "repli")).toBe("repli");
    expect(titreDepuisNote(null, "repli")).toBe("repli");
  });

  it("et le titre vient de la note, non du nom de fichier qui ne dit pas la meme chose", () => {
    // La propriété se tient sur les mots, et sur un graphe écrit ici plutôt que sur un fichier du
    // dossier : le nom de fichier perd « sur », et c'est bien la note qui le rend.
    const id = "deux-effets-deux-passages";
    const g = { nodes: [{ data: { ficheId: "comment", nom: "Deux effets sur deux passages" } }] };
    expect(titreDepuisNote(g, nomDepuisIdentifiant(id)).toLowerCase()).toContain("sur");
    expect(nomDepuisIdentifiant(id).toLowerCase()).not.toContain("sur");
  });

  it("LA LISTE SUIT LA LANGUE : chacun porte un titre anglais, et il n'est pas le français", () => {
    for (const ex of EXEMPLES) {
      expect(nomDeLExemple(ex, "fr"), ex.id).toBe(ex.nom);
      expect(nomDeLExemple(ex, "en"), ex.id).not.toBe(ex.nom);
    }
  });

  it("un exemple sans titre anglais retombe sur le français plutôt que sur rien", () => {
    expect(nomDeLExemple({ id: "x", nom: "Titre", nomEn: "", graphe: null }, "en")).toBe("Titre");
  });

  it("UN EXEMPLE DEVIENT UN FICHIER QUI N'EST SUR AUCUN DISQUE, ce qui le rend non modifiable", () => {
    const ex = { id: "rythme/canon", nom: "Canon", nomEn: "Canon", graphe: { nodes: [], edges: [] } };
    const f = fichierDExemple(ex);
    expect(f.name).toBe("rythme/canon.json");
    expect(f.type).toBe("application/json");
    expect(f.size).toBeGreaterThan(0);
  });
});
