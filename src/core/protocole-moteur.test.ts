// core/protocole-moteur.test.ts — Les deux gardes du protocole entre l'interface et le moteur.
//
// UN TYPE SANS APPELANT N'EST ÉPROUVÉ QUE PAR SES GARDES, et ce fichier en tient deux.
//
// 1. UNE TABLE PAR GENRE. Chaque union a sa table d'exemplaires, un par genre, que `satisfies` tient
//    contre `ParGenre` : un genre ajouté à l'union sans son exemplaire fait tomber `npx tsc -b`. Et
//    chaque exemplaire est COMPLET, facultatifs compris et à toute profondeur, de sorte qu'un champ
//    ajouté à un message, ou à l'un des types du cœur qu'il réemploie, doit paraître ici.
//
// 2. UN MESSAGE EST UNE DONNÉE. Chaque exemplaire passe au clonage structuré et doit en revenir
//    identique. Ses `ValeurPartagee` y sont remplacées par des poignées, ce que ferait une frontière
//    le jour où le moteur en traverserait une : `EvenementDuMoteur<Poignee>` dit exactement cela. Un
//    rappel posé dans un message, `rappel: () => void`, doit paraître dans son exemplaire, et le
//    clonage le refuse.
//
// CE QUI N'EST PAS ICI : les réponses aux questions. Elles se lisent sur le même fil et ne voyagent
// pas, et l'instantané du graphe aura son propre garde avec la pièce qui le prend.
import { describe, expect, it } from "vitest";
import type { EntreeDeCache } from "./cache-execution";
import type { CommandeAuMoteur, EvenementDuMoteur, ReponsesDuMoteur } from "./protocole-moteur";

/** Ce qu'une frontière mettrait à la place d'une valeur partagée : un numéro, et rien d'autre. */
interface Poignee { poignee: number }
const poignee = (n: number): Poignee => ({ poignee: n });

/**
 * Le type d'un exemplaire où chaque champ est présent, facultatifs compris, à toute profondeur.
 *
 * UNE FONCTION RESTE UNE FONCTION, et c'est ce qui rend le second garde sensible : sans cette branche,
 * un rappel deviendrait un objet vide, que l'exemplaire remplirait de `{}` et que le clonage
 * accepterait. Les tableaux et les paires gardent leur forme, le type étant homomorphe.
 */
type Complet<T> = T extends (...args: never[]) => unknown ? T
  : T extends object ? { [K in keyof T]-?: Complet<T[K]> }
  : T;

/** Une table d'exemplaires, un par genre, chacun du genre de sa clé : `Record<Genre, …>` précis par clé. */
type ParGenre<U extends { genre: string }> = { [G in U["genre"]]: Complet<Extract<U, { genre: G }>> };

/** Vrai si les deux unions ont exactement les mêmes membres. */
type MemesMembres<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Une entrée de cache dont chaque champ est rempli, ses valeurs et ses canaux en poignées. */
const ENTREE: Complet<EntreeDeCache> = {
  valeurs: [poignee(1), 440, "do", null],
  message: "graine 4242",
  affichage: { film: poignee(2) },
  designe: { source: poignee(1) },
  hashParams: "{gain:0.5}",
  hashEntree: "noeud-1:0>0",
  hashSorties: "",
  hashValeursEntree: "tampon(44100,2)",
  consulteSorties: false,
  tempsExecution: 12.5,
  empreinteBoucle: "boucle:3",
};

const COMMANDES = {
  lancer: { genre: "lancer", cible: "noeud-3", versLAval: true, cacheSeulement: false, attendre: ["noeud-1", "noeud-3"] },
  arreter: { genre: "arreter" },
  remettreAZero: { genre: "remettreAZero", ids: ["noeud-1", "noeud-2"], garder: ["_designe"] },
  regler: { genre: "regler", id: "noeud-2" },
  oublier: { genre: "oublier", ids: ["noeud-1", "meta-1::filtre"] },
  exporterCache: { genre: "exporterCache" },
  importerCache: { genre: "importerCache", entrees: [["noeud-1", ENTREE], ["meta-1::filtre", ENTREE]] },
} satisfies ParGenre<CommandeAuMoteur>;

const EVENEMENTS = {
  passeCommencee: {
    genre: "passeCommencee", generation: 7, cible: "noeud-3", ordre: ["noeud-1", "meta-1::filtre", "noeud-3"],
    statuts: [{ id: "meta-1", statut: "en_cours", progression: "boucle dépliée" }],
    noeuds: [{
      id: "noeud-1", type: "atelier", position: { x: 10, y: 20 }, width: 180, height: 90, selected: true,
      data: { ficheId: "lecteur", parametres: { gain: 0.5 }, fichier: poignee(3) },
    }],
  },
  statut: { genre: "statut", generation: 7, id: "noeud-1", statut: "en_cours", progression: "Étape 1/3", progressionDuNoeud: false },
  statutOmbre: { genre: "statutOmbre", generation: 7, id: "debut#2::echo", visible: "echo", statut: "termine" },
  noeudFini: {
    genre: "noeudFini", generation: 7, id: "noeud-1",
    rendu: {
      valeurs: [poignee(1), poignee(2)], message: "2 canaux",
      affichage: { film: poignee(3) }, designe: { source: poignee(1) }, brancheEnEchec: { fautif: "filtre" },
    },
  },
  bilan: {
    genre: "bilan", generation: 7,
    problemesDeBoucle: [["debut", "Cette boucle est vide."]], messagesCompletes: ["noeud-3", "debut"],
    rendus: [["noeud-3", {
      valeurs: [poignee(4)], message: "graine 4242",
      affichage: { film: poignee(5) }, designe: { source: poignee(4) }, brancheEnEchec: { fautif: "filtre" },
    }]],
    temps: [["noeud-1", 12.5], ["meta-1", 30]], ecarts: [["noeud-1", -3.2]],
    champsAutonomes: [["carte", { _carteHtmlUrl: "blob:carte/1" }]], conteneurs: [["meta-1", ["meta-1::filtre"]]],
  },
  demande: {
    genre: "demande", generation: 7, id: "noeud-2",
    demande: { grapheACreer: { nodes: [{ ficheId: "echo", label: "Écho" }], edges: [{ source: 0, target: 0 }] }, paletteARelire: true },
  },
  passeTerminee: { genre: "passeTerminee", generation: 7, cible: "noeud-3", raison: "arret" },
} satisfies ParGenre<EvenementDuMoteur<Poignee>>;

/** Chaque commande a sa réponse, et chaque réponse sa commande. Le compilateur le tient ; le cas le relit. */
const REPONSES_PAR_GENRE: MemesMembres<keyof ReponsesDuMoteur, CommandeAuMoteur["genre"]> = true;

describe("le protocole entre l'interface et le moteur", () => {
  // L'INSTRUMENT DIT D'ABORD QU'IL SAIT VOIR ROUGE. Un clonage qui accepterait une fonction rendrait
  // le second garde vert sur n'importe quel message.
  it("LE CLONAGE STRUCTURÉ REFUSE UN RAPPEL, sans quoi le second garde ne verrait rien", () => {
    expect(() => structuredClone({ genre: "noeudFini", rappel: () => {} })).toThrow();
  });

  it("CHAQUE COMMANDE A SA RÉPONSE, et aucune réponse n'est sans commande", () => {
    expect(REPONSES_PAR_GENRE).toBe(true);
  });

  it("LES TABLES PORTENT UN EXEMPLAIRE PAR GENRE, chacun sous sa clé", () => {
    expect(Object.keys(COMMANDES)).toHaveLength(7);
    expect(Object.keys(EVENEMENTS)).toHaveLength(7);
    for (const [cle, message] of [...Object.entries(COMMANDES), ...Object.entries(EVENEMENTS)]) {
      expect(message.genre).toBe(cle);
    }
  });

  const tables = [["la commande", COMMANDES], ["l'événement", EVENEMENTS]] as const;
  for (const [sorte, table] of tables) {
    for (const [genre, message] of Object.entries(table)) {
      it(`${sorte} « ${genre} » est une donnée : le clonage structuré la rend à l'identique`, () => {
        expect(structuredClone(message)).toStrictEqual(message);
      });
    }
  }
});
