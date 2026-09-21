// docs/caracteres-controle.test.ts — Aucun caractère de contrôle brut dans les sources.
//
// POURQUOI CE TEST. Un caractère de contrôle écrit tel quel dans une source — un octet nul, un
// retour arrière — y est invisible, et pourtant il y agit : un octet nul fait traiter le fichier
// comme BINAIRE par git, dont les différences deviennent illisibles ; un retour arrière dans une
// expression régulière la fait échouer sans que rien ne se voie à la relecture. Relevé le
// 2026-09-22 dans cinq fichiers à la fois, glissés là par des scripts qui décodaient les séquences
// d'échappement au lieu de les écrire. La règle : un tel caractère s'écrit TOUJOURS en séquence
// d'échappement (barre oblique inverse, puis « x00 » ou « u0001 »), jamais brut. La tabulation, le
// saut de ligne et le retour chariot restent permis. Attention en écrivant ces séquences par un
// outil ou un script : plusieurs les décodent au passage, et écrivent le caractère lui-même.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const RACINES = ["src", "tests-e2e", "electron"];
const EXTENSIONS = /\.(ts|tsx|cjs|mjs|js|css|html|json)$/;

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else if (EXTENSIONS.test(nom)) out.push(chemin);
  }
  return out;
}

describe("caractères de contrôle", () => {
  it("AUCUNE SOURCE N'EN CONTIENT DE BRUT — ils s'écrivent en séquence d'échappement", () => {
    const fautifs: string[] = [];
    for (const racine of RACINES) {
      for (const f of fichiers(racine)) {
        const texte = readFileSync(f, "utf-8");
        for (let i = 0; i < texte.length; i++) {
          const c = texte.charCodeAt(i);
          if (c < 32 && c !== 9 && c !== 10 && c !== 13) {
            const ligne = texte.slice(0, i).split("\n").length;
            fautifs.push(`${f}:${ligne} — caractère ${c}`);
            break;
          }
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});
