// audio/csound-orchestre.ts — Composer un orchestre Csound en cochant des instruments.
//
// L'ORCHESTRE EST LA MOITIÉ DU LANGAGE. Csound sépare les instruments de la partition, et jusqu'ici
// Attic n'offrait qu'un instrument à la fois : « Instruments Csound » écrit un `instr 1` et rien
// d'autre. Un arrangement à quatre parties demande quatre instruments dans le MÊME orchestre, chacun
// numéroté, tous cohérents entre eux.
//
// TROIS PIÈGES QUI FONT QU'UN ORCHESTRE COMBINÉ NE SONNE PAS, et ce module existe pour les fermer.
//
//  1. LA NUMÉROTATION. Deux instruments qui s'appellent tous deux `instr 1` ne provoquent pas
//     d'erreur : le second REMPLACE le premier, et la partition joue le mauvais son sans rien dire.
//     Chaque entrée est donc un modèle dont le numéro est posé à la composition.
//  2. LES TABLES DE FONCTION. Elles se déclaraient dans la PARTITION — `f1 0 16384 10 1` —, ce qui
//     ne tient plus à plusieurs : deux instruments réclameraient la même table, et une partition
//     écrite ailleurs ne l'aurait pas du tout. Elles passent donc par `ftgen` DANS l'orchestre, avec
//     un numéro attribué par Csound et retenu dans une variable globale : il n'y a plus de numéro de
//     table à faire coïncider, donc plus de collision possible.
//  3. LE NOMBRE DE CANAUX. Un instrument qui écrit `out` (mono) mélangé à un qui écrit `outs`
//     (stéréo) donne un rendu à moitié muet — Csound n'écrit alors qu'un canal sur deux. Tous les
//     instruments d'un orchestre sont donc écrits de la MÊME façon, et le nœud dit quel réglage
//     « Canaux » poser sur le nœud Csound.
//
// LE CONTRAT DES P-FIELDS est le même pour tous : p4 la hauteur en hertz, p5 l'amplitude entre 0 et
// 1. Ce sont les valeurs par défaut de « Partition Csound », de sorte que les deux nœuds s'assemblent
// sans réglage. Un instrument qui aurait besoin de plus le prendrait dans ses constantes, pas dans la
// partition : ce qui se règle finement se règle avec « Instruments Csound », qui reste là pour cela.

/** Une table de fonction dont un instrument a besoin. */
export interface TableOrchestre {
  /** Nom de la variable globale qui portera son numéro. */
  variable: string;
  /** Arguments de `ftgen` après le numéro et le temps : taille, GEN, paramètres. */
  args: string;
  /** À quoi elle sert, pour la lecture de l'orchestre. */
  role: string;
}

export interface InstrumentOrchestre {
  id: string;
  fr: string;
  en: string;
  /** Pour grouper la liste : modèles physiques, synthèse, résonance. */
  famille: string;
  familleEn: string;
  /** Tables nécessaires, partagées entre instruments quand elles portent le même nom. */
  tables?: TableOrchestre[];
  /** Le corps de l'instrument, sans `instr` ni `endin` : `asig` doit y être calculé. */
  corps: string[];
  /**
   * Gain de sortie, mesuré dans l'application pour que tous les instruments sortent au même niveau.
   *
   * Les opcodes de Csound ne partagent aucune convention d'amplitude. Mesuré pour une amplitude
   * demandée de 0,6 : `mode` sort à 0,10 de crête, `wgclar` à 0,36, `foscil` pile à 0,60, et `wgbow`
   * touche le limiteur à 0,95. Sans ces facteurs, un orchestre mêlant les deux extrêmes donnerait une
   * cloche inaudible sous une corde saturée.
   */
  gain: number;
  /** Ce que l'instrument fait des p-fields, et de ses constantes — pour le rapport. */
  note: string;
  noteEn: string;
}

/** La table sinus, partagée par presque tous : GEN10 avec un seul harmonique. */
const SINUS: TableOrchestre = {
  variable: "giSinus", args: "16385, 10, 1", role: "sinus (GEN10)",
};
/** Une sigmoïde, que `fof2` réclame pour l'enveloppe de ses grains. */
const SIGMOIDE: TableOrchestre = {
  variable: "giSigmoide", args: "1024, 19, 0.5, 0.5, 270, 0.5", role: "sigmoïde (GEN19)",
};
/** Un cosinus, que `gbuzz` réclame. */
const COSINUS: TableOrchestre = {
  variable: "giCosinus", args: "16385, 11, 1", role: "cosinus (GEN11)",
};

/**
 * Les instruments proposés.
 *
 * CHACUN A ÉTÉ MESURÉ, à trois octaves — la2, la3, la4 — et aucun n'est ici sur la foi de sa
 * documentation. C'est la règle que l'intégration de Csound s'était donnée, et elle a de nouveau
 * servi : `wgbrass` a été ÉCARTÉ, ne tenant aucune hauteur à aucun des huit réglages essayés (crête
 * 0,14, valeur efficace 0,012 — du souffle), et le seul réglage qui le faisait osciller sonnait
 * 1 376 cents trop haut. Deux autres ont été RATTRAPÉS par une compensation mesurée plutôt que
 * supprimés : voir `wgbow` et `wgflute`.
 *
 * LES GAINS VIENNENT DE LA MÊME MESURE. Les opcodes de Csound ne partagent aucune convention
 * d'amplitude : pour une même amplitude demandée de 0,6, les crêtes allaient de 0,10 (`mode`) à 0,95
 * (`wgbow`, qui touchait le limiteur). Chaque gain ramène la crête à 0,6, de sorte qu'un orchestre
 * mêlant dix instruments n'en ait pas un inaudible sous un autre saturé.
 */
export const INSTRUMENTS_ORCHESTRE: readonly InstrumentOrchestre[] = [
  {
    id: "wgbow", fr: "Corde frottée (wgbow)", en: "Bowed string (wgbow)",
    famille: "Modèles physiques", familleEn: "Physical models",
    tables: [SINUS], gain: 0.6,
    corps: [
      // La COMPENSATION D'ACCORD, mesurée : le modèle joue haut, et d'autant plus haut que la note
      // est aiguë — +7 cents au la2, +15 au la3, +30 au la4, +64 au la5, soit environ 0,034 cent par
      // hertz. Le facteur exp(−1,97·10⁻⁵ f) annule exactement cette dérive : après correction,
      // −0, −0, −1 et +1 cents aux quatre mêmes hauteurs.
      "kf = p4 * exp(-0.0000197 * p4)",
      // Pression d'archet 2 et non 4 : à 4, la corde SURBLOW dans l'aigu — 1 792 Hz mesurés pour
      // 880 demandés, une octave et une quinte trop haut. C'est le défaut qui rendait ce modèle
      // inutilisable pour jouer une mélodie, et il ne se voit qu'en mesurant.
      "asig wgbow p5, kf, 2.0, 0.127236, 6.00, 0.0, giSinus, 20",
    ],
    note: "Modèle de Helmholtz de Perry Cook. Accord compensé d'une dérive mesurée ; pression d'archet 2, au-delà de laquelle la corde surblow dans l'aigu.",
    noteEn: "Perry Cook's Helmholtz model. Tuning compensated for a measured drift; bow pressure 2, beyond which the string overblows in the treble.",
  },
  {
    id: "wgflute", fr: "Flûte (wgflute)", en: "Flute (wgflute)",
    famille: "Modèles physiques", familleEn: "Physical models",
    tables: [SINUS], gain: 1.3,
    corps: [
      // Même remède, dérive inverse : la flûte joue haut de +48 cents au la2, +22 au la3, +15 au la4
      // — une erreur qui DÉCROÎT avec la fréquence, donc en 1/f. D'où exp(−6,1/f), et après
      // correction +2, −1 et +4 cents. Sans le `iminfreq` de 20 posé en dernier argument, l'erreur
      // partait à +133 cents : c'est lui qui fixe la longueur du tampon de retard.
      "kf = p4 * exp(-6.1 / p4)",
      "asig wgflute p5, kf, 0.32, 0.1, 0.1, 0.2, 6.00, 0.05, giSinus, 20",
    ],
    note: "Jet d'air sur une embouchure. Accord compensé d'une dérive mesurée en 1/f ; le rapport du jet, 0,32, est le réglage le plus sensible du modèle.",
    noteEn: "Air jet on a mouthpiece. Tuning compensated for a measured 1/f drift; the jet ratio, 0.32, is the model's most sensitive control.",
  },
  {
    id: "wgclar", fr: "Clarinette (wgclar)", en: "Clarinet (wgclar)",
    famille: "Modèles physiques", familleEn: "Physical models",
    tables: [SINUS], gain: 1.67,
    corps: ["asig wgclar p5, p4, 0.5, 0.02, 0.1, 0.3, 6.00, 0.05, giSinus, 20"],
    note: "Anche simple, tube cylindrique. Juste au cent près sur trois octaves, et le plus discret des modèles : son gain le compense.",
    noteEn: "Single reed, cylindrical bore. In tune to the cent over three octaves, and the quietest of the models: its gain compensates.",
  },
  {
    id: "wgpluck2", fr: "Corde pincée (wgpluck2)", en: "Plucked string (wgpluck2)",
    famille: "Modèles physiques", familleEn: "Physical models",
    gain: 1.5,
    corps: ["asig wgpluck2 0.3, p5, p4, 0.2, 0.05"],
    note: "Corde pincée à un cinquième de sa longueur. La décroissance est dans le modèle, pas dans l'enveloppe. Juste à ±6 cents.",
    noteEn: "String plucked at a fifth of its length. The decay is in the model, not the envelope. In tune within ±6 cents.",
  },
  {
    id: "fof2", fr: "Voyelle (fof2)", en: "Vowel (fof2)",
    famille: "Synthèse", familleEn: "Synthesis",
    tables: [SINUS, SIGMOIDE], gain: 1.7,
    corps: ["asig fof2 p5, p4, 650, 0, 80, 0.003, 0.02, 0.007, 20, giSinus, giSigmoide, p3, 0, 0"],
    note: "Synthèse par formants de Xavier Rodet : des grains à 650 Hz, la voyelle « a ». Le formant étant FIXE, il domine le spectre sous 300 Hz — comme une voix qui chante grave.",
    noteEn: "Xavier Rodet's formant synthesis: grains at 650 Hz, the vowel « a ». The formant being FIXED, it dominates the spectrum below 300 Hz — like a voice singing low.",
  },
  {
    id: "foscil", fr: "FM (foscil)", en: "FM (foscil)",
    famille: "Synthèse", familleEn: "Synthesis",
    tables: [SINUS], gain: 1,
    corps: ["asig foscil p5, p4, 1, 2, 3, giSinus"],
    note: "Modulation de fréquence de John Chowning : porteuse 1, modulante 2, indice 3 — le timbre de cloche. Juste au cent près, et le seul dont la crête tombe pile sur l'amplitude demandée.",
    noteEn: "John Chowning's frequency modulation: carrier 1, modulator 2, index 3 — the bell timbre. In tune to the cent, and the only one whose peak lands exactly on the requested amplitude.",
  },
  {
    id: "pluck", fr: "Karplus-Strong (pluck)", en: "Karplus-Strong (pluck)",
    famille: "Synthèse", familleEn: "Synthesis",
    gain: 2,
    corps: ["asig pluck p5, p4, p4, 0, 1"],
    note: "L'algorithme de Kevin Karplus et Alex Strong, 1983 : une ligne à retard remplie de bruit, moyennée à chaque tour. Juste à ±7 cents.",
    noteEn: "Kevin Karplus and Alex Strong's algorithm, 1983: a delay line filled with noise, averaged on each pass. In tune within ±7 cents.",
  },
  {
    id: "vco2", fr: "Soustractive (vco2 + moogladder)", en: "Subtractive (vco2 + moogladder)",
    famille: "Synthèse", familleEn: "Synthesis",
    gain: 1.85,
    corps: [
      "abrut vco2 p5, p4",
      "asig moogladder abrut, p4 * 4 + 200, 0.4",
    ],
    note: "Dent de scie à bande limitée filtrée par l'échelle de Moog : la coupure suit la note, à quatre fois sa fréquence. Juste au cent près.",
    noteEn: "Band-limited sawtooth through the Moog ladder: the cutoff follows the note, at four times its frequency. In tune to the cent.",
  },
  {
    id: "mode", fr: "Résonance modale (mode)", en: "Modal resonance (mode)",
    famille: "Résonance", familleEn: "Resonance",
    gain: 5.7,
    corps: [
      "abruit noise p5, 0",
      "aexc linseg 1, 0.003, 0, 1, 0",
      "asig mode abruit * aexc * 0.1, p4, 800",
    ],
    note: "Un filtre résonant de très grand facteur de qualité, frappé par trois millisecondes de bruit : le son d'une barre ou d'une cloche. Juste au cent près, mais d'autant plus discret que la note est aiguë.",
    noteEn: "A very high-Q resonant filter struck by three milliseconds of noise: the sound of a bar or a bell. In tune to the cent, but quieter the higher the note.",
  },
  {
    id: "gbuzz", fr: "Train d'impulsions (gbuzz)", en: "Pulse train (gbuzz)",
    famille: "Synthèse", familleEn: "Synthesis",
    tables: [COSINUS], gain: 1,
    corps: ["asig gbuzz p5, p4, 10, 1, 0.7, giCosinus"],
    note: "Dix harmoniques d'amplitudes décroissantes — la forme d'onde des anciens synthétiseurs additifs, et une bonne matière à filtrer. Juste au cent près.",
    noteEn: "Ten harmonics of decreasing amplitude — the waveform of early additive synthesizers, and good material to filter. In tune to the cent.",
  },
];

export const trouverInstrument = (id: string): InstrumentOrchestre | undefined =>
  INSTRUMENTS_ORCHESTRE.find((i) => i.id === id);

/**
 * Une liste d'identifiants écrite à la main : « wgbow, foscil ».
 *
 * Les inconnus sont écartés — un identifiant mal tapé ne doit pas faire échouer tout l'orchestre —,
 * et les doublons aussi : deux fois le même instrument donnerait deux `instr` identiques à deux
 * numéros, ce qui marche mais n'apporte rien et brouille le rapport.
 */
export function analyserListeInstruments(texte: string): string[] {
  const vus: string[] = [];
  for (const morceau of String(texte ?? "").split(/[,;\s]+/)) {
    const id = morceau.trim();
    if (!id || vus.includes(id)) continue;
    if (trouverInstrument(id)) vus.push(id);
  }
  return vus;
}

export interface OptionsOrchestre {
  /** 1 pour mono, 2 pour stéréo. Tous les instruments écrivent de la même façon. */
  canaux?: 1 | 2;
  /** Numéro du premier instrument. */
  base?: number;
  /** Niveau global, de 0 à 1. */
  niveau?: number;
}

export interface LigneOrchestre {
  numero: number;
  id: string;
  nom: string;
  note: string;
}

export interface RapportOrchestre {
  instruments: LigneOrchestre[];
  tables: string[];
  canaux: number;
}

/**
 * L'enveloppe commune, et pourquoi elle n'est pas réglable.
 *
 * Une attaque de 20 ms et une extinction de 40 ms suffisent à ne pas cliquer, et laissent chaque
 * modèle garder SA propre décroissance : une corde pincée s'éteint par sa réflexion, une flûte tient
 * tant que la note dure. Une enveloppe réglable ici écraserait ces différences, qui sont justement ce
 * qui distingue ces instruments — et un orchestre n'est pas un endroit où l'on règle une note.
 */
const ENVELOPPE = "aenv linseg 0, 0.02, 1, p3 - 0.06, 1, 0.04, 0";

/**
 * Assemble l'orchestre et son rapport.
 *
 * Les tables sont DÉDUPLIQUÉES par nom de variable : cinq instruments qui veulent un sinus se
 * partagent la même, ce qui est le but de `ftgen` et évite cinq tables de seize mille points.
 */
export function construireOrchestre(
  ids: readonly string[], o: OptionsOrchestre = {},
): { texte: string; rapport: RapportOrchestre } {
  const canaux = o.canaux === 2 ? 2 : 1;
  const base = Math.max(1, Math.round(o.base ?? 1));
  const niveau = Math.min(1, Math.max(0, o.niveau ?? 1));
  const choisis = ids.map((id) => trouverInstrument(id)).filter((i): i is InstrumentOrchestre => !!i);

  const tables = new Map<string, TableOrchestre>();
  for (const inst of choisis) for (const t of inst.tables ?? []) tables.set(t.variable, t);

  const lignes: string[] = [];
  if (tables.size > 0) {
    lignes.push("; Tables de fonction, créées par ftgen : Csound attribue les numéros, donc aucune");
    lignes.push("; collision n'est possible entre instruments.");
    for (const t of tables.values()) lignes.push(`${t.variable} ftgen 0, 0, ${t.args}`);
    lignes.push("");
  }

  const rapport: LigneOrchestre[] = [];
  choisis.forEach((inst, i) => {
    const numero = base + i;
    rapport.push({ numero, id: inst.id, nom: inst.fr, note: inst.note });
    lignes.push(`instr ${numero}  ; ${inst.fr}`);
    lignes.push(`  ${ENVELOPPE}`);
    for (const l of inst.corps) lignes.push(`  ${l}`);
    const gain = (inst.gain * niveau).toFixed(4);
    // Mono ou stéréo pour TOUT LE MONDE : `out` et `outs` mélangés donnent un rendu à moitié muet.
    lignes.push(canaux === 2
      ? `  outs asig * aenv * ${gain}, asig * aenv * ${gain}`
      : `  out asig * aenv * ${gain}`);
    lignes.push("endin");
    lignes.push("");
  });

  return {
    texte: lignes.join("\n").trimEnd(),
    rapport: { instruments: rapport, tables: [...tables.values()].map((t) => t.role), canaux },
  };
}

/** Coupe un texte en lignes d'au plus `largeur` caractères, sans couper un mot. */
function replier(texte: string, largeur = 92): string[] {
  const lignes: string[] = [];
  let courante = "";
  for (const mot of texte.split(/\s+/)) {
    if (courante === "") courante = mot;
    else if (courante.length + 1 + mot.length <= largeur) courante += ` ${mot}`;
    else { lignes.push(courante); courante = mot; }
  }
  if (courante !== "") lignes.push(courante);
  return lignes;
}

/** La hauteur du la3, celle que joue le squelette : reconnaissable d'oreille et au milieu du clavier. */
const HAUTEUR_EXEMPLE = 440;

/**
 * Le rapport, qui est aussi un SQUELETTE DE PARTITION jouable.
 *
 * POURQUOI PAS UNE SIMPLE LISTE. Le message du nœud dit déjà l'essentiel — « i1 wgclar, i2 mode » —
 * et il est toujours visible, sans rien brancher. Un rapport qui ne ferait que le répéter en plus
 * long n'aurait servi à rien. Celui-ci se COLLE dans le champ Partition du nœud Csound et se joue :
 * chaque instrument y frappe un la3 à son tour, une seconde chacun. On entend donc l'orchestre
 * immédiatement, et l'on voit sur quelle colonne se trouve chaque p-field avant d'écrire sa propre
 * partition.
 *
 * Les commentaires de partition commencent par un point-virgule, que Csound ignore : tout le texte
 * est donc collable tel quel, documentation comprise.
 */
export function rapportOrchestreLisible(r: RapportOrchestre, en = false): string {
  const lignes: string[] = [];
  const canaux = r.canaux === 2 ? (en ? "stereo" : "stéréo") : "mono";
  if (en) {
    lignes.push(`; ${r.instruments.length} instrument(s) · ${canaux} · p4 = pitch in hertz, p5 = amplitude (0 to 1)`);
    lignes.push("; Score skeleton: paste it into the Csound node's Score field to hear the orchestra.");
    lignes.push(`; Set that node's Channels to ${canaux}, or half the render is lost.`);
  } else {
    lignes.push(`; ${r.instruments.length} instrument(s) · ${canaux} · p4 = hauteur en hertz, p5 = amplitude (0 à 1)`);
    lignes.push("; Squelette de partition : à coller dans le champ Partition du nœud Csound pour entendre l'orchestre.");
    lignes.push(`; Réglez les Canaux de ce nœud sur ${canaux}, sans quoi la moitié du rendu se perd.`);
  }
  lignes.push(";");
  r.instruments.forEach((i, rang) => {
    lignes.push(`; i${i.numero} — ${i.nom}`);
    for (const l of replier(i.note)) lignes.push(`;      ${l}`);
    lignes.push(`i${i.numero} ${rang.toFixed(1)} 1.0 ${HAUTEUR_EXEMPLE.toFixed(3)} 0.6`);
  });
  if (r.instruments.length > 0) {
    // `f0` laisse sonner la dernière queue : une cloche ou une corde pincée dépasse sa note.
    lignes.push(`f0 ${(r.instruments.length + 1).toFixed(1)}`);
    lignes.push("e");
  }
  if (r.tables.length) {
    lignes.push(";");
    lignes.push((en ? "; tables created in the orchestra: " : "; tables créées dans l'orchestre : ") + r.tables.join(", "));
  }
  return lignes.join("\n");
}
