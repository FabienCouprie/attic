// ui/sauvegarde-auto.test.ts — Quand la sauvegarde automatique écrit, et quand non.
//
// Elle existait déjà, mais ne se déclenchait quasiment jamais pendant qu'on travaille :
// son minuteur dépendait d'une fonction recréée à chaque rendu, donc chaque modification
// du graphe relançait le compte à zéro. Mesuré dans l'application avant correction : dix
// changements de paramètre espacés de dix secondes, cent une secondes de travail, aucune
// écriture — alors qu'au repos, elle écrivait bien au bout de trente secondes.
//
// Le minuteur est désormais monté une fois par fichier ; ces tests tiennent l'autre
// moitié : ce que chaque battement décide.
import { describe, expect, it } from "vitest";
import { CLE_PREFERENCE, PERIODE_SAUVEGARDE_MS, decisionSauvegardeAuto, lirePreference } from "./sauvegarde-auto";

const BASE = { cheminFichier: "C:/projets/morceau.json", ecritureDirecte: true, json: "{a:1}" };

describe("décision de sauvegarde automatique", () => {
  it("écrit quand un fichier est ouvert et que le graphe a changé", () => {
    expect(decisionSauvegardeAuto({ ...BASE, dernierJson: "{a:0}" })).toBe("a-ecrire");
  });

  it("écrit la première fois, quand rien n'a encore été sauvegardé", () => {
    expect(decisionSauvegardeAuto({ ...BASE, dernierJson: null })).toBe("a-ecrire");
    expect(decisionSauvegardeAuto(BASE)).toBe("a-ecrire");
  });

  it("ne réécrit pas un fichier identique — une sauvegarde invisible ne remue rien", () => {
    expect(decisionSauvegardeAuto({ ...BASE, dernierJson: BASE.json })).toBe("inchange");
  });

  it("ne touche à rien sans fichier de projet : c'est le sens de « détacher »", () => {
    expect(decisionSauvegardeAuto({ ...BASE, cheminFichier: null })).toBe("sans-fichier");
    expect(decisionSauvegardeAuto({ ...BASE, cheminFichier: "" })).toBe("sans-fichier");
    expect(decisionSauvegardeAuto({ ...BASE, cheminFichier: undefined })).toBe("sans-fichier");
  });

  it("s'abstient quand l'écriture directe n'existe pas, plutôt que d'ouvrir un dialogue", () => {
    // En mode web, `sauvegarder` déclenche un téléchargement : un minuteur ne doit jamais
    // provoquer cela dans le dos de l'utilisateur.
    expect(decisionSauvegardeAuto({ ...BASE, ecritureDirecte: false })).toBe("sans-ecriture-directe");
    // Et l'absence de fichier prime, quoi qu'il arrive.
    expect(decisionSauvegardeAuto({ ...BASE, cheminFichier: null, ecritureDirecte: false })).toBe("sans-fichier");
  });

  it("garde une période de 30 secondes", () => {
    expect(PERIODE_SAUVEGARDE_MS).toBe(30_000);
  });
});

describe("bascule de la barre d'outils", () => {
  it("coupée, n'écrit rien — ni au battement, ni à la fermeture", () => {
    // « Couper la sauvegarde automatique » ne peut pas vouloir dire « sauf une fois de
    // temps en temps » : la même décision sert aux deux moments.
    expect(decisionSauvegardeAuto({ ...BASE, active: false })).toBe("desactivee");
    expect(decisionSauvegardeAuto({ ...BASE, active: false, dernierJson: "{a:0}" })).toBe("desactivee");
  });

  it("active, se comporte comme avant qu'elle existe", () => {
    expect(decisionSauvegardeAuto({ ...BASE, active: true, dernierJson: "{a:0}" })).toBe("a-ecrire");
    expect(decisionSauvegardeAuto({ ...BASE, active: true, dernierJson: BASE.json })).toBe("inchange");
  });

  it("absente, vaut active : le réglage est venu après", () => {
    expect(decisionSauvegardeAuto({ ...BASE, dernierJson: "{a:0}" })).toBe("a-ecrire");
  });

  it("prime sur tout le reste — inutile de chercher plus loin", () => {
    expect(decisionSauvegardeAuto({ ...BASE, active: false, cheminFichier: null })).toBe("desactivee");
    expect(decisionSauvegardeAuto({ ...BASE, active: false, ecritureDirecte: false })).toBe("desactivee");
  });
});

describe("préférence retenue d'une session à l'autre", () => {
  const stockage = (valeur: string | null) => ({ getItem: () => valeur });

  it("est active par défaut, y compris à la toute première ouverture", () => {
    expect(lirePreference(stockage(null))).toBe(true);
  });

  it("ne retient que le « coupé » explicite", () => {
    expect(lirePreference(stockage("0"))).toBe(false);
    expect(lirePreference(stockage("1"))).toBe(true);
  });

  it("reste active si le stockage refuse de répondre", () => {
    // Navigation privée, stockage bloqué : mieux vaut sauvegarder que se taire.
    expect(lirePreference({ getItem() { throw new Error("bloqué"); } })).toBe(true);
  });

  it("porte une clé distincte des autres préférences", () => {
    expect(CLE_PREFERENCE).toBe("attic-sauvegarde-auto");
  });
});
