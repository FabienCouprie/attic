// audio/generation.ts — Les tables d'harmonie, et la generation depuis un script.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { comparerEvenementsMidi } from "./midi";
import { writeMidi } from "midi-file";

export const PROGRESSIONS_GENRE: Record<string, number[][]> = {
  rock: [[0, 4, 5], [0, 4, 0, 5], [0, 5, 3, 4]],
  pop: [[0, 5, 3, 4], [0, 4, 5, 4], [0, 3, 5, 4]],
  jazz: [[0, 3, 2, 5], [0, 2, 3, 4], [0, 5, 0, 3]],
  blues: [[0, 0, 0, 0], [0, 4, 0, 0], [4, 4, 0, 0], [5, 4, 0, 5]],
  classique: [[0, 4, 5, 0], [0, 4, 5, 3, 4, 0, 5, 0]],
  electro: [[0, 3, 5, 4], [0, 4, 5, 3]],
  hiphop: [[0, 3, 4, 5], [0, 4, 0, 3]],
  reggae: [[0, 4, 5, 4], [0, 5, 0, 4]],
  ambient: [[0, 5, 3, 4], [0, 3, 5, 0]],
};


const INSTRUMENTS_GM: Record<string, number> = {
  "Piano": 0, "Piano électrique": 4, "Guitare acoustique": 24, "Guitare électrique": 29,
  "Orgue": 19, "Clavecin": 6, "Vibraphone": 11, "Marimba": 12, "Cordes": 48, "Pad": 88,
  "Basse fretless": 35, "Basse acoustique": 32, "Basse électrique": 33, "Synth bass": 38,
  "Contrebasse": 43, "Basse slap": 36,
  "Flûte": 73, "Trompette": 56, "Sax alto": 65, "Guitare nylon": 24,
  "Violon": 40, "Lead synth": 80, "Boîte à musique": 10, "Xylophone": 13,
};


const DEGRES_MAJEUR = [0, 2, 4, 5, 7, 9, 11];

const DEGRES_MINEUR = [0, 2, 3, 5, 7, 8, 10];

// Gammes disponibles pour les nœuds qui construisent des accords ou
// mappent des couleurs sur une gamme (Générateur d'accords, Groove Box,
// Dessin sonore, Palette harmonique). id = valeur canonique stockée dans
// les paramètres ; degres = intervalles en demi-tons depuis la tonique.
// Les 9 premières entrées (7 modes heptatoniques dérivés de la gamme
// majeure + 2 gammes pentatoniques) sont communes à tous ces nœuds ; blues
// et chromatique ne sont proposées que par les nœuds de sonification
// d'image, qui les avaient déjà.
export const GAMMES_ACCORDS: { id: string; fr: string; en: string; degres: number[] }[] = [
  { id: "majeur", fr: "Majeur", en: "Major", degres: DEGRES_MAJEUR },
  { id: "mineur", fr: "Mineur naturel", en: "Natural minor", degres: DEGRES_MINEUR },
  { id: "dorien", fr: "Dorien", en: "Dorian", degres: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygien", fr: "Phrygien", en: "Phrygian", degres: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydien", fr: "Lydien", en: "Lydian", degres: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydien", fr: "Mixolydien", en: "Mixolydian", degres: [0, 2, 4, 5, 7, 9, 10] },
  { id: "locrien", fr: "Locrien", en: "Locrian", degres: [0, 1, 3, 5, 6, 8, 10] },
  { id: "pentatonique-majeure", fr: "Pentatonique majeure", en: "Major pentatonic", degres: [0, 2, 4, 7, 9] },
  { id: "pentatonique-mineure", fr: "Pentatonique mineure", en: "Minor pentatonic", degres: [0, 3, 5, 7, 10] },
  { id: "blues", fr: "Blues", en: "Blues", degres: [0, 3, 5, 6, 7, 10] },
  { id: "chromatique", fr: "Chromatique", en: "Chromatic", degres: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export function degresGammeAccords(id: string): number[] {
  return GAMMES_ACCORDS.find((g) => g.id === id)?.degres ?? DEGRES_MAJEUR;
}

/**
 * Décalage en demi-tons (1-12, ascendant) depuis une fondamentale jusqu'à la
 * note de la gamme la plus proche d'un intervalle cible (4 = tierce majeure,
 * 7 = quinte juste). Généralise la construction d'accords tertiaires à des
 * gammes de longueur quelconque : sur une gamme heptatonique cela retombe
 * exactement sur le 3e/5e degré habituel ; sur une gamme pentatonique
 * (qui n'a pas de degré à exactement 2 crans d'écart) cela choisit la note
 * de la gamme la plus proche de la tierce/quinte visée.
 */
export function degreAccordProche(degresGamme: number[], racinePc: number, cibleSemitons: number): number {
  let meilleur = cibleSemitons;
  let meilleurEcart = Infinity;
  for (const pc of degresGamme) {
    let dist = (((pc - racinePc) % 12) + 12) % 12;
    if (dist === 0) dist = 12;
    const ecart = Math.abs(dist - cibleSemitons);
    if (ecart < meilleurEcart) {
      meilleurEcart = ecart;
      meilleur = dist;
    }
  }
  return meilleur;
}

/**
 * Septième diatonique la plus proche (7e mineure = 10 demi-tons, 7e
 * majeure = 11 demi-tons). Contrairement à la tierce/quinte, une cible
 * unique ne suffit pas : à équidistance d'une cible à 10 demi-tons, une 6e
 * (9 demi-tons) et une 7e majeure (11 demi-tons) sont à égale distance, et
 * degreAccordProche choisirait arbitrairement la première trouvée dans le
 * tableau — donnant par exemple une 6te au lieu de la 7e majeure attendue
 * sur une gamme majeure. On cherche donc séparément la note la plus proche
 * de chaque qualité (mineure/majeure) et on retient celle dont l'écart
 * réel est le plus petit — ce qui retombe exactement sur la 7e diatonique
 * usuelle pour chacun des 7 modes heptatoniques (majeure sur Majeur/Lydien/
 * Mixolydien, mineure sur Mineur naturel/Dorien/Phrygien/Locrien).
 */
export function degreSeptiemeProche(degresGamme: number[], racinePc: number): number {
  const viaMineure = degreAccordProche(degresGamme, racinePc, 10);
  const viaMajeure = degreAccordProche(degresGamme, racinePc, 11);
  const ecartMineure = Math.abs(viaMineure - 10);
  const ecartMajeure = Math.abs(viaMajeure - 11);
  return ecartMajeure <= ecartMineure ? viaMajeure : viaMineure;
}


export function traduireCle(nom: string): number {
  const clef: Record<string, number> = {
    Do: 0, "Do#": 1, Ré: 2, "Ré#": 3, Mi: 4, Fa: 5, "Fa#": 6,
    Sol: 7, "Sol#": 8, La: 9, "La#": 10, Si: 11,
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  return clef[nom] ?? 0;
}



export async function genererDepuisScript(script: string): Promise<{ midiBytes: Uint8Array; description: string }> {
  const lignes = script.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const cfg: Record<string, string> = {};
  for (const ligne of lignes) {
    const eq = ligne.indexOf("=");
    if (eq < 0) continue;
    const clef = ligne.slice(0, eq).trim().toLowerCase();
    const val = ligne.slice(eq + 1).trim();
    cfg[clef] = val;
  }

  const genre = cfg["genre"] || "pop";
  const tempo = Math.max(40, Math.min(240, parseInt(cfg["tempo"] || "120")));
  const cleNom = cfg["cle"] || cfg["key"] || "C";
  const gammeNom = (cfg["gamme"] || cfg["scale"] || "majeur").toLowerCase();
  const estMineur = gammeNom.includes("min");
  const gammeCourante = estMineur ? DEGRES_MINEUR : DEGRES_MAJEUR;
  const decalage = traduireCle(cleNom);
  const tonalite = estMineur ? `${cleNom} mineur` : `${cleNom} majeur`;

  const instr1 = INSTRUMENTS_GM[cfg["instrument1"] || cfg["instr1"]] ?? (estMineur ? 1 : 0);
  const instr2 = INSTRUMENTS_GM[cfg["instrument2"] || cfg["instr2"]] ?? 33;
  const instr3 = INSTRUMENTS_GM[cfg["instrument3"] || cfg["instr3"]] ?? 12;
  let dureeSec = 30;
  const dureeCfg = cfg["duree"] || cfg["duration"];
  if (dureeCfg) { const nb = parseFloat(dureeCfg); if (!isNaN(nb)) dureeSec = Math.max(4, Math.min(300, nb)); }

  const progressions = PROGRESSIONS_GENRE[genre] || PROGRESSIONS_GENRE["pop"];
  const progression = progressions[0];
  const noire = 60 / tempo;
  const dureeAccord = noire * 2;
  const nbAccords = Math.floor(dureeSec / dureeAccord);
  const notesMel: number[] = [0, 2, 4, 7, 4, 2, 0, 7, 9, 7, 4, 2, 9, 7, 4, 0];

  // Construire le MIDI multi-pistes
  const tpm = 480;
  const microsecParBeat = (60 / tempo) * 1_000_000;
  function secEnTicks(sec: number): number { return Math.round((sec / 60) * tempo * tpm); }

  const pisteAccords: any[] = [
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: instr1 },
  ];
  const pisteBasse: any[] = [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: instr2 },
  ];
  const pisteMelodie: any[] = [
    { deltaTime: 0, type: "programChange", channel: 2, programNumber: instr3 },
  ];

  for (let i = 0; i < nbAccords; i++) {
    const debAcc = i * dureeAccord;
    const finAcc = debAcc + dureeAccord;
    const degre = progression[i % progression.length];
    const fonda = 36 + decalage + gammeCourante[degre % gammeCourante.length] + Math.floor(degre / gammeCourante.length) * 12;

    // Accords (piano, notes simultanées)
    const td = secEnTicks(debAcc);
    const tf = secEnTicks(finAcc);
    // La triade se déduit de la GAMME, degré par degré. Elle était figée à
    // [0, 3, 7] — une triade mineure pour tous les degrés et dans les deux
    // modes : en do majeur, le IV sortait F–A♭–C et le V G–B♭–D, soit trois
    // hauteurs étrangères à la gamme (D♯, G♯, A♯) sur la piste d'accords, dans
    // la configuration par défaut du nœud. Même mécanique que les autres
    // générateurs d'accords du catalogue (tierce et quinte cherchées par
    // proximité dans la gamme), pour que le mineur naturel donne bien un VI
    // majeur et le majeur un V majeur.
    const racineRelative = gammeCourante[degre % gammeCourante.length];
    const tirades = [
      0,
      degreAccordProche(gammeCourante, racineRelative, 4),
      degreAccordProche(gammeCourante, racineRelative, 7),
    ];
    for (const itv of tirades) {
      pisteAccords.push({ deltaTime: td, type: "noteOn", channel: 0, noteNumber: fonda + itv, velocity: 70 });
      pisteAccords.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 0, noteNumber: fonda + itv, velocity: 0 });
    }

    // Basse (note fondamentale)
    pisteBasse.push({ deltaTime: td, type: "noteOn", channel: 1, noteNumber: fonda - 12, velocity: 80 });
    pisteBasse.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 1, noteNumber: fonda - 12, velocity: 0 });

    // Mélodie
    const nbNotesMel = Math.floor(dureeAccord / (noire * 0.5));
    for (let n = 0; n < nbNotesMel; n++) {
      const degMel = notesMel[(i * nbNotesMel + n) % notesMel.length];
      const midiMel = 60 + decalage + gammeCourante[degMel % gammeCourante.length] + Math.floor(degMel / gammeCourante.length) * 12;
      const tMelD = secEnTicks(debAcc + n * noire * 0.5);
      const tMelF = secEnTicks(debAcc + n * noire * 0.5 + noire * 0.45);
      pisteMelodie.push({ deltaTime: tMelD, type: "noteOn", channel: 2, noteNumber: midiMel, velocity: 90 });
      pisteMelodie.push({ deltaTime: Math.max(tMelD + 1, tMelF), type: "noteOff", channel: 2, noteNumber: midiMel, velocity: 0 });
    }

  }

  // Trier chaque piste par temps absolu puis convertir en deltaTimes
  function trierPiste(events: any[]): any[] {
    // Réglages, note-off, puis note-on à l'intérieur d'un même tick : voir
    // `comparerEvenementsMidi`. L'ordre inverse faisait taire toute note relancée à la
    // même hauteur sur le même canal — un accord ou un pad tenu jusqu'au suivant.
    events.sort((a, b) =>
      comparerEvenementsMidi({ tick: a.deltaTime, type: a.type }, { tick: b.deltaTime, type: b.type }),
    );
    let tick = 0;
    const sorted: any[] = [];
    for (const e of events) {
      sorted.push({ ...e, deltaTime: e.deltaTime - tick });
      tick = e.deltaTime;
    }
    sorted.push({ deltaTime: 0, type: "endOfTrack" });
    return sorted;
  }

  const metaEvents = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];
  const piste1 = [...metaEvents, ...trierPiste(pisteAccords)];
  const piste2 = trierPiste(pisteBasse);
  const piste3 = trierPiste(pisteMelodie);

  const midi = { header: { format: 1 as const, numTracks: 3, ticksPerBeat: tpm }, tracks: [piste1, piste2, piste3] };
  const bytes = new Uint8Array(writeMidi(midi));

  const descr = [
    `── Script musical ──`,
    `Genre : ${genre}  ·  ${tempo} BPM  ·  ${tonalite}  ·  ${dureeSec}s`,
    `Structure : ${nbAccords} accords × ${dureeAccord.toFixed(1)}s`,
    `Progression : ${progression.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d % 7]).join(" – ")}`,
    `Instruments : Piano · Basse · Marimba`,
  ].join("\n");

  return { midiBytes: bytes, description: descr };
}

