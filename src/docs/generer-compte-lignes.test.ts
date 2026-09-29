// src/docs/generer-compte-lignes.test.ts — Le décompte versionné ne vieillit plus en silence.
//
// POURQUOI CE TEST. `LINE-COUNT.md` était le seul des cinq inventaires que rien ne tenait : aucun
// script ne le régénérait, aucun test ne le relisait. Il annonçait des fichiers disparus et
// ignorait les nouveaux. Un fichier engendré que rien ne régénère vaut moins qu'un fichier absent,
// parce qu'on le croit.
//
// DEUX GARDES, comme pour les autres tables. La première refuse un fichier périmé. La seconde
// éprouve le comptage lui-même, sur des cas construits : un fichier sans saut de ligne final compte
// quand même sa dernière ligne, et le tri met le plus lourd en tête.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { NORME_MAX, SEUIL_LIGNES, compterLignes, compterUnTexte, tableEnTexte } from "./compte-lignes";

const RACINE = resolve(__dirname, "../..");
const CHEMIN = resolve(RACINE, "LINE-COUNT.md");
const ecrire = process.env.ECRIRE_LIGNES === "1";

describe("le comptage", () => {
  const comptes = compterLignes(RACINE);

  it("trouve les fichiers de `src/`, et rien d'autre", () => {
    expect(comptes.length).toBeGreaterThan(200);
    for (const c of comptes) {
      expect(c.fichier.startsWith("src/"), c.fichier).toBe(true);
      expect(/\.(ts|tsx|css)$/.test(c.fichier), c.fichier).toBe(true);
    }
  });

  it("range du plus lourd au plus léger EN CODE, puisque c'est ce que la norme mesure", () => {
    for (let i = 1; i < comptes.length; i++) {
      expect(comptes[i - 1].code).toBeGreaterThanOrEqual(comptes[i].code);
    }
  });

  it("compte un fichier connu, pour que le chiffre veuille dire quelque chose", () => {
    // `audio/note.ts` ne porte que des types : son décompte se vérifie à la main sans peine.
    const note = comptes.find((c) => c.fichier === "src/audio/note.ts");
    expect(note, "src/audio/note.ts est introuvable").toBeDefined();
    const reel = readFileSync(resolve(RACINE, "src/audio/note.ts"), "utf8").split("\n").length;
    expect(note!.lignes).toBe(reel);
    // Ce fichier est très commenté : son code pèse une fraction de son poids, et c'est le fait que
    // l'ancien décompte cachait.
    expect(note!.code).toBeLessThan(note!.lignes / 2);
  });

  it("LE CODE NE DÉPASSE JAMAIS LE POIDS, sur aucun fichier du dépôt", () => {
    for (const c of comptes) expect(c.code, c.fichier).toBeLessThanOrEqual(c.lignes);
  });

  it("n'oublie aucune ligne dans les deux totaux annoncés", () => {
    // Le tableau ne liste que les gros fichiers ; le texte doit dire ce que pèsent les autres,
    // sans quoi la somme serait fausse et l'on croirait le dépôt plus petit qu'il n'est.
    const total = comptes.reduce((s, c) => s + c.lignes, 0);
    const totalCode = comptes.reduce((s, c) => s + c.code, 0);
    const texte = tableEnTexte(comptes);
    expect(texte).toContain(`${comptes.length} files, ${total} lines, of which ${totalCode} are code`);
    const gros = comptes.filter((c) => c.code >= SEUIL_LIGNES);
    const reste = total - gros.reduce((s, c) => s + c.lignes, 0);
    expect(texte).toContain(`${comptes.length - gros.length} account for ${reste} lines`);
  });

  it("ANNONCE COMBIEN DE FICHIERS DÉPASSENT LA NORME, puisque c'est ce qu'on vient y lire", () => {
    const horsNorme = comptes.filter((c) => c.code > NORME_MAX);
    expect(tableEnTexte(comptes)).toContain(`${horsNorme.length} files exceed the ${NORME_MAX}`);
    // Et chacun est marqué dans la table, pour qu'on le trouve sans compter.
    const lignes = tableEnTexte(comptes).split("\n").filter((l) => l.endsWith("| ! |"));
    expect(lignes.length).toBe(horsNorme.length);
  });
});

describe("ce que le comptage retire, et ce qu'il garde", () => {
  // UNE RÈGLE DE COMPTAGE NE SE VÉRIFIE QUE SUR UN TEXTE CONSTRUIT. Sur le dépôt réel, on ne sait
  // pas ce qu'on attend ; ici, on le sait à la ligne près.
  const code = (t: string) => compterUnTexte(t).code;

  it("UNE LIGNE VIDE NE COMPTE PAS", () => {
    expect(code("const a = 1;\n\n\nconst b = 2;")).toBe(2);
  });

  it("UN COMMENTAIRE DE LIGNE NE COMPTE PAS, mais un commentaire EN FIN DE LIGNE laisse le code", () => {
    expect(code("// une explication\nconst a = 1;")).toBe(1);
    expect(code("const a = 1; // une explication")).toBe(1);
  });

  it("UN BLOC DE COMMENTAIRE NE COMPTE PAS, sur toutes ses lignes", () => {
    expect(code("/**\n * Trois lignes\n */\nconst a = 1;")).toBe(1);
    expect(code("/* sur une seule ligne */\nconst a = 1;")).toBe(1);
  });

  it("LA DOCUMENTATION NE COMPTE PAS, et c'est la raison d'être de ce changement", () => {
    expect(code('const f = {\nnotice: "une longue explication",\ndoc: "autre chose",\n};')).toBe(2);
    expect(code('resume: "ce que le composant fait",\nconst a = 1;')).toBe(1);
  });

  it("UNE DOCUMENTATION SUR PLUSIEURS LIGNES EST SUIVIE JUSQU'À SA FERMETURE", () => {
    const t = "notice: `première ligne\ndeuxième ligne\ntroisième`,\nconst a = 1;";
    expect(code(t)).toBe(1);
  });

  it("LES TRADUCTIONS NE COMPTENT PAS, ni les champs en « En » ni les tables", () => {
    expect(code('nomEn: "Scale",\ndocEn: "The scale.",\nconst a = 1;')).toBe(1);
    expect(code('"msg.une_cle": "Un message",\n"msg.autre": "Autre",\nconst a = 1;')).toBe(1);
    // La forme de `i18n.tsx` : une clé, puis la paire française et anglaise.
    expect(code('"msg.une_cle": { fr: "Un message", en: "A message" },\nconst a = 1;')).toBe(1);
  });

  it("ET CE QUI EST DU CODE COMPTE, même quand il ressemble à autre chose", () => {
    // Un champ dont le nom contient « doc » sans en être un, une clé qui n'est pas une traduction.
    expect(code("const documentation = 1;")).toBe(1);
    expect(code('const t = { "clé": calcul(x) };')).toBe(1);
    expect(code('const url = "https://exemple.org";')).toBe(1);
  });

  it("le poids compte tout, y compris ce que le code retire", () => {
    const t = "// un commentaire\n\nnotice: \"doc\",\nconst a = 1;";
    expect(compterUnTexte(t)).toEqual({ lignes: 4, code: 1 });
  });
});

describe("la table versionnée", () => {
  it("elle est à jour", () => {
    const texte = tableEnTexte(compterLignes(RACINE));
    if (ecrire) {
      writeFileSync(CHEMIN, texte, "utf8");
      return;
    }
    expect(existsSync(CHEMIN),
      "LINE-COUNT.md est absent : lancez « npm run docs:lignes »").toBe(true);
    expect(readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n"), [
      "LINE-COUNT.md ne correspond plus à src/.",
      "C'est normal dès qu'un fichier grossit : lancez « npm run docs:lignes » et versionnez.",
      "Ne le corrigez pas à la main.",
    ].join("\n")).toBe(texte);
  });
});
