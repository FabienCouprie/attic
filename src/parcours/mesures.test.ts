// parcours/mesures.test.ts — L'examinateur, éprouvé sur des sons dont on connaît la réponse.
//
// LE TEST QUI COMPTE EST CELUI DE LA PHRASE DE VERDICT. Une épreuve ratée doit montrer le chiffre
// mesuré : c'est la seule chose qui permette à l'élève de corriger, et c'est ce qui distingue un
// examinateur d'un videur. « La sonie atteint −16 LUFS — mesuré : −24,3 LUFS » enseigne ; « raté »
// n'enseigne rien.
//
// LE SECOND : L'ÉQUILIBRE SE JUGE EN VALEUR ABSOLUE. Trois décibels de trop à droite est le même
// défaut que trois à gauche, et une épreuve qui n'aurait relevé que l'un des deux côtés aurait
// laissé passer la moitié des mixages déséquilibrés — en donnant l'impression d'avoir vérifié.
import { describe, expect, it } from "vitest";
import { cibleTenue, jugerCibles, mesurerCopie, partsDeBande, valeurJugee, type SonSoumis } from "./mesures";
import type { Cible } from "./types";

const SR = 44100;

/** Un son d'essai : autant de canaux que de fonctions données. */
function son(dureeSec: number, ...canaux: ((t: number) => number)[]): SonSoumis {
  const n = Math.round(dureeSec * SR);
  const donnees = canaux.map((f) => {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = f(i / SR);
    return x;
  });
  return {
    sampleRate: SR, numberOfChannels: donnees.length, length: n,
    getChannelData: (c: number) => donnees[c],
  };
}

const sinus = (hz: number, amplitude = 0.5) => (t: number) => amplitude * Math.sin(2 * Math.PI * hz * t);

describe("ce qu'on mesure d'un son", () => {
  it("la durée et les canaux, sans discussion", () => {
    const m = mesurerCopie(son(2.5, sinus(440)));
    expect(m.dureeSec).toBeCloseTo(2.5, 6);
    expect(m.canaux).toBe(1);
  });

  it("un mono est corrélé à un et parfaitement équilibré, par convention", () => {
    const m = mesurerCopie(son(1, sinus(440)));
    expect(m.correlation).toBe(1);
    expect(m.equilibreDb).toBe(0);
  });

  it("deux canaux identiques : corrélation un ; en opposition : moins un", () => {
    expect(mesurerCopie(son(1, sinus(440), sinus(440))).correlation).toBeCloseTo(1, 3);
    expect(mesurerCopie(son(1, sinus(440), sinus(440, -0.5))).correlation).toBeCloseTo(-1, 3);
  });

  it("un canal deux fois plus fort donne six décibels d'écart", () => {
    const m = mesurerCopie(son(1, sinus(440, 0.5), sinus(440, 0.25)));
    expect(m.equilibreDb).toBeCloseTo(6.02, 1);
  });

  it("la crête et la sonie restent dans le domaine du plausible pour une sinusoïde à moitié", () => {
    const m = mesurerCopie(son(1, sinus(440)));
    expect(m.creteDb).toBeCloseTo(-6, 1);
    expect(m.lufs).toBeGreaterThan(-30);
    expect(m.lufs).toBeLessThan(0);
    expect(Number.isFinite(m.vraiPicDb)).toBe(true);
  });
});

describe("où est l'énergie", () => {
  it("un grave profond est presque entièrement sous deux cents hertz", () => {
    const { gravePc, aiguPc } = partsDeBande(son(1, sinus(50)));
    expect(gravePc).toBeGreaterThan(95);
    expect(aiguPc).toBeLessThan(1);
  });

  it("un aigu, l'inverse", () => {
    const { gravePc, aiguPc } = partsDeBande(son(1, sinus(8000)));
    expect(aiguPc).toBeGreaterThan(95);
    expect(gravePc).toBeLessThan(1);
  });

  it("un son entre les deux ne compte ni d'un côté ni de l'autre", () => {
    const { gravePc, aiguPc } = partsDeBande(son(1, sinus(1000)));
    expect(gravePc + aiguPc).toBeLessThan(5);
  });

  it("UN SON TROP COURT NE REÇOIT PAS DE MESURE INVENTÉE", () => {
    expect(partsDeBande(son(0.01, sinus(50)))).toEqual({ gravePc: 0, aiguPc: 0 });
  });

  it("le silence ne divise pas par zéro", () => {
    expect(partsDeBande(son(1, () => 0))).toEqual({ gravePc: 0, aiguPc: 0 });
  });
});

describe("la hauteur et la justesse", () => {
  it("un la 440 est reconnu, et déclaré juste", () => {
    const m = mesurerCopie(son(1, sinus(440)));
    expect(m.hauteurHz).toBeGreaterThan(430);
    expect(m.hauteurHz).toBeLessThan(450);
    expect(m.justesseCents).toBeLessThan(10);
    expect(m.partVoiseePc).toBeGreaterThan(50);
  });

  it("UN SON ENTRE DEUX DEMI-TONS EST DÉCLARÉ FAUX, et de combien", () => {
    // 453 Hz tombe à un demi-ton moins cinquante cents du la : le pire écart possible.
    const m = mesurerCopie(son(1, sinus(453)));
    expect(m.justesseCents).toBeGreaterThan(35);
    expect(m.justesseCents).toBeLessThanOrEqual(50);
  });

  it("une octave plus bas reste juste : l'écart se compte en cents, non en hertz", () => {
    expect(mesurerCopie(son(1, sinus(220))).justesseCents).toBeLessThan(10);
  });

  it("LE SILENCE N'A PAS DE HAUTEUR, et n'en reçoit pas une inventée", () => {
    const m = mesurerCopie(son(1, () => 0));
    expect(m.hauteurHz).toBe(0);
    expect(Number.isNaN(m.justesseCents)).toBe(true);
    expect(m.partVoiseePc).toBe(0);
  });

  it("un son trop court pour une période ne fait pas lever", () => {
    const m = mesurerCopie(son(0.01, sinus(440)));
    expect(m.hauteurHz).toBe(0);
  });
});

describe("le verdict d'une épreuve", () => {
  const exigeSonie: Cible = { grandeur: "lufs", min: -16, exigence: "la sonie atteint −16 LUFS", exigenceEn: "loudness reaches -16 LUFS" };

  it("PORTE LE CHIFFRE MESURÉ, réussie ou ratée", () => {
    const [p] = jugerCibles([exigeSonie], mesurerCopie(son(1, sinus(440, 0.001))));
    expect(p.satisfait).toBe(false);
    expect(p.texte).toContain("la sonie atteint −16 LUFS — mesuré : −");
    expect(p.texteEn).toContain("measured: -");
  });

  it("une cible tenue se coche", () => {
    const [p] = jugerCibles([exigeSonie], mesurerCopie(son(1, sinus(440, 0.5))));
    expect(p.satisfait).toBe(true);
  });

  it("sans rien de branché, il le dit plutôt que de juger", () => {
    const [p] = jugerCibles([exigeSonie], null);
    expect(p.satisfait).toBe(false);
    expect(p.texte).toContain("Son à mesurer");
    expect(p.texteEn).toContain("Sound to measure");
  });

  it("les bornes sont inclusives des deux côtés", () => {
    const m = mesurerCopie(son(2, sinus(440)));
    expect(cibleTenue({ grandeur: "duree", min: 2, max: 2, exigence: "", exigenceEn: "" }, m)).toBe(true);
    expect(cibleTenue({ grandeur: "duree", max: 1.99, exigence: "", exigenceEn: "" }, m)).toBe(false);
  });

  it("SANS HAUTEUR TENUE, une épreuve de justesse le dit au lieu de juger", () => {
    const juste: Cible = { grandeur: "justesse", max: 10, exigence: "juste", exigenceEn: "in tune" };
    const [p] = jugerCibles([juste], mesurerCopie(son(1, () => 0)));
    expect(p.satisfait).toBe(false);
    expect(p.texte).toContain("aucune hauteur tenue");
    expect(p.texteEn).toContain("no sustained pitch");
  });

  it("L'ÉQUILIBRE SE JUGE EN VALEUR ABSOLUE : les deux côtés sont le même défaut", () => {
    const gauche = mesurerCopie(son(1, sinus(440, 0.5), sinus(440, 0.25)));
    const droite = mesurerCopie(son(1, sinus(440, 0.25), sinus(440, 0.5)));
    expect(valeurJugee(gauche, "equilibre")).toBeCloseTo(valeurJugee(droite, "equilibre"), 3);
    const serre: Cible = { grandeur: "equilibre", max: 1.5, exigence: "", exigenceEn: "" };
    expect(cibleTenue(serre, gauche)).toBe(false);
    expect(cibleTenue(serre, droite)).toBe(false);
  });
});
