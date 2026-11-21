// @vitest-environment jsdom
// core/nodes-installes-refus.test.ts — Un nœud que le registre refuse n'est ni annoncé ni gardé.
//
// CE QUE CES CAS EMPÊCHENT, observé dans l'application le 2026-11-20. `installerNode` ne lisait pas
// le refus de `registre.enregistrer` :
//
//   nodesInstalles.set(node.manifest.id, node);
//   enregistrerNodeDynamique(node);   // « Node « filtre » enregistré dans le registre ✓ »
//   sauvegarder(node.manifest.id);
//   return true;
//
// Sous `reverberation`, un identifiant natif figé, ou sous `filtre`, un alias depuis la PR 408, le
// registre refusait la fiche et le disait à la console. L'installation, elle, écrivait le « ✓ »,
// rendait `true` et gardait le nœud sous `attic-node-installe:<id>` : le refus revenait à chaque
// démarrage, et le Gestionnaire de nodes annonçait « installé ».
//
// LES CAS PRENNENT LE VRAI REGISTRE, et non une doublure : c'est lui qui décide du refus, et une
// doublure qui accepte tout est exactement ce qui a caché le défaut.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PREFIXE_NODE_INSTALLE, appliquerNodeInstalleDistant, chargerNodesInstalles, configurerRegistreNodes, examinerNode,
  installerNode,
} from "./nodes-installes";
import { creerRegistre } from "./registre";

/** La fiche d'un natif du socle, dont la marque dit si c'est encore elle qui est inscrite. */
const natif = (id: string) => ({
  id, nom: `natif ${id}`, univers: "Essai", famille: "Essai",
  resume: "Un natif d'essai.", resumeEn: "A built-in test plugin.",
  entrees: [], sorties: [{ nom: "Texte", type: "texte" }], parametres: [],
  executer: async () => ({ valeurs: ["natif"] }),
}) as never;

/** Un nœud reçu dans un `.zip`, sous l'identifiant qu'on lui donne. */
const recu = (id: string, sortie = "texte") => ({
  manifest: {
    id, nom: `reçu ${id}`, univers: "Autres", famille: "Essai", resume: "Un nœud reçu.",
    entrees: [], sorties: [{ nom: "Texte", type: sortie }], parametres: [],
  },
  executerCode: "module.exports = async () => ({ valeurs: ['reçu'] });",
  consenti: "2026-11-20T00:00:00.000Z",
}) as never;

/** Le registre du domaine tel que l'adaptateur le monte : un alias remis, puis le socle figé. */
function registreDuDomaine() {
  const r = creerRegistre<unknown, unknown>({ alias: { filtre: "reponse-filtre" } });
  r.enregistrerTypeFlux({ id: "texte", couleur: "#888", forme: "rond", libelle: "Texte" });
  r.enregistrer(natif("reponse-filtre"));
  r.enregistrer(natif("reverberation"));
  r.figerLesNatifs();
  configurerRegistreNodes(r);
  return r;
}

/** Les deux refus d'un identifiant, chacun avec ce que le registre doit en dire. */
const REFUS = [
  { sorte: "un identifiant natif figé", id: "reverberation", attendu: { inscrite: false, raison: "natif" } },
  { sorte: "un alias du domaine", id: "filtre", attendu: { inscrite: false, raison: "alias", cible: "reponse-filtre" } },
] as const;

describe("un nœud que le registre refuse", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const annonces = () => vi.mocked(console.log).mock.calls.map((c) => String(c[0])).filter((m) => m.includes("✓"));

  for (const { sorte, id, attendu } of REFUS) {
    it(`SOUS ${sorte.toUpperCase()} (« ${id} ») : l'installation le sait, ne l'annonce pas et ne le garde pas`, () => {
      const r = registreDuDomaine();
      const rendu = installerNode(recu(id));

      expect(rendu, "l'installation rend ce que le registre a dit").toEqual(attendu);
      expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + id), "rien n'est gardé, donc rien ne revient au démarrage").toBeNull();
      expect(annonces(), "et aucun « ✓ » n'est écrit").toEqual([]);
      // LE SOCLE EST INTACT : c'est le refus qui l'a protégé, et l'installation ne l'a pas défait.
      expect(r.trouverDef(id)?.nom).toMatch(/^natif /);
    });
  }

  it("SOUS UN MANIFESTE INVALIDE : même chose, et un nœud déjà installé garde sa version en stockage", () => {
    registreDuDomaine();
    expect(installerNode(recu("le-mien")).inscrite, "la première version s'installe").toBe(true);
    const gardee = localStorage.getItem(PREFIXE_NODE_INSTALLE + "le-mien");

    const rendu = installerNode(recu("le-mien", "type-inconnu"));
    expect(rendu.inscrite).toBe(false);
    expect(rendu.inscrite === false && rendu.raison).toBe("invalide");
    // LA FAUTE VOYAGE PAR SA FORME, pour que l'interface la dise dans la langue de la personne.
    expect(rendu.inscrite === false && rendu.raison === "invalide" && rendu.fautes)
      .toEqual([{ code: "type-inconnu", port: "Texte", type: "type-inconnu" }]);
    expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + "le-mien"), "la version refusée n'écrase pas celle qui tourne").toBe(gardee);
  });

  it("EXAMINER DIT CE QU'INSTALLER FERAIT, SANS RIEN INSCRIRE NI GARDER : l'import décide avant de déplier", () => {
    const r = registreDuDomaine();
    for (const { id, attendu } of REFUS) expect(examinerNode(recu(id)), id).toEqual(attendu);
    expect(examinerNode(recu("pas-encore"))).toEqual({ inscrite: true });
    expect(r.trouverDef("pas-encore"), "rien n'est inscrit").toBeUndefined();
    expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + "pas-encore"), "ni gardé").toBeNull();
    expect(vi.mocked(console.error), "ni crié : seul `enregistrer` dit un refus à la console").not.toHaveBeenCalled();
  });

  it("ET UN NŒUD ACCEPTÉ S'INSTALLE TOUJOURS : inscrit, annoncé et gardé", () => {
    // SANS CE CAS, une réparation qui refuserait tout passerait les précédents.
    const r = registreDuDomaine();
    expect(installerNode(recu("mon-noeud"))).toEqual({ inscrite: true });
    expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + "mon-noeud")).not.toBeNull();
    expect(annonces()).toEqual(["[attic] Node « mon-noeud » enregistré dans le registre ✓"]);
    expect(r.trouverDef("mon-noeud")?.nom).toBe("reçu mon-noeud");
  });

  it("AU DÉMARRAGE, un refusé pour son identifiant, gardé autrefois, n'est pas compté et sort du stockage", () => {
    // IL NE S'INSCRIRA JAMAIS, et sa clé ne servait qu'à redire le même refus à chaque démarrage :
    // l'application n'offre aucun moyen de désinstaller un nœud, personne d'autre ne l'aurait retirée.
    registreDuDomaine();
    for (const { id } of REFUS) localStorage.setItem(PREFIXE_NODE_INSTALLE + id, JSON.stringify(recu(id)));
    expect(chargerNodesInstalles(), "aucun des deux n'est inscrit").toBe(0);
    expect(annonces()).toEqual([]);
    for (const { id } of REFUS) {
      expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + id), `la clé de « ${id} » ne revient plus`).toBeNull();
      expect(vi.mocked(console.warn).mock.calls.map((c) => String(c[0])).some((m) => m.includes(`« ${id} » retiré du stockage`)),
        "et le retrait se dit").toBe(true);
    }
  });

  it("AU DÉMARRAGE, un refusé pour son manifeste garde sa clé : il peut redevenir valide", () => {
    registreDuDomaine();
    localStorage.setItem(PREFIXE_NODE_INSTALLE + "le-sien", JSON.stringify(recu("le-sien", "type-inconnu")));
    expect(chargerNodesInstalles()).toBe(0);
    expect(localStorage.getItem(PREFIXE_NODE_INSTALLE + "le-sien")).not.toBeNull();
  });

  it("CE QU'UNE AUTRE FENÊTRE ÉCRIT SOUS UN IDENTIFIANT REFUSÉ NE CHANGE PAS LE CATALOGUE D'ICI", () => {
    registreDuDomaine();
    for (const { id } of REFUS) {
      expect(appliquerNodeInstalleDistant(PREFIXE_NODE_INSTALLE + id, JSON.stringify(recu(id))), id).toBe(false);
    }
  });
});
