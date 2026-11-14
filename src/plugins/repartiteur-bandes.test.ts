// plugins/repartiteur-bandes.test.ts — La prise : neuf sorties, chaque réglage qui agit, et la somme.
//
// Le calcul est tenu par `audio/repartiteur-bandes.test.ts`. Ici, ce que la fiche en fait : les
// réglages lus sous leurs noms, un tampon par bande de la forme de l'entrée, et le message.
import { describe, expect, it } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { creerAleatoire } from "../core/hasard";
import { fiches } from "./repartiteur-bandes";

const fiche = fiches.find((f) => f.id === "repartiteur-bandes")!;
const FE = 48000;

/** Deux canaux différents : un sinus de 100 Hz à gauche, un de 3 kHz à droite, une demi-seconde. */
function stereo(): AudioBuffer {
  const a = new AudioBuffer({ numberOfChannels: 2, length: FE / 2, sampleRate: FE });
  const g = a.getChannelData(0), d = a.getChannelData(1);
  for (let i = 0; i < a.length; i++) {
    g[i] = 0.5 * Math.sin((2 * Math.PI * 100 * i) / FE);
    d[i] = 0.5 * Math.sin((2 * Math.PI * 3000 * i) / FE);
  }
  return a;
}

/** Un bruit blanc d'un quart de seconde : chaque coupure y a de quoi agir des deux côtés. */
function bruit(): AudioBuffer {
  const a = new AudioBuffer({ numberOfChannels: 1, length: FE / 4, sampleRate: FE });
  const hasard = creerAleatoire(7);
  const x = a.getChannelData(0);
  for (let i = 0; i < a.length; i++) x[i] = hasard() - 0.5;
  return a;
}

const lancer = (reglages: Record<string, string | number> = {}, entree: AudioBuffer | null = stereo()) =>
  fiche.executer(ctxDEssai([entree], reglages, { ficheId: fiche.id }) as never);

const efficace = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const bandes = (r: Awaited<ReturnType<typeof lancer>>) => r.valeurs as AudioBuffer[];

describe("le Répartiteur de bandes", () => {
  it("déclare neuf sorties audio, une par bande", () => {
    expect(fiche.sorties.map((s) => s.nom)).toEqual(Array.from({ length: 9 }, (_, k) => `Bande ${k + 1}`));
    expect(fiche.sorties.every((s) => s.type === "audio")).toBe(true);
  });

  it("sans entrée, rend neuf valeurs nulles et se déclare en erreur", async () => {
    const r = await lancer({}, null);
    expect(r.valeurs).toEqual(Array(9).fill(null));
    expect(r.erreur).toBe(true);
  });

  it("rend neuf tampons de la forme de l'entrée, et chaque sinus sort par sa bande", async () => {
    const r = await lancer();
    const b = bandes(r);
    expect(b).toHaveLength(9);
    for (const t of b) {
      expect(t.numberOfChannels).toBe(2);
      expect(t.length).toBe(FE / 2);
      expect(t.sampleRate).toBe(FE);
    }
    // 100 Hz tombe dans la bande 3 (89 à 177 Hz), 3 kHz dans la bande 8 (2828 à 5657 Hz).
    const gauche = b.map((t) => efficace(t.getChannelData(0)));
    const droite = b.map((t) => efficace(t.getChannelData(1)));
    expect(gauche.indexOf(Math.max(...gauche))).toBe(2);
    expect(droite.indexOf(Math.max(...droite))).toBe(7);
    expect(r.message).toContain("45, 89, 177, 354, 707, 1414, 2828, 5657");
  });

  it("« Méthode » agit : en FFT à phase nulle, la somme des neuf sorties redonne l'entrée", async () => {
    const entree = stereo();
    const lr = bandes(await lancer({ "Méthode": "linkwitz-riley" }, entree));
    const ff = bandes(await lancer({ "Méthode": "fft" }, entree));
    for (let c = 0; c < 2; c++) {
      const x = entree.getChannelData(c);
      let ecartFft = 0, ecartLr = 0;
      for (let i = 0; i < x.length; i++) {
        ecartFft = Math.max(ecartFft, Math.abs(ff.reduce((s, t) => s + t.getChannelData(c)[i], 0) - x[i]));
        ecartLr = Math.max(ecartLr, Math.abs(lr.reduce((s, t) => s + t.getChannelData(c)[i], 0) - x[i]));
      }
      expect(ecartFft, `canal ${c + 1}, FFT`).toBeLessThan(1e-5);
      // Le Linkwitz-Riley rend un module plat mais une phase tournée : la somme n'est pas l'entrée.
      expect(ecartLr, `canal ${c + 1}, Linkwitz-Riley`).toBeGreaterThan(0.05);
    }
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("« Coupure %i » agit sur les deux bandes qu'elle sépare", async (n) => {
    const entree = bruit();
    const avant = bandes(await lancer({}, entree));
    const valeur = fiche.parametres.find((p) => p.nom === `Coupure ${n}`)!;
    const apres = bandes(await lancer({ [`Coupure ${n}`]: Number(valeur.defaut) * 1.5 }, entree));
    // L'écart en énergie, rapporté à celle de la bande : une coupure déplacée d'une demi-octave
    // retranche à une bande ce qu'elle ajoute à l'autre.
    const ecart = (k: number) => {
      const a = avant[k].getChannelData(0), b = apres[k].getChannelData(0);
      return Math.abs(efficace(b) - efficace(a)) / efficace(a);
    };
    expect(ecart(n - 1), `bande ${n}`).toBeGreaterThan(0.05);
    expect(ecart(n), `bande ${n + 1}`).toBeGreaterThan(0.05);
  });

  it("le message nomme la méthode, et les coupures telles qu'employées, rangées", async () => {
    const r = await lancer({ "Méthode": "fft", "Coupure 1": 500, "Coupure 5": 60 });
    expect(r.message).toContain("FFT");
    expect(r.message).toContain("60, 89, 177, 354, 500, 1414, 2828, 5657");
  });
});
