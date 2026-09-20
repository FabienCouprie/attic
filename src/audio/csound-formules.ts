// audio/csound-formules.ts — Des orchestres complets, à lire, à entendre et à modifier.
//
// CE QUE CE MODULE N'EST PAS. « Orchestre Csound » compose un orchestre en assemblant des
// instruments qui partagent tous le MÊME contrat — p4 la hauteur, p5 l'amplitude — pour qu'une
// partition à plusieurs parties les adresse par leur numéro. C'est fait pour ARRANGER.
//
// Ici, chaque entrée est un orchestre ENTIER qui montre une technique, avec ses propres p-fields :
// l'indice de modulation en p6 pour la FM, la coupure du filtre pour la soustractive, la densité de
// grains pour le granulaire. C'est fait pour APPRENDRE et pour PARTIR DE QUELQUE CHOSE — le champ
// Orchestre du nœud Csound contenait déjà une de ces formules, et il n'y en avait qu'une.
//
// CHAQUE FORMULE PORTE SA PARTITION D'ESSAI, et ce n'est pas un ornement : ses p-fields lui sont
// propres, et une partition écrite pour l'une ne veut rien dire pour l'autre. La partition démontre
// donc ce que la formule sait faire — la FM y balaie son indice, la soustractive sa coupure.
//
// LE NIVEAU PASSE PAR UNE VARIABLE GLOBALE, `gkNiveau`, que chaque sortie multiplie. C'est visible
// dans le texte, donc modifiable par qui le lit, et cela évite d'avoir à réécrire les lignes de
// sortie au moment de composer.

export interface ChampFormule {
  /** Le p-field, écrit tel qu'on le lit : « p4 ». */
  champ: string;
  fr: string;
  en: string;
}

export interface FormuleCsound {
  id: string;
  fr: string;
  en: string;
  famille: string;
  familleEn: string;
  /** 1 pour `out`, 2 pour `outs`. Le nœud Csound doit être réglé pareil. */
  canaux: 1 | 2;
  /** L'orchestre entier : tables, instruments, tout. */
  orchestre: string[];
  /** Ce que porte chaque p-field, dans l'ordre. */
  champs: ChampFormule[];
  /** La partition qui démontre la formule — sans le `e`, ajouté à l'écriture. */
  partition: string[];
  note: string;
  noteEn: string;
}

/**
 * Les formules.
 *
 * Chacune a été RENDUE et MESURÉE dans l'application : elle sort du son, à la hauteur demandée quand
 * elle en a une, sans toucher le limiteur. C'est la règle que l'intégration de Csound s'est donnée,
 * et elle a déjà écarté des opcodes qui ne tenaient pas leurs promesses.
 */
export const FORMULES: readonly FormuleCsound[] = [
  {
    id: "oscillateur", fr: "Oscillateur à vibrato", en: "Vibrato oscillator",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "instr 1",
      "  aenv  linseg 0, 0.02, 1, p3 - 0.1, 0.8, 0.08, 0",
      "  amod  oscili 300, p4 * 1.41",
      "  asig  oscili p5, p4 + amod",
      "  out   asig * aenv * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence en hertz", en: "frequency in hertz" },
      { champ: "p5", fr: "amplitude, de 0 à 1", en: "amplitude, 0 to 1" },
    ],
    partition: ["i1 0.0 1.0 220 0.5", "i1 1.0 1.0 277 0.5", "i1 2.0 1.5 330 0.6"],
    note: "La formule que le nœud Csound portait par défaut : un oscillateur dont la fréquence est modulée par un second, à 1,41 fois la sienne — un rapport irrationnel, donc un battement qui ne se referme jamais.",
    noteEn: "The formula the Csound node carried by default: an oscillator whose frequency is modulated by a second one at 1.41 times its own — an irrational ratio, hence a beating that never closes.",
  },
  {
    id: "fm", fr: "FM à indice variable", en: "FM with variable index",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "giSinus ftgen 0, 0, 16385, 10, 1",
      "",
      "instr 1",
      "  ; L'INDICE DÉCROÎT PENDANT LA NOTE : c'est ce qui fait la cloche de Chowning — beaucoup de",
      "  ; partiels à l'attaque, un son presque pur à la fin.",
      "  kindex linseg p6, p3 * 0.6, p6 * 0.2, p3 * 0.4, 0",
      "  aenv   linsegr 0, 0.01, 1, 0.3, 0",
      "  asig   foscil p5, p4, 1, p7, kindex, giSinus",
      "  out    asig * aenv * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence en hertz", en: "frequency in hertz" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "indice de modulation au départ", en: "modulation index at onset" },
      { champ: "p7", fr: "rapport de la modulante, 1 = harmonique", en: "modulator ratio, 1 = harmonic" },
    ],
    partition: [
      "; Le même la, avec un indice de plus en plus fort : le timbre s'enrichit sans changer de note.",
      "i1 0.0 1.0 220 0.4 1 1",
      "i1 1.0 1.0 220 0.4 5 1",
      "i1 2.0 1.0 220 0.4 12 1",
      "; Puis un rapport non entier : la cloche, inharmonique.",
      "i1 3.0 2.0 220 0.4 8 1.41",
    ],
    note: "La modulation de fréquence de John Chowning (1973), avec l'enveloppe d'indice qui en fait tout l'intérêt. Un rapport entier donne un son harmonique, un rapport irrationnel une cloche.",
    noteEn: "John Chowning's frequency modulation (1973), with the index envelope that makes all its interest. An integer ratio gives a harmonic sound, an irrational one a bell.",
  },
  {
    id: "soustractive", fr: "Soustractive à filtre balayé", en: "Subtractive with swept filter",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "instr 1",
      "  ; Le filtre BALAIE de p6 à p7 fois la fréquence de la note : c'est le geste du synthétiseur",
      "  ; analogique, et la raison d'être de l'échelle de Moog.",
      "  kcut  expseg p4 * p6, p3, p4 * p7",
      "  aenv  linseg 0, 0.01, 1, p3 - 0.06, 0.7, 0.05, 0",
      "  abrut vco2 p5, p4",
      "  asig  moogladder abrut, kcut, p8",
      "  out   asig * aenv * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence en hertz", en: "frequency in hertz" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "coupure au départ, en multiples de la note", en: "cutoff at onset, in multiples of the note" },
      { champ: "p7", fr: "coupure à la fin", en: "cutoff at the end" },
      { champ: "p8", fr: "résonance, de 0 à 1", en: "resonance, 0 to 1" },
    ],
    partition: [
      "; Un balayage qui descend, puis un qui monte, puis le même très résonant.",
      "i1 0.0 1.5 110 0.5 16 1 0.3",
      "i1 1.5 1.5 110 0.5 1 16 0.3",
      "i1 3.0 2.0 110 0.5 20 1 0.85",
    ],
    note: "Dent de scie à bande limitée et filtre en échelle de Moog. Le balayage de coupure est écrit dans la partition, pas dans l'orchestre : chaque note peut avoir le sien.",
    noteEn: "Band-limited sawtooth through a Moog ladder filter. The cutoff sweep lives in the score, not in the orchestra: every note can have its own.",
  },
  {
    id: "additive", fr: "Additive à harmoniques comptés", en: "Additive with counted harmonics",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "giCosinus ftgen 0, 0, 16385, 11, 1",
      "",
      "instr 1",
      "  ; `gbuzz` empile p6 harmoniques dont l'amplitude décroît d'un facteur p7 à chaque rang.",
      "  ; C'est la synthèse additive d'avant les ordinateurs rapides : une seule formule pour une",
      "  ; somme d'harmoniques.",
      "  knh   line p6, p3, 1",
      "  aenv  linseg 0, 0.02, 1, p3 - 0.08, 1, 0.06, 0",
      "  asig  gbuzz p5, p4, knh, 1, p7, giCosinus",
      "  out   asig * aenv * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence en hertz", en: "frequency in hertz" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "harmoniques au départ, retombant à 1", en: "harmonics at onset, falling to 1" },
      { champ: "p7", fr: "décroissance par rang, 0 à 1", en: "roll-off per rank, 0 to 1" },
    ],
    partition: [
      "; Le spectre se vide pendant la note : trente harmoniques au départ, un seul à la fin.",
      "i1 0.0 2.0 110 0.5 30 0.8",
      "i1 2.0 2.0 110 0.5 6 0.5",
    ],
    note: "Un train d'harmoniques dont le nombre décroît pendant la note : le spectre se vide, et l'on entend la synthèse additive à l'œuvre sans écrire vingt oscillateurs.",
    noteEn: "A train of harmonics whose count decreases during the note: the spectrum empties, and additive synthesis is heard at work without writing twenty oscillators.",
  },
  {
    id: "karplus", fr: "Corde de Karplus-Strong", en: "Karplus-Strong string",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "instr 1",
      "  ; Une ligne à retard remplie de bruit, moyennée à chaque tour : la corde s'éteint d'elle-même.",
      "  ; p6 choisit la méthode de lissage — 1 moyenne simple, 3 récursive, 6 mélange.",
      "  asig pluck p5, p4, p4, 0, p6",
      "  out  asig * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence en hertz", en: "frequency in hertz" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "méthode de lissage : 1, 3 ou 6", en: "smoothing method: 1, 3 or 6" },
    ],
    partition: [
      "; Les trois méthodes sur la même note : la décroissance et le grain changent.",
      "i1 0.0 1.5 220 0.6 1",
      "i1 1.5 1.5 220 0.6 3",
      "i1 3.0 1.5 220 0.6 6",
    ],
    note: "L'algorithme de Kevin Karplus et Alex Strong (1983). Aucune enveloppe : la décroissance vient du modèle lui-même, comme sur une corde réelle.",
    noteEn: "Kevin Karplus and Alex Strong's algorithm (1983). No envelope: the decay comes from the model itself, as on a real string.",
  },
  {
    id: "anneau", fr: "Modulation en anneau", en: "Ring modulation",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "instr 1",
      "  ; Deux sinus multipliés : il ne reste que la somme et la différence de leurs fréquences.",
      "  ; Avec p6 non entier, plus aucun harmonique n'est en rapport simple — le son de cloche fêlée.",
      "  aenv linseg 0, 0.02, 1, p3 - 0.08, 1, 0.06, 0",
      "  aporteuse oscili 1, p4",
      "  amodulante oscili 1, p4 * p6",
      "  out aporteuse * amodulante * p5 * aenv * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence de la porteuse", en: "carrier frequency" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "rapport de la modulante", en: "modulator ratio" },
    ],
    partition: [
      "; Rapport entier, puis quinte, puis irrationnel : le dernier n'a plus de fondamentale.",
      "i1 0.0 1.5 220 0.6 2",
      "i1 1.5 1.5 220 0.6 1.5",
      "i1 3.0 2.0 220 0.6 1.732",
    ],
    note: "La plus simple des modulations : un produit. Elle ne garde que la somme et la différence des deux fréquences, et fait donc disparaître la fondamentale — d'où son timbre métallique.",
    noteEn: "The simplest modulation: a product. It keeps only the sum and difference of the two frequencies, and so removes the fundamental — hence its metallic timbre.",
  },
  {
    id: "granulaire", fr: "Nuage granulaire", en: "Granular cloud",
    famille: "Synthèse", familleEn: "Synthesis", canaux: 1,
    orchestre: [
      "giSinus ftgen 0, 0, 16385, 10, 1",
      "giFenetre ftgen 0, 0, 16385, 20, 2",
      "",
      "instr 1",
      "  ; Des centaines de grains par seconde, chacun d'une durée de p7, dispersés en hauteur de p8.",
      "  ; La densité est en p6 : au-delà de quelques dizaines, les grains fusionnent en une texture.",
      "  aenv  linseg 0, 0.05, 1, p3 - 0.15, 1, 0.1, 0",
      "  asig  grain p5, p4, p6, 0, p8, p7, giSinus, giFenetre, 1",
      "  out   asig * aenv * gkNiveau",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence moyenne des grains", en: "mean grain frequency" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "grains par seconde", en: "grains per second" },
      { champ: "p7", fr: "durée d'un grain, en secondes", en: "grain duration, in seconds" },
      { champ: "p8", fr: "dispersion des hauteurs, en hertz", en: "pitch scatter, in hertz" },
    ],
    partition: [
      "; Le même nuage de plus en plus dense : on passe d'un pointillé à une texture continue.",
      "; L'AMPLITUDE BAISSE QUAND LA DENSITÉ MONTE, en raison inverse de sa racine : des grains qui",
      "; se recouvrent s'additionnent, et à quatre cents par seconde l'amplitude 0,4 saturait — crête",
      "; mesurée à 0,95, c'est-à-dire le limiteur.",
      "i1 0.0 2.0 440 0.40 8 0.08 100",
      "i1 2.0 2.0 440 0.15 60 0.04 200",
      "i1 4.0 2.0 440 0.06 400 0.02 400",
    ],
    note: "La synthèse par grains, d'après l'idée de Dennis Gabor (1947) reprise par Curtis Roads et Barry Truax. Peu de grains font un pointillé, beaucoup font une masse : c'est le même réglage qui traverse les deux. LA DENSITÉ MULTIPLIE LE NIVEAU — des grains qui se recouvrent s'additionnent —, et l'amplitude doit donc baisser à mesure qu'on épaissit le nuage : en raison inverse de la racine de la densité, ce que fait la partition d'essai.",
    noteEn: "Granular synthesis, after Dennis Gabor's idea (1947) taken up by Curtis Roads and Barry Truax. Few grains make a stipple, many make a mass: the same control crosses both. DENSITY MULTIPLIES THE LEVEL — overlapping grains add up — so the amplitude must fall as the cloud thickens: in inverse proportion to the square root of the density, which is what the test score does.",
  },
  {
    id: "reverbe-bus", fr: "Instrument et réverbération (bus global)", en: "Instrument and reverb (global bus)",
    famille: "Structure", familleEn: "Structure", canaux: 2,
    orchestre: [
      "giSinus ftgen 0, 0, 16385, 10, 1",
      "; LE BUS : une variable globale audio, que les instruments alimentent et que la réverbération",
      "; lit. C'est la structure qu'un orchestre à un seul instrument ne peut pas montrer, et celle de",
      "; presque toutes les pièces sérieuses.",
      "gaBus init 0",
      "",
      "instr 1",
      "  aenv  linseg 0, 0.01, 1, p3 - 0.05, 0.6, 0.04, 0",
      "  asig  foscil p5, p4, 1, 2, 3, giSinus",
      "  ; p6 décide de la part envoyée à la réverbération : 0 sec, 1 noyé.",
      "  gaBus = gaBus + asig * aenv * p6",
      "  outs  asig * aenv * (1 - p6) * gkNiveau, asig * aenv * (1 - p6) * gkNiveau",
      "endin",
      "",
      "instr 99",
      "  ; La réverbération tourne pendant TOUTE la pièce : elle est lancée par la partition, et sa",
      "  ; durée y est écrite. Sans elle, les queues seraient coupées net.",
      "  aG, aD reverbsc gaBus, gaBus, 0.85, 12000",
      "  outs   aG * gkNiveau, aD * gkNiveau",
      "  gaBus = 0",
      "endin",
    ],
    champs: [
      { champ: "p4", fr: "fréquence en hertz", en: "frequency in hertz" },
      { champ: "p5", fr: "amplitude", en: "amplitude" },
      { champ: "p6", fr: "part envoyée à la réverbération, 0 à 1", en: "share sent to the reverb, 0 to 1" },
    ],
    partition: [
      "; La réverbération d'abord, sur toute la durée — sans cette ligne, on n'entend rien d'elle.",
      "i99 0 8",
      "; Puis des notes de plus en plus noyées.",
      "i1 0.0 0.3 440 0.5 0.0",
      "i1 1.0 0.3 550 0.5 0.3",
      "i1 2.0 0.3 660 0.5 0.7",
      "i1 3.0 0.3 880 0.5 1.0",
    ],
    note: "Deux instruments et un bus : c'est ainsi qu'une pièce Csound se structure. L'instrument envoie une part de son signal dans une variable globale, et un second instrument, lancé pour toute la durée, la réverbère. Sortie STÉRÉO : réglez le nœud Csound en conséquence.",
    noteEn: "Two instruments and a bus: this is how a Csound piece is structured. The instrument sends part of its signal into a global variable, and a second instrument, launched for the whole duration, reverberates it. STEREO output: set the Csound node accordingly.",
  },
];

export const trouverFormule = (id: string): FormuleCsound | undefined =>
  FORMULES.find((f) => f.id === id);

/**
 * Le texte de l'orchestre, niveau compris.
 *
 * `gkNiveau` est déclaré en tête plutôt que multiplié dans chaque ligne de sortie : la formule reste
 * lisible telle qu'elle est écrite, et qui veut changer le niveau n'a qu'une valeur à toucher.
 */
export function texteFormule(f: FormuleCsound, o: { niveau?: number } = {}): string {
  const niveau = Math.min(1, Math.max(0, o.niveau ?? 1));
  return [
    `; ${f.fr} — ${f.canaux === 2 ? "sortie stéréo" : "sortie mono"}`,
    ...f.champs.map((c) => `; ${c.champ} = ${c.fr}`),
    "",
    `gkNiveau init ${niveau.toFixed(4)}`,
    "",
    ...f.orchestre,
  ].join("\n");
}

/**
 * La partition d'essai de la formule.
 *
 * Elle est PROPRE À CHAQUE FORMULE, et c'est la raison d'être de ce champ : les p-fields diffèrent
 * d'une formule à l'autre, et une partition écrite pour la FM ne veut rien dire pour le granulaire.
 * Celle-ci démontre ce que la formule sait faire.
 */
export function partitionFormule(f: FormuleCsound): string {
  const derniere = f.partition
    .filter((l) => !l.trim().startsWith(";"))
    .map((l) => {
      const p = l.trim().split(/\s+/);
      return Number(p[1] ?? 0) + Number(p[2] ?? 0);
    });
  const fin = derniere.length ? Math.max(...derniere) : 1;
  return [...f.partition, `f0 ${(fin + 1).toFixed(1)}`, "e"].join("\n");
}
