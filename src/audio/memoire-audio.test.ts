// audio/memoire-audio.test.ts — Ce qu'un tampon coute, et le seuil qui s'en deduit.
//
// CES DEUX BLOCS VIVAIENT DANS `core/memoire.test.ts`, et ils n'avaient rien a y faire : ils comptent
// des octets de flottants 32 bits et des en-tetes WAV, c'est-a-dire l'arithmetique d'UN domaine. Le
// seuil de dix minutes qu'ils verifient n'est pas un gout : il vient de ces chiffres-la. Un domaine
// d'images aurait les siens.
//
// Ce qui est reste dans le coeur parle de graphe et d'interface : quel noeud est regarde, ce qu'une
// bulle repliee garde, ce qu'une boucle depliee retient. Rien qui suppose un son.
import { describe, it, expect } from "vitest";
import {
  apercuUtileDuree, DUREE_LONGUE_S, octetsApercu, octetsTampon,
} from "./memoire-audio";
// Le fait de graphe vient du cœur ; ce qu'il coûte en octets est ici. La direction est la bonne.
import { noeudRegarde } from "../core/memoire";

// En megaoctets decimaux, l'unite de l'en-tete du module : 1,27 Go veut dire 1 270 000 000 octets.
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
    expect(apercuUtileDuree({ dureeS: 30, regarde: false })).toBe(true);
  });

  it("juste sous le seuil, encore", () => {
    expect(apercuUtileDuree({ dureeS: DUREE_LONGUE_S - 1, regarde: false })).toBe(true);
  });

  it("au seuil exactement, un intermédiaire n'a plus d'aperçu", () => {
    expect(apercuUtileDuree({ dureeS: DUREE_LONGUE_S, regarde: false })).toBe(false);
  });

  it("sur une piste longue, le nœud que l'on regarde garde le sien", () => {
    expect(apercuUtileDuree({ dureeS: 3600, regarde: true })).toBe(true);
  });

  it("une heure sur cinq intermédiaires : 4,8 Go d'aperçus évités au défaut", () => {
    const evites = [1, 2, 3, 4, 5].filter(() => !apercuUtileDuree({ dureeS: 3600, regarde: false })).length;
    // Le seuil rapporte d'autant plus que la profondeur monte : 3,2 Go évités en seize bits,
    // 4,8 en vingt-quatre. Porter l'écriture à vingt-quatre le rend plus nécessaire, pas moins.
    expect(Mo(evites * octetsApercu(3600, 2, 44100, 16))).toBe(3175);
    expect(Mo(evites * octetsApercu(3600))).toBe(4763);
  });
});

// ── CE QUE LES FAITS DE GRAPHE COÛTENT, EN OCTETS ──
//
// Ces trois cas vivaient dans `core/memoire.test.ts`. Ils s'appuient sur un fait de graphe — un
// membre de bulle repliée n'est pas regardé, un intermédiaire dans un méta non plus — mais CE QU'ILS
// VÉRIFIENT est un chiffre du domaine : trois virgule huit gigaoctets de tampons, deux virgule neuf
// d'aperçus. Le fait vient du cœur, le chiffre est ici, et la direction de l'import le dit.
describe("ce que ces faits de graphe coûtent, en octets", () => {
  const dedans = [{ source: "premier", target: "milieu" }, { source: "milieu", target: "dernier" }];
  const chaine = [{ source: "a", target: "b" }, { source: "b", target: "c" }];

  it("sur une piste longue, aucun aperçu ne se construit dans un méta non sélectionné", () => {
    const regarde = noeudRegarde({ id: "dernier", selectionne: false, aretes: dedans, dansUnMeta: true });
    expect(apercuUtileDuree({ dureeS: 3600, regarde })).toBe(false);
  });

  it("trois membres d'une heure en stéréo, ce sont 3,8 Go de tampons rendus", () => {
    expect(Mo(3 * octetsTampon(3600))).toBe(3810);
  });

  it("sur une heure de stéréo, trois membres repliés cessent de retenir 2,9 Go d'aperçus", () => {
    const regarde = noeudRegarde({ id: "b", selectionne: false, aretes: chaine, cacheParBulle: true });
    expect(apercuUtileDuree({ dureeS: 3600, regarde })).toBe(false);
    // Trois membres, à 953 Mo d'aperçu chacun en stéréo vingt-quatre bits.
    expect(Mo(octetsApercu(3600, 2, 44100, 24))).toBe(953);
    expect(Mo(3 * octetsApercu(3600, 2, 44100, 24))).toBe(2858);
  });
});
