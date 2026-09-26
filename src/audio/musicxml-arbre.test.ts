// audio/musicxml-arbre.test.ts — Un triolet s'écrit-il comme un triolet ?
//
// CE QUE CES TESTS CONTRÔLENT. Non pas que le fichier « ressemble » à une partition, mais que les
// trois choses dont dépend un n-olet y soient justes : l'unité déclarée, qui doit permettre des
// durées entières ; la valeur imprimée, qui est celle de la note DÉBARRASSÉE du n-olet ; et le
// rapport écrit, trois pour deux. Une gravure fausse sur l'un des trois s'ouvre quand même dans un
// éditeur, et montre autre chose que la pièce.
import { describe, expect, it } from "vitest";

import { lireArbre } from "./arbre-rythmique";
import { arbreVersMusicXML, feuillesDeMesure, valeurEcrite } from "./musicxml-arbre";

const graver = (texte: string, hauteurs: number[] = [60, 62, 64, 65, 67, 69, 71]) =>
  arbreVersMusicXML(lireArbre(texte), hauteurs);

const divisionsDe = (xml: string) => Number(/<divisions>(\d+)<\/divisions>/.exec(xml)![1]);
const durees = (xml: string) => [...xml.matchAll(/<duration>(\d+)<\/duration>/g)].map((m) => Number(m[1]));
const types = (xml: string) => [...xml.matchAll(/<type>([a-z0-9]+)<\/type>/g)].map((m) => m[1]);

describe("aplatir une mesure en feuilles", () => {
  it("garde les durées en fractions exactes", () => {
    const f = feuillesDeMesure(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))")[0]);
    expect(f).toHaveLength(6);
    expect(f[0].duree).toEqual({ n: 1, d: 1 });
    expect(f[1].duree).toEqual({ n: 1, d: 3 });
  });

  it("LA DURÉE ÉCRITE EST DÉBARRASSÉE DU N-OLET : un tiers de noire s'écrit une croche", () => {
    const f = feuillesDeMesure(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))")[0]);
    expect(f[1].ecrite).toEqual({ n: 1, d: 2 });
    expect(f[1].rapport).toEqual({ n: 3, d: 2 });
    expect([f[1].reel, f[1].normal]).toEqual([3, 2]);
  });

  it("LE N-OLET SE COMPTE SUR LA SOMME DES POIDS, et non sur le nombre de parts", () => {
    // Deux parts de poids 2 et 1 valent trois unités : c'est un triolet dont une note en prend
    // deux, et compter les parts en ferait un duolet, ce qui n'a pas de sens.
    const f = feuillesDeMesure(lireArbre("(4/4 ((1 (2 1)) 1 1 1))")[0]);
    expect([f[0].reel, f[0].normal]).toEqual([3, 2]);
    expect(f[0].duree).toEqual({ n: 2, d: 3 });
    expect(f[0].ecrite).toEqual({ n: 1, d: 1 });
  });

  it("les n-olets gigognes multiplient leurs rapports", () => {
    // Un triolet dont la deuxième part se divise en cinq : 3/2 puis 5/4 font 15/8.
    const f = feuillesDeMesure(lireArbre("(4/4 ((1 (1 (1 (1 1 1 1 1)) 1)) 1 1 1))")[0]);
    const dansLeCinq = f.find((x) => x.reel === 5)!;
    expect(dansLeCinq.rapport).toEqual({ n: 15, d: 8 });
  });

  it("un quintolet a pour normal la puissance de deux en dessous", () => {
    const f = feuillesDeMesure(lireArbre("(4/4 ((4 (1 1 1 1 1))))")[0]);
    expect([f[0].reel, f[0].normal]).toEqual([5, 4]);
    const sept = feuillesDeMesure(lireArbre("(4/4 ((4 (1 1 1 1 1 1 1))))")[0]);
    expect([sept[0].reel, sept[0].normal]).toEqual([7, 4]);
  });

  it("une division binaire n'est pas un n-olet", () => {
    const f = feuillesDeMesure(lireArbre("(4/4 ((1 (1 1)) 1 1 1))")[0]);
    expect(f[0].groupe).toBe(0);
    expect(f[0].rapport).toEqual({ n: 1, d: 1 });
  });
});

describe("la valeur imprimée", () => {
  it("nomme les valeurs usuelles, points compris", () => {
    expect(valeurEcrite({ n: 4, d: 1 })).toEqual({ nom: "whole", points: 0 });
    expect(valeurEcrite({ n: 1, d: 1 })).toEqual({ nom: "quarter", points: 0 });
    expect(valeurEcrite({ n: 1, d: 2 })).toEqual({ nom: "eighth", points: 0 });
    expect(valeurEcrite({ n: 3, d: 2 })).toEqual({ nom: "quarter", points: 1 });
    expect(valeurEcrite({ n: 1, d: 4 })).toEqual({ nom: "16th", points: 0 });
  });

  it("prend la plus proche faute d'exacte, au lieu de refuser d'écrire", () => {
    expect(valeurEcrite({ n: 5, d: 7 }).nom).toBeTruthy();
  });
});

describe("graver une mesure", () => {
  it("QUATRE NOIRES : une unité par noire suffit", () => {
    const xml = graver("(4/4 (1 1 1 1))");
    expect(divisionsDe(xml)).toBe(1);
    expect(durees(xml)).toEqual([1, 1, 1, 1]);
    expect(types(xml)).toEqual(["quarter", "quarter", "quarter", "quarter"]);
    expect(xml).not.toContain("time-modification");
  });

  it("UN TRIOLET : l'unité devient trois, et le rapport est écrit", () => {
    const xml = graver("(4/4 (1 (1 (1 1 1)) 1 1))");
    // Sans unité divisible par trois, un tiers de noire ne s'écrirait pas en entier.
    expect(divisionsDe(xml)).toBe(3);
    expect(durees(xml)).toEqual([3, 1, 1, 1, 3, 3]);
    // Les trois notes du triolet s'impriment en CROCHES, ce qui est la notation juste.
    expect(types(xml)).toEqual(["quarter", "eighth", "eighth", "eighth", "quarter", "quarter"]);
    expect(xml).toContain("<actual-notes>3</actual-notes>");
    expect(xml).toContain("<normal-notes>2</normal-notes>");
  });

  it("LE CROCHET S'OUVRE ET SE FERME UNE SEULE FOIS par groupe", () => {
    const xml = graver("(4/4 (1 (1 (1 1 1)) 1 1))");
    expect([...xml.matchAll(/<tuplet type="start"/g)]).toHaveLength(1);
    expect([...xml.matchAll(/<tuplet type="stop"/g)]).toHaveLength(1);
  });

  it("deux triolets font deux crochets", () => {
    const xml = graver("(4/4 ((1 (1 1 1)) (1 (1 1 1)) 1 1))");
    expect([...xml.matchAll(/<tuplet type="start"/g)]).toHaveLength(2);
    expect([...xml.matchAll(/<tuplet type="stop"/g)]).toHaveLength(2);
  });

  it("UN QUINTOLET SUR LA MESURE : l'unité devient cinq", () => {
    const xml = graver("(4/4 ((4 (1 1 1 1 1))))");
    expect(divisionsDe(xml)).toBe(5);
    expect(durees(xml)).toEqual([4, 4, 4, 4, 4]);
    expect(xml).toContain("<actual-notes>5</actual-notes>");
    expect(xml).toContain("<normal-notes>4</normal-notes>");
  });

  it("LE COMPTE SE REFERME : les durées d'une mesure font la mesure", () => {
    for (const texte of [
      "(4/4 (1 1 1 1))", "(4/4 (1 (1 (1 1 1)) 1 1))", "(4/4 ((4 (1 1 1 1 1))))",
      "(3/4 (2 1))", "(6/8 (1 1 (1 (1 1 1))))", "(4/4 (1 -1 (2 (1 1 1))))",
    ]) {
      const xml = graver(texte);
      const div = divisionsDe(xml);
      const m = lireArbre(texte)[0];
      const attendu = (m.metrique[0] * 4 * div) / m.metrique[1];
      expect(durees(xml).reduce((s, d) => s + d, 0), texte).toBe(attendu);
    }
  });

  it("le silence est un silence, et ne consomme pas de hauteur", () => {
    const xml = graver("(4/4 (1 -1 1 1))", [60, 62, 64]);
    expect([...xml.matchAll(/<rest\/>/g)]).toHaveLength(1);
    const pas = [...xml.matchAll(/<step>([A-G])<\/step>/g)].map((x) => x[1]);
    expect(pas).toEqual(["C", "D", "E"]);
  });

  it("une liaison s'écrit, là où le son n'entend qu'une durée plus longue", () => {
    const xml = graver("(4/4 (1 1.0 1 1))");
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(xml).toContain('<tied type="start"/>');
  });

  it("plusieurs mesures, et la métrique n'est réécrite qu'au changement", () => {
    const xml = graver("((4/4 (1 1 1 1)) (3/4 (1 1 1)) (3/4 (1 1 1)))");
    expect([...xml.matchAll(/<measure number=/g)]).toHaveLength(3);
    expect([...xml.matchAll(/<time>/g)]).toHaveLength(2);
  });

  it("LES QUARTS DE TON SURVIVENT À LA GRAVURE, comme sur l'autre chemin", () => {
    const xml = arbreVersMusicXML(lireArbre("(4/4 (1 1))"), [60.5, 69.4]);
    expect(xml).toContain("<alter>0.5</alter>");
    expect(xml).toContain("<alter>0.4</alter>");
  });

  it("ne bute pas sur un arbre vide ni sur une liste de hauteurs vide", () => {
    expect(() => arbreVersMusicXML([], [60])).not.toThrow();
    expect(() => graver("(4/4 (1 1))", [])).not.toThrow();
  });
});
