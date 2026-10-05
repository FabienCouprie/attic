// plugins/modeles-physiques-midi.test.ts — La branche à séquence des trois modèles physiques, qui
// est l'autre moitié de chacun.
//
// POURQUOI CE FICHIER EST SÉPARÉ. Chacune des trois fiches de `modeles-physiques.ts` a DEUX chemins :
// sans MIDI elle joue la note et la durée réglées, avec MIDI elle joue la séquence reçue. Et les
// trois en font trois choses DIFFÉRENTES, ce qui est le sujet de ce fichier :
//
//   LE SECOUEUR fait de chaque note une secousse et de sa vélocité son ÉNERGIE. La séquence entière
//   est rendue en une passe, si bien que l'écart de vélocité survit à la normalisation du mélange :
//   à vélocités 127 et 20, les deux secousses sortent à 0,720 et 0,017 de crête. C'est la seule des
//   trois fiches qui ait une dynamique de volume, et c'est parce qu'elle ne normalise qu'une fois.
//
//   LA BARRE fait de chaque note un coup dont la vélocité règle la DURETÉ du maillet, et sa notice
//   le dit. Les deux coups sortent au même niveau — 0,720 tous les deux —, mais pas avec le même
//   timbre : la note forte porte trois fois plus de quatrième mode que la faible (1,08·10⁻² contre
//   3,62·10⁻³). Une dynamique de timbre, donc, et non de volume.
//
//   LE VENT superpose les notes et compte celles qui ONT PARLÉ, ce qui n'est pas leur nombre : sous
//   le seuil, une note reste muette, n'est pas comptée et n'est pas mêlée. Le cas se joue sur le
//   CUIVRE, seul instrument dont le réglage descende encore sous son seuil — ailleurs, le réglage
//   commence là où le modèle est juste. À pression 25 % et vélocités 127 et 40, le nœud annonce
//   « 1 note(s) » pour deux notes, et sans ce cas le garde ne prouverait rien. La vélocité règle
//   aussi la NUANCE : les deux souffles ne se chevauchant pas, le rapport de leurs crêtes vaut
//   exactement celui des nuances, `0,6 + 0,4 × vélocité / 127`.
//
// LA DURÉE RENDUE EST UNE DÉCISION PAR FICHE, et la plus parlante est celle de la barre : le
// mélange laisse résonner le MODE LE PLUS LONG de l'instrument choisi. La même séquence de deux
// notes, la seconde frappée à une seconde, rend 2,1 s en marimba et 5,2 s en vibraphone — même
// accord modal, mais l'aluminium amortit moins que le bois. Le secoueur ajoute une demi-seconde à la
// dernière note, le vent trois dixièmes. Dans les trois cas « Durée » est alors ignorée, et un
// réglage ignoré se vérifie.
//
// `notesVersFichierMidi` RECALE LA SÉQUENCE SUR SA PREMIÈRE NOTE, de sorte qu'une note isolée
// commençant tard est écrite au tick zéro : c'est donc l'écart ENTRE deux notes qui mesure leur
// placement, jamais le silence devant une seule. La remarque vient de la batterie sœur des synthèses
// exotiques, où elle a coûté deux cas faux avant d'être juste.
//
// Les mesures, les pièges écartés et les trois défauts relevés sont dans la batterie sœur,
// `modeles-physiques.test.ts`, qui tient la branche sans séquence.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import type { Note } from "../audio/note";
import { BARRES } from "../audio/barre-modale";
import { fiches } from "./modeles-physiques";

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));
const jouer = async (id: string, reglages: Record<string, number | string>, entrees: unknown[]) =>
  (await lancer(id, entrees, reglages)).valeurs[0] as AudioBuffer;
const midi = (notes: Note[]) => notesVersFichierMidi(notes, 120);

/** Les nombres d'un message, dans l'ordre où il les écrit. Voir la batterie sœur. */
const chiffres = (message: unknown): number[] =>
  (String(message).match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/** L'amplitude d'un harmonique dans la fenêtre qui suit un instant donné. */
function harmonique(b: AudioBuffer, f: number, depuis: number): number {
  const d = b.getChannelData(0);
  const depart = Math.floor(depuis * b.sampleRate);
  const n = Math.min(8192, d.length - depart);
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * f * i) / b.sampleRate;
    re += d[depart + i] * Math.cos(a);
    im -= d[depart + i] * Math.sin(a);
  }
  return Math.hypot(re, im) / n;
}

function creteEntre(b: AudioBuffer, debut: number, fin: number): number {
  const d = b.getChannelData(0);
  const a = Math.max(0, Math.floor(debut * b.sampleRate));
  const z = Math.min(d.length, Math.floor(fin * b.sampleRate));
  let m = 0;
  for (let i = a; i < z; i++) m = Math.max(m, Math.abs(d[i]));
  return m;
}

const C4 = 261.6256;

describe("secoueurs, en séquence", () => {
  it("fait de chaque note une secousse, et finit une demi-seconde après la dernière", async () => {
    const fichier = midi([
      { note: 60, velocite: 120, debut: 0, fin: 0.1 },
      { note: 60, velocite: 120, debut: 0.4, fin: 0.5 },
      { note: 60, velocite: 120, debut: 0.8, fin: 0.9 },
    ]);
    // « Durée » est à 9 et doit être ignorée : c'est la séquence qui commande.
    const r = await lancer("secoueurs", [fichier], { "Graine": 7, "Durée": 9 });
    expect(chiffres(r.message)[0]).toBe(3);
    expect((r.valeurs[0] as AudioBuffer).duration).toBeCloseTo(1.4, 2);
  });

  it("fait de la vélocité l'énergie de la secousse, et l'écart survit au mélange", async () => {
    const deux = (forte: number, faible: number) => midi([
      { note: 60, velocite: forte, debut: 0, fin: 0.1 },
      { note: 60, velocite: faible, debut: 1, fin: 1.1 },
    ]);
    const egal = await jouer("secoueurs", { "Graine": 7, "Énergie": 100 }, [deux(127, 127)]);
    expect(creteEntre(egal, 1, 1.4)).toBeGreaterThan(creteEntre(egal, 0, 0.4) * 0.5);
    const inegal = await jouer("secoueurs", { "Graine": 7, "Énergie": 100 }, [deux(127, 20)]);
    expect(creteEntre(inegal, 1, 1.4)).toBeLessThan(creteEntre(inegal, 0, 0.4) * 0.1);
    // Et « Énergie » gradue encore la séquence entière.
    const douce = chiffres((await lancer("secoueurs", [deux(120, 120)], { "Graine": 7, "Énergie": 20 })).message)[1];
    const forte = chiffres((await lancer("secoueurs", [deux(120, 120)], { "Graine": 7, "Énergie": 100 })).message)[1];
    expect(forte).toBeGreaterThan(douce * 2);
  });
});

describe("instrument à vent, en séquence", () => {
  it("superpose les notes, chacune à son instant, et finit trois dixièmes après", async () => {
    const fichier = midi([
      { note: 57, velocite: 127, debut: 0, fin: 0.2 },
      { note: 69, velocite: 127, debut: 1.2, fin: 1.4 },
    ]);
    const r = await lancer("vent-guide-onde", [fichier], { "Durée": 9 });
    const b = r.valeurs[0] as AudioBuffer;
    expect(b.duration).toBeCloseTo(1.7, 2);
    expect(creteEntre(b, 0, 0.3)).toBeGreaterThan(0.1);
    expect(creteEntre(b, 1.2, 1.5)).toBeGreaterThan(0.1);
    // Entre les deux, rien : les notes sont posées, pas empilées à l'instant zéro.
    expect(creteEntre(b, 0.7, 1.1)).toBe(0);
  });

  it("ne compte, et ne mêle, que les notes qui ont parlé", async () => {
    // SUR LE CUIVRE, qui est le seul instrument dont le réglage descend sous son seuil : la
    // pression de chaque note suit sa vélocité, `pression × (0,6 + 0,4 × vélocité / 127)`, si bien
    // qu'à 25 % la note forte passe le seuil et la plus douce non. Deux notes, une seule comptée :
    // c'est le cas qui distingue le compteur de `notes.length`. À 15 % rien ne parle, à 50 % tout.
    const fichier = midi([
      { note: 57, velocite: 127, debut: 0, fin: 0.25 },
      { note: 60, velocite: 40, debut: 0.5, fin: 0.75 },
    ]);
    const rendre = (pression: number) =>
      lancer("vent-guide-onde", [fichier], { "Instrument": "cuivre", "Pression": pression, "Souffle": 0, "Vibrato": 0 });

    const aucune = await rendre(15);
    const muet = aucune.valeurs[0] as AudioBuffer;
    expect(String(aucune.message)).toContain("pas parlé");
    expect(creteEntre(muet, 0, muet.duration)).toBe(0);

    const une = await rendre(25);
    expect(chiffres(une.message)[0]).toBe(1);
    // La note douce n'est pas seulement décomptée : elle n'est pas dans le mélange.
    expect(creteEntre(une.valeurs[0] as AudioBuffer, 0.45, 0.9)).toBe(0);

    const deux = await rendre(50);
    expect(chiffres(deux.message)[0]).toBe(2);
    expect(creteEntre(deux.valeurs[0] as AudioBuffer, 0.45, 0.9)).toBeGreaterThan(0.01);
  });

  it("fait de la vélocité la nuance du souffle, et l'écart survit au mélange", async () => {
    // La vélocité règle la pression, donc le timbre, ET le niveau rendu. Sans le second, la
    // normalisation de chaque note effaçait l'écart : deux notes jouées à 127 et à 1 sortaient à
    // 0,7174 et 0,7193 de crête, la plus faible même imperceptiblement plus forte.
    const deux = (forte: number, faible: number) => midi([
      { note: 57, velocite: forte, debut: 0, fin: 0.25 },
      { note: 57, velocite: faible, debut: 1, fin: 1.25 },
    ]);
    // Pression pleine, pour que la note douce reste au-dessus du seuil de l'anche et qu'on mesure
    // la nuance et non le mutisme.
    const souffleSec = { "Souffle": 0, "Vibrato": 0, "Pression": 100 };
    const egal = await jouer("vent-guide-onde", souffleSec, [deux(127, 127)]);
    expect(creteEntre(egal, 1, 1.5)).toBeCloseTo(creteEntre(egal, 0, 0.5), 5);
    const inegal = await jouer("vent-guide-onde", souffleSec, [deux(127, 40)]);
    // Les deux souffles ne se chevauchent pas, et la normalisation du mélange est un seul facteur :
    // le rapport des crêtes est donc exactement celui des nuances, 0,6 + 0,4 × 40/127.
    expect(creteEntre(inegal, 1, 1.5) / creteEntre(inegal, 0, 0.5))
      .toBeCloseTo(0.6 + (0.4 * 40) / 127, 4);
  });

  it("met la crête du mélange exactement au volume demandé", async () => {
    // Le mélange a son propre `versBuffer` : sans ce cas, un volume oublié là ne se verrait pas.
    const fichier = midi([
      { note: 57, velocite: 127, debut: 0, fin: 0.2 },
      { note: 60, velocite: 127, debut: 0.4, fin: 0.6 },
    ]);
    for (const volume of [0, 40, 100]) {
      const b = await jouer("vent-guide-onde", { "Volume": volume }, [fichier]);
      expect(creteEntre(b, 0, b.duration), `volume ${volume}`).toBeCloseTo(0.9 * (volume / 100), 6);
    }
  });
});

describe("barre modale, en séquence", () => {
  const deuxCoups = () => midi([
    { note: 60, velocite: 127, debut: 0, fin: 0.2 },
    { note: 64, velocite: 127, debut: 0.4, fin: 0.6 },
  ]);

  it("laisse résonner le mode le plus long de l'instrument après la dernière frappe", async () => {
    // Même séquence, deux instruments : le marimba rend 2,1 s et le vibraphone 5,2 s, parce que son
    // premier mode dure quatre secondes contre neuf dixièmes.
    const fichier = midi([
      { note: 60, velocite: 127, debut: 0, fin: 0.2 },
      { note: 64, velocite: 127, debut: 1, fin: 1.2 },
    ]);
    const duree = async (instrument: string) =>
      (await jouer("barre-modale", { "Instrument": instrument, "Durée": 9 }, [fichier])).duration;
    expect(await duree("marimba")).toBeCloseTo(2.1, 2);
    expect(await duree("vibraphone")).toBeCloseTo(5.2, 2);
    // LA QUEUE EST CELLE DU MODE LE PLUS LONG, et non celle du premier. Les deux lectures donnent
    // aujourd'hui le même nombre, parce que toute barre de la table a son mode le plus long en
    // premier : c'est ce qui rend les deux écritures indiscernables, et c'est donc cela qu'on tient.
    // Le jour où une barre y échappera, ce cas le dira, et le choix redeviendra observable.
    for (const b of BARRES) {
      expect(b.modes[0].duree, b.id).toBe(Math.max(...b.modes.map((m) => m.duree)));
    }
  });

  it("annonce les coups de la séquence et les modes de l'instrument, à ce rang", async () => {
    // Le mélange a son propre message : sans ce cas, deux nombres échangés là ne se verraient pas.
    const dit = async (instrument: string) =>
      chiffres((await lancer("barre-modale", [deuxCoups()], { "Instrument": instrument })).message);
    expect(await dit("marimba")).toEqual([2, 3]);
    expect(await dit("glockenspiel")).toEqual([2, 4]);
  });

  it("fait de la vélocité la dureté du maillet : un coup fort est plus clair, pas plus fort", async () => {
    const fichier = midi([
      { note: 60, velocite: 127, debut: 0, fin: 0.2 },
      { note: 60, velocite: 1, debut: 1, fin: 1.2 },
    ]);
    const b = await jouer("barre-modale", { "Instrument": "marimba" }, [fichier]);
    const aigus = (depuis: number) => harmonique(b, C4 * 4, depuis) / harmonique(b, C4, depuis);
    expect(aigus(0.01)).toBeGreaterThan(aigus(1.01) * 2);
    // Les deux coups sortent pourtant au même niveau : la dynamique est de timbre.
    expect(creteEntre(b, 0, 0.3)).toBeCloseTo(creteEntre(b, 1, 1.3), 2);
  });

  it("met la crête du mélange exactement au volume demandé", async () => {
    // Le mélange a son propre `versBuffer` : sans ce cas, un volume oublié là ne se verrait pas.
    for (const volume of [0, 40, 100]) {
      const b = await jouer("barre-modale", { "Volume": volume }, [deuxCoups()]);
      expect(creteEntre(b, 0, b.duration), `volume ${volume}`).toBeCloseTo(0.9 * (volume / 100), 6);
    }
  });
});
