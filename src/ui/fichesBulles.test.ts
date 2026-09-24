// ui/fichesBulles.test.ts — La fiche d'une bulle se dessine, mais ne se choisit pas.
import { describe, expect, it } from "vitest";

import { creerRegistre, estBulle, ficheDeBulle, type NoeudG, type PluginDef, type TypeValeur } from "../core";
import { signatureBulles, synchroniserFichesBulles, UNIVERS_BULLES } from "./fichesBulles";

const def = (id: string, entrees: number, sorties: number): PluginDef<TypeValeur, AudioContext> => ({
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
  const r = creerRegistre<TypeValeur, AudioContext>();
  // Le registre refuse une fiche dont un port porte un type de flux inconnu de lui.
  r.enregistrerTypeFlux({ id: "audio", couleur: "#fff", libelle: "Audio" });
  r.enregistrer(def("gain", 1, 1));
  r.enregistrer(def("melange", 2, 1));
  return r;
}

const nomDe = (n: NoeudG) => n.id;

describe("la synchronisation des fiches de bulle", () => {
  it("elle inscrit une fiche par bulle, avec les ports de ses membres", () => {
    const r = registrePret();
    const noeuds = [noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1"), noeud("m", "melange", "b1")];
    const { inscrites, retirees } = synchroniserFichesBulles(noeuds, r, nomDe);

    expect(inscrites).toEqual([ficheDeBulle("b1")]);
    expect(retirees).toEqual([]);
    const fiche = r.trouverDef(ficheDeBulle("b1"))!;
    expect(fiche.entrees.map((e) => e.nom)).toEqual(["g ▸ E0", "m ▸ E0", "m ▸ E1"]);
    expect(fiche.univers).toBe(UNIVERS_BULLES);
  });

  it("ELLE SE DESSINE MAIS NE SE CHOISIT PAS : trouvable par son identifiant, absente du catalogue", () => {
    const r = registrePret();
    const noeuds = [noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1")];
    synchroniserFichesBulles(noeuds, r, nomDe);

    expect(r.trouverDef(ficheDeBulle("b1"))).toBeDefined();
    // Le catalogue est ce qu'énumèrent la palette, le quiz, le vocabulaire de génération et la
    // documentation : aucun d'eux n'a eu à filtrer, et aucun ne peut donc oublier de le faire.
    expect(r.tousLesPlugins().map((d) => d.id)).toEqual(["gain", "melange"]);
    expect(r.tousLesPlugins().some((d) => estBulle(d.id))).toBe(false);
  });

  it("une bulle disparue voit sa fiche retirée", () => {
    const r = registrePret();
    const avec = [noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1")];
    synchroniserFichesBulles(avec, r, nomDe);
    const { retirees } = synchroniserFichesBulles([noeud("g", "gain")], r, nomDe);

    expect(retirees).toEqual([ficheDeBulle("b1")]);
    expect(r.trouverDef(ficheDeBulle("b1"))).toBeUndefined();
  });

  it("un membre ajouté allonge la fiche, et la signature le dit", () => {
    const r = registrePret();
    const avant = [noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1")];
    const apres = [...avant, noeud("m", "melange", "b1")];
    expect(signatureBulles(avant, nomDe)).not.toBe(signatureBulles(apres, nomDe));

    synchroniserFichesBulles(apres, r, nomDe);
    expect(r.trouverDef(ficheDeBulle("b1"))!.entrees).toHaveLength(3);
  });

  it("déplacer un nœud ne change pas la signature : la resynchronisation ne se déclenche pas", () => {
    const noeuds = [noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1")];
    const deplaces = noeuds.map((n) => ({ ...n, position: { x: 999, y: 999 } }));
    expect(signatureBulles(deplaces, nomDe)).toBe(signatureBulles(noeuds, nomDe));
  });

  it("AUCUNE ENTRÉE N'EST OBLIGATOIRE, sans quoi replier ferait échouer la validation", () => {
    const r = registrePret();
    synchroniserFichesBulles([noeud("b1", ficheDeBulle("b1")), noeud("g", "gain", "b1")], r, nomDe);
    for (const e of r.trouverDef(ficheDeBulle("b1"))!.entrees) expect(e.requis).toBe(false);
  });
});
