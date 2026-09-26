// plugins/polyphonie-chaine.test.ts — Deux lignes font-elles deux portées ?
//
// CE QUE CETTE CHAÎNE PROUVE. Une polyphonie ne se voit pas dans une liste de notes : deux voix
// mêlées et une seule voix aux mêmes notes sont le même tableau. Le contrôle porte donc sur ce qui
// les distingue vraiment, le nombre de portées gravées, qui est un compte et non une impression.
//
// ET LE VA-ET-VIENT, qui est la raison d'être de la paire : réunir, ressortir une voix, la retoucher
// et la réunir de nouveau. Une direction sans l'autre ne servirait à rien.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesVoix } from "./voix";
import { fiches as fichesTheorie } from "./theorie-composition";
import { fiches as fichesAnalyse } from "./analyse";

const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const reunir = fichesVoix.find((f) => f.id === "reunir-voix")!;
const extraire = fichesVoix.find((f) => f.id === "extraire-voix")!;
const voicings = fichesTheorie.find((f) => f.id === "voicings-accords")!;
const musicxml = fichesAnalyse.find((f) => f.id === "musicxml")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const DESSUS = "(4/4 (1 (1 (1 1 1)) 1 1))";
const BASSE = "(4/4 (1 1 1 1))";

async function jouer(texte: string, hauteurs: string): Promise<Sequence> {
  const res = await rythme.executer(contexte([texte, hauteurs, null], { Tempo: 120 }) as any);
  return res.valeurs[0] as unknown as Sequence;
}

const compter = (xml: string, motif: RegExp) => [...xml.matchAll(motif)].length;

describe("réunir puis graver", () => {
  it("DEUX SÉQUENCES FONT DEUX VOIX, et chaque note sait laquelle", async () => {
    const res = await reunir.executer(contexte([
      await jouer(DESSUS, "72 74 76 77 79 81"),
      await jouer(BASSE, "48 50 52 53"),
    ]) as any);
    const poly = res.valeurs[0] as unknown as Sequence;
    expect(poly.voix?.map((v) => v.numero)).toEqual([0, 1]);
    expect(new Set(poly.notes.map((n) => n.voix))).toEqual(new Set([0, 1]));
    expect(poly.notes).toHaveLength(10);
    expect(res.message).toContain("2 voix");
  });

  it("L'ÉCRITURE DE CHAQUE VOIX LA SUIT, et ce sont deux arbres différents", async () => {
    const res = await reunir.executer(contexte([
      await jouer(DESSUS, "72 74 76 77 79 81"),
      await jouer(BASSE, "48 50 52 53"),
    ]) as any);
    const poly = res.valeurs[0] as unknown as Sequence;
    expect(poly.voix?.[0].arbre).toBe(DESSUS);
    expect(poly.voix?.[1].arbre).toBe(BASSE);
  });

  it("DEUX VOIX FONT DEUX PORTÉES, et le triolet reste sur la sienne", async () => {
    const res = await reunir.executer(contexte([
      await jouer(DESSUS, "72 74 76 77 79 81"),
      await jouer(BASSE, "48 50 52 53"),
    ]) as any);
    const xml = await musicxml.executer(
      contexte([null, res.valeurs[0], null], { Tempo: 120 }) as any,
    );
    const texte = xml.valeurs[0] as string;
    expect(compter(texte, /<score-part id=/g)).toBe(2);
    expect(compter(texte, /<part id=/g)).toBe(2);
    expect(compter(texte, /<tuplet type="start"/g)).toBe(1);
    // Le tempo ne paraît qu'une fois, et non au-dessus de chaque portée.
    expect(compter(texte, /<metronome>/g)).toBe(1);
    expect(xml.message).toContain("2 portées");
    // UNE PORTÉE PORTE UN NOM, et non le texte de son arbre : celui-ci logeait dans le titre de la
    // séquence faute d'un meilleur endroit, et se retrouvait en tête de portée une fois gravé.
    const noms = [...texte.matchAll(/<part-name>([^<]*)<\/part-name>/g)].map((x) => x[1]);
    expect(noms).toEqual(["Voix 1", "Voix 2"]);
  });

  it("UNE SEULE VOIX GRAVE UNE SEULE PORTÉE, comme avant", async () => {
    const xml = await musicxml.executer(
      contexte([null, await jouer(DESSUS, "72 74 76"), null], { Tempo: 120 }) as any,
    );
    expect(compter(xml.valeurs[0] as string, /<part id=/g)).toBe(1);
  });
});

describe("le va-et-vient", () => {
  const polyphonie = async () => (await reunir.executer(contexte([
    await jouer(DESSUS, "72 74 76 77 79 81"),
    await jouer(BASSE, "48 50 52 53"),
  ]) as any)).valeurs[0] as unknown as Sequence;

  it("UNE VOIX RESSORT COMME UNE SÉQUENCE ORDINAIRE, écriture comprise", async () => {
    const res = await extraire.executer(contexte([await polyphonie()], { Voix: 1 }) as any);
    const seule = res.valeurs[0] as unknown as Sequence;
    expect(seule.notes).toHaveLength(4);
    expect(seule.arbre).toBe(BASSE);
    // Le numéro de voix n'a plus de sens hors de la polyphonie : il ne suit pas.
    expect(seule.notes.every((n) => n.voix === undefined)).toBe(true);
  });

  it("AU-DELÀ DE LA DERNIÈRE, le compte reprend à la première", async () => {
    // Deux voix, et l'on en demande la troisième : c'est la première qui est rendue, six notes.
    const poly = await polyphonie();
    const boucle = await extraire.executer(contexte([poly], { Voix: 2 }) as any);
    expect((boucle.valeurs[0] as unknown as Sequence).notes).toHaveLength(6);
    expect(boucle.message).toContain("voix 0");
    // La quatrième demandée rend la deuxième, quatre notes.
    const suivante = await extraire.executer(contexte([poly], { Voix: 3 }) as any);
    expect((suivante.valeurs[0] as unknown as Sequence).notes).toHaveLength(4);
    expect(suivante.message).toContain("voix 1");
  });

  it("EXTRAIRE, RETOUCHER, RÉUNIR : la voix retouchée revient à sa place", async () => {
    const poly = await polyphonie();
    const basse = (await extraire.executer(contexte([poly], { Voix: 1 }) as any)).valeurs[0];
    const montee = (await voicings.executer(
      contexte([null, basse], { Renversement: 1, "Conduite des voix": "non" }) as any,
    )).valeurs[2] as unknown as Sequence;
    const dessus = (await extraire.executer(contexte([poly], { Voix: 0 }) as any)).valeurs[0];
    const refaite = (await reunir.executer(contexte([dessus, montee]) as any))
      .valeurs[0] as unknown as Sequence;
    expect(refaite.voix).toHaveLength(2);
    // La voix retouchée garde son écriture, le renversement n'ayant pas bougé les attaques.
    expect(refaite.voix?.[1].arbre).toBe(BASSE);
    const xml = await musicxml.executer(contexte([null, refaite, null], { Tempo: 120 }) as any);
    expect(compter(xml.valeurs[0] as string, /<part id=/g)).toBe(2);
  });

  it("UNE SÉQUENCE SANS VOIX EN COMPTE UNE, et le numéro zéro la rend telle quelle", async () => {
    const une = await jouer(BASSE, "48 50 52 53");
    const res = await extraire.executer(contexte([une], { Voix: 0 }) as any);
    expect((res.valeurs[0] as unknown as Sequence).notes).toHaveLength(4);
    expect(res.message).toContain("voix 0/0");
  });
});

describe("ce que la réunion préserve et ce qu'elle tranche", () => {
  it("LA DURÉE EST LA PLUS LONGUE : une voix courte est suivie d'un silence", async () => {
    const longue = await jouer("((4/4 (1 1 1 1)) (4/4 (1 1 1 1)))", "60 62 64 65 67 69 71 72");
    const courte = await jouer(BASSE, "48 50 52 53");
    const res = await reunir.executer(contexte([courte, longue]) as any);
    expect((res.valeurs[0] as unknown as Sequence).duree).toBeCloseTo(4, 9);
  });

  it("UN TEMPO DIVERGENT EST DIT, et non résolu en silence", async () => {
    const a = await jouer(BASSE, "48 50 52 53");
    const b = { ...(await jouer(BASSE, "60 62 64 65")), tempo: 90 };
    const res = await reunir.executer(contexte([a, b]) as any);
    expect(res.message).toContain("1 voix à un autre tempo");
    // La voix dont le tempo diffère perd son écriture, qui ne décrit plus ses notes au tempo retenu.
    expect((res.valeurs[0] as unknown as Sequence).voix?.[1].arbre).toBeUndefined();
  });

  it("l'analyse liste les voix avec leur étendue", async () => {
    const res = await reunir.executer(contexte([
      await jouer(DESSUS, "72 74 76 77 79 81"),
      await jouer(BASSE, "48 50 52 53"),
    ]) as any);
    expect(res.valeurs[1]).toContain("2 voix");
    expect(res.valeurs[1]).toContain("C3");
  });
});
