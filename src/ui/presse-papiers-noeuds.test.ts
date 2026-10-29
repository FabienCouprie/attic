// ui/presse-papiers-noeuds.test.ts — Ce qu'une copie de nœuds écrit, et ce qu'un collage accepte.
//
// Le presse-papiers est désormais celui du système (mesuré le 2026-10-29 : il ne l'était pas). Deux
// choses s'y jouent, et ces cas les tiennent : un texte copié ailleurs ne devient jamais un nœud, et
// ce qui ne traverse pas un JSON — fichiers, tampons, adresses `blob:` — n'y entre pas.
import { describe, expect, it } from "vitest";

import { FORMAT_PRESSE_PAPIERS, lireCopie, serialiserCopie, type ElementCopie } from "./presse-papiers-noeuds";

const element = (sur: Partial<ElementCopie> = {}): ElementCopie => ({
  ficheId: "oscillateur", parametres: { Fréquence: 440 }, width: 230, height: 200, data: { nom: "La" }, dx: 0, dy: 0, ...sur,
});

describe("le presse-papiers de nœuds", () => {
  it("SE RELIT TEL QU'IL A ÉTÉ ÉCRIT, jeton et coupe compris", () => {
    const texte = serialiserCopie({ jeton: "j1", coupe: true, elements: [element({ dx: 40 })] });
    expect(lireCopie(texte)).toEqual({ jeton: "j1", coupe: true, elements: [element({ dx: 40 })] });
  });

  it("UN TEXTE QUELCONQUE NE DEVIENT PAS UN NŒUD", () => {
    expect(lireCopie("Bonjour")).toBeNull();
    expect(lireCopie("{\"nodes\":[]}"), "même un JSON d'Attic qui n'est pas une copie").toBeNull();
    expect(lireCopie(""), "ni un presse-papiers vide").toBeNull();
    expect(lireCopie(null)).toBeNull();
  });

  it("une autre version du format n'est pas lue", () => {
    expect(lireCopie(JSON.stringify({ format: FORMAT_PRESSE_PAPIERS, version: 99, jeton: "j", elements: [] }))).toBeNull();
  });

  it("CE QUI NE TRAVERSE PAS UN JSON N'Y ENTRE PAS : fichier, tampon, adresse blob", () => {
    const fichier = new File(["x"], "son.wav");
    const texte = serialiserCopie({ jeton: "j", coupe: true, elements: [element({
      data: { audioFichier: fichier, audioUrl: "blob:file:///abc", audioChemin: "E:/son.wav", tampon: new Float32Array(4) },
    })] });
    const data = lireCopie(texte)!.elements[0].data;
    expect(data, "le chemin passe, et lui seul").toEqual({ audioChemin: "E:/son.wav" });
  });

  it("un élément sans fiche est écarté plutôt que posé sous un identifiant vide", () => {
    const brut = JSON.parse(serialiserCopie({ jeton: "j", coupe: false, elements: [element()] }));
    brut.elements.push({ parametres: {} });
    expect(lireCopie(JSON.stringify(brut))!.elements).toHaveLength(1);
  });
});
