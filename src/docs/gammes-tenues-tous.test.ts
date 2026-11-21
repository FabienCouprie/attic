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
