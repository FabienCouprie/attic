// electron/acestep-modele-absent.test.ts — Un débruiteur choisi et absent se refuse en français.
//
// LA FORME DU PIÈGE : un nœud qui laisse choisir entre deux débruiteurs, dont chacun se prend à part
// depuis le panneau des modèles. Le pont ACE-Step ne télécharge rien de lui-même ; le débruiteur
// choisi peut donc manquer. Mesuré le 2026-10-31, le moteur s'arrête alors en anglais, sur « FATAL:
// synth_model '…' not found in registry », que le nœud aurait montré tel quel.
//
// LE DOSSIER DES MODÈLES EST UN DOSSIER VIDE, et c'est ce qui rend le cas sûr : le refus doit venir
// avant tout lancement, sinon l'exécutable serait cherché sur le chemin et l'essai sortirait du test.
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const requerir = createRequire(import.meta.url);
const { rendre } = requerir("./acestep.cjs") as {
  rendre: (options: Record<string, unknown>, surAvancement: () => void, contexte: Record<string, unknown>)
    => Promise<{ ok: boolean; journal?: string }>;
};
const { MODELES } = requerir("./acestep-plan.cjs") as { MODELES: Record<string, string> };

const temporaires: string[] = [];

/** Une racine de projet sans aucun modèle, que `resoudreRessource` lit hors empaquetage. */
function racineVide() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "attic-acestep-absent-"));
  temporaires.push(d);
  return { empaquete: false, racineProjet: d };
}

afterEach(() => {
  while (temporaires.length > 0) {
    try { fs.rmSync(temporaires.pop()!, { recursive: true, force: true }); } catch { /* sans conséquence */ }
  }
});

const PLAN = JSON.stringify({ caption: "une ballade", lyrics: "[Instrumental]", duration: 10 });

describe("le débruiteur choisi et absent", () => {
  it("se refuse en français, en nommant le fichier qui manque, pour chacun des deux", async () => {
    for (const [id, fichier] of Object.entries(MODELES)) {
      const r = await rendre({ plan: PLAN, tache: "text2music", modele: id }, () => {}, racineVide());
      expect(r.ok, id).toBe(false);
      expect(r.journal, id).toContain(fichier);
      expect(r.journal, id).toMatch(/panneau des modèles/);
    }
  });

  it("laisse passer d'abord ce qui se refuse sans le disque", async () => {
    // CE QUI NE DEMANDE RIEN SE VÉRIFIE D'ABORD : une reprise sans audio source se refuse pour
    // cette raison, que le débruiteur soit là ou non. L'ordre inverse a fait tomber l'intégration
    // continue sur le pont d'Apollo, où aucun modèle n'est présent.
    const r = await rendre({ plan: PLAN, tache: "cover", modele: "base" }, () => {}, racineVide());
    expect(r.ok).toBe(false);
    expect(r.journal).toMatch(/audio source/);
  });
});
