// audio/retard-granulaire.test.ts — Ce que la ligne, les grains et la boucle doivent faire.
//
// LE TÉMOIN DE CE MODULE EST L'ESCALIER DE HAUTEUR, et il est choisi pour ce qu'il écarte. Qu'un
// retard granulaire « fasse un beau flou » ne prouve rien : une réverbération en fait un aussi, et
// un écho dont on granule la sortie une seule fois en ferait un troisième. Ce qui ne se produit
// qu'ici est la REGRANULATION : un grain transposé, réinjecté dans la ligne, ressort transposé une
// fois de plus, et la hauteur monte par paliers dont le rapport est celui de la transposition.
// Le cas de contrôle est le même rendu à réinjection nulle, où le second palier doit être absent.
import { describe, expect, it } from "vitest";
import { retardGranulaire, retardMaximal, toursAudibles } from "./retard-granulaire";
import { hauteurMediane, suivreHauteur } from "./hauteur";

const SR = 16000;

/** Une salve sinusoïdale au début, puis le silence : plus courte que le retard, les paliers se séparent. */
function salve(hertz: number, dureeSalve: number, duree: number): Float32Array {
  const x = new Float32Array(Math.round(duree * SR));
  const n = Math.round(dureeSalve * SR);
  for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * hertz * i) / SR);
  return x;
}

/** Du bruit de niveau tenu, pour juger un niveau plutôt qu'une hauteur. */
function bruit(graine: number, duree: number, dureeSon = duree): Float32Array {
  let etat = graine >>> 0;
  const x = new Float32Array(Math.round(duree * SR));
  const n = Math.round(dureeSon * SR);
  for (let i = 0; i < n; i++) {
    etat = (etat * 1103515245 + 12345) >>> 0;
    x[i] = ((etat / 4294967296) * 2 - 1) * 0.4;
  }
  return x;
}

const tranche = (x: Float32Array, de: number, a: number) =>
  x.subarray(Math.round(de * SR), Math.round(a * SR));

const efficace = (x: Float32Array) => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
};

/** La hauteur d'une tranche, par le suiveur du dépôt. */
const hauteurDe = (x: Float32Array) =>
  hauteurMediane(suivreHauteur(x, SR, { fMin: 300, fMax: 1200, cadence: 200 }));

const REGLAGES = {
  sampleRate: SR, temps: 0.25, dispersion: 0, taille: 0.08, densite: 25,
  fenetre: "trapeze" as const, graine: 7, melange: 1,
};

describe("le retard granulaire", () => {
  it("NE REND RIEN AVANT SON RETARD : la ligne est vide, les grains y lisent le silence", () => {
    const { sortie } = retardGranulaire(salve(440, 0.1, 1), { ...REGLAGES, reinjection: 0 });
    // Le premier grain qui atteint le début du son est lancé à « temps » moins une durée de grain.
    expect(efficace(tranche(sortie, 0, 0.16))).toBe(0);
    expect(efficace(tranche(sortie, 0.26, 0.32))).toBeGreaterThan(0.01);
  });

  it("LA HAUTEUR MONTE PAR PALIERS GÉOMÉTRIQUES, un par tour de boucle", () => {
    const { sortie } = retardGranulaire(
      salve(440, 0.1, 1.2), { ...REGLAGES, transposition: 3, reinjection: 0.6 });
    const rapport = Math.pow(2, 3 / 12);
    const paliers = [
      hauteurDe(tranche(sortie, 0.26, 0.32)),
      hauteurDe(tranche(sortie, 0.52, 0.58)),
      hauteurDe(tranche(sortie, 0.77, 0.83)),
    ];
    // Chaque palier est l'entrée transposée autant de fois qu'elle a fait de tours.
    paliers.forEach((h, k) => {
      const attendue = 440 * Math.pow(rapport, k + 1);
      expect(Math.abs(h - attendue) / attendue,
        `palier ${k + 1} : ${h.toFixed(1)} Hz pour ${attendue.toFixed(1)} attendus`)
        .toBeLessThan(0.04);
    });
  });

  it("ET SANS RÉINJECTION LE SECOND PALIER N'EXISTE PAS : c'est le cas de contrôle", () => {
    const { sortie } = retardGranulaire(
      salve(440, 0.1, 1.2), { ...REGLAGES, transposition: 3, reinjection: 0 });
    expect(efficace(tranche(sortie, 0.26, 0.32))).toBeGreaterThan(0.01);
    // Un seul tour : au second retard, la ligne ne porte plus rien.
    expect(efficace(tranche(sortie, 0.52, 0.58))).toBeLessThan(1e-6);
  });

  it("LA DENSITÉ NE MONTE JAMAIS LE NIVEAU, et le fait baisser selon la loi de la moyenne", () => {
    // LE RELEVÉ NE PORTE QUE SUR LE RÉGIME DE RECOUVREMENT, et la raison est dans la grandeur
    // mesurée. Au-dessous d'un grain à la fois — moins de 12,5 grains par seconde pour une durée
    // de 80 ms — le flux est intermittent par nature : la valeur efficace y mesure le rapport
    // cyclique et non le niveau, et un relevé qui l'y inclurait reprocherait à la compensation un
    // silence qui est ce que la densité veut dire à cet endroit. C'est aussi le régime du relevé
    // du micromontage, cent à mille six cents fragments.
    // LE RELEVÉ SE FAIT SUR DES GRAINS DÉCORRÉLÉS, et c'est là qu'il porte quelque chose. À
    // dispersion et transposition nulles les grains lisent la même position de la ligne, et la
    // normalisation rend alors l'entrée retardée exactement : le niveau ne peut pas bouger, et un
    // relevé fait là serait vide. Un écart de retard et une transposition les séparent, et c'est
    // ce cas-là que le diviseur doit tenir.
    //
    // CE QUE LE DIVISEUR PROMET, ET CE QU'IL NE PROMET PAS. Diviser par la somme des fenêtres
    // revient à MOYENNER les grains actifs : la moyenne de n signaux indépendants a la variance
    // divisée par n, de sorte que le niveau baisse comme la racine du recouvrement. C'est le prix
    // du seul diviseur qui ne puisse pas écrêter, et il est contractualisé ici comme une loi plutôt
    // que toléré comme une marge : un retour au diviseur en racine ferait monter le niveau avec la
    // densité, ce que la première assertion refuse.
    const densites = [15, 40, 160];
    const niveaux = densites.map((densite) => {
      const { sortie } = retardGranulaire(
        bruit(3, 1), { ...REGLAGES, densite, dispersion: 0.05, transposition: 5, reinjection: 0 });
      return 20 * Math.log10(Math.max(1e-12, efficace(tranche(sortie, 0.3, 0.9))));
    });
    const releve = densites.map((d, k) => `${d}/s : ${niveaux[k].toFixed(2)} dB`).join(" · ");
    // Jamais vers le haut : c'est l'écrêtage que cela écarte.
    expect(niveaux[1], releve).toBeLessThan(niveaux[0]);
    expect(niveaux[2], releve).toBeLessThan(niveaux[1]);
    // Et la baisse est celle de la moyenne, à un demi-décibel près.
    for (let k = 1; k < densites.length; k++) {
      const attendu = -10 * Math.log10(densites[k] / densites[k - 1]);
      const mesure = niveaux[k] - niveaux[k - 1];
      expect(Math.abs(mesure - attendu),
        `${densites[k - 1]}/s vers ${densites[k]}/s : ${mesure.toFixed(2)} dB pour ${attendu.toFixed(2)} attendus`)
        .toBeLessThan(0.5);
    }
  });

  it("À DISPERSION ET TRANSPOSITION NULLES, CE QUI SORT EST L'ENTRÉE RETARDÉE", () => {
    // C'est ce que la normalisation par la somme des fenêtres achète, et aucun autre diviseur ne
    // le donne : un retard granulaire sans écart ni transposition est un retard tout court.
    const entree = bruit(23, 1);
    const D = 0.25;
    const { sortie } = retardGranulaire(entree, {
      ...REGLAGES, temps: D, dispersion: 0, transposition: 0, reinjection: 0, densite: 25,
    });
    let pire = 0;
    const de = Math.round((D + 0.1) * SR);
    const a = Math.round(0.9 * SR);
    for (let i = de; i < a; i++) pire = Math.max(pire, Math.abs(sortie[i] - entree[i - Math.round(D * SR)]));
    expect(pire, `écart maximal ${pire.toExponential(2)}`).toBeLessThan(1e-9);
  });

  it("ET LA CRÊTE NE MONTE PAS JUSQU'À L'ÉCRÊTAGE à forte densité", () => {
    const { sortie } = retardGranulaire(
      bruit(3, 1), { ...REGLAGES, densite: 160, reinjection: 0.5 });
    let crete = 0;
    for (let i = 0; i < sortie.length; i++) crete = Math.max(crete, Math.abs(sortie[i]));
    expect(crete, `crête ${(20 * Math.log10(crete)).toFixed(2)} dB`).toBeLessThan(1);
  });

  it("UN GRAIN QUI RATTRAPERAIT LA TÊTE D'ÉCRITURE EST BORNÉ, et le rapport le dit", () => {
    // Une octave au-dessus lit deux fois plus vite : la course vaut le retard lui-même.
    const court = retardGranulaire(
      bruit(5, 1), { ...REGLAGES, temps: 0.02, transposition: 12, reinjection: 0 });
    expect(court.rapport.bornes).toBeGreaterThan(0);
    // Au même pas de lecture, un retard long laisse la durée entière.
    const long = retardGranulaire(
      bruit(5, 1), { ...REGLAGES, temps: 0.5, transposition: 12, reinjection: 0 });
    expect(long.rapport.bornes).toBe(0);
    // Et vers le bas, un grain prend du retard : aucune course à borner.
    const bas = retardGranulaire(
      bruit(5, 1), { ...REGLAGES, temps: 0.02, transposition: -12, reinjection: 0 });
    expect(bas.rapport.bornes).toBe(0);
  });

  it("AU GEL, LA LIGNE CESSE D'ÊTRE ALIMENTÉE et les grains n'y lisent plus que son contenu", () => {
    const entree = bruit(11, 1.5, 0.3);
    const libre = retardGranulaire(entree, { ...REGLAGES, temps: 0.2, reinjection: 0, gel: false });
    const gele = retardGranulaire(entree, { ...REGLAGES, temps: 0.2, reinjection: 0, gel: true });
    // Passé la fin du son, la ligne libre ne porte plus que du silence.
    expect(efficace(tranche(libre.sortie, 1.2, 1.5))).toBeLessThan(1e-6);
    // La ligne gelée tient le début du son et le fait tourner.
    expect(efficace(tranche(gele.sortie, 1.2, 1.5))).toBeGreaterThan(0.01);
  });

  it("À MÉLANGE NUL, LA SORTIE EST L'ENTRÉE, au bit près", () => {
    const entree = bruit(13, 0.6);
    const { sortie } = retardGranulaire(
      entree, { ...REGLAGES, melange: 0, transposition: 5, reinjection: 0.5 });
    expect(Array.from(sortie)).toEqual(Array.from(entree));
  });

  it("UNE COURBE PLATE REND EXACTEMENT CE QUE REND LE RÉGLAGE, au bit près", () => {
    const entree = salve(440, 0.1, 0.8);
    const n = entree.length;
    // LES VALEURS SONT DYADIQUES, ET IL FAUT LE DIRE : un tableau est en simple précision, de
    // sorte qu'une courbe plate à 0,05 ne porte pas le même nombre que le réglage à 0,05. Seules
    // les fractions dyadiques se comparent exactement, et l'invariant qui compte est que SANS
    // courbe rien ne bouge.
    const fixe = retardGranulaire(entree, {
      ...REGLAGES, temps: 0.25, dispersion: 0.0625, transposition: 5, reinjection: 0.5, melange: 0.5,
    });
    const plate = retardGranulaire(entree, {
      ...REGLAGES,
      temps: new Float32Array(n).fill(0.25),
      dispersion: new Float32Array(n).fill(0.0625),
      transposition: new Float32Array(n).fill(5),
      reinjection: new Float32Array(n).fill(0.5),
      melange: new Float32Array(n).fill(0.5),
    });
    expect(Array.from(plate.sortie)).toEqual(Array.from(fixe.sortie));
    expect(plate.rapport.ligne).toBe(fixe.rapport.ligne);
  });

  it("UNE COURBE QUI VARIE NE REND PAS CE QUE REND SA PREMIÈRE VALEUR", () => {
    const entree = salve(440, 0.1, 0.8);
    const n = entree.length;
    const montante = new Float32Array(n);
    for (let i = 0; i < n; i++) montante[i] = (12 * i) / n;
    const tenue = retardGranulaire(entree, { ...REGLAGES, transposition: new Float32Array(n), reinjection: 0.4 });
    const variee = retardGranulaire(entree, { ...REGLAGES, transposition: montante, reinjection: 0.4 });
    expect(Array.from(variee.sortie)).not.toEqual(Array.from(tenue.sortie));

    // La même exigence sur la dispersion, et elle vaut d'être éprouvée à part : son tirage passe
    // par le générateur, de sorte qu'une courbe lue à son seul premier point donnerait un
    // étalement nul partout et un rendu indiscernable de celui d'un retard sans écart.
    const etalement = new Float32Array(n);
    for (let i = 0; i < n; i++) etalement[i] = (0.2 * i) / n;
    const sans = retardGranulaire(entree, { ...REGLAGES, dispersion: new Float32Array(n), reinjection: 0.4 });
    const avec = retardGranulaire(entree, { ...REGLAGES, dispersion: etalement, reinjection: 0.4 });
    expect(Array.from(avec.sortie)).not.toEqual(Array.from(sans.sortie));
  });

  it("À GRAINE ÉGALE, LE MÊME RENDU ; à graine différente, un autre tirage", () => {
    const entree = bruit(17, 0.8);
    const o = { ...REGLAGES, dispersion: 0.05, reinjection: 0.3 };
    const a = retardGranulaire(entree, { ...o, graine: 42 });
    const b = retardGranulaire(entree, { ...o, graine: 42 });
    const c = retardGranulaire(entree, { ...o, graine: 43 });
    expect(Array.from(a.sortie)).toEqual(Array.from(b.sortie));
    expect(Array.from(c.sortie)).not.toEqual(Array.from(a.sortie));
  });

  it("LA LIGNE EST DIMENSIONNÉE SUR LA BORNE QUAND UNE COURBE EST BRANCHÉE", () => {
    // Sinon deux rendus d'un même effet auraient deux lignes, et l'invariant de la courbe plate
    // tomberait sur cette seule différence.
    expect(retardMaximal(0.25, 0, SR)).toBe(4000);
    expect(retardMaximal(0.25, 0.05, SR)).toBe(4800);
    const courbe = new Float32Array([0.1, 0.5, 0.3]);
    expect(retardMaximal(courbe, 0, SR)).toBe(8000);
  });

  it("LES TOURS AUDIBLES DÉCROISSENT AVEC LA RÉINJECTION, et sont plafonnés", () => {
    expect(toursAudibles(0)).toBe(1);
    expect(toursAudibles(0.5)).toBe(14);
    expect(toursAudibles(0.95)).toBe(40);
  });
});
