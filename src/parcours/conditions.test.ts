// parcours/conditions.test.ts — Ce que la liste de contrôle doit dire, et pas seulement décider.
//
// LE TEST QUI COMPTE N'EST PAS CELUI DE LA COCHE. Qu'une condition satisfaite soit satisfaite se
// vérifie en trois lignes et n'apprend rien. Ce qui se vérifie ici est la PHRASE rendue dans
// chacune des situations où un élève se retrouve : le nœud absent, le nœud posé mais pas lancé, le
// nœud lancé mais mal réglé, les deux nœuds présents mais non reliés. Ce sont quatre échecs
// différents, et un parcours qui les dirait tous « non réussi » ne servirait à rien.
//
// LE SECOND : L'ORDRE DES ÉTAPES. On signale l'absence avant le réglage — on ne règle pas un nœud
// qu'on n'a pas posé — et le défaut de branchement en dernier, puisqu'il suppose les deux nœuds là.
// Inverser cet ordre donnerait des phrases exactes et inutiles, du genre « sa durée doit atteindre
// 3 » à quelqu'un qui n'a encore rien dans son atelier.
import { describe, expect, it } from "vitest";
import { instantane, type NoeudBrut } from "./atelier";
import { chiffre, examiner, tousCoches } from "./conditions";
import type { Condition, Critere } from "./types";

const FICHES: Record<string, { univers: string; famille: string }> = {
  "generateur-frequence": { univers: "Entrées", famille: "Génération" },
  compresseur: { univers: "Traitement", famille: "Effets" },
  limiteur: { univers: "Traitement", famille: "Effets" },
  normaliseur: { univers: "Traitement", famille: "Effets" },
};
const info = (id: string) => FICHES[id];

const n = (id: string, ficheId: string, parametres: Record<string, string | number> = {}, rendu = false): NoeudBrut =>
  ({ id, data: { ficheId, parametres, ...(rendu ? { audioResultatMessage: "fait" } : {}) } });

const atelier = (noeuds: NoeudBrut[], liens: { source: string; target: string }[] = []) =>
  instantane(noeuds, liens, info);

const GEN: Critere = { fiches: ["generateur-frequence"], quoi: "un générateur", quoiEn: "a generator" };
const COMP: Critere = { fiches: ["compresseur"], quoi: "le compresseur", quoiEn: "the compressor" };
const LIM: Critere = { fiches: ["limiteur"], quoi: "un limiteur", quoiEn: "a Limiter" };

/** La première phrase française rendue par une condition. */
const dit = (c: Condition, a: ReturnType<typeof atelier>) => examiner(c, a).map((p) => p.texte).join(" | ");

describe("un nœud demandé", () => {
  const cond: Condition = { sorte: "present", critere: GEN };

  it("absent : on dit ce qui manque", () => {
    expect(dit(cond, atelier([]))).toBe("Il manque un générateur.");
    expect(tousCoches(examiner(cond, atelier([])))).toBe(false);
  });

  it("présent : la phrase se met à la majuscule toute seule", () => {
    expect(dit(cond, atelier([n("g", "generateur-frequence")]))).toBe("Un générateur : posé.");
  });

  it("PRÉSENT MAIS PAS LANCÉ : ce n'est ni « absent » ni « réussi »", () => {
    const exige: Condition = { sorte: "present", critere: { ...GEN, rendu: true } };
    expect(dit(exige, atelier([n("g", "generateur-frequence")]))).toBe("Un générateur n'a pas encore été lancé.");
    expect(dit(exige, atelier([n("g", "generateur-frequence", {}, true)]))).toBe("Un générateur : posé.");
  });

  it("TENU : la phrase dit le réglage ET sa valeur — deux exigences ne rendent pas deux fois la même ligne", () => {
    const duree: Condition = { sorte: "present", critere: { ...GEN, parametre: { nom: "Durée", nomEn: "Duration", min: 3 } } };
    const frequence: Condition = { sorte: "present", critere: { ...GEN, parametre: { nom: "Fréquence", nomEn: "Frequency", vaut: 220 } } };
    const a = atelier([n("g", "generateur-frequence", { "Durée": 3, "Fréquence": 220 })]);
    expect(dit(duree, a)).toBe("Un générateur : « Durée » à 3.");
    expect(dit(frequence, a)).toBe("Un générateur : « Fréquence » à 220.");
    expect(dit(duree, a)).not.toBe(dit(frequence, a));
  });

  it("LE NOM DU RÉGLAGE PASSE À L'ANGLAIS, la clé restant française partout ailleurs", () => {
    const c: Condition = { sorte: "present", critere: { ...GEN, parametre: { nom: "Durée", nomEn: "Duration", min: 3 } } };
    const [p] = examiner(c, atelier([n("g", "generateur-frequence", { "Durée": 1 })]));
    expect(p.texteEn).toBe("A generator: « Duration » must reach 3; it sits at 1.");
  });

  it("MAL RÉGLÉ : la phrase dit l'exigence ET la valeur actuelle", () => {
    const exige: Condition = { sorte: "present", critere: { ...GEN, parametre: { nom: "Durée", min: 3 } } };
    expect(dit(exige, atelier([n("g", "generateur-frequence", { "Durée": 2 })])))
      .toBe("Un générateur : « Durée » doit atteindre 3 ; il est à 2.");
  });

  it("un réglage jamais touché se dit tel quel, et non comme un zéro", () => {
    const exige: Condition = { sorte: "present", critere: { ...GEN, parametre: { nom: "Durée", min: 3 } } };
    expect(dit(exige, atelier([n("g", "generateur-frequence")]))).toContain("rien pour l'instant");
  });

  it("un choix se compare texte à texte", () => {
    const exige: Condition = { sorte: "present", critere: { fiches: ["normaliseur"], parametre: { nom: "Mode", vaut: "sonie" }, quoi: "le normaliseur", quoiEn: "the normalizer" } };
    expect(tousCoches(examiner(exige, atelier([n("x", "normaliseur", { Mode: "sonie" })])))).toBe(true);
    expect(dit(exige, atelier([n("x", "normaliseur", { Mode: "crete" })])))
      .toBe("Le normaliseur : « Mode » doit valoir « sonie » ; il est à « crete ».");
  });

  it("plusieurs nœuds demandés : le décompte est dit", () => {
    const deux: Condition = { sorte: "present", critere: GEN, nombre: 2 };
    expect(dit(deux, atelier([n("g", "generateur-frequence")]))).toBe("Il faut 2 fois un générateur ; il y en a 1.");
    expect(tousCoches(examiner(deux, atelier([n("g", "generateur-frequence"), n("h", "generateur-frequence")])))).toBe(true);
  });

  it("une famille vaut critère, sans nommer aucun nœud", () => {
    const parFamille: Condition = { sorte: "present", critere: { famille: "Effets", quoi: "un effet", quoiEn: "an effect" } };
    expect(tousCoches(examiner(parFamille, atelier([n("c", "compresseur")])))).toBe(true);
    expect(tousCoches(examiner(parFamille, atelier([n("g", "generateur-frequence")])))).toBe(false);
  });
});

describe("un branchement demandé", () => {
  const cond: Condition = { sorte: "relie", amont: COMP, aval: LIM };

  it("si un bout manque, c'est le bout qu'on nomme — pas le branchement", () => {
    expect(dit(cond, atelier([]))).toBe("Il manque le compresseur. | Il manque un limiteur.");
    expect(dit(cond, atelier([n("c", "compresseur")]))).toBe("Il manque un limiteur.");
  });

  it("LES DEUX PRÉSENTS MAIS SÉPARÉS : la phrase change, et c'est tout l'intérêt", () => {
    const a = atelier([n("c", "compresseur"), n("l", "limiteur")]);
    expect(dit(cond, a)).toBe("Le compresseur n'est pas encore relié à un limiteur.");
  });

  it("reliés à distance : cela compte", () => {
    const a = atelier([n("c", "compresseur"), n("x", "normaliseur"), n("l", "limiteur")],
      [{ source: "c", target: "x" }, { source: "x", target: "l" }]);
    expect(dit(cond, a)).toBe("Le compresseur est relié à un limiteur.");
  });

  it("« direct » exige l'arête elle-même, et le dit autrement", () => {
    const direct: Condition = { sorte: "relie", amont: COMP, aval: LIM, direct: true };
    const a = atelier([n("c", "compresseur"), n("x", "normaliseur"), n("l", "limiteur")],
      [{ source: "c", target: "x" }, { source: "x", target: "l" }]);
    expect(dit(direct, a)).toBe("Le compresseur n'est pas encore branché directement sur un limiteur.");
  });

  it("l'aval doit satisfaire ses propres exigences, lancement compris", () => {
    const lance: Condition = { sorte: "relie", amont: COMP, aval: { ...LIM, rendu: true } };
    const a = atelier([n("c", "compresseur"), n("l", "limiteur")], [{ source: "c", target: "l" }]);
    expect(dit(lance, a)).toBe("Un limiteur n'a pas encore été lancé.");
  });
});

describe("ce qu'on demande d'écarter", () => {
  const sans: Condition = { sorte: "absent", critere: LIM };

  it("se réjouit de l'absence, et signale la présence", () => {
    expect(tousCoches(examiner(sans, atelier([n("c", "compresseur")])))).toBe(true);
    expect(dit(sans, atelier([n("l", "limiteur")]))).toBe("Un limiteur est encore dans l'atelier.");
  });
});

describe("plusieurs exigences", () => {
  it("donnent une liste plate, un point par exigence", () => {
    const cond: Condition = { sorte: "toutes", conditions: [{ sorte: "present", critere: GEN }, { sorte: "relie", amont: COMP, aval: LIM }] };
    expect(examiner(cond, atelier([]))).toHaveLength(3);
  });

  it("une condition absente ne vaut pas réussite", () => {
    expect(tousCoches(examiner(undefined, atelier([])))).toBe(false);
  });
});

describe("les nombres écrits", () => {
  it("prennent la virgule et le moins typographique en français, le point et le trait en anglais", () => {
    expect(chiffre(-14.25, false)).toBe("−14,25");
    expect(chiffre(-14.25, true)).toBe("-14.25");
  });

  it("GARDENT LEURS DÉCIMALES JUSQU'AU MILLIER : à 440 hertz, un hertz vaut quatre cents", () => {
    expect(chiffre(440.37, false)).toBe("440,37");
    expect(chiffre(1058.4, false)).toBe("1058");
  });
});
