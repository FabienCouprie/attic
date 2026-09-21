import { describe, it, expect } from "vitest";
import { DUREE_LONGUE_S, apercuUtile, noeudRegarde, octetsApercu, octetsTampon } from "./memoire";

// En mégaoctets décimaux, l'unité de l'en-tête du module : 1,27 Go veut dire 1 270 000 000 octets.
const Mo = (o: number) => Math.round(o / 1e6);

describe("ce qu'une piste coûte", () => {
  it("une heure en stéréo pèse 1,27 Go de tampon", () => {
    expect(Mo(octetsTampon(3600))).toBe(1270);
  });

  it("L'APERÇU COÛTE CE QUE SA PROFONDEUR COÛTE, et ce n'est plus la moitié du tampon", () => {
    // L'écriture était bloquée en seize bits, où l'aperçu pesait exactement la moitié du tampon.
    // Elle ne l'est plus : le même blob sert d'aperçu et de fichier livré, si bien que la
    // profondeur d'écriture se paie ici, en mémoire vive retenue.
    expect(octetsApercu(3600, 2, 44100, 16) - 44).toBe(octetsTampon(3600) / 2);
    expect(octetsApercu(3600, 2, 44100, 24) - 44).toBe((octetsTampon(3600) * 3) / 4);
    // En flottant, l'aperçu est une copie exacte du tampon : même taille, à l'en-tête près.
    expect(octetsApercu(3600, 2, 44100, 32) - 56).toBe(octetsTampon(3600));
  });

  it("l'en-tête d'un fichier flottant compte douze octets de plus, et on les compte", () => {
    // Hors PCM, la norme réclame deux octets au bloc `fmt ` et un bloc `fact` entier.
    expect(octetsApercu(0, 2, 44100, 16)).toBe(44);
    expect(octetsApercu(0, 2, 44100, 32)).toBe(56);
  });

  it("un nœud qui a tourné sur une heure retient les deux, près de 2,2 Go au défaut", () => {
    expect(Mo(octetsTampon(3600) + octetsApercu(3600))).toBe(2223);
    // Et 1,9 Go si l'on revient à seize bits, ce que le chiffre historique disait.
    expect(Mo(octetsTampon(3600) + octetsApercu(3600, 2, 44100, 16))).toBe(1905);
  });

  it("dix minutes coûtent 370 Mo par nœud, cinq nœuds tiennent sous 1,9 Go", () => {
    expect(Mo(octetsTampon(DUREE_LONGUE_S))).toBe(212);
    expect(Mo(octetsApercu(DUREE_LONGUE_S))).toBe(159);
    const parNoeud = octetsTampon(DUREE_LONGUE_S) + octetsApercu(DUREE_LONGUE_S);
    expect(Mo(parNoeud)).toBe(370);
    expect(Mo(parNoeud * 5)).toBeLessThan(1900);
  });

  it("le mono coûte la moitié du stéréo", () => {
    expect(octetsTampon(60, 1)).toBe(octetsTampon(60, 2) / 2);
  });
});

describe("garder ou non l'aperçu écoutable", () => {
  it("sur une piste courte, toujours — même un nœud que personne ne regarde", () => {
    expect(apercuUtile({ dureeS: 30, regarde: false })).toBe(true);
  });

  it("juste sous le seuil, encore", () => {
    expect(apercuUtile({ dureeS: DUREE_LONGUE_S - 1, regarde: false })).toBe(true);
  });

  it("au seuil exactement, un intermédiaire n'a plus d'aperçu", () => {
    expect(apercuUtile({ dureeS: DUREE_LONGUE_S, regarde: false })).toBe(false);
  });

  it("sur une piste longue, le nœud que l'on regarde garde le sien", () => {
    expect(apercuUtile({ dureeS: 3600, regarde: true })).toBe(true);
  });

  it("une heure sur cinq intermédiaires : 4,8 Go d'aperçus évités au défaut", () => {
    const evites = [1, 2, 3, 4, 5].filter(() => !apercuUtile({ dureeS: 3600, regarde: false })).length;
    // Le seuil rapporte d'autant plus que la profondeur monte : 3,2 Go évités en seize bits,
    // 4,8 en vingt-quatre. Porter l'écriture à vingt-quatre le rend plus nécessaire, pas moins.
    expect(Mo(evites * octetsApercu(3600, 2, 44100, 16))).toBe(3175);
    expect(Mo(evites * octetsApercu(3600))).toBe(4763);
  });
});

describe("quel nœud est regardé", () => {
  // source → filtre → sortie
  const chaine = [{ source: "source" }, { source: "filtre" }];

  it("le dernier de la chaîne : rien ne consomme sa sortie", () => {
    expect(noeudRegarde({ id: "sortie", selectionne: false, aretes: chaine })).toBe(true);
  });

  it("un intermédiaire non sélectionné : un passage, pas une destination", () => {
    expect(noeudRegarde({ id: "filtre", selectionne: false, aretes: chaine })).toBe(false);
  });

  it("le même intermédiaire, une fois cliqué", () => {
    expect(noeudRegarde({ id: "filtre", selectionne: true, aretes: chaine })).toBe(true);
  });

  it("un nœud seul, sans aucune arête, est terminal", () => {
    expect(noeudRegarde({ id: "seul", selectionne: false, aretes: [] })).toBe(true);
  });

  it("une branche qui se divise : les deux feuilles sont regardées, pas le tronc", () => {
    const fourche = [{ source: "tronc" }, { source: "tronc" }];
    expect(noeudRegarde({ id: "tronc", selectionne: false, aretes: fourche })).toBe(false);
    expect(noeudRegarde({ id: "feuilleA", selectionne: false, aretes: fourche })).toBe(true);
  });
});

describe("dans un méta-composant, personne n'est une destination", () => {
  const dedans = [{ source: "premier" }, { source: "milieu" }];

  it("le dernier nœud du dedans n'est terminal que par accident de découpage", () => {
    expect(noeudRegarde({ id: "dernier", selectionne: false, aretes: dedans, dansUnMeta: true })).toBe(false);
  });

  it("le même nœud, hors d'un méta, est bien la fin de la chaîne", () => {
    expect(noeudRegarde({ id: "dernier", selectionne: false, aretes: dedans, dansUnMeta: false })).toBe(true);
  });

  it("la sélection reste le seul moyen de désigner ce qu'on veut entendre", () => {
    expect(noeudRegarde({ id: "milieu", selectionne: true, aretes: dedans, dansUnMeta: true })).toBe(true);
  });

  it("un intermédiaire du dedans n'est pas regardé non plus", () => {
    expect(noeudRegarde({ id: "milieu", selectionne: false, aretes: dedans, dansUnMeta: true })).toBe(false);
  });

  it("sur une piste longue, aucun aperçu ne se construit dans un méta non sélectionné", () => {
    const regarde = noeudRegarde({ id: "dernier", selectionne: false, aretes: dedans, dansUnMeta: true });
    expect(apercuUtile({ dureeS: 3600, regarde })).toBe(false);
  });
});
