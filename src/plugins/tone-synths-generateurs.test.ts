// plugins/tone-synths-generateurs.test.ts — Les trois fiches de `plugins/tone-synths.ts`, qu'aucun
// test ne nommait.
//
// POURQUOI UN SECOND FICHIER, ET POURQUOI CE NOM. `plugins/tone-synths.test.ts` existe déjà, mais il
// ne tient pas ce fichier-ci : il éprouve `drum-synth`, qui vit ailleurs depuis un découpage, et son
// en-tête le dit. De `membrane-synth`, `metal-synth` et `poly-synth`, aucun test ne prononçait le
// nom. Les laisser dans l'ancien fichier aurait mêlé deux sujets sous un titre qui en désigne un
// troisième ; celui-ci porte donc le nom de ce qu'il tient.
//
// CE QUI EST TENU ICI, ET CE QUI NE L'EST PAS. `audio/tone-synths.test.ts` couvre les générateurs,
// un ou deux cas chacun : un buffer stéréo non silencieux, une durée respectée. Ce qui n'était tenu
// par rien, c'est la PRISE — vingt-cinq réglages répartis sur trois fiches, dont pas un seul n'était
// éprouvé, et trois branches d'erreur que personne n'avait jamais vues s'exécuter.
//
// LA DURÉE RENDUE EST UNE RÈGLE EXACTE, et c'est le cas le plus précis du fichier. Les deux
// percussions rendent `max(0,1 ; Durée ; Decay + Release + 0,05)` : le son n'est jamais coupé avant
// la fin de son enveloppe, ce que la documentation de « Durée » énonce — « le son est rallongé si
// l'enveloppe dépasse cette valeur ». Aux réglages par défaut l'enveloppe l'emporte, de sorte que
// « Durée » ne commande rien en dessous de 1,85 s sur la membrane et de 1,65 s sur le métal. Le
// vérifier au niveau de la fiche, et non du calcul, prouve en une ligne que les trois réglages
// arrivent à destination et dans le bon ordre.
//
// L'ACCORD SE LIT DANS SON MESSAGE. « Notes » est découpé aux virgules, les espaces ôtés et les
// vides écartés : « C4, , E4 » rend « Accord C4+E4 », ce qui se vérifie sans toucher au son.
//
// TROIS ANGLES MORTS TROUVÉS EN PLANTANT, et les trois tenaient à une symétrie. Mes deux cas de
// message réglaient la durée demandée AU-DESSUS de l'enveloppe, de sorte que la durée demandée et
// la durée rendue tombaient sur le même nombre : un message qui aurait annoncé la première passait
// inaperçu. Ils règlent désormais une durée que l'enveloppe dépasse. ET ÉCHANGER « DECAY » ET
// « RELEASE » NE SE VOYAIT PAS NON PLUS, pour deux raisons successives : la durée rendue vaut leur
// SOMME, qui ne bouge pas ; et comparer les deux rendus l'un à l'autre ne suffit pas davantage,
// puisqu'un échange des réglages échange les deux rendus sans changer la paire. Il faut un repère
// ORIENTÉ, et le trouver a demandé de mesurer dans quel sens chacun agit. QUARANTE-QUATRE DÉFAUTS
// PLANTÉS, QUARANTE-QUATRE ARRÊTÉS, dont trois après correction de la batterie.
//
// ET LE SENS S'INVERSE D'UN SYNTHÉ À L'AUTRE, ce qu'on n'aurait pas deviné. Sur la membrane, un
// RELÂCHEMENT long prolonge la traînée — le son s'éteint à 0,97 s contre 0,54 — et un déclin long la
// raccourcit en la rendant d'abord plus forte, 0,215 de valeur efficace sur les trois premiers
// dixièmes contre 0,127. Sur le métal, c'est l'inverse : le DÉCLIN prolonge, 0,33 s contre 0,24. Un
// garde copié d'une fiche à l'autre se tromperait donc de signe.
//
// TROIS DÉFAUTS TROUVÉS ICI, ET CORRIGÉS DEPUIS. Leur trace reste parce qu'elle explique la forme
// des cas qui les tiennent.
//
//   « VOLUME » DU MÉTAL NE COMMANDAIT RIEN. De 10 à 100, la crête valait exactement 0,99000 et la
//   valeur efficace passait de 0,004915 à 0,005080 : trois virgule quatre pour cent sur toute la
//   course d'un réglage qui va de un à dix, seul le zéro faisant taire. ET CELUI DE L'ACCORD ÉTAIT
//   INERTE AU-DESSUS DE CINQUANTE — crête et valeur efficace identiques à 50, 75 et 100, quand il
//   agissait encore en dessous, 0,2157 à 10 et 0,5393 à 25.
//
//   LA CAUSE EST COMMUNE, et c'est l'algèbre déjà rencontrée trois fois dans ce chantier, sur
//   « Force » du scanning, sur la voyelle chantée et sur la pression du vent. `plafonnerCrete` ne
//   plafonne pas, il NORMALISE : il divise le tampon par sa crête dès qu'elle dépasse la valeur
//   reçue. Fixée à 0,99, elle ramenait au même niveau tout ce qui la dépassait, et les commentaires
//   du calcul disaient eux-mêmes ce qui la dépassait — « 2,44 mesuré dans le navigateur au réglage
//   par défaut » pour le métal, « 1,71 » pour trois voix d'accord. Le plafond suit désormais le
//   volume, de sorte que la normalisation PORTE le gain au lieu de l'effacer. Sur le métal
//   s'ajoutait une seconde cause : `MetalSynth` ne suit presque pas la vélocité qu'on lui passe, et
//   c'est donc le plafond qui rend au réglage le seul effet qu'il annonce.
//
//   `genererMembraneSynth`, QUI NE NORMALISE PAS, avait déjà un « Volume » exact, et c'est lui qui a
//   servi de témoin : le mécanisme était bon, c'est le plafond des deux autres qui l'effaçait. Les
//   trois portent maintenant le même contrat, et c'est la même aide qui le vérifie sur les trois.
//
//   ET IL A FALLU UN CAS DE PLUS, que la loi du volume ne dit pas : la crête au volume plein ne
//   dépasse pas la pleine échelle. Les deux contrats sont distincts — planté, un générateur dont on
//   retire le plafond garde un volume parfaitement proportionnel et sort à 1,71.
//
//   UN ACCORD VIDE PASSAIT POUR UN SUCCÈS. « Notes » laissé vide rendait un tampon entièrement
//   silencieux et l'annonçait comme un rendu abouti — « Accord  — 1.25s », avec un nom d'accord vide
//   entre deux espaces —, là où les trois autres façons de se tromper, une note illisible et une
//   forme d'onde inconnue, étaient déclarées. Le nœud refuse désormais et dit quoi faire.
// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./tone-synths";

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(reglages: Record<string, number | string>, sampleRate?: number) {
  return {
    entree: () => null,
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
    runtime: sampleRate === undefined ? undefined : { sampleRate },
  } as never;
}

const lancer = (id: string, reglages: Record<string, number | string> = {}, sampleRate?: number) =>
  fiche(id).executer(contexte(reglages, sampleRate));
const rendre = async (id: string, reglages: Record<string, number | string> = {}, sampleRate?: number) =>
  (await lancer(id, reglages, sampleRate)).valeurs[0] as AudioBuffer;

function crete(b: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  return m;
}
function identiques(a: AudioBuffer, b: AudioBuffer): boolean {
  if (a.length !== b.length || a.numberOfChannels !== b.numberOfChannels) return false;
  for (let c = 0; c < a.numberOfChannels; c++) {
    const x = a.getChannelData(c), y = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  return true;
}
/** L'amplitude à une fréquence, sur le début du son. */
function ampA(b: AudioBuffer, f: number): number {
  const d = b.getChannelData(0);
  const n = Math.min(8192, d.length);
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * f * i) / b.sampleRate;
    re += d[i] * Math.cos(a); im -= d[i] * Math.sin(a);
  }
  return Math.hypot(re, im) / n;
}
/** Centre de gravité du spectre, relevé par bandes d'un demi-ton et demi. */
function centroide(b: AudioBuffer): number {
  let s = 0, p = 0;
  for (let f = 50; f < 16000; f *= 1.15) { const a = ampA(b, f); s += a * f; p += a; }
  return s / Math.max(1e-12, p);
}
/** La durée que les deux percussions doivent rendre, d'après leur documentation. */
const dureeAttendue = (duree: number, decay: number, release: number) =>
  Math.max(0.1, duree, decay + release + 0.05);

/** Dernier instant où le son dépasse un dix-millième. */
function dernierSon(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let i = d.length - 1;
  while (i > 0 && Math.abs(d[i]) <= 1e-4) i--;
  return i / b.sampleRate;
}
function rmsEntre(b: AudioBuffer, debut: number, fin: number): number {
  const d = b.getChannelData(0);
  const a = Math.max(0, Math.floor(debut * b.sampleRate));
  const z = Math.min(d.length, Math.floor(fin * b.sampleRate));
  let s = 0;
  for (let i = a; i < z; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, z - a));
}

/**
 * « Volume » commande le niveau de sortie, et exactement.
 *
 * LE MÊME CONTRAT SUR LES TROIS, et c'est ce qui le rend utile : deux des trois ne le tenaient pas,
 * leur générateur terminant par une normalisation à crête fixe qui ramenait au même niveau tout ce
 * qui la dépassait. La crête rapportée à celle du volume plein doit valoir la fraction demandée.
 */
async function volumeExact(id: string, base: Record<string, number | string>) {
  const plein = crete(await rendre(id, { ...base, "Volume": 100 }));
  expect(plein, `${id} · volume plein`).toBeGreaterThan(0.5);
  // ET LE VOLUME PLEIN NE DÉPASSE PAS LA PLEINE ÉCHELLE, ce que la loi ci-dessous ne dit pas : un
  // générateur dont on retirerait le plafond garderait un volume parfaitement proportionnel, et
  // sortirait à 1,71 pour trois voix. Les deux contrats sont distincts, et il faut les deux.
  expect(plein, `${id} · volume plein`).toBeLessThanOrEqual(1);
  for (const v of [0, 10, 25, 50, 75, 100]) {
    expect(crete(await rendre(id, { ...base, "Volume": v })) / plein, `${id} · volume ${v}`)
      .toBeCloseTo(v / 100, 3);
  }
}

describe("membrane synth", () => {
  it("rend un stéréo non silencieux, et dit la note et la durée obtenue", async () => {
    // LA DURÉE DEMANDÉE EST ICI PLUS COURTE QUE L'ENVELOPPE, et c'est délibéré : avec des réglages
    // où les deux coïncident, un message qui annoncerait la durée DEMANDÉE passerait inaperçu.
    const r = await lancer("membrane-synth", { "Durée": 0.3, "Decay": 0.5, "Release": 1.4 });
    const b = r.valeurs[0] as AudioBuffer;
    expect(b.numberOfChannels).toBe(2);
    expect(crete(b)).toBeGreaterThan(0.1);
    expect(b.duration).toBeGreaterThan(0.3);
    expect(String(r.message)).toContain("C2");
    expect(String(r.message)).toContain(b.duration.toFixed(2));
    const grave = await lancer("membrane-synth", { "Note": "A1", "Durée": 0.3, "Decay": 0.5, "Release": 1.4 });
    expect(String(grave.message)).toContain("A1");
    expect(identiques(grave.valeurs[0] as AudioBuffer, b)).toBe(false);
  });

  it("ne confond pas son déclin et son relâchement, qui ne sont pas interchangeables", async () => {
    // À SOMME ÉGALE LA DURÉE EST LA MÊME, puisqu'elle vaut `Decay + Release + 0,05` ; et comparer
    // les deux rendus l'un à l'autre ne suffit pas non plus, puisqu'un échange des deux réglages
    // échange les deux rendus sans changer la paire. Il faut donc un repère ORIENTÉ : sur la
    // membrane, c'est le relâchement qui prolonge la traînée, le déclin la raccourcissant en la
    // rendant d'abord plus forte.
    const declinLong = await rendre("membrane-synth", { "Durée": 0.3, "Decay": 1.2, "Release": 0.3 });
    const relacheLong = await rendre("membrane-synth", { "Durée": 0.3, "Decay": 0.3, "Release": 1.2 });
    expect(declinLong.duration).toBeCloseTo(relacheLong.duration, 3);
    expect(dernierSon(relacheLong)).toBeGreaterThan(dernierSon(declinLong) * 1.5);
    expect(rmsEntre(declinLong, 0, 0.3)).toBeGreaterThan(rmsEntre(relacheLong, 0, 0.3) * 1.3);
  });

  it("ne coupe jamais le son avant la fin de son enveloppe, comme sa documentation l'annonce", async () => {
    // `max(0,1 ; Durée ; Decay + Release + 0,05)` : la vérifier ici prouve que les trois réglages
    // arrivent au générateur, et dans le bon rôle.
    for (const [duree, decay, release] of [[0.3, 0.1, 0.1], [2, 0.1, 0.1], [0.3, 0.5, 1.4], [0.05, 0.01, 0.01]]) {
      const b = await rendre("membrane-synth", { "Durée": duree, "Decay": decay, "Release": release });
      expect(b.duration, `durée ${duree}, decay ${decay}, release ${release}`)
        .toBeCloseTo(dureeAttendue(duree, decay, release), 3);
    }
  });

  it("règle son niveau exactement au volume demandé", async () => {
    await volumeExact("membrane-synth", { "Durée": 0.3, "Decay": 0.1, "Release": 0.1 });
  });

  it("porte chacun de ses réglages jusqu'au générateur", async () => {
    const base = { "Durée": 0.3, "Decay": 0.1, "Release": 0.1 };
    const defaut = await rendre("membrane-synth", base);
    for (const [nom, change] of [
      ["Note", { "Note": "A1" }],
      ["Pitch decay", { "Pitch decay": 0.5 }],
      ["Octaves", { "Octaves": 1 }],
      ["Volume", { "Volume": 30 }],
    ] as [string, Record<string, number | string>][]) {
      expect(identiques(await rendre("membrane-synth", { ...base, ...change }), defaut), nom).toBe(false);
    }
  });

  it("déclare son erreur plutôt que de rendre un son faux quand la note est illisible", async () => {
    const r = await lancer("membrane-synth", { "Note": "pas une note", "Durée": 0.2 });
    expect((r as { erreur?: boolean }).erreur).toBe(true);
    expect(r.valeurs.every((v) => v == null)).toBe(true);
    expect(String(r.message)).toContain("MembraneSynth");
  });

  it("suit la fréquence d'échantillonnage du moteur, et retombe sur 44 100 sans elle", async () => {
    const base = { "Durée": 0.3, "Decay": 0.1, "Release": 0.1 };
    expect((await rendre("membrane-synth", base, 22050)).sampleRate).toBe(22050);
    expect((await rendre("membrane-synth", base, 48000)).sampleRate).toBe(48000);
    expect((await rendre("membrane-synth", base)).sampleRate).toBe(44100);
  });
});

describe("metal synth", () => {
  it("rend un stéréo non silencieux, et dit la note et la durée obtenue", async () => {
    // Même précaution que sur la membrane : l'enveloppe l'emporte sur la durée demandée, de sorte
    // qu'un message qui annoncerait celle-ci se verrait.
    const r = await lancer("metal-synth", { "Durée": 0.3, "Decay": 0.6, "Release": 0.5 });
    const b = r.valeurs[0] as AudioBuffer;
    expect(b.numberOfChannels).toBe(2);
    expect(crete(b)).toBeGreaterThan(0.1);
    expect(b.duration).toBeGreaterThan(0.3);
    expect(String(r.message)).toContain("C5");
    expect(String(r.message)).toContain(b.duration.toFixed(2));
  });

  it("ne confond pas son déclin et son relâchement, et pas dans le même sens que la membrane", async () => {
    // ET LE SENS S'INVERSE D'UN SYNTHÉ À L'AUTRE, ce qui vaut d'être noté : sur le métal c'est le
    // DÉCLIN qui prolonge la traînée, là où sur la membrane c'est le relâchement. Un garde copié
    // d'une fiche à l'autre se tromperait donc de signe.
    const declinLong = await rendre("metal-synth", { "Durée": 0.3, "Decay": 1, "Release": 0.3 });
    const relacheLong = await rendre("metal-synth", { "Durée": 0.3, "Decay": 0.3, "Release": 1 });
    expect(declinLong.duration).toBeCloseTo(relacheLong.duration, 3);
    expect(dernierSon(declinLong)).toBeGreaterThan(dernierSon(relacheLong) * 1.2);
  });

  it("ne coupe jamais le son avant la fin de son enveloppe, comme sa documentation l'annonce", async () => {
    for (const [duree, decay, release] of [[0.3, 0.1, 0.1], [3, 0.1, 0.1], [0.3, 1.4, 0.2], [0.3, 0.1, 2]]) {
      const b = await rendre("metal-synth", { "Durée": duree, "Decay": decay, "Release": release });
      expect(b.duration, `durée ${duree}, decay ${decay}, release ${release}`)
        .toBeCloseTo(dureeAttendue(duree, decay, release), 3);
    }
  });

  it("ouvre et ferme son timbre par la résonance et les octaves du filtre", async () => {
    // Les deux réglages les plus francs du nœud, et ceux dont l'effet se nomme : la résonance est la
    // coupure de base du passe-haut, les octaves l'étendue de sa montée.
    const base = { "Durée": 0.3, "Decay": 0.1, "Release": 0.1 };
    const defaut = centroide(await rendre("metal-synth", base));
    expect(centroide(await rendre("metal-synth", { ...base, "Resonance": 400 }))).toBeLessThan(defaut / 1.5);
    expect(centroide(await rendre("metal-synth", { ...base, "Octaves": 6 }))).toBeGreaterThan(defaut * 1.1);
  });

  it("porte chacun de ses réglages jusqu'au générateur", async () => {
    const base = { "Durée": 0.3, "Decay": 0.1, "Release": 0.1 };
    const defaut = await rendre("metal-synth", base);
    for (const [nom, change] of [
      ["Note", { "Note": "C3" }],
      ["Harmonicity", { "Harmonicity": 0.5 }],
      ["Modulation index", { "Modulation index": 90 }],
      ["Resonance", { "Resonance": 400 }],
      ["Octaves", { "Octaves": 6 }],
      ["Attack", { "Attack": 0.3 }],
    ] as [string, Record<string, number | string>][]) {
      expect(identiques(await rendre("metal-synth", { ...base, ...change }), defaut), nom).toBe(false);
    }
  });

  it("règle son niveau exactement au volume demandé", async () => {
    await volumeExact("metal-synth", { "Durée": 0.3, "Decay": 0.1, "Release": 0.1 });
  });

  it("garde ses réglages de timbre à niveau constant", async () => {
    // LE PLAFOND SUIT LE VOLUME, et non le timbre : à volume égal, résonance et octaves changent le
    // son sans changer sa crête. Sans ce cas, un plafond rebranché sur autre chose que le volume
    // passerait pour une correction.
    const base = { "Durée": 0.3, "Decay": 0.1, "Release": 0.1, "Volume": 80 };
    const defaut = crete(await rendre("metal-synth", base));
    const changes: Record<string, number | string>[] = [{ "Resonance": 400 }, { "Octaves": 6 }, { "Harmonicity": 0.5 }];
    for (const change of changes) {
      expect(crete(await rendre("metal-synth", { ...base, ...change })), JSON.stringify(change))
        .toBeCloseTo(defaut, 4);
    }
  });

  it("déclare son erreur plutôt que de rendre un son faux quand la note est illisible", async () => {
    const r = await lancer("metal-synth", { "Note": "pas une note", "Durée": 0.2 });
    expect((r as { erreur?: boolean }).erreur).toBe(true);
    expect(r.valeurs.every((v) => v == null)).toBe(true);
    expect(String(r.message)).toContain("MetalSynth");
  });
});

describe("poly synth", () => {
  it("rend un stéréo non silencieux, et nomme l'accord dans son message", async () => {
    const r = await lancer("poly-synth", { "Durée par note": 0.15, "Release": 0.1 });
    const b = r.valeurs[0] as AudioBuffer;
    expect(b.numberOfChannels).toBe(2);
    expect(crete(b)).toBeGreaterThan(0.1);
    expect(String(r.message)).toContain("C4+E4+G4");
    expect(String(r.message)).toContain(b.duration.toFixed(2));
  });

  it("découpe ses notes aux virgules, ôte les espaces et écarte les vides", async () => {
    const nomme = async (notes: string) =>
      String((await lancer("poly-synth", { "Notes": notes, "Durée par note": 0.15, "Release": 0.1 })).message);
    expect(await nomme("C4,E4")).toContain("C4+E4");
    expect(await nomme("  C4 ,  E4  ")).toContain("C4+E4");
    expect(await nomme("C4, , E4")).toContain("C4+E4");
  });

  it("rend la durée de tenue plus le relâchement, et un vingtième de seconde de marge", async () => {
    for (const [duree, release] of [[0.15, 0.1], [1, 0.5], [0.05, 0.01]]) {
      const b = await rendre("poly-synth", { "Durée par note": duree, "Release": release });
      expect(b.duration, `durée ${duree}, release ${release}`)
        .toBeCloseTo(Math.max(0.1, duree + release + 0.05), 3);
    }
  });

  it("porte chacun de ses réglages jusqu'au générateur", async () => {
    const base = { "Durée par note": 0.15, "Release": 0.1 };
    const defaut = await rendre("poly-synth", base);
    for (const [nom, change] of [
      ["Notes", { "Notes": "C3,E3" }],
      ["Volume", { "Volume": 25 }],
      ["Forme d'onde", { "Forme d'onde": "square" }],
      ["Attack", { "Attack": 0.1 }],
      ["Decay", { "Decay": 1.5 }],
      ["Sustain", { "Sustain": 1 }],
    ] as [string, Record<string, number | string>][]) {
      expect(identiques(await rendre("poly-synth", { ...base, ...change }), defaut), nom).toBe(false);
    }
  });

  it("éclaircit le timbre quand on passe de la triangulaire au carré", async () => {
    const base = { "Durée par note": 0.15, "Release": 0.1 };
    const triangle = centroide(await rendre("poly-synth", base));
    const carre = centroide(await rendre("poly-synth", { ...base, "Forme d'onde": "square" }));
    expect(carre).toBeGreaterThan(triangle * 1.5);
  });

  it("règle son niveau exactement au volume demandé", async () => {
    await volumeExact("poly-synth", { "Durée par note": 0.15, "Release": 0.1 });
  });

  it("refuse un accord sans note plutôt que de rendre un silence abouti", async () => {
    // Un champ vide rendait un tampon entièrement silencieux et l'annonçait comme un succès, avec
    // un nom d'accord vide entre deux espaces. Les espaces seuls et les virgules seules comptent
    // pour vide, puisque le découpage les écarte.
    for (const notes of ["", "   ", " , , "]) {
      const r = await lancer("poly-synth", { "Notes": notes, "Durée par note": 0.15 });
      expect((r as { erreur?: boolean }).erreur, JSON.stringify(notes)).toBe(true);
      expect(r.valeurs.every((v) => v == null), JSON.stringify(notes)).toBe(true);
      expect(String(r.message), JSON.stringify(notes)).toContain("Aucune note");
    }
    // Une seule note suffit, elle.
    const une = await lancer("poly-synth", { "Notes": "C4", "Durée par note": 0.15 });
    expect((une as { erreur?: boolean }).erreur).toBeUndefined();
    expect(String(une.message)).toContain("Accord C4");
  });

  it("déclare son erreur sur une note illisible comme sur une forme d'onde inconnue", async () => {
    const note = await lancer("poly-synth", { "Notes": "pas une note", "Durée par note": 0.15 });
    expect((note as { erreur?: boolean }).erreur).toBe(true);
    expect(note.valeurs.every((v) => v == null)).toBe(true);
    expect(String(note.message)).toContain("PolySynth");
    const onde = await lancer("poly-synth", { "Forme d'onde": "pas une onde", "Durée par note": 0.15 });
    expect((onde as { erreur?: boolean }).erreur).toBe(true);
    expect(String(onde.message)).toContain("PolySynth");
  });
});

describe("déclarations", () => {
  const trois = ["membrane-synth", "metal-synth", "poly-synth"];

  it("nomment chacun de leurs réglages dans leur exécuteur", () => {
    for (const id of trois) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres) {
        expect(source.includes(`"${p.nom}"`), `${id} · ${p.nom}`).toBe(true);
      }
    }
  });

  it("lisent chaque réglage avec le défaut qu'elles déclarent", () => {
    // UN DÉFAUT DÉCLARÉ QUI DIFFÈRE DU DÉFAUT LU est invisible : la coquille transmet la valeur
    // déclarée, et le repli en dur de l'exécuteur ne sert qu'au test et au premier rendu. Les deux
    // doivent donc désigner le même son.
    for (const id of trois) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres) {
        const appel = `${p.type === "nombre" ? "paramNombre" : "paramTexte"}("${p.nom}", `;
        const debut = source.indexOf(appel);
        expect(debut, `${id} · ${p.nom}`).toBeGreaterThanOrEqual(0);
        const suite = source.slice(debut + appel.length);
        const brut = suite.slice(0, suite.indexOf(")")).trim();
        expect(p.type === "nombre" ? Number(brut) : brut.replace(/^"|"$/g, ""), `${id} · ${p.nom}`)
          .toBe(p.defaut);
      }
    }
  });

  it("sont traduites, libellés, résumés et documentation compris", () => {
    for (const id of trois) {
      const f = fiche(id);
      expect(f.nomEn, id).toBeTruthy();
      expect(f.resumeEn, id).toBeTruthy();
      for (const p of f.parametres) {
        expect(p.nomEn, `${id} · ${p.nom}`).toBeTruthy();
        expect(p.doc, `${id} · ${p.nom}`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom}`).toBeTruthy();
        if (p.type === "choix") expect(p.optionsEn?.length, `${id} · ${p.nom}`).toBe(p.options?.length);
      }
    }
  });

  it("gardent leur défaut dans la plage qu'elles annoncent", () => {
    for (const id of trois) {
      for (const p of fiche(id).parametres) {
        if (p.type !== "nombre" || !p.plage) continue;
        expect(Number(p.defaut), `${id} · ${p.nom}`).toBeGreaterThanOrEqual(p.plage[0]);
        expect(Number(p.defaut), `${id} · ${p.nom}`).toBeLessThanOrEqual(p.plage[1]);
      }
    }
  });
});
