// quiz/banque.test.ts — L'intégrité de la banque, et son ancrage dans le dépôt.
//
// UN QUIZ EST UN OBJET DANGEREUX : il affirme. Une erreur dans un nœud de traitement s'entend, une
// erreur dans une question s'apprend. Ce fichier tient donc les garde-fous qu'on ne peut pas
// obtenir par la relecture seule.
//
// LES DEUX TESTS QUI COMPTENT VRAIMENT sont les deux derniers, et ils ne vérifient pas la forme
// mais le FOND :
//
//   · tout sigle interrogé est un sigle qu'Attic emploie AILLEURS que dans le quiz ;
//   · toute source donnée pour bonne réponse est une source qu'Attic cite AILLEURS que dans le quiz.
//
// C'est ce qui empêche le quiz de dériver vers de la culture générale audio, et ce qui garantit
// qu'il reste un quiz SUR CE LOGICIEL. Le dépôt est lu à l'exécution, `src/quiz` excepté — sans
// cette exception, chaque question se prouverait elle-même.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANQUE, CHIFFRES, FORMULES, NOTIONS, SIGLES, SOURCES, vivier } from "./banque";
import { THEMES, choixLangue } from "./types";

/** Tout le code du dépôt, sauf le quiz lui-même : c'est le témoin. */
function depotHorsQuiz(): string {
  const morceaux: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        if (entree !== "quiz" && entree !== "node_modules") parcourir(chemin);
      } else if (/\.(ts|tsx)$/.test(entree)) {
        morceaux.push(readFileSync(chemin, "utf8"));
      }
    }
  };
  parcourir(join(process.cwd(), "src"));
  return morceaux.join("\n");
}

const DEPOT = depotHorsQuiz();

/**
 * Les noms propres qui gardent leurs signes diacritiques en anglais.
 *
 * Même principe que la liste de `docs/anglais-registre.test.ts` : le tréma de Välimäki appartient à
 * son nom, pas à un oubli de traduction.
 */
const NOMS_ACCENTUES = /(V[äa]lim[äa]ki|Z[öo]lzer|Pr[ůu][šs]a|S[øo]ndergaard|Kiti[ćc]|Cheveign[ée]|R[öo]ssler|Var[èe]se|Torr[ée]sani|M[öo]bius|Sierpi[ńn]ski|Gy[öo]rgy)/g;
const ACCENT = /[À-ÖØ-öø-ÿ]/;

describe("la banque", () => {
  it("est assez vaste pour ne pas se répéter, et chaque thème y pèse", () => {
    expect(BANQUE.length).toBeGreaterThanOrEqual(150);
    for (const [nom, lot] of [["sigles", SIGLES], ["notions", NOTIONS], ["formules", FORMULES],
      ["chiffres", CHIFFRES], ["sources", SOURCES]] as const) {
      expect(lot.length, nom).toBeGreaterThanOrEqual(20);
    }
  });

  it("n'a pas deux questions de même identifiant", () => {
    const vus = new Map<string, number>();
    for (const q of BANQUE) vus.set(q.id, (vus.get(q.id) ?? 0) + 1);
    expect([...vus].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("n'a pas deux fois le même énoncé", () => {
    const vus = new Map<string, string[]>();
    for (const q of BANQUE) vus.set(q.enonce, [...(vus.get(q.enonce) ?? []), q.id]);
    expect([...vus.values()].filter((ids) => ids.length > 1)).toEqual([]);
  });

  it("pose quatre propositions, toutes distinctes, dans les deux langues", () => {
    const fautes: string[] = [];
    for (const q of BANQUE) {
      for (const en of [false, true]) {
        const choix = choixLangue(q, en);
        if (choix.length !== 4) fautes.push(`${q.id} · ${choix.length} propositions`);
        if (new Set(choix).size !== choix.length) fautes.push(`${q.id} · propositions en double (${en ? "en" : "fr"})`);
        if (choix.some((c) => !c || !c.trim())) fautes.push(`${q.id} · proposition vide`);
      }
      if (q.choixEn && q.choixEn.length !== q.choix.length) fautes.push(`${q.id} · les deux langues n'ont pas le même nombre de propositions`);
    }
    expect(fautes).toEqual([]);
  });

  it("dit tout dans les deux langues — énoncé et explication", () => {
    const fautes: string[] = [];
    for (const q of BANQUE) {
      for (const [champ, texte] of [["enonce", q.enonce], ["enonceEn", q.enonceEn],
        ["pourquoi", q.pourquoi], ["pourquoiEn", q.pourquoiEn]] as const) {
        if (!texte || texte.trim().length < 10) fautes.push(`${q.id} · ${champ}`);
      }
      // Une explication qui ne fait qu'une phrase courte n'explique rien.
      if (q.pourquoi.length < 60) fautes.push(`${q.id} · explication trop brève`);
    }
    expect(fautes).toEqual([]);
  });

  it("ÉCRIT L'ANGLAIS SANS ACCENTS, les noms propres exceptés", () => {
    const fautes: string[] = [];
    for (const q of BANQUE) {
      const textes = [q.enonceEn, q.pourquoiEn, ...choixLangue(q, true)];
      for (const texte of textes) {
        const reste = texte.replace(NOMS_ACCENTUES, "");
        const m = reste.match(ACCENT);
        if (m) fautes.push(`${q.id} · « ${m[0]} » dans « ${reste.slice(Math.max(0, (m.index ?? 0) - 25), (m.index ?? 0) + 25)} »`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("range chaque question dans un thème connu et à un niveau connu", () => {
    for (const q of BANQUE) {
      expect(THEMES).toContain(q.theme);
      expect([1, 2]).toContain(q.niveau);
    }
  });

  it("TOUT SIGLE INTERROGÉ EST UN SIGLE QU'ATTIC EMPLOIE AILLEURS", () => {
    const absents: string[] = [];
    for (const q of SIGLES) {
      const m = q.enonce.match(/« ([A-Z][A-Z0-9]{1,6}) »/);
      if (!m) { absents.push(`${q.id} · sigle introuvable dans l'énoncé`); continue; }
      if (!DEPOT.includes(m[1])) absents.push(`${q.id} · ${m[1]} n'est employé nulle part`);
    }
    expect(absents).toEqual([]);
  });

  it("TOUTE SOURCE DONNÉE POUR BONNE RÉPONSE EST CITÉE AILLEURS DANS LE DÉPÔT", () => {
    const absents: string[] = [];
    const PARTICULES = new Set(["von", "van", "der", "den", "the", "and"]);
    for (const q of SOURCES) {
      const mots = q.choix[0].split(/[\s,&]+/)
        .map((x) => x.replace(/[«».]/g, ""))
        .filter((x) => x.length >= 3 && !PARTICULES.has(x.toLowerCase()));
      if (!mots.some((mot) => DEPOT.includes(mot))) absents.push(`${q.id} · « ${q.choix[0] }» n'est cité nulle part`);
    }
    expect(absents).toEqual([]);
  });
});

describe("le choix du vivier", () => {
  it("un thème demandé ne rend que ce thème", () => {
    for (const theme of ["sigles", "notions", "formules", "chiffres", "sources"] as const) {
      const v = vivier({ theme });
      expect(v.length).toBeGreaterThan(0);
      expect(v.every((q) => q.theme === theme)).toBe(true);
    }
  });

  it("un niveau demandé ne rend que ce niveau", () => {
    for (const niveau of [1, 2] as const) {
      const v = vivier({ niveau });
      expect(v.length).toBeGreaterThan(0);
      expect(v.every((q) => q.niveau === niveau)).toBe(true);
    }
  });

  it("le catalogue passé en argument s'ajoute au reste", () => {
    const faux = [{ ...BANQUE[0], id: "catalogue-faux", theme: "catalogue" as const }];
    expect(vivier({ catalogue: faux }).length).toBe(BANQUE.length + 1);
    expect(vivier({ theme: "catalogue", catalogue: faux })).toEqual(faux);
  });

  it("UN FILTRE QUI NE LAISSE RIEN REND TOUT, plutôt qu'un quiz vide", () => {
    // Le cas réel : le thème « catalogue » demandé alors que le registre n'est pas disponible.
    const v = vivier({ theme: "catalogue" });
    expect(v.length).toBe(BANQUE.length);
  });
});
