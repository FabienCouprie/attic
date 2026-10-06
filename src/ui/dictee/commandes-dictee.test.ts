// ui/dictee/commandes-dictee.test.ts — Ce qu'une dictée demande au canevas.
//
// CE QUI EST TENU ICI EST LA LANGUE, et non la reconnaissance : le moteur rend une suite de mots,
// et tout le reste se décide dessus. Les noms d'épreuve sont donnés à la main, pour qu'un cas dise
// une règle et non l'état du catalogue ; les cas qui tiennent le catalogue vivant sont dans
// `src/plugins/dictee-catalogue.test.ts`.
import { describe, expect, it } from "vitest";
import {
  JETON_INCONNU, grammaireDeDictee, interpreterDictee, motsDeCommande, segmenter,
  type NomDicte,
} from "./commandes-dictee";

const NOMS: NomDicte[] = [
  { ficheId: "entree-audio", nom: "entrée audio" },
  { ficheId: "sortie-audio", nom: "sortie audio" },
  { ficheId: "reverberation", nom: "réverbération" },
  { ficheId: "reverbe-convolution", nom: "réverbération à convolution" },
  { ficheId: "compresseur", nom: "compresseur" },
];

const poses = (texte: string) => interpreterDictee(texte, NOMS, "fr")
  .filter((c) => c.quoi === "poser").map((c) => (c as { ficheId: string }).ficheId);

describe("le découpage d'une dictée", () => {
  it("reconnaît un composant dont le nom tient plusieurs mots", () => {
    expect(segmenter("entrée audio", NOMS, "fr"))
      .toEqual([{ sorte: "composant", ficheId: "entree-audio", nom: "entrée audio", longueur: 2 }]);
  });

  it("PREND LE NOM LE PLUS LONG, et non le premier qui commence", () => {
    // S'arrêter sur « réverbération » désignerait un autre composant, puis prendrait « à » pour un
    // mot de liaison et « convolution » pour un inconnu.
    const j = segmenter("réverbération à convolution", NOMS, "fr");
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ sorte: "composant", ficheId: "reverbe-convolution" });
  });

  it("reconnaît les mots de commande, et garde le reste en inconnu", () => {
    const j = segmenter("relier à xyzzy", NOMS, "fr");
    expect(j.map((x) => x.sorte)).toEqual(["commande", "commande", "inconnu"]);
    expect(j[0]).toMatchObject({ geste: "relier" });
    expect(j[1]).toMatchObject({ geste: "vers" });
  });

  it("ne confond pas les langues : un mot anglais n'est pas une commande en français", () => {
    expect(segmenter("undo", NOMS, "fr")[0].sorte).toBe("inconnu");
    expect(segmenter("undo", NOMS, "en")[0]).toMatchObject({ geste: "annuler" });
  });
});

describe("poser et enchaîner", () => {
  it("UN NOM POSE UN COMPOSANT, et trois noms posent une chaîne", () => {
    expect(poses("entrée audio réverbération sortie audio"))
      .toEqual(["entree-audio", "reverberation", "sortie-audio"]);
  });

  it("enchaîne par défaut, et « en parallèle » détache le composant qui suit", () => {
    const c = interpreterDictee("réverbération parallèle compresseur", NOMS, "fr");
    expect(c).toEqual([
      { quoi: "poser", ficheId: "reverberation", nom: "réverbération", parallele: false },
      { quoi: "poser", ficheId: "compresseur", nom: "compresseur", parallele: true },
    ]);
  });

  it("« EN PARALLÈLE » NE VAUT QUE POUR LE SUIVANT, et non pour toute la suite", () => {
    // Un mode qui resterait armé ferait détacher tout ce qu'on dit ensuite, sans qu'on sache
    // comment le refermer.
    const c = interpreterDictee("parallèle réverbération compresseur", NOMS, "fr");
    expect(c.map((x) => (x as { parallele: boolean }).parallele)).toEqual([true, false]);
  });

  it("dit sans composant à sa suite, « en parallèle » ne demande rien", () => {
    expect(interpreterDictee("parallèle", NOMS, "fr")).toEqual([]);
  });
});

describe("relier deux composants", () => {
  it("prend les deux noms qui suivent, le mot de liaison étant facultatif", () => {
    const avec = interpreterDictee("relier réverbération à compresseur", NOMS, "fr");
    const sans = interpreterDictee("relier réverbération compresseur", NOMS, "fr");
    const attendu = [{ quoi: "relier", de: "reverberation", vers: "compresseur" }];
    expect(avec).toEqual(attendu);
    expect(sans).toEqual(attendu);
  });

  it("LES DEUX NOMS NE POSENT RIEN, puisqu'ils désignent des composants déjà là", () => {
    expect(poses("relier réverbération à compresseur")).toEqual([]);
  });

  it("ne demande rien quand il manque un nom", () => {
    expect(interpreterDictee("relier réverbération", NOMS, "fr")).toEqual([]);
  });

  it("rend la main après le lien : ce qui suit se pose de nouveau", () => {
    const c = interpreterDictee("relier réverbération à compresseur sortie audio", NOMS, "fr");
    expect(c).toEqual([
      { quoi: "relier", de: "reverberation", vers: "compresseur" },
      { quoi: "poser", ficheId: "sortie-audio", nom: "sortie audio", parallele: false },
    ]);
  });
});

describe("défaire et s'arrêter", () => {
  it("rend le geste d'annulation et celui d'arrêt", () => {
    expect(interpreterDictee("annuler", NOMS, "fr")).toEqual([{ quoi: "annuler" }]);
    expect(interpreterDictee("terminé", NOMS, "fr")).toEqual([{ quoi: "terminer" }]);
  });

  it("garde l'ordre des gestes, l'annulation ne portant que sur ce qui précède", () => {
    expect(interpreterDictee("réverbération annuler compresseur", NOMS, "fr").map((c) => c.quoi))
      .toEqual(["poser", "annuler", "poser"]);
  });
});

describe("ce que le moteur n'a pas compris", () => {
  it("remonte le jeton d'inconnu, et jette le reste du bruit", () => {
    const c = interpreterDictee(`réverbération ${JETON_INCONNU} euh compresseur`, NOMS, "fr");
    expect(c.map((x) => x.quoi)).toEqual(["poser", "inconnu", "poser"]);
  });
});

describe("la grammaire donnée au moteur", () => {
  it("porte les noms des composants ET les mots de commande", () => {
    const g = grammaireDeDictee(NOMS, "fr");
    expect(g).toContain("réverbération à convolution");
    expect(g).toContain("relier");
    expect(g).toContain("annuler");
  });

  it("ne porte aucun doublon, un nom pouvant être aussi un mot de commande", () => {
    const g = grammaireDeDictee([...NOMS, { ficheId: "x", nom: "annuler" }], "fr");
    expect(new Set(g).size).toBe(g.length);
  });

  it("change avec la langue", () => {
    expect(motsDeCommande("fr")).toContain("relier");
    expect(motsDeCommande("en")).toContain("link");
    expect(motsDeCommande("en")).not.toContain("relier");
  });
});
