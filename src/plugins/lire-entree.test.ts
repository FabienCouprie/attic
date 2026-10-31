// plugins/lire-entree.test.ts — Ce que `entreeAudio` rend, et ce que le moteur en fait.
import { describe, it, expect } from "vitest";
import { entreeAudio, sansEntree } from "./lire-entree";
import { estResultatEnErreur } from "../core/execution";
import { ctxDEssai } from "../core/contexte-essai";
import { traduireDans } from "../i18n";

const son = () => new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 8000 });

describe("entreeAudio", () => {
  it("rend le son quand il est là, et celui du rang demandé", () => {
    const a = son(), b = son();
    expect(entreeAudio(ctxDEssai([a, b]), 0)).toBe(a);
    expect(entreeAudio(ctxDEssai([a, b]), 1)).toBe(b);
    expect(entreeAudio(ctxDEssai([a]))).toBe(a);
  });

  it("rend un échec DÉCLARÉ quand l'entrée n'est pas un son, et le moteur le voit comme tel", () => {
    for (const valeur of [null, undefined, "texte", new Float32Array(4), 3]) {
      const r = entreeAudio(ctxDEssai([valeur as never]), 0);
      expect(sansEntree(r)).toBe(true);
      if (sansEntree(r)) {
        expect(r.erreur).toBe(true);
        expect(r.valeurs).toEqual([null]);
        // Même sur une fiche sans sortie, que le filet « tout-null » ne couvre pas.
        expect(estResultatEnErreur({ sorties: [] } as never, r)).toBe(true);
      }
    }
  });

  it("ne dit qu'une chose, dans la langue courante, et elle est traduite", () => {
    // Sans localStorage, la langue courante est le français ; c'est le cas d'un test.
    const r = entreeAudio(ctxDEssai([]), 0);
    expect(sansEntree(r) && r.message).toBe("Aucune entrée audio.");
    expect(traduireDans("en", "msg.aucune_entr_e_audio")).toBe("No audio input.");
  });

  it("sansEntree est faux sur un son, et c'est ce qui rend la seconde ligne muette", () => {
    expect(sansEntree(son())).toBe(false);
  });
});
