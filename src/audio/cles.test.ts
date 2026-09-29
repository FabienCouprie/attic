// audio/cles.test.ts — Les douze clés, et ce qu'elles doivent aux trente-deux listes qu'elles remplacent.
//
// CE QUE CES CAS TIENNENT. D'abord qu'aucune orthographe en usage ne se perd : trente-deux réglages
// offraient les douze clés sous quatre formes, et une valeur enregistrée sous l'une d'elles doit
// retrouver sa clé. Ensuite que les deux réglages tout faits sont cohérents avec le résolveur
// commun, `DEMI_TONS_CLE`, qui ne bouge pas. Enfin que l'héritage du réglage numérique désigne des
// NOMBRES et non des noms : c'est la faute que j'ai faite en écrivant le module, et elle serait
// passée sans bruit, `valeurCanoniqueChoix` laissant tomber un héritage absent des identifiants.
import { describe, expect, it } from "vitest";
import { CLES, CLES_HERITEES, PARAMETRE_CLE, PARAMETRE_TONIQUE, TONIQUES_HERITEES, demiTonDeCle } from "./cles";
import { DEMI_TONS_CLE } from "./commun";
import { valeurCanoniqueChoix } from "../i18n";

/** Les quatre formes que le garde de registre a relevées, recopiées telles quelles. */
const FORMES_EN_USAGE = {
  "dix-sept, sans traduction française": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  "six, au croisillon": ["Do", "Do#", "Ré", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"],
  "neuf, au signe typographique": ["Do", "Do♯", "Ré", "Mi♭", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "Si♭", "Si"],
  "les identifiants bémolisés": ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
};

describe("les douze clés", () => {
  it("SONT DOUZE, DANS L'ORDRE CHROMATIQUE, ET SANS TROU", () => {
    expect(CLES.map((c) => c.demiTon)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(CLES.map((c) => c.fr)).size).toBe(12);
    expect(new Set(CLES.map((c) => c.en)).size).toBe(12);
  });

  it("S'ACCORDENT AVEC LE RÉSOLVEUR COMMUN, qui ne bouge pas", () => {
    for (const c of CLES) {
      expect(DEMI_TONS_CLE[c.en], `${c.en} vu par DEMI_TONS_CLE`).toBe(c.demiTon);
      expect(demiTonDeCle(c.en), `${c.en} vu par demiTonDeCle`).toBe(c.demiTon);
      expect(demiTonDeCle(c.fr), `${c.fr} vu par demiTonDeCle`).toBe(c.demiTon);
    }
    expect(demiTonDeCle("clé-qui-n-existe-pas")).toBeUndefined();
  });

  it("AUCUNE ORTHOGRAPHE EN USAGE NE SE PERD, sur les quatre formes relevées", () => {
    for (const [quoi, forme] of Object.entries(FORMES_EN_USAGE)) {
      forme.forEach((ancien, rang) => {
        expect(demiTonDeCle(ancien), `« ${ancien} » de la forme « ${quoi} »`).toBe(rang);
      });
    }
  });

  it("LES IDENTIFIANTS EN MINUSCULES SONT COUVERTS, bémol typographique compris", () => {
    // LA CINQUIÈME ORTHOGRAPHE, trouvée en migrant : « c, c#, d, e♭, … » que ni `DEMI_TONS_CLE` ni
    // le premier garde ne voyaient, et qui était pourtant enregistrée dans des projets.
    const minuscules = ["c", "c#", "d", "e♭", "e", "f", "f#", "g", "g#", "a", "b♭", "b"];
    minuscules.forEach((ancien, rang) => {
      expect(demiTonDeCle(ancien), `« ${ancien} »`).toBe(rang);
    });
  });

  it("UN SIGNE SEUL NE DÉSIGNE AUCUNE NOTE, et c'est ce qu'un remplacement global aurait fait", () => {
    expect(demiTonDeCle("♭")).toBeUndefined();
    expect(demiTonDeCle("♭b")).toBeUndefined();
  });

  it("L'ENHARMONIE EST COUVERTE DANS LES DEUX SENS", () => {
    expect(demiTonDeCle("D#")).toBe(3);
    expect(demiTonDeCle("Eb")).toBe(3);
    expect(demiTonDeCle("Ré♯")).toBe(3);
    expect(demiTonDeCle("A#")).toBe(10);
    expect(demiTonDeCle("Bb")).toBe(10);
    expect(demiTonDeCle("La♯")).toBe(10);
  });
});

describe("les deux réglages tout faits", () => {
  it("OFFRENT LES DOUZE, ET LEURS TROIS LISTES ONT LA MÊME LONGUEUR", () => {
    for (const p of [PARAMETRE_CLE, PARAMETRE_TONIQUE]) {
      expect(p.options!.length, p.nom).toBe(12);
      expect(p.optionsEn!.length, p.nom).toBe(12);
      expect(p.optionIds!.length, p.nom).toBe(12);
    }
    expect(PARAMETRE_CLE.optionIds).toEqual(CLES.map((c) => c.en));
    expect(PARAMETRE_TONIQUE.optionIds).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });

  it("L'HÉRITAGE DU RÉGLAGE NUMÉRIQUE DÉSIGNE DES NOMBRES, et non des noms", () => {
    // LA FAUTE QUE CE CAS EXISTE POUR EMPÊCHER. `valeurCanoniqueChoix` n'accepte un héritage que
    // s'il figure dans les `optionIds` : un héritage qui rendrait « Eb » à un réglage numéroté
    // tomberait dans le vide, sans erreur et sans trace, et le projet retomberait sur do.
    for (const designe of Object.values(TONIQUES_HERITEES)) {
      expect(PARAMETRE_TONIQUE.optionIds).toContain(designe);
    }
    for (const designe of Object.values(CLES_HERITEES)) {
      expect(PARAMETRE_CLE.optionIds).toContain(designe);
    }
  });

  it("UNE VALEUR ENREGISTRÉE SOUS N'IMPORTE QUELLE FORME RETROUVE SA CLÉ", () => {
    // Le chemin réel : ce que `valeurCanoniqueChoix` fait d'une valeur lue dans un projet.
    for (const [quoi, forme] of Object.entries(FORMES_EN_USAGE)) {
      forme.forEach((ancien, rang) => {
        expect(valeurCanoniqueChoix(PARAMETRE_CLE, ancien), `« ${ancien} » de « ${quoi} » vers un nom`)
          .toBe(CLES[rang].en);
        expect(valeurCanoniqueChoix(PARAMETRE_TONIQUE, ancien), `« ${ancien} » de « ${quoi} » vers un nombre`)
          .toBe(String(rang));
      });
    }
  });

  it("et une valeur qu'aucune forme ne connaît ressort telle quelle", () => {
    expect(valeurCanoniqueChoix(PARAMETRE_CLE, "Ut")).toBe("Ut");
  });
});
