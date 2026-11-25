// plugins/ecart-reference.test.ts — Le nœud « Écart à une référence » par le registre. Les axes sont
// éprouvés un à un dans `audio/ecart-reference.test.ts` ; ici, la prise : ses ports, son rapport dans
// les deux langues, et ce qu'il rend quand une entrée manque ou qu'un côté est mono.
//
// Sous vitest il n'y a pas de `Worker` : `parUneFois` décrit les deux sons dans le fil, par le même
// calcul que les ouvriers. L'égalité des deux chemins est éprouvée dans l'application, par
// `tests-e2e/ecart-reference-dans-application.spec.ts`.
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { ctxDEssai } from "../core/contexte-essai";
import { francais, virguleDecimale } from "../docs/detecteur-francais";
import { accord, bruitRose } from "../audio/ecart-reference-essai";

const fiche = () => registre.trouverDef("ecart-reference")!;

function tampon(canaux: Float32Array[], fe: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux.length, length: canaux[0].length, sampleRate: fe });
  canaux.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
}

async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

const rose = tampon([bruitRose(4, 44100, 1), bruitRose(4, 44100, 2)], 44100);
const chord = accord([48, 60, 64, 67, 72], 4, 48000);
const doMajeur = tampon([chord, chord], 48000);

describe("nœud Écart à une référence", () => {
  it("est rangé en Visualisation → Analyse, deux entrées audio, une sortie texte, aucun réglage", () => {
    const f = fiche();
    expect([f.univers, f.famille]).toEqual(["Visualisation", "Analyse"]);
    expect(f.entrees.map((p) => [p.nom, p.nomEn, p.type])).toEqual([["Audio", "Audio", "audio"], ["Référence", "Reference", "audio"]]);
    expect(f.sorties.map((p) => [p.nom, p.nomEn, p.type])).toEqual([["Rapport", "Report", "texte"]]);
    expect(f.parametres).toEqual([]);
    expect(f.notice!.length).toBeGreaterThan(1000);
    expect(f.noticeEn!.length).toBeGreaterThan(1000);
  });

  it("rend un rapport d'une ligne par axe, et le message des quatre écarts", async () => {
    const r = await avecLangue("fr", () => fiche().executer(ctxDEssai([rose, doMajeur])) as Promise<any>);
    expect(r.erreur).toBeFalsy();
    const texte = r.valeurs[0] as string;
    for (const intitule of ["Sonie intégrée", "Plage de sonie", "Crête vraie", "Facteur de crête", "Plancher",
      "Corrélation gauche/droite", "Côté sur milieu", "Écart efficace des tiers d'octave", "Part de l'énergie par registre",
      "Centroïde médian", "Platitude médiane", "MFCC 1 à 12, distance des moyennes", "MFCC 1 à 12, distance des écarts types",
      "Profil chroma, cosinus", "DTW du chroma", "Tempo", "Attaques par seconde"]) {
      expect(texte, intitule).toContain(intitule);
    }
    expect(r.message).toMatch(/^Couleur \d+,\d\d dB · MFCC \d+,\d\d · sonie [+−]?\d+,\d LU · DTW \d,\d{3}$/);
  });

  it("le rend en anglais sans un mot de français ni une virgule décimale", async () => {
    const r = await avecLangue("en", () => fiche().executer(ctxDEssai([rose, doMajeur])) as Promise<any>);
    const texte = r.valeurs[0] as string;
    expect(texte).toContain("DISTANCE TO A REFERENCE");
    expect(r.message).toMatch(/^Color \d+\.\d\d dB · MFCC \d+\.\d\d · loudness [+-]?\d+\.\d LU · DTW \d\.\d{3}$/);
    for (const ligne of [...texte.split(String.fromCharCode(10)), r.message]) {
      expect(francais(ligne), ligne).toBe(false);
      expect(virguleDecimale(ligne), ligne).toBe(false);
    }
  });

  it("refuse une entrée manquante, avec un message et une valeur nulle", async () => {
    for (const entrees of [[rose, null], [null, rose]]) {
      const r = await fiche().executer(ctxDEssai(entrees)) as any;
      expect(r.erreur).toBe(true);
      expect(r.valeurs).toEqual([null]);
      expect(r.message).toBeTruthy();
    }
  });

  it("nomme la transposition de l'audio : +7 demi-tons de fa vers do, aucune sur le même son", async () => {
    const fa = accord([53, 65, 69, 72, 77], 4, 48000);
    const faMajeur = tampon([fa, fa], 48000);
    const ligne = async (a: AudioBuffer, b: AudioBuffer) => {
      const r = await avecLangue("fr", () => fiche().executer(ctxDEssai([a, b])) as Promise<any>);
      return (r.valeurs[0] as string).split(String.fromCharCode(10)).find((l) => l.includes("meilleure transposition"))!;
    };
    expect(await ligne(faMajeur, doMajeur)).toContain("meilleure transposition de l'audio : +7 demi-tons ;");
    expect(await ligne(doMajeur, doMajeur)).toContain("meilleure transposition de l'audio : aucune ;");
  });

  it("écrit « mono » là où un côté n'a qu'un canal, et un tiret pour l'écart", async () => {
    const mono = tampon([chord], 48000);
    const r = await avecLangue("fr", () => fiche().executer(ctxDEssai([mono, rose])) as Promise<any>);
    const correlation = (r.valeurs[0] as string).split(String.fromCharCode(10)).find((l) => l.startsWith("Corrélation"))!;
    expect(correlation).toMatch(/^Corrélation gauche\/droite\s+mono\s+−?\d,\d{3}\s+—$/);
  });
});
