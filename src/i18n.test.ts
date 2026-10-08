// i18n.test.ts — Garde-fou : toute clé de traduction citée dans le code doit
// exister dans le dictionnaire.
//
// Motivation concrète : le bouton × de l'onglet appelait `t("workflow.nouveauTitre")`
// alors qu'AUCUNE clé `workflow.*` n'existait. `traduire` retombe sur la clé
// elle-même, donc l'infobulle affichait la chaîne brute « workflow.nouveauTitre ».
// Rien ne le signalait : ni TypeScript (la signature est `(cle: string)`), ni
// l'exécution (pas d'exception), ni les tests. Seule une lecture attentive de
// l'interface pouvait le révéler.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLES_CONNUES, traduireDans } from "./i18n";

function fichiersSource(racine: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) { out.push(...fichiersSource(chemin)); continue; }
    if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) out.push(chemin);
  }
  return out;
}

// On ne relève QUE les clés littérales : `t(\`famille.${x}\`)` ou `traduire(cle)`
// sont construits à l'exécution et ne peuvent pas être vérifiés statiquement.
// Le `\b` évite d'attraper `format(`, `useEffect(` et consorts : le caractère qui
// précède le `t` y est un caractère de mot, donc la limite ne s'y applique pas.
const APPELS = /\b(?:t|traduire)\(\s*"([^"]+)"/g;

describe("couverture i18n", () => {
  const fichiers = fichiersSource(join(__dirname));

  it("trouve bien des appels à traduire (le relevé n'est pas vide)", () => {
    const total = fichiers.reduce((n, f) => n + [...readFileSync(f, "utf8").matchAll(APPELS)].length, 0);
    expect(total).toBeGreaterThan(100);
  });

  it("toute clé littérale citée dans le code existe dans le dictionnaire", () => {
    const manquantes: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, "utf8");
      for (const m of source.matchAll(APPELS)) {
        const cle = m[1];
        if (!CLES_CONNUES.has(cle)) manquantes.push(`${cle}  (${fichier.replace(__dirname, "src")})`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});

// UN MODÈLE ABSENT NE S'OBTIENT PLUS EN RÉINSTALLANT, et deux messages le disaient encore.
//
// L'installeur ne porte plus aucun modèle depuis le 2026-10-08 : réinstaller l'application ne
// rapporte donc rien, et ce conseil envoyait télécharger quatre cents méga-octets d'installeur
// pour revenir au même état. Deux messages l'ont porté des mois — le débruitage et le score
// esthétique —, chacun écrit au moment où son nœud arrivait, sans que rien ne les relie.
//
// LE GARDE CHERCHE LA FORME, ET NON LES DEUX NOMS : tout message qui annonce un modèle absent,
// présent ou futur, doit dire par où le prendre et ne pas renvoyer à une réinstallation.
describe("les messages d'un modèle absent", () => {
  const FORME_FR = /Modèle\b[^.:]*\b(absent|introuvable)/i;
  const ICONE_FR = "Récupérer les modèles IA";
  const ICONE_EN = "Fetch the AI models";

  const concernes = [...CLES_CONNUES].filter((cle) => FORME_FR.test(traduireDans("fr", cle)));

  it("le relevé n'est pas vide : sans quoi ce garde ne dirait rien", () => {
    expect(concernes.length).toBeGreaterThanOrEqual(4);
  });

  it("AUCUN NE DIT DE RÉINSTALLER L'APPLICATION, qui n'embarque plus de modèle", () => {
    const fautifs = concernes.filter((cle) =>
      /réinstall/i.test(traduireDans("fr", cle)) || /reinstall/i.test(traduireDans("en", cle)));
    expect(fautifs, "réinstaller ne rapporte aucun modèle : l'installeur n'en porte plus").toEqual([]);
  });

  it("et chacun renvoie à l'icône qui les prend, dans les deux langues", () => {
    const muets = concernes.filter((cle) =>
      !traduireDans("fr", cle).includes(ICONE_FR) || !traduireDans("en", cle).includes(ICONE_EN));
    expect(muets, "un modèle absent sans chemin indiqué laisse le nœud muet sans recours").toEqual([]);
  });
});
