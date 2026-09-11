// audio/texte.test.ts — Les transformations du nœud « Modifier le texte ».
//
// Ce qui mérite d'être verrouillé ici n'est pas qu'un remplacement remplace —
// c'est le comportement aux bords, là où une implémentation naïve surprend :
// une chaîne de recherche vide, un motif d'expression régulière invalide, des
// caractères qui ont un sens en regex mais pas pour l'utilisateur, et des sauts
// de ligne qu'un « nettoyage » ne doit pas emporter.
import { describe, it, expect } from "vitest";
import { modifierTexte } from "./texte";

describe("remplacement littéral", () => {
  it("remplace toutes les occurrences, pas seulement la première", () => {
    // `String.replace` avec une chaîne ne remplace QUE la première : le piège
    // le plus courant de cette fonction.
    const r = modifierTexte("la la la", { operation: "remplacer", chercher: "la", remplacerPar: "ré" });
    expect(r.texte).toBe("ré ré ré");
    expect(r.remplacements).toBe(3);
  });

  it("prend le motif À LA LETTRE, sans l'interpréter", () => {
    // « C.A.T » ne doit pas se comporter comme « C?A?T ». L'utilisateur qui
    // choisit « Remplacer » et non « Remplacer (regex) » attend le littéral.
    const r = modifierTexte("C.A.T et CxAyT", { operation: "remplacer", chercher: "C.A.T", remplacerPar: "chat" });
    expect(r.texte).toBe("chat et CxAyT");
    expect(r.remplacements).toBe(1);
  });

  it("supprime quand le remplacement est vide", () => {
    const r = modifierTexte("[bruit] bonjour [bruit]", { operation: "remplacer", chercher: "[bruit] ", remplacerPar: "" });
    expect(r.texte).toBe("bonjour [bruit]".replace("[bruit]", "[bruit]"));
    expect(r.texte).toBe("bonjour [bruit]");
  });

  it("laisse le texte intact sur une recherche vide", () => {
    // `replaceAll("")` insérerait le remplacement entre CHAQUE caractère.
    // Personne ne veut cela ; le champ vide signifie « ne rien faire ».
    const r = modifierTexte("bonjour", { operation: "remplacer", chercher: "", remplacerPar: "X" });
    expect(r.texte).toBe("bonjour");
    expect(r.remplacements).toBe(0);
  });

  it("compte zéro quand rien n'est trouvé", () => {
    // L'information utile quand un remplacement « ne marche pas ».
    const r = modifierTexte("bonjour", { operation: "remplacer", chercher: "absent", remplacerPar: "X" });
    expect(r.texte).toBe("bonjour");
    expect(r.remplacements).toBe(0);
  });
});

describe("remplacement par expression régulière", () => {
  it("interprète le motif", () => {
    const r = modifierTexte("piste1 piste22", { operation: "regex", chercher: "\\d+", remplacerPar: "#" });
    expect(r.texte).toBe("piste# piste#");
    expect(r.remplacements).toBe(2);
  });

  it("reprend les groupes capturés", () => {
    // Le cas qui justifie le mode regex : retourner un ordre, pas seulement
    // supprimer.
    const r = modifierTexte("Dupont Jean", { operation: "regex", chercher: "(\\w+) (\\w+)", remplacerPar: "$2 $1" });
    expect(r.texte).toBe("Jean Dupont");
  });

  it("retire un préambule de LLM", () => {
    // L'usage réel : un modèle qui répond « Voici les paroles : … » avant le
    // texte qu'on voulait envoyer à la synthèse vocale.
    const r = modifierTexte("Bien sûr ! Voici les paroles :\nSous le ciel", {
      operation: "regex", chercher: "^[^\\n]*:\\n", remplacerPar: "",
    });
    expect(r.texte).toBe("Sous le ciel");
  });

  it("un motif invalide rend le texte INCHANGÉ, avec la cause", () => {
    // Le point qui compte : on écrit ces motifs en tâtonnant. Faire échouer le
    // nœud — et donc tout le graphe en aval — à chaque parenthèse oubliée
    // serait insupportable.
    const r = modifierTexte("bonjour", { operation: "regex", chercher: "(non fermée", remplacerPar: "X" });
    expect(r.texte).toBe("bonjour");
    expect(r.erreur).toBeTruthy();
    expect(r.remplacements).toBe(0);
  });
});

describe("casse", () => {
  it("passe en majuscules et en minuscules, accents compris", () => {
    expect(modifierTexte("Été à Paris", { operation: "majuscules" }).texte).toBe("ÉTÉ À PARIS");
    expect(modifierTexte("Été à Paris", { operation: "minuscules" }).texte).toBe("été à paris");
  });
});

describe("nettoyage des espaces", () => {
  it("réduit les espaces multiples et retire ceux de bordure", () => {
    const r = modifierTexte("  bonjour    le   monde  ", { operation: "espaces" });
    expect(r.texte).toBe("bonjour le monde");
  });

  it("PRÉSERVE les sauts de ligne", () => {
    // Un « nettoyage » qui aplatit tout détruirait la structure d'un texte de
    // paroles — or c'est précisément ce qu'on branche derrière un générateur
    // de paroles.
    const r = modifierTexte("Premier vers\nSecond vers", { operation: "espaces" });
    expect(r.texte).toBe("Premier vers\nSecond vers");
  });

  it("ramène les lignes vides en série à une seule", () => {
    const r = modifierTexte("Couplet\n\n\n\nRefrain", { operation: "espaces" });
    expect(r.texte).toBe("Couplet\n\nRefrain");
  });

  it("nettoie les fins de ligne, ce que produit une transcription", () => {
    const r = modifierTexte("bonjour   \n   le monde", { operation: "espaces" });
    expect(r.texte).toBe("bonjour\nle monde");
  });

  it("traite les tabulations comme des espaces", () => {
    expect(modifierTexte("a\t\tb", { operation: "espaces" }).texte).toBe("a b");
  });
});

describe("encadrement", () => {
  it("ajoute avant et après", () => {
    // L'usage : préfixer une consigne à un prompt produit par un autre nœud.
    const r = modifierTexte("un piano mélancolique", {
      operation: "encadrer", avant: "Compose : ", apres: " — 120 BPM",
    });
    expect(r.texte).toBe("Compose : un piano mélancolique — 120 BPM");
  });

  it("accepte un seul des deux côtés", () => {
    expect(modifierTexte("x", { operation: "encadrer", avant: ">" }).texte).toBe(">x");
    expect(modifierTexte("x", { operation: "encadrer", apres: "<" }).texte).toBe("x<");
  });
});

describe("robustesse", () => {
  it("accepte un texte vide sans broncher", () => {
    for (const operation of ["remplacer", "regex", "majuscules", "minuscules", "espaces", "encadrer"] as const) {
      expect(modifierTexte("", { operation, chercher: "a", remplacerPar: "b" }).texte, operation).toBe("");
    }
  });

  it("rend le texte inchangé sur une opération inconnue", () => {
    // Un workflow enregistré avec une opération retirée depuis ne doit pas
    // faire disparaître le texte en silence.
    expect(modifierTexte("intact", { operation: "inexistante" as any }).texte).toBe("intact");
  });
});
