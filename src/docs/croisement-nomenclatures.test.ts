// docs/croisement-nomenclatures.test.ts — Sous chaque valeur d'une nomenclature, chaque autre
// réglage agit encore, ou son inertie est déclarée.
//
// LE DÉFAUT QUE CE GARDE EXISTE POUR EMPÊCHER, relevé le 2026-11-14 : l'« Octaves » de
// l'arpégiateur MIDI n'agissait plus dès qu'un « Motif » était choisi. Tous les gardes faisaient
// varier un réglage à partir des défauts, et sous les défauts le motif valait « Droit » ; une
// inertie qui dépend de la valeur d'un autre réglage ne se voit qu'en les faisant varier ensemble.
// Lot 1 de la passe de complétude des nœuds à nomenclature, décidée par Fabien.
//
// DEUX ÉTAGES. Le premier tourne toujours : il éprouve l'instrument sur des fiches dont la réponse
// est connue, une inertie et une coïncidence plantées, car un instrument qui ne voit pas son propre
// cas ne prouve rien. Le second est la passe sur le catalogue, longue, lancée par
// `BANC_CROISEMENT=1` comme `bornes-parametres.test.ts` : chaque fiche qui porte un réglage relevé par
// un domaine de `plugins/nomenclatures.ts`, sous chaque valeur offerte. `CROISEMENT_FICHES=a,b`
// borne la passe à quelques fiches, et `RAPPORT_CROISEMENT=chemin` y écrit le relevé.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ParametreDef } from "../core/types";
import { registre } from "../audio/adaptateur";
import { croiserFiche, entreesRiches, rienRenduSeul, type RapportCroisement } from "../audio/croisement-reglages";
import { confronter, releveEnTexte } from "../audio/croisement-registre";
import {
  COINCIDENCES_A_EXAMINER, COINCIDENCES_DECLAREES, INERTIES_A_EXAMINER, INERTIES_CONDITIONNEES, INERTIES_DECLAREES,
} from "../audio/croisement-inscriptions";
import type { FicheLancable } from "../audio/lancer-fiche";
import { reglagesANomenclature } from "../plugins/nomenclatures";

const FIN = String.fromCharCode(10);

/**
 * Les comptes de la dette au relevé du 2026-11-14 : ils ne font que baisser.
 *
 * SAUF UNE FOIS, SUR LA DÉCISION DE FABIEN (lot 3c, 2026-11-14) : six inscriptions y sont entrées, de
 * 193 à 199. Le sens d'un arpège et la façon de jouer un accord devenus gouverneurs, ils montraient sous
 * eux des inerties que la dette portait déjà sous d'autres gouverneurs, et dont ils ne sont pas la
 * cause. Le lot 3d les déclare par leur vraie condition, une fois chacune.
 *
 * PUIS SEPT DE PLUS, DE 199 À 206, sous la même règle : les deux graines que le sens aléatoire a
 * fait ajouter aux accords joués et à la gamme jouée sont inertes hors de lui, donc sous chaque valeur
 * des autres gouverneurs, dont aucun n'est la cause. Sous « Sens », elles sont déclarées.
 *
 * PUIS DE 206 À 184 AU LOT 3d : vingt-deux inscriptions de douze réglages remplacées par une
 * déclaration chacun, sous sa vraie condition (`INERTIES_CONDITIONNEES`).
 */
const PLAFOND_INERTIES = 184;
const PLAFOND_COINCIDENCES = 37;

/** Une fiche d'essai : un réglage à nomenclature « Mode » et un réglage numérique « Gain ». */
function ficheDEssai(): FicheLancable {
  return {
    id: "essai-croisement",
    parametres: [
      { nom: "Mode", type: "choix", options: ["A", "B", "C", "D"], optionIds: ["a", "b", "c", "d"], defaut: "A" } as ParametreDef,
      { nom: "Gain", plage: [0, 10], pas: 1, defaut: 5 } as ParametreDef,
    ],
    // « b » ignore le gain : l'inertie plantée. « d » rend ce que rend « a » : la coïncidence plantée.
    executer: async (ctx: any) => {
      const mode = ctx.paramTexte("Mode", "a"), gain = ctx.paramNombre("Gain", 5);
      const rendu = mode === "b" ? [0] : mode === "c" ? [gain * 2] : [gain];
      return { valeurs: rendu };
    },
  };
}

describe("l'instrument de croisement voit ce qu'il doit voir", () => {
  it("UNE INERTIE PLANTÉE SOUS UNE VALEUR EST RELEVÉE, et elle seule", async () => {
    const r = await croiserFiche(ficheDEssai(), [{ reglage: "Mode", ids: ["a", "b", "c", "d"] }]);
    expect(r.inerties.map((i) => `${i.reglage} sous ${i.gouverneur}=${i.valeur}`)).toEqual(["Gain sous Mode=b"]);
  });

  it("UNE COÏNCIDENCE PLANTÉE EST RELEVÉE, et dite avec le défaut", async () => {
    const r = await croiserFiche(ficheDEssai(), [{ reglage: "Mode", ids: ["a", "b", "c", "d"] }]);
    expect(r.coincidences).toEqual([{ fiche: "essai-croisement", reglage: "Mode", valeurs: ["a", "d"], avecLeDefaut: true }]);
  });

  it("un lancer qui lève n'est pas compté comme une inertie", async () => {
    const fiche = ficheDEssai();
    const leve: FicheLancable = { ...fiche, executer: async () => { throw new Error("modèle absent"); } };
    const r = await croiserFiche(leve, [{ reglage: "Mode", ids: ["a", "b"] }]);
    expect(r.inerties).toEqual([]);
    expect(r.echecs.length).toBe(2);
    expect(r.echecs[0].raison).toMatch(/modèle absent/);
  });

  it("UN LANCER QUI NE REND RIEN EST UN ÉCHEC, et non une inertie de chaque réglage", async () => {
    const vide: FicheLancable = { ...ficheDEssai(), executer: async () => ({ valeurs: [null, null], message: "aucune zone reçue" }) };
    const r = await croiserFiche(vide, [{ reglage: "Mode", ids: ["a", "b"] }]);
    expect(r.inerties).toEqual([]);
    expect(r.coincidences).toEqual([]);
    expect(r.echecs.map((e) => e.raison)).toEqual(["rendu vide : aucune zone reçue", "rendu vide : aucune zone reçue"]);
  });

  it("UN PORT QUI DOUBLE UN RÉGLAGE, OU FACULTATIF, RESTE DÉBRANCHÉ : la passe éprouve les réglages", () => {
    const fiche: FicheLancable = {
      ...ficheDEssai(),
      entrees: [{ nom: "Mode", type: "texte" }, { nom: "Pulsation", type: "sequence", requis: false }, { nom: "Son", type: "audio" }],
    };
    const [mode, pulsation, son] = entreesRiches(fiche);
    expect([mode, pulsation]).toEqual([undefined, undefined]);
    expect(son).toBeInstanceOf(AudioBuffer);
  });

  it("UN NŒUD QUI NE REND RIEN SEUL EST NOURRI PAR SES PORTS FACULTATIFS, jamais par une modulation", async () => {
    // Un montage : une piste facultative et une modulation, et rien de rendu sans piste.
    const fiche: FicheLancable = {
      ...ficheDEssai(),
      entrees: [{ nom: "Piste", type: "audio", requis: false }, { nom: "Modulation", type: "courbe", requis: false }],
      executer: async (ctx: any) => ({ valeurs: [ctx.entree(0) ? [ctx.paramNombre("Gain", 5)] : null] }),
    };
    const gouverneurs = [{ reglage: "Mode", ids: ["a", "b"] }];
    expect(rienRenduSeul(await croiserFiche(fiche, gouverneurs, { entrees: entreesRiches(fiche) }))).toBe(true);
    const nourries = entreesRiches(fiche, { facultatifs: true });
    expect(nourries[0]).toBeInstanceOf(AudioBuffer);
    expect(nourries[1]).toBeUndefined();
    expect(rienRenduSeul(await croiserFiche(fiche, gouverneurs, { entrees: nourries }))).toBe(false);
  });

  it("DEUX PORTS AUDIO REÇOIVENT DEUX SONS DIFFÉRENTS : un son comparé à lui-même ne mesure rien", () => {
    const fiche: FicheLancable = { ...ficheDEssai(), entrees: [{ nom: "Audio", type: "audio" }, { nom: "Référence", type: "audio" }] };
    const [a, b] = entreesRiches(fiche) as AudioBuffer[];
    expect(a).toBeInstanceOf(AudioBuffer);
    expect(b).toBeInstanceOf(AudioBuffer);
    const ecart = a.getChannelData(0).reduce((s, x, i) => s + Math.abs(x - b.getChannelData(0)[i]), 0);
    expect(ecart).toBeGreaterThan(1);
  });

  it("chaque fiche mise hors du banc existe encore", () => {
    expect(Object.keys(FICHES_HORS_DU_BANC).filter((id) => !registre.trouverDef(id))).toEqual([]);
  });

  it("le périmètre est lu dans le registre des nomenclatures", () => {
    const fiches = new Set(reglagesANomenclature().map((r) => r.fiche));
    expect(fiches.size).toBeGreaterThan(100);
  });
});

describe("la confrontation aux inscriptions", () => {
  const releve = (inerties: [string, string, string][], coincidences: string[][] = []): RapportCroisement[] => [{
    fiche: "f", lancers: 1, valeurs: { Mode: ["a", "b"] }, echecs: [], nonEprouves: [],
    inerties: inerties.map(([reglage, gouverneur, valeur]) => ({ fiche: "f", reglage, gouverneur, valeur, essais: [1] })),
    coincidences: coincidences.map((valeurs) => ({ fiche: "f", reglage: "Mode", valeurs, avecLeDefaut: false })),
  }];

  it("UNE INERTIE NON INSCRITE EST REFUSÉE, une inscrite passe", () => {
    expect(confronter(releve([["Gain", "Mode", "b"]]), { inerties: [], coincidences: [] }).nonInscrites)
      .toEqual(["inertie : f·Gain sous Mode = b"]);
    expect(confronter(releve([["Gain", "Mode", "b"]]), { inerties: [{ ou: "f·Gain", sous: "Mode", valeurs: ["b"] }], coincidences: [] }))
      .toEqual({ nonInscrites: [], perimees: [] });
  });

  it("UNE INSCRIPTION QUI N'EST PLUS VRAIE EST REFUSÉE, « toutes » comprise", () => {
    expect(confronter(releve([["Gain", "Mode", "b"]]), { inerties: [{ ou: "f·Gain", sous: "Mode", valeurs: "toutes" }], coincidences: [] }).perimees)
      .toEqual(["inertie : f·Gain sous Mode agit désormais sous a"]);
    expect(confronter(releve([]), { inerties: [], coincidences: [{ ou: "f·Mode", valeurs: ["a", "b"] }] }).perimees)
      .toEqual(["coïncidence : f·Mode = a, b ne coïncide plus"]);
  });

  describe("UNE INERTIE DÉCLARÉE PAR SA VRAIE CONDITION", () => {
    // Le relevé d'un nœud dont « Filtre » vaut « off » à la base : la condition se lit sur le
    // gouverneur quand c'est lui, sur la base sinon.
    const avec = (filtre: string, inerties: [string, string, string][], agissants: [string, string, string][] = []) =>
      releve(inerties).map((r) => ({
        ...r, defauts: { Mode: "a", Filtre: filtre, Gain: "5" },
        agissants: agissants.map(([reglage, gouverneur, valeur]) => ({ reglage, gouverneur, valeur })),
      }));
    const quandOff = { ou: "f·Gain", quand: { reglage: "Filtre", valeurs: ["off"] }, raison: "" };
    const horsDeA = { ou: "f·Gain", quand: { reglage: "Mode", sauf: ["a"] }, raison: "" };

    it("couvre l'inertie sous n'importe quel gouverneur, là où la condition tient à la base", () => {
      expect(confronter(avec("off", [["Gain", "Mode", "b"]]), { inerties: [], coincidences: [], conditionnees: [quandOff] }).nonInscrites).toEqual([]);
      expect(confronter(avec("on", [["Gain", "Mode", "b"]]), { inerties: [], coincidences: [], conditionnees: [quandOff] }).nonInscrites)
        .toEqual(["inertie : f·Gain sous Mode = b"]);
    });

    it("lit la condition sur le gouverneur quand c'est lui qui varie, « sauf » compris", () => {
      expect(confronter(avec("on", [["Gain", "Mode", "b"]]), { inerties: [], coincidences: [], conditionnees: [horsDeA] }).nonInscrites).toEqual([]);
      expect(confronter(avec("on", [["Gain", "Mode", "a"]]), { inerties: [], coincidences: [], conditionnees: [horsDeA] }).nonInscrites)
        .toEqual(["inertie : f·Gain sous Mode = a"]);
    });

    it("TOMBE DÈS QUE LE RÉGLAGE AGIT LÀ OÙ ELLE TIENT, et non ailleurs", () => {
      expect(confronter(avec("on", [], [["Gain", "Mode", "c"]]), { inerties: [], coincidences: [], conditionnees: [horsDeA] }).perimees)
        .toEqual(["inertie conditionnée : f·Gain agit sous Mode = c, où sa condition tient"]);
      expect(confronter(avec("on", [], [["Gain", "Mode", "a"]]), { inerties: [], coincidences: [], conditionnees: [horsDeA] }).perimees).toEqual([]);
    });

    it("« non mesurable au banc » couvre tout, et tombe au premier lancer où le réglage agit", () => {
      const banc = { ou: "f·Gain", quand: { banc: true as const }, raison: "" };
      expect(confronter(avec("on", [["Gain", "Mode", "a"], ["Gain", "Mode", "b"]]), { inerties: [], coincidences: [], conditionnees: [banc] }).nonInscrites).toEqual([]);
      expect(confronter(avec("on", [], [["Gain", "Mode", "b"]]), { inerties: [], coincidences: [], conditionnees: [banc] }).perimees).toHaveLength(1);
    });
  });

  it("L'INSTRUMENT RELÈVE LES DÉFAUTS ET CE QUI AGIT, de quoi juger une condition", async () => {
    const r = await croiserFiche(ficheDEssai(), [{ reglage: "Mode", ids: ["a", "b", "c", "d"] }]);
    expect(r.defauts).toEqual({ Mode: "a", Gain: "5" });
    expect((r.agissants ?? []).map((a) => `${a.reglage} sous ${a.gouverneur}=${a.valeur}`)).toEqual(["Gain sous Mode=a", "Gain sous Mode=c", "Gain sous Mode=d"]);
  });

  it("chaque inertie conditionnée porte sa raison, nomme ce qui existe, et sa documentation nomme sa condition", () => {
    const fautes: string[] = [];
    for (const c of INERTIES_CONDITIONNEES) {
      if (c.raison.trim().length < 30) fautes.push(`${c.ou} : raison trop courte`);
      const [id, nom] = c.ou.split("·");
      const params = (registre.trouverDef(id)?.parametres ?? []) as (ParametreDef & { doc?: string; docEn?: string })[];
      const p = params.find((x) => x.nom === nom);
      if (!p) { fautes.push(`${c.ou} : réglage introuvable`); continue; }
      if ("banc" in c.quand) continue;
      const nomCondition = c.quand.reglage;
      const r = params.find((x) => x.nom === nomCondition);
      if (!r) { fautes.push(`${c.ou} : la condition nomme « ${nomCondition} », introuvable`); continue; }
      if (!(p.doc ?? "").includes(r.nom)) fautes.push(`${c.ou} : sa documentation ne nomme pas « ${r.nom} »`);
      if (!(p.docEn ?? "").includes(r.nomEn ?? r.nom)) fautes.push(`${c.ou} : sa documentation anglaise ne nomme pas « ${r.nomEn ?? r.nom} »`);
    }
    expect(fautes).toEqual([]);
  });

  it("une fiche que la passe n'a pas lancée n'est pas jugée", () => {
    expect(confronter(releve([]), { inerties: [{ ou: "autre·Gain", sous: "Mode", valeurs: "toutes" }], coincidences: [] }).perimees).toEqual([]);
  });

  it("les inscriptions déclarées portent leur raison", () => {
    const muettes = [...INERTIES_DECLAREES, ...COINCIDENCES_DECLAREES].filter((x) => (x.raison ?? "").trim().length < 30).map((x) => x.ou);
    expect(muettes).toEqual([]);
  });

  it("LA DETTE DU CROISEMENT NE GROSSIT PAS : tirée une fois du relevé, elle ne fait que décroître", () => {
    // LES PLAFONDS DU RELEVÉ DU 2026-11-14. On les baisse quand une ligne sort de la dette, déclarée
    // ou réparée ; on ne les relève jamais : une inertie neuve se répare ou se déclare.
    expect(INERTIES_A_EXAMINER.length).toBeLessThanOrEqual(PLAFOND_INERTIES);
    expect(COINCIDENCES_A_EXAMINER.length).toBeLessThanOrEqual(PLAFOND_COINCIDENCES);
  });

  it("chaque inscription nomme une fiche et des réglages qui existent", () => {
    const existe = (id: string, nom: string) => (registre.trouverDef(id)?.parametres ?? []).some((p) => p.nom === nom);
    const fautes: string[] = [];
    for (const ins of [...INERTIES_DECLAREES, ...INERTIES_A_EXAMINER]) {
      const [id, nom] = ins.ou.split("·");
      if (!existe(id, nom) || !existe(id, ins.sous)) fautes.push(`${ins.ou} sous ${ins.sous}`);
    }
    for (const ins of [...COINCIDENCES_DECLAREES, ...COINCIDENCES_A_EXAMINER]) {
      const [id, nom] = ins.ou.split("·");
      if (!existe(id, nom)) fautes.push(ins.ou);
    }
    expect(fautes, "une inscription périmée par un renommage ne couvre plus rien : la retirer").toEqual([]);
  });

  it("UNE INERTIE DÉCLARÉE EST DITE À L'ÉCRAN : la documentation du réglage nomme son gouverneur, dans les deux langues", () => {
    // DÉCISION DE FABIEN DU 2026-11-14 : une inertie légitime se déclare dans la documentation du
    // réglage, et non seulement dans cette liste, qu'aucun utilisateur ne lit.
    const fautes: string[] = [];
    for (const ins of INERTIES_DECLAREES) {
      const [id, nom] = ins.ou.split("·");
      const params = (registre.trouverDef(id)?.parametres ?? []) as (ParametreDef & { doc?: string; docEn?: string })[];
      const p = params.find((x) => x.nom === nom), g = params.find((x) => x.nom === ins.sous);
      if (!p || !g) { fautes.push(`${ins.ou} sous ${ins.sous} : réglage introuvable`); continue; }
      if (!(p.doc ?? "").includes(g.nom)) fautes.push(`${ins.ou} : sa documentation ne nomme pas « ${g.nom} »`);
      if (!(p.docEn ?? "").includes(g.nomEn ?? g.nom)) fautes.push(`${ins.ou} : sa documentation anglaise ne nomme pas « ${g.nomEn ?? g.nom} »`);
    }
    expect(fautes).toEqual([]);
  });
});

/**
 * Les domaines qui ne se croisent pas au banc de node, avec la raison.
 *
 * LE MOTEUR DE SYNTHÈSE DÉPEND D'UNE BANQUE QUE LE BANC N'A PAS : sans SoundFont chargée,
 * « Automatique » rend ce que rend « FM » et « SoundFont » lève. Ses valeurs coïncideraient partout
 * et ses lancers échoueraient, ce qui ne dirait rien des composants. Il reste un réglage ordinaire
 * de chaque fiche, éprouvé sous les valeurs des autres nomenclatures.
 */
export const HORS_DU_BANC: Record<string, string> = {
  "moteur de synthèse": "sans banque SoundFont au banc de node, Automatique vaut FM et SoundFont lève",
};

/**
 * Les fiches qui ne se croisent pas au banc, avec la raison : ce qu'elles rendent ne dépend pas que
 * de leurs réglages et de leurs entrées.
 */
export const FICHES_HORS_DU_BANC: Record<string, string> = {
  "pca-neuronale": "l'apprentissage s'arrête sur un budget lu à l'horloge (`Date.now()`) : le nombre d'époques faites dépend de la charge de la machine, et une inertie relevée un jour ne l'est pas le lendemain",
};

/** Le périmètre de la passe : chaque fiche et ses réglages à nomenclature, sans doublon. */
function perimetre(): Map<string, { reglage: string; ids: string[]; domaines: string[] }[]> {
  const parFiche = new Map<string, { reglage: string; ids: string[]; domaines: string[] }[]>();
  for (const r of reglagesANomenclature()) {
    if (HORS_DU_BANC[r.domaine.nom] || FICHES_HORS_DU_BANC[r.fiche]) continue;
    const liste = parFiche.get(r.fiche) ?? [];
    const deja = liste.find((x) => x.reglage === r.reglage);
    if (deja) deja.domaines.push(r.domaine.nom);
    else liste.push({ reglage: r.reglage, ids: r.ids, domaines: [r.domaine.nom] });
    parFiche.set(r.fiche, liste);
  }
  return parFiche;
}

describe.runIf(process.env.BANC_CROISEMENT === "1")("la passe de croisement sur le catalogue", () => {
  it("chaque nœud à nomenclature, sous chaque valeur offerte", async () => {
    const filtre = (process.env.CROISEMENT_FICHES ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const rapports: (RapportCroisement & { domaines: Record<string, string[]>; ms: number; facultatifsBranches?: true })[] = [];
    for (const [id, gouverneurs] of perimetre()) {
      if (filtre.length && !filtre.includes(id)) continue;
      const fiche = registre.trouverDef(id) as unknown as FicheLancable | undefined;
      if (!fiche) continue;
      const t0 = performance.now();
      const secondes = process.env.CROISEMENT_SECONDES ? Number(process.env.CROISEMENT_SECONDES) : undefined;
      let r = await croiserFiche(fiche, gouverneurs, { entrees: entreesRiches(fiche), secondes });
      // Un nœud qui ne rend rien seul est relancé nourri par ses ports facultatifs (`entreesRiches`).
      const nourri = rienRenduSeul(r);
      if (nourri) r = await croiserFiche(fiche, gouverneurs, { entrees: entreesRiches(fiche, { facultatifs: true }), secondes });
      const domaines = Object.fromEntries(gouverneurs.map((g) => [g.reglage, g.domaines]));
      rapports.push({ ...r, domaines, ms: Math.round(performance.now() - t0), ...(nourri ? { facultatifsBranches: true } : {}) });
    }
    if (process.env.RAPPORT_CROISEMENT) {
      mkdirSync(dirname(process.env.RAPPORT_CROISEMENT), { recursive: true });
      writeFileSync(process.env.RAPPORT_CROISEMENT, JSON.stringify(rapports, null, 1));
      // LE DÉNOMINATEUR ENTIER : les fiches dont chaque réglage à nomenclature est hors du banc.
      const toutes = new Set(reglagesANomenclature().map((x) => x.fiche));
      const horsBanc = [...toutes].filter((id) => !perimetre().has(id)).sort();
      const pied = `${FIN}## Hors du banc : ${horsBanc.length} fiches${FIN}${FIN}${horsBanc.join(", ")}${FIN}`;
      writeFileSync(process.env.RAPPORT_CROISEMENT.replace(/\.json$/, ".md"), releveEnTexte(rapports) + pied);
    }
    // LE DÉNOMINATEUR : une passe qui ne lance rien passerait au vert sans rien avoir éprouvé.
    expect(rapports.reduce((s, r) => s + r.lancers, 0)).toBeGreaterThan(0);
    const { nonInscrites, perimees } = confronter(rapports, {
      inerties: [...INERTIES_DECLAREES, ...INERTIES_A_EXAMINER],
      coincidences: [...COINCIDENCES_DECLAREES, ...COINCIDENCES_A_EXAMINER],
      conditionnees: INERTIES_CONDITIONNEES,
    });
    expect(nonInscrites, "déclarer l'inertie dans la documentation du réglage et dans `INERTIES_DECLAREES`, ou réparer le nœud").toEqual([]);
    expect(perimees, "ces inscriptions ne sont plus vraies : retirer leur ligne").toEqual([]);
  }, 6 * 3600_000);
});
