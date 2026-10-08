// ui/etat-modeles.test.ts — Les six états de l'icône des modèles.
//
// CE QUI REND CES TESTS NÉCESSAIRES : sur un poste de développement, qui a déjà tous les modèles,
// un seul de ces six états s'affiche. Les cinq autres — il en manque, ça télécharge, ça extrait, ça
// a échoué, on ne sait pas encore — ne se voient que chez quelqu'un qui vient d'installer la
// version allégée, c'est-à-dire là où l'on ne peut plus corriger.
import { describe, expect, it } from "vitest";
import { apparenceModeles, aPrendre, sansAdresse, inventaireAffiche, formaterOctets, type EtatModeles } from "./etat-modeles";

const etat = (o: Partial<Parameters<typeof apparenceModeles>[0] & object> = {}) => ({
  complets: 7, total: 7, octetsAPrendre: 0, manquants: [], sansAdresse: [], ...o,
} as any);

describe("le poids affiché", () => {
  it("se lit en mégaoctets, et en gigaoctets au-delà de mille", () => {
    expect(formaterOctets(352084)).toBe("344 Ko");
    expect(formaterOctets(28.3 * 1048576)).toBe("28 Mo");
    expect(formaterOctets(1171.8 * 1048576)).toBe("1,1 Go");
  });

  it("n'annonce jamais « 0 Ko » pour un fichier qui existe", () => {
    expect(formaterOctets(1)).toBe("1 Ko");
  });
});

describe("quand tout est là", () => {
  it("ne met aucune pastille, et le dit dans l'infobulle", () => {
    const a = apparenceModeles(etat(), null);
    expect(a.variante).toBe("complet");
    expect(a.badge).toBeNull();
    expect(a.cle).toBe("modeles.complets");
    expect(a.vars).toEqual([7]);
    // Cliquer reste possible : c'est ainsi qu'on répare un modèle abîmé.
    expect(a.actionnable).toBe(true);
  });
});

describe("quand il en manque", () => {
  it("compte les modèles et annonce le poids à prendre", () => {
    const a = apparenceModeles(etat({ complets: 4, manquants: ["a", "b", "c"], octetsAPrendre: 1171.8 * 1048576 }), null);
    expect(a.variante).toBe("manquants");
    expect(a.badge).toBe("3");
    expect(a.cle).toBe("modeles.manquants");
    expect(a.vars).toEqual([3, "1,1 Go"]);
    expect(a.actionnable).toBe(true);
  });

  it("distingue ce qui manque de ce qui n'a PAS DE SOURCE publiée", () => {
    // Le cas qui ment le plus facilement : il ne manque rien de téléchargeable, mais deux modèles
    // n'ont pas d'adresse. Annoncer « tout est là » ferait chercher longtemps pourquoi un nœud
    // reste muet.
    const a = apparenceModeles(etat({ complets: 5, manquants: [], sansAdresse: ["x", "y"] }), null);
    expect(a.badge).toBe("?");
    expect(a.cle).toBe("modeles.sansAdresse");
    expect(a.vars).toEqual([2]);
    // ET LE CLIC RESTE PERMIS. Ce cas exigeait l'inverse, pour ne pas promettre un téléchargement
    // impossible — mais le clic n'en lance aucun : il ouvre la liste. Le refuser rendait l'icône
    // morte dès qu'UN modèle manquait d'adresse, cachant les dix-neuf autres.
    expect(a.actionnable).toBe(true);
  });
});

describe("pendant le téléchargement", () => {
  it("affiche le pourcentage et dit quel modèle, sur combien", () => {
    const a = apparenceModeles(etat({ manquants: ["a", "b"] }), {
      phase: "telechargement", modele: "sdxs-512", nom: "Texte → image",
      fraction: 0.4237, fait: 1, nombre: 3,
    });
    expect(a.variante).toBe("telechargement");
    expect(a.badge).toBe("42 %");
    expect(a.cle).toBe("modeles.encours");
    // Le deuxième sur trois : on compte à partir de un, comme un humain.
    expect(a.vars).toEqual(["Texte → image", 2, 3]);
  });

  it("un clic INTERROMPT au lieu de relancer", () => {
    const a = apparenceModeles(etat(), { phase: "telechargement", fraction: 0.1 });
    expect(a.interrompt).toBe(true);
    expect(a.actionnable).toBe(true);
  });

  it("n'annonce pas 100 % avant que ce soit fini", () => {
    // Le dernier octet du dernier fichier arrive avant l'écriture et la vérification d'empreinte :
    // afficher 100 % puis attendre ferait croire à un blocage.
    expect(apparenceModeles(etat(), { phase: "telechargement", fraction: 0.9994 }).badge).toBe("99 %");
    expect(apparenceModeles(etat(), { phase: "telechargement", fraction: 1 }).badge).toBe("100 %");
  });

  it("montre l'extraction à part : une archive de 650 Mo ne se déplie pas instantanément", () => {
    const a = apparenceModeles(etat(), { phase: "extraction", nom: "Texte → image", fait: 0, nombre: 1 });
    expect(a.variante).toBe("extraction");
    expect(a.badge).toBe("…");
    expect(a.cle).toBe("modeles.extraction");
  });

  it("l'emporte sur l'inventaire, qui date d'avant", () => {
    const a = apparenceModeles(etat({ manquants: [] }), { phase: "telechargement", fraction: 0.5 });
    expect(a.variante).toBe("telechargement");
  });
});

describe("quand ça a échoué", () => {
  it("le signale et laisse reprendre", () => {
    const a = apparenceModeles(etat({ manquants: ["a"] }), { phase: "erreur", erreur: "HTTP 404" });
    expect(a.variante).toBe("erreur");
    expect(a.badge).toBe("!");
    expect(a.vars).toEqual(["HTTP 404"]);
    expect(a.actionnable).toBe(true);
    expect(a.interrompt).toBe(false);
  });
});

describe("tant que l'inventaire n'est pas revenu", () => {
  it("n'est pas cliquable : un bouton prêt qui ne fait rien est pire qu'un bouton en attente", () => {
    const a = apparenceModeles(null, null);
    expect(a.variante).toBe("inconnu");
    expect(a.actionnable).toBe(false);
    expect(a.badge).toBeNull();
  });

  it("une fin ou une annulation rend la main à l'inventaire", () => {
    expect(apparenceModeles(etat(), { phase: "fini" }).variante).toBe("complet");
    expect(apparenceModeles(etat({ manquants: ["a"], octetsAPrendre: 1 }), { phase: "annule" }).variante).toBe("manquants");
  });
});

// CE QUE LE PANNEAU PROPOSE. Un clic n'engage plus tout l'inventaire : deux modèles pèsent à eux
// seuls 1,3 Go, et l'on choisit. La liste est donc celle des modèles qu'on peut vraiment prendre,
// du plus lourd au plus léger, dans la langue de l'interface.
describe("aPrendre", () => {
  const etat = (modeles: unknown[]): EtatModeles => ({
    complets: 0, total: modeles.length, octetsAPrendre: 0, manquants: [], sansAdresse: [],
    modeles: modeles as EtatModeles["modeles"],
  });
  const m = (id: string, octets: number, o: Record<string, unknown> = {}) =>
    ({ id, nom: id, octets, complet: false, partiel: false, telechargeable: true, ...o });

  it("les plus lourds d'abord : c'est le poids qui décide si on le prend maintenant", () => {
    const l = aPrendre(etat([m("a", 100), m("gros", 700_000_000), m("moyen", 28_000_000)]));
    expect(l.map((x) => x.id)).toEqual(["gros", "moyen", "a"]);
  });

  it("écarte ce qui est déjà là et ce qu'on ne peut pas aller chercher", () => {
    const l = aPrendre(etat([m("present", 10, { complet: true }), m("muet", 10, { telechargeable: false }), m("a", 10)]));
    expect(l.map((x) => x.id)).toEqual(["a"]);
  });

  it("garde un modèle à moitié présent : il se reprend en entier", () => {
    const l = aPrendre(etat([m("moitie", 500, { partiel: true })]));
    expect(l[0]).toMatchObject({ id: "moitie", partiel: true, octets: 500 });
  });

  it("prend le nom anglais quand l'interface est en anglais", () => {
    const l = aPrendre(etat([m("a", 10, { nom: "Séparation", nomEn: "Separation" })]), true);
    expect(l[0].nom).toBe("Separation");
    expect(aPrendre(etat([m("a", 10, { nom: "Séparation", nomEn: "Separation" })]))[0].nom).toBe("Séparation");
  });

  it("sans inventaire, rien à proposer plutôt qu'une liste vide trompeuse", () => {
    expect(aPrendre(null)).toEqual([]);
    expect(sansAdresse(null)).toEqual([]);
  });

  it("sansAdresse ne retient que ce qui manque ET n'a pas de source", () => {
    const l = sansAdresse(etat([m("muet", 10, { telechargeable: false }), m("a", 10), m("la", 10, { complet: true, telechargeable: false })]));
    expect(l.map((x) => x.id)).toEqual(["muet"]);
  });
});

// TOUT L'INVENTAIRE, ET PAS SEULEMENT CE QUI MANQUE. Ce que `aPrendre` écarte — les présents —
// n'apparaissait nulle part dans l'application : sur une installation complète le panneau ne
// contenait qu'une phrase, et « ce modèle est-il là ? » n'avait pas de réponse à l'écran.
describe("inventaireAffiche", () => {
  const etat = (modeles: unknown[]): EtatModeles => ({
    complets: 0, total: modeles.length, octetsAPrendre: 0, manquants: [], sansAdresse: [],
    modeles: modeles as EtatModeles["modeles"],
  });
  const m = (id: string, octets: number, o: Record<string, unknown> = {}) =>
    ({ id, nom: id, octets, complet: false, partiel: false, telechargeable: true, ...o });

  it("NE PERD AUCUN MODÈLE : autant de lignes que l'inventaire en compte", () => {
    const l = inventaireAffiche(etat([
      m("absent", 10), m("la", 20, { complet: true }), m("muet", 30, { telechargeable: false }),
    ]));
    expect(l).toHaveLength(3);
    expect(l.map((x) => x.id).sort()).toEqual(["absent", "la", "muet"]);
  });

  it("étiquette chaque ligne de son état, qui décide de sa marque et de son clic", () => {
    const l = inventaireAffiche(etat([
      m("absent", 10), m("la", 20, { complet: true }), m("muet", 30, { telechargeable: false }),
      // Un modèle présent SANS adresse reste présent : il n'y a rien à y aller chercher.
      m("la-sans-url", 40, { complet: true, telechargeable: false }),
    ]));
    expect(Object.fromEntries(l.map((x) => [x.id, x.ligne]))).toEqual({
      absent: "a-prendre", la: "present", muet: "muet", "la-sans-url": "present",
    });
  });

  it("met d'abord ce qu'il y a à prendre, du plus lourd au plus léger", () => {
    const l = inventaireAffiche(etat([
      m("zeta", 5, { complet: true }), m("petit", 10), m("gros", 700_000_000),
      m("muet", 50, { telechargeable: false }), m("alpha", 5, { complet: true }),
    ]));
    // À prendre par poids, puis le sans-adresse, puis les présents par ordre alphabétique :
    // c'est dans la liste des présents qu'on cherche un nom, et non un poids.
    expect(l.map((x) => x.id)).toEqual(["gros", "petit", "muet", "alpha", "zeta"]);
  });

  it("prend le nom anglais quand l'interface est en anglais, présents compris", () => {
    const l = inventaireAffiche(etat([m("a", 10, { complet: true, nom: "Séparation", nomEn: "Separation" })]), true);
    expect(l[0].nom).toBe("Separation");
  });

  it("sans inventaire, aucune ligne plutôt qu'une liste inventée", () => {
    expect(inventaireAffiche(null)).toEqual([]);
  });
});
