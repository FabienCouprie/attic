// electron/sdcpp.test.ts — Ce que le pont dit à stable-diffusion.cpp, et ce qu'il en relit.
//
// LES LIGNES DE LA BARRE SONT CELLES DU MOTEUR, recopiées d'un journal relevé le 2026-10-27 sur
// la version épinglée, code d'effacement ANSI compris : une barre imaginée aurait prouvé que mon
// expression lit ce que j'imagine.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { argumentsMoss, etapeDeLigne, FICHIERS } = require("./sdcpp.cjs");

const ECHAP = String.fromCharCode(27);
const BASE = {
  modele: { diffusion: "d.gguf", llm: "l.gguf", vae: "v.safetensors", tokenizer: "t.json" },
  prompt: "prompt.txt", negatif: null, sortie: "o.png",
  graine: 42, etapes: 20, guidage: 3, largeur: 1024, hauteur: 768, calcul: "",
};
const valeur = (a: string[], cle: string) => a[a.indexOf(cle) + 1];

describe("le pont de stable-diffusion.cpp", () => {
  it("passe les quatre fichiers du modèle, chacun à sa place", () => {
    const a = argumentsMoss(BASE);
    expect(valeur(a, "--diffusion-model")).toBe("d.gguf");
    expect(valeur(a, "--llm")).toBe("l.gguf");
    expect(valeur(a, "--vae")).toBe("v.safetensors");
    // LE TOKENISEUR EST EXIGÉ À PART : le vocabulaire de Qwen3.5 n'est pas celui que sd.cpp embarque.
    expect(valeur(a, "--tokenizer")).toBe("t.json");
  });

  it("LE PROMPT PASSE PAR UN FICHIER, et les réglages par leur nom", () => {
    // Écrit sur la ligne de commande, un JSON de mise en page portant des accents traverserait
    // l'encodage de Windows.
    const a = argumentsMoss(BASE);
    expect(valeur(a, "--prompt-file")).toBe("prompt.txt");
    expect(a).not.toContain("-p");
    expect(valeur(a, "--steps")).toBe("20");
    expect(valeur(a, "--cfg-scale")).toBe("3");
    expect(valeur(a, "-s")).toBe("42");
    expect(valeur(a, "-W")).toBe("1024");
    expect(valeur(a, "-H")).toBe("768");
    expect(valeur(a, "-o")).toBe("o.png");
  });

  it("« AUTOMATIQUE » NE PASSE AUCUN PÉRIPHÉRIQUE, et un choix passe tel quel", () => {
    expect(argumentsMoss(BASE)).not.toContain("--backend");
    expect(valeur(argumentsMoss({ ...BASE, calcul: "Vulkan1" }), "--backend")).toBe("Vulkan1");
  });

  it("un prompt négatif absent n'est pas passé, un prompt négatif l'est par son fichier", () => {
    expect(argumentsMoss(BASE)).not.toContain("--negative-prompt-file");
    expect(valeur(argumentsMoss({ ...BASE, negatif: "neg.txt" }), "--negative-prompt-file")).toBe("neg.txt");
  });

  it("LIT L'ÉTAPE DANS LA BARRE DU MOTEUR, et rien dans les autres lignes", () => {
    expect(etapeDeLigne(`  |==>                                               |  1/25 -   1.87s/it - ETA 00:44${ECHAP}[K`))
      .toEqual({ faite: 1, total: 25 });
    expect(etapeDeLigne("  |=====>   | 12/20 -   3.40it/s - ETA 00:04")).toEqual({ faite: 12, total: 20 });
    // LA LECTURE DES POIDS A LA MÊME BARRE, et ce n'est pas le travail : elle compte des tenseurs.
    expect(etapeDeLigne(`  |##################################################| 140/140 - 882.20MB/s${ECHAP}[K`)).toBeNull();
    expect(etapeDeLigne("[I] sampling completed, taking 26.34s --- image.cpp:953")).toBeNull();
  });

  it("les quatre fichiers portent les noms que le manifeste des modèles inscrit", () => {
    expect(Object.values(FICHIERS).sort()).toEqual([
      "flux2-vae.safetensors", "moss-image-sft-q4_k.gguf", "moss-image-tokenizer.json", "qwen3.5-9b-q4_k_m.gguf",
    ]);
  });
});
