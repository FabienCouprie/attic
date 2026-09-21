// electron/telechargement-modeles.test.ts — L'inventaire des modèles, et son avancement.
//
// Ce qui se joue ici est ce que l'utilisateur lira sur une icône : combien de modèles sont là,
// combien de mégaoctets restent à prendre, et où en est le téléchargement. Une erreur de compte y
// est invisible au développement — sur un poste qui a tous les modèles, tout est « complet » quoi
// qu'on écrive — et se découvre sur une machine vierge, c'est-à-dire chez quelqu'un d'autre.
//
// Les sondes `existe` et `taille` sont injectées : l'inventaire se vérifie sans disque, sur des
// cas qui seraient pénibles à fabriquer pour de vrai — le fichier tronqué, le modèle à moitié là,
// celui qui n'a pas encore d'adresse.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { inventaire, avancement, fichierPresent } =
  require_("./telechargement-modeles.cjs");

const MANIFESTE = {
  version: 1,
  modeles: [
    {
      id: "gtcrn", nom: "Débruitage IA", nomEn: "AI denoise", noeuds: ["debruitage-ia"],
      octets: 300, source: { type: "fichier", url: "https://exemple/gtcrn.onnx" },
      fichiers: [{ chemin: "oonx/gtcrn.onnx", octets: 300, sha256: "a" }],
    },
    {
      id: "sdxs-512", nom: "Texte → image", nomEn: "Text → image", noeuds: ["texte-image"],
      octets: 900, source: { type: "archive", url: "https://exemple/sdxs.zip" },
      fichiers: [
        { chemin: "oonx/sdxs/unet.onnx", octets: 600, sha256: "b" },
        { chemin: "oonx/sdxs/vae.onnx", octets: 300, sha256: "c" },
      ],
    },
    {
      id: "genre", nom: "Genre", nomEn: "Genre", noeuds: ["genre-musical"],
      octets: 100, source: { type: "fichier", url: null },
      fichiers: [{ chemin: "oonx/genre.onnx", octets: 100, sha256: "d" }],
    },
  ],
};

/** Des sondes à partir d'une table « chemin → taille ». Absent de la table = absent du disque. */
const disque = (table: Record<string, number>) => ({
  existe: (c: string) => c in table,
  taille: (c: string) => table[c],
});

const TOUT = { "oonx/gtcrn.onnx": 300, "oonx/sdxs/unet.onnx": 600, "oonx/sdxs/vae.onnx": 300, "oonx/genre.onnx": 100 };

describe("ce qui compte comme présent", () => {
  it("le fichier existe ET fait la taille annoncée", () => {
    const f = { chemin: "oonx/x.onnx", octets: 300, sha256: "a" };
    expect(fichierPresent(f, disque({ "oonx/x.onnx": 300 }))).toBe(true);
  });

  it("un fichier TRONQUÉ ne compte pas — c'est le cas d'une connexion coupée", () => {
    const f = { chemin: "oonx/x.onnx", octets: 300, sha256: "a" };
    expect(fichierPresent(f, disque({ "oonx/x.onnx": 299 }))).toBe(false);
    expect(fichierPresent(f, disque({ "oonx/x.onnx": 0 }))).toBe(false);
  });

  it("un fichier absent ne compte pas", () => {
    expect(fichierPresent({ chemin: "oonx/x.onnx", octets: 300 }, disque({}))).toBe(false);
  });
});

describe("l'inventaire", () => {
  it("sur un disque vide, tout est à prendre — sauf ce qui n'a pas d'adresse", () => {
    const inv = inventaire(MANIFESTE, disque({}));
    expect(inv.complets).toBe(0);
    expect(inv.total).toBe(3);
    expect(inv.manquants).toEqual(["gtcrn", "sdxs-512"]);
    expect(inv.octetsAPrendre).toBe(1200);
    // Le modèle sans adresse est compté à part : promettre son téléchargement serait mentir.
    expect(inv.sansAdresse).toEqual(["genre"]);
  });

  it("sur un disque complet, il n'y a rien à prendre", () => {
    const inv = inventaire(MANIFESTE, disque(TOUT));
    expect(inv.complets).toBe(3);
    expect(inv.manquants).toEqual([]);
    expect(inv.octetsAPrendre).toBe(0);
    expect(inv.sansAdresse).toEqual([]);
  });

  it("un modèle À MOITIÉ là se reprend EN ENTIER, et le dit", () => {
    // La moitié reçue ne sert à rien tant que l'autre manque, et l'archive ne se reprend pas
    // par morceaux : annoncer 300 octets restants quand on va en télécharger 900 serait faux.
    const inv = inventaire(MANIFESTE, disque({ "oonx/sdxs/unet.onnx": 600 }));
    const sdxs = inv.modeles.find((m: any) => m.id === "sdxs-512");
    expect(sdxs.complet).toBe(false);
    expect(sdxs.partiel).toBe(true);
    expect(inv.octetsAPrendre).toBe(300 + 900);
  });

  it("distingue un modèle à moitié là d'un modèle absent", () => {
    const inv = inventaire(MANIFESTE, disque({}));
    expect(inv.modeles.find((m: any) => m.id === "sdxs-512").partiel).toBe(false);
  });

  it("ne compte pas comme présent un fichier de la bonne taille sous un autre nom", () => {
    const inv = inventaire(MANIFESTE, disque({ "oonx/autre.onnx": 300 }));
    expect(inv.complets).toBe(0);
  });

  it("porte de quoi nommer les nœuds concernés : c'est ce qui rend l'attente compréhensible", () => {
    const inv = inventaire(MANIFESTE, disque({}));
    expect(inv.modeles[0].noeuds).toEqual(["debruitage-ia"]);
    expect(inv.modeles[0].nomEn).toBe("AI denoise");
  });

  it("supporte un manifeste vide ou absent sans se plaindre", () => {
    expect(inventaire({ modeles: [] }, disque({})).total).toBe(0);
    expect(inventaire(undefined, disque({})).octetsAPrendre).toBe(0);
  });
});

describe("l'avancement d'une file", () => {
  const file = [{ id: "a", octets: 100 }, { id: "b", octets: 300 }];

  it("compte le poids, et non le nombre de modèles", () => {
    // Un modèle sur deux ne fait pas la moitié du chemin quand le second est trois fois plus gros.
    const a = avancement({ faits: [file[0]], courant: file[1], octetsRecus: 0, file });
    expect(a.fraction).toBeCloseTo(0.25, 10);
    expect(a.fait).toBe(1);
    expect(a.nombre).toBe(2);
  });

  it("intègre ce qui est reçu du modèle en cours", () => {
    const a = avancement({ faits: [file[0]], courant: file[1], octetsRecus: 150, file });
    expect(a.fraction).toBeCloseTo(0.625, 10);
    expect(a.octets).toBe(250);
  });

  it("ne dépasse jamais un, même si la source annonce plus que prévu", () => {
    const a = avancement({ faits: file, courant: null, octetsRecus: 999, file });
    expect(a.fraction).toBe(1);
    const b = avancement({ faits: [], courant: file[0], octetsRecus: 10_000, file });
    expect(b.fraction).toBeLessThanOrEqual(1);
  });

  it("vaut un sur une file vide : il n'y a rien à attendre", () => {
    expect(avancement({ file: [] }).fraction).toBe(1);
  });

  it("part de zéro", () => {
    expect(avancement({ faits: [], courant: file[0], octetsRecus: 0, file }).fraction).toBe(0);
  });
});
