// core/metastore-refus.test.ts — Un méta que le registre refuse ne prend pas la place d'un natif.
//
// CE QUE CES CAS EMPÊCHENT, trouvé en lisant les appelants d'`enregistrer` le 2026-11-20.
// `enregistrerMeta` rangeait le méta dans sa table AVANT que le registre ne réponde, et notifiait
// l'écouteur qui le persiste quoi qu'il ait répondu :
//
//   metas.set(meta.id, meta);
//   ...
//   registre.enregistrer(def);
//   notifier(meta.id);
//
// Or l'aplatissement lit cette table, et non le registre : `aplatirGraphe` déplie tout nœud dont
// `trouverMeta` connaît la fiche. Un projet reçu portant un méta nommé `reverberation` faisait donc
// refuser la fiche par le registre, puis déplier ce méta à la place de la réverbération native, dans
// chaque graphe et, persisté, à chaque démarrage. Le gel des natifs ne protégeait que la palette.
//
// LES CAS PRENNENT LE VRAI REGISTRE, figé comme l'adaptateur le fige.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aplatirGraphe, type MetaComposant, type NoeudG } from "./meta";
import {
  configurerRegistre, enregistrerMeta, renommerMeta, supprimerMeta, surChangementMetas, tousLesMetas, trouverMeta,
} from "./metastore";
import { creerRegistre } from "./registre";

/** La fiche d'un natif du socle. */
const natif = (id: string) => ({
  id, nom: `natif ${id}`, univers: "Essai", famille: "Essai",
  resume: "Un natif d'essai.", resumeEn: "A built-in test plugin.",
  entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }], parametres: [],
  executer: async () => ({ valeurs: ["natif"] }),
}) as never;

/** Un méta reçu, sous l'identifiant qu'on lui donne, qui enferme un « gain ». */
const metaRecu = (id: string, nom = `reçu ${id}`): MetaComposant => ({
  id, nom,
  entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }],
  mapEntrees: [{ noeudInterne: "dedans", portIndex: 0 }],
  mapSorties: [{ noeudInterne: "dedans", portIndex: 0 }],
  sousNoeuds: [{ id: "dedans", data: { ficheId: "gain", parametres: {} } }],
  sousAretes: [],
}) as never;

function registreDuDomaine() {
  const r = creerRegistre<unknown, unknown>({ alias: { filtre: "reponse-filtre" } });
  r.enregistrerTypeFlux({ id: "audio", couleur: "#888", forme: "rond", libelle: "Audio" });
  for (const id of ["reverberation", "reponse-filtre", "gain"]) r.enregistrer(natif(id));
  r.figerLesNatifs();
  configurerRegistre(r);
  return r;
}

const REFUS = [
  { sorte: "un identifiant natif figé", id: "reverberation", raison: "natif" },
  { sorte: "un alias du domaine", id: "filtre", raison: "alias" },
] as const;

describe("un méta que le registre refuse", () => {
  let notifies: string[];
  let desabonner: () => void;
  beforeEach(() => {
    for (const m of tousLesMetas()) supprimerMeta(m.id);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    notifies = [];
    desabonner = surChangementMetas((id) => notifies.push(id));
  });
  afterEach(() => { desabonner(); vi.restoreAllMocks(); });

  for (const { sorte, id, raison } of REFUS) {
    it(`SOUS ${sorte.toUpperCase()} (« ${id} ») : refusé, absent de la table, jamais persisté, et le natif n'est pas déplié`, () => {
      registreDuDomaine();
      const rendu = enregistrerMeta(metaRecu(id));

      // LA PREUVE PAR L'EXÉCUTION D'ABORD : un nœud de ce nom, dans un graphe, reste lui-même.
      const graphe: NoeudG[] = [{ id: "n", data: { ficheId: id, parametres: {} } }];
      const plat = aplatirGraphe(graphe, [], trouverMeta);
      expect(plat.noeuds.map((n) => n.data.ficheId), "le natif n'est pas remplacé par le sous-graphe reçu").toEqual([id]);
      expect(trouverMeta(id), "le méta n'entre pas dans la table que lit l'aplatissement").toBeUndefined();
      expect(notifies, "et l'écouteur qui persiste n'est pas réveillé").toEqual([]);
      expect(rendu?.inscrite === false && rendu.raison, "l'appelant apprend le refus").toBe(raison);
    });
  }

  it("ET UN MÉTA ACCEPTÉ ENTRE DANS LA TABLE, EST NOTIFIÉ ET SE DÉPLIE", () => {
    registreDuDomaine();
    const rendu = enregistrerMeta(metaRecu("meta-a"));
    expect(trouverMeta("meta-a")?.nom).toBe("reçu meta-a");
    expect(notifies).toEqual(["meta-a"]);
    const plat = aplatirGraphe([{ id: "n", data: { ficheId: "meta-a", parametres: {} } }], [], trouverMeta);
    expect(plat.noeuds.map((n) => n.data.ficheId)).toEqual(["gain"]);
    expect(rendu).toEqual({ inscrite: true });
  });

  it("UN RENOMMAGE EN NOM VIDE, REFUSÉ, NE S'ÉCRIT PAS : le stockage garde le méta d'avant", () => {
    const r = registreDuDomaine();
    enregistrerMeta(metaRecu("meta-b", "Mon outil"));
    notifies.length = 0;
    renommerMeta("meta-b", "");
    expect(notifies, "le méta au nom vide n'est pas persisté").toEqual([]);
    expect(r.trouverDef("meta-b")?.nom, "le catalogue garde le nom d'avant").toBe("Mon outil");
    // LA TABLE AUSSI. `renommerMeta` écrivait le nom dans l'objet de la table avant de demander au
    // registre : refusé, le catalogue gardait l'ancien nom et la table le nom vide, que le prochain
    // projet sauvegardé aurait écrit (`ui/projet-a-ecrire.ts` lit `tousLesMetas`).
    expect(trouverMeta("meta-b")?.nom, "la table garde le nom d'avant").toBe("Mon outil");
  });
});
