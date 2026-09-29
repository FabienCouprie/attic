// audio/melodie-sur-accords.test.ts — La ligne respecte-t-elle ce qu'on lui a imposé ?
//
// CE QUE CES CAS TIENNENT, ET DANS QUEL ORDRE. D'abord ce que le DOMAINE porte, parce que c'est là
// que se joue la moitié du travail : une note n'est candidate que si elle est dans la gamme de son
// accord, et sur un appui que si elle est dans l'accord lui-même. Ensuite chaque contrainte, une par
// une, éprouvée en la posant seule : une ligne qui les respecterait toutes par hasard ne prouverait
// rien de chacune. Enfin le rapport, qui est ce qui rend les contraintes PROGRESSIVES : sans le nom
// de la règle qui bloque, on desserre à l'aveugle.
import { describe, expect, it } from "vitest";

import {
  domainesDeLaMelodie, melodieSurAccords, memeSensMaximal, placesDeLaMelodie, sautCompense,
  sommetUnique, type OptionsMelodie,
} from "./melodie-sur-accords";
import { accordsDeSequence } from "./reconnaitre-accord";
import { gammeDeQualite } from "./accord-gamme";
import { degresDeGamme } from "./gammes";
import { qualiteDe } from "./qualites-accords";

const BASE: OptionsMelodie = {
  parAccord: 4, grave: 60, aigu: 84, ecartMax: 7, repetitionMax: 1,
  appuis: true, sommetUnique: true, sautCompense: 4, memeSensMax: 4,
  graine: 7, budget: 200000,
};

/** Un II-V-I en do : la progression la plus éprouvée qui soit. */
function progression() {
  const notes: { note: number; debut: number; fin: number }[] = [];
  const poser = (hauteurs: number[], debut: number) => {
    for (const h of hauteurs) notes.push({ note: h, debut, fin: debut + 2 });
  };
  poser([50, 57, 60, 65], 0);   // Dm7
  poser([43, 50, 59, 65], 2);   // G7
  poser([48, 55, 59, 64], 4);   // Cmaj7
  poser([48, 55, 59, 64], 6);   // Cmaj7
  return accordsDeSequence(notes);
}

const classe = (n: number) => ((n % 12) + 12) % 12;

describe("les places où la mélodie pose ses notes", () => {
  it("LA GRILLE VIENT DES ACCORDS, et non d'un tempo réglé à côté", () => {
    const places = placesDeLaMelodie(progression(), 4);
    expect(places.length).toBe(16);
    expect(places[0]).toEqual({ debut: 0, fin: 0.5, appui: true, accord: 0 });
    expect(places[4]).toEqual({ debut: 2, fin: 2.5, appui: true, accord: 1 });
    expect(places.filter((p) => p.appui).length).toBe(4);
  });

  it("une note par accord ne laisse que des appuis", () => {
    const places = placesDeLaMelodie(progression(), 1);
    expect(places.length).toBe(4);
    expect(places.every((p) => p.appui)).toBe(true);
  });

  it("les places couvrent exactement la durée de leur accord, sans trou ni recouvrement", () => {
    const accords = progression();
    const places = placesDeLaMelodie(accords, 3);
    for (let i = 0; i < accords.length; i++) {
      const siennes = places.filter((p) => p.accord === i);
      expect(siennes[0].debut).toBeCloseTo(accords[i].debut, 9);
      expect(siennes[siennes.length - 1].fin).toBeCloseTo(accords[i].fin, 9);
      for (let k = 1; k < siennes.length; k++) expect(siennes[k].debut).toBeCloseTo(siennes[k - 1].fin, 9);
    }
  });
});

describe("le domaine porte déjà la moitié des règles", () => {
  const accords = progression();

  it("HORS APPUI, LA GAMME DE L'ACCORD, et rien d'autre", () => {
    const places = placesDeLaMelodie(accords, 4);
    const domaines = domainesDeLaMelodie(places, accords, BASE);
    places.forEach((p, k) => {
      if (p.appui) return;
      const a = accords[p.accord].accord!;
      const permis = new Set(degresDeGamme(gammeDeQualite(a.qualite)).map((d) => classe(d + a.fondamentale)));
      for (const h of domaines[k]) expect(permis.has(classe(h)), `place ${k} : ${h}`).toBe(true);
    });
  });

  it("SUR UN APPUI, SEULES LES NOTES DE L'ACCORD : c'est la règle A, posée dans le domaine", () => {
    const places = placesDeLaMelodie(accords, 4);
    const domaines = domainesDeLaMelodie(places, accords, BASE);
    places.forEach((p, k) => {
      if (!p.appui) return;
      const a = accords[p.accord].accord!;
      const notes = new Set(qualiteDe(a.qualite)!.intervalles.map((i) => classe(i + a.fondamentale)));
      for (const h of domaines[k]) expect(notes.has(classe(h)), `appui ${k} : ${h}`).toBe(true);
      expect(domaines[k].length).toBeGreaterThan(0);
    });
  });

  it("ET SANS LA RÈGLE DES APPUIS, LE DOMAINE S'ÉLARGIT : le cas mord", () => {
    const places = placesDeLaMelodie(accords, 4);
    const serre = domainesDeLaMelodie(places, accords, BASE);
    const large = domainesDeLaMelodie(places, accords, { ...BASE, appuis: false });
    const appui = places.findIndex((p) => p.appui);
    expect(large[appui].length).toBeGreaterThan(serre[appui].length);
  });

  it("tout candidat tient dans le registre, aux deux bornes comprises", () => {
    const places = placesDeLaMelodie(accords, 4);
    for (const d of domainesDeLaMelodie(places, accords, { ...BASE, grave: 62, aigu: 70 })) {
      for (const h of d) { expect(h).toBeGreaterThanOrEqual(62); expect(h).toBeLessThanOrEqual(70); }
    }
  });

  it("UN ACCORD NON RECONNU N'INTERDIT PAS DE JOUER : la recherche traverse la mesure", () => {
    // Une quinte seule ne fait pas un accord, et la reconnaissance se tait. Sans ce repli, la
    // recherche échouerait sur cette mesure au lieu de la traverser.
    const avecTrou = accordsDeSequence([
      { note: 60, debut: 0, fin: 1 }, { note: 67, debut: 0, fin: 1 },
      { note: 48, debut: 1, fin: 2 }, { note: 55, debut: 1, fin: 2 }, { note: 64, debut: 1, fin: 2 },
    ]);
    expect(avecTrou[0].accord).toBeUndefined();
    const places = placesDeLaMelodie(avecTrou, BASE.parAccord);
    const domaines = domainesDeLaMelodie(places, avecTrou, BASE);
    expect(domaines[0].length).toBeGreaterThan(0);
    expect(melodieSurAccords(avecTrou, BASE).notes.length).toBe(places.length);
  });
});

describe("chaque contrainte, éprouvée seule", () => {
  const accords = progression();
  const seule = (o: Partial<OptionsMelodie>) => melodieSurAccords(accords, {
    ...BASE, ecartMax: 0, repetitionMax: 0, appuis: false, sommetUnique: false,
    sautCompense: 0, memeSensMax: 0, ...o,
  });

  it("L'ÉCART MAXIMAL est tenu entre deux notes voisines", () => {
    const r = seule({ ecartMax: 3 });
    expect(r.notes.length).toBeGreaterThan(0);
    for (let i = 1; i < r.notes.length; i++) {
      expect(Math.abs(r.notes[i].note - r.notes[i - 1].note)).toBeLessThanOrEqual(3);
    }
  });

  it("LE SOMMET EST UNIQUE : la note la plus aiguë ne paraît qu'une fois", () => {
    const r = seule({ sommetUnique: true });
    const hauteurs = r.notes.map((n) => n.note);
    const max = Math.max(...hauteurs);
    expect(hauteurs.filter((h) => h === max).length).toBe(1);
  });

  it("UN SAUT EST COMPENSÉ par un mouvement contraire", () => {
    const r = seule({ sautCompense: 4, ecartMax: 12 });
    expect(r.notes.length).toBeGreaterThan(0);
    for (let i = 2; i < r.notes.length; i++) {
      const saut = r.notes[i - 1].note - r.notes[i - 2].note;
      if (Math.abs(saut) <= 4) continue;
      const suite = r.notes[i].note - r.notes[i - 1].note;
      expect(Math.sign(saut) === Math.sign(suite) && suite !== 0, `place ${i}`).toBe(false);
    }
  });

  it("LE MÊME SENS EST BORNÉ : une ligne qui monte sans fin n'en est pas une", () => {
    const r = seule({ memeSensMax: 2, ecartMax: 12 });
    expect(r.notes.length).toBeGreaterThan(0);
    let suite = 0;
    for (let i = 1; i < r.notes.length; i++) {
      const pas = r.notes[i].note - r.notes[i - 1].note;
      if (pas === 0) { suite = 0; continue; }
      const precedent = i > 1 ? r.notes[i - 1].note - r.notes[i - 2].note : 0;
      suite = i > 1 && Math.sign(pas) === Math.sign(precedent) && precedent !== 0 ? suite + 1 : 1;
      expect(suite, `place ${i}`).toBeLessThanOrEqual(2);
    }
  });

  it("LA RÉPÉTITION EST BORNÉE, et une borne d'un interdit deux notes de suite égales", () => {
    const r = seule({ repetitionMax: 1 });
    for (let i = 1; i < r.notes.length; i++) expect(r.notes[i].note).not.toBe(r.notes[i - 1].note);
  });

  it("LES APPUIS SONT DES NOTES DE L'ACCORD, et c'est la règle A", () => {
    const r = melodieSurAccords(accords, BASE);
    expect(r.notes.length).toBe(16);
    r.notes.forEach((n, k) => {
      if (!r.places[k].appui) return;
      const a = accords[r.places[k].accord].accord!;
      const notes = new Set(qualiteDe(a.qualite)!.intervalles.map((i) => classe(i + a.fondamentale)));
      expect(notes.has(classe(n.note)), `appui ${k} : ${n.note} sur ${a.qualite}`).toBe(true);
    });
  });

  it("et un appui se joue plus fort qu'un passage, sans quoi la hiérarchie ne s'entendrait pas", () => {
    const r = melodieSurAccords(accords, BASE);
    const appuis = r.notes.filter((_, k) => r.places[k].appui).map((n) => n.velocite);
    const passages = r.notes.filter((_, k) => !r.places[k].appui).map((n) => n.velocite);
    expect(Math.min(...appuis)).toBeGreaterThan(Math.max(...passages));
  });
});

describe("les contraintes prises séparément, sur des suites choisies", () => {
  // Éprouver une contrainte sur la ligne que le solveur rend ne dit pas ce qu'elle REFUSE : ces
  // cas-là lui donnent des suites dont on connaît la réponse.
  it("le sommet unique refuse un maximum répété et accepte un maximum battu", () => {
    const c = sommetUnique();
    expect(c.admet([60, 67, 67], 2, false)).toBe(false);
    expect(c.admet([60, 67, 69], 2, false)).toBe(true);
    expect(c.admet([67, 60, 67], 2, false)).toBe(false);
    expect(c.admet([60], 0, false)).toBe(true);
  });

  it("le saut compensé n'exige rien d'un pas conjoint, et exige le contraire après un saut", () => {
    const c = sautCompense(4);
    expect(c.admet([60, 62, 64], 2, false)).toBe(true);     // deux pas conjoints
    expect(c.admet([60, 67, 69], 2, false)).toBe(false);    // saut de 7 vers le haut, puis encore
    expect(c.admet([60, 67, 65], 2, false)).toBe(true);     // saut vers le haut, retour
    expect(c.admet([67, 60, 62], 2, false)).toBe(true);     // saut vers le bas, retour
    expect(c.admet([60, 62], 1, false)).toBe(true);         // trop tôt pour juger
  });

  it("le même sens borné compte les pas consécutifs et s'arrête sur une note tenue", () => {
    const c = memeSensMaximal(2);
    expect(c.admet([60, 62, 64], 2, false)).toBe(true);
    expect(c.admet([60, 62, 64, 65], 3, false)).toBe(false);
    expect(c.admet([60, 62, 64, 62], 3, false)).toBe(true);
    expect(c.admet([60, 60, 62, 64], 3, false)).toBe(true);
  });
});

describe("ce que le solveur rend, et ce qu'il dit quand il ne rend rien", () => {
  const accords = progression();

  it("LA MÊME GRAINE REND LA MÊME LIGNE, et deux graines deux lignes", () => {
    const ligne = (graine: number) =>
      melodieSurAccords(accords, { ...BASE, graine }).notes.map((n) => n.note).join(",");
    expect(ligne(7)).toBe(ligne(7));
    expect(ligne(7)).not.toBe(ligne(42));
  });

  it("une note par place, et les places suivent le temps des accords", () => {
    const r = melodieSurAccords(accords, BASE);
    expect(r.notes.length).toBe(r.places.length);
    r.notes.forEach((n, k) => {
      expect(n.debut).toBeCloseTo(r.places[k].debut, 9);
      expect(n.fin).toBeCloseTo(r.places[k].fin, 9);
    });
  });

  it("SUR-CONTRAINT, IL NE REND RIEN ET NOMME LA RÈGLE QUI A BLOQUÉ", () => {
    // C'EST CE QUI REND LES CONTRAINTES PROGRESSIVES. Sans ce nom, on desserre à l'aveugle : le
    // rapport dit laquelle a fait rebrousser chemin le plus souvent, donc laquelle relâcher.
    const r = melodieSurAccords(accords, { ...BASE, ecartMax: 1, grave: 60, aigu: 62, budget: 50000 });
    expect(r.notes).toEqual([]);
    expect(r.resolution.solutions).toEqual([]);
    expect(r.resolution.regleBloquante).not.toBe("");
    expect(r.resolution.meilleurPartiel.length).toBeGreaterThanOrEqual(0);
  });

  it("et il dit quelles contraintes ont été posées, dans l'ordre où il les éprouve", () => {
    const toutes = melodieSurAccords(accords, BASE);
    expect(toutes.posees).toEqual(["ecart", "repetition", "saut", "sens", "sommet"]);
    const aucune = melodieSurAccords(accords, {
      ...BASE, ecartMax: 0, repetitionMax: 0, sautCompense: 0, memeSensMax: 0, sommetUnique: false,
    });
    expect(aucune.posees).toEqual([]);
    expect(aucune.notes.length).toBe(16);
  });

  it("une suite d'accords vide ne fait pas échouer la recherche", () => {
    const r = melodieSurAccords([], BASE);
    expect(r.notes).toEqual([]);
    expect(r.places).toEqual([]);
  });

  it("LE COÛT RESTE PETIT SUR UNE PROGRESSION ORDINAIRE, et le rapport le dit", () => {
    // Un plancher sur le coût : si une contrainte devenait bien plus chère, ce cas le signalerait
    // avant qu'un composant ne se mette à geler sur une pièce longue.
    const r = melodieSurAccords(accords, BASE);
    expect(r.resolution.abandonne).toBe(false);
    expect(r.resolution.noeuds).toBeLessThan(5000);
  });
});
