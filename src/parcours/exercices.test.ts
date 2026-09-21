// parcours/exercices.test.ts — Le contenu du voyage, tenu contre le registre vivant.
//
// POURQUOI CE TEST EST LE PLUS IMPORTANT DU DOSSIER. Un exercice qui cite « generateur-frequence »
// et un réglage « Durée » est du texte : rien, dans le compilateur, ne relie cette chaîne au nœud
// qu'elle prétend désigner. Le jour où un nœud change d'identifiant ou perd un réglage, l'exercice
// ne tombe pas en panne — il devient IMPOSSIBLE À RÉUSSIR, en silence, et l'élève conclut qu'il
// s'y prend mal. C'est la faute que ce fichier existe pour empêcher.
//
// Chaque identifiant cité est donc cherché dans le registre, chaque paramètre exigé sur la fiche
// correspondante, et chaque valeur de choix parmi les valeurs possibles de ce choix. Le test lit
// les mêmes fiches que l'application exécute : un parcours ne peut donc pas vieillir sans qu'on le
// sache le jour même.
//
// LE RESTE TIENT LE TON, et pour les mêmes raisons que les notices du catalogue : pas un mot crié,
// pas un mot de français dans l'anglais, et une leçon qui dit vraiment quelque chose plutôt qu'une
// paraphrase de l'énoncé.
import { describe, expect, it } from "vitest";
import { CHAPITRES, EXERCICES } from "./exercices";
import { toutesLesFiches } from "../plugins";
import type { Condition, Critere, Exercice } from "./types";

const FICHES = new Map((toutesLesFiches as { id: string }[]).map((f) => [f.id, f as Record<string, unknown>]));

/** Tous les critères cités par un exercice, quelle que soit la forme de sa condition. */
function criteres(c: Condition | undefined): Critere[] {
  if (!c) return [];
  switch (c.sorte) {
    case "present": return [c.critere];
    case "absent": return [c.critere];
    case "relie": return [c.amont, c.aval];
    case "toutes": return c.conditions.flatMap(criteres);
  }
}

const tousCriteres = EXERCICES.flatMap((x) => criteres(x.condition));

/** Les paramètres d'une fiche, par nom. */
const parametresDe = (ficheId: string) =>
  new Map(((FICHES.get(ficheId)?.parametres ?? []) as { nom: string }[]).map((p) => [p.nom, p as Record<string, unknown>]));

describe("le voyage se tient", () => {
  it("chaque exercice a un identifiant unique", () => {
    const ids = EXERCICES.map((x) => x.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("chaque exercice appartient à un chapitre déclaré", () => {
    const connus = new Set(CHAPITRES.map((c) => c.id));
    expect(EXERCICES.filter((x) => !connus.has(x.chapitre)).map((x) => x.id)).toEqual([]);
  });

  it("chaque chapitre a des exercices, et se ferme sur UNE épreuve", () => {
    for (const c of CHAPITRES) {
      const liste = EXERCICES.filter((x) => x.chapitre === c.id);
      expect(liste.length, c.id).toBeGreaterThanOrEqual(3);
      expect(liste.filter((x) => x.epreuve).length, c.id).toBe(1);
      expect(liste[liste.length - 1].epreuve, `${c.id} : l'épreuve doit être la dernière`).toBe(true);
    }
  });

  it("les exercices d'un même chapitre se suivent", () => {
    const rencontres: string[] = [];
    for (const x of EXERCICES) if (rencontres[rencontres.length - 1] !== x.chapitre) rencontres.push(x.chapitre);
    expect(rencontres.length).toBe(new Set(rencontres).size);
  });

  it("une épreuve se mesure, un exercice se regarde", () => {
    for (const x of EXERCICES) {
      if (x.epreuve) expect(x.cibles?.length ?? 0, x.id).toBeGreaterThan(0);
      else expect(x.condition, x.id).toBeDefined();
    }
  });
});

describe("tout ce qui est cité existe pour de bon", () => {
  it("CHAQUE NŒUD CITÉ EST DANS LE REGISTRE", () => {
    const manquants = tousCriteres.flatMap((c) => (c.fiches ?? []).filter((id) => !FICHES.has(id)));
    expect(manquants).toEqual([]);
  });

  it("CHAQUE RÉGLAGE EXIGÉ EXISTE SUR CHACUN DES NŒUDS CITÉS", () => {
    const fautes: string[] = [];
    for (const c of tousCriteres) {
      if (!c.parametre) continue;
      expect(c.fiches, `un réglage ne s'exige que d'un nœud nommé : ${c.quoi}`).toBeDefined();
      for (const id of c.fiches ?? []) {
        if (!parametresDe(id).has(c.parametre.nom)) fautes.push(`${id} n'a pas de réglage « ${c.parametre.nom} »`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("LE NOM ANGLAIS D'UN RÉGLAGE EST CELUI QUE LA FICHE LUI DONNE", () => {
    const fautes: string[] = [];
    for (const c of tousCriteres) {
      if (!c.parametre) continue;
      for (const id of c.fiches ?? []) {
        const attendu = parametresDe(id).get(c.parametre.nom)?.nomEn as string | undefined;
        if (attendu && c.parametre.nomEn !== attendu) {
          fautes.push(`${id} · ${c.parametre.nom} : l'exercice dit « ${c.parametre.nomEn} », la fiche dit « ${attendu} »`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("une valeur de choix exigée est l'une des valeurs possibles", () => {
    const fautes: string[] = [];
    for (const c of tousCriteres) {
      const e = c.parametre;
      if (!e || e.vaut === undefined) continue;
      for (const id of c.fiches ?? []) {
        const p = parametresDe(id).get(e.nom);
        if (!p || p.type !== "choix") continue;
        const possibles = ((p.optionIds ?? p.options) as string[]).map(String);
        if (!possibles.includes(String(e.vaut))) fautes.push(`${id} · ${e.nom} : « ${e.vaut} » hors de [${possibles.join(", ")}]`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("une borne exigée tient dans la plage du curseur", () => {
    const fautes: string[] = [];
    for (const c of tousCriteres) {
      const e = c.parametre;
      if (!e) continue;
      for (const id of c.fiches ?? []) {
        const plage = parametresDe(id).get(e.nom)?.plage as [number, number] | undefined;
        if (!plage) continue;
        for (const v of [e.min, e.max, typeof e.vaut === "number" ? e.vaut : undefined]) {
          if (v !== undefined && (v < plage[0] || v > plage[1])) fautes.push(`${id} · ${e.nom} : ${v} hors de ${plage[0]}..${plage[1]}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("une famille ou un univers cité désigne au moins un nœud réel", () => {
    const fiches = [...FICHES.values()];
    for (const c of tousCriteres) {
      if (c.famille) expect(fiches.some((f) => f.famille === c.famille), c.famille).toBe(true);
      if (c.univers) expect(fiches.some((f) => f.univers === c.univers), c.univers).toBe(true);
    }
  });

  it("un critère dit toujours ce qu'il cherche, dans les deux langues", () => {
    for (const c of tousCriteres) {
      expect(c.quoi.length, JSON.stringify(c)).toBeGreaterThan(2);
      expect(c.quoiEn.length, JSON.stringify(c)).toBeGreaterThan(2);
    }
  });
});

// ── Le ton ────────────────────────────────────────────────────────────────────────────────────

const MOT_CRIE = /(?<![A-Za-zÀ-ÿŒœŸ])[A-ZÀ-ÖØ-ÞŒŸ]{3,}(?![A-Za-zÀ-ÿŒœŸ])/g;
const SIGLES = new Set(["LUFS", "RMS", "MIDI", "SFZ", "EBU"]);
const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/i;

/** Tous les textes montrés à l'élève, avec d'où ils viennent. */
function textes(): { ou: string; fr: string; en: string }[] {
  const out: { ou: string; fr: string; en: string }[] = [];
  for (const c of CHAPITRES) {
    out.push({ ou: `${c.id} · titre`, fr: c.titre, en: c.titreEn });
    out.push({ ou: `${c.id} · promesse`, fr: c.promesse, en: c.promesseEn });
  }
  for (const x of EXERCICES) {
    out.push({ ou: `${x.id} · titre`, fr: x.titre, en: x.titreEn });
    out.push({ ou: `${x.id} · énoncé`, fr: x.enonce, en: x.enonceEn });
    out.push({ ou: `${x.id} · indice`, fr: x.indice, en: x.indiceEn });
    out.push({ ou: `${x.id} · leçon`, fr: x.lecon, en: x.leconEn });
    for (const c of criteres(x.condition)) out.push({ ou: `${x.id} · critère`, fr: c.quoi, en: c.quoiEn });
    for (const c of x.cibles ?? []) out.push({ ou: `${x.id} · cible`, fr: c.exigence, en: c.exigenceEn });
  }
  return out;
}

describe("le ton du parcours", () => {
  const tous = textes();

  it("en trouve assez pour que le contrôle ait un sens", () => {
    expect(tous.length).toBeGreaterThan(100);
  });

  it("ne crie aucun mot — un exercice se lit dans un nœud, pas sur une affiche", () => {
    const fautives = tous
      .map((t) => ({ ou: t.ou, mots: [...`${t.fr} ${t.en}`.matchAll(MOT_CRIE)].map((m) => m[0]).filter((m) => !SIGLES.has(m)) }))
      .filter((t) => t.mots.length > 0);
    expect(fautives.map((f) => `${f.ou} — ${f.mots.join(", ")}`)).toEqual([]);
  });

  it("NE LAISSE AUCUN FRANÇAIS DANS L'ANGLAIS", () => {
    expect(tous.filter((t) => ACCENTS.test(t.en)).map((t) => t.ou)).toEqual([]);
  });

  it("ne laisse aucun texte vide d'un côté ou de l'autre", () => {
    expect(tous.filter((t) => t.fr.trim() === "" || t.en.trim() === "").map((t) => t.ou)).toEqual([]);
  });

  it("UNE LEÇON DIT QUELQUE CHOSE, et ne paraphrase pas l'énoncé", () => {
    for (const x of EXERCICES) {
      expect(x.lecon.length, x.id).toBeGreaterThan(150);
      expect(x.leconEn.length, x.id).toBeGreaterThan(150);
      expect(x.lecon.toLowerCase(), x.id).not.toBe(x.enonce.toLowerCase());
    }
  });

  it("un énoncé tient en une ou deux phrases : c'est une consigne, pas un cours", () => {
    for (const x of EXERCICES as Exercice[]) expect(x.enonce.length, x.id).toBeLessThan(220);
  });
});
