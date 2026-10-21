// src/plugins/composer-plan.test.ts — Ce qu'un plan assemblé doit porter, et ce qu'il ne doit pas.
//
// LE PLAN EST LU PAR UN MOTEUR, non par un humain : un champ de trop ou mal nommé ne se voit pas à
// la relecture et se découvre au rendu. Ces cas tiennent la forme exacte que `ace-synth` accepte,
// relevée le 2026-10-21 en capturant un vrai plan puis en le rendant privé de ses champs un à un.
//
// DEUX CAS QUI COMPTENT PLUS QUE LES AUTRES. Celui de `synth_model`, qui ne doit JAMAIS apparaître :
// `appliquerTache` pose son modèle puis étale le plan par-dessus, donc un plan qui le porterait
// écraserait le choix de la tâche, et « Accompagner une voix » repartirait sur le modèle rapide,
// dont la mesure a montré qu'il ne construit rien sur cette tâche. Et celui de la tonalité, parce
// que le nœud voisin rend `G major (87%)` là où le moteur attend `G major`.
import { describe, expect, it } from "vitest";
import { planDepuis, tonaliteNormalisee } from "./composer-plan";

const champs = {
  description: "acoustic guitar, strum", paroles: "", tempo: 96, tonalite: "G major",
  dureeSec: 30, langue: "fr", signature: "4", graine: -1,
};

const lire = (c: Partial<typeof champs> = {}) => JSON.parse(planDepuis({ ...champs, ...c }));

describe("tonaliteNormalisee", () => {
  it("retire la confiance que rend « Analyse harmonique »", () => {
    expect(tonaliteNormalisee("G major (87%)")).toBe("G major");
    expect(tonaliteNormalisee("A minor (100%)")).toBe("A minor");
  });

  it("laisse intacte une tonalité déjà propre", () => {
    expect(tonaliteNormalisee("C major")).toBe("C major");
    expect(tonaliteNormalisee(" D# minor ")).toBe("D# minor");
  });

  it("rend la chaîne vide telle quelle : deviner une tonalité ne lui appartient pas", () => {
    expect(tonaliteNormalisee("")).toBe("");
    expect(tonaliteNormalisee("   ")).toBe("");
  });
});

describe("planDepuis", () => {
  it("porte les champs que le moteur lit, aux noms qu'il attend", () => {
    const plan = lire();
    expect(plan.caption).toBe("acoustic guitar, strum");
    expect(plan.bpm).toBe(96);
    expect(plan.duration).toBe(30);
    expect(plan.keyscale).toBe("G major");
    expect(plan.timesignature).toBe("4");
    expect(plan.vocal_language).toBe("fr");
    expect(plan.output_format).toBe("wav16");
  });

  it("N'ÉCRIT JAMAIS `synth_model` : la tâche décide du moteur, pas le plan", () => {
    expect(Object.keys(lire())).not.toContain("synth_model");
    expect(planDepuis(champs)).not.toContain("synth_model");
  });

  it("n'écrit pas de codes audio, qu'il ne sait pas produire", () => {
    expect(Object.keys(lire())).not.toContain("audio_codes");
  });

  it("une graine négative ne s'écrit pas, une graine posée part dans les deux champs", () => {
    expect(Object.keys(lire({ graine: -1 }))).not.toContain("seed");
    const pose = lire({ graine: 42 });
    expect(pose.seed).toBe(42);
    // LES DEUX CHAMPS DE GRAINE, comme pour la planification : `seed` seul laissait le modèle de
    // langue tirer le sien au hasard, et deux rendus de même graine différaient.
    expect(pose.lm_seed).toBe(42);
  });

  it("des paroles vides ne s'écrivent pas : un `lyrics` vide ferait chanter du silence annoncé", () => {
    expect(Object.keys(lire({ paroles: "" }))).not.toContain("lyrics");
    expect(Object.keys(lire({ paroles: "   " }))).not.toContain("lyrics");
    expect(lire({ paroles: "[verse]\nLa nuit" }).lyrics).toBe("[verse]\nLa nuit");
  });

  it("un tempo nul laisse le champ absent, et le moteur décide", () => {
    expect(Object.keys(lire({ tempo: 0 }))).not.toContain("bpm");
  });

  it("une tonalité vide laisse le champ absent plutôt qu'une tonalité inventée", () => {
    expect(Object.keys(lire({ tonalite: "" }))).not.toContain("keyscale");
  });

  it("la confiance du nœud voisin ne traverse pas jusqu'au plan", () => {
    expect(lire({ tonalite: "F# minor (73%)" }).keyscale).toBe("F# minor");
  });

  it("une description vide devient « instrumental » plutôt que rien", () => {
    expect(lire({ description: "" }).caption).toBe("instrumental");
    expect(lire({ description: "  " }).caption).toBe("instrumental");
  });

  it("le tempo est arrondi : un détecteur rend un flottant, le moteur attend un entier", () => {
    expect(lire({ tempo: 119.6 }).bpm).toBe(120);
  });

  it("le document est un JSON lisible, ce que le nœud de rendu exige", () => {
    expect(() => JSON.parse(planDepuis(champs))).not.toThrow();
    expect(planDepuis(champs)).toContain("\n");
  });
});
