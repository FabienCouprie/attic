// audio/soundhelix-activite.test.ts — La matrice d'activité écrite en texte rend, tic pour tic, les
// segments que SoundHelix a tirés.
//
// NIVEAU 1, À ENTRÉES ÉGALES. Le programme tire la matrice section par section, puis déplace les
// entrées et les sorties de chaque voix de ses décalages, en tics. Chaque voix des huit témoins est
// réécrite ici en texte, un signe par section lu au milieu de la section, ses décalages pris dans
// l'XML d'essai ; relue, elle doit rendre les segments du relevé à l'identique.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMOINS } from "../../scripts/temoins-soundhelix.mjs";
import {
  FauteActivite, ecrireActivite, joueAuTic, lireActivite, longueurIntervalle, segmentsDeVoix,
} from "./soundhelix-activite";
import { lireReleveSoundHelix } from "./temoins-soundhelix";

const DOSSIER = join(process.cwd(), "src", "audio", "temoins-soundhelix");

/** Les décalages d'une voix, lus dans la déclaration de son vecteur d'activité. */
function decalages(xml: string, voix: string) {
  const bloc = new RegExp(`<activityVector name="${voix}">([\\s\\S]*?)</activityVector>`).exec(xml)?.[1] ?? "";
  return {
    debut: Number(/<startShift>(-?\d+)<\/startShift>/.exec(bloc)?.[1] ?? 0),
    fin: Number(/<stopShift>(-?\d+)<\/stopShift>/.exec(bloc)?.[1] ?? 0),
  };
}

describe("la matrice d'activité, à entrées égales avec SoundHelix", () => {
  it.each(TEMOINS.map((t) => [t.base, t.essai]))("%s : chaque voix réécrite rend ses segments", (base, essai) => {
    const r = lireReleveSoundHelix(readFileSync(join(DOSSIER, `${base}.txt`), "utf8"));
    const xml = readFileSync(join(DOSSIER, essai), "utf8");
    const voix = [...r.voix.keys()].map((nom) => {
      const segments = r.voix.get(nom)!;
      const sections = r.sections.map((debut, k) => joueAuTic(segments, Math.floor((debut + (r.sections[k + 1] ?? r.tics)) / 2)));
      return { nom, sections, ...decalages(xml, nom) };
    });
    const relues = lireActivite(ecrireActivite(voix));
    expect(relues).toEqual(voix);
    for (const v of relues) expect(segmentsDeVoix(v, r.sections, r.tics), `${base}, ${v.nom}`).toEqual(r.voix.get(v.nom));
  });
});

describe("le texte de la matrice", () => {
  it("lit les signes, les espaces, les commentaires et les décalages", () => {
    expect(lireActivite("# deux voix\nbasse  xx..  debut=-2\nnappe x . x x fin=3")).toEqual([
      { nom: "basse", sections: [true, true, false, false], debut: -2, fin: 0 },
      { nom: "nappe", sections: [true, false, true, true], debut: 0, fin: 3 },
    ]);
  });

  it("refuse ce qu'il ne sait pas lire, et une voix écrite deux fois", () => {
    expect(() => lireActivite("basse xx?x")).toThrow(FauteActivite);
    expect(() => lireActivite("basse xx\nbasse ..")).toThrow(/deux fois/);
  });

  it("refuse une voix qui n'a pas autant de sections que l'harmonie", () => {
    expect(() => segmentsDeVoix({ nom: "a", sections: [true], debut: 0, fin: 0 }, [0, 16], 32)).toThrow(/2/);
  });

  it("déplace une entrée et une sortie, sans sortir du morceau", () => {
    const v = { nom: "a", sections: [true, false, true, true], debut: -2, fin: 3 };
    // Sections de 16 tics : joue 0-16, se tait 16-32, joue 32-64. La sortie à 16 passe à 19, l'entrée
    // à 32 passe à 30 ; l'entrée à 0 et la sortie à 64 butent sur les bords du morceau.
    expect(segmentsDeVoix(v, [0, 16, 32, 48], 64)).toEqual([19, -11, 34]);
    expect(longueurIntervalle([19, -11, 34], 20)).toBe(10);
  });

  it("déplace aussi l'entrée du début et la sortie de la fin, vers l'intérieur du morceau", () => {
    const v = { nom: "a", sections: [true, true], debut: 3, fin: -4 };
    expect(segmentsDeVoix(v, [0, 16], 32)).toEqual([-3, 25, -4]);
  });
});
