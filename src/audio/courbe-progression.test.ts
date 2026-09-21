// audio/courbe-progression.test.ts — La progression qu'un paramètre appelle, et pourquoi le
// linéaire était le mauvais défaut.
//
// LE TEST QUI JUSTIFIE TOUT : UNE FRÉQUENCE SE PARCOURT EN MULTIPLIANT. Un balayage de 200 à
// 6000 Hz réparti linéairement met sa moitié à 3 100 Hz, si bien que l'octave 200-400 — la plus
// audible du trajet — occupe trois pour-cent de la course. Le balayage se précipite, puis
// s'arrête. Réparti logarithmiquement, sa moitié tombe à 1 095 Hz, et chaque tranche égale de
// courbe couvre le même nombre d'octaves. C'est cette dernière propriété qu'on exige, et non un
// chiffre : elle est la définition même de ce qu'on cherche.
//
// LE SECOND : LE DÉCIBEL NE DOIT PAS ÊTRE COURBÉ. Il décrit un rapport, mais il en est DÉJÀ le
// logarithme. Le traiter comme le hertz le courberait deux fois, et c'est la faute que l'on commet
// naturellement en voulant bien faire.
import { describe, expect, it } from "vitest";
import { estUniteMultiplicative, mettreEnForme, progressionPour, valeursParametre } from "./courbe";

const aux = (v: number[]) => Float32Array.from(v);
const octaves = (bas: number, haut: number) => Math.log2(haut / bas);

describe("la progression déduite du paramètre", () => {
  it("LE HERTZ ET LE BATTEMENT PAR MINUTE SE PARCOURENT EN MULTIPLIANT", () => {
    expect(progressionPour({ unite: "Hz" }).echelle).toBe("logarithmique");
    expect(progressionPour({ unite: "kHz" }).echelle).toBe("logarithmique");
    expect(progressionPour({ unite: "BPM" }).echelle).toBe("logarithmique");
  });

  it("LE DÉCIBEL ET LE DEMI-TON NON : ils sont déjà le logarithme d'un rapport", () => {
    // Les courber une seconde fois est la faute que l'on commet en voulant bien faire.
    expect(progressionPour({ unite: "dB" }).echelle).toBe("lineaire");
    expect(progressionPour({ unite: "demi-tons" }).echelle).toBe("lineaire");
  });

  it("tout le reste est linéaire, y compris une unité absente ou inconnue", () => {
    for (const unite of ["%", "s", "ms", "px", "°", "Q", "", undefined, "n'importe quoi"]) {
      expect(progressionPour({ unite }).echelle, String(unite)).toBe("lineaire");
    }
    expect(progressionPour(undefined).echelle).toBe("lineaire");
  });

  it("un pas d'un cran ou plus est repris, une finesse d'affichage ne l'est pas", () => {
    expect(progressionPour({ unite: "demi-tons", pas: 1 }).pas).toBe(1);
    expect(progressionPour({ unite: "Hz", pas: 10 }).pas).toBe(10);
    // Un dixième de décibel est la finesse du curseur, pas un cran que le son doive respecter :
    // l'imposer hacherait une modulation continue en escalier pour rien.
    expect(progressionPour({ unite: "dB", pas: 0.1 }).pas).toBeUndefined();
    expect(progressionPour({ unite: "%", pas: 0.5 }).pas).toBeUndefined();
  });
});

describe("l'échelle logarithmique", () => {
  it("CHAQUE TRANCHE ÉGALE DE COURBE COUVRE LE MÊME NOMBRE D'OCTAVES", () => {
    // C'est la définition de ce qu'on cherche, et non un chiffre à recopier.
    const v = mettreEnForme(aux([0, 0.25, 0.5, 0.75, 1]), { min: 200, max: 6400, echelle: "logarithmique" });
    const parTranche = [
      octaves(v[0], v[1]), octaves(v[1], v[2]), octaves(v[2], v[3]), octaves(v[3], v[4]),
    ];
    for (const o of parTranche) expect(o).toBeCloseTo(octaves(200, 6400) / 4, 5);
    // 200 à 6400 fait cinq octaves : chaque quart en couvre 1,25.
    expect(parTranche[0]).toBeCloseTo(1.25, 5);
  });

  it("les bornes restent exactement les bornes", () => {
    const v = mettreEnForme(aux([0, 1]), { min: 200, max: 6000, echelle: "logarithmique" });
    expect(v[0]).toBeCloseTo(200, 6);
    expect(v[1]).toBeCloseTo(6000, 6);
  });

  it("LE MILIEU EST LA MOYENNE GÉOMÉTRIQUE, là où le linéaire donnait l'arithmétique", () => {
    const log = mettreEnForme(aux([0.5]), { min: 200, max: 6000, echelle: "logarithmique" })[0];
    const lin = mettreEnForme(aux([0.5]), { min: 200, max: 6000 })[0];
    expect(log).toBeCloseTo(Math.sqrt(200 * 6000), 3);
    expect(log).toBeCloseTo(1095.4, 1);
    expect(lin).toBeCloseTo(3100, 3);
    // Le défaut mesuré : le linéaire place son milieu presque trois octaves trop haut.
    expect(octaves(log, lin)).toBeGreaterThan(1.4);
  });

  it("ELLE RETOMBE SUR LE LINÉAIRE PLUTÔT QUE DE RENDRE DES NaN", () => {
    // On ne multiplie pas à partir de zéro ni à travers zéro. Le faire quand même rendrait des
    // `NaN` sur toute la course, donc un silence là où l'on attendait un balayage.
    for (const bornes of [{ min: 0, max: 20000 }, { min: -12, max: 12 }, { min: -1, max: 0 }]) {
      const v = mettreEnForme(aux([0, 0.5, 1]), { ...bornes, echelle: "logarithmique" });
      for (const x of v) expect(Number.isFinite(x), JSON.stringify(bornes)).toBe(true);
      // Et elle rend exactement ce que le linéaire aurait rendu.
      expect(Array.from(v)).toEqual(Array.from(mettreEnForme(aux([0, 0.5, 1]), bornes)));
    }
  });

  it("une échelle descendante se parcourt aussi bien", () => {
    const v = mettreEnForme(aux([0, 0.5, 1]), { min: 6400, max: 200, echelle: "logarithmique" });
    expect(v[0]).toBeCloseTo(6400, 3);
    expect(v[1]).toBeCloseTo(Math.sqrt(6400 * 200), 3);
    expect(v[2]).toBeCloseTo(200, 3);
  });
});

describe("les crans", () => {
  it("le pas s'applique dans l'unité finale, et non sur la course de zéro à un", () => {
    // Un demi-ton est un demi-ton quelle que soit l'étendue du balayage : quantifier la course
    // donnerait des crans dont la taille dépendrait de la plage.
    const v = mettreEnForme(aux([0, 0.3, 0.55, 1]), { min: -12, max: 12, pas: 1 });
    for (const x of v) expect(Number.isInteger(x)).toBe(true);
    expect(Array.from(v)).toEqual([-12, -5, 1, 12]);
  });

  it("un pas nul ou absent ne quantifie rien", () => {
    const sans = mettreEnForme(aux([0.333]), { min: 0, max: 10 })[0];
    expect(mettreEnForme(aux([0.333]), { min: 0, max: 10, pas: 0 })[0]).toBe(sans);
    expect(sans).not.toBe(Math.round(sans));
  });

  it("le cran vaut aussi sur une échelle logarithmique", () => {
    const v = mettreEnForme(aux([0, 0.5, 1]), { min: 100, max: 10000, echelle: "logarithmique", pas: 10 });
    for (const x of v) expect(x % 10).toBeCloseTo(0, 6);
  });
});

describe("l'invariant, qui ne doit pas bouger", () => {
  it("SANS COURBE, LE SCALAIRE PASSE INTACT quelle que soit la progression", () => {
    // C'est la garantie du module : l'absence de courbe est une courbe constante, et aucun réglage
    // d'échelle ne doit la déplacer d'un bit.
    for (const forme of [
      { min: 200, max: 6000 },
      { min: 200, max: 6000, echelle: "logarithmique" as const },
      { min: 200, max: 6000, echelle: "logarithmique" as const, pas: 10 },
    ]) {
      const v = valeursParametre(null, 64, 1234.5, forme);
      expect(v.every((x) => x === 1234.5), JSON.stringify(forme)).toBe(true);
    }
  });

  it("une mise en forme sans échelle rend exactement ce qu'elle rendait", () => {
    // Le comportement d'avant est le défaut : les graphes enregistrés ne bougent pas.
    expect(Array.from(mettreEnForme(aux([0, 0.5, 1]), { min: 200, max: 4000 })))
      .toEqual([200, 2100, 4000]);
  });
});

describe("la source unique de l'échelle", () => {
  it("L'INSPECTEUR ET LE CALCUL RÉPONDENT LA MÊME CHOSE, sur toutes les unités du catalogue", () => {
    // Deux endroits décidaient séparément : l'inspecteur traçait un curseur logarithmique sur la
    // seule comparaison à « Hz », pendant que la modulation du même paramètre en kilohertz le
    // parcourait logarithmiquement. Le prédicat est désormais partagé, et ce test le tient.
    for (const unite of ["Hz", "kHz", "BPM", "dB", "%", "s", "ms", "demi-tons", "", undefined]) {
      expect(estUniteMultiplicative(unite), String(unite))
        .toBe(progressionPour({ unite }).echelle === "logarithmique");
    }
  });

  it("les espaces autour d'une unité ne la rendent pas méconnaissable", () => {
    expect(estUniteMultiplicative(" Hz ")).toBe(true);
    expect(estUniteMultiplicative("hz")).toBe(false);
  });
});
