// ui/fichesBulles.test.ts — La fiche d'une bulle se dessine, mais ne se choisit pas.
import { describe, expect, it } from "vitest";

import {
  creerRegistre, estBulle, ficheDeBulle,
  type AreteG, type NoeudG, type PluginDef,
} from "../core";
import { signatureBulles, synchroniserFichesBulles, UNIVERS_BULLES } from "./fichesBulles";

const def = (id: string, entrees: number, sorties: number): PluginDef<unknown, unknown> => ({
  id, nom: id, univers: "Traitement", famille: "Effets", resume: `Le composant ${id}.`,
  entrees: Array.from({ length: entrees },
    (_, i) => ({ nom: `E${i}`, type: "audio" })),
  sorties: Array.from({ length: sorties }, (_, i) => ({ nom: `S${i}`, type: "audio" })),
  parametres: [], executer: async () => ({ valeurs: [] }),
});

const noeud = (id: string, ficheId: string, bulle?: string): NoeudG => ({
  id, position: { x: 0, y: 0 },
  data: { ficheId, parametres: {}, ...(bulle ? { bulle } : {}) },
});

function registrePret() {
  const r = creerRegistre<unknown, unknown>();
  // Le registre refuse une fiche dont un port porte un type de flux inconnu de lui.
  r.enregistrerTypeFlux({ id: "audio", couleur: "#fff", libelle: "Audio" });
  r.enregistrer(def("gain", 1, 1));
  r.enregistrer(def("melange", 2, 1));
  return r;
}

const arete =(id: string, source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

/** Une bulle de deux membres, nourrie du dehors et alimentant le dehors. */
const GRAPHE = [
  noeud("dehors", "gain"), noeud("apres", "gain"),
  noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1"), noeud("m", "melange", "b1"),
];
const ARETES = [arete("e1", "dehors", "g"), arete("e2", "g", "m"), arete("e3", "m", "apres")];

describe("la synchronisation des fiches de bulle", () => {
  it("elle inscrit une fiche par bulle, avec les ports qui la traversent", () => {
    const r = registrePret();
    const { inscrites, retirees } = synchroniserFichesBulles(GRAPHE, ARETES, r);

    expect(inscrites).toEqual([ficheDeBulle("b1")]);
    expect(retirees).toEqual([]);
    const fiche = r.trouverDef(ficheDeBulle("b1"))!;
    // Deux entrées : celle qui franchit la frontière, et la seconde entrée du mélangeur, que rien
    // n'alimente et qui reste donc offerte. Une sortie : celle qui franchit. Aucune n'est nommée.
    expect(fiche.entrees.map((e) => e.nom)).toEqual(["", ""]);
    expect(fiche.sorties.map((e) => e.nom)).toEqual([""]);
    expect(fiche.univers).toBe(UNIVERS_BULLES);
  });

  it("ELLE SE DESSINE MAIS NE SE CHOISIT PAS : trouvable par son identifiant, absente du catalogue", () => {
    const r = registrePret();
    synchroniserFichesBulles(GRAPHE, ARETES, r);

    expect(r.trouverDef(ficheDeBulle("b1"))).toBeDefined();
    // Le catalogue est ce qu'énumèrent la palette, le quiz, le vocabulaire de génération et la
    // documentation : aucun d'eux n'a eu à filtrer, et aucun ne peut donc oublier de le faire.
    expect(r.tousLesPlugins().map((d) => d.id)).toEqual(["gain", "melange"]);
    expect(r.tousLesPlugins().some((d) => estBulle(d.id))).toBe(false);
  });

  it("une bulle disparue voit sa fiche retirée", () => {
    const r = registrePret();
    synchroniserFichesBulles(GRAPHE, ARETES, r);
    const { retirees } = synchroniserFichesBulles([noeud("g", "gain")], [], r);

    expect(retirees).toEqual([ficheDeBulle("b1")]);
    expect(r.trouverDef(ficheDeBulle("b1"))).toBeUndefined();
  });

  it("BRANCHER UNE ARÊTE NE DÉPLACE PAS LE PORT, et la signature se met pourtant à jour", () => {
    // CE QUI EST GARDÉ ICI EST LA STABILITÉ DU RANG. La sortie du mélangeur est offerte avant d'être
    // branchée, parce qu'elle est libre ; la brancher la fait passer de libre à traversante, et elle
    // doit rester au même rang, sans quoi les arêtes déjà posées sur la bulle changeraient de
    // destination. La signature, elle, change bien : la fiche se resynchronise.
    const r = registrePret();
    const avant = ARETES.filter((a) => a.id !== "e3");
    expect(signatureBulles(GRAPHE, avant)).not.toBe(signatureBulles(GRAPHE, ARETES));

    synchroniserFichesBulles(GRAPHE, avant, r);
    expect(r.trouverDef(ficheDeBulle("b1"))!.sorties).toHaveLength(1);
    synchroniserFichesBulles(GRAPHE, ARETES, r);
    expect(r.trouverDef(ficheDeBulle("b1"))!.sorties).toHaveLength(1);
  });

  it("déplacer un nœud ne change pas la signature : la resynchronisation ne se déclenche pas", () => {
    const deplaces = GRAPHE.map((n) => ({ ...n, position: { x: 999, y: 999 } }));
    expect(signatureBulles(deplaces, ARETES)).toBe(signatureBulles(GRAPHE, ARETES));
  });

  it("SANS AUCUNE BULLE, LA SIGNATURE EST VIDE : un graphe ordinaire ne recalcule rien", () => {
    expect(signatureBulles([noeud("g", "gain")], [arete("e", "g", "g")])).toBe("");
  });

  it("AUCUNE ENTRÉE N'EST OBLIGATOIRE, sans quoi replier ferait échouer la validation", () => {
    const r = registrePret();
    synchroniserFichesBulles(GRAPHE, ARETES, r);
    for (const e of r.trouverDef(ficheDeBulle("b1"))!.entrees) expect(e.requis).toBe(false);
  });
});
