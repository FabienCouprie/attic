// ui/moteur/copies-du-moteur.test.ts — Les copies d'une boucle suivent le nœud qu'on voit, au moteur.
//
// POURQUOI CE TEST. Relevé le 2026-11-16 et vu dans l'application par
// `tests-e2e/copies-remises-a-zero-dans-application.spec.ts` : une copie de boucle s'appelle
// `debut#k::corps`, et les deux règles qui disent ce qu'un ↺ atteint coupaient l'identifiant au
// premier `::`, où elles ne lisaient que `debut#k`. Le cache gardait les copies d'un corps remis à
// zéro (`oublierAvecMetas`), et une copie dont l'exécuteur avait rendu avant le ↺ s'écrivait encore au
// cache pendant la conversion de fréquence qui suit (`depuis` de `core/remises.ts`).
//
// CE QUI DOIT ÊTRE TENU, sur le moteur entier et une vraie boucle dépliée :
//   - une remise à zéro du corps lâche ses copies, et une remise à zéro de la fin seule les garde ;
//   - une copie qui finit sa conversion après le ↺ de son corps n'est pas écrite au cache.
// L'économie de mémoire est coupée : sous elle, le corps est lâché à chaque fin de passe, et ni l'une
// ni l'autre faute ne se verrait.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creerRegistre, type AreteG, type NoeudG, type PluginDef } from "../../core";
import { FICHE_DEBUT, FICHE_FIN } from "../../core/boucle-graphe";
import type { InstantaneDeGraphe } from "../../core/protocole-moteur";
import { configurerRegistreUI, type RegistreUI } from "../registre-actif";
import { configurerServicesApercu, oublierServicesApercu } from "../services-apercu";
import { oublierServicesOrchestration } from "../services-orchestration";
import { creerMoteur } from "./moteur";

const registre = creerRegistre<unknown, null>();
registre.enregistrerTypeFlux({ id: "texte", couleur: "#FF6600", libelle: "Texte" });
const fiche = (id: string, entrees: number, executer: PluginDef<unknown, null>["executer"], parametres: PluginDef<unknown, null>["parametres"] = []): PluginDef<unknown, null> => ({
  id, nom: id, univers: "Essai", famille: "Essai", resume: id, notice: "Essai.",
  entrees: Array.from({ length: entrees }, () => ({ nom: "X", type: "texte" })), sorties: [{ nom: "Y", type: "texte" }],
  parametres, executer,
});
registre.enregistrer(fiche("essai:source", 0, async () => ({ valeurs: ["source"] })));
registre.enregistrer(fiche(FICHE_DEBUT, 1, async () => ({ valeurs: [null] }),
  [{ nom: "Tours", type: "curseur", defaut: 2, plage: [1, 8], doc: "Les tours" }]));
registre.enregistrer(fiche("essai:corps", 1, async () => ({ valeurs: ["corps"] })));
registre.enregistrer(fiche(FICHE_FIN, 1, async (ctx) => ({ valeurs: [(ctx.entrees() as unknown[]).join("+")] })));

const noeud = (id: string, ficheId: string, parametres: Record<string, unknown> = {}): NoeudG => ({ id, data: { ficheId, parametres } });
const arete = (source: string, target: string) => ({ id: `${source}-${target}`, source, target, sourceHandle: "out:0", targetHandle: "in:0" }) as AreteG;
const GRAPHE: InstantaneDeGraphe = {
  noeuds: [noeud("source", "essai:source"), noeud("debut", FICHE_DEBUT, { Tours: 2 }), noeud("corps", "essai:corps"), noeud("fin", FICHE_FIN)],
  aretes: [arete("source", "debut"), arete("debut", "corps"), arete("corps", "fin")],
  metas: [],
};
const COPIES = ["debut#0::corps", "debut#1::corps"];

function moteur() {
  const m = creerMoteur({
    questions: {
      graphe: () => GRAPHE, priorite: () => null, noeudVisible: (id) => GRAPHE.noeuds.find((n) => n.id === id),
      noeudsVisibles: () => GRAPHE.noeuds, economieMemoire: () => false, demande: () => ({ t: (cle) => cle, repertoire: "" }),
    },
    recepteur: () => {}, audio: async () => null as never, canoniser: (_p, v) => v,
  });
  return { ...m, cles: () => m.envoyer({ genre: "exporterCache" }).map(([id]) => id).sort() };
}

beforeEach(() => {
  // LE PILOTE DU LOT DEMANDE `window.api` : sous Node, la fenêtre est le global, sans pont.
  (globalThis as { window?: unknown }).window ??= globalThis;
  configurerRegistreUI(registre as unknown as RegistreUI);
  oublierServicesApercu();
  oublierServicesOrchestration();
});
afterEach(() => { oublierServicesApercu(); oublierServicesOrchestration(); });

describe("les copies d'une boucle et la remise à zéro, au moteur", () => {
  it("LE ↺ DU CORPS LÂCHE SES COPIES, le ↺ de la fin seule les garde", async () => {
    const m = moteur();
    await m.envoyer({ genre: "lancer" });
    expect(m.cles()).toEqual([...COPIES, "fin", "source"]);
    m.envoyer({ genre: "remettreAZero", ids: ["fin"] });
    expect(m.cles()).toEqual([...COPIES, "source"]);
    m.envoyer({ genre: "remettreAZero", ids: ["corps", "fin"] });
    expect(m.cles()).toEqual(["source"]);
  });

  it("UNE COPIE QUI FINIT SA CONVERSION APRÈS LE ↺ DE SON CORPS N'EST PAS ÉCRITE AU CACHE", async () => {
    // LA CONVERSION DE LA PREMIÈRE COPIE ATTEND : son exécuteur a rendu, la passe n'est pas encore
    // abattue, et c'est pendant cette attente que le ↺ arrive.
    let ouvrir = () => {};
    const barrage = new Promise<void>((r) => { ouvrir = r; });
    let enAttente = false;
    configurerServicesApercu({
      porterALaFrequenceDeTravail: async (valeurs) => {
        if (valeurs[0] === "corps" && !enAttente) { enAttente = true; await barrage; }
        return [...valeurs];
      },
    });
    const m = moteur();
    const passe = m.envoyer({ genre: "lancer" });
    await expect.poll(() => enAttente).toBe(true);
    m.envoyer({ genre: "remettreAZero", ids: ["corps", "fin"] });
    ouvrir();
    await passe;
    expect(m.cles(), "la copie calculée avant le ↺ s'est écrite au cache après lui").toEqual(["source"]);
  });
});
