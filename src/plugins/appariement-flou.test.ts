// plugins/appariement-flou.test.ts — Retrouver un composant dans un texte qui l'écorche.
//
// LES CAS SONT DES RELEVÉS, non des inventions. Les transcriptions sont celles que Vosk a rendues
// dans l'application le 2026-10-07, sur des prises dites par la synthèse vocale : c'est ce que
// l'appariement doit savoir lire, et c'est ce sur quoi l'appariement mot à mot échouait.
import { describe, expect, it } from "vitest";
import {
  MOTS_PAR_FENETRE, SEUIL_RESSEMBLANCE, apparierFlou, distance, forme, ressemblance,
  type NommeParSonNom,
} from "./appariement-flou";

/** Un catalogue d'épreuve, assez large pour que les voisins se disputent les mêmes mots. */
const CATALOGUE: NommeParSonNom[] = [
  { id: "entree-audio", nom: "Entrée audio" },
  { id: "sortie-audio", nom: "Sortie audio" },
  { id: "compresseur", nom: "Compresseur" },
  { id: "reverberation", nom: "Réverbération" },
  { id: "dereverberation", nom: "Déréverbération" },
  { id: "reverbe-convolution", nom: "Réverbération à convolution (IR)" },
  { id: "spectrogramme", nom: "Spectrogramme" },
  { id: "spectrogramme-son", nom: "Spectrogramme → son" },
  { id: "vocoder", nom: "Vocoder" },
  { id: "granular-freeze", nom: "Granular freeze" },
];

const ids = (texte: string, seuil?: number) =>
  apparierFlou(texte, CATALOGUE, seuil).map((t) => t.id);

describe("la forme comparable", () => {
  it("met en minuscules, retire les marques et la ponctuation", () => {
    expect(forme("Réverbération à convolution (IR)")).toBe("reverberationaconvolutionir");
    expect(forme("  Entrée   audio ! ")).toBe("entreeaudio");
  });

  it("rend une chaîne vide pour ce qui n'a ni lettre ni chiffre", () => {
    expect(forme(" — … ")).toBe("");
  });
});

describe("la distance et la ressemblance", () => {
  it("vaut zéro entre deux chaînes identiques, et la longueur contre le vide", () => {
    expect(distance("abc", "abc")).toBe(0);
    expect(distance("abc", "")).toBe(3);
    expect(distance("", "abc")).toBe(3);
  });

  it("compte une substitution, une insertion et une suppression pour une", () => {
    expect(distance("chat", "chut")).toBe(1);
    expect(distance("chat", "chats")).toBe(1);
    expect(distance("chats", "chat")).toBe(1);
  });

  it("rend une ressemblance de un pour l'identique, de zéro contre le vide", () => {
    expect(ressemblance("abc", "abc")).toBe(1);
    expect(ressemblance("abc", "")).toBe(0);
    expect(ressemblance("", "")).toBe(0);
  });
});

describe("ce que l'appariement mot à mot ne retrouvait pas", () => {
  // Les trois transcriptions relevées, et le composant que chacune désigne réellement.
  it("RETROUVE « spectrogramme » SOUS « spectre grammes »", () => {
    expect(ids("entrée audio granulats de spectre grammes sortie audio"))
      .toEqual(expect.arrayContaining(["entree-audio", "spectrogramme", "sortie-audio"]));
  });

  it("RETROUVE « vocoder » SOUS « vos codeur de face »", () => {
    expect(ids("entrée audio vos codeur de face puis compresseur"))
      .toEqual(expect.arrayContaining(["entree-audio", "vocoder", "compresseur"]));
  });

  it("RETROUVE « réverbération à convolution » SOUS « réverbération à qu'on volution »", () => {
    expect(ids("lecture granulés réverbération à qu'on volution export audio"))
      .toContain("reverbe-convolution");
  });
});

describe("ce qu'il ne doit pas désigner", () => {
  it("NE DÉSIGNE RIEN DANS DE LA PAROLE ORDINAIRE, et c'est ce qui le rend posable", () => {
    // Les deux témoins du relevé. Un appariement flou qui attrape tout ne sert à rien : il poserait
    // des composants sur une phrase qui n'en nomme aucun.
    expect(ids("je voudrais savoir si le train de huit heures est à l'heure")).toEqual([]);
    expect(ids("bonjour comment allez vous depuis la dernière fois")).toEqual([]);
  });

  it("ne désigne rien dans un texte vide ou sans lettre", () => {
    expect(ids("")).toEqual([]);
    expect(ids("   ")).toEqual([]);
    expect(ids("— … !")).toEqual([]);
  });

  it("UN SEUL COMPOSANT PAR FENÊTRE, LE MEILLEUR : le voisin ne suit pas", () => {
    // « spectre grammes » ressemble aussi à `spectrogramme-son`, qui passait le seuil quand on
    // gardait tout ce qui le franchit.
    expect(ids("spectre grammes")).toEqual(["spectrogramme"]);
  });
});

describe("le seuil", () => {
  it("se laisse régler, et plus haut il perd le vocodeur", () => {
    // Sa meilleure ressemblance vaut 0,78 : à 0,80 il disparaît. C'est ce qui a fixé 0,75.
    expect(ids("vos codeur", 0.75)).toContain("vocoder");
    expect(ids("vos codeur", 0.8)).not.toContain("vocoder");
  });

  it("porte la valeur relevée, et une fenêtre assez large pour le plus long des cas", () => {
    expect(SEUIL_RESSEMBLANCE).toBe(0.75);
    // « réverbération à qu'on volution » tient en quatre mots.
    expect(MOTS_PAR_FENETRE).toBeGreaterThanOrEqual(4);
  });
});

describe("ce qu'il rend", () => {
  it("rend le passage qui a désigné le composant, tel qu'il était écrit", () => {
    const t = apparierFlou("entrée audio vos codeur de face", CATALOGUE).find((x) => x.id === "vocoder");
    expect(t?.fenetre).toBe("vos codeur");
    expect(t?.score).toBeGreaterThanOrEqual(SEUIL_RESSEMBLANCE);
  });

  it("classe du plus ressemblant au moins ressemblant", () => {
    const scores = apparierFlou("entrée audio vos codeur de face puis compresseur", CATALOGUE)
      .map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("ne rend qu'une fois un composant nommé deux fois, ET GARDE LE MEILLEUR SCORE", () => {
    // LES DEUX OCCURRENCES ONT DES SCORES DIFFÉRENTS, et la mal dite vient d'abord : avec deux
    // occurrences parfaites, garder la première ou la meilleure revient au même, et le cas ne
    // tenait rien. Planté, le défaut passait.
    const r = apparierFlou("conpresseur puis compresseur", CATALOGUE);
    expect(r.filter((x) => x.id === "compresseur")).toHaveLength(1);
    expect(r.find((x) => x.id === "compresseur")?.score).toBe(1);
    expect(r.find((x) => x.id === "compresseur")?.fenetre).toBe("compresseur");
  });

  it("supporte un catalogue vide, et un composant au nom vide", () => {
    expect(apparierFlou("compresseur", [])).toEqual([]);
    expect(apparierFlou("compresseur", [{ id: "x", nom: "  " }])).toEqual([]);
  });
});

describe("l'écart de longueur, qui est une borne et non une astuce", () => {
  it("n'écarte jamais un appariement que le calcul complet aurait retenu", () => {
    // La distance d'édition vaut au moins l'écart des longueurs : la borne est sûre. On le vérifie
    // en comparant, sur chaque nom du catalogue, le résultat à un calcul sans aucun filtre.
    const texte = "entrée audio vos codeur de face spectre grammes réverbération à qu'on volution";
    const mots = texte.split(/\s+/);
    const aLaMain = new Map<string, number>();
    for (let i = 0; i < mots.length; i++) {
      for (let l = 1; l <= MOTS_PAR_FENETRE && i + l <= mots.length; l++) {
        const f = forme(mots.slice(i, i + l).join(" "));
        let best: { id: string; s: number } | null = null;
        for (const d of CATALOGUE) {
          const s = ressemblance(f, forme(d.nom));
          if (!best || s > best.s) best = { id: d.id, s };
        }
        if (best && best.s >= SEUIL_RESSEMBLANCE) {
          aLaMain.set(best.id, Math.max(aLaMain.get(best.id) ?? 0, best.s));
        }
      }
    }
    const parLaFonction = new Map(apparierFlou(texte, CATALOGUE).map((x) => [x.id, x.score]));
    expect([...parLaFonction.keys()].sort()).toEqual([...aLaMain.keys()].sort());
    for (const [id, s] of aLaMain) expect(parLaFonction.get(id)).toBeCloseTo(s, 12);
  });
});
