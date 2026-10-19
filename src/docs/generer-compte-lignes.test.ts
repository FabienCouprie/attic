// src/docs/generer-compte-lignes.test.ts — Le décompte se tient sans copie versionnée.
//
// POURQUOI CE TEST. `LINE-COUNT.md` était le seul des cinq inventaires que rien ne tenait : aucun
// script ne le régénérait, aucun test ne le relisait. Il annonçait des fichiers disparus et
// ignorait les nouveaux. Un fichier engendré que rien ne régénère vaut moins qu'un fichier absent,
// parce qu'on le croit.
//
// ET LA COPIE VERSIONNÉE EST SORTIE DU DÉPÔT, ce qui renverse une décision antérieure sans toucher
// à ce qu'elle protégeait. La raison est mesurée : toute branche qui ajoute ou retire un fichier
// touche cette table, si bien que deux branches vivantes en même temps entrent en conflit dessus à
// coup sûr — trois fois dans la même journée, chacune résolue en la régénérant, jamais à la main.
// Un conflit dont la résolution est toujours « relancer le générateur » n'apprend rien à personne.
//
// CE QUI EST TENU N'A PAS CHANGÉ POUR AUTANT, et c'est le point : les cas ci-dessous comptent
// `src/` À CHAQUE PASSE, sans rien lire sur le disque. Le tri du plus lourd au plus léger, les deux
// totaux, le nombre de fichiers hors norme et leur marque, la règle de comptage elle-même — tout
// cela s'éprouve sur les sources, non sur une copie. Seule la copie sort. `npm run docs:lignes`
// l'engendre quand on veut la lire, et un cas refuse qu'elle revienne sous git.
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

describe("la table engendrée à la demande", () => {
  it("S'ÉCRIT QUAND ON LA DEMANDE, et n'est pas versionnée le reste du temps", () => {
    const texte = tableEnTexte(compterLignes(RACINE));
    if (ecrire) {
      writeFileSync(CHEMIN, texte, "utf8");
      return;
    }
    // LA RÈGLE A CHANGÉ DE SENS, ET CE CAS EST CE QUI L'EMPÊCHE DE REVENIR. Tant que la table était
    // versionnée, toute branche qui ajoutait ou retirait un fichier la touchait : deux branches
    // vivantes en même temps entraient en conflit dessus à coup sûr. Ce qu'elle mesure est tenu par
    // les cas ci-dessus, qui comptent `src/` à chaque passe sans rien lire sur le disque ; seule la
    // copie écrite sort du dépôt. Remettre `LINE-COUNT.md` sous git ramènerait les conflits, d'où
    // ce cas : l'exclusion doit rester écrite, avec sa raison.
    const exclusions = readFileSync(resolve(RACINE, ".gitignore"), "utf8");
    expect(exclusions.split(/\r?\n/).includes("LINE-COUNT.md"),
      "LINE-COUNT.md doit rester hors du dépôt : son exclusion a disparu de .gitignore").toBe(true);
  });

  it("rend un texte lisible sans rien lire sur le disque", () => {
    const texte = tableEnTexte(compterLignes(RACINE));
    expect(texte.startsWith("# File Line Count")).toBe(true);
    expect(texte.split("\n").length).toBeGreaterThan(20);
  });
});

/**
 * Les fichiers qui dépassaient la norme le jour où elle est devenue contraignante, avec leur poids
 * en code ce jour-là.
 *
 * POURQUOI UNE DETTE PLUTÔT QU'UN REFUS SEC. Quinze fichiers dépassaient déjà les quatre cents
 * lignes, dont trois au-delà de sept cents : exiger la norme d'un coup aurait fait échouer la suite
 * sur du code écrit avant qu'elle ne contraigne, et la seule issue aurait été de la désactiver. Une
 * dette nommée dit la vérité et contraint quand même.
 *
 * ELLE NE PEUT QUE DÉCROÎTRE, par trois règles qui ne regardent pas la même chose : un fichier
 * absent de cette liste ne dépasse pas la norme, un fichier qui y est ne grossit plus, et celui qui
 * redescend dans la norme en sort. La troisième est ce qui empêche la liste de pourrir : sans elle,
 * un fichier assaini y resterait inscrit et la dette paraîtrait éternelle.
 *
 * LES CHIFFRES SONT CEUX DU CODE, non du poids : la norme se mesure hors documentation et
 * traductions, et `compte-lignes.ts` dit pourquoi. Un fichier très commenté n'est pas en dette pour
 * ses commentaires.
 */
const DETTE = new Map<string, number>([
  ["src/ui/atelier.css", 1412],
  ["src/ui/App.tsx", 1220],
  ["src/ui/hooks/useExecutionGraphe.ts", 754],
  ["src/ui/Inspector.tsx", 632],
  ["src/audio/abc.ts", 589],
  ["src/docs/documentation-graphe.ts", 572],
  ["src/ui/AtelierNode.tsx", 565],
  ["src/audio/cercle-pulsant.test.ts", 522],
  ["src/plugins/index.ts", 515],
  ["src/audio/sfz.test.ts", 497],
  ["src/core/boucle-graphe.test.ts", 465],
  ["src/vues-domaine/SelecteurMultiZones.tsx", 459],
  ["src/ui/BarreOutils.tsx", 441],
  ["src/audio/clavier-banque.test.ts", 439],
  ["src/vues-domaine/FormeOnde.tsx", 408],
]);

describe("la norme est contraignante", () => {
  const comptes = compterLignes(RACINE);
  const parFichier = new Map(comptes.map((c) => [c.fichier, c.code]));

  it("AUCUN FICHIER NEUF NE DÉPASSE LA NORME", () => {
    const fautifs = comptes
      .filter((c) => !DETTE.has(c.fichier) && c.code > NORME_MAX)
      .map((c) => `${c.fichier} — ${c.code} lignes de code`);
    expect(fautifs, [
      `Ces fichiers dépassent la norme de ${NORME_MAX} lignes de code et ne sont pas dans la dette.`,
      "Découpez-les. Les y inscrire est un aveu, pas une solution : la dette ne s'allonge pas.",
    ].join("\n")).toEqual([]);
  });

  it("UN FICHIER EN DETTE NE GROSSIT PLUS", () => {
    const grossis: string[] = [];
    for (const [fichier, plafond] of DETTE) {
      const code = parFichier.get(fichier);
      if (code !== undefined && code > plafond) {
        grossis.push(`${fichier} — ${code} lignes de code, contre ${plafond} inscrites`);
      }
    }
    expect(grossis, [
      "Ces fichiers dépassaient déjà la norme et viennent de grossir encore.",
      "Relever leur plafond serait renoncer : ce qu'on ajoute à un fichier trop gros va ailleurs.",
    ].join("\n")).toEqual([]);
  });

  it("LA DETTE NE GARDE PAS CE QUI EST RENTRÉ DANS LA NORME", () => {
    const aRetirer: string[] = [];
    for (const fichier of DETTE.keys()) {
      const code = parFichier.get(fichier);
      if (code === undefined) aRetirer.push(`${fichier} — disparu`);
      else if (code <= NORME_MAX) aRetirer.push(`${fichier} — ${code} lignes, rentré dans la norme`);
    }
    expect(aRetirer, [
      "Ces fichiers n'ont plus à figurer dans la dette : retirez-les de la liste.",
      "C'est ce qui empêche la dette de paraître éternelle une fois qu'elle a été payée.",
    ].join("\n")).toEqual([]);
  });

  it("dit où en est la dette, pour qu'on la voie décroître", () => {
    const lignes = [...DETTE.values()].reduce((s, n) => s + n, 0);
    const exces = [...DETTE.values()].reduce((s, n) => s + (n - NORME_MAX), 0);
    console.log(`dette : ${DETTE.size} fichiers, ${lignes} lignes de code, ${exces} au-dessus de la norme`);
    // LE NOMBRE DE FICHIERS EN DETTE NE REMONTE PAS. Ce cas tombe si l'on en ajoute un, même
    // discrètement : la liste est le seul endroit où la dette peut croître, et elle est gardée.
    expect(DETTE.size).toBeLessThanOrEqual(15);
  });
});
