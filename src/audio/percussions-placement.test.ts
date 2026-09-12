// audio/percussions-placement.test.ts — La recopie des frappes de batterie.
//
// Ce module remplace un rendu où toutes les frappes étaient posées sur les mêmes
// synthés de Tone, au coût quadratique. Ce qui mérite d'être verrouillé ici n'est
// pas que la copie copie, mais les trois points où une implémentation directe se
// trompe : l'échelle (vélocité ET volume, deux gains qui se multiplient), la
// coupure d'une frappe par la suivante de SA voix — et pas d'une autre —, et les
// bords du tampon.
import { describe, it, expect } from "vitest";
import {
  declenchementsPour, cleEchantillon, echantillonsRequis, secondesDeclenchement,
  placerPercussions, type Echantillon, type Frappe,
} from "./percussions-placement";

/** Un échantillon plat de `n` échantillons à 1, pour lire les gains à l'œil nu. */
const plat = (n: number): Echantillon => ({
  gauche: new Float32Array(n).fill(1),
  droite: new Float32Array(n).fill(1),
});

const sortie = (n: number) => ({ gauche: new Float32Array(n), droite: new Float32Array(n) });

const frappe = (note: number, debut: number, velocite = 127): Frappe =>
  ({ note, velocite, debut, fin: debut + 0.1 });

/** Table d'échantillons plats pour toutes les voix qu'un jeu de frappes demande. */
const echantillonsPlats = (frappes: Frappe[], longueur: number) => {
  const m = new Map<string, Echantillon>();
  for (const d of echantillonsRequis(frappes)) m.set(cleEchantillon(d), plat(longueur));
  return m;
};

describe("correspondance des notes General MIDI", () => {
  it("mappe les percussions du kit, avec leur hauteur et leur durée", () => {
    expect(declenchementsPour(36)).toEqual([{ voix: "kick", hauteur: "C2", duree: "8n" }]);
    expect(declenchementsPour(39)).toEqual([{ voix: "clap", hauteur: null, duree: "16n" }]);
    expect(declenchementsPour(46)).toEqual([{ voix: "hihatOpen", hauteur: "C5", duree: "16n" }]);
    expect(declenchementsPour(49)).toEqual([{ voix: "crash", hauteur: "C5", duree: "4n" }]);
  });

  it("la caisse claire produit DEUX déclenchements : un corps et un bruit", () => {
    // Deux voix, donc deux monophonies distinctes : le bruit ne coupe pas le
    // corps et réciproquement.
    const d = declenchementsPour(38);
    expect(d).toHaveLength(2);
    expect(d.map((x) => x.voix)).toEqual(["snare", "snareNoise"]);
  });

  it("42 et 44 sont le MÊME charley fermé", () => {
    // Deux notes GM pour un seul son : elles doivent se couper l'une l'autre,
    // ce qui n'arrive que si elles partagent la voix.
    expect(declenchementsPour(42)).toEqual(declenchementsPour(44));
  });

  it("45 et 47 partagent une voix mais PAS un son", () => {
    // Le piège que la distinction voix / échantillon existe pour éviter : même
    // synthé, deux hauteurs. Les confondre donnerait soit deux toms qui ne se
    // coupent plus, soit un seul son pour deux notes.
    const a = declenchementsPour(45)[0], b = declenchementsPour(47)[0];
    expect(a.voix).toBe(b.voix);
    expect(a.hauteur).not.toBe(b.hauteur);
    expect(cleEchantillon(a)).not.toBe(cleEchantillon(b));
  });

  it("une note inconnue tombe sur la grosse caisse", () => {
    // Repli du code d'origine, conservé : un kit GM compte une quarantaine de
    // percussions, et une frappe muette s'entend plus qu'un son approché.
    expect(declenchementsPour(60)).toEqual(declenchementsPour(36));
    expect(declenchementsPour(0)).toEqual(declenchementsPour(36));
  });

  it("ne demande qu'une fois chaque son, quel qu'en soit le nombre de frappes", () => {
    // C'est tout l'objet du correctif : le nombre de rendus Tone ne dépend que
    // du nombre de sons employés, jamais du nombre de frappes.
    const beaucoup = Array.from({ length: 500 }, (_, i) => frappe([36, 38, 42][i % 3], i * 0.1));
    const requis = echantillonsRequis(beaucoup);
    expect(requis).toHaveLength(4); // kick, snare, snareNoise, hihat
    expect(new Set(requis.map(cleEchantillon)).size).toBe(4);
  });
});

describe("durée des déclenchements", () => {
  it("suit la notation de Tone au tempo par défaut", () => {
    expect(secondesDeclenchement("4n")).toBe(0.5);
    expect(secondesDeclenchement("8n")).toBe(0.25);
    expect(secondesDeclenchement("16n")).toBe(0.125);
    expect(secondesDeclenchement("32n")).toBe(0.0625);
  });

  it("retombe sur la croche pour une notation inconnue", () => {
    expect(secondesDeclenchement("7n")).toBe(0.25);
  });
});

describe("mise à l'échelle", () => {
  it("multiplie la vélocité par le volume", () => {
    // Les deux sont des gains exacts — mesuré dans l'app, écart nul — et ils se
    // multiplient. Se tromper ici donnerait une batterie au mauvais niveau sans
    // rien casser d'autre, donc sans que personne le voie.
    const f = [frappe(36, 0, 64)];
    const s = sortie(100);
    placerPercussions({ frappes: f, echantillons: echantillonsPlats(f, 10), sortie: s, sampleRate: 1000, gain: 0.5 });
    expect(s.gauche[0]).toBeCloseTo(0.5 * (64 / 127), 6);
  });

  it("une vélocité nulle ne pose rien", () => {
    const f = [frappe(36, 0, 0)];
    const s = sortie(100);
    const r = placerPercussions({ frappes: f, echantillons: echantillonsPlats(f, 10), sortie: s, sampleRate: 1000, gain: 1 });
    expect(s.gauche.every((v) => v === 0)).toBe(true);
    expect(r.placees, "la frappe est traitée, simplement inaudible").toBe(1);
  });

  it("borne une vélocité hors plage au lieu d'amplifier", () => {
    const f = [{ note: 36, velocite: 300, debut: 0, fin: 0.1 }];
    const s = sortie(100);
    placerPercussions({ frappes: f, echantillons: echantillonsPlats(f, 10), sortie: s, sampleRate: 1000, gain: 1 });
    expect(s.gauche[0]).toBe(1);
  });
});

describe("coupure par la frappe suivante", () => {
  it("écourte une frappe quand la suivante arrive sur SA voix", () => {
    // Un synthé monophonique ne joue qu'un son à la fois : la seconde frappe
    // interrompt la première. Sans cela, les copies s'additionneraient et la
    // grosse caisse — 1,8 s de queue pour 1,2 s entre deux temps — s'empilerait.
    const f = [frappe(36, 0), frappe(36, 0.05)];
    const s = sortie(1000);
    const r = placerPercussions({
      frappes: f, echantillons: echantillonsPlats(f, 500), sortie: s,
      sampleRate: 1000, gain: 1, releaseSec: 0,
    });
    expect(r.coupees).toBe(1);
    // La première occupe [0, 50), la seconde reprend à 50 : aucune somme.
    expect(s.gauche[49]).toBe(1);
    expect(s.gauche[50]).toBe(1);
    expect(Math.max(...s.gauche)).toBe(1);
  });

  it("ne coupe PAS une frappe par une autre voix", () => {
    // Grosse caisse et charley se superposent : c'est ce que faisaient les huit
    // synthés branchés sur la même destination.
    const f = [frappe(36, 0), frappe(42, 0.05)];
    const s = sortie(1000);
    const r = placerPercussions({
      frappes: f, echantillons: echantillonsPlats(f, 500), sortie: s,
      sampleRate: 1000, gain: 1, releaseSec: 0,
    });
    expect(r.coupees).toBe(0);
    expect(s.gauche[100], "les deux sonnent ensemble").toBeCloseTo(2, 6);
  });

  it("applique une rampe de sortie pour éviter un clic", () => {
    // La coupure franche produirait une discontinuité que l'ancien rendu n'avait
    // pas : un synthé monophonique repart de son niveau courant.
    const f = [frappe(36, 0), frappe(36, 0.1)];
    const s = sortie(1000);
    placerPercussions({
      frappes: f, echantillons: echantillonsPlats(f, 500), sortie: s,
      sampleRate: 1000, gain: 1, releaseSec: 0.01,
    });
    // La rampe occupe les 10 derniers échantillons avant 100.
    expect(s.gauche[89]).toBeCloseTo(1, 6);
    expect(s.gauche[95]).toBeGreaterThan(0);
    expect(s.gauche[95]).toBeLessThan(1);
    expect(s.gauche[99]).toBeLessThan(s.gauche[95]);
  });

  it("resserre la rampe quand l'intervalle est plus court qu'elle", () => {
    // Un roulement de charley à la double croche rapide laisse moins de 5 ms.
    const f = [frappe(42, 0), frappe(42, 0.003)];
    const s = sortie(1000);
    const r = placerPercussions({
      frappes: f, echantillons: echantillonsPlats(f, 500), sortie: s,
      sampleRate: 1000, gain: 1, releaseSec: 0.005,
    });
    expect(r.coupees).toBe(1);
    expect(Number.isFinite(s.gauche[0])).toBe(true);
    expect(Math.max(...s.gauche)).toBeLessThanOrEqual(1);
  });

  it("deux frappes simultanées sur une voix s'additionnent au lieu de se couper", () => {
    // Rien ne « suit » rien : l'ancien code posait deux déclenchements au même
    // instant, qui s'additionnaient aussi. Une coupure de durée nulle aurait
    // rendu la frappe inaudible.
    const f = [frappe(36, 0), frappe(36, 0)];
    const s = sortie(1000);
    const r = placerPercussions({
      frappes: f, echantillons: echantillonsPlats(f, 100), sortie: s,
      sampleRate: 1000, gain: 1, releaseSec: 0,
    });
    expect(r.coupees).toBe(0);
    expect(s.gauche[0]).toBeCloseTo(2, 6);
  });

  it("trouve la frappe suivante même si l'entrée est en désordre", () => {
    // Un MIDI bouclé ou fusionné ne donne pas ses notes triées, et l'ordre
    // décide ici de la coupure.
    const f = [frappe(36, 0.05), frappe(36, 0)];
    const s = sortie(1000);
    const r = placerPercussions({
      frappes: f, echantillons: echantillonsPlats(f, 500), sortie: s,
      sampleRate: 1000, gain: 1, releaseSec: 0,
    });
    expect(r.coupees, "celle de 0 est coupée par celle de 0,05").toBe(1);
    expect(Math.max(...s.gauche)).toBe(1);
  });
});

describe("bords du tampon", () => {
  it("tronque une frappe qui dépasse la fin", () => {
    const f = [frappe(36, 0.09)];
    const s = sortie(100);
    placerPercussions({ frappes: f, echantillons: echantillonsPlats(f, 500), sortie: s, sampleRate: 1000, gain: 1 });
    expect(s.gauche[99]).toBe(1);
    expect(s.gauche.length).toBe(100);
  });

  it("ignore sans broncher une frappe entièrement hors du tampon", () => {
    const f = [frappe(36, 10)];
    const s = sortie(100);
    const r = placerPercussions({ frappes: f, echantillons: echantillonsPlats(f, 50), sortie: s, sampleRate: 1000, gain: 1 });
    expect(s.gauche.every((v) => v === 0)).toBe(true);
    expect(r.placees).toBe(1);
  });

  it("compte les frappes dont l'échantillon manque, au lieu de planter", () => {
    // Ne devrait pas arriver — `echantillonsRequis` alimente la table — mais le
    // rendu d'un son peut échouer, et une piste silencieuse vaut mieux qu'une
    // exception au milieu d'un graphe.
    const f = [frappe(36, 0)];
    const r = placerPercussions({
      frappes: f, echantillons: new Map(), sortie: sortie(100), sampleRate: 1000, gain: 1,
    });
    expect(r.ignorees).toBe(1);
    expect(r.placees).toBe(0);
  });

  it("n'écrit rien pour une liste de frappes vide", () => {
    const s = sortie(100);
    const r = placerPercussions({ frappes: [], echantillons: new Map(), sortie: s, sampleRate: 1000, gain: 1 });
    expect(r).toEqual({ placees: 0, ignorees: 0, coupees: 0 });
    expect(s.gauche.every((v) => v === 0)).toBe(true);
  });
});

describe("déterminisme", () => {
  it("deux placements identiques donnent le même signal", () => {
    const f = Array.from({ length: 40 }, (_, i) => frappe([36, 38, 42, 46][i % 4], i * 0.02, 60 + i));
    const faire = () => {
      const s = sortie(2000);
      placerPercussions({ frappes: f, echantillons: echantillonsPlats(f, 300), sortie: s, sampleRate: 1000, gain: 0.8 });
      return s.gauche;
    };
    expect([...faire()]).toEqual([...faire()]);
  });
});
