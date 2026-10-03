// audio/nomenclatures.test.ts — Aucune table privée, sur aucun domaine.
//
// POURQUOI CE FICHIER EXISTE, et pourquoi la même règle y est écrite une fois pour trois domaines.
// Fabien, le 2026-09-28 : « qui nous dit que nous n'avons pas encore des choses cachées sur les
// accords et les rythmes. Nous devons continuer d'unifier et de dériver pour obtenir un objet aux
// nomenclatures sûres. Sans nomenclature sûre pas d'objet. »
//
// CE QUI AVAIT ÉCHOUÉ. Le premier garde des gammes cherchait `const GAMMES?[A-Z_]*`, c'est-à-dire
// un NOM de constante. Il gardait une porte en laissant les murs ouverts : cinq fichiers portaient
// une table de gammes sous un autre nom — `MAJEUR` et `MINEUR` dans le cercle pulsant,
// `DEGRES_MAJEUR` et `DEGRES_MINEUR` dans la génération, `DEGRES_MINEUR_HARMONIQUE` dans la
// mélodie, une majeure écrite en dur dans le solveur de contrepoint, un repli dans le L-système.
// Sept occurrences, qu'un an de tests n'aurait pas vues.
//
// LA RÈGLE JUSTE : UN GARDE CHERCHE LA FORME, JAMAIS LE NOM. Un nom se change, et la table
// réapparaît sous un autre. Une gamme, un accord et un rythme ont chacun une forme reconnaissable,
// et c'est elle qui ne peut pas être déguisée.
//
// ET LES FAUX POSITIFS SE NOMMENT UN PAR UN, avec leur raison. Les écarter en bloc par un dossier
// ou un préfixe rouvrirait le mur ; les nommer oblige à regarder chacun, et un second cas vérifie
// que chaque exception sert encore.
//
// CE QUE CE RELEVÉ A APPRIS EN PASSANT, et qui vaut d'être su. Les trois domaines partagent leurs
// nombres : le bembé est la GAMME MAJEURE posée sur douze places, le fume-fume la pentatonique
// majeure, le tresillo l'accord diminué. Ce ne sont pas des doublons mais les mêmes objets
// mathématiques employés de deux façons. C'est pour cela qu'un garde ne peut pas se fonder sur les
// seuls nombres : il se fonde sur la FORME D'EXPRESSION que le dépôt s'est donnée pour chaque
// domaine — des degrés pour une gamme, des intervalles pour un accord, une chaîne de zéros et de
// uns pour un rythme.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GAMMES } from "./gammes";
import { QUALITES } from "./qualites-accords";
import { RYTHMES_CANONIQUES } from "./cercle";

/** Les sources où une table pourrait réapparaître, cas de test exclus. */
function sources(dossiers = [join("src", "audio"), join("src", "plugins"), join("src", "ui"), join("src", "vues-domaine")]): string[] {
  const out: string[] = [];
  for (const d of dossiers) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...sources([join(d, e.name)]));
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(join(d, e.name));
    }
  }
  return out;
}

/**
 * Une ligne de source, avec où elle est et sous quelle déclaration.
 *
 * LA DÉCLARATION EST PORTÉE, PARCE QU'UNE TABLE S'ÉTEND SUR PLUSIEURS LIGNES. Une rangée de grille
 * de séquenceur ne se distingue d'un rythme nommé que par ce qui l'englobe : sans ce nom, il
 * faudrait excuser un fichier entier, ce qui rouvrirait le mur qu'on vient de fermer.
 */
interface Ligne { fichier: string; rang: number; texte: string; sous: string }

function lignes(): Ligne[] {
  const out: Ligne[] = [];
  for (const fichier of sources()) {
    let sous = "";
    readFileSync(fichier, "utf8").split(/\r?\n/).forEach((texte, i) => {
      const declaration = texte.match(/^\s*(?:export\s+)?(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/);
      if (declaration) sous = declaration[1];
      // Un commentaire n'est pas une déclaration : il peut citer une gamme pour l'expliquer.
      if (/^\s*(\/\/|\*|\/\*)/.test(texte)) return;
      out.push({ fichier, rang: i + 1, texte, sous });
    });
  }
  return out;
}

/**
 * Un domaine gardé : où sa table est déclarée, à quoi sa forme se reconnaît, et ce qui lui
 * ressemble sans en être.
 */
interface Domaine {
  nom: string;
  /** Les fichiers qui ONT le droit de porter la table, parce qu'ils SONT la table. */
  tables: string[];
  /** Vrai quand cette ligne porte la forme du domaine. */
  reconnait: (l: string) => boolean;
  /**
   * Ce qui porte la forme sans être du domaine, nommé avec sa raison.
   *
   * `motif` est cherché dans la ligne ET dans le nom de la déclaration qui l'englobe : une rangée
   * de grille ne dit rien d'elle-même, c'est la constante qui la porte qui la nomme.
   */
  exceptions: { motif: RegExp; raison: string }[];
  /** Où envoyer celui qui vient d'en écrire une. */
  remede: string;
}

/** Une gamme : de cinq à douze degrés, croissants, commençant à zéro, tous sous douze. */
function estUneGamme(ligne: string): boolean {
  for (const m of ligne.matchAll(/\[\s*0\s*(?:,\s*\d+\s*){4,11}\]/g)) {
    const v = JSON.parse(m[0].replace(/\s+/g, "")) as number[];
    if (v.every((x, k) => k === 0 || x > v[k - 1]) && v[v.length - 1] <= 11) return true;
  }
  return false;
}

/** Un accord : l'une des onze suites d'intervalles qui ne sont des accords et rien d'autre. */
const FORMES_ACCORD = [
  [0, 4, 7], [0, 3, 7], [0, 4, 8], [0, 3, 6], [0, 5, 7], [0, 2, 7],
  [0, 4, 7, 10], [0, 3, 7, 10], [0, 4, 7, 11], [0, 3, 6, 10], [0, 3, 6, 9],
].map((v) => new RegExp(`\\[\\s*${v.join("\\s*,\\s*")}\\s*\\]`));

/** Un rythme : une chaîne d'au moins huit signes, avec au moins une frappe et au moins un silence. */
function estUnRythme(ligne: string): boolean {
  for (const m of ligne.matchAll(/["'`]([01]{8,64})["'`]/g)) {
    if (m[1].includes("1") && m[1].includes("0")) return true;
  }
  return false;
}

const DOMAINES: Domaine[] = [
  {
    nom: "gamme",
    // `classes-hauteurs.ts` EST UNE NOMENCLATURE, ET NON UNE TABLE PRIVÉE. Le catalogue des classes
    // de hauteurs d'Allen Forte nomme TOUS les ensembles de notes, gammes comprises : la
    // pentatonique y est « 5-35 », la diatonique « 7-35 », l'octatonique « 8-28 ». Il dit d'elles
    // autre chose que `gammes.ts` — leur place dans une classification, non leur usage musical.
    tables: ["gammes.ts", "gammes-monde.ts", "classes-hauteurs.ts"],
    reconnait: estUneGamme,
    exceptions: [
      { motif: /\bCONSONANCES\b/,
        raison: "les intervalles consonants du contrepoint, qui ne forment pas une échelle" },
      { motif: /\bVOIX_APRES\b/,
        raison: "des rangs de voix, non des degrés" },
      { motif: /\bnotesBlanches\b/,
        raison: "les touches blanches d'un clavier dessiné : c'est bien la gamme de do, mais comme dessin et non comme choix musical" },
    ],
    remede: "déclarer les degrés dans audio/gammes.ts, et dériver d'elle par `degresDeGamme`",
  },
  {
    nom: "accord",
    tables: ["qualites-accords.ts", "classes-hauteurs.ts"],
    reconnait: (l) => FORMES_ACCORD.some((r) => r.test(l)),
    exceptions: [
      { motif: /\b(kick|snare|hat|hatOuvert)\s*:/,
        raison: "des positions de frappe dans une grille de batterie : « hat: [0, 4, 8] » sont trois croches, non une triade augmentée" },
    ],
    remede: "déclarer les intervalles dans audio/qualites-accords.ts, et dériver d'elle par `intervallesDaccord`",
  },
  {
    nom: "rythme",
    tables: [join("audio", "cercle.ts")],
    reconnait: estUnRythme,
    exceptions: [
      { motif: /^MOTIF_(AVANCE|MELO|ACCORDS)_DEFAUT$/,
        raison: "une rangée de l'état de départ d'un séquenceur à pas : une grille a plusieurs pistes, et chaque rangée en est une, non un rythme nommé" },
    ],
    remede: "déclarer le motif dans RYTHMES_CANONIQUES de audio/cercle.ts, et le reprendre par `motifNomme`",
  },
];

describe("aucune table privée, sur aucun domaine", () => {
  const toutes = lignes();

  for (const d of DOMAINES) {
    it(`AUCUNE TABLE DE ${d.nom.toUpperCase()}S N'EST ÉCRITE HORS DE LA SIENNE`, () => {
      const suspects = toutes
        .filter((l) => !d.tables.some((t) => l.fichier.endsWith(t)))
        .filter((l) => !d.exceptions.some((e) => e.motif.test(l.texte) || e.motif.test(l.sous)))
        .filter((l) => d.reconnait(l.texte))
        .map((l) => `${l.fichier}:${l.rang} — ${l.texte.trim().slice(0, 80)}`);
      expect(suspects, d.remede).toEqual([]);
    });

    it(`et chaque exception au domaine « ${d.nom} » sert encore`, () => {
      // UNE EXCEPTION DEVENUE INUTILE MASQUE LA RÉAPPARITION DU DÉFAUT sous la même forme. Celle-ci
      // doit donc désigner quelque chose, et ce quelque chose doit toujours porter la forme.
      const inutiles = d.exceptions
        .filter((e) => !toutes.some((l) => (e.motif.test(l.texte) || e.motif.test(l.sous)) && d.reconnait(l.texte)))
        .map((e) => `${e.raison} — plus aucune ligne ne l'appelle, retirer l'exception`);
      expect(inutiles).toEqual([]);
    });
  }

  it("LE GARDE CHERCHE BIEN LA FORME, ET NON LE NOM — éprouvé sur les trois domaines", () => {
    // LA FAUTE QUE CE FICHIER EXISTE POUR EMPÊCHER : une table écrite sous un nom que personne
    // n'aurait pensé à chercher. On la plante ici, en mémoire, plutôt que dans une source.
    const gamme = DOMAINES.find((d) => d.nom === "gamme")!;
    expect(gamme.reconnait("const CE_QUE_TU_VEUX = [0, 2, 4, 5, 7, 9, 11];")).toBe(true);
    expect(gamme.reconnait("const x = [0, 2, 4];"), "trop courte pour être une gamme").toBe(false);
    expect(gamme.reconnait("const x = [0, 2, 4, 5, 7, 9, 14];"), "sort de l'octave").toBe(false);
    expect(gamme.reconnait("const x = [0, 5, 2, 7, 9, 11, 4];"), "non triée").toBe(false);

    const accord = DOMAINES.find((d) => d.nom === "accord")!;
    expect(accord.reconnait("const PEU_IMPORTE = [0, 4, 7];")).toBe(true);
    expect(accord.reconnait("const x = [0, 4, 6];"), "pas une des formes gardées").toBe(false);

    const rythme = DOMAINES.find((d) => d.nom === "rythme")!;
    expect(rythme.reconnait('const X = "1001001000101000";')).toBe(true);
    expect(rythme.reconnait('const X = "0000000000000000";'), "une grille vide n'est pas un rythme").toBe(false);
    expect(rythme.reconnait('const X = "1010";'), "trop courte").toBe(false);
  });

  it("LES TROIS TABLES SONT PEUPLÉES, sans quoi les gardes passeraient à vide", () => {
    expect(GAMMES.length).toBeGreaterThan(20);
    expect(QUALITES.length).toBeGreaterThan(20);
    expect(RYTHMES_CANONIQUES.length).toBeGreaterThan(5);
  });

  it("LES TROIS DOMAINES PARTAGENT LEURS NOMBRES, et c'est pourquoi la forme d'expression décide", () => {
    // Le bembé est la gamme majeure posée sur douze places, le fume-fume la pentatonique majeure,
    // le tresillo l'accord diminué. Un garde fondé sur les seuls nombres confondrait les trois.
    const places = (motif: string) => [...motif].map((c, i) => (c === "1" ? i : -1)).filter((i) => i >= 0);
    const rythme = (id: string) => places(RYTHMES_CANONIQUES.find((r) => r.id === id)!.motif);
    expect(rythme("bembe")).toEqual(GAMMES.find((g) => g.id === "majeur")!.degres);
    expect(rythme("fume-fume")).toEqual(GAMMES.find((g) => g.id === "pentatonique-majeure")!.degres);
    expect(rythme("tresillo")).toEqual(QUALITES.find((q) => q.id === "dim")!.intervalles);
  });
});
