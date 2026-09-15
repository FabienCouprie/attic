// docs/anglais-registre.test.ts — Garde-fou : rien de français ne doit survivre
// dans ce que le registre affiche en anglais.
//
// Motivation concrète. Les fiches portent un champ français et son doublon
// anglais — `nom`/`nomEn`, `doc`/`docEn`, `defaut`/`defautEn`… Quand le doublon
// manque, il n'y a NI erreur de compilation (les champs `…En` sont optionnels)
// NI échec de test : la valeur française est simplement affichée telle quelle.
// L'interface anglaise montrait donc « 2 temps », « 3 demi-tons », « -1 = tous »,
// des ports « Texte » et « Mesures », et un défaut « Garder » — et COMPONENTS.md,
// qui est engendré du registre en anglais, les exposait tous.
//
// Le relevé se fait sur la PROJECTION ANGLAISE de chaque fiche, c'est-à-dire
// exactement les chaînes que l'application et le catalogue affichent en anglais
// (`nomEn ?? nom`, la valeur par défaut d'un choix résolue vers `optionsEn`…).
// Une option française qui n'est jamais montrée en anglais ne remonte donc pas.
//
// La détection est double :
//  1. toute lettre accentuée du français — d'une précision remarquable en
//     pratique, l'anglais technique de ces fiches n'en employant pas, hormis
//     quelques noms propres explicitement tolérés ;
//  2. une liste de mots français SANS accent, que ce relevé a effectivement
//     trouvés (« temps », « tous », « garder »…). Elle n'a pas à être complète :
//     elle grandit le jour où un mot passe à travers.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { defautParam, valeursParam, uniteEn } from "./catalogue-markdown";
import { toutesLesFiches } from "../plugins/index";
import { CLES_CONNUES, traduireDans } from "../i18n";
import type { FicheAudio } from "../audio/types-domaine";
import "../audio/adaptateur";

/** Noms propres : leur tréma n'est pas du français. */
const TOLERES = /\b(?:möbius|rössler)\b/gi;

const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/i;

/**
 * Mots français sans accent relevés dans la projection anglaise. Volontairement
 * restreint aux mots dont AUCUN emploi anglais n'est plausible ici : « note »,
 * « mode », « plus », « son » sont anglais autant que français, les mettre
 * ferait crier le test sur des fiches correctes.
 */
const MOTS_FR = /\b(?:aucun|aucune|automatique|avec|cellule|cellules|chaque|dans|demi-ton|demi-tons|dossier|droite|entre|garder|gauche|les|mesures|niveau|niveaux|pas|pour|selon|sortie|sorties|temps|tous|toutes|tout|toute|vers|voix)\b/i;

/** Ce qui, dans un texte destiné à l'anglais, trahit du français. */
function francais(texte: string | undefined | null): boolean {
  const t = String(texte ?? "").replace(TOLERES, "");
  return ACCENTS.test(t) || MOTS_FR.test(t);
}

/** Toute chaîne que le registre montre en anglais, avec d'où elle vient. */
function projectionAnglaise(f: FicheAudio): { ou: string; texte: string }[] {
  const out: { ou: string; texte: string }[] = [];
  const ajoute = (ou: string, texte: string | undefined | null) => {
    if (texte !== undefined && texte !== null && String(texte) !== "") out.push({ ou: `${f.id} · ${ou}`, texte: String(texte) });
  };
  ajoute("nom", f.nomEn ?? f.nom);
  ajoute("résumé", f.resumeEn ?? f.resume);
  ajoute("notice", f.noticeEn ?? f.notice);
  for (const p of f.entrees ?? []) ajoute(`entrée « ${p.nom} »`, p.nomEn ?? p.nom);
  for (const p of f.sorties ?? []) ajoute(`sortie « ${p.nom} »`, p.nomEn ?? p.nom);
  for (const p of f.parametres ?? []) {
    if (p.hidden) continue; // Réglé par l'application, jamais montré.
    ajoute(`paramètre « ${p.nom} »`, p.nomEn ?? p.nom);
    ajoute(`« ${p.nom} » doc`, p.docEn ?? p.doc);
    ajoute(`« ${p.nom} » placeholder`, p.placeholderEn ?? p.placeholder);
    ajoute(`« ${p.nom} » unité`, uniteEn(p));
    (p.optionsEn ?? p.options ?? []).forEach((o, i) => ajoute(`« ${p.nom} » option ${i + 1}`, o));
    // Exactement ce que le catalogue écrit : un défaut de choix est résolu vers
    // son libellé anglais, un nombre est suivi de son unité anglaise.
    ajoute(`« ${p.nom} » défaut`, defautParam(p));
    ajoute(`« ${p.nom} » valeurs`, valeursParam(p));
  }
  return out;
}

describe("anglais du registre", () => {
  const fiches = toutesLesFiches as unknown as FicheAudio[];

  it("relève bien du texte à vérifier", () => {
    expect(fiches.length).toBeGreaterThan(200);
    expect(fiches.reduce((n, f) => n + projectionAnglaise(f).length, 0)).toBeGreaterThan(2000);
  });

  it("ne montre aucun français dans ce que le registre affiche en anglais", () => {
    const fautifs = fiches.flatMap(projectionAnglaise)
      .filter(({ texte }) => francais(texte))
      .map(({ ou, texte }) => `${ou} : ${texte.replace(/\s+/g, " ").slice(0, 100)}`);
    // Le message nomme la fiche, le champ et le texte : de quoi corriger sans
    // rejouer la recherche.
    expect(fautifs, "champs …En manquants ou restés en français").toEqual([]);
  });

  it("reconnaît le français qu'il est censé attraper", () => {
    expect(francais("3 demi-tons")).toBe(true);
    expect(francais("-1 = tous")).toBe(true);
    expect(francais("Garder")).toBe(true);
    expect(francais("Fenêtre")).toBe(true);
    expect(francais("Duration per chord in beats")).toBe(false);
    expect(francais("Möbius Strip")).toBe(false);
  });
});

/**
 * Le dictionnaire, lui, ne peut pas « oublier » une clé — `traduire` rendrait la
 * clé nue, et i18n.test.ts le voit. Ce qu'il peut faire, c'est recopier le
 * français dans la case anglaise, ou perdre une variable en traduisant : un
 * message d'exécution en français dans une interface anglaise, ou un « {0} »
 * affiché tel quel.
 */
describe("anglais du dictionnaire", () => {
  const cles = [...CLES_CONNUES];
  const variables = (s: string) => [...s.matchAll(/\{__VAR_(\d+)__\}/g)].map((m) => m[1]).sort().join(",");

  it("relève bien des clés", () => {
    expect(cles.length).toBeGreaterThan(500);
  });

  it("n'a aucune traduction anglaise restée en français", () => {
    const fautives = cles.filter((c) => francais(traduireDans("en", c)))
      .map((c) => `${c} : ${traduireDans("en", c).slice(0, 100)}`);
    expect(fautives).toEqual([]);
  });

  it("garde les mêmes variables dans les deux langues", () => {
    const ecarts = cles
      .filter((c) => variables(traduireDans("fr", c)) !== variables(traduireDans("en", c)))
      .map((c) => `${c} : fr « ${traduireDans("fr", c)} » / en « ${traduireDans("en", c)} »`);
    expect(ecarts).toEqual([]);
  });
});
