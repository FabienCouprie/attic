// docs/gammes-tenues-tous.test.ts — Chaque réglage de gamme du catalogue est tenu par ce que son nœud rend.
//
// LE GARDE RAPIDE DU BANC DES GAMMES, chantier du contrôle des gammes ouvert le 2026-11-21. Les gardes
// voisins tiennent chacun un défaut réparé ; celui-ci tient l'INVENTAIRE ENTIER : chaque réglage de
// gamme que le registre des nomenclatures relève est éprouvé ici, ou déclaré tenu ailleurs, ou hors de
// portée du banc, avec sa raison. Un nœud à gamme ajouté demain doit entrer dans l'une des trois.
//
// CE QUI SE JUGE, sur ce que le nœud rend par `executer` :
//  - sous chaque gamme offerte, en mi bémol, chaque note de chaque sortie lue est un degré de la gamme
//    posée sur la tonique (P1), et le nœud a rendu des notes ;
//  - sous six gammes choisies pour leurs symétries, la clé montée d'un demi-ton monte tout d'un
//    demi-ton, mêmes attaques et mêmes durées (P3) : un demi-ton, parce qu'aucune gamme ne revient sur
//    elle-même à un demi-ton, quand les deux diminuées le font à trois.
//
// UNE DÉCLARATION SE PAIE : elle porte sa raison, et le garde vérifie qu'elle tient encore. Un nœud
// déclaré sans transposition doit encore en manquer une sous l'une des six gammes ; un nœud dont
// l'appartenance est déclarée doit encore sortir de la gamme sous l'une des siennes. Sans quoi la
// déclaration est périmée, et elle tombe.
//
// LE CHEMIN DE L'INSPECTEUR : un réglage dont le défaut suit la gamme (`defautSelon`) prend celui que
// la règle des réglages liés lui donne quand la gamme change, comme dans l'application.
//
// ET LES CINQ NŒUDS QUI DÉPENDENT D'UNE GAMME SANS RÉGLAGE DE GAMME, que l'inventaire du registre ne
// voit donc pas : la Gamme, la Roue de Camelot, le contrepoint, l'harmonie négative et l'analyse
// harmonique. Mesurés justes le 2026-11-22, chacun par ce qu'il rend.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { apparier, lancerSousGamme } from "../audio/gamme-banc-lancer";
import { lireSorties, type PortDeSortie } from "../audio/gamme-banc-hauteurs";
import { releverUneGamme, type ReleveDeGamme } from "../audio/gamme-banc-releve";
import { degresAttendus as degresDe } from "../audio/gamme-banc-proprietes";
import {
  ACCORDS_SUR_LES_DEGRES, APPARTENANCE_DECLAREE, GAMME_SANS_EFFET, GAMMES_DE_TRANSPOSITION, HORS_DE_PORTEE,
  SANS_TRANSPOSITION, TENUS_AILLEURS, cleDeReglage, reglagesLies,
} from "../audio/gamme-banc-inscriptions";
import { reglagesANomenclature } from "../plugins/nomenclatures";
import { valeurCanoniqueChoix } from "../i18n";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { genererParcoursCamelot } from "../audio/camelot";
import { Note } from "tonal";

type FicheDuBanc = FicheLancable & { sorties?: readonly PortDeSortie[] };
const fiche = (id: string) => registre.trouverDef(id) as unknown as FicheDuBanc | undefined;

async function lireNotation(texte: string): Promise<unknown> {
  const f = fiche("texte-vers-midi");
  return f ? (await lancerFiche(f, {}, { entrees: [texte] })).valeurs[1] : null;
}

const { paires } = apparier(reglagesANomenclature());
const cle = cleDeReglage;

const hors = (r: ReleveDeGamme) => r.sorties.reduce((a, s) => a + s.hors, 0);
const notes = (r: ReleveDeGamme) => r.sorties.reduce((a, s) => a + s.notes, 0);

describe("l'inventaire du garde des gammes", () => {
  it("chaque réglage de gamme est éprouvé ici, tenu ailleurs, ou hors de portée, et chaque déclaration nomme un réglage qui existe", () => {
    const connus = new Set(paires.map(cle));
    for (const table of [HORS_DE_PORTEE, TENUS_AILLEURS, SANS_TRANSPOSITION, APPARTENANCE_DECLAREE]) {
      for (const [ou, raison] of Object.entries(table)) {
        expect(connus.has(ou), `« ${ou} » n'est pas un réglage de gamme du registre`).toBe(true);
        expect(raison.length, `la raison de « ${ou} » doit dire pourquoi`).toBeGreaterThanOrEqual(30);
      }
    }
    for (const ou of Object.keys(HORS_DE_PORTEE)) expect(TENUS_AILLEURS[ou], ou).toBeUndefined();
    for (const id of ACCORDS_SUR_LES_DEGRES) expect(paires.some((p) => p.fiche === id), `« ${id} » n'a pas de réglage de gamme`).toBe(true);
    for (const [ou, { reglage, valeurs, raison }] of Object.entries(GAMME_SANS_EFFET)) {
      expect(connus.has(ou), `« ${ou} » n'est pas un réglage de gamme du registre`).toBe(true);
      expect(raison.length, `la raison de « ${ou} » doit dire pourquoi`).toBeGreaterThanOrEqual(30);
      const ids = fiche(ou.split("·")[0])?.parametres.find((x) => x.nom === reglage)?.optionIds ?? [];
      for (const v of valeurs) expect(ids, `« ${ou} » : « ${reglage} » n'offre pas « ${v} »`).toContain(v);
    }
  });
});

describe("une gamme que la table ignore", () => {
  // DÉFAUT H DU CONTRÔLE DES GAMMES, décision de Fabien du 2026-11-21 : chaque nœud retombait en
  // silence sur son propre repli, le majeur ici, la chromatique là, et la Gamme jouée annonçait
  // « Do dorienne-inconnue » en jouant do majeur. Le moteur la remplace par le défaut déclaré, et le
  // message le dit.
  const INCONNUE = "gamme-que-la-table-ignore";
  const eprouves = paires.filter((p) => !HORS_DE_PORTEE[cle(p)] && !TENUS_AILLEURS[cle(p)]);
  it.each(eprouves.map((p) => [cle(p), p] as const))("%s : rend ce que rend son défaut, et le message la nomme", async (_c, p) => {
    const f = fiche(p.fiche)!;
    // LES ENTRÉES DU BANC, par `lancerSousGamme` : un texte d'essai arrêtait la Progression avant
    // qu'elle lise sa gamme, et rien ne s'annonçait.
    const sous = async (gamme: string) => {
      const l = (await lancerSousGamme(f, p, gamme, { graine: 1 })).lancer;
      return { message: l?.message ?? "", hauteurs: (await lireSorties(f.sorties ?? [], l?.valeurs ?? [], lireNotation)).lues.map((s) => s.hauteurs) };
    };
    const pDef = f.parametres.find((x) => x.nom === p.gamme)!;
    const inconnue = await sous(INCONNUE);
    const defaut = await sous(String(valeurCanoniqueChoix(pDef, pDef.defaut as string)));
    expect(inconnue.message).toContain(INCONNUE);
    expect(inconnue.message).toContain(p.gamme);
    expect(inconnue.hauteurs).toEqual(defaut.hauteurs);
  }, 60_000);
});

describe("chaque réglage de gamme, tenu par ce que son nœud rend", () => {
  const eprouves = paires.filter((p) => !HORS_DE_PORTEE[cle(p)] && !TENUS_AILLEURS[cle(p)]);
  for (const p of eprouves) {
    it(`${cle(p)} : chaque note est de la gamme sur sa tonique, et la clé transpose`, async () => {
      const f = fiche(p.fiche)!;
      const o = { ports: f.sorties ?? [], graines: [1], degresDe, lireNotation };
      const fautes: string[] = [];
      let horsTrouves = 0;
      for (const gamme of p.ids) {
        const r = await releverUneGamme(f, p, gamme, { ...o, toniques: [3], autres: reglagesLies(f, p, gamme) });
        if (r.echecs.length) fautes.push(`${gamme} : ${r.echecs.join(" ; ")}`);
        else if (notes(r) === 0) fautes.push(`${gamme} : aucune note rendue`);
        horsTrouves += hors(r);
        if (!APPARTENANCE_DECLAREE[cle(p)] && hors(r) > 0) {
          fautes.push(`${gamme} : ${r.sorties.flatMap((s) => s.exemplesHors.map((x) => `${s.sortie} ${x}`)).join(", ")}`);
        }
      }
      if (APPARTENANCE_DECLAREE[cle(p)] && horsTrouves === 0) fautes.push("déclaration d'appartenance périmée : aucune note n'est sortie de la gamme");
      if (p.tonique) {
        const choisies = GAMMES_DE_TRANSPOSITION.filter((g) => p.ids.includes(g));
        let manque = 0;
        for (const gamme of choisies.length ? choisies : p.ids) {
          const r = await releverUneGamme(f, p, gamme, { ...o, autres: reglagesLies(f, p, gamme) });
          const raison = r.sorties.map((s) => s.transposition).find(Boolean);
          if (raison) { manque++; if (!SANS_TRANSPOSITION[cle(p)]) fautes.push(`${gamme} : la clé ne transpose pas, ${raison}`); }
        }
        if (SANS_TRANSPOSITION[cle(p)] && manque === 0) fautes.push("déclaration sans transposition périmée : la clé transpose sous chaque gamme éprouvée");
      }
      expect(fautes).toEqual([]);
    }, 120_000);
  }
});

describe("les nœuds qui dépendent d'une gamme sans réglage de gamme", () => {
  const pc = (n: number) => ((Math.round(n) % 12) + 12) % 12;
  const CLES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const classesDe = async (f: FicheDuBanc, valeurs: readonly unknown[], port: string) =>
    (await lireSorties(f.sorties ?? [], valeurs, lireNotation)).lues.filter((s) => s.port === port).flatMap((s) => s.hauteurs);

  it("la Gamme liste les degrés de chaque gamme offerte sur sa tonique, sous les douze toniques", async () => {
    // TOUTES LES GAMMES QUE LE NŒUD OFFRE, lues dans son réglage : il n'en offrait que les sept modes,
    // sous les noms de Tonal, jusqu'au 2026-11-23, et ce cas les nommait lui-même.
    const f = fiche("tonal-gamme")!;
    const offertes = (f.parametres.find((p) => p.nom === "Type")!.optionIds ?? []) as string[];
    expect(offertes.length).toBeGreaterThanOrEqual(25);
    const fautes: string[] = [];
    for (const id of offertes) {
      for (let t = 0; t < 12; t++) {
        const r = await lancerFiche(f, { "Tonalité": CLES[t], Type: id }, { entrees: [null] });
        const noms = String(r.valeurs[0] ?? "").split(" ").filter(Boolean);
        const attendu = degresDe(id)!.map((d) => (d + t) % 12);
        // Sept lettres distinctes : une gamme de sept degrés s'écrit une fois chaque lettre.
        const lettres = new Set(noms.map((n) => n[0])).size;
        if (JSON.stringify(noms.map((n) => Note.chroma(n))) !== JSON.stringify(attendu) || (attendu.length === 7 && lettres !== 7)) {
          fautes.push(`${CLES[t]} ${id} : ${noms.join(" ")}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  }, 60_000);

  it("la Gamme relit les sept noms de Tonal qu'un projet ancien porte", async () => {
    const f = fiche("tonal-gamme")!;
    const r = await lancerFiche(f, { "Tonalité": "D", Type: "dorian" }, { entrees: [null] });
    expect(r.valeurs[0]).toBe("D E F G A B C");
  });

  it("la Roue de Camelot joue à chaque pas la triade de sa case, sur les vingt-quatre départs", async () => {
    // LA TABLE EST CELLE DE LA ROUE, écrite ici sans rien lire du nœud : la fondamentale de chaque case,
    // mineure sur l'anneau A, majeure sur l'anneau B. Le parcours, lui, est celui du nœud.
    const RACINES = [8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1];
    const f = fiche("camelot")!;
    const fautes: string[] = [];
    for (const anneau of ["A", "B"]) for (let n = 1; n <= 12; n++) {
      const depart = `${n}${anneau}`;
      const r = await lancerFiche(f, { "Départ": depart, Parcours: "voisins", Pas: 4, Tempo: 120 }, {});
      const notes = await classesDe(f, r.valeurs, "MIDI");
      genererParcoursCamelot(depart, "voisins", 4, Math.random).forEach((code, i) => {
        const [, num, a] = code.match(/^(\d+)([AB])$/)!;
        const racine = (RACINES[Number(num) - 1] + (a === "B" ? 3 : 0)) % 12;
        const triade = [racine, (racine + (a === "A" ? 3 : 4)) % 12, (racine + 7) % 12].sort((x, y) => x - y).join();
        const joue = [...new Set(notes.filter((h) => h.debut >= i * 0.5 - 0.01 && h.debut < (i + 1) * 0.5 - 0.01).map((h) => pc(h.note)))].sort((x, y) => x - y).join();
        if (joue !== triade) fautes.push(`${depart}, pas ${i}, ${code} : ${joue} au lieu de ${triade}`);
      });
    }
    expect(fautes).toEqual([]);
  }, 120_000);

  it("le contrepoint « Du cantus » n'emploie que les degrés de son cantus", async () => {
    const f = fiche("contrepoint-solveur")!;
    const CANTUS = ["62 65 64 62 67 65 69 67 65 64 62", "64 65 67 64 69 67 72 71 69 65 64", "67 69 71 72 74 71 72 69 67 66 67"];
    for (const c of CANTUS) {
      const r = await lancerFiche(f, { "Cantus firmus": c, Mode: "cantus" }, { entrees: [null] });
      const permises = new Set(c.split(" ").map((x) => pc(Number(x))));
      const toutes = await classesDe(f, r.valeurs, "Séquence");
      expect(toutes.length, c).toBe(2 * c.split(" ").length);
      expect(toutes.filter((h) => !permises.has(pc(h.note))).map((h) => h.note), c).toEqual([]);
    }
  }, 60_000);

  it("l'harmonie négative réfléchit chaque classe autour de l'axe de sa tonique, sous les douze toniques", async () => {
    // L'axe passe entre la tierce mineure et la tierce majeure de la tonique : p devient 2t + 7 − p.
    // Do majeur devient do mineur, sol septième fa mineur sixte, en do.
    const f = fiche("harmonie-negative")!;
    const entree = notesVersFichierMidi([60, 64, 67].map((n) => ({ note: n, velocite: 90, debut: 0, fin: 1 }))
      .concat([55, 59, 62, 65].map((n) => ({ note: n, velocite: 90, debut: 1, fin: 2 }))), 120);
    const fautes: string[] = [];
    for (const reflexion of ["registre", "miroir"]) for (let t = 0; t < 12; t++) {
      const r = await lancerFiche(f, { Tonique: String(t), "Réflexion": reflexion }, { entrees: [entree] });
      const sortie = await classesDe(f, r.valeurs, "MIDI");
      const reflet = (classes: number[]) => classes.map((p) => (((2 * t + 7 - p) % 12) + 12) % 12).sort((x, y) => x - y).join();
      const de = (a: number, b: number) => [...new Set(sortie.filter((h) => h.debut >= a && h.debut < b).map((h) => pc(h.note)))].sort((x, y) => x - y).join();
      if (de(0, 0.9) !== reflet([0, 4, 7]) || de(0.9, 9) !== reflet([7, 11, 2, 5])) fautes.push(`${reflexion}, tonique ${t} : ${de(0, 0.9)} / ${de(0.9, 9)}`);
    }
    expect(fautes).toEqual([]);
  }, 120_000);

  it("l'analyse harmonique trouve la tonalité de quatre cadences, majeures et mineures", async () => {
    const sr = 44100;
    const cadence = (accords: number[][]) => {
      const buf = new AudioBuffer({ numberOfChannels: 1, length: sr * accords.length, sampleRate: sr });
      const x = buf.getChannelData(0);
      accords.forEach((a, k) => {
        for (const n of a) for (let i = 0; i < sr; i++) {
          x[k * sr + i] += 0.15 * Math.sin(2 * Math.PI * 440 * 2 ** ((n - 69) / 12) * (i / sr)) * Math.min(1, (1 - i / sr) * 10);
        }
      });
      return buf;
    };
    // I IV V I IV V I sur une tonique t, ou i iv V i iv V i, la sensible de l'harmonique.
    const cas = (t: number, mineur: boolean): number[][] => {
      const accord = (r: number, q: number[]) => [36 + t + r, ...q.map((i) => 60 + ((t + r + i) % 12))];
      const I = mineur ? [0, 3, 7] : [0, 4, 7], IV = mineur ? [0, 3, 7] : [0, 4, 7];
      return [accord(0, I), accord(5, IV), accord(7, [0, 4, 7]), accord(0, I), accord(5, IV), accord(7, [0, 4, 7]), accord(0, I)];
    };
    const ATTENDUS: [number, boolean, RegExp][] = [[0, false, /^C major/], [9, true, /^A minor/], [3, false, /^(D#|Eb) major/], [6, true, /^F# minor/]];
    for (const [t, mineur, attendu] of ATTENDUS) {
      const r = await lancerFiche(fiche("tonal-analyse")!, { Style: "Pop" }, { entrees: [cadence(cas(t, mineur))] });
      expect(String(r.valeurs[0] ?? ""), `${CLES[t]} ${mineur ? "mineur" : "majeur"}`).toMatch(attendu);
    }
  }, 120_000);
});
