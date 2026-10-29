// ui/metasLocaux.test.ts — Ce qui suit un méta-composant quand on l'enregistre, et où il s'écrit.
//
// `serialiserMeta` est la source unique de vérité de la sérialisation d'un méta : elle sert à
// l'en-cours de la session comme au fichier de projet. Un champ qu'elle oublie est perdu au premier
// redémarrage, en silence, et le méta revient diminué sans que rien ne le signale.
//
// ET LA BIBLIOTHÈQUE S'ÉCRIT UN MÉTA PAR CLÉ. Le défaut mesuré le 2026-10-29 : deux fenêtres, deux
// registres, une liste réécrite entière, et le méta de l'une effacé par l'autre. Les cas du bas le
// rejouent dans un seul processus : le stockage porte un méta que le registre d'ici ne connaît pas,
// exactement la situation de la seconde fenêtre.
import { beforeEach, describe, expect, it } from "vitest";

import {
  configurerRegistreMeta, supprimerMeta, surChangementMetas, tousLesMetas, trouverMeta, enregistrerMeta, type MetaComposant,
} from "../core";
import { configurerRegistreUI } from "./registre-actif";

import {
  CLE_LISTE_METAS, PREFIXE_META, appliquerMetaDistant, chargerMetasLocaux, listeDesMetasStockes,
  sauvegarderMeta, serialiserMeta,
} from "./metasLocaux";

const meta = (sur: Partial<MetaComposant> = {}): MetaComposant => ({
  id: "m1", nom: "Mon outil",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  mapEntrees: [], mapSorties: [],
  sousNoeuds: [{ id: "a", data: { ficheId: "gain", parametres: { Gain: 3 } } }],
  sousAretes: [],
  ...sur,
});

describe("la sérialisation d'un méta-composant", () => {
  it("EMPORTE LA DESCRIPTION DE SON AUTEUR, qui serait sinon perdue au redémarrage", () => {
    const s = serialiserMeta(meta({ description: "Compresse puis adoucit les aigus." })) as any;
    expect(s.description).toBe("Compresse puis adoucit les aigus.");
  });

  it("supporte un méta sans description, et n'invente rien", () => {
    expect((serialiserMeta(meta()) as any).description).toBeUndefined();
  });

  it("survit à l'aller-retour par JSON, qui est le chemin réel", () => {
    const relu = JSON.parse(JSON.stringify(serialiserMeta(meta({ description: "Deux filtres." }))));
    expect(relu.description).toBe("Deux filtres.");
    expect(relu.nom).toBe("Mon outil");
    expect(relu.sousNoeuds[0].data.parametres).toEqual({ Gain: 3 });
  });

  it("EMPORTE LE NOM ANGLAIS : une autre fenêtre remplace son méta par ce qui est écrit ici", () => {
    expect((serialiserMeta(meta({ nomEn: "My tool" })) as any).nomEn).toBe("My tool");
  });
});

/** Un `localStorage` de fortune, qui compte ses écritures. */
class Memoire {
  m = new Map<string, string>();
  ecritures = 0;
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.ecritures += 1; this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("une clé par méta", () => {
  const FICHES = new Set(["gain", "filtre"]);
  configurerRegistreMeta({ enregistrer: () => {}, desenregistrer: () => {} } as never);
  configurerRegistreUI({ trouverDef: (id: string) => (FICHES.has(id) || !!trouverMeta(id)) ? ({ id } as never) : undefined } as never);

  beforeEach(() => { for (const m of tousLesMetas()) supprimerMeta(m.id); });

  it("CRÉER UN MÉTA N'EFFACE PAS CELUI QU'UNE AUTRE FENÊTRE A ÉCRIT, et c'était le défaut mesuré", () => {
    // Le stockage porte M1, écrit par l'autre fenêtre ; le registre d'ici ne le connaît pas.
    const s = new Memoire();
    s.setItem(PREFIXE_META + "m1", JSON.stringify(serialiserMeta(meta({ id: "m1" }))));
    enregistrerMeta(meta({ id: "m2", nom: "Le mien" }));
    sauvegarderMeta("m2", s);
    expect(s.getItem(PREFIXE_META + "m1"), "M1 est toujours là").not.toBeNull();
    expect(JSON.parse(s.getItem(PREFIXE_META + "m2")!).nom).toBe("Le mien");
  });

  it("un méta supprimé ici retire sa clé, et sa clé seulement", () => {
    const s = new Memoire();
    enregistrerMeta(meta({ id: "m1" }));
    enregistrerMeta(meta({ id: "m2" }));
    sauvegarderMeta("m1", s);
    sauvegarderMeta("m2", s);
    supprimerMeta("m1");
    sauvegarderMeta("m1", s);
    expect([...s.m.keys()]).toEqual([PREFIXE_META + "m2"]);
  });

  it("RIEN N'EST RÉÉCRIT QUAND LA VALEUR NE CHANGE PAS : chaque écriture réveille les autres fenêtres", () => {
    const s = new Memoire();
    enregistrerMeta(meta({ id: "m1" }));
    sauvegarderMeta("m1", s);
    sauvegarderMeta("m1", s);
    expect(s.ecritures).toBe(1);
  });

  it("L'ANCIENNE LISTE EST MIGRÉE au chargement, puis retirée", () => {
    const s = new Memoire();
    s.setItem(CLE_LISTE_METAS, JSON.stringify([serialiserMeta(meta({ id: "m1" })), serialiserMeta(meta({ id: "m2" }))]));
    expect(chargerMetasLocaux(s)).toEqual([]);
    expect(s.getItem(CLE_LISTE_METAS)).toBeNull();
    expect(s.getItem(PREFIXE_META + "m1")).not.toBeNull();
    expect(trouverMeta("m2"), "et les métas sont au registre").toBeDefined();
  });

  it("et un méta qui a déjà sa clé la garde : la liste ne revient que d'une vieille sauvegarde", () => {
    const s = new Memoire();
    s.setItem(PREFIXE_META + "m1", JSON.stringify(serialiserMeta(meta({ id: "m1", nom: "Récent" }))));
    s.setItem(CLE_LISTE_METAS, JSON.stringify([serialiserMeta(meta({ id: "m1", nom: "Ancien" }))]));
    chargerMetasLocaux(s);
    expect(trouverMeta("m1")?.nom).toBe("Récent");
  });

  it("une liste illisible reste en place plutôt que d'être perdue", () => {
    const s = new Memoire();
    s.setItem(CLE_LISTE_METAS, "{pas du json");
    chargerMetasLocaux(s);
    expect(s.getItem(CLE_LISTE_METAS)).toBe("{pas du json");
  });

  it("UN MÉTA NON RESTAURABLE GARDE SA CLÉ, au cas où sa fiche reviendrait", () => {
    const s = new Memoire();
    s.setItem(PREFIXE_META + "m1", JSON.stringify(serialiserMeta(meta({ id: "m1", sousNoeuds: [{ id: "a", data: { ficheId: "disparue" } }] }))));
    const non = chargerMetasLocaux(s);
    expect(non.map((x) => x.manquants)).toEqual([["disparue"]]);
    expect(s.getItem(PREFIXE_META + "m1")).not.toBeNull();
  });

  it("la sauvegarde d'avant mise à jour rend la bibliothèque en une liste, la forme d'autrefois", () => {
    const s = new Memoire();
    enregistrerMeta(meta({ id: "m1" }));
    enregistrerMeta(meta({ id: "m2" }));
    sauvegarderMeta("m1", s);
    sauvegarderMeta("m2", s);
    expect(JSON.parse(listeDesMetasStockes(s)!).map((m: { id: string }) => m.id).sort()).toEqual(["m1", "m2"]);
  });
});

describe("ce qu'une autre fenêtre écrit", () => {
  const FICHES = new Set(["gain"]);
  configurerRegistreMeta({ enregistrer: () => {}, desenregistrer: () => {} } as never);
  configurerRegistreUI({ trouverDef: (id: string) => (FICHES.has(id) || !!trouverMeta(id)) ? ({ id } as never) : undefined } as never);
  const jamais = () => false;

  beforeEach(() => { for (const m of tousLesMetas()) supprimerMeta(m.id); });

  it("ENTRE DANS LE REGISTRE D'ICI", () => {
    const valeur = JSON.stringify(serialiserMeta(meta({ id: "m1", nom: "Venu d'ailleurs" })));
    expect(appliquerMetaDistant(PREFIXE_META + "m1", valeur, jamais, new Memoire())).toEqual({ id: "m1", action: "enregistre" });
    expect(trouverMeta("m1")?.nom).toBe("Venu d'ailleurs");
  });

  it("SANS ÊTRE RENVOYÉ : l'abonné de l'atelier n'écrit pas pendant qu'on l'applique", () => {
    // L'abonné écrit à chaque changement du registre, et l'enregistrement le déclenche. Sans le
    // verrou, chaque fenêtre renverrait à l'autre ce qu'elle vient d'en recevoir.
    const s = new Memoire();
    const fin = surChangementMetas((id) => sauvegarderMeta(id, s));
    appliquerMetaDistant(PREFIXE_META + "m1", JSON.stringify(serialiserMeta(meta({ id: "m1" }))), jamais, s);
    fin();
    expect(s.ecritures, "rien n'a été réécrit").toBe(0);
    // Témoin : hors application, le même abonné écrit bien.
    const fin2 = surChangementMetas((id) => sauvegarderMeta(id, s));
    enregistrerMeta(meta({ id: "m2" }));
    fin2();
    expect(s.ecritures).toBe(1);
  });

  it("une suppression là-bas retire le méta ici", () => {
    enregistrerMeta(meta({ id: "m1" }));
    expect(appliquerMetaDistant(PREFIXE_META + "m1", null, jamais, new Memoire())).toEqual({ id: "m1", action: "retire" });
    expect(trouverMeta("m1")).toBeUndefined();
  });

  it("SAUF S'IL EST EMPLOYÉ ICI : il est gardé, et réécrit, ce qui défait la suppression", () => {
    const s = new Memoire();
    enregistrerMeta(meta({ id: "m1" }));
    expect(appliquerMetaDistant(PREFIXE_META + "m1", null, (id) => id === "m1", s)).toEqual({ id: "m1", action: "garde" });
    expect(trouverMeta("m1")).toBeDefined();
    expect(s.getItem(PREFIXE_META + "m1")).not.toBeNull();
  });

  it("un méta dont une fiche est inconnue ici n'est pas repris", () => {
    const valeur = JSON.stringify(serialiserMeta(meta({ id: "m1", sousNoeuds: [{ id: "a", data: { ficheId: "absente" } }] })));
    expect(appliquerMetaDistant(PREFIXE_META + "m1", valeur, jamais, new Memoire())?.action).toBe("ignore");
    expect(trouverMeta("m1")).toBeUndefined();
  });

  it("et une clé qui n'est pas celle d'un méta n'est pas la sienne", () => {
    expect(appliquerMetaDistant("attic-lang", "fr", jamais, new Memoire())).toBeNull();
  });
});
