// audio/abc-metrique-symbole.test.ts — Une partition écrite en `M:C` ou `M:C|` se reprend et
// s'édite comme la même écrite `M:4/4` ou `M:2/2`, et garde son symbole.
//
// LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER. `midiVersAbc` lisait la métrique demandée par une
// expression en « n/d » ; « C » et « C| » n'y entraient pas, et le champ M: écrit retombait sur la
// métrique du fichier MIDI, « 4/4 » ou « 2/2 ». « Reprise ABC » et « Édition ABC par LLM » relisent
// ce qu'ils écrivent et comparent sa métrique à celle de l'original : ils refusaient tout air en
// `M:C` ou `M:C|`, quel que soit le style, par « métrique 4/4 au lieu de C ». Relevé le 2026-11-14,
// sur les six styles de « Reprise ABC ».
import { describe, it, expect } from "vitest";
import { lireMorceau, morceauVersMidi } from "./abc";
import { midiVersAbc } from "./midi-vers-abc";
import { reprendreAbc, STYLES } from "./abc-reprise";
import { editerAbc, type AppelLlm } from "./abc-edition-llm";

const air = (m: string) => `X:1\nT:Essai\nM:${m}\nL:1/8\nQ:1/4=100\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`;
/** Le symbole, et la métrique en chiffres qu'il désigne. */
const PAIRES = [["C", "4/4"], ["C|", "2/2"]] as const;
const ligneM = (abc: string) => abc.split("\n").find((l) => l.startsWith("M:"));
const sansM = (abc: string) => abc.split("\n").filter((l) => !l.startsWith("M:")).join("\n");

describe("midiVersAbc écrit la métrique demandée telle qu'elle a été lue", () => {
  it.each(PAIRES)("« %s » s'écrit tel quel, et le reste comme en %s", (symbole, chiffres) => {
    const { octets } = morceauVersMidi(lireMorceau(air(chiffres)), { tempoParDefaut: 100, instrumentVoix: 0, instrumentAccords: 0, jouerAccords: false });
    const o = { tonalite: "G", grille: "auto" as const, titre: "Essai" };
    const avecSymbole = midiVersAbc(octets, { ...o, metrique: symbole });
    const enChiffres = midiVersAbc(octets, { ...o, metrique: chiffres });
    expect(ligneM(avecSymbole.abc)).toBe(`M:${symbole}`);
    expect(avecSymbole.metrique).toBe(symbole);
    expect(ligneM(enChiffres.abc)).toBe(`M:${chiffres}`);
    expect(sansM(avecSymbole.abc)).toBe(sansM(enChiffres.abc));
  });
});

describe("« Reprise ABC » reprend un air en M:C ou M:C| comme le même en chiffres", () => {
  it.each(PAIRES)("en « %s », chaque style rend le fichier MIDI de %s, et l'ABC garde le symbole", (symbole, chiffres) => {
    let joues = 0;
    for (const style of STYLES) {
      const o = { style, tempo: 0, instrumentMelodie: 73, instrumentAccompagnement: 0, instrumentBasse: 33 };
      const s = reprendreAbc(air(symbole), o), c = reprendreAbc(air(chiffres), o);
      expect(s.ok, `${style} en ${symbole} : ${s.erreur}`).toBe(c.ok);
      if (!c.ok) continue;
      joues++;
      expect(Buffer.from(s.midi!).equals(Buffer.from(c.midi!)), `${style} : même fichier MIDI`).toBe(true);
      expect(ligneM(s.abc!)).toBe(`M:${symbole}`);
      expect(sansM(s.abc!)).toBe(sansM(c.abc!));
    }
    // Le dénominateur : tous les styles jouent une mesure de quatre noires, sauf deux au plus,
    // bornés à une autre carrure.
    expect(joues).toBeGreaterThanOrEqual(STYLES.length - 2);
  });
});

describe("« Édition ABC par LLM » édite un air en M:C ou M:C| comme le même en chiffres", () => {
  // Un modèle simulé, qui rend quatre mesures d'accords différents de ceux de l'original.
  const appel: AppelLlm = async () => ({ reponse: JSON.stringify({ bars: [["Em"], ["Am", "D"], ["Em"], ["C", "D"]] }) });
  const o = { operation: "reharmoniser" as const, consigne: "x", essais: 1, tonaliteCible: "garder" };

  it.each(PAIRES)("en « %s », la réharmonisation passe comme en %s, et garde le symbole", async (symbole, chiffres) => {
    const c = await editerAbc(air(chiffres), o, appel);
    const s = await editerAbc(air(symbole), o, appel);
    expect(c.ok, c.erreur ?? "").toBe(true);
    expect(s.ok, s.erreur ?? "").toBe(true);
    expect(ligneM(s.abc!)).toBe(`M:${symbole}`);
    expect(sansM(s.abc!)).toBe(sansM(c.abc!));
  });
});
