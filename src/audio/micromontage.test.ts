// audio/micromontage.test.ts — Les fragments tombent-ils où la partition les envoie ?
//
// CE QUI SE VÉRIFIE ICI, ET QU'UNE ÉCOUTE NE DIRAIT PAS. Un micromontage rend un nuage : à mille
// fragments, tout s'entend comme une texture, et une erreur d'un facteur deux sur la prise, la pose
// ou la transposition s'y noie. Les contrôles portent donc sur UN fragment, dont on sait exactement
// où il doit tomber et ce qu'il doit lire, puis sur les invariants du nuage.
//
// LE PIÈGE DE LA MESURE EST ICI LA TEXTURE ELLE-MÊME. « Ça change quand je tourne le bouton » ne
// prouve rien : n'importe quel bruit change. Chaque champ est donc éprouvé sur ce qu'il doit
// déplacer ET sur ce qu'il ne doit pas toucher, comme pour le SSP de Koenig.
import { describe, expect, it } from "vitest";

import { deployer, lireChamp } from "./matrice-parametres";
import {
  FENETRES, compensationDeDensite, fenetre, partition, poserFragments, recouvrementMaximal, tirage,
  type Fragment,
} from "./micromontage";

const SR = 1000;

/** Une source d'une seconde dont l'échantillon vaut sa propre position : on lit où l'on a coupé. */
const rampe = (n = SR): Float32Array[] => [Float32Array.from({ length: n }, (_, i) => i / n)];

/** Une source silencieuse sauf une impulsion, pour voir où elle ressort. */
const impulsion = (ou: number, n = SR): Float32Array[] => {
  const x = new Float32Array(n);
  x[ou] = 1;
  return [x];
};

const frag = (p: Partial<Fragment> = {}): Fragment => ({
  source: 0, prise: 0, pose: 0, duree: 0.1, nuance: 1, pan: 0, transposition: 0, ...p,
});

const crete = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const premierNonNul = (x: Float32Array) => x.findIndex((v) => Math.abs(v) > 1e-9);
/** Où se trouve le sommet. Le premier échantillon d'un grain vaut zéro, la fenêtre y commençant. */
const sommet = (x: Float32Array) =>
  x.reduce((best, v, i) => (Math.abs(v) > Math.abs(x[best]) ? i : best), 0);

describe("les fenêtres", () => {
  it("TOUTES PARTENT DE ZÉRO ET REVIENNENT À ZÉRO : c'est ce qui empêche le grain de claquer", () => {
    for (const f of FENETRES) {
      expect(fenetre(f, 0), f).toBeCloseTo(0, 9);
      expect(fenetre(f, 1), f).toBeCloseTo(0, 9);
    }
  });

  it("aucune ne dépasse un ni ne descend sous zéro", () => {
    for (const f of FENETRES) {
      for (let t = 0; t <= 1; t += 0.01) {
        expect(fenetre(f, t), `${f} à ${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
        expect(fenetre(f, t), `${f} à ${t.toFixed(2)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("LES DEUX EXPONENTIELLES SONT L'UNE L'ENVERS DE L'AUTRE, et le temps y va dans l'autre sens", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(fenetre("expodec", t)).toBeCloseTo(fenetre("rexpodec", 1 - t), 9);
    }
    // L'une décroît, l'autre croît : c'est ce qui donne un sens au temps dans le grain.
    expect(fenetre("expodec", 0.2)).toBeGreaterThan(fenetre("expodec", 0.8));
    expect(fenetre("rexpodec", 0.2)).toBeLessThan(fenetre("rexpodec", 0.8));
  });

  it("le trapèze garde un plateau là où la gaussienne n'a qu'un sommet", () => {
    expect(fenetre("trapeze", 0.3)).toBe(1);
    expect(fenetre("trapeze", 0.7)).toBe(1);
    expect(fenetre("gaussienne", 0.3)).toBeLessThan(0.7);
  });
});

describe("où un fragment se pose", () => {
  it("LA POSE EST L'INSTANT DE SORTIE, à l'échantillon près", () => {
    const { canaux } = poserFragments([rampe()], [frag({ pose: 0.4, duree: 0.1 })],
      { forme: "trapeze", sampleRate: SR });
    // Le trapèze monte en un dixième de la durée : le premier échantillon non nul suit de peu.
    expect(premierNonNul(canaux[0])).toBeGreaterThanOrEqual(400);
    expect(premierNonNul(canaux[0])).toBeLessThan(410);
  });

  it("LA PRISE EST L'ENDROIT DE DÉCOUPE, et elle ne dépend pas de la pose", () => {
    // La source porte une impulsion au milieu ; on la prend là, et on la pose ailleurs.
    // L'impulsion est à la moitié de la source ; prise là, elle ressort à l'instant de la pose.
    // On lit le sommet et non le premier échantillon non nul : la fenêtre part de zéro, donc le
    // tout premier échantillon d'un grain est muet, ce qu'un autre contrôle exige.
    const { canaux } = poserFragments(
      [impulsion(500)], [frag({ prise: 0.5, pose: 0.2, duree: 0.05 })],
      { forme: "trapeze", sampleRate: SR });
    expect(sommet(canaux[0])).toBeGreaterThanOrEqual(200);
    expect(sommet(canaux[0])).toBeLessThan(205);
  });

  it("LA DURÉE POSÉE EST CELLE QU'ON ÉCRIT, la transposition ne l'allonge pas", () => {
    for (const t of [-12, 0, 12]) {
      const { canaux } = poserFragments([rampe()], [frag({ duree: 0.2, transposition: t })],
        { forme: "trapeze", sampleRate: SR });
      const dernier = canaux[0].reduce((m, v, i) => (Math.abs(v) > 1e-9 ? i : m), 0);
      expect(dernier, `${t} demi-tons`).toBeGreaterThan(180);
      expect(dernier, `${t} demi-tons`).toBeLessThanOrEqual(200);
    }
  });

  it("ET ELLE LIT PLUS DE SOURCE : une octave en lit deux fois plus", () => {
    // La source est une rampe : l'échantillon vaut sa position. La dernière valeur lue dit donc
    // jusqu'où l'on est allé dans la source.
    const sansRien = poserFragments([rampe()], [frag({ duree: 0.2, transposition: 0 })],
      { forme: "trapeze", sampleRate: SR });
    const uneOctave = poserFragments([rampe()], [frag({ duree: 0.2, transposition: 12 })],
      { forme: "trapeze", sampleRate: SR });
    expect(crete(uneOctave.canaux[0]) / crete(sansRien.canaux[0])).toBeCloseTo(2, 1);
  });

  it("un fragment posé au-delà de la fin n'est pas rendu, et le rapport le compte", () => {
    const { rapport } = poserFragments([rampe()], [frag({ duree: 0 }), frag({ nuance: 0 }), frag()],
      { forme: "trapeze", sampleRate: SR });
    expect(rapport.poses).toBe(1);
    expect(rapport.ignores).toBe(2);
  });

  it("DEUX FRAGMENTS AU MÊME INSTANT S'ADDITIONNENT, ils ne se remplacent pas", () => {
    const un = poserFragments([rampe()], [frag({ prise: 0.5 })], { forme: "trapeze", sampleRate: SR });
    const deux = poserFragments([rampe()], [frag({ prise: 0.5 }), frag({ prise: 0.5 })],
      { forme: "trapeze", sampleRate: SR });
    // La somme vaut deux, puis la compensation de densité la ramène par la racine du recouvrement :
    // deux divisé par racine de deux. S'ils se remplaçaient, le rapport serait INFÉRIEUR à un.
    expect(deux.rapport.recouvrementMoyen).toBeCloseTo(2, 1);
    expect(crete(deux.canaux[0]) / crete(un.canaux[0])).toBeCloseTo(Math.SQRT2, 5);
  });
});

describe("le panoramique", () => {
  it("À PUISSANCE CONSTANTE : au centre chaque voie reçoit 0,707, non un", () => {
    const { canaux } = poserFragments([rampe()], [frag({ prise: 0.9, pan: 0 })],
      { forme: "trapeze", sampleRate: SR });
    expect(crete(canaux[0])).toBeCloseTo(crete(canaux[1]), 9);
    const seul = poserFragments([rampe()], [frag({ prise: 0.9, pan: -1 })],
      { forme: "trapeze", sampleRate: SR });
    expect(crete(canaux[0]) / crete(seul.canaux[0])).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("tout à gauche ne laisse rien à droite, et réciproquement", () => {
    const g = poserFragments([rampe()], [frag({ prise: 0.9, pan: -1 })], { forme: "trapeze", sampleRate: SR });
    expect(crete(g.canaux[1])).toBeCloseTo(0, 9);
    const d = poserFragments([rampe()], [frag({ prise: 0.9, pan: 1 })], { forme: "trapeze", sampleRate: SR });
    expect(crete(d.canaux[0])).toBeCloseTo(0, 9);
  });
});

describe("plusieurs sources", () => {
  it("CHAQUE FRAGMENT COUPE DANS LA SIENNE, et c'est ce qui fait un montage", () => {
    const a = impulsion(100), b = impulsion(900);
    const { canaux } = poserFragments([a, b], [
      frag({ source: 0, prise: 0.1, pose: 0, duree: 0.05 }),
      frag({ source: 1, prise: 0.9, pose: 0.5, duree: 0.05 }),
    ], { forme: "trapeze", sampleRate: SR });
    // Le premier fragment coupe la source A a sa propre impulsion, le second la source B a la
    // sienne : deux sommets, l'un au debut, l'autre a l'instant de la seconde pose.
    expect(sommet(canaux[0].slice(0, 400))).toBeLessThan(5);
    expect(sommet(canaux[0].slice(400)) + 400).toBeGreaterThanOrEqual(500);
    expect(sommet(canaux[0].slice(400)) + 400).toBeLessThan(505);
  });

  it("une source qui n'existe pas retombe sur la première plutôt que de se taire", () => {
    const { rapport } = poserFragments([rampe()], [frag({ source: 7, prise: 0.5 })],
      { forme: "trapeze", sampleRate: SR });
    expect(rapport.poses).toBe(1);
  });
});

describe("le rapport", () => {
  it("il donne la densité et le recouvrement, de quoi juger avant d'écouter", () => {
    const fragments = Array.from({ length: 10 }, (_, i) => frag({ pose: i * 0.1, duree: 0.25 }));
    const { rapport } = poserFragments([rampe(2000)], fragments, { forme: "trapeze", sampleRate: SR });
    expect(rapport.poses).toBe(10);
    expect(rapport.duree).toBeCloseTo(1.15, 2);
    expect(rapport.densite).toBeCloseTo(10 / 1.15, 1);
    // Trois fragments de 0,25 s espacés de 0,1 s se chevauchent.
    expect(rapport.recouvrementMax).toBe(3);
    // Dix fragments de 0,25 s sur 1,15 s : deux et quelque en moyenne.
    expect(rapport.recouvrementMoyen).toBeCloseTo(2.17, 1);
  });

  it("deux fragments qui se touchent sans se recouvrir ne comptent pas pour deux", () => {
    expect(recouvrementMaximal([frag({ pose: 0, duree: 1 }), frag({ pose: 1, duree: 1 })])).toBe(1);
    expect(recouvrementMaximal([frag({ pose: 0, duree: 1 }), frag({ pose: 0.5, duree: 1 })])).toBe(2);
  });
});

describe("la compensation de densité", () => {
  it("LA DENSITÉ N'EST PAS UN SECOND BOUTON DE VOLUME, et c'est ce qu'elle empêche", () => {
    // Le témoin : la même matière, deux densités dans un rapport de quatre. Sans compensation, la
    // somme incohérente croîtrait comme la racine du recouvrement, donc du simple au double.
    const nuage = (combien: number) => {
      const h = tirage(5);
      return Array.from({ length: combien }, () => frag({
        prise: 0.1 + 0.8 * h(), pose: 2 * h(), duree: 0.05, nuance: 1, pan: 0,
      }));
    };
    const clair = poserFragments([rampe(2000)], nuage(40), { forme: "gaussienne", sampleRate: SR });
    const dense = poserFragments([rampe(2000)], nuage(160), { forme: "gaussienne", sampleRate: SR });
    const rapport = crete(dense.canaux[0]) / crete(clair.canaux[0]);
    // Quatre fois plus de fragments, et la crête reste dans un rapport de deux, non de quatre.
    expect(rapport).toBeLessThan(2);
    expect(dense.rapport.recouvrementMoyen).toBeGreaterThan(clair.rapport.recouvrementMoyen * 3);
  });

  it("elle vaut un quand rien ne se recouvre, et ne touche donc pas un montage clairsemé", () => {
    expect(compensationDeDensite(0.2)).toBe(1);
    expect(compensationDeDensite(1)).toBe(1);
    expect(compensationDeDensite(4)).toBeCloseTo(0.5, 9);
    expect(compensationDeDensite(16)).toBeCloseTo(0.25, 9);
  });

  it("un fragment seul sort à son niveau, sans être atténué", () => {
    const { canaux, rapport } = poserFragments([rampe()], [frag({ prise: 0.9, duree: 0.1, pan: -1 })],
      { forme: "trapeze", sampleRate: SR });
    expect(rapport.compensation).toBe(1);
    expect(crete(canaux[0])).toBeGreaterThan(0.9);
  });
});

describe("la partition, et son hasard", () => {
  it("UN CHAMP PLUS COURT RÉPÈTE SA DERNIÈRE VALEUR, il ne laisse pas de trou", () => {
    const p = partition({
      source: [0], prise: [0, 0.5], pose: [0, 1, 2], duree: [0.1],
      nuance: [1], pan: [0], transposition: [0],
    }, 4);
    expect(p.map((f) => f.prise)).toEqual([0, 0.5, 0.5, 0.5]);
    expect(p.map((f) => f.pose)).toEqual([0, 1, 2, 2]);
  });

  it("les valeurs hors bornes sont ramenées dedans plutôt que refusées", () => {
    const p = partition({
      source: [-3], prise: [5], pose: [-1], duree: [-2], nuance: [9], pan: [-9], transposition: [0],
    }, 1);
    expect(p[0]).toMatchObject({ source: 0, prise: 1, pose: 0, duree: 0, nuance: 1, pan: -1 });
  });

  it("LE TIRAGE REMPLIT L'INTERVALLE SANS ORDRE, là où la rampe le traverse dans l'ordre", () => {
    const rampeChamp = lireChamp("0:1")!;
    const hasardChamp = lireChamp("0~1")!;
    expect(rampeChamp.forme).toBe("rampe");
    expect(hasardChamp.forme).toBe("hasard");
    const range = deployer(rampeChamp, 20);
    const tire = deployer(hasardChamp, 20, tirage(7));
    // La rampe est croissante, le tirage ne l'est pas.
    expect(range.every((v, i) => i === 0 || v >= range[i - 1])).toBe(true);
    expect(tire.every((v, i) => i === 0 || v >= tire[i - 1])).toBe(false);
    for (const v of tire) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it("À GRAINE ÉGALE, LA MÊME PARTITION : sans cela elle ne se travaillerait pas", () => {
    const champ = lireChamp("0~1")!;
    expect(deployer(champ, 30, tirage(3))).toEqual(deployer(champ, 30, tirage(3)));
    expect(deployer(champ, 30, tirage(3))).not.toEqual(deployer(champ, 30, tirage(4)));
  });

  it("SANS GÉNÉRATEUR, UN CHAMP DE HASARD NE TIRE RIEN, et rend le milieu", () => {
    // Le garde-fou du changement : un appelant écrit avant cette forme ne peut pas se mettre à
    // rendre du hasard sans l'avoir demandé.
    expect(deployer(lireChamp("2~6")!, 3)).toEqual([4, 4, 4]);
  });
});
