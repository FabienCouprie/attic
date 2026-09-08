// core/hasard-couverture.test.ts — Où en est la reproductibilité des nœuds ?
//
// La convention du projet : un nœud qui tire au sort porte un paramètre
// « Graine », et n'appelle `Math.random` que pour tirer cette graine quand le
// champ vaut 0. Rien à l'exécution ne signale un nœud qui s'en écarte — le son
// est simplement différent à chaque fois, et on ne s'en aperçoit qu'en voulant
// garder un rendu.
//
// Ce test tient donc l'inventaire, en trois catégories. Il échoue si un fichier
// NOUVEAU appelle `Math.random()` sans y figurer, et si un fichier listé n'en
// appelle plus — de sorte que l'inventaire ne peut ni grossir en douce ni
// rester périmé. Migrer un fichier, c'est le déplacer de SANS_GRAINE vers
// CONFORME.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RACINE = join(__dirname, "..");

// 1. Hasard qui ne touche PAS au rendu : identifiants de messages vers un
//    worker, identifiants d'éléments DOM, position d'un nœud déposé sur le
//    canevas, navigation dans une vue. Rien de tout cela n'a à être rejouable.
const HORS_RENDU = new Set([
  "core/hasard.ts",                    // c'est lui qui tire la graine d'un nœud
  "plugins/legende-image.ts",
  "plugins/musicgen.ts",
  "plugins/sherpa-asr.ts",
  "plugins/speech-to-text.ts",
  "plugins/tts-francais.ts",
  "plugins/tts-kokoro.ts",
  "plugins/tts-piper.ts",
  "plugins/tts.ts",
  "plugins/vexflow.ts",
  "ui/App.tsx",
  "ui/vues.tsx",
]);

// 2. Conformes à la convention : le nœud porte une graine, et `Math.random`
//    ne sert qu'à en tirer une quand le champ vaut 0. Vérifié structurellement
//    plus bas, pas seulement déclaré ici.
const CONFORME = new Set([
  "audio/multi-reservoir.ts",
  "audio/reservoir.ts",
  "plugins/carte-sonore.ts",
  "plugins/continuation-stable-audio-3.ts",
  "plugins/coordonnees-sur-carte.ts",
  "plugins/couleur-suno-ia.ts",
  "plugins/galerie-exposition.ts",
  "plugins/generateur-paroles.ts",
  "plugins/pochette-svg.ts",
  "plugins/stable-audio-3.ts",
  "plugins/texte-image.ts",
  "plugins/textgen.ts",
]);

// 3. La dette : le hasard s'entend (ou se voit) et aucune graine ne le tient.
//    Chaque entrée ici est un nœud qui rend un résultat différent à chaque
//    exécution, sans aucun moyen de retrouver le précédent.
//
//    VIDE — les neuf fichiers qui s'y trouvaient (batterie, camelot, couleurs,
//    effets-temporel, generation, griffin-lim, midi, palette-harmonique,
//    magenta-helpers) ont reçu une graine sur les nœuds qui les appellent. La
//    catégorie reste déclarée : c'est là qu'atterrit un nouveau nœud qui tire
//    au sort sans paramètre, plutôt que de passer inaperçu.
const SANS_GRAINE = new Set<string>([]);

function fichiersSource(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) { fichiersSource(chemin, acc); continue; }
    if (!/\.tsx?$/.test(entree) || /\.test\.tsx?$/.test(entree)) continue;
    acc.push(chemin);
  }
  return acc;
}

/** Les lignes appelant `Math.random()`, fichier par fichier (chemins relatifs à src/). */
function lignesAvecMathRandom(): Map<string, string[]> {
  const par = new Map<string, string[]>();
  for (const chemin of fichiersSource(RACINE)) {
    // `Math.random()` avec ses parenthèses : la forme `= Math.random` est au
    // contraire le repli attendu d'un module DSP dont l'appelant n'a pas
    // fourni de générateur.
    const lignes = readFileSync(chemin, "utf8").split("\n").filter((l) => l.includes("Math.random()"));
    if (lignes.length) par.set(relative(RACINE, chemin).split(sep).join("/"), lignes);
  }
  return par;
}

describe("couverture des graines", () => {
  it("aucun fichier n'appelle Math.random() en dehors de l'inventaire", () => {
    const connus = new Set([...HORS_RENDU, ...CONFORME, ...SANS_GRAINE]);
    const inattendus = [...lignesAvecMathRandom().keys()].filter((f) => !connus.has(f)).sort();
    expect(inattendus, [
      "Ces fichiers appellent Math.random() sans figurer dans l'inventaire.",
      "La convention du projet est une graine PAR NŒUD :",
      '    { nom: "Graine", nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0 }',
      '    const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));',
      "puis afficher `graine` dans le message du nœud, sans quoi un rendu tiré",
      "au sort ne peut plus être retrouvé.",
      "Si le tirage ne touche pas au rendu (identifiant, position), ajoutez le",
      "fichier à HORS_RENDU en disant pourquoi.",
    ].join("\n")).toEqual([]);
  });

  it("l'inventaire ne contient pas de fichier déjà migré ou disparu", () => {
    // Sans ce garde-fou l'inventaire ne se vide jamais : on migre un fichier,
    // on oublie de l'en retirer, et il reste « autorisé » indéfiniment.
    const restants = new Set(lignesAvecMathRandom().keys());
    const perimes = [...HORS_RENDU, ...CONFORME, ...SANS_GRAINE].filter((f) => !restants.has(f)).sort();
    expect(perimes, "Fichiers inventoriés qui n'appellent plus Math.random() : à retirer.").toEqual([]);
  });

  it("les fichiers dits conformes le sont vraiment", () => {
    // Vérification STRUCTURELLE et non déclarative : dans un fichier conforme,
    // chaque appel doit soit servir à tirer une graine (la ligne parle de
    // graine/seed), soit fabriquer un identifiant unique (`toString(36)`).
    // Un tirage qui touche au rendu sans passer par une graine échoue ici.
    const par = lignesAvecMathRandom();
    const fautives: string[] = [];
    for (const f of CONFORME) {
      for (const ligne of par.get(f) ?? []) {
        const tireUneGraine = /graine|seed/i.test(ligne);
        const fabriqueUnId = ligne.includes("toString(36)");
        if (!tireUneGraine && !fabriqueUnId) fautives.push(`${f} : ${ligne.trim()}`);
      }
    }
    expect(fautives, "Appels qui ne tirent pas une graine dans un fichier dit conforme.").toEqual([]);
  });

  it("aucun nœud ne remplace Math.random globalement", () => {
    // Le générateur de script IA le faisait, sans jamais le restaurer : après
    // une exécution, tout le reste de l'application tirait sur son générateur
    // congruentiel. Une graine par nœud n'a de sens que si un nœud ne peut pas
    // détourner le hasard des autres.
    const coupables = fichiersSource(RACINE)
      .filter((c) => /Math\.random\s*=/.test(readFileSync(c, "utf8")))
      .map((c) => relative(RACINE, c).split(sep).join("/"));
    expect(coupables).toEqual([]);
  });

  it("les modules DSP migrés acceptent une source de hasard", () => {
    // Attrape la régression la plus probable : quelqu'un rétablit
    // `Math.random()` dans un module migré, et sa sortie redevient
    // silencieusement irreproductible.
    for (const f of ["audio/bruit.ts", "audio/convolution.ts", "audio/random-slice.ts"]) {
      const source = readFileSync(join(RACINE, f), "utf8");
      expect(source, f).toContain("hasard");
      expect(source.includes("Math.random()"), `${f} rappelle Math.random()`).toBe(false);
    }
  });
});
