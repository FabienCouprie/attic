// audio/csound-opcodes.ts — Les orchestres Csound de la bibliothèque d'opcodes.
//
// Csound compte environ mille neuf cents opcodes, et la plupart demandent d'écrire un
// orchestre pour servir à quelque chose. Ce module en choisit quelques-uns et fabrique leur
// orchestre, de sorte qu'on puisse les employer par des réglages nommés, sans écrire une
// ligne de code.
//
// Le choix n'est pas arbitraire : chacun de ces orchestres a été ESSAYÉ, et seuls ceux qui
// rendent du son figurent ici. `partikkel` n'y est pas, et son histoire vaut d'être dite : trois
// formulations avaient été refusées par le compilateur, et on avait conclu ici qu'il fallait y
// renoncer. C'était une erreur de lecture — l'opcode est bien présent dans le portage
// WebAssembly, et son refus parlait des TYPES d'arguments, non de son absence. Il en prend
// quarante obligatoires, dont six exigent une variable à taux audio qu'une constante ne remplace
// pas. Il a désormais son propre nœud, « Particules », dont l'orchestre est construit et testé
// dans `audio/particules.ts` : sa place n'est plus dans cette liste d'opcodes à un réglage.
// `hrtfmove2` et `lpread` ont été essayés aussi : ils réclament des fichiers de données
// externes, absents du portage WebAssembly, et l'un d'eux exige même une analyse préalable
// par un utilitaire hors ligne. Ce n'est pas une question de réglage, c'est une question de
// fichiers, et cela se voit dans les messages : « cannot load hrtf-44100-left.dat ».
// `pvsmorph`, enfin, compile et se termine proprement mais n'écrit RIEN : un fichier de
// sortie réduit à son en-tête, sans la moindre erreur signalée. Essayé seul et après
// d'autres rendus, mêmes quatre-vingts octets. `pvscross` et `pvsvoc` couvrent le même
// besoin et fonctionnent, donc il sort de la liste.

export type SorteOpcode = "instrument" | "spectral";

export interface Opcode {
  id: string;
  fr: string;
  en: string;
  sorte: SorteOpcode;
  /** Nombre d'entrées audio nécessaires : 0, 1 ou 2. */
  entrees: number;
  /** Gain de sortie trouvé à la mesure, pour que tous les opcodes sortent au même niveau. */
  gain: number;
  /** Ce que l'opcode fait de chaque réglage, pour la documentation du nœud. */
  reglages: string;
  reglagesEn: string;
}

export const OPCODES: Opcode[] = [
  {
    id: "wgbow", fr: "Corde frottée (wgbow)", en: "Bowed string (wgbow)",
    sorte: "instrument", entrees: 0, gain: 1,
    reglages: "Pression = pression d'archet. Position = point de contact sur la corde, en fraction depuis le chevalet. Vibrato = profondeur.",
    reglagesEn: "Pressure = bow pressure. Position = contact point along the string, as a fraction from the bridge. Vibrato = depth.",
  },
  {
    id: "wgclar", fr: "Clarinette (wgclar)", en: "Clarinet (wgclar)",
    sorte: "instrument", entrees: 0, gain: 12,
    reglages: "Pression = raideur de l'anche. Position = temps d'attaque. Vibrato = profondeur.",
    reglagesEn: "Pressure = reed stiffness. Position = attack time. Vibrato = depth.",
  },
  {
    id: "wgflute", fr: "Flûte (wgflute)", en: "Flute (wgflute)",
    sorte: "instrument", entrees: 0, gain: 1,
    reglages: "Pression = souffle. Position = rapport du jet d'air, le réglage le plus sensible. Vibrato = profondeur.",
    reglagesEn: "Pressure = breath. Position = air jet ratio, the most sensitive control. Vibrato = depth.",
  },
  {
    id: "wgbrass", fr: "Cuivre (wgbrass)", en: "Brass (wgbrass)",
    sorte: "instrument", entrees: 0, gain: 3,
    reglages: "Pression = tension des lèvres. Position = temps d'attaque. Vibrato = profondeur.",
    reglagesEn: "Pressure = lip tension. Position = attack time. Vibrato = depth.",
  },
  {
    id: "wgpluck2", fr: "Corde pincée (wgpluck2)", en: "Plucked string (wgpluck2)",
    sorte: "instrument", entrees: 0, gain: 2,
    reglages: "Pression = réflexion de la corde, donc la durée du son. Position = point de pincement. Vibrato = sans effet.",
    reglagesEn: "Pressure = string reflection, hence the decay. Position = pluck point. Vibrato = no effect.",
  },
  {
    id: "fof2", fr: "Formants (fof2)", en: "Formants (fof2)",
    sorte: "instrument", entrees: 0, gain: 1.5,
    reglages: "Pression = largeur de bande du formant. Position = fréquence du formant, de 200 à 2 200 Hz. Vibrato = sans effet.",
    reglagesEn: "Pressure = formant bandwidth. Position = formant frequency, from 200 to 2200 Hz. Vibrato = no effect.",
  },
  {
    id: "pvscross", fr: "Croisement spectral (pvscross)", en: "Spectral cross (pvscross)",
    sorte: "spectral", entrees: 2, gain: 0.6,
    reglages: "Morphing = part du second son dans les amplitudes. Le premier son garde ses fréquences, le second impose ses niveaux.",
    reglagesEn: "Morph = share of the second sound in the amplitudes. The first keeps its frequencies, the second imposes its levels.",
  },
  {
    id: "pvsvoc", fr: "Vocodeur spectral (pvsvoc)", en: "Spectral vocoder (pvsvoc)",
    sorte: "spectral", entrees: 2, gain: 6,
    reglages: "Le premier son donne son enveloppe spectrale — ses formants —, le second son excitation. Morphing = profondeur de l'effet.",
    reglagesEn: "The first sound gives its spectral envelope — its formants — the second its excitation. Morph = depth of the effect.",
  },
  {
    id: "mincer", fr: "Étirement à phase verrouillée (mincer)", en: "Phase-locked stretch (mincer)",
    sorte: "spectral", entrees: 1, gain: 1,
    reglages: "Morphing = facteur d'étirement ; à 0,5 le son dure deux fois plus longtemps. Transposition = hauteur, indépendante de la durée.",
    reglagesEn: "Morph = stretch factor; at 0.5 the sound lasts twice as long. Transpose = pitch, independent of duration.",
  },
];

export const opcode = (id: string): Opcode => OPCODES.find((o) => o.id === id) ?? OPCODES[0];

/**
 * Le même, mais qui reste dans sa famille.
 *
 * Un graphe enregistré peut nommer un opcode qui a disparu de la liste — `pvsmorph` en est
 * un, retiré après essai. Retomber alors sur le premier opcode TOUTES FAMILLES CONFONDUES
 * donnait un instrument à un nœud spectral, qui échouait ensuite sans qu'on comprenne
 * pourquoi. Le repli reste donc dans la famille demandée.
 */
export function opcodeDe(sorte: SorteOpcode, id: string): Opcode {
  const famille = OPCODES.filter((o) => o.sorte === sorte);
  return famille.find((o) => o.id === id) ?? famille[0];
}

export interface ReglagesInstrument {
  /** Pression, souffle ou tension, de 0 à 1 selon l'opcode. */
  pression: number;
  /** Position, rapport de jet ou fréquence de formant, de 0 à 1. */
  position: number;
  vibrato: number;
  frequenceVibrato: number;
}

/**
 * L'orchestre d'un opcode d'instrument.
 *
 * `p4` porte la fréquence et `p5` l'amplitude, ce qui est la convention des partitions
 * produites ici. Les gains de sortie viennent de la mesure : `wgclar` rend douze fois moins
 * fort que `wgbow` à réglages comparables, et sans correction la bibliothèque serait
 * inutilisable — on passerait son temps à rattraper le volume.
 */
export function orchestreInstrument(o: Opcode, r: ReglagesInstrument): string {
  const p = Math.max(0.01, Math.min(1, r.pression));
  const pos = Math.max(0.01, Math.min(1, r.position));
  const vib = Math.max(0, Math.min(1, r.vibrato));
  const fvib = Math.max(0.1, r.frequenceVibrato);
  const corps = {
    wgbow: `asig wgbow p5, p4, ${(1 + 9 * p).toFixed(3)}, ${(0.02 + 0.45 * pos).toFixed(3)}, ${fvib.toFixed(2)}, ${(0.03 * vib).toFixed(4)}, 1`,
    wgclar: `asig wgclar p5, p4, ${(0.1 + 0.8 * p).toFixed(3)}, ${(0.05 + 1.5 * pos).toFixed(3)}, 0.05, 0.3, ${fvib.toFixed(2)}, ${(0.1 * vib).toFixed(4)}`,
    wgflute: `asig wgflute p5, p4, ${(0.2 + 0.3 * pos).toFixed(3)}, 0.1, 0.1, ${(0.05 + 0.3 * p).toFixed(3)}, ${fvib.toFixed(2)}, ${(0.1 * vib).toFixed(4)}, 1`,
    wgbrass: `asig wgbrass p5, p4, ${(0.2 + 0.8 * p).toFixed(3)}, ${(0.02 + 0.3 * pos).toFixed(3)}, ${fvib.toFixed(2)}, ${(0.1 * vib).toFixed(4)}, 1`,
    wgpluck2: `asig wgpluck2 ${(0.1 + 0.85 * p).toFixed(3)}, p5, p4, ${(0.05 + 0.4 * pos).toFixed(3)}, 0.05`,
    fof2: `asig fof2 p5, 100, ${Math.round(200 + 2000 * pos)}, 0, ${Math.round(10 + 190 * p)}, 0.003, 0.02, 0.007, 20, 1, 2, p3, 0, 0`,
  }[o.id] ?? `asig oscili p5, p4`;
  return [
    "instr 1",
    `  ${corps}`,
    `  aenv linseg 0, 0.02, 1, p3 - 0.06, 1, 0.04, 0`,
    `  out asig * aenv * ${o.gain}`,
    "endin",
  ].join("\n");
}

/** Les tables dont les instruments ont besoin : une sinusoïde, et une fenêtre pour fof2. */
export function tablesInstrument(o: Opcode): string {
  const lignes = ["f1 0 16384 10 1"];
  if (o.id === "fof2") lignes.push("f2 0 1024 19 0.5 0.5 270 0.5");
  return lignes.join("\n");
}

export interface ReglagesSpectral {
  /** Quantité de morphing, ou facteur d'étirement pour mincer. */
  morphing: number;
  /** Transposition en demi-tons, employée par mincer. */
  transposition: number;
  /** Taille de la transformée : 512, 1024 ou 2048. */
  fenetre: number;
}

/**
 * L'orchestre d'un opcode spectral.
 *
 * Les opcodes en « pvs » travaillent sur un FLUX spectral et non sur des trames qu'on se
 * passe à la main : `pvsanal` analyse, l'opcode transforme, `pvsynth` resynthétise. C'est la
 * chaîne que Csound a introduite en 2001 et que rien n'égale ailleurs en simplicité.
 */
export function orchestreSpectral(o: Opcode, r: ReglagesSpectral): string {
  const m = Math.max(0, Math.min(1, r.morphing));
  const n = [512, 1024, 2048].includes(r.fenetre) ? r.fenetre : 1024;
  const saut = n / 4;
  const tete = [
    `  a1 diskin2 "entree1.wav", 1`,
    o.entrees > 1 ? `  a2 diskin2 "entree2.wav", 1` : "",
  ].filter(Boolean).join("\n");

  if (o.id === "mincer") {
    // mincer lit une TABLE et non un flux : le pointeur de lecture est un signal, et c'est
    // sa pente qui étire le temps. Mesuré : avec un pointeur en k-rate, l'opcode est refusé.
    const ratio = 2 ** (r.transposition / 12);
    return [
      "instr 1",
      `  atime line 0, p3, ${Math.max(0.05, m * 2).toFixed(3)}`,
      `  asig mincer atime, 1, ${ratio.toFixed(4)}, 1, 0.8`,
      `  out asig * ${o.gain}`,
      "endin",
    ].join("\n");
  }

  const transformation = {
    pvscross: `  fs pvscross f1, f2, ${(1 - m).toFixed(3)}, ${m.toFixed(3)}`,
    pvsvoc: `  fs pvsvoc f1, f2, ${Math.max(0.01, m).toFixed(3)}, 1`,
  }[o.id] ?? `  fs pvscross f1, f2, ${(1 - m).toFixed(3)}, ${m.toFixed(3)}`;

  return [
    "instr 1",
    tete,
    `  f1 pvsanal a1, ${n}, ${saut}, ${n}, 1`,
    `  f2 pvsanal a2, ${n}, ${saut}, ${n}, 1`,
    transformation,
    `  aout pvsynth fs`,
    `  out aout * ${o.gain}`,
    "endin",
  ].join("\n");
}

/** La table de lecture dont mincer a besoin, remplie depuis le fichier d'entrée. */
export function tablesSpectral(o: Opcode): string {
  return o.id === "mincer" ? `f1 0 0 1 "entree1.wav" 0 0 0` : "";
}
