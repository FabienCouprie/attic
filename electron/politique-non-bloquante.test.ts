// electron/politique-non-bloquante.test.ts — Le processus principal ne bloque pas.
//
// POURQUOI CETTE RÈGLE EST LA PLUS STRICTE DE TOUTES. Le processus principal d'Electron sert la
// fenêtre, les menus et tous les IPC. Quand il bloque, ce n'est pas un calcul qui ralentit : c'est
// l'application entière qui cesse d'exister pour l'utilisateur — la fenêtre ne se redessine plus,
// le menu ne s'ouvre plus, aucun nœud ne peut plus rien demander. Un `execFileSync` avec un délai
// de cinq secondes, c'est cinq secondes d'application morte.
//
// Ce qui est interdit ici est donc étroit et vérifiable : lancer un processus de façon synchrone,
// et répondre à un IPC de façon synchrone. Ce n'est pas toute la politique anti-gel — la partie
// « rendre la main » vit dans `core/respirer.ts` et ne se mesure pas par lecture du code —, c'est
// la moitié qui se tient par un test.
//
// UNE EXCEPTION SE DÉCLARE, elle ne se devine pas : la ligne précédente porte
// `// blocage accepté : <raison>`. Écrire la raison est le prix de l'exception, et c'est ce qui
// empêche la liste de grossir sans qu'on s'en aperçoive.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DOSSIER = resolve(__dirname);

/** Ce qui bloque le processus principal, et le nom qu'on lui donne dans le rapport. */
const INTERDITS: { motif: RegExp; quoi: string }[] = [
  { motif: /\bexecSync\s*\(/, quoi: "lancement de processus synchrone" },
  { motif: /\bexecFileSync\s*\(/, quoi: "lancement de processus synchrone" },
  { motif: /\bspawnSync\s*\(/, quoi: "lancement de processus synchrone" },
  { motif: /\bipcRenderer\.sendSync\s*\(/, quoi: "IPC synchrone" },
  { motif: /\bevent\.returnValue\s*=/, quoi: "réponse IPC synchrone" },
];

const MARQUEUR = /\/\/\s*blocage accepté\s*:\s*\S/;

interface Infraction { fichier: string; ligne: number; quoi: string; texte: string }

function infractions(): Infraction[] {
  const out: Infraction[] = [];
  for (const f of readdirSync(DOSSIER)) {
    if (!f.endsWith(".cjs")) continue;
    const lignes = readFileSync(resolve(DOSSIER, f), "utf8").split("\n");
    lignes.forEach((ligne, i) => {
      // Une ligne de commentaire ne lance rien : le module en cite plusieurs pour expliquer
      // pourquoi il ne les emploie plus.
      if (/^\s*(\/\/|\*)/.test(ligne)) return;
      for (const { motif, quoi } of INTERDITS) {
        if (!motif.test(ligne)) continue;
        const precedentes = lignes.slice(Math.max(0, i - 3), i);
        if (precedentes.some((l) => MARQUEUR.test(l))) return;
        out.push({ fichier: f, ligne: i + 1, quoi, texte: ligne.trim().slice(0, 90) });
      }
    });
  }
  return out;
}

describe("le processus principal", () => {
  it("lit bien les fichiers qu'il doit surveiller", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".cjs"));
    expect(fichiers.length).toBeGreaterThan(5);
    expect(fichiers).toContain("main.cjs");
  });

  it("ne bloque jamais, sauf exception déclarée et justifiée", () => {
    const fautes = infractions();
    const rapport = fautes
      .map((f) => `  ${f.fichier}:${f.ligne} — ${f.quoi}\n      ${f.texte}`)
      .join("\n");
    expect(fautes.map((f) => `${f.fichier}:${f.ligne}`),
      fautes.length === 0 ? "" :
      `${fautes.length} blocage(s) non déclaré(s) :\n${rapport}\n`
      + "  Rendez l'appel asynchrone, ou déclarez l'exception par « // blocage accepté : <raison> ».")
      .toEqual([]);
  });

  it("garde les exceptions comptées : une liste qui grossit doit se voir", () => {
    // Le nombre d'exceptions déclarées est écrit ici À LA MAIN. Le faire monter est une décision,
    // pas un effet de bord : c'est le seul moyen qu'une dérogation reste un événement.
    const marquees = readdirSync(DOSSIER)
      .filter((f) => f.endsWith(".cjs"))
      .flatMap((f) => readFileSync(resolve(DOSSIER, f), "utf8").split("\n"))
      .filter((l) => MARQUEUR.test(l)).length;
    expect(marquees).toBeLessThanOrEqual(6);
  });
});
