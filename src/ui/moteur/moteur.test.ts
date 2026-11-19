// ui/moteur/moteur.test.ts — Le moteur construit une fois, et ses commandes.
//
// POURQUOI CE TEST. Pièce P5b du plan de l'architecture par messages entre l'interface et le moteur.
// L'ordonnanceur, le contrôleur de la passe et le drapeau d'arrêt du lot étaient tenus par un crochet
// de React, et `lancer` et `arreter` étaient deux de ses fonctions. Ils sont au moteur, et l'interface
// lui envoie des commandes. Ce test joue le moteur sans React, sur un domaine d'essai, avec un
// récepteur qui note ce qu'on lui dit.
//
// CE QUI DOIT ÊTRE TENU :
//   - `lancer` lie la langue et le dossier à l'instant où il est envoyé : une demande mise en file
//     garde les siens, même si la liaison change avant qu'elle ne parte ;
//   - deux demandes ne tournent jamais ensemble : la seconde attend la fin de la première ;
//   - `arreter` abat la passe en cours, qui le dit à l'instant, et vide la file ;
//   - `remettreAZero` abat la passe en cours, puis lâche ses nœuds du cache.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creerRegistre, type NoeudG, type AreteG, type PluginDef } from "../../core";
import type { EvenementDuMoteur, InstantaneDeGraphe, QuestionsAuShell } from "../../core/protocole-moteur";
import { configurerRegistreUI, type RegistreUI } from "../registre-actif";
import { oublierServicesApercu } from "../services-apercu";
import { oublierServicesOrchestration } from "../services-orchestration";
import { creerMoteur } from "./moteur";

/** Un barrage que le cas ouvre : la source l'attend, ou l'arrêt de sa passe. */
let barrage: Promise<void> = Promise.resolve();
let ouvrir = () => {};
const fermer = () => { barrage = new Promise<void>((r) => { ouvrir = r; }); };

/** Une source qui rend le dossier de travail de sa passe, et un double : de quoi voir ce qui a été lié. */
const registre = creerRegistre<unknown, null>();
registre.enregistrerTypeFlux({ id: "texte", couleur: "#FF6600", libelle: "Texte" });
const source: PluginDef<unknown, null> = {
  id: "essai:dossier", nom: "Dossier", univers: "Essai", famille: "Source", resume: "Le dossier", notice: "Essai.",
  entrees: [], sorties: [{ nom: "Dossier", type: "texte" }], parametres: [],
  jamaisCache: true,
  executer: async (ctx) => {
    await Promise.race([barrage, new Promise((r) => ctx.signal?.addEventListener("abort", r))]);
    return { valeurs: [ctx.repertoireTravail] };
  },
};
registre.enregistrer(source);

const GRAPHE: InstantaneDeGraphe = {
  noeuds: [{ id: "a", data: { ficheId: "essai:dossier", parametres: {} } } as NoeudG],
  aretes: [] as AreteG[],
  metas: [],
};

/** Un moteur d'essai, sa liaison, et ce qu'il a dit, dans l'ordre. */
function moteur() {
  const dits: EvenementDuMoteur<unknown>[] = [];
  const liaison = { t: (cle: string) => cle, repertoire: "premier" };
  let demandes = 0;
  const questions: QuestionsAuShell = {
    graphe: () => GRAPHE, priorite: () => null, noeudVisible: (id) => GRAPHE.noeuds.find((n) => n.id === id),
    noeudsVisibles: () => GRAPHE.noeuds, economieMemoire: () => true,
    demande: () => { demandes++; return { t: liaison.t, repertoire: liaison.repertoire }; },
  };
  const m = creerMoteur({
    questions, recepteur: (e) => { dits.push(e); }, audio: async () => null as never, canoniser: (_p, v) => v,
  });
  /** Ce que chaque bilan a montré du nœud `a`, dans l'ordre des passes. */
  const montres = () => dits.filter((e) => e.genre === "bilan").map((b) => new Map(b.rendus).get("a")?.valeurs[0]);
  return { ...m, dits, liaison, demandes: () => demandes, montres, genres: () => dits.map((e) => e.genre) };
}

/** Laisse les promesses en attente avancer, et la respiration de la passe passer. */
const souffler = () => new Promise<void>((r) => setTimeout(r, 5));

beforeEach(() => {
  // LE PILOTE DU LOT DEMANDE `window.api` pour lire ses dossiers : sous Node, la fenêtre est le global,
  // sans pont, et le graphe d'essai n'a aucun dossier à lire.
  (globalThis as { window?: unknown }).window ??= globalThis;
  configurerRegistreUI(registre as unknown as RegistreUI);
  oublierServicesApercu();
  oublierServicesOrchestration();
  fermer();
});
afterEach(() => { ouvrir(); oublierServicesApercu(); oublierServicesOrchestration(); });

describe("le moteur et ses commandes", () => {
  it("UNE DEMANDE LIE SON DOSSIER À L'INSTANT OÙ ELLE EST ENVOYÉE, et attend la fin de la précédente", async () => {
    const m = moteur();
    const premiere = m.envoyer({ genre: "lancer" });
    await souffler();
    m.liaison.repertoire = "second";
    const seconde = m.envoyer({ genre: "lancer", cible: "a" });
    m.liaison.repertoire = "troisième";
    // LA QUESTION EST POSÉE À L'ENVOI, une fois par demande, et non au départ de la passe.
    expect(m.demandes()).toBe(2);
    // La seconde attend : une seule passe a commencé.
    expect(m.genres().filter((g) => g === "passeCommencee")).toHaveLength(1);
    ouvrir();
    await premiere;
    await seconde;
    expect(m.montres()).toEqual(["premier", "second"]);
    expect(m.genres().filter((g) => g === "passeTerminee")).toHaveLength(2);
  });

  it("ARRÊTER ABAT LA PASSE EN COURS, QUI LE DIT À L'INSTANT, ET VIDE LA FILE", async () => {
    const m = moteur();
    const premiere = m.envoyer({ genre: "lancer" });
    await souffler();
    const enFile = m.envoyer({ genre: "lancer", cible: "a" });
    m.envoyer({ genre: "arreter" });
    expect(m.genres().at(-1)).toBe("passeArretee");
    await premiere;
    expect(await enFile).toBeUndefined();
    expect(m.genres().filter((g) => g === "passeCommencee")).toHaveLength(1);
    expect(m.dits.at(-1)).toMatchObject({ genre: "passeTerminee", raison: "arret" });
  });

  it("REMETTRE À ZÉRO ABAT LA PASSE EN COURS, PUIS LÂCHE SES NŒUDS DU CACHE", async () => {
    const m = moteur();
    ouvrir();
    await m.envoyer({ genre: "lancer" });
    expect(m.envoyer({ genre: "exporterCache" }).map(([id]) => id)).toEqual(["a"]);

    fermer();
    const encore = m.envoyer({ genre: "lancer" });
    await souffler();
    m.envoyer({ genre: "remettreAZero", ids: ["a"] });
    // L'ARRÊT, PUIS CE QUI EST PÉRIMÉ : le récepteur écartera ce que la passe abattue dira encore de `a`.
    expect(m.genres().slice(-2)).toEqual(["passeArretee", "perimes"]);
    expect(m.envoyer({ genre: "exporterCache" })).toEqual([]);
    await encore;
    expect(m.dits.at(-1)).toMatchObject({ genre: "passeTerminee", raison: "arret" });
  });

  it("SANS PASSE EN COURS, ARRÊTER NE DIT RIEN, ET REMETTRE À ZÉRO NE DIT QUE CE QUI EST PÉRIMÉ", () => {
    const m = moteur();
    m.envoyer({ genre: "arreter" });
    m.envoyer({ genre: "remettreAZero", ids: ["a"] });
    expect(m.dits).toEqual([{ genre: "perimes", generation: 0, numero: 1, ids: ["a"] }]);
  });
});

describe("les remises à zéro et les oublis, numérotés (pièce P6)", () => {
  it("UN OUBLI PENDANT LA PASSE L'EMPÊCHE D'ÉCRIRE CE NŒUD AU CACHE, sans rien dire au récepteur", async () => {
    const m = moteur();
    const passe = m.envoyer({ genre: "lancer" });
    await souffler();
    m.envoyer({ genre: "oublier", ids: ["a"] });
    expect(m.genres()).not.toContain("perimes");
    ouvrir();
    await passe;
    // `a` a fini après l'oubli, sur le graphe d'avant : le cache ne le tient pas, l'écran le montre.
    expect(m.envoyer({ genre: "exporterCache" })).toEqual([]);
    expect(m.montres()).toEqual(["premier"]);
  });

  it("UN GRAPHE ABANDONNÉ SE DIT AU RÉCEPTEUR, et la passe suivante part après lui", async () => {
    const m = moteur();
    m.envoyer({ genre: "oublier", ids: "tout", grapheAbandonne: true });
    expect(m.dits).toEqual([{ genre: "perimes", generation: 0, numero: 1, ids: "tout" }]);
    ouvrir();
    await m.envoyer({ genre: "lancer" });
    expect(m.dits.find((e) => e.genre === "passeCommencee")).toMatchObject({ numero: 1 });
    expect(m.envoyer({ genre: "exporterCache" }).map(([id]) => id)).toEqual(["a"]);
  });
});
