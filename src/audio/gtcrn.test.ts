// audio/gtcrn.test.ts — L'analyse/synthèse autour du modèle GTCRN.
//
// Le modèle lui-même n'est pas testé ici : il est vérifié par comparaison avec la
// sortie de référence que le dépôt amont publie (−71 dB d'erreur relative au
// signal, écart maximal 0,00003), ce qu'un test unitaire ne peut pas rejouer sans
// embarquer 0,5 Mo de poids et un moteur d'inférence.
//
// Ce qui est testé ici est la partie qui se trompe en silence : le fenêtrage, le
// cadrage et le recouvrement. Une erreur là dégrade le son de façon diffuse —
// début atténué, bourdonnement à 62,5 Hz au rythme des trames, niveau global
// faux — sans jamais lever d'exception.
import { describe, it, expect } from "vitest";
import {
  fenetreRacineHann, cadrerParReflexion, nombreDeTrames, debruiterParTrames,
  rapportSignalBruit, planchecherDeBruit,
  GTCRN_NFFT, GTCRN_HOP, GTCRN_BINS, GTCRN_SAMPLE_RATE,
} from "./gtcrn";

/** Modèle factice : rend la trame telle quelle. */
const identite = async (spectre: Float32Array) => spectre;

const sinus = (n: number, freq: number, sr = GTCRN_SAMPLE_RATE) => {
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr);
  return s;
};

describe("la fenêtre", () => {
  it("est la racine d'une Hann", () => {
    const w = fenetreRacineHann(8);
    for (let i = 0; i < 8; i++) {
      expect(w[i] ** 2).toBeCloseTo(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 8), 6);
    }
  });

  it("au carré, somme exactement à 1 avec un recouvrement de moitié", () => {
    // C'est la raison d'être de la racine de Hann, et ce qui dispense de
    // normaliser la somme des fenêtres : analyse × synthèse = Hann, et deux
    // Hann décalées d'une demi-fenêtre se complètent.
    const n = GTCRN_NFFT, hop = GTCRN_HOP;
    const w = fenetreRacineHann(n);
    for (let i = 0; i < hop; i++) {
      expect(w[i] ** 2 + w[i + hop] ** 2, `échantillon ${i}`).toBeCloseTo(1, 6);
    }
  });
});

describe("le cadrage centré", () => {
  it("ajoute une réflexion de chaque côté", () => {
    const s = Float32Array.from([1, 2, 3, 4, 5]);
    const c = cadrerParReflexion(s, 2);
    expect(c.length).toBe(9);
    expect([...c.subarray(0, 2)]).toEqual([3, 2]);   // réflexion avant
    expect([...c.subarray(2, 7)]).toEqual([1, 2, 3, 4, 5]);
    expect([...c.subarray(7)]).toEqual([4, 3]);       // réflexion arrière
  });

  it("ne déborde pas sur un signal plus court que le remplissage", () => {
    // Un extrait de quelques dizaines d'échantillons ne doit pas produire de NaN.
    const c = cadrerParReflexion(Float32Array.from([1, 2]), 4);
    expect(c.length).toBe(10);
    expect([...c].every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("le compte de trames", () => {
  it("suit la formule de torch.stft centré", () => {
    // 1 s à 16 kHz : (16000 + 512 - 512) / 256 + 1 = 63 trames.
    expect(nombreDeTrames(GTCRN_SAMPLE_RATE)).toBe(63);
    expect(nombreDeTrames(0)).toBe(1);
  });
});

describe("reconstruction parfaite", () => {
  // LE test qui compte : avec un modèle qui ne touche à rien, la chaîne complète
  // doit rendre le signal d'entrée. Toute faute de fenêtrage, de cadrage ou de
  // recouvrement se voit ici, et nulle part ailleurs sans écouter.
  it("rend un sinus inchangé", async () => {
    const s = sinus(8000, 440);
    const r = await debruiterParTrames(s, identite);
    expect(r.length).toBe(s.length);
    expect(rapportSignalBruit(s, r)).toBeGreaterThan(100);
  });

  it("rend du bruit blanc inchangé", async () => {
    // Le bruit couvre tout le spectre : un défaut de fenêtre qui épargnerait un
    // sinus pur ne lui échappe pas.
    const s = new Float32Array(6000);
    let graine = 12345;
    for (let i = 0; i < s.length; i++) {
      graine = (graine * 1103515245 + 12345) & 0x7fffffff;
      s[i] = (graine / 0x3fffffff) - 1;
    }
    const r = await debruiterParTrames(s, identite);
    expect(rapportSignalBruit(s, r)).toBeGreaterThan(100);
  });

  it("n'atténue pas le DÉBUT du signal", async () => {
    // Sans cadrage centré, les premiers 256 échantillons ressortent affaiblis :
    // la faute la plus courante, et la plus discrète puisque le reste est juste.
    const s = sinus(4000, 300);
    const r = await debruiterParTrames(s, identite);
    const rms = (a: Float32Array, d: number, f: number) => {
      let x = 0; for (let i = d; i < f; i++) x += a[i] * a[i];
      return Math.sqrt(x / (f - d));
    };
    expect(rms(r, 0, 256) / rms(s, 0, 256)).toBeCloseTo(1, 3);
  });

  it("n'atténue pas la FIN du signal", async () => {
    const s = sinus(4000, 300);
    const r = await debruiterParTrames(s, identite);
    const n = s.length;
    const rms = (a: Float32Array, d: number, f: number) => {
      let x = 0; for (let i = d; i < f; i++) x += a[i] * a[i];
      return Math.sqrt(x / (f - d));
    };
    expect(rms(r, n - 256, n) / rms(s, n - 256, n)).toBeCloseTo(1, 2);
  });
});

describe("le spectre passé au modèle", () => {
  it("a 257 bins, parties réelle et imaginaire entrelacées", async () => {
    let vu: Float32Array | null = null;
    await debruiterParTrames(sinus(2000, 440), async (s) => { vu = s; return s; });
    expect(vu!.length).toBe(GTCRN_BINS * 2);
  });

  it("place bien l'énergie d'un sinus sur son bin", async () => {
    // 16000 / 512 = 31,25 Hz par bin ; 1000 Hz tombe sur le bin 32.
    const spectres: Float32Array[] = [];
    await debruiterParTrames(sinus(4000, 1000), async (s) => { spectres.push(s.slice()); return s; });
    const milieu = spectres[Math.floor(spectres.length / 2)];
    const module = (k: number) => Math.hypot(milieu[k * 2], milieu[k * 2 + 1]);
    const plusFort = Array.from({ length: GTCRN_BINS }, (_, k) => k)
      .reduce((a, b) => (module(b) > module(a) ? b : a), 0);
    expect(plusFort).toBe(32);
  });
});

describe("le dosage", () => {
  it("à force nulle, rend l'entrée exactement", async () => {
    // Un modèle qui met tout à zéro : à force 0, le signal doit survivre intact.
    const s = sinus(3000, 500);
    const muet = async () => new Float32Array(GTCRN_BINS * 2);
    const r = await debruiterParTrames(s, muet, { force: 0 });
    expect([...r]).toEqual([...s]);
  });

  it("à force 1, ne garde que la sortie du modèle", async () => {
    const s = sinus(3000, 500);
    const muet = async () => new Float32Array(GTCRN_BINS * 2);
    const r = await debruiterParTrames(s, muet, { force: 1 });
    expect(Math.max(...r.map(Math.abs))).toBeLessThan(1e-6);
  });

  it("à mi-force, atténue de moitié ce que le modèle a retiré", async () => {
    const s = sinus(3000, 500);
    const muet = async () => new Float32Array(GTCRN_BINS * 2);
    const r = await debruiterParTrames(s, muet, { force: 0.5 });
    for (let i = 100; i < 200; i++) expect(r[i]).toBeCloseTo(s[i] * 0.5, 5);
  });

  it("borne une force hors plage", async () => {
    const s = sinus(1500, 500);
    const r = await debruiterParTrames(s, identite, { force: 5 });
    expect(rapportSignalBruit(s, r)).toBeGreaterThan(100);
  });
});

describe("progression", () => {
  it("avance de 0 à 1 et finit à 1", async () => {
    const vues: number[] = [];
    await debruiterParTrames(sinus(20000, 440), identite, { surProgres: (f) => vues.push(f) });
    expect(vues.length).toBeGreaterThan(1);
    expect(vues[vues.length - 1]).toBeCloseTo(1, 6);
    expect(vues.every((v, i) => i === 0 || v >= vues[i - 1])).toBe(true);
  });
});

describe("plancher de bruit", () => {
  it("mesure le plancher et non le niveau global", async () => {
    // Le chiffre que le nœud affiche. Sur un signal fait d'une partie forte et
    // d'une partie calme, le plancher doit suivre la partie CALME : c'est ce qui
    // permet de voir qu'un débruitage a agi alors que le niveau global, dominé
    // par la parole qu'on préserve, bouge à peine.
    const n = 16000;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = (i < n / 2 ? 0.5 : 0.01) * Math.sin(i * 0.1);
    const plancher = planchecherDeBruit(s);
    let global = 0;
    for (let i = 0; i < n; i++) global += s[i] * s[i];
    global = Math.sqrt(global / n);
    expect(plancher).toBeLessThan(global / 10);
    expect(plancher).toBeGreaterThan(0);
  });

  it("rend zéro sur un silence", () => {
    expect(planchecherDeBruit(new Float32Array(1000))).toBe(0);
  });

  it("ne plante pas sur un signal plus court qu'une trame", () => {
    expect(planchecherDeBruit(new Float32Array(10))).toBe(0);
    expect(planchecherDeBruit(new Float32Array(0))).toBe(0);
  });
});

describe("rapportSignalBruit", () => {
  it("rend l'infini pour deux signaux identiques", () => {
    const s = sinus(500, 440);
    expect(rapportSignalBruit(s, s)).toBe(Infinity);
  });

  it("chute de 6 dB quand l'erreur double", () => {
    const s = sinus(2000, 440);
    const bruite = (k: number) => {
      const b = new Float32Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s[i] + k * Math.sin(i * 1.7);
      return b;
    };
    const a = rapportSignalBruit(s, bruite(0.01));
    const b = rapportSignalBruit(s, bruite(0.02));
    expect(a - b).toBeCloseTo(6.02, 1);
  });
});
