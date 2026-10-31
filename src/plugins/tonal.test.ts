// plugins/tonal.test.ts — Vérification rapide des nœuds de théorie musicale.
import { describe, it, expect, vi } from "vitest";
import { fiches } from "./tonal";
import * as accords from "../audio/accords";
import { ctxDEssai } from "../core/contexte-essai";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxSimple(valeur: string | null) {
  return ctxDEssai([valeur]);
}

const SR = 44100;

function gammeC(dureeS: number): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
  const segment = Math.floor(n / notes.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.floor(i / segment), notes.length - 1);
    d[i] = 0.5 * Math.sin((2 * Math.PI * notes[idx] * i) / SR);
  }
  return b;
}

describe("nœuds Tonal", () => {
  it("les 6 fiches sont enregistrées", () => {
    expect(trouver("tonal-accord")).toBeDefined();
    expect(trouver("tonal-gamme")).toBeDefined();
    expect(trouver("tonal-transposer")).toBeDefined();
    expect(trouver("tonal-progression")).toBeDefined();
    expect(trouver("tonal-grille")).toBeDefined();
    expect(trouver("tonal-analyse")).toBeDefined();
    // Rangé avec les autres analyses, et non dans « Traitement » : il décrit le son sans le modifier.
    expect(trouver("tonal-analyse")).toMatchObject({ univers: "Visualisation", famille: "Analyse" });
  });

  it("tonal-accord détecte C E G", async () => {
    const f = trouver("tonal-accord")!;
    const res = await f.executer(ctxSimple("C E G") as any);
    expect(res.valeurs[0]).toBe("C major");
  });

  it("tonal-gamme retourne C major", async () => {
    const f = trouver("tonal-gamme")!;
    const res = await f.executer(ctxSimple("C") as any);
    expect(res.valeurs[0]).toBe("C D E F G A B");
  });

  it("tonal-transposer monte C4 d'un ton", async () => {
    const f = trouver("tonal-transposer")!;
    const res = await f.executer(ctxSimple("C4") as any);
    expect(res.valeurs[0]).toBe("D4");
  });

  it("tonal-progression génère I V vi IV en C", async () => {
    const f = trouver("tonal-progression")!;
    const res = await f.executer(ctxSimple("C") as any);
    // « vi » est le relatif MINEUR : Am, et non A. Cette attente valait
    // auparavant "C G A F" — elle codifiait en réalité un bug, que son
    // commentaire d'origine présentait comme une limite acceptable de Tonal.
    // Tonal LIT bien la casse (`RomanNumeral.get("vi").major` vaut false) mais
    // ne la reporte pas sur le type d'accord, si bien que `fromRomanNumerals`
    // renvoyait une triade majeure. Corrigé par `normaliserRomains`
    // (audio/theorie-romains.ts).
    expect(res.valeurs[0]).toBe("C G Am F");
  });

  it("tonal-grille génère une notation texte-vers-midi", async () => {
    const f = trouver("tonal-grille")!;
    const res = await f.executer(ctxSimple(null) as any);
    const notation = res.valeurs[0] as string;
    expect(notation).toContain("TEMPO 120");
    expect(notation).toContain("C3+E3+G3 1");
    expect(notation).toContain("G3+B3+D4 1");
    expect(res.valeurs[1]).toBe("C G Am F");   // idem : vi = La mineur
  });

  it("tonal-grille accepte une progression en symboles", async () => {
    const f = trouver("tonal-grille")!;
    const ctx = ctxDEssai(["C Am F G"]);
    const res = await f.executer(ctx as any);
    const notation = res.valeurs[0] as string;
    expect(notation).toContain("C3+E3+G3 1");
    expect(notation).toContain("A3+C4+E4 1");
  });

  it("tonal-grille accepte des chiffres romains avec extension (7e, maj7...)", async () => {
    // Régression : le test de classification romains-vs-symboles ne testait
    // que si le 1er jeton était ENTIÈREMENT composé de I/V/i/v, donc "IMaj7"
    // (avec suffixe) tombait à tort en mode "symboles bruts" — "I" n'étant
    // pas une note valide, Chord.get() ne trouvait aucune note et l'accord
    // disparaissait silencieusement de la notation, sans erreur.
    const f = trouver("tonal-grille")!;
    const ctx = ctxDEssai([], { Progression: "IMaj7 IV7 V7 vi7" });
    const res = await f.executer(ctx as any);
    const notation = res.valeurs[0] as string;
    expect(notation).toContain("C3+E3+G3+B3 1");
    expect(notation).toContain("F3+A3+C4+Eb4 1");
    expect(notation).toContain("G3+B3+D4+F4 1");
    expect(res.valeurs[1]).toBe("CMaj7 F7 G7 A7");
  });

  it("tonal-analyse détecte une tonalité C major", async () => {
    const f = trouver("tonal-analyse")!;
    const ctx = {
      entree: () => gammeC(2),
      paramTexte: () => "Pop",
      paramNombre: () => 0,
    };
    const res = await f.executer(ctx as any);
    expect(res.valeurs[0]).toContain("C major");
    expect(res.valeurs[1]).toBe("I V vi IV");
    expect(typeof res.valeurs[2]).toBe("string");
  });

  it("tonal-analyse retourne une erreur si aucun audio n'est connecté", async () => {
    const f = trouver("tonal-analyse")!;
    const ctx = { entree: () => null, paramTexte: () => "Pop", paramNombre: () => 0 };
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
  });

  it("tonal-analyse adapte les styles Jazz et Blues au mode mineur détecté", async () => {
    // Avant cette session, Jazz et Blues renvoyaient toujours "ii V I" et la
    // grille de blues majeure, quel que soit le mode réellement détecté —
    // un morceau en mineur recevait une suggestion en accords majeurs.
    const spy = vi.spyOn(accords, "estimerTonalite").mockReturnValue({
      nom: "A minor", type: "minor", confiance: 0.9,
    });
    try {
      const f = trouver("tonal-analyse")!;
      const ctxJazz = { entree: () => gammeC(0.1), paramTexte: () => "Jazz", paramNombre: () => 0 };
      const resJazz = await f.executer(ctxJazz as any);
      expect(resJazz.valeurs[1]).toBe("ii V i");

      const ctxBlues = { entree: () => gammeC(0.1), paramTexte: () => "Blues", paramNombre: () => 0 };
      const resBlues = await f.executer(ctxBlues as any);
      expect(resBlues.valeurs[1]).toBe("i i i i iv iv i i v iv i v");
    } finally {
      spy.mockRestore();
    }
  });

  // ── Un échec se dit dans le STATUT, et non dans la valeur ──
  //
  // LES TROIS DÉFAUTS QUE CES CAS ARRÊTENT, MESURÉS DANS L'APPLICATION sur un même texte étranger,
  // celui que « Texte → MIDI » lit : « Tempo 90 » puis « C4+E4+G4 2.000 ». Les trois nœuds
  // annonçaient « Terminé ». L'accord émettait la chaîne « Accord inconnu » SUR SA SORTIE, écrite en
  // dur et donc jamais traduite ; la progression rendait un « m » et des espaces ; et la grille
  // annonçait « 4 accords » en n'en écrivant aucun, son compte venant de l'entrée et non de ce
  // qu'elle avait écrit.

  const ETRANGER = "Tempo 90\nC4+E4+G4 2.000";

  it("L'ACCORD REFUSE DES NOTES DONT AUCUN ACCORD NE SORT, au lieu d'émettre « Accord inconnu »", async () => {
    const f = trouver("tonal-accord")!;
    const res = await f.executer(ctxSimple(ETRANGER) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBe(null);
    expect(res.message, "les notes reçues doivent être nommées").toContain("Tempo");
    expect(res.message, "et la forme attendue aussi").toContain("C E G");
  });

  it("et il nomme toujours l'accord quand il en trouve un", async () => {
    const f = trouver("tonal-accord")!;
    const res = await f.executer(ctxSimple("C E G") as any);
    expect(res.erreur).toBeFalsy();
    expect(res.valeurs[0]).toContain("major");
  });

  it("LA PROGRESSION REFUSE UNE TONIQUE ILLISIBLE, au lieu de rendre des blancs", async () => {
    const f = trouver("tonal-progression")!;
    const res = await f.executer(ctxSimple(ETRANGER) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBe(null);
    expect(res.message).toContain("Tempo");
  });

  it("et elle développe toujours ses degrés sur une tonique lisible", async () => {
    const f = trouver("tonal-progression")!;
    const res = await f.executer(ctxSimple("C") as any);
    expect(res.erreur).toBeFalsy();
    expect(res.valeurs[0]).toBe("C G Am F");
  });

  it("UN LIBELLÉ COMPLET EST LU, et ne rend plus des blancs", async () => {
    // LE SECOND DÉFAUT, TROUVÉ PAR LE TÉMOIN POSITIF après la réparation du premier. « A minor » est
    // parfaitement lisible, et le nœud rendait pourtant « m » entouré d'espaces : la chaîne ENTIÈRE
    // partait vers Tonal, qui attend une note SEULE. `toniqueDepuisTonalite` existe pour cela, et sa
    // propre documentation décrit ce défaut mot pour mot ; ce nœud ne l'appelait pas.
    const f = trouver("tonal-progression")!;
    const res = await f.executer(ctxSimple("A minor") as any);
    expect(res.erreur).toBeFalsy();
    const sortie = String(res.valeurs[0]);
    expect(sortie.trim().length, "la sortie ne doit pas être des blancs").toBeGreaterThan(3);
    expect(sortie.split(" ").length, "un accord par degré").toBe(4);
    expect(sortie.startsWith("A"), sortie).toBe(true);
  });

  it("LA GRILLE REFUSE UN SYMBOLE INCONNU, au lieu d'en annoncer quatre et de n'en écrire aucun", async () => {
    const f = trouver("tonal-grille")!;
    const res = await f.executer(ctxSimple(ETRANGER) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("Tempo");
    expect(res.message).toContain("C Am F G");
  });

  it("et sa notation porte autant d'accords que son message en annonce", async () => {
    // LE COMPTE VENAIT DE L'ENTRÉE : ce cas le confronte à ce qui a été ÉCRIT.
    const f = trouver("tonal-grille")!;
    const res = await f.executer(ctxSimple("C Am F G") as any);
    expect(res.erreur).toBeFalsy();
    const lignes = String(res.valeurs[0]).split("\n");
    expect(lignes[0]).toMatch(/^TEMPO /);
    expect(lignes.length - 1, "une ligne par accord, en plus de l'en-tête").toBe(4);
    expect(res.message).toContain("4");
  });
});
