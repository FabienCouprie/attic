// plugins/lecteurs-oublies.test.ts — Les lecteurs que le recensement n'avait pas vus lisent ce que disent leurs documentations, et refusent le reste.
//
// LA PASSE DE COMPLÉTUDE DE LA REVUE DES NOTATIONS EN TEXTE, 2026-11-22. Le registre entier a été relu, et ces
// nœuds lisent une notation que le recensement n'avait pas listée. Tout passe par `executer`.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import type { Cercle } from "../audio/cercle";
import { fusionnerMidis, notesVersFichierMidi } from "../audio/midi-ecriture";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;

// LE MASQUE DU CERCLE À RETOUCHER, que la vue écrit à chaque clic. Une espace y prenait une place, et un
// caractère qui n'était ni 0 ni 1 éteignait la sienne. C'est la règle des grilles du dixième format, décision
// de Fabien du 2026-11-22, « Refuse it, named » ; un masque trop court ou trop long se complète ou se coupe
// toujours, comme la notice le dit.
describe("LE MASQUE DU CERCLE NE PORTE QUE DES ZÉROS ET DES UNS", () => {
  const CERCLE: Cercle = { positions: 8, sorte: "percussion", sommets: [0, 3, 6].map((position) => ({ position, valeur: 36 })) };
  const RETOUCHER = (masque: string) => lancerFiche(F("cercle-retouche"), { Retouche: masque }, { entrees: [CERCLE] });
  const places = (v: unknown) => (v as Cercle).sommets.map((s) => s.position);

  it.each([
    ["un masque qui éteint une place", "10000010", [0, 6]],
    ["un masque court, complété par le cercle", "1000", [0, 6]],
    ["un masque long, coupé", "100100101111", [0, 3, 6]],
    ["un masque vide, qui laisse passer le cercle", "", [0, 3, 6]],
  ])("lit %s", async (_titre, masque, attendues) => {
    const r = await RETOUCHER(masque);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(places(r.valeurs[0])).toEqual(attendues);
  }, 60_000);

  it.each([["1 0 0 1 0 0 1 0", "« ␣ »", "place 2"], ["x..x..x.", "« x »", "place 1"], ["1002", "« 2 »", "place 4"]])(
    "refuse « %s », et nomme %s", async (masque, cite, place) => {
      const r = await RETOUCHER(masque);
      expect(r.erreurRendue, r.message).toBe(true);
      expect(r.valeurs).toEqual([null]);
      expect(r.message).toContain(cite);
      expect(r.message).toContain(place);
    }, 60_000);
});

// LE CODE DE LA ROUE DE CAMELOT : un nombre de 1 à 12, puis A pour le mineur ou B pour le majeur. Un code
// illisible rendait un nœud vert, « 0 accords · 0 notes ».
describe("LA ROUE DE CAMELOT REFUSE UN CODE QU'ELLE NE LIT PAS", () => {
  const CAMELOT = (depart: string) => lancerFiche(F("camelot"), { "Départ": depart, Pas: 3 }, { entrees: [] });

  it.each([["4B"], ["4b"], ["12A"]])("lit « %s »", async (depart) => {
    const r = await CAMELOT(depart);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toContain(depart.toUpperCase());
  }, 60_000);

  it.each([["13A"], ["0B"], ["4C"], ["b4"], [""]])("refuse « %s » en erreur, et le nomme", async (depart) => {
    const r = await CAMELOT(depart);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null, null]);
    expect(r.message).toContain(`« ${depart} »`);
  }, 60_000);
});

// LA TONALITÉ D'UN PLAN DE CHANSON, que le moteur attend sous la forme « G major » ou « A minor ». « Gm » et
// « G mixolydian » passaient tels quels dans le plan. Décision de Fabien du 2026-11-22, « Read Gm, refuse
// modes ».
describe("LA TONALITÉ DU PLAN S'ÉCRIT EN MAJEUR OU EN MINEUR", () => {
  const PLAN = (tonalite: string) => lancerFiche(F("composer-plan"), { "Tonalité": tonalite }, { entrees: [null, null, null] });
  const cle = (v: unknown) => (JSON.parse(String(v)) as { keyscale?: string }).keyscale;

  it.each([
    ["G major", "G major"], ["A minor", "A minor"], ["F# minor (73%)", "F# minor"],
    ["Gm", "G minor"], ["G", "G major"], ["Bb maj", "Bb major"], ["D min", "D minor"],
  ])("lit « %s » comme « %s »", async (tonalite, attendue) => {
    const r = await PLAN(tonalite);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(cle(r.valeurs[0])).toBe(attendue);
  }, 60_000);

  it.each([["G mixolydian", "mixolydian"], ["C dorian", "dorian"]])("refuse « %s », et nomme le mode", async (tonalite, mode) => {
    const r = await PLAN(tonalite);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null]);
    expect(r.message).toContain(mode);
  }, 60_000);
});

// LES RÈGLES DU L-SYSTÈME, sous « Exemple : Écrit à la main ». Une règle mal formée était jetée sans un mot,
// deux règles pour la même lettre laissaient gagner la dernière, et un mot sans note partait sans le drapeau
// d'erreur. Décisions de Fabien du 2026-11-22, « Refuse it, named ».
describe("LE L-SYSTÈME REFUSE UNE RÈGLE QU'IL NE LIT PAS", () => {
  const L = (axiome: string, regles: string) =>
    lancerFiche(F("l-systeme"), { Exemple: "manuel", Axiome: axiome, "Règles": regles, "Itérations": 3 }, { entrees: [] });

  it("lit les règles et les signes de sa documentation", async () => {
    const r = await L("A", "A=A>B, B=A");
    expect(r.erreurRendue, r.message).toBe(false);
    // A → A>B, puis A>B>A, puis A>B>A>A>B : toutes les lettres se réécrivent à la fois, et « > » reste.
    expect(r.valeurs[2]).toBe("A>B>A>A>B");
  }, 60_000);

  it.each([["AB=C", "« AB=C »"], ["=B", "« =B »"], ["A-B", "« A-B »"], ["A=AB, A=B", "« A »"]])(
    "refuse « %s », et nomme %s", async (regles, cite) => {
      const r = await L("A", regles);
      expect(r.erreurRendue, r.message).toBe(true);
      expect(r.message).toContain(cite);
    }, 60_000);

  it.each([["un axiome vide", "", "A=AB"], ["un mot sans note", "A", "A="]])("refuse en erreur %s", async (_titre, axiome, regles) => {
    const r = await L(axiome, regles);
    expect(r.erreurRendue, r.message).toBe(true);
  }, 60_000);
});

// LES PARTIES DU RÉPARTITEUR MIDI, sous « Répartition : canaux » ou « pistes ». « 17 », « 0 » et « a » vidaient
// la partie sans un mot, ses notes passant au « Reste ». Une partie vide reste licite : décision de Fabien du
// 2026-11-22, « Allow it, said ».
describe("LE RÉPARTITEUR REFUSE UN CANAL QU'IL NE LIT PAS, ET ADMET UNE PARTIE VIDE", () => {
  const midi = async () => {
    const parCanal = [0, 1, 2, 9].map((canal) => notesVersFichierMidi([{ note: 60 + canal, debut: 0, fin: 0.4, velocite: 90 }], 120, canal));
    const octets = await Promise.all(parCanal.map(async (f) => new Uint8Array(await f.arrayBuffer())));
    return new File([fusionnerMidis(octets) as BlobPart], "quatre.mid", { type: "audio/midi" });
  };
  const REPARTIR = async (partie: string, mode = "canaux") =>
    lancerFiche(F("repartiteur-midi"), { "Répartition": mode, "Partie 1": partie }, { entrees: [await midi()] });

  it.each([["1,2", "1:c1+2·2"], ["1-3", "1:c1+2+3·3"], ["", "1:—"]])("lit « %s »", async (partie, part) => {
    const r = await REPARTIR(partie);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toContain(part);
  }, 60_000);

  it.each([["17", "« 17 »"], ["0", "« 0 »"], ["a", "« a »"], ["2,a,4", "« a »"], ["1-17", "« 1-17 »"]])(
    "refuse « %s » en erreur, et nomme %s", async (partie, cite) => {
      const r = await REPARTIR(partie);
      expect(r.erreurRendue, r.message).toBe(true);
      expect(r.valeurs).toEqual([null, null, null, null, null]);
      expect(r.message).toContain(cite);
      expect(r.message).toContain("Partie 1");
    }, 60_000);

  it("refuse aussi une piste qu'il ne lit pas", async () => {
    const r = await REPARTIR("x", "pistes");
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain("« x »");
  }, 60_000);
});

// LES LISTES DU SSP DE KOENIG. Un jeton illisible était jeté, une amplitude bornée, une durée arrondie et portée
// à un échantillon, une liste vide remplacée par celle d'origine. Décision de Fabien du 2026-11-22, « Refuse it,
// named », contre la documentation qui défendait le repli.
describe("LE SSP REFUSE CE QUE SES LISTES NE PORTENT PAS", () => {
  const SSP = (amplitudes: string, durees: string) =>
    lancerFiche(F("ssp-koenig"), { Amplitudes: amplitudes, "Durées": durees }, { entrees: [] });

  it("lit deux listes bien écrites", async () => {
    const r = await SSP("-1, 0.5, 1", "5, 9");
    expect(r.erreurRendue, r.message).toBe(false);
    expect(String(r.valeurs[1])).toContain("-1, 0.5, 1");
  }, 60_000);

  it.each([
    ["-1, x, 1", "5, 9", "« x »"], ["2, -1", "5, 9", "« 2 »"], ["", "5, 9", "Amplitudes"],
    ["-1, 1", "0, 9", "« 0 »"], ["-1, 1", "-5", "« -5 »"], ["-1, 1", "1.5", "« 1.5 »"], ["-1, 1", "", "Durées"],
  ])("refuse « %s » et « %s » en erreur, et nomme %s", async (amplitudes, durees, cite) => {
    const r = await SSP(amplitudes, durees);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain(cite);
  }, 60_000);
});
