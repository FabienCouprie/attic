// audio/abc-reprise-motifs.test.ts — Les styles de « Reprise ABC » : un par patron rythmique, les
// six d'avant au même son, et chacun qui change ce que le run rend.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hauteursAccord, lireMorceau } from "./abc";
import { reprendreAbc } from "./abc-reprise";
import { ACCORDS_TENUS, GRILLES_QUATRE, GRILLES_TROIS, STYLES, carrure, estStyle, lireGrille, motif } from "./abc-reprise-motifs";
import { PATRONS_RYTHME } from "./generation-patrons";

const AIRS = {
  "4/4": `X:1\nT:Essai\nM:4/4\nL:1/8\nQ:1/4=100\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`,
  "3/4": `X:1\nM:3/4\nL:1/4\nK:C\n"C"E G c | "G7"B2 G | "Am"A "F"F A | "C"c3 |]`,
  "6/8": `X:1\nM:6/8\nL:1/8\nK:D\n"D"FAA "G"BAG|"D"FAd "A"edc|"D"dAF "G"GFE|"A"FED "D"D3|]`,
  "2/4": `X:1\nM:2/4\nL:1/8\nK:F\n"F"FA cA|"C7"GB "F"AF|"Bb"Bd "C"ce|"F"f2 F2|]`,
  "2/2": `X:1\nM:2/2\nL:1/8\nK:D\n"D"FAAB AFED|"G"B2GB "A"AFED|"D"FAAB "Bm"defd|"Em"edBe "A"dBAF|]`,
} as const;
type Metrique = keyof typeof AIRS;

const reprendre = (style: string, m: Metrique) =>
  reprendreAbc(AIRS[m], { style, tempo: 0, instrumentMelodie: 73, instrumentAccompagnement: 0, instrumentBasse: 33 });
/** Seize chiffres de l'empreinte du fichier MIDI, ou « refusé ». */
const empreinte = (style: string, m: Metrique) => {
  const r = reprendre(style, m);
  return r.midi ? createHash("sha256").update(r.midi).digest("hex").slice(0, 16) : "refusé";
};

describe("les styles offerts", () => {
  it("SONT « Accords tenus » PUIS CHAQUE PATRON RYTHMIQUE, et chacun a son motif", () => {
    expect(STYLES).toEqual([ACCORDS_TENUS, ...Object.keys(PATRONS_RYTHME)]);
    expect(STYLES.length).toBe(56);
    expect(STYLES.filter((s) => !estStyle(s))).toEqual([]);
    // Une grille ne nomme qu'un patron, et ne recouvre pas l'un des six motifs d'avant.
    const grilles = [...Object.keys(GRILLES_QUATRE), ...Object.keys(GRILLES_TROIS)];
    expect(grilles.filter((g) => PATRONS_RYTHME[g] === undefined)).toEqual([]);
    expect(grilles.filter((g) => ["Rock", "Pop ballade", "Valse", "Marche militaire", "Bossa Nova"].includes(g))).toEqual([]);
    expect(grilles.length).toBe(50);
  });

  it("chaque grille est écrite sur sa mesure, avec une basse et un accompagnement", () => {
    const fautes: string[] = [];
    for (const [table, pas] of [[GRILLES_QUATRE, 16], [GRILLES_TROIS, 12]] as const) {
      for (const [id, [basse, acc]] of Object.entries(table)) {
        if (basse.length !== pas || acc.length !== pas) fautes.push(`${id} : ${basse.length} et ${acc.length} pas au lieu de ${pas}`);
        if (!/^[RQTO.][RQTO.-]*$/.test(basse) || !/[RQTO]/.test(basse)) fautes.push(`${id} : basse « ${basse} »`);
        if (!/^[Aa.][Aa.-]*$/.test(acc) || !/[Aa]/.test(acc)) fautes.push(`${id} : accompagnement « ${acc} »`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("une grille se lit en frappes : une lettre attaque, un tiret tient, un point se tait", () => {
    expect(lireGrille(["R-.Q", "..A-"], 1)).toEqual([
      { decalage: 0, duree: 0.5, role: "basse" }, { decalage: 0.75, duree: 0.25, role: "quinte" },
      { decalage: 0.5, duree: 0.5, role: "accord" },
    ]);
  });

  it("une grille ne joue que sa carrure, et le style est refusé ailleurs", () => {
    const c = (m: string) => carrure(lireMorceau(`M:${m}\nK:C\nC`));
    expect(motif("Reggae", c("4/4"))).not.toBeNull();
    expect(motif("Reggae", c("2/2"))).not.toBeNull();
    for (const m of ["3/4", "6/8", "2/4"]) expect(motif("Reggae", c(m)), m).toBeNull();
    expect(motif("Bolero", c("3/4"))).not.toBeNull();
    for (const m of ["4/4", "6/8", "2/4"]) expect(motif("Bolero", c(m)), m).toBeNull();
    expect(motif("inconnu", c("4/4"))).toBeNull();
  });
});

describe("LES SIX VALEURS D'AVANT RENDENT LE MÊME FICHIER MIDI", () => {
  // L'EMPREINTE A ÉTÉ RELEVÉE SUR LE CODE D'AVANT LE CHANGEMENT, commit 3c1e5ae, sous les
  // identifiants d'alors : blocs, ballade, pop, valse, marche, bossa. Chacun est désormais le style
  // qui recopie son motif, et un projet enregistré qui le porte doit rendre le même fichier, octet
  // pour octet, dans chaque métrique, refus compris.
  const AVANT: Record<string, Record<Metrique, string>> = {
    [ACCORDS_TENUS]: { "4/4": "f5ccbdef236d63aa", "3/4": "af58e234f59f3235", "6/8": "72deaa6685c90183", "2/4": "493783edc55d0bf6", "2/2": "f260d42dbc1e8983" },
    "Pop ballade": { "4/4": "23912f993ea59dfc", "3/4": "4b36a112aeee2f44", "6/8": "6f627beca180b5b7", "2/4": "69e0eca1620e14b4", "2/2": "27e09db1d79508f7" },
    Rock: { "4/4": "f72e6baf175ce0bc", "3/4": "b2a466178e7aa480", "6/8": "d7fa5278ce0d690d", "2/4": "073ede9352601909", "2/2": "3a47f3a4a767f3ed" },
    Valse: { "4/4": "d607b36c07ae88dc", "3/4": "62f29119dc6c4a8d", "6/8": "4591ae8c7db63eea", "2/4": "56acf51c21cdc933", "2/2": "2cac072590f76cd1" },
    "Marche militaire": { "4/4": "8ade9f1af0f50952", "3/4": "refusé", "6/8": "4591ae8c7db63eea", "2/4": "56acf51c21cdc933", "2/2": "2cac072590f76cd1" },
    "Bossa Nova": { "4/4": "8a70321a8252242d", "3/4": "refusé", "6/8": "refusé", "2/4": "refusé", "2/2": "refusé" },
  };
  it.each(Object.keys(AVANT))("« %s »", (style) => {
    const releve = Object.fromEntries((Object.keys(AIRS) as Metrique[]).map((m) => [m, empreinte(style, m)]));
    expect(releve).toEqual(AVANT[style]);
  });
});

describe("CHAQUE STYLE CHANGE CE QUE LE RUN REND", () => {
  // AUCUN STYLE NE REND LE FICHIER D'UN AUTRE, sur la même partition. C'est la propriété qu'exige le
  // contrat de composant : changer la valeur du réglage doit changer le résultat. La comparaison se
  // fait par métrique, entre les styles qui s'y appliquent.
  //
  // SAUF UNE COÏNCIDENCE HÉRITÉE, ET ELLE EST ÉCRITE : sur une mesure à deux temps, « Valse » et
  // « Marche militaire » jouent tous deux la basse au premier temps et l'accord au second. Le
  // relevé d'avant le changement le montre déjà, et les recopier tels quels le garde.
  it.each(["4/4", "3/4"] as const)("en %s", (m) => {
    const parEmpreinte = new Map<string, string[]>();
    for (const style of STYLES) {
      const e = empreinte(style, m);
      if (e === "refusé") continue;
      parEmpreinte.set(e, [...(parEmpreinte.get(e) ?? []), style]);
    }
    const doublons = [...parEmpreinte.values()].filter((s) => s.length > 1).map((s) => s.join(" = "));
    expect(doublons).toEqual([]);
    const joues = [...parEmpreinte.values()].flat();
    // Le dénominateur : tout sauf Bolero en 4/4 ; en 3/4, les cinq qui s'y appliquent.
    expect(joues.length).toBe(m === "4/4" ? 55 : 5);
  });

  it("chaque style suit l'harmonie : toute note d'accompagnement ou de basse est un ton de l'accord qui sonne", () => {
    const fautes: string[] = [];
    for (const m of ["4/4", "3/4"] as const) {
      const accords = lireMorceau(AIRS[m]).accords;
      for (const style of STYLES) {
        const r = reprendre(style, m);
        if (!r.ok) continue;
        const [, acc, basse] = lireMorceau(r.abc!).voix;
        for (const n of [...acc.notes, ...basse.notes]) {
          const a = [...accords].reverse().find((x) => x.debut <= n.debut + 1e-9)!;
          const tons = new Set(hauteursAccord(a.symbole)!.map((h) => h % 12));
          if (!tons.has(n.midi % 12)) fautes.push(`${style} en ${m} : ${n.midi} à ${n.debut} hors de « ${a.symbole} »`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });
});
