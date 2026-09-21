// parcours/fiche-son.test.ts — Ce qu'une fiche technique doit dire, et ce qu'elle doit taire.
//
// LE TEST QUI COMPTE EST CELUI DU MONO. Une fiche qui annoncerait « corrélation 1,000 · équilibre
// 0,00 dB » sur un son à un seul canal donnerait deux chiffres exacts et trompeurs : ils ne
// mesurent rien, ils répètent qu'il n'y a qu'un canal. Un lecteur y verrait un mixage
// parfaitement centré. La rubrique doit donc disparaître, et c'est vérifié ici.
//
// LE SECOND : LE VERDICT DE CONFORMITÉ PASSE PAR L'EXAMINATEUR DU PARCOURS. Si la fiche calculait
// sa propre conformité, elle finirait par déclarer conforme un son qu'une épreuve refuserait, à un
// dixième de décibel près — et c'est exactement l'écart qui fait douter d'un outil de mesure. Le
// test compare donc les deux chemins sur le même son.
import { describe, expect, it } from "vitest";
import { CIBLES_DIFFUSION, cibleDiffusion, conformite, ficheSon, resumeSon } from "./fiche-son";
import { jugerCibles, type MesureCopie } from "./mesures";

/** Une mesure d'essai : stéréo, à la cible de diffusion, un la juste. */
const MESURE: MesureCopie = {
  dureeSec: 12.5, canaux: 2,
  lufs: -14.2, vraiPicDb: -1.3, creteDb: -1.5, facteurCreteDb: 11.4, plageDynamiqueDb: 8.2,
  correlation: 0.31, equilibreDb: 0.4,
  partGravePc: 22.7, partAiguPc: 9.3,
  hauteurHz: 440.2, justesseCents: 0.8, partVoiseePc: 87.5, ecartCents: 0.8, noteProche: "A4",
};

const mono = (extra: Partial<MesureCopie> = {}): MesureCopie =>
  ({ ...MESURE, canaux: 1, correlation: 1, equilibreDb: 0, ...extra });

describe("la fiche technique", () => {
  const fr = ficheSon(MESURE, false);
  const en = ficheSon(MESURE, true);

  it("porte les cinq rubriques et les mesures qu'on vient chercher", () => {
    for (const mot of ["Durée", "Niveau", "Spectre", "Stéréo", "Hauteur"]) expect(fr).toContain(mot);
    expect(fr).toContain("−14,2 LUFS");
    expect(fr).toContain("−1,3 dBTP");
    expect(fr).toContain("11,4 dB");
    expect(fr).toContain("22,7 %");
    expect(fr).toContain("440,2 Hz (A4)");
  });

  it("écrit les nombres à la française d'un côté, à l'anglaise de l'autre", () => {
    expect(fr).toContain("−14,2");
    expect(en).toContain("-14.2");
    expect(en).toContain("SOUND SPEC SHEET");
  });

  it("SUR UN MONO, LA RUBRIQUE STÉRÉO DISPARAÎT au lieu d'annoncer une corrélation de un", () => {
    const seul = ficheSon(mono(), false);
    expect(seul).toContain("1 (mono)");
    expect(seul).not.toContain("Corrélation");
    expect(seul).not.toContain("Équilibre");
    expect(ficheSon(MESURE, false)).toContain("Corrélation");
  });

  it("l'équilibre dit de quel côté il penche, ce qui est la seule chose utile", () => {
    expect(ficheSon({ ...MESURE, equilibreDb: 1.2 }, false)).toContain("+1,2 dB (gauche)");
    expect(ficheSon({ ...MESURE, equilibreDb: -1.2 }, false)).toContain("−1,2 dB (droite)");
  });

  it("UN ÉCART NUL N'A PAS DE CÔTÉ : « 0 dB (gauche) » se lisait comme un déséquilibre", () => {
    expect(ficheSon({ ...MESURE, equilibreDb: 0 }, false)).toContain("0 dB (centré)");
    expect(ficheSon({ ...MESURE, equilibreDb: 0 }, true)).toContain("0 dB (centred)");
  });

  it("LA CORRÉLATION EST DITE DANS LES MOTS DU GONIOMÈTRE, et par son classement", () => {
    expect(ficheSon({ ...MESURE, correlation: 0.99 }, false)).toContain("mono ou presque");
    expect(ficheSon({ ...MESURE, correlation: 0.7 }, false)).toContain("stéréo étroite");
    expect(ficheSon({ ...MESURE, correlation: 0.2 }, false)).toContain("stéréo large");
    expect(ficheSon({ ...MESURE, correlation: -0.8 }, false)).toContain("opposition de phase");
    expect(ficheSon({ ...MESURE, correlation: -0.8 }, true)).toContain("out of phase");
  });

  it("l'écart de justesse est SIGNÉ : il dit dans quel sens corriger", () => {
    expect(ficheSon({ ...MESURE, ecartCents: 12 }, false)).toContain("+12 cents");
    expect(ficheSon({ ...MESURE, ecartCents: -12 }, false)).toContain("−12 cents");
  });

  it("SANS HAUTEUR TENUE, elle le dit en un mot plutôt que d'aligner des cents sur du bruit", () => {
    const bruit = ficheSon({ ...MESURE, hauteurHz: 0, ecartCents: Number.NaN, noteProche: "", partVoiseePc: 0 }, false);
    expect(bruit).toContain("aucune hauteur tenue");
    expect(bruit).not.toContain("cents");
    expect(bruit).not.toContain("NaN");
  });

  it("la hauteur débranchée retire la rubrique entière, et non seulement sa valeur", () => {
    const sans = ficheSon(MESURE, false, "aucune", false);
    expect(sans).not.toContain("Hauteur");
    expect(sans).not.toContain("Trames tenues");
    expect(sans).toContain("Niveau");
  });

  it("LA PLAGE DE SONIE PORTE SA RÉSERVE : sans elle, cent décibels passeraient pour une mesure", () => {
    expect(fr).toContain("silences compris");
    expect(en).toContain("silence included");
  });

  it("aucune valeur ne sort en NaN, quelle que soit la mesure", () => {
    const vide: MesureCopie = {
      dureeSec: 0, canaux: 0, lufs: -Infinity, vraiPicDb: -Infinity, creteDb: -Infinity,
      facteurCreteDb: 0, plageDynamiqueDb: 0, correlation: 1, equilibreDb: 0,
      partGravePc: 0, partAiguPc: 0, hauteurHz: 0, justesseCents: Number.NaN,
      partVoiseePc: 0, ecartCents: Number.NaN, noteProche: "",
    };
    expect(ficheSon(vide, false)).not.toContain("NaN");
  });
});

describe("les cibles de diffusion", () => {
  it("portent les valeurs des usages, et un plafond de vrai pic commun", () => {
    expect(CIBLES_DIFFUSION.map((c) => c.id)).toEqual(["aucune", "streaming", "balado", "ebu"]);
    for (const c of CIBLES_DIFFUSION.slice(1)) {
      expect(c.cibles.some((x) => x.grandeur === "vraiPic" && x.max === -1), c.id).toBe(true);
      expect(c.cibles.some((x) => x.grandeur === "lufs"), c.id).toBe(true);
    }
    expect(cibleDiffusion("ebu").cibles[0].min).toBe(-23.5);
  });

  it("une cible inconnue ne fait pas lever : elle n'exige rien", () => {
    expect(cibleDiffusion("n'importe quoi").id).toBe("aucune");
    expect(conformite(MESURE, "n'importe quoi")).toEqual([]);
    expect(ficheSon(MESURE, false, "n'importe quoi")).not.toContain("Cible");
  });

  it("LE VERDICT EST CELUI DE L'EXAMINATEUR, et non un second calcul", () => {
    for (const c of CIBLES_DIFFUSION) {
      expect(conformite(MESURE, c.id)).toEqual(jugerCibles(c.cibles, MESURE));
    }
  });

  it("dit conforme quand ça l'est, et ne le dit pas quand ça ne l'est pas", () => {
    expect(ficheSon(MESURE, false, "streaming")).toContain("Conforme.");
    expect(ficheSon({ ...MESURE, lufs: -22 }, false, "streaming")).toContain("Pas encore conforme.");
    expect(ficheSon({ ...MESURE, lufs: -23.2 }, false, "ebu")).toContain("Conforme.");
  });

  it("le verdict porte le chiffre mesuré, comme dans les épreuves", () => {
    expect(ficheSon({ ...MESURE, lufs: -22 }, false, "streaming")).toContain("mesuré : −22 LUFS");
  });
});

describe("le résumé d'une ligne", () => {
  it("tient les quatre chiffres qu'on lit en premier", () => {
    const r = resumeSon(MESURE, false);
    expect(r).toContain("12,5 s");
    expect(r).toContain("stéréo");
    expect(r).toContain("−14,2 LUFS");
    expect(r).toContain("440,2 Hz (A4)");
  });

  it("ne parle pas de corrélation sur un mono, ni de hauteur sur du bruit", () => {
    expect(resumeSon(mono(), false)).toContain("mono");
    expect(resumeSon(mono(), false)).not.toContain("r ");
    expect(resumeSon({ ...MESURE, hauteurHz: 0 }, false)).not.toContain("Hz (");
  });

  it("annonce la conformité en un mot, et le décompte sinon", () => {
    expect(resumeSon(MESURE, false, "streaming")).toContain("conforme");
    expect(resumeSon({ ...MESURE, lufs: -30 }, false, "streaming")).toContain("1/2 tenues");
  });
});
