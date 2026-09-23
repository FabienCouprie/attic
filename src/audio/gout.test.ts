// audio/gout.test.ts — Les cinq dimensions, et les quatre régions.
//
// COMMENT ON ÉPROUVE CELA. On fabrique des sons dont la littérature dit à quel goût ils
// ressemblent — un accord consonant lent et doux pour le sucré, des clics détachés pour le salé,
// un cluster aigu rapide pour l'acide, un bourdon grave lié pour l'amer — et l'on vérifie que la
// mesure les place où il faut. Ce ne sont pas des enregistrements réels : c'est le seul moyen de
// tenir une référence stable, et cela suffit à attraper une dimension inversée ou mal normalisée.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { mesurer, profil, rapport, REGIONS, POIDS, type DimensionsGout, type Gout } from "./gout";

const SR = 44100;

function buffer(duree: number, remplir: (t: number, i: number) => number): AudioBuffer {
  const n = Math.round(duree * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = b.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = remplir(i / SR, i);
  return b;
}

/** Un accord consonant tenu, doux et sans attaque : le sucré du texte de Mesz. */
const sucre = () => buffer(4, (t) => {
  const enveloppe = Math.min(1, t / 0.5) * Math.min(1, (4 - t) / 0.5);
  return 0.12 * enveloppe * (Math.sin(2 * Math.PI * 262 * t) + Math.sin(2 * Math.PI * 330 * t) + Math.sin(2 * Math.PI * 392 * t)) / 3;
});

/** Des clics détachés, avec du silence entre eux : le salé. */
const sale = () => buffer(4, (t) => {
  const phase = t % 0.25;
  if (phase > 0.03) return 0;
  return 0.6 * Math.exp(-phase * 120) * Math.sin(2 * Math.PI * 500 * t);
});

/** Un cluster aigu, rapide et rugueux : l'acide. */
const acide = () => buffer(4, (t) => {
  const phase = t % 0.15;
  const enveloppe = phase < 0.12 ? Math.exp(-phase * 8) : 0;
  return 0.35 * enveloppe * (Math.sin(2 * Math.PI * 1500 * t) + Math.sin(2 * Math.PI * 1560 * t) + Math.sin(2 * Math.PI * 1620 * t)) / 3;
});

/** Un bourdon grave, lié, légèrement battant : l'amer. */
const amer = () => buffer(4, (t) => {
  const enveloppe = Math.min(1, t / 0.8);
  return 0.3 * enveloppe * (Math.sin(2 * Math.PI * 70 * t) + 0.7 * Math.sin(2 * Math.PI * 105 * t) + 0.3 * Math.sin(2 * Math.PI * 111 * t)) / 2;
});

const dominant = (b: AudioBuffer): Gout => profil(mesurer(b).dimensions)[0].gout;

describe("mesurer", () => {
  it("entend la hauteur, et le dit en hertz", () => {
    const m = mesurer(buffer(2, (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t)));
    expect(m.hertz).toBeGreaterThan(420);
    expect(m.hertz).toBeLessThan(460);
    expect(m.partVoisee).toBeGreaterThan(0.8);
    // 440 Hz, trois octaves au-dessus de 55 : au milieu de l'étendue retenue.
    expect(m.registre).toBeGreaterThan(400);
    expect(m.dimensions.hauteur).toBeCloseTo(3 / 5, 1);
  });

  it("un bruit n'a pas de hauteur, mais il a un registre", () => {
    let graine = 7;
    const bruit = buffer(2, () => {
      graine = (graine * 1664525 + 1013904223) >>> 0;
      return 0.3 * (graine / 2147483648 - 1);
    });
    const m = mesurer(bruit);
    // Un bruit blanc a la moitié de son énergie au-dessus du quart de la fréquence d'échantillonnage.
    expect(m.registre).toBeGreaterThan(5000);
    expect(m.dimensions.hauteur).toBe(1);
  });

  it("le registre est celui où le son se tient, et non sa fondamentale absente", () => {
    // Do majeur : 262, 330, 392 Hz. Leur période commune est à 65 Hz, où rien ne sonne.
    const accord = buffer(2, (t) => 0.2 * (Math.sin(2 * Math.PI * 262 * t) + Math.sin(2 * Math.PI * 330 * t) + Math.sin(2 * Math.PI * 392 * t)) / 3);
    const m = mesurer(accord);
    expect(m.registre).toBeGreaterThan(250);
    expect(m.registre).toBeLessThan(420);
  });

  it("distingue le lié du piqué par le silence entre les notes, et non par leur nombre", () => {
    const lie = mesurer(buffer(3, (t) => 0.3 * Math.sin(2 * Math.PI * 220 * t)));
    const pique = mesurer(sale());
    expect(lie.dimensions.articulation).toBeGreaterThan(0.95);
    expect(pique.dimensions.articulation).toBeLessThan(0.35);
    // Le piqué a POURTANT plus d'attaques : c'est bien le silence qui décide.
    expect(pique.attaques).toBeGreaterThan(lie.attaques);
  });

  it("compte les attaques par seconde", () => {
    const m = mesurer(sale()); // une toutes les 250 ms
    expect(m.attaques).toBeGreaterThan(3);
    expect(m.attaques).toBeLessThan(5);
  });

  it("trouve un accord consonant plus consonant qu'un cluster serré", () => {
    expect(mesurer(sucre()).dimensions.consonance).toBeGreaterThan(mesurer(acide()).dimensions.consonance);
  });

  it("mesure l'intensité en dB, et la ramène de −40 dB à 0", () => {
    const fort = mesurer(buffer(1, (t) => 0.8 * Math.sin(2 * Math.PI * 300 * t)));
    const doux = mesurer(buffer(1, (t) => 0.02 * Math.sin(2 * Math.PI * 300 * t)));
    expect(fort.db).toBeGreaterThan(doux.db + 20);
    expect(fort.dimensions.intensite).toBeGreaterThan(doux.dimensions.intensite);
    expect(doux.dimensions.intensite).toBeLessThan(0.3);
  });
});

describe("profil", () => {
  it("place chaque son de référence dans la région que la littérature lui donne", () => {
    expect(dominant(sucre())).toBe("sucré");
    expect(dominant(sale())).toBe("salé");
    expect(dominant(acide())).toBe("acide");
    expect(dominant(amer())).toBe("amer");
  });

  it("rend quatre parts qui font un tout, de la plus forte à la plus faible", () => {
    const p = profil(mesurer(sucre()).dimensions);
    expect(p).toHaveLength(4);
    expect(p.reduce((s, x) => s + x.part, 0)).toBeCloseTo(1, 6);
    for (let i = 1; i < p.length; i++) expect(p[i - 1].part).toBeGreaterThanOrEqual(p[i].part);
  });

  it("un son posé sur une région lui donne l'essentiel de la part", () => {
    for (const gout of Object.keys(REGIONS) as Gout[]) {
      const p = profil(REGIONS[gout]);
      expect(p[0].gout, gout).toBe(gout);
      expect(p[0].part, gout).toBeGreaterThan(0.6);
    }
  });

  it("aucun goût n'est jamais nul : les correspondances sont graduelles, pas des cases", () => {
    const milieu: DimensionsGout = { hauteur: 0.5, articulation: 0.5, vitesse: 0.5, consonance: 0.5, intensite: 0.5 };
    for (const p of profil(milieu)) expect(p.part).toBeGreaterThan(0.1);
  });

  it("chaque goût a une région et des poids, sur les mêmes cinq dimensions", () => {
    for (const gout of Object.keys(REGIONS) as Gout[]) {
      expect(Object.keys(POIDS[gout]).sort()).toEqual(Object.keys(REGIONS[gout]).sort());
    }
  });
});

describe("rapport", () => {
  it("dit les parts, puis ce qui les a produites", () => {
    const m = mesurer(sucre());
    const t = rapport(m, profil(m.dimensions));
    expect(t).toContain("sucré");
    expect(t).toMatch(/hauteur/);
    expect(t).toMatch(/attaques par seconde/);
    expect(t).toMatch(/Hz|sans hauteur/);
    const anglais = rapport(m, profil(m.dimensions), true);
    expect(anglais).toContain("sweet");
    expect(anglais).toContain("attacks per second");
  });
});
