// docs/classement-theorie.test.ts — Deux règles de rangement de la famille Théorie.
//
// La famille « Théorie » est celle des outils qui RAISONNENT sur la musique : on leur donne
// du texte — des notes, une gamme, une progression — et ils rendent du texte. Dès qu'un nœud
// produit du son ou du MIDI, il n'est plus un outil d'analyse mais un instrument ou un
// effet, et il doit se ranger là où l'utilisateur le cherchera.
//
// Les deux règles :
//
//  1. Sans entrée, avec une sortie audio ou MIDI → c'est une SOURCE, donc l'univers Entrées.
//  2. Avec une entrée qui n'est pas du texte et une sortie audio ou MIDI → c'est un
//     TRAITEMENT, donc l'univers Traitement — dans « Effets » ou dans l'une des familles de
//     style qui en sont sorties (cf. plugins/familles-effets.ts : le Tonnetz est rangé dans
//     « Topologie », et c'est bien un tore).
//
// Un nœud qui n'a que des sorties texte reste dans Théorie, quelle que soit son entrée :
// « Classes de hauteurs » et « Contrepoint d'espèces » prennent un MIDI et rendent une
// analyse, et ce sont bien des outils d'analyse.
//
// Ce test existe parce que le classement s'est trompé quatre fois d'un coup : les opérations
// sérielles, l'harmonie négative, les voicings et le Tonnetz rendaient tous de l'audio et du
// MIDI en restant rangés dans Théorie.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "../plugins";

interface Port { type?: string }
interface Fiche {
  id: string;
  univers?: string;
  famille?: string;
  entrees?: Port[];
  sorties?: Port[];
}

const SONORES = new Set(["audio", "midi"]);

const fiches = toutesLesFiches as unknown as Fiche[];
const theorieEtVoisins = fiches.filter((f) =>
  f.famille === "Théorie"
  // On regarde aussi ceux qu'on a déplacés : la règle doit expliquer où ils sont allés.
  || ["serie-dodecaphonique", "harmonie-negative", "voicings-accords", "tonnetz"].includes(f.id));

const sortSonore = (f: Fiche) => (f.sorties ?? []).some((p) => SONORES.has(p.type ?? ""));
const entreeTexteSeule = (f: Fiche) =>
  (f.entrees ?? []).length > 0 && (f.entrees ?? []).every((p) => p.type === "texte");

describe("règles de rangement de la famille Théorie", () => {
  it("y trouve au moins les outils d'analyse textuels", () => {
    const restants = fiches.filter((f) => f.famille === "Théorie").map((f) => f.id);
    expect(restants.length).toBeGreaterThan(0);
    // Ceux-là raisonnent et rendent du texte : ils y restent.
    expect(restants).toContain("tonal-accord");
    expect(restants).toContain("classes-hauteurs");
    expect(restants).toContain("contrepoint-especes");
  });

  it("ne garde dans Théorie aucun nœud qui produit du son ou du MIDI", () => {
    const fautifs = fiches
      .filter((f) => f.famille === "Théorie" && sortSonore(f))
      .map((f) => `${f.id} (sorties ${(f.sorties ?? []).map((p) => p.type).join("+")})`);
    expect(fautifs, "à déplacer hors de Théorie").toEqual([]);
  });

  it("range dans les Entrées un nœud sans entrée qui rend du son ou du MIDI", () => {
    const fautifs = theorieEtVoisins
      .filter((f) => (f.entrees ?? []).length === 0 && sortSonore(f) && f.univers !== "Entrées")
      .map((f) => `${f.id} (univers ${f.univers})`);
    expect(fautifs, "devraient être dans l'univers Entrées").toEqual([]);
  });

  it("range dans les traitements un nœud à entrée non textuelle qui rend du son ou du MIDI", () => {
    const fautifs = theorieEtVoisins
      .filter((f) => (f.entrees ?? []).length > 0 && !entreeTexteSeule(f) && sortSonore(f)
        && f.univers !== "Traitement")
      .map((f) => `${f.id} (univers ${f.univers})`);
    expect(fautifs, "devraient être dans l'univers Traitement").toEqual([]);
  });

  it("a bien déplacé les quatre nœuds concernés", () => {
    for (const id of ["serie-dodecaphonique", "harmonie-negative", "voicings-accords", "tonnetz"]) {
      const f = fiches.find((x) => x.id === id);
      expect(f, id).toBeDefined();
      expect(f!.univers, id).toBe("Traitement");
      expect(f!.famille, id).not.toBe("Théorie");
    }
  });
});
