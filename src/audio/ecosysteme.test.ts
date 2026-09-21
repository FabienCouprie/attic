// audio/ecosysteme.test.ts — Ce qu'un écosystème doit faire, et ce qu'il ne doit surtout pas être.
//
// LE TEST QUI JUSTIFIE LE NŒUD EST CELUI DU CONTRÔLE AUTOMATIQUE DE GAIN. Un compresseur aussi
// ramène un niveau à une cible, et un nœud qui se contenterait de cela ne serait qu'un compresseur
// affublé d'un vocabulaire. La différence tient en une phrase : ici l'observation ne commande pas
// un volume mais la STRUCTURE de la synthèse. On le vérifie en donnant au système deux mondes de
// même niveau, dont l'un bouge et l'autre pas, et en constatant qu'à sortie de même niveau les deux
// textures n'ont rien à voir.
//
// LE SECOND : LE SON DOIT VENIR DE LA BOUCLE. Si le nœud ne faisait que granuler son entrée, couper
// le monde couperait le son. On arrête donc le monde au bout d'une seconde et l'on écoute les sept
// suivantes : à couplage nul il ne reste rien, et le niveau de ce qui reste monte avec le couplage.
//
// LE TROISIÈME : LE RÉGIME NE SE LIT PAS SUR LE NIVEAU. L'homéostat ramène presque toujours le
// niveau à sa cible, si bien qu'un système qui se tient sans peine et un système à bout de forces
// sonnent au même volume. Ce qui les sépare est la dépense, et elle se lit sur la poussée.
import { describe, expect, it } from "vitest";
import {
  POUSSEE_MAX, diagnostiquer, nomRegime, tracer, vivre,
  type OptionsEcosysteme, type Point,
} from "./ecosysteme";

const SR = 44100;

function alea(graine: number): () => number {
  let e = graine >>> 0;
  return () => { e = (e * 1664525 + 1013904223) >>> 0; return e / 4294967296; };
}

/** Un monde qui ne bouge pas. */
function tenue(n: number, hz: number, amplitude: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

/** Un monde qui bouge sans cesse. */
function clics(n: number, amplitude: number): Float32Array {
  const x = new Float32Array(n);
  const r = alea(5);
  for (let c = 0; c < 30; c++) {
    const d = Math.floor((c + 0.3 + 0.4 * r()) * (n / 30));
    for (let i = 0; i < 64 && d + i < n; i++) x[d + i] = amplitude * Math.exp(-i / 14) * (r() * 2 - 1);
  }
  return x;
}

const db = (x: Float32Array): number => {
  let s = 0;
  for (const v of x) s += v * v;
  return 10 * Math.log10(Math.max(1e-12, s / Math.max(1, x.length)));
};

const correlation = (a: Float32Array, b: Float32Array, depuis = 0): number => {
  let num = 0, da = 0, dbb = 0;
  for (let i = depuis; i < Math.min(a.length, b.length); i++) { num += a[i] * b[i]; da += a[i] ** 2; dbb += b[i] ** 2; }
  return num / Math.sqrt(da * dbb || 1);
};

const BASE: OptionsEcosysteme = {
  frequence: SR, duree: 4, couplage: 0.8, cibleDb: -20, reactivite: 0.5,
  memoireS: 1.5, densiteMax: 120, homeostat: true, graine: 7,
};

describe("l'homéostat", () => {
  it("TROIS MONDES À TRENTE-QUATRE DÉCIBELS D'ÉCART RENDENT LA MÊME SORTIE, et sans lui non", () => {
    const mesurer = (homeostat: boolean) => {
      const sorties = [0.01, 0.1, 0.5].map(
        (a) => vivre(tenue(Math.round(4 * SR), 220, a), { ...BASE, homeostat }).niveauFinalDb);
      return Math.max(...sorties) - Math.min(...sorties);
    };
    // Le témoin : le même système, la même boucle, l'homéostat débranché et rien d'autre.
    expect(mesurer(false)).toBeGreaterThan(25);
    expect(mesurer(true)).toBeLessThan(3);
  });

  it("le niveau tenu est celui qu'on demande", () => {
    for (const cible of [-30, -20, -12]) {
      const r = vivre(tenue(Math.round(4 * SR), 220, 0.1), { ...BASE, cibleDb: cible });
      expect(Math.abs(r.niveauFinalDb - cible), `cible ${cible}`).toBeLessThan(6);
    }
  });
});

describe("la boucle", () => {
  it("LE SON CONTINUE APRÈS LA FIN DU MONDE, et c'est le couplage qui décide de combien", () => {
    const monde = new Float32Array(Math.round(8 * SR));
    monde.set(clics(Math.round(1 * SR), 0.5), 0);
    const apres = (couplage: number) =>
      db(vivre(monde, { ...BASE, duree: 8, couplage }).son.slice(Math.round(1 * SR)));

    // À couplage nul le système n'entend pas sa propre voix : il ne reste rien du tout.
    expect(apres(0)).toBeLessThan(-90);
    // Et le niveau de ce qui reste monte avec le couplage, sans trou ni renversement.
    const courbe = [0.15, 0.3, 0.6, 0.9].map(apres);
    for (let i = 1; i < courbe.length; i++) {
      expect(courbe[i], `couplage ${[0.15, 0.3, 0.6, 0.9][i]}`).toBeGreaterThan(courbe[i - 1]);
    }
    expect(courbe[courbe.length - 1]).toBeGreaterThan(-25);
  });

  it("le bruit de fond empêche le zéro d'être un état absorbant", () => {
    // Sans monde du tout, le système ne doit pas être mort : il doit seulement être très faible.
    // Un silence exact ne pourrait jamais être amplifié, quelle que soit la poussée.
    const r = vivre(new Float32Array(0), { ...BASE, duree: 1 });
    expect(r.son.length).toBe(SR);
    expect(r.son.some((v) => v !== 0)).toBe(true);
    expect(r.niveauFinalDb).toBeLessThan(-40);
  });
});

describe("ce n'est pas un contrôle automatique de gain", () => {
  it("DEUX MONDES DE MÊME NIVEAU DONNENT DEUX TEXTURES, à sortie de même niveau", () => {
    const n = Math.round(6 * SR);
    const calme = tenue(n, 220, 0.2);
    const agite = clics(n, 0.9);
    // Les deux mondes sont ramenés au même niveau : sans cela on comparerait des volumes.
    const facteur = 10 ** ((db(calme) - db(agite)) / 20);
    for (let i = 0; i < n; i++) agite[i] *= facteur;
    expect(Math.abs(db(calme) - db(agite))).toBeLessThan(0.1);

    const a = vivre(calme, { ...BASE, duree: 6 });
    const b = vivre(agite, { ...BASE, duree: 6 });

    // Les sorties sortent au même niveau — c'est justement ce qu'un compresseur ferait aussi.
    expect(Math.abs(a.niveauFinalDb - b.niveauFinalDb)).toBeLessThan(2);
    // Et pourtant les deux textures n'ont rien de commun : c'est là que le compresseur s'arrête.
    expect(b.densiteMediane).toBeGreaterThan(a.densiteMediane * 1.8);
    expect(a.dureeMedianeMs).toBeGreaterThan(b.dureeMedianeMs * 1.8);
  });

  it("l'agitation du monde arrive jusqu'au système", () => {
    const n = Math.round(4 * SR);
    const moyenne = (x: Point[]) => x.reduce((s, p) => s + p.agitation, 0) / x.length;
    const calme = vivre(tenue(n, 220, 0.2), BASE);
    const agite = vivre(clics(n, 0.5), BASE);
    expect(moyenne(agite.trajectoire)).toBeGreaterThan(moyenne(calme.trajectoire));
  });
});

describe("les régimes", () => {
  it("UN COUPLAGE TROP FAIBLE SE VOIT À LA POUSSÉE COLLÉE AU PLAFOND, non au niveau", () => {
    const monde = tenue(Math.round(8 * SR), 220, 0.1);
    const faible = vivre(monde, { ...BASE, duree: 8, couplage: 0.05 });
    expect(faible.regime).toBe("insuffisant");
    const poussees = faible.trajectoire.slice(-100).map((p) => p.poussee);
    expect(Math.min(...poussees)).toBeGreaterThan(POUSSEE_MAX * 0.98);
    // Le système n'atteint pas sa cible : ce qu'on entend est le monde, à peine granulé.
    expect(faible.niveauFinalDb).toBeLessThan(BASE.cibleDb - 6);
  });

  it("un couplage moyen fait balancer la poussée sur une large course", () => {
    const monde = tenue(Math.round(8 * SR), 220, 0.1);
    const r = vivre(monde, { ...BASE, duree: 8, couplage: 0.8 });
    const poussees = r.trajectoire.slice(Math.floor(r.trajectoire.length / 3)).map((p) => p.poussee);
    expect(Math.max(...poussees) - Math.min(...poussees)).toBeGreaterThan(2);
    expect(r.regime).toBe("oscille");
  });

  it("le diagnostic se lit sur des trajectoires construites", () => {
    const point = (poussee: number, niveauDb: number): Point =>
      ({ secondes: 0, niveauDb, entenduDb: niveauDb, agitation: 0.3, poussee, densite: 30, dureeMs: 60 });
    const suite = (n: number, f: (i: number) => Point) => Array.from({ length: n }, (_, i) => f(i));

    expect(diagnostiquer(suite(90, () => point(POUSSEE_MAX, -40)), -20)).toBe("insuffisant");
    expect(diagnostiquer(suite(90, () => point(0.05, -20)), -20)).toBe("bride");
    expect(diagnostiquer(suite(90, () => point(2, -20)), -20)).toBe("regule");
    expect(diagnostiquer(suite(90, (i) => point(3 + 2.5 * Math.sin(i / 4), -20)), -20)).toBe("oscille");
    // Une trajectoire trop courte ne se diagnostique pas.
    expect(diagnostiquer(suite(4, () => point(2, -20)), -20)).toBe("insuffisant");
  });

  it("chaque régime se nomme dans les deux langues", () => {
    for (const r of ["insuffisant", "regule", "oscille", "bride"] as const) {
      expect(nomRegime(r, false).length).toBeGreaterThan(0);
      expect(nomRegime(r, true).length).toBeGreaterThan(0);
      expect(nomRegime(r, true)).not.toMatch(/[éèêàçùîôûï]/);
    }
  });
});

describe("l'instance et la reproduction", () => {
  it("MÊME GRAINE, MÊME SON — sans quoi aucun des autres tests ne voudrait rien dire", () => {
    const monde = clics(Math.round(3 * SR), 0.5);
    const a = vivre(monde, { ...BASE, duree: 3 });
    const b = vivre(monde, { ...BASE, duree: 3 });
    expect(Array.from(a.son)).toEqual(Array.from(b.son));
  });

  it("DEUX GRAINES DONNENT DEUX SONS SANS RAPPORT, ET POURTANT DE MÊME ESPÈCE", () => {
    // Ce que le nœud rend n'est pas un objet mais une instance d'un processus : deux tirages ne se
    // ressemblent en rien échantillon par échantillon, et se ressemblent en tout statistiquement.
    const monde = clics(Math.round(4 * SR), 0.5);
    const a = vivre(monde, BASE);
    const b = vivre(monde, { ...BASE, graine: 99 });
    expect(Math.abs(correlation(a.son, b.son))).toBeLessThan(0.2);
    expect(Math.abs(a.niveauFinalDb - b.niveauFinalDb)).toBeLessThan(2);
    expect(a.densiteMediane).toBeGreaterThan(b.densiteMediane / 1.5);
    expect(a.densiteMediane).toBeLessThan(b.densiteMediane * 1.5);
  });
});

describe("les bornes", () => {
  it("la sortie reste dans le gabarit, quel que soit le couplage", () => {
    const monde = clics(Math.round(2 * SR), 0.9);
    for (const couplage of [0, 0.5, 1, 2, 4]) {
      const r = vivre(monde, { ...BASE, duree: 2, couplage });
      expect(r.son.every((v) => Number.isFinite(v)), `couplage ${couplage}`).toBe(true);
      expect(Math.max(...Array.from(r.son, Math.abs)), `couplage ${couplage}`).toBeLessThanOrEqual(1);
    }
  });

  it("les cas limites rendent un son plutôt qu'une erreur", () => {
    for (const o of [
      { ...BASE, duree: 0 },
      { ...BASE, memoireS: 0 },
      { ...BASE, densiteMax: 0 },
      { ...BASE, reactivite: 0 },
      { ...BASE, graine: 0 },
    ]) {
      const r = vivre(clics(Math.round(SR / 2), 0.5), o);
      expect(r.son.length).toBeGreaterThan(0);
      expect(r.son.every((v) => Number.isFinite(v))).toBe(true);
      expect(r.trajectoire.length).toBeGreaterThan(0);
    }
  });

  it("la durée demandée est celle qu'on obtient, même au-delà du monde", () => {
    const r = vivre(clics(Math.round(SR), 0.5), { ...BASE, duree: 3 });
    expect(r.son.length).toBe(3 * SR);
  });
});

describe("la courbe en caractères", () => {
  it("rend le nombre de lignes demandé, et place le sommet en haut", () => {
    const trajectoire: Point[] = Array.from({ length: 200 }, (_, i) => ({
      secondes: i / 100, niveauDb: -20, entenduDb: -20, agitation: 0,
      poussee: i / 199, densite: 30, dureeMs: 60,
    }));
    const lignes = tracer(trajectoire, (p) => p.poussee, 6, 40);
    expect(lignes).toHaveLength(6);
    for (const l of lignes) expect(l).toHaveLength(40);
    // La poussée monte : la première colonne est vide en haut, la dernière est pleine.
    expect(lignes[0].trimEnd().length).toBeGreaterThan(30);
    expect(lignes[0][0]).toBe(" ");
  });

  it("une trajectoire vide ne rend rien, et une trajectoire plate ne divise pas par zéro", () => {
    expect(tracer([], (p) => p.poussee)).toEqual([]);
    const plate: Point[] = Array.from({ length: 20 }, () => ({
      secondes: 0, niveauDb: -20, entenduDb: -20, agitation: 0, poussee: 1, densite: 30, dureeMs: 60,
    }));
    const lignes = tracer(plate, (p) => p.poussee, 4, 10);
    expect(lignes).toHaveLength(4);
    expect(lignes.every((l) => !l.includes("NaN"))).toBe(true);
  });
});
