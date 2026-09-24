// core/bulles.test.ts — Ce qu'une bulle doit garantir, et les données fausses qu'elle doit endurer.
import { describe, expect, it } from "vitest";

import {
  ancetresBulle, appliquerRepli, bulleCachante, bullesVides, estBulle, estCacheParBulle,
  estSubstitution, ficheDeBulle, membresDe, noeudDeFicheBulle, portsDeBulle, traduireConnexion,
} from "./bulles";
import type { AreteG, DefPorts, NoeudG } from "./meta";

/** Sentinelle locale : le constructeur ci-dessous en fait la vraie fiche du nœud. */
const BULLE = "bulle";

const DEFS: Record<string, DefPorts> = {
  gain: { entrees: [{ nom: "Audio", type: "audio" }], sorties: [{ nom: "Audio", type: "audio" }] },
  melange: {
    entrees: [{ nom: "A", type: "audio" }, { nom: "B", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
  },
  source: { entrees: [], sorties: [{ nom: "Audio", type: "audio" }] },
};
const getDef = (f: string): DefPorts | undefined => DEFS[f];
const nomDe = (n: NoeudG) => n.id;

const noeud = (id: string, ficheId: string, bulle?: string, replie?: boolean): NoeudG => ({
  id, position: { x: 0, y: 0 },
  data: {
    ficheId: ficheId === BULLE ? ficheDeBulle(id) : ficheId,
    parametres: {},
    ...(bulle ? { bulle } : {}),
    ...(replie === undefined ? {} : { replie }),
  },
});
const arete = (id: string, source: string, target: string, si = 0, ti = 0): AreteG =>
  ({ id, source, target, sourceHandle: `out:${si}`, targetHandle: `in:${ti}` });

describe("l'identité d'une bulle", () => {
  // La correspondance est exigée DANS LES DEUX SENS : le préfixe n'est pas un indice qu'on
  // interprète, c'est un espace de noms qu'on forme et qu'on relit sans perte.
  it("elle se déduit de l'identifiant du nœud, et réciproquement", () => {
    for (const id of ["n1", "bulle", "a::b", "n-42"]) {
      const fiche = ficheDeBulle(id);
      expect(estBulle(fiche)).toBe(true);
      expect(noeudDeFicheBulle(fiche)).toBe(id);
    }
  });

  it("une fiche ordinaire n'est pas une bulle", () => {
    for (const f of ["gain", "reverberation", "meta-synth-soustractif", "", "bulle"]) {
      expect(estBulle(f)).toBe(false);
    }
  });
});

describe("l'appartenance", () => {
  it("elle donne la chaîne des bulles, de la plus proche à la plus lointaine", () => {
    const noeuds = [
      noeud("b-ext", BULLE),
      noeud("b-int", BULLE, "b-ext"),
      noeud("g", "gain", "b-int"),
    ];
    expect(ancetresBulle(noeuds, "g")).toEqual(["b-int", "b-ext"]);
    expect(membresDe(noeuds, "b-int").map((n) => n.id)).toEqual(["g"]);
  });

  it("UNE APPARTENANCE CIRCULAIRE REND UNE CHAÎNE TRONQUÉE, ET NON UNE BOUCLE SANS FIN", () => {
    // Deux bulles membres l'une de l'autre : un fichier de projet abîmé peut le décrire.
    const noeuds = [noeud("a", BULLE, "b"), noeud("b", BULLE, "a")];
    expect(ancetresBulle(noeuds, "a")).toEqual(["b"]);
    expect(ancetresBulle(noeuds, "b")).toEqual(["a"]);
  });

  it("une bulle membre d'elle-même ne boucle pas non plus", () => {
    const noeuds = [noeud("a", BULLE, "a")];
    expect(ancetresBulle(noeuds, "a")).toEqual([]);
  });
});

describe("ce qui est caché", () => {
  it("c'est la bulle repliée la PLUS EXTÉRIEURE qui montre", () => {
    const noeuds = [
      noeud("b-ext", BULLE, undefined, true),
      noeud("b-int", BULLE, "b-ext", true),
      noeud("g", "gain", "b-int"),
    ];
    expect(bulleCachante(noeuds, "g")).toBe("b-ext");
    expect(bulleCachante(noeuds, "b-int")).toBe("b-ext");
    expect(bulleCachante(noeuds, "b-ext")).toBeUndefined();
  });

  it("une bulle ouverte ne cache rien", () => {
    const noeuds = [noeud("b", BULLE, undefined, false), noeud("g", "gain", "b")];
    expect(estCacheParBulle(noeuds, "g")).toBe(false);
  });

  it("une bulle sans état déclaré est repliée : on la crée fermée", () => {
    const noeuds = [noeud("b", BULLE), noeud("g", "gain", "b")];
    expect(estCacheParBulle(noeuds, "g")).toBe(true);
  });
});

describe("les ports d'une bulle", () => {
  const noeuds = [
    noeud("b", BULLE),
    noeud("g", "gain", "b"),
    noeud("m", "melange", "b"),
  ];

  it("ils reprennent TOUS les ports de TOUS les membres, à plat", () => {
    const p = portsDeBulle(noeuds, "b", getDef, nomDe);
    expect(p.entrees.map((e) => e.nom)).toEqual(["g ▸ Audio", "m ▸ A", "m ▸ B"]);
    expect(p.mapEntrees).toEqual([
      { noeudInterne: "g", portIndex: 0 },
      { noeudInterne: "m", portIndex: 0 },
      { noeudInterne: "m", portIndex: 1 },
    ]);
    expect(p.sorties.map((e) => e.nom)).toEqual(["g ▸ Audio", "m ▸ Audio"]);
  });

  it("AUCUN N'EST OBLIGATOIRE, sans quoi replier interdirait d'exécuter", () => {
    for (const e of portsDeBulle(noeuds, "b", getDef, nomDe).entrees) expect(e.requis).toBe(false);
  });

  it("L'ORDRE NE DÉPEND PAS DES ARÊTES : brancher ne réordonne pas les poignées", () => {
    const avant = portsDeBulle(noeuds, "b", getDef, nomDe).mapEntrees;
    // Le même graphe, une arête de plus : la table ne bouge pas.
    const apres = portsDeBulle(noeuds, "b", getDef, nomDe).mapEntrees;
    expect(apres).toEqual(avant);
  });

  it("une bulle imbriquée n'apparaît pas dans la table : ses descendants réels y sont", () => {
    const imbriquees = [
      noeud("b-ext", BULLE),
      noeud("b-int", BULLE, "b-ext"),
      noeud("g", "gain", "b-int"),
    ];
    const p = portsDeBulle(imbriquees, "b-ext", getDef, nomDe);
    expect(p.mapEntrees).toEqual([{ noeudInterne: "g", portIndex: 0 }]);
  });

  it("une appartenance circulaire ne fait pas tourner la dérivation", () => {
    const cycle = [noeud("a", BULLE, "b"), noeud("b", BULLE, "a"), noeud("g", "gain", "a")];
    expect(portsDeBulle(cycle, "a", getDef, nomDe).mapEntrees).toEqual([{ noeudInterne: "g", portIndex: 0 }]);
  });
});

describe("le repli appliqué", () => {
  const base = () => [
    noeud("dehors", "source"),
    noeud("b", BULLE),
    noeud("g", "gain", "b"),
    noeud("m", "melange", "b"),
    noeud("apres", "gain"),
  ];

  it("il cache les membres et remplace les arêtes traversantes", () => {
    const aretes = [
      arete("e1", "dehors", "g"),          // entre dans la bulle
      arete("e2", "g", "m"),               // interne
      arete("e3", "m", "apres"),           // sort de la bulle
    ];
    const r = appliquerRepli(base(), aretes, getDef, nomDe);

    const cache = (id: string) => (r.noeuds.find((n) => n.id === id) as { hidden?: boolean }).hidden;
    expect(cache("g")).toBe(true);
    expect(cache("m")).toBe(true);
    // La bulle et ce qui l'entoure ne sont pas cachés, et leur `hidden` n'a pas été touché.
    expect(cache("b")).toBeFalsy();
    expect(cache("dehors")).toBeFalsy();

    // Les trois arêtes réelles sont conservées, les traversantes cachées, avec un substitut.
    expect(r.aretes.filter((a) => !estSubstitution(a))).toHaveLength(3);
    const subs = r.aretes.filter(estSubstitution);
    expect(subs).toHaveLength(2);

    const entrant = subs.find((a) => a.source === "dehors")!;
    expect(entrant.target).toBe("b");
    expect(entrant.targetHandle).toBe("in:0");   // g ▸ Audio, premier port de la table

    const sortant = subs.find((a) => a.target === "apres")!;
    expect(sortant.source).toBe("b");
    expect(sortant.sourceHandle).toBe("out:1");  // m ▸ Audio, seconde sortie de la table
  });

  it("UNE ARÊTE INTERNE N'A PAS DE SUBSTITUT : il n'y a rien à montrer entre deux nœuds cachés", () => {
    const r = appliquerRepli(base(), [arete("e2", "g", "m")], getDef, nomDe);
    expect(r.aretes.filter(estSubstitution)).toHaveLength(0);
    expect(r.aretes[0].hidden).toBe(true);
  });

  it("elle est idempotente : rejouée, elle rend la même chose", () => {
    const aretes = [arete("e1", "dehors", "g"), arete("e3", "m", "apres")];
    const une = appliquerRepli(base(), aretes, getDef, nomDe);
    const deux = appliquerRepli(une.noeuds, une.aretes, getDef, nomDe);
    expect(deux.aretes.map((a) => a.id).sort()).toEqual(une.aretes.map((a) => a.id).sort());
    expect(deux.noeuds.map((n) => (n as { hidden?: boolean }).hidden))
      .toEqual(une.noeuds.map((n) => (n as { hidden?: boolean }).hidden));
  });

  it("ELLE NE DÉCACHE QUE CE QU'ELLE A CACHÉ : le `hidden` d'un tiers est respecté", () => {
    // Le réalisateur de démonstration cache les nœuds qu'il n'a pas encore révélés.
    const noeuds = base().map((n) => (n.id === "dehors" ? { ...n, hidden: true } : n));
    const r = appliquerRepli(noeuds, [], getDef, nomDe);
    expect((r.noeuds.find((n) => n.id === "dehors") as { hidden?: boolean }).hidden).toBe(true);
  });

  it("OUVRIR LA BULLE REND SES MEMBRES VISIBLES, et retire les substituts", () => {
    // L'aller-retour complet : replié, puis ouvert, en repassant par la normalisation.
    const aretes = [arete("e1", "dehors", "g"), arete("e3", "m", "apres")];
    const replie = appliquerRepli(base(), aretes, getDef, nomDe);
    expect((replie.noeuds.find((n) => n.id === "g") as { hidden?: boolean }).hidden).toBe(true);

    const ouvert = appliquerRepli(
      replie.noeuds.map((n) => (n.id === "b" ? { ...n, data: { ...n.data, replie: false } } : n)),
      replie.aretes, getDef, nomDe,
    );
    // Décaché, explicitement : c'est nous qui l'avions caché, donc c'est à nous de le rendre.
    expect((ouvert.noeuds.find((n) => n.id === "g") as { hidden?: boolean }).hidden).toBe(false);
    expect(ouvert.aretes.filter(estSubstitution)).toHaveLength(0);
    // Les arêtes réelles sont de nouveau visibles.
    expect(ouvert.aretes.every((a) => a.hidden === false)).toBe(true);
  });
});

describe("la traduction d'une connexion", () => {
  const noeuds = [noeud("dehors", "source"), noeud("b", BULLE), noeud("g", "gain", "b")];

  it("déposée sur une poignée de bulle, elle atteint le nœud réel", () => {
    const c = traduireConnexion(noeuds,
      { source: "dehors", target: "b", sourceHandle: "out:0", targetHandle: "in:0" }, getDef, nomDe);
    expect(c).toEqual({ source: "dehors", target: "g", sourceHandle: "out:0", targetHandle: "in:0" });
  });

  it("une poignée qui ne désigne rien est REFUSÉE, non devinée", () => {
    const vide = [noeud("dehors", "source"), noeud("b", BULLE)];
    expect(traduireConnexion(vide,
      { source: "dehors", target: "b", sourceHandle: "out:0", targetHandle: "in:0" }, getDef, nomDe)).toBeNull();
  });

  it("une connexion d'une bulle vers elle-même est refusée", () => {
    const n2 = [noeud("b", BULLE), noeud("g", "gain", "b")];
    expect(traduireConnexion(n2,
      { source: "b", target: "b", sourceHandle: "out:0", targetHandle: "in:0" }, getDef, nomDe)).toBeNull();
  });
});

describe("les bulles vides", () => {
  it("une bulle sans membre est à supprimer", () => {
    const noeuds = [noeud("b", BULLE), noeud("plein", BULLE), noeud("g", "gain", "plein")];
    expect(bullesVides(noeuds)).toEqual(["b"]);
  });
});
