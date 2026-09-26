// ui/ligne-temps-calcul.test.ts — Le filet posé AVANT de généraliser la ligne de temps.
//
// POURQUOI MAINTENANT. La ligne de temps du Montage n'avait aucun test, et elle va servir à un
// second composant dont les barres ne veulent pas dire la même chose : dans le Montage la largeur
// d'une barre est la durée MESURÉE d'un son, en lecture seule ; dans la Maquette ce serait un
// réglage, donc en écriture. Généraliser sans filet, c'est déplacer une interaction dont personne
// ne sait plus ce qu'elle faisait.
//
// CE QUE CES TESTS DÉCRIVENT EST L'ÉTAT PRÉSENT, non l'état souhaitable. Deux coins en témoignent et
// sont consignés tels quels : un réglage vide vaut zéro et non son défaut, `Number("")` valant zéro ;
// et une piste dont la durée est inconnue s'affiche sur deux secondes nominales. Les corriger ici
// aurait fait passer pour une généralisation ce qui serait un changement de comportement.
import { describe, expect, it } from "vitest";

import {
  DUREE_INCONNUE, MODELE_MAQUETTE, MODELE_MONTAGE, disposerPistes, echelle, pasDeGraduation,
  valeurAuRepos, valeurDuGeste,
  type LigneMontage, type PisteMontage,
} from "./ligne-temps-calcul";

const ligne = (p: Partial<LigneMontage> = {}): LigneMontage =>
  ({ k: 0, connue: true, duree: 4, debut: 0, gain: 0, transposition: 0, entree: 0.01, sortie: 0.01, ...p });

describe("le pas de graduation", () => {
  it("NE PREND QUE 1, 2, 5 OU 10 fois une puissance de dix", () => {
    for (const etendue of [0.5, 1, 3, 4, 12, 47, 300, 1800]) {
      const pas = pasDeGraduation(etendue, 600);
      const mantisse = pas / Math.pow(10, Math.floor(Math.log10(pas)));
      expect([1, 2, 5, 10].some((m) => Math.abs(mantisse - m) < 1e-9), `${etendue} s donne ${pas}`).toBe(true);
    }
  });

  it("LAISSE ASSEZ DE PLACE À CHAQUE ÉTIQUETTE : jamais plus d'une graduation par 70 pixels", () => {
    for (const etendue of [4, 12, 47, 300]) {
      for (const largeur of [200, 400, 900]) {
        const combien = etendue / pasDeGraduation(etendue, largeur);
        expect(combien, `${etendue} s sur ${largeur} px`).toBeLessThanOrEqual(largeur / 70 + 1);
      }
    }
  });

  it("GRANDIT AVEC L'ÉTENDUE et rétrécit avec la largeur", () => {
    expect(pasDeGraduation(600, 400)).toBeGreaterThan(pasDeGraduation(6, 400));
    expect(pasDeGraduation(600, 1600)).toBeLessThanOrEqual(pasDeGraduation(600, 200));
  });

  it("ne rend jamais zéro, même sur une étendue nulle ou une largeur nulle", () => {
    for (const [e, l] of [[0, 400], [4, 0], [0, 0], [1e-9, 1]] as const) {
      expect(pasDeGraduation(e, l), `${e} / ${l}`).toBeGreaterThan(0);
    }
  });
});

describe("la disposition des pistes", () => {
  const params = {
    "Début 1": 1.5, "Gain 1": -3, "Fondu entrée 1": 250, "Fondu sortie 1": 500,
    "Début 3": 7,
  };

  it("SUIT LE NUMÉRO DE PISTE, et non l'ordre où les câbles ont été tirés", () => {
    const lignes = disposerPistes([2, 0], [], params);
    expect(lignes.map((l) => l.k)).toEqual([0, 2]);
  });

  it("LES FONDUS PASSENT DES MILLISECONDES AUX SECONDES", () => {
    const [l] = disposerPistes([0], [], params);
    expect(l.entree).toBeCloseTo(0.25, 12);
    expect(l.sortie).toBeCloseTo(0.5, 12);
  });

  it("UNE PISTE SANS DURÉE MESURÉE EST DITE INCONNUE, et montrée sur une durée nominale", () => {
    const [l] = disposerPistes([0], [], params);
    expect(l.connue).toBe(false);
    expect(l.duree).toBe(DUREE_INCONNUE);
  });

  it("LA DURÉE MESURÉE L'EMPORTE dès que le graphe a tourné", () => {
    const pistes: PisteMontage[] = [{ piste: 0, duree: 12.5 }];
    const [l] = disposerPistes([0], pistes, params);
    expect(l.connue).toBe(true);
    expect(l.duree).toBe(12.5);
  });

  it("UN RÉGLAGE ABSENT PREND SON DÉFAUT, qui dépend du rang de la piste", () => {
    const [l] = disposerPistes([4], [], {});
    expect(l.debut).toBe(8);
    expect(l.gain).toBe(0);
    expect(l.entree).toBeCloseTo(0.01, 12);
  });

  it("UN RÉGLAGE VIDE VAUT ZÉRO, et non son défaut", () => {
    // Consigné tel quel : `Number("")` vaut zéro, donc la valeur est tenue pour finie. Le corriger
    // serait un changement de comportement, non une extraction.
    const [l] = disposerPistes([4], [], { "Début 5": "" });
    expect(l.debut).toBe(0);
  });

  it("un réglage illisible retombe sur le défaut", () => {
    const [l] = disposerPistes([1], [], { "Début 2": "abc" });
    expect(l.debut).toBe(2);
  });

  it("aucune piste branchée ne donne aucune ligne", () => {
    expect(disposerPistes([], [{ piste: 0, duree: 3 }], params)).toEqual([]);
  });
});

describe("l'échelle de la vue", () => {
  it("MONTRE TOUJOURS ZÉRO, même quand tout commence plus tard", () => {
    expect(echelle([ligne({ debut: 30, duree: 2 })]).debutMin).toBe(0);
  });

  it("DESCEND SOUS ZÉRO pour un début négatif, qui est permis au Montage", () => {
    expect(echelle([ligne({ debut: -5 })]).debutMin).toBe(-5);
  });

  it("COUVRE LA DERNIÈRE FIN, avec un peu d'air", () => {
    const { debutMin, etendue } = echelle([ligne({ debut: 0, duree: 10 })]);
    expect(debutMin + etendue).toBeGreaterThanOrEqual(10);
    expect(etendue).toBeCloseTo(10.8, 9);
  });

  it("NE DESCEND PAS SOUS QUATRE SECONDES : une piste très courte ne prend pas toute la largeur", () => {
    expect(echelle([ligne({ debut: 0, duree: 0.2 })]).etendue).toBe(4);
  });

  it("tient compte de toutes les pistes, pas seulement de la première", () => {
    const { etendue } = echelle([ligne({ k: 0, debut: 0, duree: 2 }), ligne({ k: 1, debut: 40, duree: 2 })]);
    expect(etendue).toBeGreaterThan(42);
  });
});

describe("ce qu'un geste écrit", () => {
  it("DÉPLACER LE CORPS ÉCRIT LE DÉBUT, au centième de seconde", () => {
    const g = valeurDuGeste({ piste: 0, quoi: "corps", valeur0: 1 }, 2.3456, ligne());
    expect(g).toEqual({ nom: "Début 1", valeur: 3.35 });
  });

  it("LE NOM PORTE LE NUMÉRO DE LA PISTE, non son rang d'affichage", () => {
    const g = valeurDuGeste({ piste: 5, quoi: "corps", valeur0: 0 }, 1, ligne({ k: 5 }));
    expect(g.nom).toBe("Début 6");
  });

  it("UN DÉBUT PEUT DEVENIR NÉGATIF : on entre alors dans un son déjà commencé", () => {
    expect(valeurDuGeste({ piste: 0, quoi: "corps", valeur0: 1 }, -3, ligne()).valeur).toBe(-2);
  });

  it("LE COIN GAUCHE TIRÉ VERS LA DROITE ALLONGE LE FONDU D'ENTRÉE, en millisecondes", () => {
    const g = valeurDuGeste({ piste: 0, quoi: "entree", valeur0: 0.25 }, 0.5, ligne());
    expect(g).toEqual({ nom: "Fondu entrée 1", valeur: 750 });
  });

  it("LE COIN DROIT TIRÉ VERS LA GAUCHE ALLONGE LE FONDU DE SORTIE : le signe s'inverse", () => {
    const g = valeurDuGeste({ piste: 0, quoi: "sortie", valeur0: 0.25 }, -0.5, ligne());
    expect(g).toEqual({ nom: "Fondu sortie 1", valeur: 750 });
  });

  it("UN FONDU NE DÉPASSE JAMAIS LA DURÉE DE LA PISTE, ni ne descend sous zéro", () => {
    const l = ligne({ duree: 4 });
    expect(valeurDuGeste({ piste: 0, quoi: "entree", valeur0: 0 }, 100, l).valeur).toBe(4000);
    expect(valeurDuGeste({ piste: 0, quoi: "entree", valeur0: 0 }, -100, l).valeur).toBe(0);
    expect(valeurDuGeste({ piste: 0, quoi: "sortie", valeur0: 0 }, 100, l).valeur).toBe(0);
  });

  it("un geste nul ne change rien", () => {
    expect(valeurDuGeste({ piste: 0, quoi: "corps", valeur0: 2.5 }, 0, ligne()).valeur).toBe(2.5);
    expect(valeurDuGeste({ piste: 0, quoi: "entree", valeur0: 0.01 }, 0, ligne()).valeur).toBe(10);
  });
});

// ── Ce que la généralisation ajoute ────────────────────────────────────

describe("les deux modèles de barre", () => {
  it("DISENT LEUR DIFFÉRENCE : la largeur vient de la mesure ou du réglage", () => {
    expect(MODELE_MONTAGE.largeur).toBe("mesuree");
    expect(MODELE_MAQUETTE.largeur).toBe("reglee");
  });

  it("NE PORTENT PAS LES MÊMES POIGNÉES : des fondus d'un côté, une durée de l'autre", () => {
    expect(MODELE_MONTAGE.poignees).toEqual(["entree", "sortie"]);
    expect(MODELE_MAQUETTE.poignees).toEqual(["duree"]);
  });
});

describe("la largeur d'une barre de maquette", () => {
  it("VIENT DU RÉGLAGE quand il est posé", () => {
    const [l] = disposerPistes([0], [{ piste: 0, duree: 3 }], { "Durée 1": 9 }, MODELE_MAQUETTE);
    expect(l.duree).toBe(9);
  });

  it("RETOMBE SUR LA DURÉE MESURÉE quand le réglage est à zéro, qui veut dire « celle du contenu »", () => {
    const [l] = disposerPistes([0], [{ piste: 0, duree: 3 }], { "Durée 1": 0 }, MODELE_MAQUETTE);
    expect(l.duree).toBe(3);
    expect(l.connue).toBe(true);
  });

  it("reste nominale tant que le graphe n'a pas tourné", () => {
    const [l] = disposerPistes([0], [], { "Durée 1": 0 }, MODELE_MAQUETTE);
    expect(l.duree).toBe(DUREE_INCONNUE);
    expect(l.connue).toBe(false);
  });

  it("LE MONTAGE IGNORE CE RÉGLAGE : un paramètre d'un composant ne déborde pas sur l'autre", () => {
    const [l] = disposerPistes([0], [{ piste: 0, duree: 3 }], { "Durée 1": 9 }, MODELE_MONTAGE);
    expect(l.duree).toBe(3);
  });

  it("la transposition est lue, et vaut zéro quand elle n'est pas posée", () => {
    const [a] = disposerPistes([0], [], { "Transposition 1": -12 }, MODELE_MAQUETTE);
    const [b] = disposerPistes([0], [], {}, MODELE_MAQUETTE);
    expect(a.transposition).toBe(-12);
    expect(b.transposition).toBe(0);
  });
});

describe("tirer le bord droit d'une boîte", () => {
  it("ÉCRIT LA DURÉE, en secondes et au centième comme le début", () => {
    const g = valeurDuGeste({ piste: 0, quoi: "duree", valeur0: 4 }, 2.3456, ligne());
    expect(g).toEqual({ nom: "Durée 1", valeur: 6.35 });
  });

  it("NE DESCEND PAS SOUS UN CENTIÈME : une boîte sans largeur n'a plus de bord à saisir", () => {
    expect(valeurDuGeste({ piste: 0, quoi: "duree", valeur0: 4 }, -100, ligne()).valeur).toBe(0.01);
  });

  it("LE GESTE PART DE LA LARGEUR MONTRÉE, non de zéro, même si le réglage est à zéro", () => {
    // La barre montre la durée du contenu ; saisir son bord doit continuer depuis là, faute de
    // quoi la boîte sauterait à un centième au premier pixel.
    const [l] = disposerPistes([0], [{ piste: 0, duree: 3 }], { "Durée 1": 0 }, MODELE_MAQUETTE);
    expect(valeurAuRepos("duree", l)).toBe(3);
    expect(valeurDuGeste({ piste: 0, quoi: "duree", valeur0: valeurAuRepos("duree", l) }, 1, l).valeur).toBe(4);
  });

  it("chaque poignée part de sa propre valeur", () => {
    const l = ligne({ debut: 2, duree: 4, entree: 0.25, sortie: 0.5 });
    expect(valeurAuRepos("corps", l)).toBe(2);
    expect(valeurAuRepos("entree", l)).toBe(0.25);
    expect(valeurAuRepos("sortie", l)).toBe(0.5);
    expect(valeurAuRepos("duree", l)).toBe(4);
  });
});
