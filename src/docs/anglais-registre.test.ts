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
import { FAMILLES_EFFETS, TABLES_PAR_UNIVERS } from "../plugins/familles-palette";
import type { FicheAudio } from "../audio/types-domaine";
import "../audio/adaptateur";

/**
 * Noms propres : leur accent n'est pas du français. « Möbius » et « Rössler » s'écrivent
 * ainsi dans les deux langues ; « bembé », le rythme d'Afrique de l'Ouest, aussi — c'est
 * son nom, et l'écrire « bembe » en anglais ne serait pas une traduction. « de Cheveigné »,
 * auteur de YIN, relève du même cas : c'est ainsi qu'il signe ses articles en anglais.
 */
// La limite finale est une négation et non un `\b` : en JavaScript, « é » n'est pas un
// caractère de mot, si bien que `\bbembé\b` ne reconnaît pas « bembé, » — le tréma de
// Möbius, lui, est au milieu et ne posait pas ce problème.
const TOLERES = /\b(?:möbius|rössler|bembé|cheveigné|välimäki|knöferle)(?![a-zà-ÿ])/gi;

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

// LA PALETTE AFFICHE LA FAMILLE PAR SA CLÉ « famille.<nom> ». Une famille sans entrée au dictionnaire
// s'affichait telle quelle, « famille.Vidéo », et une famille au nom voisin d'une autre ouvrait un
// second sous-menu : « Générateurs » à côté de « Génération » dans les Entrées. Les deux sont passés
// inaperçus à la compilation comme aux tests ; constatés dans l'application.
describe("familles de la palette", () => {
  it("chaque famille du registre a son libellé au dictionnaire", () => {
    const manquantes = [...new Set(toutesLesFiches.map((f) => f.famille))].filter((f) => !CLES_CONNUES.has(`famille.${f}`));
    expect(manquantes).toEqual([]);
  });

  it("dans un même univers, deux familles ne diffèrent pas que par leur terminaison", () => {
    const racine = (f: string) => f.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 6);
    // Une paire voulue, et nommée par Fabien : « Génération » reste le fourre-tout des entrées,
    // « Générateurs AI » ne tient que ce qui écrit par un modèle appris. Les deux se suivent dans la
    // palette, ce que cette règle cherche précisément à éviter : l'exception est donc écrite ici,
    // plutôt que la règle affaiblie.
    const PAIRES_VOULUES = new Set([
      "Entrées : Génération / Générateurs AI",
      "Entrées : Générateurs AI / Génération",
    ]);
    const doublons: string[] = [];
    const parUnivers = new Map<string, Set<string>>();
    for (const f of toutesLesFiches) {
      if (!parUnivers.has(f.univers)) parUnivers.set(f.univers, new Set());
      parUnivers.get(f.univers)!.add(f.famille);
    }
    for (const [u, familles] of parUnivers) {
      const vues = new Map<string, string>();
      for (const f of familles) {
        const r = racine(f);
        const paire = `${u} : ${vues.get(r)} / ${f}`;
        if (vues.has(r) && !PAIRES_VOULUES.has(paire)) doublons.push(paire);
        else vues.set(r, f);
      }
    }
    expect(doublons).toEqual([]);
  });
});

// Les deux tables réunies : un identifiant ne doit paraître qu'une fois dans l'ensemble.
const TOUTES_LES_FAMILLES: Record<string, string[]> = Object.assign({}, ...Object.values(TABLES_PAR_UNIVERS));

// LES FAMILLES DE LA PALETTE (cf. plugins/familles-palette.ts), pour les traitements comme pour les
// entrées. Un identifiant mal écrit dans une table ne rangerait rien et ne se verrait nulle part : le
// nœud resterait dans sa famille d'origine, et la famille annoncée serait vide.
describe("familles de la palette", () => {
  it("chaque identifiant de la table existe et a bien reçu sa famille", () => {
    const parId = new Map(toutesLesFiches.map((f) => [f.id, f]));
    const inconnus: string[] = [];
    const malRanges: string[] = [];
    for (const [famille, ids] of Object.entries(TOUTES_LES_FAMILLES)) {
      for (const id of ids) {
        const f = parId.get(id);
        if (!f) inconnus.push(`${famille} : ${id}`);
        else if (f.famille !== famille) malRanges.push(`${id} : ${f.famille} au lieu de ${famille}`);
      }
    }
    expect(inconnus).toEqual([]);
    expect(malRanges).toEqual([]);
  });

  // Une famille à nœud unique est presque toujours un oubli — le reste de sa fratrie n'a pas été
  // rangé. Presque : « Contrôle » est voulue ainsi, ouverte pour recevoir ce qui pilote sans sonner,
  // et n'a qu'un générateur de courbe à ce jour. L'exception est donc nommée ici, et une famille qui
  // se retrouverait seule sans y figurer fait échouer le test.
  const SEULES_ADMISES = new Set(["Contrôle"]);

  it("chaque famille a son libellé, et au moins deux nœuds sauf exception nommée", () => {
    for (const famille of Object.keys(TOUTES_LES_FAMILLES)) {
      expect(CLES_CONNUES.has(`famille.${famille}`), famille).toBe(true);
      const compte = toutesLesFiches.filter((f) => f.famille === famille).length;
      expect(compte, famille).toBeGreaterThanOrEqual(SEULES_ADMISES.has(famille) ? 1 : 2);
    }
  });

  it("aucun nœud n'est rangé deux fois", () => {
    const tous = Object.values(TOUTES_LES_FAMILLES).flat();
    expect(tous.length).toBe(new Set(tous).size);
  });
});
