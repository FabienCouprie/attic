// plugins/egaliseur-parametrique.test.ts — Chacun des dix-sept réglages agit, et le composant est au catalogue.
//
// LE CONTRAT DE COMPOSANT DEMANDE QUE CHANGER UN RÉGLAGE CHANGE LE RÉSULTAT. La fréquence et le Q
// d'une bande sans gain sont inertes par construction, et leur documentation le dit : l'épreuve part
// donc d'un réglage où chaque bande a un gain, puis bouge les dix-sept un par un. Un réglage lu sous
// un nom que la fiche ne déclare pas retomberait sur son repli et ne bougerait rien : il tomberait ici.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./egaliseur-parametrique";
import { fiches as fichesEffets } from "./effets-spectral";

const fiche = fiches.find((f) => f.id === "egaliseur-parametrique")!;
const SR = 48000;

/** Un son riche et déterministe : six partiels du grave à l'aigu, sur deux canaux différents. */
function son(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: SR / 4, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    b.getChannelData(c).set(Float32Array.from({ length: SR / 4 }, (_, i) =>
      [30, 110, 340, 1200, 3600, 13000].reduce((s, f, k) => s + 0.08 * Math.sin(2 * Math.PI * f * i / SR + k + c), 0)));
  }
  return b;
}

function contexte(params: Record<string, number>, entree: unknown = son()) {
  return {
    entree: () => entree,
    paramNombre: (nom: string, defaut: number) => params[nom] ?? defaut,
    paramTexte: (_nom: string, defaut: string) => defaut,
  };
}

/** Chaque bande a un gain : aucun réglage n'est inerte à ce point de départ. */
const DEPART: Record<string, number> = {
  "Passe-haut": 40, "Fréquence grave": 100, "Gain grave": 3,
  "Fréquence 1": 250, "Gain 1": -3, "Q 1": 1, "Fréquence 2": 1000, "Gain 2": 2, "Q 2": 1,
  "Fréquence 3": 3000, "Gain 3": 4, "Q 3": 1, "Fréquence 4": 8000, "Gain 4": -2, "Q 4": 1,
  "Fréquence aiguë": 10000, "Gain aigu": 3,
};

const VARIANTE: Record<string, number> = {
  "Passe-haut": 120, "Fréquence grave": 200, "Gain grave": -3,
  "Fréquence 1": 400, "Gain 1": 3, "Q 1": 4, "Fréquence 2": 1500, "Gain 2": -4, "Q 2": 4,
  "Fréquence 3": 4500, "Gain 3": -2, "Q 3": 4, "Fréquence 4": 12000, "Gain 4": 4, "Q 4": 4,
  "Fréquence aiguë": 6000, "Gain aigu": -4,
};

async function rendre(params: Record<string, number>) {
  const r = await fiche.executer(contexte(params) as any);
  return { sortie: r.valeurs[0] as AudioBuffer, message: r.message };
}

const ecart = (a: AudioBuffer, b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < a.numberOfChannels; c++) {
    const x = a.getChannelData(c), y = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  }
  return m;
};

describe("le composant Égaliseur paramétrique", () => {
  it("est au catalogue, entre par les effets, et déclare ses dix-sept réglages", () => {
    expect(fichesEffets.some((f) => f.id === "egaliseur-parametrique")).toBe(true);
    expect(fiche.parametres.map((p) => p.nom).sort()).toEqual(Object.keys(DEPART).sort());
  });

  it("CHACUN DES DIX-SEPT RÉGLAGES CHANGE LE SON, une fois sa bande pourvue d'un gain", async () => {
    const reference = (await rendre(DEPART)).sortie;
    const inertes: string[] = [];
    for (const nom of Object.keys(DEPART)) {
      const { sortie } = await rendre({ ...DEPART, [nom]: VARIANTE[nom] });
      if (ecart(sortie, reference) < 1e-3) inertes.push(nom);
    }
    expect(inertes, `réglages sans effet : ${inertes.join(", ")}`).toEqual([]);
  });

  it("CHAQUE VARIANTE RESTE DANS LA PLAGE DÉCLARÉE, sans quoi l'épreuve précédente mentirait", () => {
    for (const p of fiche.parametres) {
      const [min, max] = p.plage as [number, number];
      for (const v of [DEPART[p.nom], VARIANTE[p.nom], p.defaut as number]) {
        expect(v, `${p.nom} = ${v}`).toBeGreaterThanOrEqual(min);
        expect(v, `${p.nom} = ${v}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it("À L'OUVERTURE, IL NE TOUCHE À RIEN : le son ressort à l'échantillon près, et le message le dit", async () => {
    const entree = son();
    const defauts = Object.fromEntries(fiche.parametres.map((p) => [p.nom, p.defaut as number]));
    const r = await fiche.executer(contexte(defauts, entree) as any);
    expect(ecart(r.valeurs[0] as AudioBuffer, entree)).toBe(0);
    expect(r.message).toMatch(/inchangé|unchanged/);
  });

  it("le message compte les étages posés", async () => {
    expect((await rendre(DEPART)).message).toMatch(/^7 /);
    expect((await rendre({ ...DEPART, "Gain 2": 0, "Passe-haut": 0 })).message).toMatch(/^5 /);
  });

  it("sans entrée, il le dit au lieu de lever", async () => {
    const r = await fiche.executer(contexte({}, null) as any);
    expect(r.valeurs).toEqual([null]);
    expect(r.message).toBeTruthy();
  });
});
