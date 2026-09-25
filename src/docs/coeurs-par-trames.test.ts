// src/docs/coeurs-par-trames.test.ts — Le détecteur est vérifié DANS LES DEUX SENS.
//
// POURQUOI LES DEUX SENS. Un détecteur qui ne serait vérifié que sur ce qu'il doit trouver passerait
// en déclarant tout le catalogue « par trames ». Un détecteur qui ne serait vérifié que sur ce qu'il
// doit laisser passer passerait en ne trouvant rien. Les deux listes ci-dessous sont donc tenues
// ensemble, et elles nomment des cas que j'ai lus un par un dans le code.
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins";
import { appelsDe, coeursParTrames, fonctionsDuFichier, fonctionsParTrames } from "./coeurs-par-trames";

const RACINE = resolve(__dirname, "../..");

/** Des cœurs dont j'ai lu la boucle de trames. */
const PAR_TRAMES = [
  "dererverberer",        // recouvrement-addition sur TAILLE_FFT
  "shiftFormantsVoie",    // enveloppe par LPC, trame par trame
  "filtrerParSpectre",    // opère sur une analyse par vocodeur de phase
  "separerStn",           // décomposition sinus / transitoires / bruit par trames
  "analyserSms",          // analyse de pics, trame par trame
];

/**
 * Des cœurs dont j'ai lu la boucle par échantillon.
 *
 * `convoluer` y figure exprès : il transforme le signal ENTIER pour multiplier deux spectres, ce qui
 * n'est pas un découpage en trames. Mon premier marqueur était `fft(`, et il accusait à ce titre la
 * réverbération velours et la réverbération hachée, dont le mélange s'applique échantillon par
 * échantillon. Deux composants modulables auraient été écartés.
 */
const PAR_ECHANTILLON = [
  "transientShaper",
  "ajusterLargeurStereo",
  "octaver",
  "bitcrusher",
  "supprimerClics",
  "deEsser",
  "quadrafuzz",
  "convoluer",
];

describe("le détecteur de cœurs par trames", () => {
  const verdicts = fonctionsParTrames(RACINE);

  it("il trouve les cœurs par trames que je connais", () => {
    const manquants = PAR_TRAMES.filter((n) => !verdicts.has(n));
    expect(manquants, "ces cœurs travaillent par trames et le détecteur ne le voit pas").toEqual([]);
  });

  it("il laisse passer les cœurs par échantillon que je connais", () => {
    const faux = PAR_ECHANTILLON.filter((n) => verdicts.has(n))
      .map((n) => `${n} (${verdicts.get(n)})`);
    expect(faux, "ces cœurs travaillent par échantillon et le détecteur les accuse").toEqual([]);
  });

  it("il ne classe pas tout le dépôt d'un côté", () => {
    expect(verdicts.size).toBeGreaterThan(5);
    expect(verdicts.size).toBeLessThan(150);
  });
});

describe("le découpage de la source", () => {
  it("il lit un corps entre accolades et une flèche sans accolades", () => {
    const source = [
      "export function avec(x: number) {",
      "  return interne(x);",
      "}",
      "const sans = (x: number) => autre(autre(x));",
    ].join("\n");
    const f = fonctionsDuFichier(source);
    expect(appelsDe(f.get("avec")!)).toContain("interne");
    expect(appelsDe(f.get("sans")!)).toContain("autre");
  });

  it("une méthode d'objet n'est pas un appel du dépôt", () => {
    expect([...appelsDe("const y = x.slice(0, 3);")]).toEqual([]);
  });

  it("un commentaire ne décide de rien", () => {
    const source = "// fft( dans un commentaire\nexport function pure(x: number) { return x; }";
    expect(appelsDe(fonctionsDuFichier(source).get("pure")!).has("fft")).toBe(false);
  });
});

describe("les cœurs par trames, composant par composant", () => {
  const ids = toutesLesFiches.map((f) => f.id);
  const parComposant = coeursParTrames(RACINE, ids);

  it("il reconnaît les quatre composants qui m'avaient échappé", () => {
    for (const id of ["dereverberation", "shift-formants", "filtrage-spectre",
      "stn-sinus-transitoires-bruit"]) {
      expect(parComposant.has(id), `${id} devrait être signalé comme travaillant par trames`).toBe(true);
    }
  });

  it("il ne signale pas un composant dont le cœur est une boucle par échantillon", () => {
    for (const id of ["bitcrusher", "largeur-stereo", "octaver", "transient-shaper", "de-esser",
      // Ces deux-là convoluent par transformée de Fourier, ce qui n'est pas un traitement par trames.
      "reverberation-velours", "reverbe-hachee"]) {
      const trouve = parComposant.get(id);
      expect(trouve, `${id} est accusé de travailler par trames : ${JSON.stringify(trouve)}`)
        .toBeUndefined();
    }
  });

  it("un identifiant inconnu du registre ne découpe rien", () => {
    expect(coeursParTrames(RACINE, ["identifiant-qui-n-existe-pas"]).size).toBe(0);
  });
});
