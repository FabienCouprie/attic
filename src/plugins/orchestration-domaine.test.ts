// plugins/orchestration-domaine.test.ts — Ce que le domaine pose et répond autour d'un run.
//
// POURQUOI CE TEST, ET IL COMBLE UN TROU QUE J'AI OUVERT.
//
// Le moteur d'exécution appelait `publierGrapheCourant` et `publierExecutionCourante` directement ;
// il demande désormais au domaine de les poser, par `ui/services-orchestration.ts`. La substitution
// tient en deux lignes, et **rien ne l'éprouvait** : aucun test ne couvrait le chemin
// « le moteur pose → un nœud lit », et je n'ai pas pu l'exercer dans l'application, la palette
// n'ajoutant un nœud qu'au glisser.
//
// Or ce chemin est exactement celui qui se casse sans bruit : un graphe non posé rend un nœud de
// documentation vide, sans erreur ni message. C'est le genre de défaut que ce dépôt attrape par un
// test et jamais autrement.
import { beforeEach, describe, expect, it } from "vitest";
import { ORCHESTRATION_AUDIO } from "./orchestration-domaine";
import { executionCourante, grapheCourant, publierGrapheCourant } from "./grapheGlobal";
import { FICHE_LOT_DEBUT } from "./lotGlobal";
import {
  configurerServicesOrchestration, oublierServicesOrchestration, servicesOrchestration,
} from "../ui/services-orchestration";

const noeud = (ficheId: string, parametres: Record<string, unknown> = {}) =>
  ({ id: ficheId + Math.random(), position: { x: 0, y: 0 }, data: { ficheId, parametres } });

describe("ce que le domaine pose et répond autour d'un run", () => {
  beforeEach(() => { oublierServicesOrchestration(); publierGrapheCourant(null as never); });

  it("SANS DOMAINE, LE POTEAU NE FAIT RIEN et le moteur tourne quand même", () => {
    const s = servicesOrchestration();
    expect(() => s.publierGraphe({ noeuds: [], aretes: [] })).not.toThrow();
    expect(() => s.publierExecution({})).not.toThrow();
    expect(s.dossiersALire([noeud(FICHE_LOT_DEBUT, { Dossier: "E:/sons" })])).toEqual([]);
    expect(s.fichiersUtiles(["a.wav"])).toEqual([]);
    // Et rien n'a été posé : un nœud qui documente le graphe ne verrait rien.
    expect(grapheCourant()).toBeNull();
  });

  it("LE GRAPHE POSÉ PAR LE POTEAU EST CELUI QU'UN NŒUD LIT, et c'est tout l'enjeu", () => {
    configurerServicesOrchestration(ORCHESTRATION_AUDIO);
    const graphe = { noeuds: [noeud("gain")], aretes: [] };
    servicesOrchestration().publierGraphe(graphe);
    expect(grapheCourant(), "le graphe posé doit être exactement celui qu'on relit").toBe(graphe);
  });

  it("L'EXÉCUTION POSÉE EST CELLE QU'UN NŒUD LIT", () => {
    configurerServicesOrchestration(ORCHESTRATION_AUDIO);
    const execution = { ordre: ["a"], noeuds: [], aretes: [], resultats: new Map(), messages: new Map() };
    servicesOrchestration().publierExecution(execution);
    expect(executionCourante()).toBe(execution);
  });

  it("LES DOSSIERS À LIRE SONT CEUX QUE LES DÉBUTS DE BOUCLE PORTENT, sans doublon", () => {
    configurerServicesOrchestration(ORCHESTRATION_AUDIO);
    const dossiers = servicesOrchestration().dossiersALire([
      noeud(FICHE_LOT_DEBUT, { Dossier: "E:/sons" }),
      noeud(FICHE_LOT_DEBUT, { Dossier: "E:/sons" }),
      noeud(FICHE_LOT_DEBUT, { Dossier: "E:/voix" }),
      // Un dossier vide ne se lit pas, et un autre composant n'en porte aucun.
      noeud(FICHE_LOT_DEBUT, { Dossier: "   " }),
      noeud("gain", { Dossier: "E:/jamais" }),
    ]);
    expect(dossiers).toEqual(["E:/sons", "E:/voix"]);
  });

  it("LE TRI DES FICHIERS EST CELUI DU DOMAINE : un WAV passe, un texte non", () => {
    configurerServicesOrchestration(ORCHESTRATION_AUDIO);
    const utiles = servicesOrchestration().fichiersUtiles([
      { nom: "un.wav", chemin: "E:/sons/un.wav" },
      { nom: "notes.txt", chemin: "E:/sons/notes.txt" },
    ]) as { nom: string }[];
    expect(utiles.map((f) => f.nom)).toEqual(["un.wav"]);
  });
});
