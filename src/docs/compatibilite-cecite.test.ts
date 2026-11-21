// src/docs/compatibilite-cecite.test.ts — Le garde des ruptures voit-il ce qu'il prétend voir ?
//
// L'INSTRUMENT MESURE SA PROPRE CÉCITÉ, SUR LE VRAI REGISTRE. Chaque cas prend le manifeste que le
// registre rend aujourd'hui, en fabrique une version « d'avant » qui diffère d'un seul trait, et
// exige que la comparaison trouve exactement la rupture de cette sorte, une seule, sur le composant
// visé. Un cas ne prouve rien s'il en trouve deux : l'une peut masquer l'autre.
//
// LA CIBLE SE CHOISIT PAR SA FORME, jamais par son nom : le premier composant qui porte une graine,
// une unité, une entrée facultative. Un nom en dur vieillirait avec le composant ; une forme que plus
// aucun composant ne porte fait tomber le cas, qui le dit, au lieu de passer sans rien éprouver.
//
// ET LE RELECTEUR EST CELUI DU REGISTRE VIVANT, celui du garde. C'est ce que le premier passage du
// garde sur son propre manifeste a payé : vingt-six fausses ruptures, des options héritées de tables
// partagées qui ne menaient à aucune valeur offerte, et un défaut de choix dont la liste se remplit à
// l'exécution. Le cas « comparé à lui-même » les aurait toutes montrées.
//
// MAIS LE GARDE COMPARE LE REGISTRE AU FICHIER, PAS À LUI-MÊME. Le premier changement venu de
// master, une entrée ajoutée, a fait lister quatre bornes « [1, null] → [1, null] » : une borne
// infinie s'écrit `null` en JSON, et le registre la tenait pour `Infinity`. Comparé à lui-même, le
// manifeste ne voyait rien ; relu de son texte, il voit tout ce que le JSON change.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { ALIAS } from "../audio/alias";
import {
  manifesteDuRegistre, manifesteEnTexte, relecteurDuRegistre,
  type ComposantManifeste, type FicheContrat, type Manifeste, type ReglageManifeste,
} from "./compatibilite";
import { comparerManifestes, SORTES, type SorteEcart } from "./compatibilite-ecarts";

const fiches = registre.tousLesInscrits() as unknown as FicheContrat[];
const relire = relecteurDuRegistre((id) => registre.trouverDef(id) as unknown as FicheContrat | undefined);
const courant = manifesteDuRegistre(fiches, ALIAS, new Map());
const ids = Object.keys(courant.composants);

/** Le premier composant qui porte la forme, ou une faute qui dit que le cas n'éprouve plus rien. */
function premier(forme: (c: ComposantManifeste) => boolean, quoi: string): string {
  const id = ids.find((i) => forme(courant.composants[i]));
  if (!id) throw new Error(`aucun composant ne porte ${quoi} : ce cas n'éprouve plus rien`);
  return id;
}

/** Le premier réglage qui porte la forme, avec son composant. */
function premierReglage(forme: (r: ReglageManifeste) => boolean, quoi: string): [string, number] {
  const id = premier((c) => c.reglages.some(forme), quoi);
  return [id, courant.composants[id].reglages.findIndex(forme)];
}

/** Un manifeste « d'avant » : le courant, retouché d'un seul trait. */
function avant(retouche: (m: Manifeste) => string): { ancien: Manifeste; cible: string } {
  const ancien = structuredClone(courant);
  return { cible: retouche(ancien), ancien };
}

const RUPTURES: [SorteEcart, (m: Manifeste) => string][] = [
  ["composant-retire", (m) => {
    const c = structuredClone(courant.composants[ids[0]]); delete c.alias;
    m.composants["__composant-disparu"] = c; return "__composant-disparu";
  }],
  ["alias-retire", (m) => {
    const c = m.composants[ids[0]]; c.alias = [...(c.alias ?? []), "__ancien-identifiant"]; return ids[0];
  }],
  ["alias-deplace", (m) => {
    const x = premier((c) => (c.alias ?? []).length > 0, "un alias");
    const d = premier((c) => c !== courant.composants[x] && !c.alias, "un composant sans alias");
    const a = m.composants[x].alias!.shift()!;
    if (m.composants[x].alias!.length === 0) delete m.composants[x].alias;
    m.composants[d].alias = [a]; return d;
  }],
  ["reglage-retire", (m) => {
    m.composants[ids[0]].reglages.push({ nom: "__réglage disparu", type: "curseur", defaut: 0 }); return ids[0];
  }],
  ["reglage-type", (m) => {
    const [id, i] = premierReglage((r) => r.type === "curseur", "un curseur");
    m.composants[id].reglages[i].type = "texte"; return id;
  }],
  ["reglage-defaut", (m) => {
    const [id, i] = premierReglage((r) => typeof r.defaut === "number", "un défaut numérique");
    (m.composants[id].reglages[i].defaut as number) += 1; return id;
  }],
  ["reglage-bornes", (m) => {
    const [id, i] = premierReglage((r) => r.min !== undefined && r.max !== undefined, "des bornes");
    m.composants[id].reglages[i].min! -= 1; return id;
  }],
  ["reglage-unite", (m) => {
    const [id, i] = premierReglage((r) => r.unite !== undefined, "une unité");
    m.composants[id].reglages[i].unite += " d'avant"; return id;
  }],
  ["reglage-graine", (m) => {
    const [id, i] = premierReglage((r) => r.graine === true, "une graine");
    delete m.composants[id].reglages[i].graine; return id;
  }],
  ["choix-retire", (m) => {
    const [id, i] = premierReglage((r) => (r.choix ?? []).length > 0, "un choix");
    m.composants[id].reglages[i].choix!.push("__valeur disparue"); return id;
  }],
  ["port-retire", (m) => {
    m.composants[ids[0]].sorties.push({ nom: "__port disparu", type: "audio" }); return ids[0];
  }],
  ["port-type", (m) => {
    const id = premier((c) => c.entrees.length > 0, "une entrée");
    m.composants[id].entrees[0].type = "__autre-type"; return id;
  }],
  ["port-contenu", (m) => {
    const id = premier((c) => c.entrees.length > 0 && !c.entrees[0].sousType, "une entrée sans contenu");
    m.composants[id].entrees[0].sousType = "__contenu"; return id;
  }],
  ["port-module", (m) => {
    const id = premier((c) => c.entrees.some((p) => p.module), "une entrée de modulation");
    m.composants[id].entrees.find((p) => p.module)!.module = "__autre réglage"; return id;
  }],
  ["port-renomme", (m) => {
    const id = premier((c) => c.entrees.length > 0, "une entrée");
    m.composants[id].entrees[0].nom += " d'avant"; return id;
  }],
  ["port-requis", (m) => {
    const id = premier((c) => c.entrees.length > 0 && c.entrees[0].requis !== false, "une entrée obligatoire");
    m.composants[id].entrees[0].requis = false; return id;
  }],
  ["port-ajoute-requis", (m) => {
    const id = premier((c) => c.entrees.length > 0 && c.entrees[c.entrees.length - 1].requis !== false, "une dernière entrée obligatoire");
    m.composants[id].entrees.pop(); return id;
  }],
];

const COMPATIBLES: [SorteEcart, (m: Manifeste) => string][] = [
  ["composant-ajoute", (m) => {
    const id = premier((c) => !c.alias, "un composant sans alias"); delete m.composants[id]; return id;
  }],
  ["composant-remplace", (m) => {
    const x = premier((c) => (c.alias ?? []).length > 0, "un alias");
    const a = m.composants[x].alias!.shift()!;
    if (m.composants[x].alias!.length === 0) delete m.composants[x].alias;
    m.composants[a] = structuredClone(courant.composants[x]); delete m.composants[a].alias; return a;
  }],
  ["reglage-ajoute", (m) => {
    const id = premier((c) => c.reglages.length > 0 && !c.entrees.some((p) => p.module), "un réglage hors modulation");
    m.composants[id].reglages.pop(); return id;
  }],
  ["choix-ajoute", (m) => {
    const [id, i] = premierReglage((r) => (r.choix ?? []).length > 1 && r.choix![r.choix!.length - 1] !== r.defaut, "un choix à deux valeurs");
    m.composants[id].reglages[i].choix!.pop(); return id;
  }],
  ["bornes-elargies", (m) => {
    const [id, i] = premierReglage((r) => r.min !== undefined && r.max !== undefined && r.min < r.max, "des bornes");
    const r = m.composants[id].reglages[i]; r.min = (r.min! + r.max!) / 2; return id;
  }],
  ["port-ajoute", (m) => {
    const id = premier((c) => c.sorties.length > 0, "une sortie"); m.composants[id].sorties.pop(); return id;
  }],
  ["port-facultatif", (m) => {
    const id = premier((c) => c.entrees.some((p) => p.requis === false), "une entrée facultative");
    delete m.composants[id].entrees.find((p) => p.requis === false)!.requis; return id;
  }],
];

describe("le garde des ruptures mesure sa propre cécité", () => {
  it("COMPARÉ À LUI-MÊME, le manifeste du registre ne rend aucun écart", () => {
    const faux = comparerManifestes(courant, courant, relire).map((e) => `${e.composant} · ${e.texte}`);
    expect(faux, ["", `LE GARDE INVENTE ${faux.length} ÉCARTS ENTRE UN MANIFESTE ET LUI-MÊME :`,
      ...faux.slice(0, 30).map((f) => `  ${f}`), ""].join("\n")).toEqual([]);
  });

  it("RELU DE SON TEXTE, le manifeste est celui du registre, et ne rend aucun écart", () => {
    const relu = JSON.parse(manifesteEnTexte(courant)) as Manifeste;
    const faux = comparerManifestes(relu, courant, relire).map((e) => `${e.composant} · ${e.texte}`);
    expect(faux, ["", `LE FICHIER ÉCRIT PAR LE GARDE NE SE RELIT PAS À L'IDENTIQUE : ${faux.length} ÉCARTS :`,
      ...faux.slice(0, 30).map((f) => `  ${f}`), ""].join("\n")).toEqual([]);
    expect(relu, "une valeur du manifeste ne survit pas au JSON").toEqual(courant);
  });

  it("CHAQUE SORTE DE RUPTURE A SON CAS, et chaque cas son trait", () => {
    const rangees = Object.entries(SORTES).filter(([, r]) => r).map(([s]) => s).sort();
    expect(RUPTURES.map(([s]) => s).sort(), "une sorte de rupture n'est pas éprouvée sur le registre").toEqual(rangees);
  });

  for (const [sorte, retouche] of RUPTURES) {
    it(`voit la rupture « ${sorte} », seule`, () => {
      const { ancien, cible } = avant(retouche);
      const ruptures = comparerManifestes(ancien, courant, relire).filter((e) => e.rupture);
      expect(ruptures.map((e) => `${e.composant} · ${e.sorte} · ${e.texte}`)).toHaveLength(1);
      expect([ruptures[0].composant, ruptures[0].sorte]).toEqual([cible, sorte]);
    });
  }

  for (const [sorte, retouche] of COMPATIBLES) {
    it(`range « ${sorte} » parmi les changements compatibles`, () => {
      const { ancien, cible } = avant(retouche);
      const ecarts = comparerManifestes(ancien, courant, relire);
      expect(ecarts.filter((e) => e.rupture).map((e) => `${e.composant} · ${e.texte}`)).toEqual([]);
      expect(ecarts.some((e) => e.sorte === sorte && e.composant === cible), JSON.stringify(ecarts)).toBe(true);
    });
  }
});
