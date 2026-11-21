// ui/metasLocaux-refus.test.ts — Un méta gardé que le registre refuse ne revient ni au démarrage ni d'une autre fenêtre.
//
// CE QUE CES CAS TIENNENT. Avant que `enregistrerMeta` ne lise le refus du registre, un méta reçu
// sous l'identifiant d'un natif était persisté sous `attic-meta:<id>`, puis rechargé à chaque
// démarrage dans la table que lit l'aplatissement : le natif était remplacé par le sous-graphe reçu
// dans chaque graphe. Rechargé maintenant, il est refusé et n'entre pas dans la table ; sa clé reste,
// comme celle d'un méta dont un bloc manque. Les cas prennent le vrai registre, figé.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configurerRegistreMeta, creerRegistre, supprimerMeta, tousLesMetas, trouverMeta } from "../core";
import { configurerRegistreUI } from "./registre-actif";
import { PREFIXE_META, appliquerMetaDistant, chargerMetasLocaux } from "./metasLocaux";

/** Un `localStorage` de fortune. */
class Memoire {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

const natif = (id: string) => ({
  id, nom: `natif ${id}`, univers: "Essai", famille: "Essai", resume: "Un natif d'essai.",
  entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }], parametres: [],
  executer: async () => ({ valeurs: [null] }),
}) as never;

/** Un méta tel que le stockage le porte, sous l'identifiant qu'on lui donne. */
const metaStocke = (id: string) => JSON.stringify({
  id, nom: `reçu ${id}`,
  entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }],
  mapEntrees: [{ noeudInterne: "dedans", portIndex: 0 }], mapSorties: [{ noeudInterne: "dedans", portIndex: 0 }],
  sousNoeuds: [{ id: "dedans", data: { ficheId: "gain", parametres: {} } }], sousAretes: [],
});

const r = creerRegistre<unknown, unknown>({ alias: { filtre: "reponse-filtre" } });
r.enregistrerTypeFlux({ id: "audio", couleur: "#888", forme: "rond", libelle: "Audio" });
for (const id of ["reverberation", "reponse-filtre", "gain"]) r.enregistrer(natif(id));
r.figerLesNatifs();
configurerRegistreMeta(r);
configurerRegistreUI(r as never);

describe("un méta gardé que le registre refuse", () => {
  beforeEach(() => {
    for (const m of tousLesMetas()) supprimerMeta(m.id);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("AU DÉMARRAGE : NI LE NATIF NI L'ALIAS NE SONT REPRIS DANS LA TABLE, et leurs clés restent", () => {
    const s = new Memoire();
    for (const id of ["reverberation", "filtre"]) s.setItem(PREFIXE_META + id, metaStocke(id));
    s.setItem(PREFIXE_META + "meta-ok", metaStocke("meta-ok"));
    chargerMetasLocaux(s);

    expect(trouverMeta("reverberation"), "le natif n'est pas remplacé").toBeUndefined();
    expect(trouverMeta("filtre"), "l'alias non plus").toBeUndefined();
    expect(trouverMeta("meta-ok")?.nom, "un méta accepté revient").toBe("reçu meta-ok");
    for (const id of ["reverberation", "filtre"]) expect(s.getItem(PREFIXE_META + id), id).not.toBeNull();
    expect(vi.mocked(console.warn).mock.calls.map((c) => String(c[0])).filter((m) => m.includes("le registre le refuse")))
      .toHaveLength(2);
  });

  it("D'UNE AUTRE FENÊTRE : un méta refusé ne change rien ici", () => {
    const s = new Memoire();
    const rendu = appliquerMetaDistant(PREFIXE_META + "reverberation", metaStocke("reverberation"), () => false, s);
    expect(rendu).toEqual({ id: "reverberation", action: "ignore" });
    expect(trouverMeta("reverberation")).toBeUndefined();
  });
});
