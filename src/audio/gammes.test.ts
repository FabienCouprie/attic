// audio/gammes.test.ts — La table des gammes, et ce qu'elle doit aux listes qu'elle remplace.
//
// CE QUE CES CAS TIENNENT. D'abord qu'aucune gamme existante n'a changé de degrés : une table qui
// remplace sept listes ne se croit pas sur parole, sinon elle change la musique en silence. Puis que
// les anciennes orthographes répondent encore : la valeur d'un réglage est enregistrée dans le
// projet, et un identifiant devenu inconnu ferait retomber un graphe rouvert sur la gamme par
// défaut. Enfin que les gammes ajoutées sont justes, degré par degré.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GAMMES, degresDeGamme, gammeDe, gammesDe, parcoursDeGamme } from "./gammes";

/** Les sources où une table de gammes pourrait réapparaître. */
function sourcesAudioEtPlugins(dossiers = [join("src", "audio"), join("src", "plugins")]): string[] {
  const out: string[] = [];
  for (const d of dossiers) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...sourcesAudioEtPlugins([join(d, e.name)]));
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(join(d, e.name));
    }
  }
  return out;
}

/** Les degrés tels qu'ils étaient écrits dans les listes d'avant, recopiés. */
const AVANT: Record<string, number[]> = {
  majeur: [0, 2, 4, 5, 7, 9, 11],
  mineur: [0, 2, 3, 5, 7, 8, 10],
  dorien: [0, 2, 3, 5, 7, 9, 10],
  phrygien: [0, 1, 3, 5, 7, 8, 10],
  lydien: [0, 2, 4, 6, 7, 9, 11],
  mixolydien: [0, 2, 4, 5, 7, 9, 10],
  locrien: [0, 1, 3, 5, 6, 8, 10],
  "mineur-harmonique": [0, 2, 3, 5, 7, 8, 11],
  "pentatonique-majeure": [0, 2, 4, 7, 9],
  "pentatonique-mineure": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatique: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Les orthographes que les sept listes employaient, et ce qu'elles doivent désigner. */
const ANCIENNES_ORTHOGRAPHES: Record<string, string> = {
  majeure: "majeur",
  mineure: "mineur",
  "mineure-harmonique": "mineur-harmonique",
  "penta-majeure": "pentatonique-majeure",
  "penta-mineure": "pentatonique-mineure",
  pentatonique: "pentatonique-majeure",
  "pentatonique majeur": "pentatonique-majeure",
  "pentatonique mineur": "pentatonique-mineure",
  // Les deux modes grecs que la table nomme autrement : qui cherche les sept doit trouver les sept.
  ionien: "majeur",
  eolien: "mineur",
  byzantine: "double-seconde-augmentee",
};

describe("la table des gammes", () => {
  it("N'A CHANGÉ AUCUN DEGRÉ de ce qui existait", () => {
    for (const [id, degres] of Object.entries(AVANT)) {
      expect(gammeDe(id), `${id} a disparu de la table`).toBeTruthy();
      expect(gammeDe(id)!.degres, `${id} n'a plus les mêmes degrés`).toEqual(degres);
    }
  });

  it("RÉPOND ENCORE AUX ANCIENNES ORTHOGRAPHES, sinon un projet rouvert changerait de gamme", () => {
    for (const [ancien, attendu] of Object.entries(ANCIENNES_ORTHOGRAPHES)) {
      expect(gammeDe(ancien)?.id, `« ${ancien} » ne désigne plus rien`).toBe(attendu);
    }
  });

  it("LES GAMMES AJOUTÉES SONT JUSTES, degré par degré", () => {
    // Les quatre modes de la mineure mélodique et de l'harmonique se vérifient par construction :
    // une rotation de leur gamme mère, ramenée à zéro.
    const rotation = (degres: number[], rang: number) =>
      degres.map((_, i) => (degres[(i + rang) % degres.length] - degres[rang] + 12) % 12).sort((a, b) => a - b);
    const melodique = gammeDe("mineur-melodique")!.degres;
    expect(melodique).toEqual([0, 2, 3, 5, 7, 9, 11]);
    expect(gammeDe("lydien-dominant")!.degres, "4e mode de la mineure mélodique").toEqual(rotation(melodique, 3));
    expect(gammeDe("alteree")!.degres, "7e mode de la mineure mélodique").toEqual(rotation(melodique, 6));
    const harmonique = gammeDe("mineur-harmonique")!.degres;
    expect(gammeDe("phrygien-dominant")!.degres, "5e mode de la mineure harmonique").toEqual(rotation(harmonique, 4));
  });

  it("L'ALTÉRÉE PORTE BIEN LA NEUVIÈME AUGMENTÉE, qui est sa raison d'être", () => {
    // Sur un accord de septième, la neuvième augmentée vaut trois demi-tons au-dessus de la tonique.
    expect(gammeDe("alteree")!.degres).toContain(3);
    // Et les deux quintes altérées, qui font le reste de sa couleur.
    expect(gammeDe("alteree")!.degres).toContain(6);
    expect(gammeDe("alteree")!.degres).toContain(8);
  });

  it("LES DEUX OCTATONIQUES NE SE CONFONDENT PAS, et alternent bien ton et demi-ton", () => {
    const ecarts = (id: string) => {
      const d = gammeDe(id)!.degres;
      return d.map((x, i) => ((i + 1 < d.length ? d[i + 1] : 12) - x));
    };
    expect(gammeDe("diminuee-ton-demi")!.degres.length).toBe(8);
    expect(gammeDe("diminuee-demi-ton")!.degres.length).toBe(8);
    expect(ecarts("diminuee-ton-demi")).toEqual([2, 1, 2, 1, 2, 1, 2, 1]);
    expect(ecarts("diminuee-demi-ton")).toEqual([1, 2, 1, 2, 1, 2, 1, 2]);
  });

  it("LA GAMME PAR TONS N'A QUE DES TONS", () => {
    const d = gammeDe("ton-entier")!.degres;
    expect(d.length).toBe(6);
    for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1]).toBe(2);
  });

  it("L'AUGMENTÉE ALTERNE TIERCE MINEURE ET DEMI-TON", () => {
    const d = gammeDe("augmentee")!.degres;
    const ecarts = d.map((x, i) => (i + 1 < d.length ? d[i + 1] : 12) - x);
    expect(ecarts).toEqual([3, 1, 3, 1, 3, 1]);
  });

  it("LES GAMMES À SECONDE AUGMENTÉE EN PORTENT BIEN DEUX", () => {
    // C'est cet intervalle de trois demi-tons entre deux degrés voisins qui fait leur couleur, et
    // c'est ce qui les distingue d'un mode ordinaire.
    const secondesAugmentees = (id: string) => {
      const d = gammeDe(id)!.degres;
      return d.map((x, i) => (i + 1 < d.length ? d[i + 1] : 12) - x).filter((e) => e === 3).length;
    };
    expect(secondesAugmentees("double-seconde-augmentee")).toBe(2);
    expect(secondesAugmentees("hongroise-mineure")).toBe(2);
  });

  it("LES DEUX PENTATONIQUES JAPONAISES ONT BIEN CINQ NOTES", () => {
    expect(gammeDe("hirajoshi")!.degres.length).toBe(5);
    expect(gammeDe("in-sen")!.degres.length).toBe(5);
  });

  it("LES CINQ FAMILLES DU RÉFÉRENTIEL SONT REPRÉSENTÉES", () => {
    // Diatoniques et modes, pentatoniques, symétriques, exotiques, chromatique : aucune ne doit
    // rester vide, sans quoi la table dirait couvrir un terrain qu'elle ne couvre pas.
    for (const f of ["modale", "pentatonique", "jazz", "symetrique", "exotique", "chromatique"] as const) {
      expect(gammesDe(f).length, `la famille « ${f} » est vide`).toBeGreaterThan(0);
    }
    // Les trois mineures, que le référentiel distingue.
    for (const id of ["mineur", "mineur-harmonique", "mineur-melodique"]) {
      expect(gammeDe(id), `${id} manque`).toBeTruthy();
    }
    // Les sept modes grecs, sous l'un ou l'autre de leurs noms.
    for (const id of ["ionien", "dorien", "phrygien", "lydien", "mixolydien", "eolien", "locrien"]) {
      expect(gammeDe(id), `le mode ${id} manque`).toBeTruthy();
    }
  });

  it("CHAQUE GAMME EST TRIÉE, DANS L'OCTAVE, ET COMMENCE À LA TONIQUE", () => {
    for (const g of GAMMES) {
      expect(g.degres[0], `${g.id} ne commence pas à la tonique`).toBe(0);
      expect([...g.degres].sort((a, b) => a - b), `${g.id} n'est pas trié`).toEqual(g.degres);
      expect(new Set(g.degres).size, `${g.id} répète un degré`).toBe(g.degres.length);
      for (const d of g.degres) expect(d, `${g.id} sort de l'octave`).toBeLessThan(12);
    }
  });

  it("DEUX GAMMES NE PARTAGENT NI UN IDENTIFIANT NI UN ALIAS", () => {
    const vus = new Map<string, string>();
    const doubles: string[] = [];
    for (const g of GAMMES) {
      for (const cle of [g.id, ...(g.alias ?? [])]) {
        if (vus.has(cle)) doubles.push(`${cle} : ${vus.get(cle)} et ${g.id}`);
        vus.set(cle, g.id);
      }
    }
    expect(doubles).toEqual([]);
  });

  it("un identifiant inconnu ne fabrique pas de gamme, mais les degrés ont un secours", () => {
    expect(gammeDe("gamme-qui-n-existe-pas")).toBeUndefined();
    expect(degresDeGamme("gamme-qui-n-existe-pas")).toEqual(AVANT.majeur);
  });

  // LE GARDE DES TABLES PRIVÉES A DÉMÉNAGÉ dans `nomenclatures.test.ts`, où la même règle vaut pour
  // les gammes, les accords et les rythmes. Celui qui était ici cherchait un NOM de constante,
  // `GAMMES*`, et n'a pas vu cinq tables écrites sous d'autres noms : `MAJEUR` dans le cercle
  // pulsant, `DEGRES_MAJEUR` dans la génération, et trois autres. Un garde cherche la forme.

  it("les familles permettent d'en proposer une part", () => {
    expect(gammesDe("pentatonique").map((g) => g.id)).toContain("pentatonique-majeure");
    expect(gammesDe("symetrique").map((g) => g.id)).toEqual(
      ["ton-entier", "diminuee-ton-demi", "diminuee-demi-ton", "augmentee"],
    );
    expect(gammesDe("modale").length).toBeGreaterThan(7);
  });
});

describe("le parcours d'une gamme", () => {
  const DO4 = 60;

  it("MONTE LES DEGRÉS DEPUIS LA TONIQUE, et ferme sur l'octave", () => {
    expect(parcoursDeGamme("majeur", DO4)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it("LA CLÉ DÉPLACE TOUT LE PARCOURS, et rien d'autre", () => {
    const enDo = parcoursDeGamme("majeur", DO4);
    const enRe = parcoursDeGamme("majeur", DO4 + 2);
    expect(enRe).toEqual(enDo.map((n) => n + 2));
  });

  it("LA TONIQUE FINALE SE COUPE, pour qui enchaîne deux parcours", () => {
    const ferme = parcoursDeGamme("majeur", DO4);
    const ouvert = parcoursDeGamme("majeur", DO4, 1, "montante", false);
    expect(ouvert).toEqual(ferme.slice(0, -1));
    // Deux parcours ouverts bout à bout ne doublent aucune note à la jointure.
    expect([...ouvert, ...parcoursDeGamme("majeur", DO4 + 12, 1, "montante", false)])
      .toEqual(parcoursDeGamme("majeur", DO4, 2, "montante", false));
  });

  it("LA DESCENTE EST LA MONTÉE À L'ENVERS, exactement", () => {
    expect(parcoursDeGamme("mineur-harmonique", DO4, 2, "descendante"))
      .toEqual([...parcoursDeGamme("mineur-harmonique", DO4, 2, "montante")].reverse());
  });

  it("L'ALLER-RETOUR NE REJOUE PAS SON SOMMET", () => {
    const monte = parcoursDeGamme("majeur", DO4);
    const retour = parcoursDeGamme("majeur", DO4, 1, "aller-retour");
    expect(retour.length).toBe(monte.length * 2 - 1);
    expect(retour.filter((n) => n === 72).length).toBe(1);
    expect(retour[0]).toBe(60);
    expect(retour[retour.length - 1]).toBe(60);
  });

  it("CHAQUE OCTAVE DEMANDÉE AJOUTE SES DEGRÉS", () => {
    for (const g of GAMMES) {
      const un = parcoursDeGamme(g.id, 36, 1, "montante", false);
      const trois = parcoursDeGamme(g.id, 36, 3, "montante", false);
      expect(un.length, `${g.id} sur une octave`).toBe(g.degres.length);
      expect(trois.length, `${g.id} sur trois octaves`).toBe(g.degres.length * 3);
    }
  });

  it("CE QUI SORT DES 128 NOTES EST ÉCARTÉ, non replié", () => {
    const haut = parcoursDeGamme("chromatique", 120, 2);
    expect(haut.every((n) => n >= 0 && n <= 127)).toBe(true);
    // Écarté et non replié : la suite reste croissante, sans note retombée au milieu.
    expect([...haut].sort((a, b) => a - b)).toEqual(haut);
    expect(parcoursDeGamme("majeur", -6).every((n) => n >= 0)).toBe(true);
  });

  it("une gamme inconnue retombe sur la majeure, comme ses degrés", () => {
    expect(parcoursDeGamme("gamme-qui-n-existe-pas", DO4)).toEqual(parcoursDeGamme("majeur", DO4));
  });
});
