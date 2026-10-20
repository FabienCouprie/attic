// electron/acestep-sortie.test.ts — L'audio reçu ne doit jamais être pris pour l'audio rendu.
//
// LA FORME DU PIÈGE : une recherche de fichier par son SUFFIXE dans un dossier où l'on vient
// d'écrire un fichier du même suffixe. `rendre` cherche sa sortie en balayant le dossier de
// travail pour un `.wav` ; une reprise et une retouche y déposent un audio source. Posés côte à
// côte, le premier nom par ordre alphabétique gagne — et le nœud rendrait son entrée inchangée,
// ce qui ressemble trait pour trait à un modèle qui n'a rien fait. Le remède est structurel : les
// entrées vont dans un sous-dossier, que le filtre ne peut pas retenir.
//
// CE QUI EST ÉPROUVÉ ICI EST LA PROPRIÉTÉ, pas l'ordre des noms : quoi qu'on dépose en entrée,
// la recherche ne doit jamais le rendre.
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { sortieAudio, drapeauxAudio } =
  createRequire(import.meta.url)("./acestep.cjs") as {
    sortieAudio: (dossier: string) => string | null;
    drapeauxAudio: (options: Record<string, unknown>, travail: string) => string[];
  };

const temporaires: string[] = [];

function travailNeuf() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "attic-acestep-test-"));
  temporaires.push(d);
  return d;
}

afterEach(() => {
  while (temporaires.length > 0) {
    try { fs.rmSync(temporaires.pop()!, { recursive: true, force: true }); } catch { /* sans conséquence */ }
  }
});

const OCTETS = new Uint8Array([82, 73, 70, 70]);

describe("l'audio reçu et l'audio rendu", () => {
  it("écrit les deux audio dans un sous-dossier, et rend leurs drapeaux", () => {
    const travail = travailNeuf();
    const args = drapeauxAudio({ audioSource: OCTETS, audioTimbre: OCTETS }, travail);
    expect(args).toHaveLength(4);
    expect(args[0]).toBe("--src-audio");
    expect(args[2]).toBe("--ref-audio");
    for (const chemin of [args[1], args[3]]) {
      expect(fs.existsSync(chemin)).toBe(true);
      expect(path.dirname(chemin)).not.toBe(travail);
      expect(path.dirname(path.dirname(chemin))).toBe(travail);
    }
  });

  it("ne rend rien quand aucun audio n'est reçu, et ne crée pas de sous-dossier", () => {
    const travail = travailNeuf();
    expect(drapeauxAudio({}, travail)).toEqual([]);
    expect(fs.readdirSync(travail)).toEqual([]);
  });

  it("ne fait apparaître AUCUNE sortie en écrivant les audio reçus", () => {
    // LE CAS DÉCISIF, et il passe par le vrai chemin d'écriture plutôt que de le refaire à la
    // main : avant que le moteur ait tourné, il n'y a rien à rendre, et cela doit rester vrai
    // quels que soient les noms choisis pour les entrées.
    for (const options of [{ audioSource: OCTETS }, { audioTimbre: OCTETS }, { audioSource: OCTETS, audioTimbre: OCTETS }]) {
      const travail = travailNeuf();
      drapeauxAudio(options, travail);
      expect(sortieAudio(travail), `entrées ${Object.keys(options).join("+")}`).toBeNull();
    }
  });

  it("ne prend JAMAIS pour la sortie un audio déposé dans le sous-dossier, quel que soit son nom", () => {
    // Des noms qui passent avant n'importe quel rendu par ordre alphabétique : à plat dans le
    // dossier de travail, chacun d'eux l'emporterait sur le fichier du moteur.
    for (const nom of ["aaa.wav", "0.wav", "!.mp3"]) {
      const travail = travailNeuf();
      const entrees = path.join(travail, "entrees");
      fs.mkdirSync(entrees);
      fs.writeFileSync(path.join(entrees, nom), Buffer.from(OCTETS));
      fs.writeFileSync(path.join(travail, "plan00.wav"), Buffer.from(OCTETS));
      expect(sortieAudio(travail), `entrée nommée ${nom}`).toBe(path.join(travail, "plan00.wav"));
    }
  });

  it("rend le fichier du moteur quand il est là, malgré un audio reçu avant lui", () => {
    const travail = travailNeuf();
    const args = drapeauxAudio({ audioSource: OCTETS }, travail);
    expect(args).toHaveLength(2);
    fs.writeFileSync(path.join(travail, "plan00.wav"), Buffer.from(OCTETS));
    expect(sortieAudio(travail)).toBe(path.join(travail, "plan00.wav"));
  });

  it("rend néant sur un dossier sans aucun audio", () => {
    const travail = travailNeuf();
    fs.writeFileSync(path.join(travail, "plan0.json"), "{}");
    expect(sortieAudio(travail)).toBeNull();
  });
});
