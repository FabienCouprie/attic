// plugins/algebre-musicale.test.ts
import { describe, it, expect } from "vitest";
import { genererSvgClassification, genererSvgMoyennesGroupes, avecTimeout } from "./algebre-musicale";
import type { ResultatClassificationPistes, RapportMoyennesGroupes } from "../audio/classification-pistes";

function resultatFactice(): ResultatClassificationPistes {
  return {
    k: 2,
    rapport: [
      { nom: "a.wav", chemin: "/a.wav", groupe: 0, probabilites: [0.9, 0.1] },
      { nom: "b.wav", chemin: "/b.wav", groupe: 0, probabilites: [0.8, 0.2] },
      { nom: "c.wav", chemin: "/c.wav", groupe: 1, probabilites: [0.1, 0.9] },
    ],
    coordonnees: [
      { nom: "a.wav", chemin: "/a.wav", x: -1, y: 0 },
      { nom: "b.wav", chemin: "/b.wav", x: -1.2, y: 0.3 },
      { nom: "c.wav", chemin: "/c.wav", x: 5, y: 5 },
    ],
    varianceExpliquee: [0.62, 0.21],
    etiquettesFeatures: ["Tempo (BPM)"],
  };
}

describe("genererSvgClassification", () => {
  it("produit un SVG valide contenant un point par piste", () => {
    const svg = genererSvgClassification(resultatFactice());
    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect((svg.match(/<title>/g) ?? []).length).toBe(3);
  });

  it("affiche le nom de chaque piste au survol (élément <title>)", () => {
    const svg = genererSvgClassification(resultatFactice());
    expect(svg).toContain("a.wav — groupe 1");
    expect(svg).toContain("c.wav — groupe 2");
  });

  it("échappe les caractères spéciaux dans les noms de piste", () => {
    const resultat = resultatFactice();
    resultat.rapport[0].nom = "<script>alert(1)</script>.wav";
    resultat.coordonnees[0].nom = "<script>alert(1)</script>.wav";
    const svg = genererSvgClassification(resultat);
    expect(svg).not.toContain("<script>alert(1)</script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("affiche une légende avec un groupe par entrée", () => {
    const svg = genererSvgClassification(resultatFactice());
    expect(svg).toContain("Groupe 1 (2)");
    expect(svg).toContain("Groupe 2 (1)");
  });

  it("ne plante pas quand tous les points partagent la même coordonnée", () => {
    const resultat = resultatFactice();
    for (const p of resultat.coordonnees) { p.x = 3; p.y = 3; }
    const svg = genererSvgClassification(resultat);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("affiche le pourcentage de variance expliquée des 2 premiers axes", () => {
    const svg = genererSvgClassification(resultatFactice());
    expect(svg).toContain("62% variance");
    expect(svg).toContain("21% variance");
  });
});

function rapportMoyennesFactice(): RapportMoyennesGroupes {
  // Colonne "Tempo" nettement différente entre les 2 groupes (forte variance
  // inter-groupes) ; colonne "Chroma C" quasi identique (variance ~nulle) —
  // sert à vérifier que seule la 1re colonne ressort visuellement.
  return {
    etiquettes: ["Tempo (BPM)", "Chroma C"],
    groupes: [
      { groupe: 0, n: 2, moyennes: [80, 0.5] },
      { groupe: 1, n: 3, moyennes: [160, 0.51] },
    ],
    ecartTypeInterGroupes: [40, 0.005],
  };
}

function celluleFills(svg: string): string[] {
  // Seules les cellules du tableau (fond en rgb(...)) — exclut le rect de fond blanc.
  return [...svg.matchAll(/<rect[^>]*fill="(rgb\([^)]+\))"/g)].map((m) => m[1]);
}

function versBlanc(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return 255 * 3 - (r + g + b); // 0 = blanc pur, plus grand = plus saturé
}

describe("genererSvgMoyennesGroupes", () => {
  it("produit un SVG valide avec une cellule par (variable × groupe)", () => {
    const svg = genererSvgMoyennesGroupes(rapportMoyennesFactice());
    expect(svg.trim().startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(celluleFills(svg).length).toBe(2 * 2); // 2 variables (lignes) × 2 groupes (colonnes)
  });

  it("affiche l'étiquette de chaque variable et de chaque groupe", () => {
    const svg = genererSvgMoyennesGroupes(rapportMoyennesFactice());
    expect(svg).toContain("Tempo (BPM)");
    expect(svg).toContain("Chroma C");
    expect(svg).toContain("Groupe 1 (2)");
    expect(svg).toContain("Groupe 2 (3)");
  });

  it("affiche la valeur moyenne formatée dans chaque cellule", () => {
    const svg = genererSvgMoyennesGroupes(rapportMoyennesFactice());
    expect(svg).toContain(">80.0<");
    expect(svg).toContain(">160<");
    expect(svg).toContain(">0.500<");
  });

  it("pour une variable donnée, colore plus fortement le groupe qui s'écarte de la moyenne que les groupes proches de cette moyenne", () => {
    // Avec seulement 2 groupes, l'écart-type inter-groupes vaut toujours la
    // moitié de leur différence : les 2 z-scores sont donc TOUJOURS ±1, quelle
    // que soit la variable — ce cas ne permet pas de tester la comparaison
    // intra-ligne. Il faut au moins 3 groupes pour qu'un groupe proche de la
    // moyenne (z faible) se distingue d'un groupe nettement à l'écart (z fort)
    // à l'intérieur de la MÊME ligne.
    const valeurs = [80, 82, 200]; // groupe 2 nettement à l'écart des 2 autres
    const moyenne = valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
    const ecartType = Math.sqrt(valeurs.reduce((s, v) => s + (v - moyenne) ** 2, 0) / valeurs.length);
    const rapport: RapportMoyennesGroupes = {
      etiquettes: ["Tempo (BPM)"],
      groupes: valeurs.map((v, i) => ({ groupe: i, n: 1, moyennes: [v] })),
      ecartTypeInterGroupes: [ecartType],
    };
    const svg = genererSvgMoyennesGroupes(rapport);
    const [g0, g1, g2] = celluleFills(svg);
    expect(versBlanc(g2)).toBeGreaterThan(versBlanc(g0));
    expect(versBlanc(g2)).toBeGreaterThan(versBlanc(g1));
  });

  it("ne plante pas quand une variable a un écart-type inter-groupes nul", () => {
    const rapport = rapportMoyennesFactice();
    rapport.groupes = [
      { groupe: 0, n: 1, moyennes: [120, 0.5] },
      { groupe: 1, n: 1, moyennes: [120, 0.5] },
    ];
    rapport.ecartTypeInterGroupes = [0, 0];
    const svg = genererSvgMoyennesGroupes(rapport);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});

describe("avecTimeout", () => {
  // Le décodage d'un fichier corrompu ou dans un format non supporté peut,
  // selon les cas, rester en attente indéfiniment (pas juste rejeter) — sur
  // une collection de plusieurs centaines de pistes, un seul fichier ainsi
  // bloqué gèle tout le lot sans qu'il soit possible de distinguer ça d'un
  // vrai plantage. Ces tests vérifient le mécanisme de secours en isolation
  // (délais courts, pas les 20 s réelles de production) plutôt qu'en
  // attendant un vrai timeout de bout en bout.
  it("se résout normalement quand la promesse aboutit avant le délai", async () => {
    const p = new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 10));
    await expect(avecTimeout(p, 5000)).resolves.toBe("ok");
  });

  it("rejette au bout du délai quand la promesse ne se règle jamais", async () => {
    const jamaisReglee = new Promise<string>(() => {});
    await expect(avecTimeout(jamaisReglee, 20)).rejects.toThrow();
  });

  it("propage un rejet qui survient avant le délai", async () => {
    const p = Promise.reject(new Error("échec réel"));
    await expect(avecTimeout(p, 5000)).rejects.toThrow("échec réel");
  });
});
