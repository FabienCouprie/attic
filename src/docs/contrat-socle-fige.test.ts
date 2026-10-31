// src/docs/contrat-socle-fige.test.ts — Le socle audio est figé, et il le reste.
//
// POURQUOI UN CAS SÉPARÉ, alors que `core/registre-natifs.test.ts` tient déjà la MÉCANIQUE du gel.
// Celui-là éprouve le registre en isolation : il montre qu'un identifiant figé ne se remplace plus.
// Il ne dit rien de savoir si quelqu'un FIGE VRAIMENT le socle de l'application.
//
// C'est précisément la forme de faux vert que ce dépôt a payé plusieurs fois : un mécanisme correct,
// éprouvé, et personne pour l'appeler. Ce cas-ci vérifie l'APPEL, sur le registre réel.
//
// LE TROU QU'IL GARDE FERMÉ, relevé le 2026-10-25 par une revue critique : `enregistrer` remplaçait
// en silence un plugin de même identifiant, de sorte qu'un nœud installé depuis un `.zip` partagé —
// ou un méta-composant porté par un projet reçu — pouvait prendre la place d'un composant du socle,
// en gardant son nom, son icône et sa place dans la palette.
import { describe, expect, it, vi } from "vitest";

// `registre` VIENT DE L'ADAPTATEUR, dont l'import est aussi ce qui inscrit le socle et le fige :
// c'est l'effet de bord qu'on veut éprouver. `toutesLesFiches` vient du catalogue, que l'adaptateur
// ne réexporte pas.
import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "../plugins";

describe("le socle audio", () => {
  it("EST FIGÉ : un composant arrivé après ne peut pas prendre la place d'un natif", () => {
    // On prend une fiche RÉELLE du catalogue, et l'on tente de l'écraser comme un nœud installé le
    // ferait. Le registre doit refuser, et le dire.
    const cible = toutesLesFiches[0];
    expect(cible?.id, "le catalogue doit porter des fiches").toBeTruthy();
    const avant = registre.trouverDef(cible.id);

    const cri = vi.spyOn(console, "error").mockImplementation(() => {});
    registre.enregistrer({ ...cible, nom: "IMPOSTEUR" } as never);
    expect(cri, "le refus doit être dit : un refus muet enverrait chercher la panne ailleurs")
      .toHaveBeenCalled();
    cri.mockRestore();

    expect(registre.trouverDef(cible.id), "la fiche du socle est intacte").toBe(avant);
    expect(registre.trouverDef(cible.id)?.nom).not.toBe("IMPOSTEUR");
  });

  it("ET TOUT LE CATALOGUE EST PROTÉGÉ, non le premier venu", () => {
    // Un gel posé trop tôt n'aurait couvert qu'une partie des fiches, et rien ne l'aurait dit.
    const cri = vi.spyOn(console, "error").mockImplementation(() => {});
    const echecs: string[] = [];
    for (const f of toutesLesFiches) {
      cri.mockClear();
      registre.enregistrer({ ...f, nom: "IMPOSTEUR" } as never);
      if (!cri.mock.calls.length) echecs.push(f.id);
    }
    cri.mockRestore();
    expect(echecs, [
      "Ces fiches du catalogue se laissent encore remplacer : le gel ne les couvre pas.",
      "Un composant reçu pourrait prendre leur nom, leur icône et leur place dans la palette.",
    ].join("\n")).toEqual([]);
  });
});
