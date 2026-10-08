// ui/dictee/commandes-dictee.test.ts — Ce qu'une dictée demande au canevas.
//
// CE QUI EST TENU ICI EST LA LANGUE, et non la reconnaissance : le moteur rend une suite de mots,
// et tout le reste se décide dessus. Les noms d'épreuve sont donnés à la main, pour qu'un cas dise
// une règle et non l'état du catalogue ; les cas qui tiennent le catalogue vivant sont dans
// `src/plugins/dictee-catalogue.test.ts`.
import { describe, expect, it } from "vitest";
import {
  JETON_INCONNU, MOTS_COMMANDE, grammaireDeDictee, interpreterDictee, motsDeCommande,
  porteursSurs, segmenter,
  type ApparieurFlou, type NomDicte,
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

describe("la phrase qui porte la consigne", () => {
  it("UNE PHRASE ORDINAIRE NE POSE QUE CE QU'ELLE NOMME", () => {
    expect(poses("pose un composant entrée audio sur la palette s'il te plaît"))
      .toEqual(["entree-audio"]);
    expect(poses("je voudrais que tu ajoutes une réverbération merci"))
      .toEqual(["reverberation"]);
  });

  it("le nom tout seul marche toujours : la phrase n'est pas obligatoire", () => {
    expect(poses("réverbération")).toEqual(["reverberation"]);
  });

  it("les mots de portage sont reconnus pour ce qu'ils sont, et ne désignent aucun composant", () => {
    // « sur » est déjà le mot de liaison de « relier X à Y » : il reste un geste, ce qui ne demande
    // rien hors d'un « relier ». Ce qui compte est qu'aucun de ces mots ne devienne un composant,
    // et qu'aucun ne retombe en inconnu, où la ressemblance pourrait ensuite le rapprocher d'un nom.
    const j = segmenter("pose un composant sur la palette merci", NOMS, "fr");
    expect(j.map((x) => x.sorte)).not.toContain("composant");
    expect(j.map((x) => x.sorte)).not.toContain("inconnu");
    expect(j.filter((x) => x.sorte === "porteur").length).toBeGreaterThanOrEqual(6);
  });

  it("ILS SONT DANS LA GRAMMAIRE, sans quoi le moteur les fabriquerait avec des noms", () => {
    // Relevé : vocabulaire fermé aux seuls noms, « canevas merci » ressortait en « gamme
    // inversée », et posait un composant que personne n'avait demandé.
    const g = grammaireDeDictee(NOMS, "fr");
    for (const m of ["pose", "un", "sur", "palette", "canevas", "merci", "après"]) {
      expect(g, m).toContain(m);
    }
  });

  it("ET UN NOM DE COMPOSANT NE PEUT PAS DEVENIR UN MOT DE PORTAGE", () => {
    // Sans cette soustraction, un composant qui s'appellerait « Palette » deviendrait indicible.
    const avecCollision = [...NOMS, { ficheId: "palette-a-moi", nom: "palette" }];
    expect(porteursSurs(avecCollision, "fr")).not.toContain("palette");
    expect(porteursSurs(NOMS, "fr")).toContain("palette");
    expect(interpreterDictee("palette", avecCollision, "fr"))
      .toEqual([{ quoi: "poser", ficheId: "palette-a-moi", nom: "palette", parallele: false }]);
  });

  it("le portage n'avale pas un geste : « annuler » reste un geste", () => {
    expect(interpreterDictee("et puis annuler merci", NOMS, "fr")).toEqual([{ quoi: "annuler" }]);
  });

  it("chaque langue a le sien", () => {
    expect(poses("please add a reverberation")).toEqual([]);
    expect(porteursSurs(NOMS, "en")).toContain("please");
    expect(porteursSurs(NOMS, "en")).not.toContain("merci");
  });
});

describe("la ressemblance, quand la reconnaissance a écorché le nom", () => {
  // UN APPARIEUR POSTICHE, et c'est tout l'intérêt de l'injection : ce qui est tenu ici est la
  // PLACE de la ressemblance dans le découpage, non la distance d'édition, qui a ses propres cas
  // dans `plugins/appariement-flou.test.ts`.
  const postiche: ApparieurFlou = (fenetre) => {
    const table: Record<string, { ficheId: string; score: number }> = {
      "spectre gamme": { ficheId: "reverberation", score: 0.85 },
      "spectre": { ficheId: "reverberation", score: 0.60 },
      // Le piège de l'annulation : la fenêtre de trois mots vaut mieux que celle de deux, et si
      // rien ne l'arrête elle avale le geste.
      "vos codeur": { ficheId: "compresseur", score: 0.78 },
      "vos codeur annuler": { ficheId: "reverberation", score: 0.99 },
    };
    return table[fenetre] ?? null;
  };

  it("sans apparieur, un nom écorché reste un inconnu : le comportement d'avant ne bouge pas", () => {
    expect(segmenter("spectre gamme", NOMS, "fr").map((x) => x.sorte)).toEqual(["inconnu", "inconnu"]);
  });

  it("AVEC L'APPARIEUR, le nom écorché désigne son composant, sur toute sa fenêtre", () => {
    const j = segmenter("spectre gamme", NOMS, "fr", postiche);
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ sorte: "composant", ficheId: "reverberation", longueur: 2 });
  });

  it("prend la fenêtre la mieux notée, et non la première qui passe", () => {
    // « spectre » seul passerait à 0,60 ; « spectre gamme » vaut 0,85 et l'emporte.
    expect(segmenter("spectre gamme", NOMS, "fr", postiche)[0]).toMatchObject({ longueur: 2 });
  });

  it("ELLE NE PASSE QU'APRÈS L'EXACT : un nom connu n'est pas rapproché d'un autre", () => {
    const j = segmenter("compresseur", NOMS, "fr", postiche);
    expect(j[0]).toMatchObject({ sorte: "composant", ficheId: "compresseur", longueur: 1 });
  });

  it("ET JAMAIS PAR-DESSUS UNE COMMANDE, sans quoi l'annulation serait avalée", () => {
    // LE MOT QUI PRÉCÈDE DOIT ÊTRE ÉCORCHÉ, sans quoi l'exact l'attrape et la ressemblance n'est
    // même pas consultée : le cas ne tenait alors rien, et le défaut planté passait. L'apparieur
    // postiche offre « vos codeur annuler » à 0,99 contre « vos codeur » à 0,78 : la fenêtre doit
    // s'arrêter avant le mot de commande.
    const j = segmenter("vos codeur annuler", NOMS, "fr", postiche);
    expect(j.map((x) => x.sorte)).toEqual(["composant", "commande"]);
    expect(j[0]).toMatchObject({ ficheId: "compresseur", longueur: 2 });
    expect(j[1]).toMatchObject({ geste: "annuler" });
  });

  it("l'interprète la transmet au découpage", () => {
    expect(interpreterDictee("spectre gamme", NOMS, "fr", postiche))
      .toEqual([{ quoi: "poser", ficheId: "reverberation", nom: "réverbération", parallele: false }]);
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

describe("la grammaire du positionnement", () => {
  const pose = (texte: string) =>
    interpreterDictee(texte, NOMS, "fr").filter((c) => c.quoi === "poser");

  it("UNE PRÉPOSITION DE LIEU DÉSIGNE, ELLE NE CRÉE PAS : un seul composant est posé", () => {
    // Le défaut qui a ouvert ce chantier : la phrase nomme deux composants, mais le second est une
    // adresse. Elle en posait deux.
    const c = pose("ajoute un compresseur après la réverbération");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      ficheId: "compresseur", position: { ou: "apres", refFicheId: "reverberation" },
    });
  });

  it("« avant » prend la même chose par l'autre bout", () => {
    expect(pose("mets un compresseur avant la réverbération")[0]).toMatchObject({
      ficheId: "compresseur", position: { ou: "avant", refFicheId: "reverberation" },
    });
  });

  it("sans préposition, rien ne change : le composant se pose comme avant", () => {
    expect(pose("ajoute un compresseur")[0].position).toBeUndefined();
  });

  it("une adresse SANS NOM derrière elle ne demande rien", () => {
    // Une phrase tronquée ne doit pas poser au hasard : mieux vaut un composant sans position
    // qu'un lien vers ce qu'on n'a pas entendu.
    expect(pose("ajoute un compresseur après")[0].position).toBeUndefined();
  });

  it("une adresse SANS COMPOSANT devant elle ne demande rien non plus", () => {
    expect(interpreterDictee("après la réverbération", NOMS, "fr")).toEqual([]);
  });

  it("une seule adresse par composant : la seconde ne récrit pas la première", () => {
    const c = pose("ajoute un compresseur après la réverbération avant entrée audio");
    expect(c).toHaveLength(1);
    expect(c[0].position).toEqual({ ou: "apres", refFicheId: "reverberation" });
  });

  it("ET « APRÈS » N'EST PLUS UN MOT DE PORTAGE, sans quoi il serait jeté avant d'être lu", () => {
    expect(porteursSurs(NOMS, "fr")).not.toContain("après");
    expect(porteursSurs(NOMS, "en")).not.toContain("after");
    // Il reste dans la grammaire donnée au moteur, par l'autre porte.
    expect(grammaireDeDictee(NOMS, "fr")).toContain("après");
  });

  it("chaque langue a ses prépositions", () => {
    expect(interpreterDictee("add a compresseur after réverbération", NOMS, "en")
      .filter((c) => c.quoi === "poser")[0]?.position)
      .toEqual({ ou: "apres", refFicheId: "reverberation" });
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

describe("les gestes de séance, qui ne touchent pas au graphe", () => {
  const gestes = (texte: string, langue: "fr" | "en" = "fr") =>
    interpreterDictee(texte, NOMS, langue).map((c) => c.quoi);

  it("LANCER, ARRÊTER ET RECENTRER SE DISENT, et ne posent aucun composant", () => {
    expect(gestes("lance")).toEqual(["lancer"]);
    expect(gestes("exécute")).toEqual(["lancer"]);
    expect(gestes("arrête")).toEqual(["arreterExecution"]);
    expect(gestes("halte")).toEqual(["arreterExecution"]);
    expect(gestes("recentre")).toEqual(["recentrer"]);
  });

  it("et en anglais aussi, avec leurs propres mots", () => {
    expect(gestes("run", "en")).toEqual(["lancer"]);
    expect(gestes("halt", "en")).toEqual(["arreterExecution"]);
    expect(gestes("recenter", "en")).toEqual(["recentrer"]);
  });

  it("« STOP » FERME TOUJOURS L'ÉCOUTE, et n'arrête pas le calcul", () => {
    // La confusion coûterait cher dans les deux sens : dire « stop » pour arrêter un calcul
    // fermerait l'écoute, et dire « arrête » pour fermer l'écoute laisserait le micro ouvert.
    expect(gestes("stop")).toEqual(["terminer"]);
    expect(gestes("stop", "en")).toEqual(["terminer"]);
    expect(gestes("arrête")).not.toContain("terminer");
  });

  it("AUCUN MOT N'APPARTIENT À DEUX GESTES, ce qui est la forme de cette règle", () => {
    // Un mot partagé rendrait l'un des deux gestes inatteignable, sans que rien ne le dise.
    for (const langue of ["fr", "en"] as const) {
      const vus = new Map<string, string>();
      for (const [geste, mots] of Object.entries(MOTS_COMMANDE[langue])) {
        for (const mot of mots) {
          expect(vus.get(mot), `« ${mot} » est à la fois ${vus.get(mot)} et ${geste}`).toBeUndefined();
          vus.set(mot, geste);
        }
      }
    }
  });

  it("un composant et un geste dans la même phrase font les deux, dans l'ordre", () => {
    expect(gestes("compresseur lance")).toEqual(["poser", "lancer"]);
    expect(poses("compresseur lance")).toEqual(["compresseur"]);
  });

  it("et un geste ne mange pas le nom qui le suit", () => {
    expect(gestes("recentre compresseur")).toEqual(["recentrer", "poser"]);
    expect(poses("recentre compresseur")).toEqual(["compresseur"]);
  });
});
