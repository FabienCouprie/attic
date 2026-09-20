// audio/euclidien.ts — Rythmes euclidiens (algorithme de Bjorklund).
//
// Répartir N frappes le plus régulièrement possible sur M pas : le problème que Bjorklund
// avait résolu pour les accélérateurs de particules, et dont Godfried Toussaint a montré
// en 2005 qu'il engendre des rythmes traditionnels du monde entier. E(3,8) est le
// tresillo cubain, E(5,8) le cinquillo, E(7,12) le bembé d'Afrique de l'Ouest, E(2,5) le
// rythme coréen. Ce ne sont pas des motifs inventés : ce sont ceux que l'algorithme
// produit, et c'est ce que ce module calcule.
//
// La méthode est celle de l'algorithme d'Euclide appliqué aux restes : on met les frappes
// d'un côté, les silences de l'autre, et l'on distribue les plus petits groupes sur les
// plus grands tant qu'il reste plus d'un reste.

/**
 * Le motif euclidien E(frappes, pas), tourné de `rotation` pas vers la gauche.
 *
 * Le premier pas porte une frappe quand il y en a au moins une : c'est la forme
 * canonique que Toussaint publie, et celle que jouent les musiciens.
 */
export function motifEuclidien(pas: number, frappes: number, rotation = 0): boolean[] {
  const m = Math.max(0, Math.floor(pas));
  if (m === 0) return [];
  const k = Math.max(0, Math.min(m, Math.floor(frappes)));
  if (k === 0) return new Array(m).fill(false);
  if (k === m) return new Array(m).fill(true);

  // Deux familles de groupes : les « un » (une frappe) et les « zéro » (un silence).
  let groupesA: boolean[][] = Array.from({ length: k }, () => [true]);
  let groupesB: boolean[][] = Array.from({ length: m - k }, () => [false]);

  // La distribution a TOUJOURS lieu au moins une fois, puis se poursuit tant que le reste
  // compte plus d'un groupe. Une boucle qui s'arrêterait avant le premier passage rendrait
  // E(3,4) = « xxx. » au lieu du « x.xx » que Toussaint publie — la cumbia, justement.
  while (groupesB.length > 0) {
    const paires = Math.min(groupesA.length, groupesB.length);
    const fusionnes: boolean[][] = [];
    for (let i = 0; i < paires; i++) fusionnes.push([...groupesA[i], ...groupesB[i]]);
    const restesA = groupesA.slice(paires);
    const restesB = groupesB.slice(paires);
    groupesA = fusionnes;
    groupesB = restesA.length > 0 ? restesA : restesB;
    if (groupesB.length <= 1) break;
  }

  const motif = [...groupesA, ...groupesB].flat();
  return tourner(motif, rotation);
}

/** Tourne un motif vers la gauche : la rotation déplace le départ, pas les frappes. */
export function tourner(motif: boolean[], rotation: number): boolean[] {
  const n = motif.length;
  if (n === 0) return [];
  const r = ((Math.floor(rotation) % n) + n) % n;
  return motif.slice(r).concat(motif.slice(0, r));
}

/** Écriture usuelle d'un motif : « x..x..x. ». Sert aux messages et aux tests. */
export function motifEnTexte(motif: boolean[]): string {
  return motif.map((p) => (p ? "x" : ".")).join("");
}

/**
 * Les noms traditionnels que Toussaint relève pour certains couples (frappes, pas).
 * Un rythme reconnu se dit ; les autres restent « E(k,n) », sans folklore inventé.
 */
const NOMS: Record<string, string> = {
  "2,5": "Rythme coréen / khafif-e-ramal",
  "3,4": "Cumbia, calypso",
  "3,8": "Tresillo cubain",
  "4,9": "Rythme turc aksak",
  "5,8": "Cinquillo cubain",
  "5,12": "Venda (Afrique du Sud)",
  "5,16": "Bossa-nova brésilienne",
  "7,8": "Rythme tuvan",
  "7,12": "Bembé d'Afrique de l'Ouest",
  "7,16": "Samba brésilienne",
  "9,16": "Rythme d'Afrique centrale",
  "11,24": "Rythme aka (pygmées)",
};

export function nomTraditionnel(pas: number, frappes: number): string | undefined {
  return NOMS[`${frappes},${pas}`];
}

export interface NoteEuclidienne {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
  canal: number;
}

export interface ConfigEuclidien {
  pas: number;
  frappes: number;
  rotation: number;
  tempo: number;
  /** Durée d'un pas, en fraction de noire : 0,25 = double-croche. */
  pasParNoire: number;
  repetitions: number;
  /** Note MIDI de percussion (canal 9) : 36 grosse caisse, 38 caisse claire, 42 charley. */
  notePercussion: number;
  velocite: number;
  /** Accentuation du premier pas du motif, en plus de la vélocité. */
  accent: number;
}

/** Les notes du motif, répétées, prêtes à être rendues ou écrites en MIDI. */
export function notesEuclidiennes(config: ConfigEuclidien): NoteEuclidienne[] {
  const motif = motifEuclidien(config.pas, config.frappes, config.rotation);
  const dureePas = (60 / Math.max(1, config.tempo)) * Math.max(0.0625, config.pasParNoire);
  const notes: NoteEuclidienne[] = [];
  const repetitions = Math.max(1, Math.floor(config.repetitions));
  for (let r = 0; r < repetitions; r++) {
    for (let i = 0; i < motif.length; i++) {
      if (!motif[i]) continue;
      const debut = (r * motif.length + i) * dureePas;
      const accentue = i === 0 ? Math.min(127, config.velocite + config.accent) : config.velocite;
      notes.push({
        note: config.notePercussion,
        velocite: Math.max(1, Math.round(accentue)),
        debut,
        fin: debut + Math.min(0.12, dureePas * 0.9),
        canal: 9,
      });
    }
  }
  return notes;
}

/** Durée totale de la boucle, en secondes — répétitions comprises. */
export function dureeEuclidienne(config: ConfigEuclidien): number {
  const dureePas = (60 / Math.max(1, config.tempo)) * Math.max(0.0625, config.pasParNoire);
  return Math.max(1, Math.floor(config.repetitions)) * Math.max(0, Math.floor(config.pas)) * dureePas;
}
