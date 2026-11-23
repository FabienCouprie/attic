// audio/choral-respiration.test.ts — L'harmoniseur rend la main assez souvent : compté, non chronométré.
//
// LE TÉMOIN COMPTE LE TRAVAIL ENTRE DEUX RESPIRATIONS, au lieu de chronométrer les blocs. Le cas qu'il
// remplace bornait à 100 ms le plus long bloc lu à l'horloge : il est tombé à 120,9 ms pendant une
// passe complète, sur un calcul que la charge avait étiré à 9 s. Une horloge dans un test borne la
// charge de la machine, pas le code.
//
// Ici, chaque disposition construite et chaque coût évalué, d'une colonne ou d'un passage, comptent
// une unité ; chaque appel à `Respiration.tour()` est un point où la main peut se rendre. Entre deux
// points, le travail ne doit pas dépasser seize dispositions de la plus grande colonne, la cadence de
// la chaîne. Que le compteur cède au-delà de son délai est tenu par `core/respirer.test.ts`.

import { describe, expect, it, vi } from "vitest";

const compte = vi.hoisted(() => ({ travail: 0, points: [] as number[] }));

vi.mock("../core/respirer", () => ({
  Respiration: class { async tour() { compte.points.push(compte.travail); return false; } },
}));
vi.mock("./choral-energie", async (original) => {
  const vrai = await original<typeof import("./choral-energie")>();
  return {
    ...vrai,
    energieColonne: (...a: Parameters<typeof vrai.energieColonne>) => { compte.travail++; return vrai.energieColonne(...a); },
    energiePassage: (...a: Parameters<typeof vrai.energiePassage>) => { compte.travail++; return vrai.energiePassage(...a); },
  };
});
vi.mock("./choral-candidats", async (original) => {
  const vrai = await original<typeof import("./choral-candidats")>();
  return {
    ...vrai,
    dispositions: (...a: Parameters<typeof vrai.dispositions>) => {
      const d = vrai.dispositions(...a);
      compte.travail += d.length;
      return d;
    },
  };
});

import { harmoniserChoral } from "./choral-harmoniser";
import { accordsPossibles, dispositions } from "./choral-candidats";
import type { Sequence } from "./sequence";

/** Un soprano de 190 noires, septièmes partout et renversements permis : les colonnes les plus larges. */
const HAUTEURS = Array.from({ length: 190 }, (_, k) => [72, 71, 69, 67, 69, 71, 72, 74, 72, 71][k % 10]);
const MELODIE: Sequence = { notes: HAUTEURS.map((note, k) => ({ note, velocite: 80, debut: k, fin: k + 1, voix: 0 })), tempo: 60 };

const PLUS_GRANDE_COLONNE = Math.max(...[...new Set(HAUTEURS)].map((note) =>
  accordsPossibles(note, 0, "majeur", "toutes").reduce((s, a) => s + dispositions(a, note, true).length, 0)));

/** Le plus grand travail fait d'un seul tenant, entre deux points où la main peut se rendre. */
async function plusLongTroncon(temperature: number) {
  compte.travail = 0;
  compte.points = [];
  const r = await harmoniserChoral(MELODIE, { tonique: 0, mode: "majeur", pas: 1, septiemes: "toutes", renversements: true, temperature, graine: 3 });
  const bornes = [0, ...compte.points, compte.travail];
  let pire = 0;
  for (let k = 1; k < bornes.length; k++) pire = Math.max(pire, bornes[k] - bornes[k - 1]);
  return { pire, total: compte.travail, rendu: "notes" in r };
}

describe("la main rendue à l'interface, comptée", () => {
  it("les colonnes sont assez larges pour que la cadence compte", () => {
    expect(PLUS_GRANDE_COLONNE).toBeGreaterThan(100);
  });

  it("à température nulle, aucun tronçon ne passe seize dispositions de la plus grande colonne", async () => {
    const { pire, total, rendu } = await plusLongTroncon(0);
    expect(rendu).toBe(true);
    expect(total).toBeGreaterThan(100 * 16 * PLUS_GRANDE_COLONNE);
    expect(pire).toBeLessThanOrEqual(16 * PLUS_GRANDE_COLONNE);
  });

  it("au-dessus de zéro, le tirage arrière compris, aucun non plus", async () => {
    const { pire, rendu } = await plusLongTroncon(0.5);
    expect(rendu).toBe(true);
    expect(pire).toBeLessThanOrEqual(16 * PLUS_GRANDE_COLONNE);
  });
});
