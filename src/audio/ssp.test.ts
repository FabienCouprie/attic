// audio/ssp.test.ts — La méthode de Koenig, vérifiée à la lettre, et le soupçon qui pèse sur elle.
//
// LE PREMIER TEST EST CELUI DE LA FIDÉLITÉ À LA MÉTHODE. SSP ne connaît ni oscillateur ni forme
// d'onde : il n'y a que des points tirés dans deux ensembles donnés par le compositeur, et le trait
// qui les relie. On l'exige donc au sens strict — la valeur du signal à chaque point appartient
// exactement à l'ensemble d'amplitudes, et l'écart entre deux points appartient exactement à
// l'ensemble de durées. Un nœud qui lisserait, filtrerait ou normaliserait quoi que ce soit ne
// serait plus du SSP, et ce test le dirait aussitôt.
//
// LE SECOND RÉPOND AU SOUPÇON QUI PÈSE SUR CE PROCÉDÉ. SSP a la réputation d'être impossible à
// diriger, et un nœud qui rendrait du bruit quels que soient les réglages serait un générateur de
// bruit affublé d'une bibliographie. On mesure donc ce que les réglages commandent vraiment, et
// l'on vérifie surtout qu'ils commandent des choses DIFFÉRENTES : les durées font l'aigu sans
// toucher à la crête, les amplitudes font la crête sans toucher à l'aigu. Deux axes séparés, et
// non un unique bouton à bruit.
//
// LE TROISIÈME VÉRIFIE LA THÈSE DE KOENIG PLUTÔT QUE DE LA PROCLAMER : les mêmes principes valent
// à toutes les échelles. Une « série » à l'échelle des sections doit vouloir dire exactement ce
// qu'elle veut dire à l'échelle de l'échantillon — chacune une fois avant qu'aucune ne repasse.
import { describe, expect, it } from "vitest";
import {
  AMPLITUDES_DEFAUT, EST_PRINCIPE, PRINCIPES, TEMPS_DEFAUT, alea, centroideHz, composer,
  construireSegment, creteDb, lireEnsemble, longueurMoyenneDesPlages, masqueTendance,
  nomPrincipe, selectionner, type OptionsComposition, type Principe,
} from "./ssp";
import { fft } from "./fft";
import { hauteurMediane, partVoisee, suivreHauteur } from "./hauteur";
import { creerAleatoire } from "../core/hasard";

const SR = 44100;

/**
 * Deux mesures sur le spectre : la PLATITUDE, moyenne géométrique sur arithmétique, ~0 pour une
 * raie et ~1 pour du bruit blanc ; et le RAPPORT DU SOMMET À LA MOYENNE des rangs.
 */
function spectre(x: Float32Array): { platitude: number; sommetSurMoyenne: number } {
  const N = 4096;
  const de = Math.max(0, Math.floor((x.length - N) / 2));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    re[k] = (x[de + k] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N));
  }
  fft(re, im, false);
  let somme = 0, logs = 0, n = 0, sommet = 0;
  for (let k = 1; k < N / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    somme += m; logs += Math.log(m + 1e-12); n++;
    if (m > sommet) sommet = m;
  }
  const moyenne = somme / n;
  return {
    platitude: moyenne > 0 ? Math.exp(logs / n) / moyenne : 0,
    sommetSurMoyenne: moyenne > 0 ? sommet / moyenne : 0,
  };
}

const BASE: OptionsComposition = {
  frequence: SR, duree: 2, sections: 4,
  amplitudes: [-1, -0.6, -0.2, 0.2, 0.6, 1],
  temps: [5, 9, 17, 33, 65],
  principeAmplitudes: "alea", principeTemps: "alea", principeForme: "serie",
  interpole: true, graine: 7,
};

describe("la fidélité à la méthode", () => {
  it("LA VALEUR À CHAQUE POINT APPARTIENT À L'ENSEMBLE, et l'écart entre deux points aussi", () => {
    const amplitudes = [-1, -0.6, -0.2, 0.2, 0.6, 1];
    const temps = [5, 9, 17, 33, 65];
    const { son, points } = construireSegment(
      { amplitudes, temps, principeAmplitudes: "alea", principeTemps: "alea", longueur: 20000, interpole: true },
      alea(3),
    );
    expect(points.length).toBeGreaterThan(50);
    for (const p of points) {
      // Rien n'est lissé, normalisé ni filtré : la valeur posée est celle qu'on a donnée.
      expect(amplitudes, `point à ${p.echantillon}`).toContain(p.amplitude);
      expect(temps, `point à ${p.echantillon}`).toContain(p.duree);
      expect(son[p.echantillon]).toBeCloseTo(p.amplitude, 6);
    }
    // Et les points se suivent exactement de la durée annoncée : aucun échantillon en trop.
    for (let i = 1; i < points.length; i++) {
      expect(points[i].echantillon - points[i - 1].echantillon).toBe(points[i - 1].duree);
    }
  });

  it("sans interpolation, le signal ne prend QUE les valeurs de l'ensemble", () => {
    const amplitudes = [-1, -0.25, 0.25, 1];
    const { son } = construireSegment(
      { amplitudes, temps: [17, 33], principeAmplitudes: "serie", principeTemps: "alea", longueur: 8000, interpole: false },
      alea(11),
    );
    const vues = new Set(Array.from(son, (v) => Number(v.toFixed(6))));
    for (const v of vues) expect(amplitudes).toContain(v);
  });

  it("avec interpolation, le trait passe bien entre les deux valeurs", () => {
    const { son, points } = construireSegment(
      { amplitudes: [-1, 1], temps: [100], principeAmplitudes: "sequence", principeTemps: "sequence", longueur: 400, interpole: true },
      alea(1),
    );
    // Séquence sur [-1, 1] : les points alternent, le trait doit monter puis descendre.
    expect(points[0].amplitude).toBe(-1);
    expect(son[50]).toBeGreaterThan(-1);
    expect(son[50]).toBeLessThan(1);
    expect(son[50]).toBeCloseTo(0, 1);
  });
});

describe("ce que les réglages commandent vraiment", () => {
  it("LES DURÉES FONT L'AIGU, ET RIEN D'AUTRE NE LE FAIT", () => {
    const centroide = (temps: number[]) => centroideHz(composer({ ...BASE, temps }).son, SR);
    const suite = [[2, 3], [3, 5, 7], [5, 9, 17, 33, 65], [40, 80, 160], [200, 400, 800]].map(centroide);
    // Monotone décroissant, et sur plus de deux décades.
    for (let i = 1; i < suite.length; i++) expect(suite[i]).toBeLessThan(suite[i - 1]);
    expect(suite[0] / suite[suite.length - 1]).toBeGreaterThan(100);

    // LE TÉMOIN : changer l'ensemble d'amplitudes ne déplace pas l'aigu. Les deux axes sont
    // séparés, ce qui interdit de conclure que le nœud n'a qu'un seul bouton à bruit.
    const a = centroideHz(composer({ ...BASE, amplitudes: [-1, 1] }).son, SR);
    const b = centroideHz(composer({ ...BASE, amplitudes: [-1, -0.9, -0.8, 0.8, 0.9, 1] }).son, SR);
    expect(Math.abs(a - b)).toBeLessThan(a * 0.15);
  });

  it("LES AMPLITUDES FONT LA CRÊTE, ET LES DURÉES N'Y TOUCHENT PAS", () => {
    const crete = (amplitudes: number[]) => creteDb(composer({ ...BASE, amplitudes }).son);
    // Deux valeurs extrêmes : un signal presque carré, donc une crête minime.
    const carre = crete([-1, 1]);
    // Beaucoup de petites valeurs et une grande : une crête bien plus forte.
    const pointu = crete([-0.05, -0.02, 0.02, 0.05, 1]);
    expect(carre).toBeLessThan(3);
    expect(pointu).toBeGreaterThan(carre + 4);

    // Le témoin, dans l'autre sens : l'échelle de temps ne change pas la crête.
    const court = creteDb(composer({ ...BASE, temps: [5, 9] }).son);
    const long = creteDb(composer({ ...BASE, temps: [200, 400] }).son);
    expect(Math.abs(court - long)).toBeLessThan(1);
  });

  it("le trait et les marches ne rendent pas le même son", () => {
    const trait = composer({ ...BASE, temps: [33, 65], interpole: true }).son;
    const marches = composer({ ...BASE, temps: [33, 65], interpole: false }).son;
    // Mêmes points, même aigu — et une crête nettement différente.
    expect(centroideHz(trait, SR)).toBeCloseTo(centroideHz(marches, SR), 0);
    expect(creteDb(trait)).toBeGreaterThan(creteDb(marches) + 1);
  });
});

describe("les principes de sélection", () => {
  it("SÉQUENCE parcourt l'ordre donné, sans jamais s'en écarter", () => {
    expect(selectionner("sequence", 4, 10, alea(1))).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });

  it("SÉRIE épuise l'ensemble avant de le reprendre — c'est ce qui la sépare de l'aléa", () => {
    const n = 6;
    const suite = selectionner("serie", n, n * 20, alea(4));
    for (let tour = 0; tour < 20; tour++) {
      const fenetre = suite.slice(tour * n, (tour + 1) * n);
      expect([...fenetre].sort((a, b) => a - b), `tour ${tour}`).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("ALÉA répète, se sert de tout l'ensemble, et ne fait presque pas de plages", () => {
    const suite = selectionner("alea", 6, 4000, alea(9));
    expect(new Set(suite).size).toBe(6);
    // Une répétition immédiate finit forcément par arriver, ce que la série interdit.
    expect(suite.some((v, i) => i > 0 && v === suite[i - 1])).toBe(true);
    // Sur six valeurs, l'espérance de la longueur des plages vaut 1,2.
    expect(longueurMoyenneDesPlages(suite)).toBeLessThan(1.4);
  });

  it("GROUPE fait des paliers, et c'est mesurable", () => {
    const groupe = longueurMoyenneDesPlages(selectionner("groupe", 6, 4000, alea(9)));
    const aleatoire = longueurMoyenneDesPlages(selectionner("alea", 6, 4000, alea(9)));
    expect(groupe).toBeGreaterThan(2.5);
    expect(groupe).toBeGreaterThan(aleatoire * 2);
  });

  it("TENDANCE reste dans son masque, et le masque dérive d'un bout à l'autre", () => {
    const n = 9, k = 900;
    const suite = selectionner("tendance", n, k, alea(2));
    for (let i = 0; i < k; i++) {
      const [bas, haut] = masqueTendance(n, k, i);
      expect(suite[i], `rang ${i}`).toBeGreaterThanOrEqual(bas);
      expect(suite[i], `rang ${i}`).toBeLessThanOrEqual(haut);
    }
    const moyenne = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    expect(moyenne(suite.slice(0, k / 3))).toBeLessThan(moyenne(suite.slice(-k / 3)) - 3);
  });

  it("chaque principe se nomme dans les deux langues, et se reconnaît", () => {
    for (const p of PRINCIPES) {
      expect(EST_PRINCIPE(p.id)).toBe(true);
      expect(nomPrincipe(p.id, false).length).toBeGreaterThan(0);
      expect(nomPrincipe(p.id, true)).not.toMatch(/[éèêàçùîôûï]/);
    }
    expect(EST_PRINCIPE("n'importe quoi")).toBe(false);
  });

  it("les cinq principes rendent cinq sons sans rapport entre eux", () => {
    const sons = PRINCIPES.map((p) => composer({ ...BASE, principeAmplitudes: p.id }).son);
    for (let i = 0; i < sons.length; i++) {
      for (let j = i + 1; j < sons.length; j++) {
        let n = 0, da = 0, db = 0;
        for (let k = 0; k < sons[i].length; k++) { n += sons[i][k] * sons[j][k]; da += sons[i][k] ** 2; db += sons[j][k] ** 2; }
        expect(Math.abs(n / Math.sqrt(da * db || 1)), `${PRINCIPES[i].id} / ${PRINCIPES[j].id}`).toBeLessThan(0.35);
      }
    }
  });
});

describe("la thèse de Koenig : les mêmes principes à toutes les échelles", () => {
  it("UNE SÉRIE À L'ÉCHELLE DE LA FORME VEUT DIRE CE QU'ELLE VEUT DIRE À CELLE DE L'ONDE", () => {
    const c = composer({ ...BASE, duree: 4, sections: 5, principeForme: "serie" });
    expect(c.ordre).toHaveLength(5);
    // Chaque section passe une fois avant qu'aucune ne repasse — la définition même de la série.
    expect([...c.ordre].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("et les quatre autres principes ordonnent les sections comme ils ordonnent les points", () => {
    const ordre = (principeForme: Principe) =>
      composer({ ...BASE, duree: 4, sections: 5, principeForme }).ordre;
    expect(ordre("sequence")).toEqual([0, 1, 2, 3, 4]);
    // Groupe : une même section tenue plusieurs fois de suite.
    expect(longueurMoyenneDesPlages(ordre("groupe"))).toBeGreaterThan(1.5);
    // Tendance : la fin puise plus haut que le début.
    const t = ordre("tendance");
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(t[0]);
    // Aléa : rien n'est garanti sauf de rester dans les bornes.
    for (const v of ordre("alea")) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); }
  });

  it("les sections remplissent la durée demandée, sans trou", () => {
    const c = composer({ ...BASE, duree: 3, sections: 7 });
    expect(c.son.length).toBe(3 * SR);
    // Aucun silence involontaire : le dernier dixième porte du signal comme le premier.
    const energie = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += c.son[i] * c.son[i];
      return s / (b - a);
    };
    expect(energie(c.son.length - 4410, c.son.length)).toBeGreaterThan(energie(0, 4410) * 0.1);
  });
});

describe("les ensembles écrits à la main", () => {
  it("se lisent avec des virgules, des espaces ou des points-virgules", () => {
    expect(lireEnsemble("-1, -0.5, 0, 0.5, 1", [])).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(lireEnsemble("5 9 17", [])).toEqual([5, 9, 17]);
    expect(lireEnsemble("3;7;11", [])).toEqual([3, 7, 11]);
  });

  it("une saisie vide ou illisible retombe sur l'ensemble par défaut", () => {
    for (const saisie of ["", "   ", "bonjour", ",,,"]) {
      expect(lireEnsemble(saisie, AMPLITUDES_DEFAUT), saisie).toEqual(AMPLITUDES_DEFAUT);
    }
    expect(lireEnsemble("abc 12 def", TEMPS_DEFAUT)).toEqual([12]);
  });
});

describe("les bornes", () => {
  it("le son reste dans le gabarit et se reproduit à graine égale", () => {
    const a = composer({ ...BASE, duree: 1 });
    const b = composer({ ...BASE, duree: 1 });
    expect(Array.from(a.son)).toEqual(Array.from(b.son));
    expect(Math.max(...Array.from(a.son, Math.abs))).toBeLessThanOrEqual(1);
    expect(a.son.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("deux graines donnent deux sons sans rapport", () => {
    const a = composer({ ...BASE, duree: 1 });
    const b = composer({ ...BASE, duree: 1, graine: 99 });
    let n = 0, da = 0, db = 0;
    for (let k = 0; k < a.son.length; k++) { n += a.son[k] * b.son[k]; da += a.son[k] ** 2; db += b.son[k] ** 2; }
    expect(Math.abs(n / Math.sqrt(da * db || 1))).toBeLessThan(0.2);
  });

  it("les cas limites rendent un son plutôt qu'une erreur", () => {
    for (const o of [
      { ...BASE, amplitudes: [] as number[] },
      { ...BASE, temps: [] as number[] },
      { ...BASE, temps: [0, -5] },
      { ...BASE, sections: 0 },
      { ...BASE, duree: 0.001 },
      { ...BASE, amplitudes: [0.5] },
    ]) {
      const c = composer(o);
      expect(c.son.length).toBeGreaterThan(0);
      expect(c.son.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it("une durée nulle ne fait pas boucler la construction à l'infini", () => {
    const { points } = construireSegment(
      { amplitudes: [1], temps: [0], principeAmplitudes: "alea", principeTemps: "alea", longueur: 100, interpole: true },
      alea(1),
    );
    // Une durée de zéro est ramenée à un échantillon : cent points au plus, et non l'infini.
    expect(points.length).toBeLessThanOrEqual(120);
  });
});

describe("tenu ou bruité, et ce qui en décide", () => {
  // RELEVÉ PAR FABIEN : « il sort quelque chose qui s'apparente à du bruit blanc quel que soit le
  // paramétrage ». Les cas de ce bloc sont la mesure qui lui a répondu, devenue permanente.

  it("RIEN DE CE QUE CE NŒUD PRODUIT N'APPROCHE DU BRUIT BLANC, et c'est vrai des cinq principes", () => {
    // LE CAS BALAIE LES CINQ PRINCIPES ET RETIENT LE PIRE, parce que le relevé porte sur « quel que
    // soit le paramétrage » : un cas qui n'en éprouve qu'un seul ne répond pas à cela. Mon premier
    // jet ne mesurait qu'« Aléa », à 0,1754 de platitude, et « Tendance », à 0,2794, aurait franchi
    // le seuil de 0,25 qu'il annonçait.
    //
    // DEUX INSTRUMENTS, ET LE SECOND EST LE BON. La platitude sépare bien les cinq du bruit blanc,
    // mais d'un facteur trois seulement dans le pire cas, et elle les classe À L'ENVERS : c'est un
    // rapport de la moyenne géométrique à l'arithmétique, que le nombre de rangs presque vides
    // commande plus que la présence d'un sommet, si bien que « Tendance » y paraît le plus bruité
    // des cinq quand il l'est le moins. J'ai d'abord cru son spectre quasi continu, donc la mesure
    // sans objet ; c'est faux, son efficace alternatif vaut 0,426. Le rapport du SOMMET à la
    // moyenne des rangs, lui, dit ce qu'on cherche : du bruit blanc n'a aucun rang qui domine, et
    // les cinq en ont un. Relevé, 3,1 pour le bruit blanc contre 36,9 pour le plus plat des cinq et
    // 176,7 pour « Tendance ».
    //
    // ET LE BRUIT BLANC EST TIRÉ AVEC `creerAleatoire`, non avec un générateur écrit sur place : un
    // congruentiel de fortune pose de vraies raies à 4000 et 8000 Hz par ses bits de poids faible,
    // ce qui a déjà faussé un relevé de ce dépôt.
    const hasard = creerAleatoire(12345);
    const blanc = spectre(Float32Array.from({ length: 2 * SR }, () => hasard() * 2 - 1));
    const releve = PRINCIPES.map((p) => ({
      nom: p.fr,
      ...spectre(composer({ ...BASE, principeAmplitudes: p.id, principeTemps: p.id }).son),
    }));
    const dit = `bruit blanc ${blanc.platitude.toFixed(4)} / ${blanc.sommetSurMoyenne.toFixed(1)} ; `
      + releve.map((r) => `${r.nom} ${r.platitude.toFixed(4)} / ${r.sommetSurMoyenne.toFixed(1)}`).join(" ; ");
    const pirePlatitude = Math.max(...releve.map((r) => r.platitude));
    const pireSommet = Math.min(...releve.map((r) => r.sommetSurMoyenne));
    expect(pirePlatitude, dit).toBeLessThan(0.45);
    expect(blanc.platitude / pirePlatitude, dit).toBeGreaterThan(2);
    expect(pireSommet / blanc.sommetSurMoyenne, dit).toBeGreaterThan(4);
  });

  it("LE TÉMOIN : « Séquence » SUR LES AMPLITUDES REND UNE ONDE, et la fréquence se prédit", () => {
    // Six amplitudes parcourues dans l'ordre sur une durée fixe : l'onde se répète tous les six
    // points, donc toutes les six fois cette durée.
    for (const t of [25, 50, 100, 200]) {
      const c = composer({
        ...BASE, temps: [t], sections: 1,
        principeAmplitudes: "sequence", principeTemps: "sequence", principeForme: "sequence",
      });
      const attendu = SR / (6 * t);
      const dit = `durée ${t} : ${c.tenue.points} points, ${c.tenue.echantillons} éch.,`
        + ` ${c.tenue.hertz?.toFixed(2)} Hz, attendu ${attendu.toFixed(2)}`;
      expect(c.tenue.points, dit).toBe(6);
      expect(c.tenue.echantillons, dit).toBe(6 * t);
      expect(c.tenue.hertz, dit).toBeCloseTo(attendu, 2);
    }
  });

  it("LE TÉMOIN NÉGATIF : LES QUATRE AUTRES PRINCIPES NE RENDENT AUCUNE ONDE", () => {
    // SUR UNE DURÉE UNIQUE, de sorte que les durées ne puissent rien y être pour rien : l'écart
    // entre deux points est alors fixe, et c'est bien le seul ordre des amplitudes qui manque.
    for (const p of ["alea", "serie", "groupe", "tendance"] as Principe[]) {
      const c = composer({
        ...BASE, temps: [50], sections: 1,
        principeAmplitudes: p, principeTemps: p, principeForme: "sequence",
      });
      expect(c.tenue.hertz, `${p} sur une durée unique : ${c.tenue.hertz} Hz`).toBeNull();
    }
  });

  it("MAIS « SÉQUENCE » AUX AMPLITUDES NE SUFFIT PAS : LES DURÉES SONT LA SECONDE CONDITION", () => {
    // LE CAS QUI MANQUAIT, ET QUI A CORRIGÉ UNE RÈGLE FAUSSE. Les cas voisins bougent les deux
    // principes ENSEMBLE, si bien qu'aucun n'éprouvait le coin mixte, et j'en avais conclu que le
    // principe des amplitudes décidait seul. L'application a rendu « bruitée » là où je l'annonçais
    // tenue. Avec un autre principe aux durées, l'écart entre deux points est rebattu à chaque
    // passage et la suite des couples ne se répète plus, quoi que fassent les amplitudes.
    for (const p of ["alea", "serie", "groupe", "tendance"] as Principe[]) {
      const plusieurs = composer({
        ...BASE, sections: 1,
        principeAmplitudes: "sequence", principeTemps: p, principeForme: "sequence",
      });
      const dit = `séquence aux amplitudes, ${p} aux durées : ${plusieurs.tenue.hertz} Hz`;
      expect(plusieurs.tenue.hertz, dit).toBeNull();
      // LA SEULE ÉCHAPPATOIRE : une durée unique, où il n'y a rien à rebattre. Les six amplitudes
      // parcourues dans l'ordre sur 50 échantillons font une période de 300.
      const une = composer({
        ...BASE, temps: [50], sections: 1,
        principeAmplitudes: "sequence", principeTemps: p, principeForme: "sequence",
      });
      expect(une.tenue.hertz as number, `une seule durée, ${p} aux durées`).toBeCloseTo(SR / 300, 2);
    }
    // ET LES DEUX EN « SÉQUENCE » TIENNENT, sur le même ensemble de cinq durées : six amplitudes et
    // cinq durées se retrouvent au bout de trente points, soit six fois la somme des cinq durées.
    const deux = composer({
      ...BASE, sections: 1,
      principeAmplitudes: "sequence", principeTemps: "sequence", principeForme: "sequence",
    });
    const dit = `${deux.tenue.points} points, ${deux.tenue.echantillons} éch., ${deux.tenue.hertz} Hz`;
    expect(deux.tenue.points, dit).toBe(30);
    expect(deux.tenue.echantillons, dit).toBe(774);
    expect(deux.tenue.hertz as number, dit).toBeCloseTo(SR / 774, 2);
  });

  it("ET CE N'EST PAS LA TAILLE DE L'ENSEMBLE DES DURÉES, hypothèse que la mesure a réfutée", () => {
    // LES DEUX PRINCIPES EN « SÉQUENCE », SEUL L'ENSEMBLE DES DURÉES CHANGE : une onde sort des
    // cinq, des plus serrés aux plus étalés, et aucun des quatre autres principes n'en rend sur
    // aucun. C'est donc bien l'ORDRE qui décide, et jamais le nombre de durées écrites : le cas
    // empêche de « corriger » l'ensemble des durées pour un défaut qui n'y est pas.
    const ensembles = [[50], [50, 100], [50, 51], [5, 9, 17, 33, 65], [48, 49, 50, 51, 52]];
    for (const temps of ensembles) {
      const tenu = composer({
        ...BASE, temps, sections: 1,
        principeAmplitudes: "sequence", principeTemps: "sequence", principeForme: "sequence",
      });
      expect(tenu.tenue.hertz, `séquence sur [${temps.join(", ")}]`).not.toBeNull();
      for (const p of ["alea", "serie", "groupe", "tendance"] as Principe[]) {
        const bruite = composer({
          ...BASE, temps, sections: 1,
          principeAmplitudes: p, principeTemps: p, principeForme: "sequence",
        });
        expect(bruite.tenue.hertz, `${p} sur [${temps.join(", ")}]`).toBeNull();
      }
    }
  });

  it("LA PÉRIODE PRÉDITE TOMBE SUR CELLE QUE LE SUIVEUR DE HAUTEUR RELÈVE", () => {
    // LA PÉRIODE SE CALCULE SUR LA SUITE DES POINTS, non sur le son : c'est exact, gratuit, et sans
    // plancher de fréquence. Ce cas est ce qui l'autorise, en confrontant le calcul à l'écoute.
    for (const temps of [[50], [5, 9, 17, 33, 65]]) {
      const c = composer({
        ...BASE, temps, duree: 3, sections: 1,
        principeAmplitudes: "sequence", principeTemps: "sequence", principeForme: "sequence",
      });
      const suivi = suivreHauteur(c.son, SR, { fMin: 40, fMax: 4000, cadence: 100 });
      const dit = `[${temps.join(", ")}] : prédit ${c.tenue.hertz?.toFixed(2)} Hz,`
        + ` relevé ${hauteurMediane(suivi).toFixed(2)} Hz à ${partVoisee(suivi).toFixed(3)} de voisé`;
      expect(partVoisee(suivi), dit).toBeGreaterThan(0.9);
      expect(hauteurMediane(suivi) / (c.tenue.hertz as number), dit).toBeCloseTo(1, 1);
    }
  });
});
