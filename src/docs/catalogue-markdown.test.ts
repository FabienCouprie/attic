// docs/catalogue-markdown.test.ts — Le catalogue COMPONENTS.md : ancres, échappement,
// valeurs par défaut, et le document entier généré sur le vrai registre.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { genererCatalogueMarkdown, creerSlugger, cellule, defautChoix } from "./catalogue-markdown";
import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";

/**
 * Chaque lien interne mène-t-il au titre de son texte ET du niveau attendu ?
 * Depuis le sommaire : une catégorie (##) puis des familles (###) ; ailleurs,
 * depuis l'index d'une famille : des fiches (####). Rend les écarts et le nombre de liens.
 */
function verifierLiens(md: string): { ecarts: string[]; liens: number } {
  const slug = creerSlugger();
  const lignes = md.split("\n");
  const titres = lignes.filter((l) => /^#{1,6} /.test(l)).map((l) => ({ niveau: l.match(/^#+/)![0].length, texte: l.replace(/^#{1,6} /, "") }))
    .map((t) => ({ ...t, ancre: slug(t.texte) }));
  const ecarts: string[] = [];
  let dansSommaire = false, liens = 0;
  for (const l of lignes) {
    if (l.startsWith("## ")) dansSommaire = l === "## Contents";
    [...l.matchAll(/\[([^\]]+)\]\(#([^)]+)\)/g)].forEach(([, texte, ancre], i) => {
      liens++;
      const attendu = dansSommaire ? (i === 0 ? 2 : 3) : 4;
      const cible = titres.find((t) => t.ancre === ancre);
      // Le texte d'un lien est échappé comme une cellule ; le titre ne l'est pas.
      const texteLien = texte.replace(/\\\|/g, "|").replace(/&lt;/g, "<").replace(/\\\\/g, "\\");
      if (!cible) ecarts.push(`${texte} → #${ancre} : aucun titre`);
      else if (cible.texte !== texteLien || cible.niveau !== attendu) ecarts.push(`${texte} → #${ancre} : titre « ${cible.texte} » de niveau ${cible.niveau}, attendu ${attendu}`);
    });
  }
  return { ecarts, liens };
}

describe("briques", () => {
  it("calcule les ancres comme GitHub, avec un suffixe pour les titres répétés", () => {
    const slug = creerSlugger();
    expect(slug("ABC → MIDI")).toBe("abc--midi");
    expect(slug("Audio")).toBe("audio");
    expect(slug("Audio")).toBe("audio-1");
    expect(slug("Text to Speech")).toBe("text-to-speech");
    expect(slug("Bouteille de Klein (test)")).toBe("bouteille-de-klein-test");
  });

  it("échappe une cellule de tableau : barre oblique inverse d'abord, puis barre verticale", () => {
    expect(cellule("a | b")).toBe("a \\| b");
    expect(cellule("a \\| b")).toBe("a \\\\\\| b");
    expect(cellule("<script>")).toBe("&lt;script>");
    expect(cellule("ligne 1\nligne 2")).toBe("ligne 1 ligne 2");
  });

  it("rend la valeur par défaut d'un choix en anglais, qu'elle soit stockée par id, en français ou en anglais", () => {
    const p = { nom: "Synthèse", options: ["Automatique", "FM"], optionsEn: ["Auto", "FM"], optionIds: ["auto", "fm"] } as any;
    expect(defautChoix({ ...p, defaut: "Automatique" })).toBe("Auto");
    expect(defautChoix({ ...p, defaut: "auto" })).toBe("Auto");
    expect(defautChoix({ ...p, defaut: "FM" })).toBe("FM");
  });
});

describe("ancres en cas de collision de noms", () => {
  // Le vrai catalogue n'a aujourd'hui aucune fiche qui porte le nom d'une
  // famille : l'ordre de calcul des ancres n'y change rien, et une erreur d'ordre
  // passerait inaperçue. Ce catalogue fictif provoque les collisions.
  const fiche = (id: string, nom: string, univers: string, famille: string) =>
    ({ id, nom, nomEn: nom, univers, famille, resume: "r", resumeEn: "r", entrees: [], sorties: [], parametres: [] }) as any;
  const md = genererCatalogueMarkdown([
    fiche("a", "Audio", "Traitement", "Audio"),
    fiche("b", "Audio input", "Entrées", "Audio"),
    fiche("c", "Effects", "Traitement", "Effets"),
    fiche("d", "Inputs", "Autres", "Texte"),
  ]);

  it("fait pointer chaque lien vers un titre du bon texte ET du bon niveau, homonymes compris", () => {
    // Le texte seul ne suffit pas : trois titres s'appellent « Audio » (famille
    // d'Inputs, famille de Processing, fiche). Le NIVEAU départage — depuis le
    // sommaire, une catégorie (##) puis des familles (###) ; depuis l'index d'une
    // famille, des fiches (####). Une première version ne vérifiait que le texte,
    // et laissait passer un lien de famille pointé sur la fiche homonyme.
    const { ecarts, liens } = verifierLiens(md);
    expect(ecarts).toEqual([]);
    expect(liens).toBe(3 + 4 + 4); // 3 catégories + 4 familles au sommaire, 4 fiches aux index
  });
});

describe("le document généré sur le registre", () => {
  const md = genererCatalogueMarkdown(toutesLesFiches as any);

  it("annonce le nombre réel de composants et de catégories", () => {
    expect(md).toContain(`Attic ships **${toutesLesFiches.length} components** in **7 categories**`);
  });

  it("contient chaque composant exactement une fois, par son identifiant", () => {
    for (const f of toutesLesFiches) {
      const occurrences = md.split(`\n\`${f.id}\` · `).length - 1;
      expect(occurrences, f.id).toBe(1);
    }
  });

  it("fait mener chaque lien du sommaire et des index au titre de son texte et de son niveau", () => {
    const { ecarts, liens } = verifierLiens(md);
    expect(liens).toBeGreaterThan(toutesLesFiches.length);
    expect(ecarts).toEqual([]);
  });

  it("n'écrit aucun titre de catégorie ou de famille en français", () => {
    const titres = md.split("\n").filter((l) => /^#{2,3} /.test(l));
    for (const fr of ["Entrées", "Traitement", "Sorties", "Autres", "Génération", "Effets", "Montage", "Écoute", "Analyse"]) {
      expect(titres, fr).not.toContain(`## ${fr}`);
      expect(titres, fr).not.toContain(`### ${fr}`);
    }
  });

  it("n'expose pas les paramètres cachés", () => {
    // Le chemin de fichier de « Audio input » est réglé par l'inspecteur.
    const section = md.slice(md.indexOf("#### Audio input"), md.indexOf("#### ", md.indexOf("#### Audio input") + 5));
    expect(section).toContain("*No parameters.*");
  });

  it("donne les tableaux avec autant de cellules que de colonnes", () => {
    // Une barre verticale non échappée dans une description décalerait les colonnes.
    let colonnes = 0;
    for (const l of md.split("\n")) {
      if (!l.startsWith("|")) { colonnes = 0; continue; }
      const n = l.replace(/\\\|/g, "").split("|").length - 2;
      if (colonnes === 0) colonnes = n;
      else expect(n, l.slice(0, 80)).toBe(colonnes);
    }
  });

  it("est déterministe : deux générations donnent le même texte", () => {
    expect(genererCatalogueMarkdown(toutesLesFiches as any)).toBe(md);
  });
});
