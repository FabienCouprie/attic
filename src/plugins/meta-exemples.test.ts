// plugins/meta-exemples.test.ts — La réparation d'un méta déjà en magasin.
//
// ═══ POURQUOI CE FICHIER EXISTE ═══
//
// LE MÉTA EMBARQUÉ « Synthétiseur soustractif » EST NÉ FAUTIF, le 2026-07-13 : son filtre portait
// `{ Fréquence: 600, Q: 4 }` quand la fiche de « Filtre + réponse » déclarait déjà
// « Fréquence de coupure » et « Résonance ». Les réglages étant indexés par leur libellé, le moteur
// ne trouvait rien et appliquait les défauts — 1000 Hz et Q 0,7 — pendant trois mois et demi, sans
// un mot, parce qu'une clé inconnue ne lève pas.
//
// ET CORRIGER LA SOURCE NE SUFFISAIT PAS. Ces métas sont persistés au premier lancement : qui
// emploie Attic depuis juillet a la version fautive chez lui, et l'installation passait son tour dès
// que l'identifiant était présent. Le défaut aurait survécu à sa propre correction.
//
// CE QUE CES CAS TIENNENT, ET C'EST LA MOITIÉ DÉLICATE : la réparation doit atteindre la copie
// fautive SANS TOUCHER AU TRAVAIL DE QUI A MODIFIÉ LE MÉTA. Un méta embarqué est aussi un point de
// départ qu'on ouvre et qu'on règle.
import "node-web-audio-api/polyfill.js";
import { beforeEach, describe, expect, it } from "vitest";
import { enregistrerMeta, supprimerMeta, tousLesMetas, type MetaComposant } from "../core";
import { registre } from "../audio/adaptateur";
import { installerMetasExemples } from "./meta-exemples";

const ID = "meta-synth-soustractif";

/** La copie fautive telle qu'elle dort dans le stockage de qui emploie Attic depuis juillet. */
function copieFautive(): MetaComposant {
  return {
    id: ID,
    nom: "Synthétiseur soustractif",
    entrees: [],
    sorties: [{ nom: "Out 1", type: "audio" }],
    mapEntrees: [],
    mapSorties: [{ noeudInterne: "noeud-3", portIndex: 0 }],
    sousNoeuds: [
      { id: "noeud-1", position: { x: 0, y: 0 },
        data: { ficheId: "oscillateur", parametres: { Forme: "Dent de scie", Fréquence: 110, Durée: 1.5, Volume: 80 } } },
      { id: "noeud-2", position: { x: 0, y: 0 },
        data: { ficheId: "reponse-filtre", parametres: { Type: "passe-bas", Fréquence: 600, Q: 4 } } },
      { id: "noeud-3", position: { x: 0, y: 0 },
        data: { ficheId: "enveloppe-adsr", parametres: { Attaque: 5, Déclin: 250, Maintien: 30, Relâchement: 400 } } },
    ],
    sousAretes: [],
  } as unknown as MetaComposant;
}

/** Les réglages d'un sous-nœud du méta en magasin. */
function reglages(id: string): Record<string, unknown> {
  const meta = tousLesMetas().find((m) => m.id === ID);
  expect(meta, "le méta a disparu du magasin").toBeTruthy();
  const sous = meta?.sousNoeuds.find((s) => s.id === id);
  expect(sous, `sous-nœud ${id} absent`).toBeTruthy();
  return (sous?.data?.parametres ?? {}) as Record<string, unknown>;
}

describe("l'installation des métas embarqués", () => {
  beforeEach(() => {
    if (tousLesMetas().some((m) => m.id === ID)) supprimerMeta(ID);
  });

  it("RÉPARE UNE COPIE FAUTIVE DÉJÀ EN MAGASIN, sinon la correction n'atteint personne", () => {
    enregistrerMeta(copieFautive());
    installerMetasExemples();

    const filtre = reglages("noeud-2");
    expect(filtre["Fréquence de coupure"], "600 Hz était perdu sous « Fréquence »").toBe(600);
    expect(filtre["Résonance"], "Q 4 était perdu sous « Q »").toBe(4);
    expect("Fréquence" in filtre, "la clé morte ne doit pas rester à côté de la bonne").toBe(false);
    expect("Q" in filtre).toBe(false);
  });

  it("et la fiche déclare bien ces deux noms, sans quoi ce cas ne prouverait rien", () => {
    // SANS CE CAS, LES DEUX PRÉCÉDENTS SERAIENT VERTS SUR UNE FICHE RENOMMÉE : la réparation
    // recopierait une clé que plus personne ne lit, et le défaut serait intact sous un autre nom.
    const def = registre.trouverDef("reponse-filtre");
    expect(def, "la fiche du filtre a disparu").toBeTruthy();
    const noms = (def?.parametres ?? []).map((p) => p.nom);
    expect(noms).toContain("Fréquence de coupure");
    expect(noms).toContain("Résonance");
  });

  it("NE TOUCHE PAS À UNE VALEUR RÉGLÉE PAR L'UTILISATEUR, la réparation ne se paie pas de son travail", () => {
    const sien = copieFautive();
    // Il a ouvert le méta et réglé sa coupure lui-même : la clé est valable, la valeur est à lui.
    const filtre = sien.sousNoeuds[1].data.parametres as Record<string, unknown>;
    delete filtre["Fréquence"];
    delete filtre["Q"];
    filtre["Fréquence de coupure"] = 2500;
    filtre["Résonance"] = 9;
    enregistrerMeta(sien);
    installerMetasExemples();

    const apres = reglages("noeud-2");
    expect(apres["Fréquence de coupure"], "sa coupure doit survivre à la réparation").toBe(2500);
    expect(apres["Résonance"]).toBe(9);
  });

  it("et une clé valable qui porte une AUTRE valeur n'est pas écrasée par celle du modèle", () => {
    // Le cas mixte, qui est le plus facile à casser : la clé morte est là ET la bonne clé existe
    // déjà avec une valeur choisie. Le rapprochement se fait sur la valeur du modèle, et la clé
    // occupée n'est jamais remplacée.
    const mixte = copieFautive();
    const filtre = mixte.sousNoeuds[1].data.parametres as Record<string, unknown>;
    filtre["Fréquence de coupure"] = 1800;
    enregistrerMeta(mixte);
    installerMetasExemples();

    const apres = reglages("noeud-2");
    expect(apres["Fréquence de coupure"], "sa valeur passe devant celle du modèle").toBe(1800);
    expect("Fréquence" in apres, "la clé morte reste, faute de place : rien n'est inventé").toBe(true);
    expect(apres["Résonance"], "l'autre clé, libre, est bien réparée").toBe(4);
  });

  it("ET NE DÉPLACE JAMAIS UNE CLÉ VALABLE, même si sa valeur coïncide avec celle du modèle", () => {
    // ═══ CE CAS EXISTE PARCE QU'UN DÉFAUT PLANTÉ ÉTAIT VERT SANS LUI ═══
    //
    // La réparation ne regarde que les clés QU'AUCUNE FICHE NE DÉCLARE. J'ai retiré ce filtre, et
    // les cinq cas sont restés verts : aucun n'avait de clé valable dont la valeur coïncide avec
    // celle d'un AUTRE réglage du modèle. Or c'est là, et seulement là, que le filtre travaille —
    // sans lui, le rapprochement par valeur déplace une valeur parfaitement lue.
    //
    // ICI, « Résonance » vaut 600, comme la coupure du modèle, et la coupure est absente : sans le
    // filtre, 600 quitterait « Résonance » pour « Fréquence de coupure ».
    const piege = copieFautive();
    const filtre = piege.sousNoeuds[1].data.parametres as Record<string, unknown>;
    delete filtre["Fréquence"];
    delete filtre["Q"];
    filtre["Résonance"] = 600;
    enregistrerMeta(piege);
    installerMetasExemples();

    const apres = reglages("noeud-2");
    expect(apres["Résonance"], "une clé déclarée n'est jamais déplacée").toBe(600);
    expect("Fréquence de coupure" in apres,
      "et rien n'est inventé sous la clé absente").toBe(false);
  });

  it("INSTALLE LE MÉTA QUAND IL EST ABSENT, ce qui est le cas d'un utilisateur neuf", () => {
    installerMetasExemples();
    const filtre = reglages("noeud-2");
    expect(filtre["Fréquence de coupure"]).toBe(600);
    expect(filtre["Résonance"]).toBe(4);
    expect(filtre["Type"], "la valeur déclarée, et non celle qui ne passait que par tolérance de casse")
      .toBe("Passe-bas");
  });
});
