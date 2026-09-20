// plugins/memoire-fiches.test.ts — Une déclaration `memoire: "flux"` doit rester vraie.
//
// CE QUE CE TEST TIENT, ET POURQUOI IL EXISTE. `memoire` est une promesse faite au moteur : ce
// nœud n'a jamais besoin de regarder devant, on peut donc le faire travailler par blocs au-delà de
// dix minutes de piste. Une promesse fausse ne se voit pas — le nœud rendra un résultat, mais un
// résultat tronqué ou bruité, sur la seule sorte de piste où personne ne réécoute tout. C'est le
// pire genre de bogue : silencieux, tardif, et proportionnel à la durée.
//
// LA VÉRIFICATION EST GROSSIÈRE, ET C'EST VOULU. Elle ne prouve pas qu'un nœud est un flux — cela
// se lit, et cela s'est lu, fiche par fiche. Elle interdit l'inverse : qu'un nœud déclaré « flux »
// contienne une opération qui exige le signal entier. Un `reverse()`, un `sort()`, une transformée
// de Fourier, un `OfflineAudioContext` : ces gestes-là ne cohabitent pas avec la promesse. Si l'un
// apparaît un jour dans un nœud typé, c'est que la promesse a cessé d'être vraie, et il vaut mieux
// l'apprendre ici qu'au bout d'une heure de rendu.
//
// POURQUOI LIRE LE TEXTE DES SOURCES plutôt que d'exécuter les nœuds. Parce qu'un nœud ne révèle
// son besoin qu'en tournant sur une longue piste : le test durerait des minutes et ne dirait rien
// de plus. Le texte, lui, est disponible tout de suite et se relit sans rien allouer.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "./index";

/** Gestes qui exigent d'avoir tout le signal avant d'écrire le premier échantillon. */
const INTERDITS: [RegExp, string][] = [
  [/\bOfflineAudioContext\b/, "rend tout d'un coup (OfflineAudioContext)"],
  [/\b(?:fft|stft|rfft)\w*\s*\(/, "transformée de Fourier"],
  [/\.reverse\(\)/, "lecture à l'envers"],
  [/\.sort\(/, "tri du signal"],
  [/Math\.max\(\s*\.\.\./, "crête cherchée sur tout le signal"],
  [/\bdecodeAudioData\b/, "décodage global"],
];

const DOSSIER = join(__dirname);

/** Le bloc de texte de chaque fiche : de son `id:` au `id:` suivant. */
function blocsParFiche(): Map<string, string> {
  const blocs = new Map<string, string>();
  for (const nom of readdirSync(DOSSIER)) {
    if (!nom.endsWith(".ts") || nom.endsWith(".test.ts")) continue;
    const source = readFileSync(join(DOSSIER, nom), "utf-8");
    const bornes = [...source.matchAll(/^\s*id: "([a-z0-9-]+)"/gm)];
    bornes.forEach((m, i) => {
      const fin = i + 1 < bornes.length ? bornes[i + 1].index! : source.length;
      blocs.set(m[1], source.slice(m.index!, fin));
    });
  }
  return blocs;
}

describe("la déclaration mémoire des fiches", () => {
  const fiches = toutesLesFiches;
  const enFlux = fiches.filter((f) => (f as { memoire?: string }).memoire === "flux");

  it("quelques nœuds sont déclarés « flux », sinon ce test ne garde rien", () => {
    expect(enFlux.length).toBeGreaterThanOrEqual(14);
  });

  it("aucune autre valeur que « totale » ou « flux » n'est déclarée", () => {
    const valeurs = new Set(fiches.map((f) => (f as { memoire?: string }).memoire).filter(Boolean));
    expect([...valeurs].sort()).toEqual(["flux"]);
  });

  it("un nœud déclaré « flux » ne contient aucun geste qui exige le signal entier", () => {
    const blocs = blocsParFiche();
    const fautes: string[] = [];
    for (const f of enFlux) {
      const bloc = blocs.get(f.id);
      expect(bloc, `bloc introuvable pour ${f.id}`).toBeDefined();
      for (const [motif, nom] of INTERDITS) {
        if (motif.test(bloc!)) fautes.push(`${f.id} : ${nom}`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("un nœud déclaré « flux » a bien une entrée audio — sinon la déclaration ne sert à rien", () => {
    const sansAudio = enFlux
      .filter((f) => !f.entrees.some((e) => e.type === "audio"))
      .map((f) => f.id);
    expect(sansAudio).toEqual([]);
  });
});
