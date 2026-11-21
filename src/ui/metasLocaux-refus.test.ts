// ui/metasLocaux-refus.test.ts — Un méta gardé que le registre refuse ne revient ni au démarrage ni d'une autre fenêtre.
//
// CE QUE CES CAS TIENNENT. Avant que `enregistrerMeta` ne lise le refus du registre, un méta reçu
// sous l'identifiant d'un natif était persisté sous `attic-meta:<id>`, puis rechargé à chaque
// démarrage dans la table que lit l'aplatissement : le natif était remplacé par le sous-graphe reçu
// dans chaque graphe. Rechargé maintenant, il est refusé et n'entre pas dans la table.
//
// ET LE REFUS SE DIT À L'ÉCRAN. Il ne se disait qu'à la console, à chaque démarrage, et la clé restait :
// le méta disparaissait sans un mot, et redisait le même refus pour toujours. Refusé pour son
// identifiant, il sort désormais du stockage, comme un nœud installé ; refusé pour sa fiche, il garde
// sa clé. Les cas prennent le vrai registre, figé.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configurerRegistreMeta, creerRegistre, supprimerMeta, tousLesMetas, trouverMeta } from "../core";
import { configurerRegistreUI } from "./registre-actif";
import {
  PREFIXE_META, appliquerMetaDistant, chargerMetasLocaux, messagesDesMetasNonRestaures,
} from "./metasLocaux";

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
const metaStocke = (id: string, typeEntree = "audio") => JSON.stringify({
  id, nom: `reçu ${id}`,
  entrees: [{ nom: "Audio", type: typeEntree }], sorties: [{ nom: "Audio", type: "audio" }],
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

  it("AU DÉMARRAGE : NI LE NATIF NI L'ALIAS NE SONT REPRIS DANS LA TABLE, ils sont rendus refusés, et leurs clés sortent", () => {
    const s = new Memoire();
    for (const id of ["reverberation", "filtre"]) s.setItem(PREFIXE_META + id, metaStocke(id));
    s.setItem(PREFIXE_META + "meta-ok", metaStocke("meta-ok"));
    const nonRestaures = chargerMetasLocaux(s);

    expect(trouverMeta("reverberation"), "le natif n'est pas remplacé").toBeUndefined();
    expect(trouverMeta("filtre"), "l'alias non plus").toBeUndefined();
    expect(trouverMeta("meta-ok")?.nom, "un méta accepté revient").toBe("reçu meta-ok");
    expect(nonRestaures, "l'appelant apprend les deux refus, pour les dire").toEqual([
      { nom: "reçu reverberation", id: "reverberation", refus: { inscrite: false, raison: "natif" } },
      { nom: "reçu filtre", id: "filtre", refus: { inscrite: false, raison: "alias", cible: "reponse-filtre" } },
    ]);
    // ILS NE S'INSCRIRONT JAMAIS : leur clé ne servait qu'à redire le même refus à chaque démarrage.
    for (const id of ["reverberation", "filtre"]) expect(s.getItem(PREFIXE_META + id), id).toBeNull();
    expect(s.getItem(PREFIXE_META + "meta-ok"), "la clé d'un méta accepté reste").not.toBeNull();
    expect(vi.mocked(console.warn).mock.calls.map((c) => String(c[0])).filter((m) => m.includes("retiré du stockage")))
      .toHaveLength(2);
  });

  it("AU DÉMARRAGE : UN MÉTA REFUSÉ POUR SA FICHE GARDE SA CLÉ, il peut redevenir valide", () => {
    const s = new Memoire();
    s.setItem(PREFIXE_META + "meta-lumiere", metaStocke("meta-lumiere", "lumiere"));
    const nonRestaures = chargerMetasLocaux(s);
    expect(trouverMeta("meta-lumiere")).toBeUndefined();
    expect(nonRestaures.map((m) => "refus" in m && m.refus.raison)).toEqual(["invalide"]);
    expect(s.getItem(PREFIXE_META + "meta-lumiere"), "un type de flux revenu le rendrait valide").not.toBeNull();
  });

  it("LE MESSAGE DU DÉMARRAGE DIT LES DEUX CAUSES, chacune dans le sien", () => {
    // La langue est celle par défaut : ce fichier tourne sans `localStorage`. L'anglais du message
    // des refus se vérifie dans `refus-du-registre.test.ts`.
    const messages = messagesDesMetasNonRestaures([
      { nom: "Sans son bloc", manquants: ["ancien-bloc"] },
      { nom: "reçu reverberation", id: "reverberation", refus: { inscrite: false, raison: "natif" } },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatch(/^1 méta-composant\(s\) n'ont pas pu être réaffichés/);
    expect(messages[0]).toContain("• Sans son bloc (ancien-bloc)");
    expect(messages[1]).toMatch(/^Cette application gardait 1 méta-composant\(s\) que le registre refuse/);
    expect(messages[1]).toContain("« reverberation », identifiant d'un composant natif");
    expect(messagesDesMetasNonRestaures([]), "rien à dire quand tout est restauré").toEqual([]);
  });

  it("D'UNE AUTRE FENÊTRE : un méta refusé ne change rien ici", () => {
    const s = new Memoire();
    const rendu = appliquerMetaDistant(PREFIXE_META + "reverberation", metaStocke("reverberation"), () => false, s);
    expect(rendu).toEqual({ id: "reverberation", action: "ignore" });
    expect(trouverMeta("reverberation")).toBeUndefined();
  });
});
