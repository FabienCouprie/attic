// plugins/spirale-spatiale.test.ts — L'air de la spirale suit les mètres, et la norme.
//
// CE QUI EST TENU, par le nœud lancé comme le moteur le lance :
//   1. L'AIR RETIRE CE QUE L'ISO 9613-1 DIT, sur les mètres parcourus depuis le départ : un sinus
//      perd, en plus de la loi du carré inverse, α(f) décibels par mètre. Les α sont ceux de la
//      norme à 20 °C, 50 % d'humidité et 101,325 kPa, écrits ici en littéraux : le test ne calcule
//      pas son attendu avec le code qu'il vérifie.
//   2. LA DISTANCE DE DÉPART S'ENTEND EN S'ÉLOIGNANT : au même rapport, partir de plus loin parcourt
//      plus de mètres, et l'air retire davantage.
//   3. EN SE RAPPROCHANT, ELLE NE CHANGE RIEN, ni l'absorption : le son n'ajoute aucun mètre d'air.
import { describe, expect, it } from "vitest";
import { fiches } from "./spirale-spatiale";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { pointSpirale } from "../audio/spirale-spatiale";

const fiche = fiches.find((f) => f.id === "spirale-spatiale") as unknown as FicheLancable;

/** L'absorption de l'ISO 9613-1 à 20 °C, 50 % d'humidité, 101,325 kPa, en décibels par mètre. */
const ALPHA_ISO: Record<number, number> = { 1000: 0.00466, 4000: 0.02967, 8000: 0.10529, 16000: 0.36454 };

const SR = 48000;
const DUREE = 3;

function sinus(f: number): AudioBuffer {
  const n = SR * DUREE;
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / SR);
  }
  return b;
}

async function spirale(entree: AudioBuffer, reglages: Record<string, string | number>): Promise<AudioBuffer> {
  const r = await lancerFiche(fiche, reglages, { entrees: [entree] });
  expect(r.levee, "le nœud a levé").toBeNull();
  return r.valeurs[0] as AudioBuffer;
}

/** La puissance des deux canaux sur une fenêtre, en décibels. */
function puissanceDb(b: AudioBuffer, debut: number, fin: number): number {
  const g = b.getChannelData(0), d = b.getChannelData(1);
  let s = 0;
  for (let i = debut; i < fin; i++) s += g[i] * g[i] + d[i] * d[i];
  return 10 * Math.log10(s / (fin - debut));
}

const REGLAGES = { Tours: 1, "Rapport par tour": "quadruple", Sens: "eloigne", "Absorption de l'air": 100 };

describe("l'air de la spirale spatiale", () => {
  it("L'AIR RETIRE CE QUE L'ISO 9613-1 DIT, sur les mètres parcourus, à trois dixièmes de décibel", async () => {
    for (const depart of [0.5, 20]) {
      for (const f of [1000, 4000, 8000, 16000]) {
        const sortie = await spirale(sinus(f), { ...REGLAGES, "Distance de départ": depart });
        const n = sortie.length;
        const sr = sortie.sampleRate;
        // Une fenêtre loin des bords : la dernière trame voit le sinus s'arrêter.
        const debut = n - Math.round(0.2 * sr), fin = n - Math.round(0.1 * sr);
        // L'attendu : le carré inverse, la loi en cosinus (somme des carrés à deux), et l'air de la
        // norme sur les mètres parcourus à chaque instant.
        const o = { tours: 1, rapport: 4, eloigne: true, distanceDebut: depart, absorption: 1 };
        let attendu = 0;
        for (let i = debut; i < fin; i++) {
          const p = pointSpirale(o, i / (n - 1));
          const air = Math.pow(10, (-ALPHA_ISO[f] * (p.distance - depart)) / 20);
          attendu += 2 * 0.125 * (p.gain * air) ** 2;
        }
        const ecart = puissanceDb(sortie, debut, fin) - 10 * Math.log10(attendu / (fin - debut));
        expect(Math.abs(ecart), `départ ${depart} m, ${f} Hz : écart ${ecart.toFixed(2)} dB`).toBeLessThan(0.3);
      }
    }
  }, 60_000);

  it("LA DISTANCE DE DÉPART S'ENTEND EN S'ÉLOIGNANT : partir de plus loin retire plus d'aigu", async () => {
    const pres = await spirale(sinus(8000), { ...REGLAGES, "Distance de départ": 1 });
    const loin = await spirale(sinus(8000), { ...REGLAGES, "Distance de départ": 20 });
    const n = pres.length, sr = pres.sampleRate;
    const debut = n - Math.round(0.2 * sr), fin = n - Math.round(0.1 * sr);
    // De 1 à 4 m, trois mètres ; de 20 à 80 m, soixante : 5,7 décibels de plus à 8 kHz vers la fin.
    expect(puissanceDb(pres, debut, fin) - puissanceDb(loin, debut, fin)).toBeGreaterThan(4);
  }, 60_000);

  it("EN SE RAPPROCHANT, LA DISTANCE DE DÉPART ET L'ABSORPTION NE CHANGENT RIEN", async () => {
    const base = { ...REGLAGES, Sens: "rapproche" };
    const a = await spirale(sinus(8000), { ...base, "Distance de départ": 1 });
    const b = await spirale(sinus(8000), { ...base, "Distance de départ": 20 });
    const c = await spirale(sinus(8000), { ...base, "Distance de départ": 20, "Absorption de l'air": 0 });
    for (const canal of [0, 1]) {
      expect(b.getChannelData(canal)).toEqual(a.getChannelData(canal));
      expect(c.getChannelData(canal)).toEqual(a.getChannelData(canal));
    }
  }, 60_000);

  it("l'absorption vaut l'air réel par défaut", () => {
    const p = (fiche.parametres as readonly { nom: string; defaut?: unknown }[]).find((x) => x.nom === "Absorption de l'air");
    expect(p?.defaut).toBe(100);
  });
});
