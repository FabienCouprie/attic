// ui/moteur/passe.test.ts — Une passe du moteur, jouée sans React sur un domaine d'essai.
//
// POURQUOI CE TEST EST NEUF. La passe vivait dans un crochet de React, `useExecutionGraphe`, et rien ne
// l'éprouvait qu'à travers l'application : le journal de passe (`tests-e2e/journal-de-passe.spec.ts`)
// relève l'ordre de ce qui s'écrit dans les magasins, et reste la preuve du comportement. Sortie du
// crochet par la pièce P5a, elle se joue ici, avec un récepteur qui note ce qu'on lui dit.
//
// CE QUI DOIT ÊTRE TENU, et c'est ce que la passe dit au récepteur, qui écrit pour elle :
//   - elle commence une fois la préparation faite, avec l'ordre, les statuts et les nœuds de la passe,
//     et finit après son bilan, en `fin` : l'écriture des lecteurs est au récepteur, dans le bilan ;
//   - une passe ciblée porte sa cible au début comme à la fin, et c'est à elle seule que le récepteur
//     sait qu'elle ne doit rien dire du moteur ;
//   - une passe arrêtée le dit à l'instant, `passeArretee`, et finit en `arret`, sans bilan ; une passe
//     tombée finit en `erreur` ;
//   - un graphe vide ne dit rien, comme le moteur rendait la main avant de rien poser ;
//   - chaque événement porte la génération du jeton.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creerRegistre, type NoeudG, type AreteG, type PluginDef } from "../../core";
import type { EvenementDuMoteur, InstantaneDeGraphe } from "../../core/protocole-moteur";
import { configurerRegistreUI, type RegistreUI } from "../registre-actif";
import { oublierServicesApercu } from "../services-apercu";
import { configurerServicesOrchestration, oublierServicesOrchestration } from "../services-orchestration";
import { creerCacheDuMoteur } from "./cache";
import { creerLancerUnePasse, type Emplacement, type PretsDeLaPasse } from "./passe";

/** Deux fiches d'essai : une source et un double. */
const registre = creerRegistre<number, null>();
registre.enregistrerTypeFlux({ id: "nombre", couleur: "#00FF00", libelle: "Nombre" });
const source: PluginDef<number, null> = {
  id: "essai:source", nom: "Source", univers: "Essai", famille: "Source", resume: "Un nombre", notice: "Essai.",
  entrees: [], sorties: [{ nom: "Valeur", type: "nombre" }],
  parametres: [{ nom: "valeur", type: "curseur", defaut: 3, plage: [0, 10], doc: "Le nombre" }],
  executer: async (ctx) => ({ valeurs: [ctx.paramNombre("valeur", 3)] }),
};
const double: PluginDef<number, null> = {
  id: "essai:double", nom: "Double", univers: "Essai", famille: "Opération", resume: "Le double", notice: "Essai.",
  entrees: [{ nom: "X", type: "nombre" }], sorties: [{ nom: "2X", type: "nombre" }], parametres: [],
  executer: async (ctx) => ({ valeurs: [2 * (ctx.entree(0) as number)] }),
};
registre.enregistrer(source);
registre.enregistrer(double);

const noeud = (id: string, ficheId: string): NoeudG => ({ id, data: { ficheId, parametres: {} } });
const GRAPHE: InstantaneDeGraphe = {
  noeuds: [noeud("a", "essai:source"), noeud("b", "essai:double")],
  aretes: [{ id: "a-b", source: "a", target: "b", sourceHandle: "out:0", targetHandle: "in:0" } as AreteG],
  metas: [],
};

/** Une passe d'essai, et le journal de ce qu'elle dit, dans l'ordre : le genre, puis ce qui compte. */
function passe(partiel: Partial<PretsDeLaPasse> & { surEvenement?: (e: EvenementDuMoteur<unknown>, controleur: Emplacement<AbortController | null>) => void } = {}) {
  const dits: EvenementDuMoteur<unknown>[] = [];
  const controleur: Emplacement<AbortController | null> = { current: null };
  const lancer = creerLancerUnePasse({
    graphe: () => GRAPHE, priorite: () => null, noeudVisible: (id) => GRAPHE.noeuds.find((n) => n.id === id),
    economieMemoire: () => true, noeudsVisibles: () => GRAPHE.noeuds,
    recevoir: (e) => { dits.push(e); partiel.surEvenement?.(e, controleur); },
    cache: creerCacheDuMoteur(), audio: async () => null as never, canoniser: (_p, v) => v,
    repertoire: "", t: (cle) => cle, controleur, numero: () => 0, oublieDepuis: () => false,
    ...partiel,
  });
  return { lancer, dits, controleur, genres: () => dits.map((e) => e.genre as string) };
}

const jeton = (generation: number) => ({ generation, perime: () => false });

beforeEach(() => {
  configurerRegistreUI(registre as unknown as RegistreUI);
  oublierServicesApercu();
  oublierServicesOrchestration();
});
afterEach(() => { oublierServicesApercu(); oublierServicesOrchestration(); });

describe("une passe du moteur, dite au récepteur", () => {
  it("ELLE COMMENCE UNE FOIS PRÉPARÉE, dit sa boucle et son bilan, PUIS FINIT", async () => {
    const p = passe();
    await p.lancer(undefined, undefined, jeton(4));
    const genres = p.genres();
    expect(genres[0]).toBe("passeCommencee");
    expect(genres.slice(-2)).toEqual(["bilan", "passeTerminee"]);
    expect(genres.filter((g) => g === "noeudFini")).toHaveLength(2);
    const debut = p.dits[0] as Extract<EvenementDuMoteur<unknown>, { genre: "passeCommencee" }>;
    expect(debut.ordre).toEqual(["a", "b"]);
    expect(debut.noeuds.map((n) => n.id)).toEqual(["a", "b"]);
    expect("cible" in debut).toBe(false);
    // La boucle a vraiment tourné, la source dans le double : ce que le bilan montre de `b`.
    const bilan = p.dits.find((e) => e.genre === "bilan") as Extract<EvenementDuMoteur<unknown>, { genre: "bilan" }>;
    expect(new Map(bilan.rendus).get("b")?.valeurs).toEqual([6]);
    expect(p.dits.at(-1)).toEqual({ genre: "passeTerminee", generation: 4, raison: "fin" });
    // Chaque événement porte la génération du jeton.
    expect(p.dits.every((e) => e.generation === 4)).toBe(true);
    expect(p.controleur.current).toBeNull();
  });

  it("UNE PASSE CIBLÉE PORTE SA CIBLE au début comme à la fin", async () => {
    const p = passe();
    await p.lancer("b", undefined, jeton(1));
    expect(p.dits[0]).toMatchObject({ genre: "passeCommencee", cible: "b" });
    expect(p.dits.at(-1)).toEqual({ genre: "passeTerminee", generation: 1, cible: "b", raison: "fin" });
  });

  it("UNE PASSE ARRÊTÉE LE DIT À L'INSTANT, et finit en `arret`, sans bilan", async () => {
    const p = passe({ surEvenement: (e, c) => { if (e.genre === "passeCommencee") c.current?.abort(); } });
    await p.lancer(undefined, undefined, jeton(2));
    expect(p.genres()).toEqual(["passeCommencee", "passeArretee", "passeTerminee"]);
    expect(p.dits[1]).toEqual({ genre: "passeArretee", generation: 2 });
    expect(p.dits.at(-1)).toMatchObject({ raison: "arret" });
  });

  it("UNE PASSE TOMBÉE FINIT EN `erreur`, même avant d'avoir commencé", async () => {
    const erreur = console.error;
    console.error = () => {};
    try {
      const p = passe({ graphe: () => { throw new Error("graphe illisible"); } });
      await p.lancer();
      expect(p.dits).toEqual([{ genre: "passeTerminee", generation: 0, raison: "erreur" }]);
    } finally { console.error = erreur; }
  });

  it("ELLE LÂCHE SON EXÉCUTION ET SON GRAPHE PUBLIÉS EN FINISSANT, arrêtée ou tombée comprise", async () => {
    // L'EXÉCUTION PUBLIÉE TENAIT CHAQUE TAMPON DE LA PASSE jusqu'à la suivante, et le graphe publié ses
    // médias : voir `plugins/grapheGlobal.ts`.
    const vus: string[] = [];
    configurerServicesOrchestration({
      publierGraphe: () => { vus.push("graphe"); }, lacherGraphe: () => { vus.push("graphe lache"); },
      publierExecution: () => { vus.push("publiee"); }, lacherExecution: () => { vus.push("lachee"); },
    });
    await passe().lancer(undefined, undefined, jeton(1));
    expect(vus, "une passe finie").toEqual(["graphe", "publiee", "lachee", "graphe lache"]);
    vus.length = 0;
    await passe({ surEvenement: (e, c) => { if (e.genre === "passeCommencee") c.current?.abort(); } }).lancer();
    expect(vus, "une passe arrêtée").toEqual(["graphe", "publiee", "lachee", "graphe lache"]);
    vus.length = 0;
    const erreur = console.error;
    console.error = () => {};
    try { await passe({ graphe: () => { throw new Error("graphe illisible"); } }).lancer(); } finally { console.error = erreur; }
    expect(vus, "une passe tombée avant de rien publier").toEqual(["lachee", "graphe lache"]);
  });

  it("ELLE REMET À LA PRÉPARATION LES DÉPLIAGES QUE LE DOMAINE DÉCLARE, et exécute ce qu'ils rendent", async () => {
    // L'INSTRUMENT DE L'AUDIO PASSE PAR LÀ depuis qu'il a quitté le cœur, le 2026-11-21 : voir
    // `plugins/orchestration-domaine.ts`. Un moteur qui ne les remettrait pas jouerait la chaîne une
    // seule fois, sans un mot.
    const vus: string[][] = [];
    configurerServicesOrchestration({
      depliages: () => [{
        libelle: "Essai",
        deplier: (noeuds, aretes) => {
          vus.push(noeuds.map((n) => n.id));
          const copie = { id: "b-c", source: "b", target: "c", sourceHandle: "out:0", targetHandle: "in:0" } as AreteG;
          return { noeuds: [...noeuds, noeud("c", "essai:double")], aretes: [...aretes, copie], origines: new Map([["c", "b"]]), problemes: [] };
        },
      }],
    });
    const p = passe();
    await p.lancer(undefined, undefined, jeton(1));
    expect(vus, "le dépliage reçoit le graphe de la passe, une fois").toEqual([["a", "b"]]);
    const debut = p.dits[0] as Extract<EvenementDuMoteur<unknown>, { genre: "passeCommencee" }>;
    expect(debut.ordre).toEqual(["a", "b", "c"]);
  });

  it("UN GRAPHE VIDE NE DIT RIEN, et ne laisse pas de contrôleur", async () => {
    const p = passe({ graphe: () => ({ noeuds: [], aretes: [], metas: [] }) });
    await p.lancer();
    expect(p.dits).toEqual([]);
    expect(p.controleur.current).toBeNull();
  });
});
