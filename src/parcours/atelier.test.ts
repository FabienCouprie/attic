// parcours/atelier.test.ts — Ce que la photographie du graphe doit garantir.
//
// LE TEST QUI COMPTE EST CELUI DU CHEMIN. Un exercice demande qu'un générateur « arrive » à une
// sortie, et l'élève met ce qu'il veut entre les deux : trois effets, un méta-composant, une
// branche qui repart ailleurs. Si le cheminement s'arrêtait au premier voisin, tous les exercices
// de branchement se mettraient à refuser des graphes parfaitement corrects dès le deuxième nœud
// ajouté — et l'élève conclurait qu'il s'y prend mal.
//
// LE SECOND : UN GRAPHE ABÎMÉ NE DOIT PAS FAIRE LEVER D'ERREUR. L'instantané est pris à chaque
// rendu, sur un tableau de nœuds qu'un chargement de projet, un copier-coller ou une suppression
// peut laisser dans un état transitoire — arête pendante, `data` absent, fiche inconnue. Un
// parcours qui plante sur un graphe en cours d'édition serait inutilisable.
import { describe, expect, it } from "vitest";
import { amontDirect, instantane, mene, relieDirect, type NoeudBrut } from "./atelier";

const FICHES: Record<string, { univers: string; famille: string }> = {
  "generateur-frequence": { univers: "Entrées", famille: "Génération" },
  reverberation: { univers: "Traitement", famille: "Effets" },
  echo: { univers: "Traitement", famille: "Effets" },
  "sortie-audio": { univers: "Sorties", famille: "Écoute" },
};
const info = (id: string) => FICHES[id];

const n = (id: string, ficheId: string, extra: Record<string, unknown> = {}): NoeudBrut =>
  ({ id, data: { ficheId, parametres: { Durée: 2 }, ...extra } });

const CHAINE = [n("g", "generateur-frequence"), n("e", "echo"), n("r", "reverberation"), n("s", "sortie-audio")];
const LIENS = [{ source: "g", target: "e" }, { source: "e", target: "r" }, { source: "r", target: "s" }];

describe("la photographie du graphe", () => {
  const a = instantane(CHAINE, LIENS, info);

  it("retient la famille et l'univers, que le nœud ne porte pas", () => {
    expect(a.noeuds.map((x) => x.famille)).toEqual(["Génération", "Effets", "Effets", "Écoute"]);
    expect(a.noeuds[0].univers).toBe("Entrées");
  });

  it("garde les réglages tels qu'ils sont écrits", () => {
    expect(a.noeuds[0].parametres["Durée"]).toBe(2);
  });

  it("une fiche inconnue existe quand même, sans rubrique", () => {
    const x = instantane([n("c", "commentaire-libre")], [], info);
    expect(x.noeuds).toHaveLength(1);
    expect(x.noeuds[0].famille).toBe("");
  });

  it("UNE ARÊTE PENDANTE EST JETÉE — un graphe à demi chargé ne doit pas mentir", () => {
    const x = instantane(CHAINE, [...LIENS, { source: "g", target: "disparu" }], info);
    expect(x.liens).toHaveLength(3);
    expect(mene(x, "g", "s")).toBe(true);
  });

  it("ce qui n'est pas un graphe ne fait pas lever", () => {
    for (const rien of [null, undefined, [{ id: null }], [{}]] as never[]) {
      expect(() => instantane(rien ?? [], rien ?? [], info)).not.toThrow();
    }
  });
});

describe("a rendu quelque chose", () => {
  // CE QU'UN RUN A PRODUIT NE SE LIT PLUS DANS `data`, MAIS PAR UN ACCESSEUR. Un résultat vit
  // désormais dans un magasin à part, hors du tableau des nœuds, et le shell le passe ici comme il
  // passait déjà le statut. Ce module reste donc pur : il ne connaît ni React, ni le magasin.
  const produit = (par: Record<string, Record<string, unknown>>) => (id: string) => par[id] ?? {};

  it("se lit sur n'importe lequel des champs de résultat", () => {
    const champs = ["audioResultatBuffer", "audioResultatUrl", "audioResultatMessage", "imageResultatUrl", "scriptGenere"];
    for (const champ of champs) {
      const a = instantane([n("g", "generateur-frequence")], [], info, undefined,
        produit({ g: { [champ]: "quelque chose" } }));
      expect(a.noeuds[0].rendu, champ).toBe(true);
    }
  });

  it("un champ vide ne compte pas pour un résultat", () => {
    const a = instantane([n("g", "generateur-frequence")], [], info, undefined,
      produit({ g: { audioResultatMessage: "" } }));
    expect(a.noeuds[0].rendu).toBe(false);
  });

  it("ET UN RÉSULTAT POSÉ DANS `data` NE COMPTE PLUS, ce qui est le sens du déplacement", () => {
    // Si ce cas tombait, c'est que `instantane` lirait encore les données du nœud : le magasin
    // serait alors une seconde source, et deux sources finissent toujours par divergir.
    const a = instantane([n("g", "generateur-frequence", { audioResultatUrl: "blob:x" })], [], info);
    expect(a.noeuds[0].rendu).toBe(false);
  });

  it("LE STATUT SUFFIT AUSSI, et il le faut : un nœud d'écoute ne rend aucun champ", () => {
    const a = instantane([n("s", "sortie-audio")], [], info, (id) => (id === "s" ? "termine" : "attente"));
    expect(a.noeuds[0].rendu).toBe(true);
  });
});

describe("le chemin", () => {
  const a = instantane(CHAINE, LIENS, info);

  it("VA AU-DELÀ DU PREMIER VOISIN — c'est toute la raison de la méthode", () => {
    expect(mene(a, "g", "s")).toBe(true);
    expect(relieDirect(a, "g", "s")).toBe(false);
    expect(relieDirect(a, "g", "e")).toBe(true);
  });

  it("ne remonte pas le courant", () => {
    expect(mene(a, "s", "g")).toBe(false);
  });

  it("un cycle ne fait pas boucler à l'infini", () => {
    const boucle = instantane(CHAINE, [...LIENS, { source: "s", target: "e" }], info);
    expect(mene(boucle, "g", "s")).toBe(true);
    expect(mene(boucle, "e", "g")).toBe(false);
  });

  it("dit qui alimente un nœud, directement", () => {
    expect(amontDirect(a, "r").map((x) => x.id)).toEqual(["e"]);
    expect(amontDirect(a, "g")).toEqual([]);
  });
});
