// plugins/parole-vers-sequence.test.ts — La mise en notes de la parole, et ce qu'elle a de délicat.
//
// DEUX PARTS, ET ELLES NE SE TESTENT PAS DE LA MÊME FAÇON.
//
//   LE CALCUL DE LA NOTE se teste sur des suivis de hauteur ÉCRITS À LA MAIN. Une médiane, un
//   seuil de confiance, un empan, une gamme, une transposition : ce sont des décisions exactes, et
//   les éprouver sur un vrai suivi de hauteur ferait dépendre l'assertion du détecteur plutôt que
//   de la décision. Les trames sont donc posées une à une, et chaque cas tient une décision.
//
//   LA PRISE se teste de bout en bout, avec le vrai suiveur de hauteur sur un signal fabriqué, et
//   un double du moteur de reconnaissance. `vosk-browser` est un paquet UMD qui porte son
//   WebAssembly à l'intérieur, pose un global et lance son propre worker : rien de cela ne tourne
//   sous Node, et ce n'est pas lui qui est la prise.
//
// Le polyfill complet, et non le seul `AudioBuffer` : le rééchantillonnage vers seize kilohertz
// passe par un `OfflineAudioContext`.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SuiviHauteur } from "../audio/hauteur";
import type { MotVosk } from "./vosk-asr";

/**
 * Ce que le double du moteur a vu, et ce qu'il répond.
 *
 * `vi.hoisted` parce que `vi.mock` remonte au-dessus des imports : l'objet doit exister avant que
 * la fabrique du double ne soit évaluée.
 */
const espion = vi.hoisted(() => ({
  fichiers: [] as string[],
  grammaires: [] as (string[] | undefined)[],
  longueurs: [] as number[],
  reponse: { texte: "", mots: [] as { word: string; start: number; end: number; conf: number }[] },
}));

vi.mock("./vosk-asr", async (original) => {
  const vrai = await original<typeof import("./vosk-asr")>();
  return {
    ...vrai,
    chargerModele: async (fichier: string) => { espion.fichiers.push(fichier); return {} as never; },
    transcrire: async (_m: never, s: Float32Array, o?: { grammaire?: string[] }) => {
      espion.grammaires.push(o?.grammaire);
      espion.longueurs.push(s.length);
      return espion.reponse;
    },
  };
});

const {
  PAROLE, fiches, hauteurDuMot, niveauDuMot, nuanceDuNiveau, sequenceParlee, suiviDeParole,
  tableauDeSequence,
} = await import("./parole-vers-sequence");
const { degresDeGamme } = await import("../audio/gammes");
const { FREQUENCE_VOSK, MODELES } = await import("./vosk-asr");

const fiche = () => {
  const f = fiches.find((x) => x.id === "parole-vers-sequence");
  if (!f) throw new Error("fiche parole-vers-sequence introuvable");
  return f;
};

const mot = (word: string, start: number, end: number): MotVosk => ({ word, start, end, conf: 1 });

/** Un suivi écrit à la main : une hauteur et une confiance par trame, à cent trames la seconde. */
function suivi(trames: [hertz: number, confiance: number][], cadence = 100): SuiviHauteur {
  return {
    hauteurs: Float32Array.from(trames, (t) => t[0]),
    confiances: Float32Array.from(trames, (t) => t[1]),
    cadence,
  };
}

/** `n` trames à la même hauteur, toutes sûres. */
const tenue = (hertz: number, n: number): [number, number][] =>
  Array.from({ length: n }, () => [hertz, 0.9] as [number, number]);

const CHROMATIQUE = degresDeGamme("chromatique");

/** Une prise fabriquée : un segment par mot, et les mots qui vont avec. */
function prise(
  segments: { hz: number; duree: number; amplitude?: number }[], frequence = 16000,
): { buffer: AudioBuffer; mots: MotVosk[] } {
  const total = segments.reduce((s, x) => s + x.duree, 0);
  const buffer = new AudioBuffer({
    numberOfChannels: 1, length: Math.round(total * frequence), sampleRate: frequence,
  });
  const d = buffer.getChannelData(0);
  const mots: MotVosk[] = [];
  let t = 0;
  segments.forEach((s, i) => {
    const premier = Math.round(t * frequence);
    const dernier = Math.round((t + s.duree) * frequence);
    const a = s.amplitude ?? 0.5;
    for (let k = premier; k < dernier; k++) {
      d[k] = s.hz > 0 ? a * Math.sin((2 * Math.PI * s.hz * (k - premier)) / frequence) : 0;
    }
    mots.push(mot(`m${i}`, t, t + s.duree));
    t += s.duree;
  });
  return { buffer, mots };
}

function ctxDe(audio: AudioBuffer | null, reglages: Record<string, string | number> = {}) {
  const progres: string[] = [];
  return {
    ctx: {
      entree: () => audio,
      paramTexte: (n: string, d: string) => String(reglages[n] ?? d),
      paramNombre: (n: string, d: number) => Number(reglages[n] ?? d),
      onProgress: (t: string) => progres.push(t),
    } as never,
    progres,
  };
}

async function lancer(audio: AudioBuffer | null, reglages: Record<string, string | number> = {}) {
  const { ctx, progres } = ctxDe(audio, reglages);
  const r = await fiche().executer(ctx);
  return { ...r, progres };
}

describe("la hauteur d'un mot", () => {
  it("prend la MÉDIANE des trames voisées, qu'une trame fautive ne déplace pas", () => {
    // Une attaque de consonne ou une fin de voyelle qui se détimbre donne une trame très haute :
    // la moyenne de ces cinq trames vaut 260 Hz, soit une sixte au-dessus de la hauteur tenue.
    const s = suivi([[100, 0.9], [100, 0.9], [100, 0.9], [100, 0.9], [900, 0.9]]);
    expect(hauteurDuMot(mot("x", 0, 0.05), s)).toBe(100);
  });

  it("écarte les trames peu sûres, et ne garde que celles qui portent une note", () => {
    const s = suivi([[300, 0.1], [300, 0.2], [200, 0.9], [300, 0.3]]);
    expect(hauteurDuMot(mot("x", 0, 0.04), s)).toBe(200);
  });

  it("ne lit que l'empan du mot, ni la trame d'avant ni celle d'après", () => {
    const s = suivi([...tenue(400, 2), ...tenue(200, 3), ...tenue(300, 2)]);
    // Le mot occupe les trames 2, 3 et 4.
    expect(hauteurDuMot(mot("x", 0.02, 0.05), s)).toBe(200);
  });

  it("rend zéro quand aucune trame de l'empan n'est voisée, plutôt qu'une hauteur inventée", () => {
    const s = suivi([[180, 0], [175, 0], [170, 0.4]]);
    expect(hauteurDuMot(mot("x", 0, 0.03), s)).toBe(0);
  });

  it("rend zéro pour un empan posé au-delà du suivi", () => {
    expect(hauteurDuMot(mot("x", 5, 6), suivi(tenue(200, 10)))).toBe(0);
  });

  it("écarte une trame sûre mais de hauteur nulle", () => {
    const s = suivi([[0, 0.9], [0, 0.9], [220, 0.9]]);
    expect(hauteurDuMot(mot("x", 0, 0.03), s)).toBe(220);
  });
});

describe("le niveau et la nuance", () => {
  it("mesure le niveau sur l'empan du mot, et non sur toute la prise", () => {
    const { buffer } = prise([{ hz: 200, duree: 0.5, amplitude: 0.8 }, { hz: 200, duree: 0.5, amplitude: 0.1 }]);
    const mono = buffer.getChannelData(0);
    const fort = niveauDuMot(mot("a", 0, 0.5), mono, 16000);
    const faible = niveauDuMot(mot("b", 0.5, 1), mono, 16000);
    // Un sinus d'amplitude a a pour niveau efficace a sur racine de deux.
    expect(fort).toBeCloseTo(0.8 / Math.SQRT2, 2);
    expect(faible).toBeCloseTo(0.1 / Math.SQRT2, 2);
  });

  it("rend zéro pour un empan vide, sans diviser par zéro", () => {
    expect(niveauDuMot(mot("x", 1, 1), new Float32Array(100), 16000)).toBe(0);
  });

  it("donne la nuance pleine au mot le plus fort, et le plancher à vingt-quatre décibels sous lui", () => {
    expect(nuanceDuNiveau(0.5, 0.5)).toBe(127);
    expect(nuanceDuNiveau(0.5 * Math.pow(10, -24 / 20), 0.5)).toBe(40);
    // Plus bas encore, la nuance reste au plancher au lieu de passer sous zéro.
    expect(nuanceDuNiveau(0.5 * Math.pow(10, -48 / 20), 0.5)).toBe(40);
    // À mi-chemin de l'étendue, la nuance est à mi-chemin du plancher et du plafond.
    expect(nuanceDuNiveau(0.5 * Math.pow(10, -12 / 20), 0.5)).toBe(84);
  });

  it("rend une nuance moyenne plutôt que rien quand il n'y a pas de niveau à rapporter", () => {
    expect(nuanceDuNiveau(0, 0.5)).toBe(64);
    expect(nuanceDuNiveau(0.5, 0)).toBe(64);
  });

  it("LA NUANCE EST RELATIVE : baisser toute la prise de vingt décibels ne la change pas", () => {
    // Le niveau absolu d'un enregistrement ne dit rien de la parole : la même phrase dite près et
    // loin du micro doit donner la même séquence.
    const segments = [{ hz: 200, duree: 0.3, amplitude: 0.8 }, { hz: 200, duree: 0.3, amplitude: 0.2 }];
    const fort = prise(segments);
    const faible = prise(segments.map((s) => ({ ...s, amplitude: s.amplitude / 10 })));
    const s = suivi(tenue(200, 60));
    const a = sequenceParlee(fort.mots, s, fort.buffer.getChannelData(0), 16000, { degres: CHROMATIQUE, transposition: 0 });
    const b = sequenceParlee(faible.mots, s, faible.buffer.getChannelData(0), 16000, { degres: CHROMATIQUE, transposition: 0 });
    expect(a.notes.map((n) => n.velocite)).toEqual(b.notes.map((n) => n.velocite));
    // Et elles diffèrent bien entre elles : un rapport de quatre vaut douze décibels.
    expect(a.notes[0].velocite).toBeGreaterThan(a.notes[1].velocite + 20);
  });
});

describe("une note par mot", () => {
  const troisMots = [mot("un", 0, 0.1), mot("deux", 0.1, 0.2), mot("trois", 0.2, 0.3)];
  // Dix trames par mot : la première tenue, la deuxième muette, la troisième tenue plus haut.
  const troisSuivis = suivi([...tenue(220, 10), ...Array.from({ length: 10 }, () => [180, 0] as [number, number]), ...tenue(330, 10)]);

  it("pose une note sur chaque mot de hauteur mesurable, et nomme ceux qui n'en ont pas", () => {
    const r = sequenceParlee(troisMots, troisSuivis, new Float32Array(4800), 16000,
      { degres: CHROMATIQUE, transposition: 0 });
    expect(r.notes).toHaveLength(2);
    expect(r.muets).toEqual(["deux"]);
    // 220 Hz est le la de la troisième octave, 330 Hz le mi de la quatrième.
    expect(r.notes.map((n) => n.note)).toEqual([57, 64]);
  });

  it("reprend les instants du mot, et donne une durée minimale à un mot plus bref qu'une trame", () => {
    // Un mot de trois millisecondes porte tout de même une trame, donc une hauteur, donc une note ;
    // une note de trois millisecondes ne s'entendrait pas, et un fichier MIDI l'arrondirait à rien.
    const r = sequenceParlee([mot("a", 1.25, 1.6), mot("b", 2, 2.003)], suivi([...tenue(0, 125), ...tenue(220, 80)]),
      new Float32Array(48000), 16000, { degres: CHROMATIQUE, transposition: 0 });
    expect(r.notes[0].debut).toBeCloseTo(1.25, 6);
    expect(r.notes[0].fin).toBeCloseTo(1.6, 6);
    expect(r.notes[1].fin - r.notes[1].debut).toBeCloseTo(0.01, 6);
  });

  it("un mot de durée nulle n'a aucune trame, donc aucune note", () => {
    const r = sequenceParlee([mot("b", 1, 1)], suivi(tenue(220, 200)), new Float32Array(48000), 16000,
      { degres: CHROMATIQUE, transposition: 0 });
    expect(r.notes).toEqual([]);
    expect(r.muets).toEqual(["b"]);
  });

  it("ramène la note sur le degré le plus proche de la gamme", () => {
    // 233 Hz est le si bémol de la troisième octave, note 58, qui n'est pas dans le do majeur :
    // le degré le plus proche est le la, 57.
    const r = sequenceParlee([mot("x", 0, 0.1)], suivi(tenue(233, 10)), new Float32Array(1600), 16000,
      { degres: degresDeGamme("majeur"), transposition: 0 });
    expect(r.notes[0].note).toBe(57);
  });

  it("la tonique déplace les degrés permis", () => {
    const degres = (tonique: number) => degresDeGamme("majeur").map((d) => (d + tonique) % 12);
    const unMot = [mot("x", 0, 0.1)];
    const s = suivi(tenue(233, 10));
    const enDo = sequenceParlee(unMot, s, new Float32Array(1600), 16000, { degres: degres(0), transposition: 0 });
    const enSiBemol = sequenceParlee(unMot, s, new Float32Array(1600), 16000, { degres: degres(10), transposition: 0 });
    expect(enDo.notes[0].note).toBe(57);
    // Le si bémol est la tonique de sa propre gamme : la note ne bouge plus.
    expect(enSiBemol.notes[0].note).toBe(58);
  });

  it("LA TRANSPOSITION AGIT APRÈS LA GAMME, et peut donc sortir de ses degrés", () => {
    // L'ordre inverse aurait ramené la note transposée sur un degré, et la transposition d'un
    // demi-ton n'aurait rien fait du tout. Ici 233 Hz tombe sur le la en do majeur, puis descend
    // d'un demi-ton sur le la bémol, qui n'est pas dans la gamme.
    const r = sequenceParlee([mot("x", 0, 0.1)], suivi(tenue(233, 10)), new Float32Array(1600), 16000,
      { degres: degresDeGamme("majeur"), transposition: -1 });
    expect(r.notes[0].note).toBe(56);
    expect(degresDeGamme("majeur")).not.toContain(56 % 12);
  });

  it("borne la note au clavier MIDI plutôt que de perdre le mot", () => {
    const bas = sequenceParlee([mot("x", 0, 0.1)], suivi(tenue(220, 10)), new Float32Array(1600), 16000,
      { degres: CHROMATIQUE, transposition: -96 });
    const haut = sequenceParlee([mot("x", 0, 0.1)], suivi(tenue(220, 10)), new Float32Array(1600), 16000,
      { degres: CHROMATIQUE, transposition: 96 });
    expect(bas.notes[0].note).toBe(0);
    expect(haut.notes[0].note).toBe(127);
  });

  it("rend une séquence vide et tous les mots en muets quand rien n'est voisé", () => {
    const r = sequenceParlee(troisMots, suivi(Array.from({ length: 30 }, () => [200, 0] as [number, number])),
      new Float32Array(4800), 16000, { degres: CHROMATIQUE, transposition: 0 });
    expect(r.notes).toEqual([]);
    expect(r.muets).toEqual(["un", "deux", "trois"]);
  });
});

describe("le tableau des notes", () => {
  const mots = [mot("sol", 1.2, 1.45), mot("fa", 1.45, 1.7)];
  const s = suivi([...tenue(0, 120), ...tenue(392, 25), ...Array.from({ length: 25 }, () => [349, 0] as [number, number])]);
  const notes = sequenceParlee(mots, s, new Float32Array(32000), 16000,
    { degres: CHROMATIQUE, transposition: 0 }).notes;

  it("donne une ligne par mot, muets compris, avec son instant et sa durée", () => {
    const lignes = tableauDeSequence(mots, s, notes, false).split("\n");
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toContain("début");
    expect(lignes[1]).toContain("sol");
    expect(lignes[1]).toContain("1.20");
    expect(lignes[1]).toContain("0.25");
    expect(lignes[1]).toContain("67");
  });

  it("marque d'un tiret LES DEUX COLONNES du mot qui n'a pas reçu de note", () => {
    // LA COLONNE, ET NON LA LIGNE. Chercher un tiret dans la ligne entière laissait passer la perte
    // du tiret de la note, celui de la nuance suffisant à contenter l'assertion : planté, le défaut
    // ne faisait tomber aucun cas.
    const colonnes = (i: number) => tableauDeSequence(mots, s, notes, false).split("\n")[i].trim().split(/\s+/);
    expect(colonnes(2)[5]).toBe("fa");
    expect(colonnes(2)[3]).toBe("—");
    expect(colonnes(2)[4]).toBe("—");
    expect(colonnes(1)[3]).toBe("67");
    // Le signal de ce cas est muet : faute de niveau à rapporter, la nuance est la moyenne.
    expect(colonnes(1)[4]).toBe("64");
  });

  it("traduit son entête", () => {
    expect(tableauDeSequence(mots, s, notes, true)).toContain("start");
    expect(tableauDeSequence(mots, s, notes, true)).toContain("word");
    expect(tableauDeSequence(mots, s, notes, false)).toContain("nuance");
  });
});

describe("les réglages du suivi de parole", () => {
  it("relève la hauteur sur TOUTE la prise, d'un seul tenant", () => {
    // Le découpage mot par mot casse ce que pYIN apporte : le chemin est décodé sur tout le son.
    const { buffer } = prise([{ hz: 220, duree: 0.6 }, { hz: 330, duree: 0.6 }]);
    const s = suiviDeParole(buffer.getChannelData(0), 16000);
    expect(s.cadence).toBe(PAROLE.cadence);
    expect(s.hauteurs.length).toBeGreaterThanOrEqual(1.2 * PAROLE.cadence);
  });

  it("trouve les deux hauteurs d'une prise à deux voyelles", () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.6 }, { hz: 330, duree: 0.6 }]);
    const s = suiviDeParole(buffer.getChannelData(0), 16000);
    expect(hauteurDuMot(mots[0], s)).toBeCloseTo(220, 0);
    expect(hauteurDuMot(mots[1], s)).toBeCloseTo(330, 0);
  });

  it("NE REND JAMAIS UNE HAUTEUR HORS DE LA PLAGE DE LA VOIX, même sur un signal très aigu", () => {
    // Ce qui garantit la plage, c'est qu'elle est appliquée : un sifflement à mille hertz n'est pas
    // une voix qui parle, et la note qu'on en tirerait serait fausse de plusieurs octaves.
    //
    // LES BORNES SONT ÉCRITES EN CHIFFRES, et non lues dans `PAROLE` : une assertion qui lit la
    // constante qu'elle éprouve monte avec elle. Relevé en plantant le défaut, porter `fMax` à
    // 4000 ne faisait tomber aucun cas tant que la borne venait de `PAROLE.fMax`.
    const { buffer, mots } = prise([{ hz: 1000, duree: 0.6 }]);
    const h = hauteurDuMot(mots[0], suiviDeParole(buffer.getChannelData(0), 16000));
    expect(h).toBeLessThanOrEqual(400);
    expect(h === 0 || h >= 70).toBe(true);
    expect([PAROLE.fMin, PAROLE.fMax]).toEqual([70, 400]);
  });

  it("bascule d'état bien plus vite que le suiveur de hauteur, parce qu'une syllabe est brève", () => {
    // À la valeur par défaut du suiveur, la durée d'un état vaut cent trames, soit une seconde :
    // des syllabes entières ressortaient à confiance nulle, donc sans note.
    expect(PAROLE.pBascule).toBeGreaterThan(0.1);
  });
});

describe("la prise, de bout en bout", () => {
  it("rend le MIDI, le texte, le tableau puis l'audio, dans l'ordre déclaré", async () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.5 }, { hz: 330, duree: 0.5 }]);
    espion.reponse = { texte: "la mi", mots };
    const r = await lancer(buffer);
    expect(r.valeurs[0]).toBeInstanceOf(File);
    expect(r.valeurs[1]).toBe("la mi");
    expect(String(r.valeurs[2])).toContain("m0");
    expect(r.valeurs[3]).toBe(buffer);
  });

  it("compte dans son message les notes, les mots puis les muets", async () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.5 }, { hz: 0, duree: 0.5 }]);
    espion.reponse = { texte: "la rien", mots };
    const r = await lancer(buffer);
    expect(r.message).toContain("1 notes sur 2 mots · 1 sans hauteur");
  });

  it("choisit le fichier de modèle de la langue demandée", async () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.4 }]);
    espion.reponse = { texte: "a", mots };
    espion.fichiers.length = 0;
    await lancer(buffer, { Langue: "en" });
    await lancer(buffer, { Langue: "fr" });
    expect(espion.fichiers).toEqual([MODELES.en.fichier, MODELES.fr.fichier]);
  });

  it("passe le vocabulaire en grammaire, découpé sur les espaces et les virgules, en minuscules", async () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.4 }]);
    espion.reponse = { texte: "a", mots };
    espion.grammaires.length = 0;
    await lancer(buffer, { Vocabulaire: "Do, ré  MI" });
    await lancer(buffer, { Vocabulaire: "" });
    expect(espion.grammaires[0]).toEqual(["do", "ré", "mi"]);
    expect(espion.grammaires[1]).toEqual([]);
  });

  it("écrit le tempo demandé dans le fichier, qui en change", async () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.4 }]);
    espion.reponse = { texte: "a", mots };
    const lent = await lancer(buffer, { "Tempo du fichier MIDI": 60 });
    const vif = await lancer(buffer, { "Tempo du fichier MIDI": 180 });
    const octets = async (f: unknown) => [...new Uint8Array(await (f as File).arrayBuffer())];
    expect(await octets(lent.valeurs[0])).not.toEqual(await octets(vif.valeurs[0]));
  });

  it("la gamme et la transposition changent les notes écrites", async () => {
    const { buffer, mots } = prise([{ hz: 233, duree: 0.5 }]);
    espion.reponse = { texte: "a", mots };
    const chromatique = await lancer(buffer, { Gamme: "chromatique", Transposition: 0 });
    const majeur = await lancer(buffer, { Gamme: "majeur", Transposition: 0 });
    const basse = await lancer(buffer, { Gamme: "chromatique", Transposition: -12 });
    // Les colonnes du tableau : début, durée, hertz, note, nuance, mot.
    const note = (t: unknown) => String(t).split("\n")[1].trim().split(/\s+/)[3];
    expect(note(chromatique.valeurs[2])).toBe("58");
    expect(note(majeur.valeurs[2])).toBe("57");
    expect(note(basse.valeurs[2])).toBe("46");
  });

  it("donne au moteur un signal à la fréquence de Vosk, et non la prise telle quelle", async () => {
    // La prise est à quarante-huit kilohertz : le moteur travaille à seize, et lui donner
    // l'original le ferait reconnaître trois fois trop vite.
    const { buffer, mots } = prise([{ hz: 220, duree: 0.4 }], 48000);
    espion.reponse = { texte: "a", mots };
    espion.longueurs.length = 0;
    await lancer(buffer);
    expect(espion.longueurs[0]).toBe(Math.ceil(0.4 * FREQUENCE_VOSK));
  });

  it("relève la hauteur dans la plage de la voix, et non dans celle du suiveur", async () => {
    // Sans les réglages de parole, le suiveur monte jusqu'à 1760 Hz et prendrait ce sifflement pour
    // une voix. Planté, ce défaut ne faisait tomber aucun cas tant que rien ne liait l'exécuteur à
    // la plage.
    const { buffer, mots } = prise([{ hz: 1000, duree: 0.5 }]);
    espion.reponse = { texte: "si", mots };
    const r = await lancer(buffer);
    const hz = Number(String(r.valeurs[2]).split("\n")[1].trim().split(/\s+/)[2]);
    expect(hz).toBeLessThanOrEqual(400);
  });

  it("la tonique déplace la gamme dans laquelle la note est ramenée", async () => {
    // 233 Hz est le si bémol : étranger au do majeur, qui le ramène sur le la ; tonique du si bémol
    // majeur, qui le laisse où il est.
    const { buffer, mots } = prise([{ hz: 233, duree: 0.5 }]);
    espion.reponse = { texte: "a", mots };
    const note = (t: unknown) => String(t).split("\n")[1].trim().split(/\s+/)[3];
    const enDo = await lancer(buffer, { Gamme: "majeur", Tonique: "C", Transposition: 0 });
    const enSiBemol = await lancer(buffer, { Gamme: "majeur", Tonique: "Bb", Transposition: 0 });
    expect(note(enDo.valeurs[2])).toBe("57");
    expect(note(enSiBemol.valeurs[2])).toBe("58");
  });

  it("refuse l'absence d'entrée audio, en rendant une valeur par sortie déclarée", async () => {
    const r = await lancer(null);
    expect(r.valeurs).toEqual([null, null, null, null]);
    expect(r.valeurs).toHaveLength(fiche().sorties.length);
  });

  it("le dit quand le moteur n'a reconnu aucun mot, et rend tout de même l'audio", async () => {
    const { buffer } = prise([{ hz: 220, duree: 0.4 }]);
    espion.reponse = { texte: "", mots: [] };
    const r = await lancer(buffer);
    expect(r.valeurs[0]).toBeNull();
    expect(r.valeurs[3]).toBe(buffer);
    expect(r.message).toContain("Aucun mot reconnu");
  });

  it("le dit quand les mots sont là mais qu'aucun ne porte de hauteur, et garde le tableau", async () => {
    const { buffer, mots } = prise([{ hz: 0, duree: 0.4 }, { hz: 0, duree: 0.4 }]);
    espion.reponse = { texte: "chut chut", mots };
    const r = await lancer(buffer);
    expect(r.valeurs[0]).toBeNull();
    expect(String(r.valeurs[2])).toContain("m0");
    expect(r.message).toContain("2 mots reconnus");
  });

  it("annonce le relevé de hauteur après la reconnaissance", async () => {
    const { buffer, mots } = prise([{ hz: 220, duree: 0.4 }]);
    espion.reponse = { texte: "a", mots };
    const r = await lancer(buffer);
    expect(r.progres.some((p) => p.includes("hauteur"))).toBe(true);
  });
});

describe("déclarations", () => {
  it("prend un audio et rend MIDI, texte, notes et audio", () => {
    expect(fiche().entrees.map((e) => e.type)).toEqual(["audio"]);
    expect(fiche().sorties.map((s) => s.type)).toEqual(["midi", "texte", "texte", "audio"]);
    expect(fiche().sorties.map((s) => s.nom)).toEqual(["MIDI", "Texte", "Notes", "Audio"]);
  });

  it("nomme chacun de ses réglages dans son exécuteur, les traduit et les documente", () => {
    const source = fiche().executer.toString();
    for (const p of fiche().parametres) {
      expect(source.includes(`"${p.nom}"`), p.nom).toBe(true);
      expect(p.nomEn, p.nom).toBeTruthy();
      expect(p.doc, p.nom).toBeTruthy();
      expect(p.docEn, p.nom).toBeTruthy();
    }
  });

  it("écrit chacun de ses réglages et chacune de ses sorties dans sa notice, dans les deux langues", () => {
    for (const p of fiche().parametres) {
      expect(fiche().notice, p.nom).toContain(p.nom);
      expect(fiche().noticeEn, p.nomEn).toContain(p.nomEn!);
    }
    for (const s of fiche().sorties) {
      expect(fiche().notice, s.nom).toContain(s.nom);
    }
  });

  it("offre une langue par modèle livré, et pas une de plus", () => {
    const choix = fiche().parametres.find((p) => p.nom === "Langue");
    expect(choix?.optionIds).toEqual(Object.keys(MODELES));
  });

  it("et les deux modèles le portent au manifeste, sans quoi rien n'annoncerait leur téléchargement", () => {
    // Le champ `noeuds` est ce qui relie un paquet à ses nœuds : s'en tromper rend le message muet.
    const manifeste = JSON.parse(readFileSync("scripts/modeles-manifest.json", "utf8"));
    for (const { id } of Object.values(MODELES)) {
      const entree = manifeste.modeles.find((m: { id: string }) => m.id === id);
      expect(entree?.noeuds, id).toContain("parole-vers-sequence");
    }
  });
});
