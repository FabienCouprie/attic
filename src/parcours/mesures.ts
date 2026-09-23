// parcours/mesures.ts — L'examinateur : ce qu'on mesure du son soumis, et ce qu'on en conclut.
//
// POURQUOI UNE ÉPREUVE SE MESURE PLUTÔT QUE DE SE REGARDER. Un exercice de structure — « pose ceci,
// relie cela » — enseigne le geste ; il ne dit rien du résultat, et l'on peut le réussir en ayant
// tout branché de travers. Une épreuve demande l'inverse : elle ne prescrit aucun chemin, elle
// exige un son qui TIENNE une propriété. « Amène-moi un son dont la sonie est à −14 LUFS sans
// dépasser −1 dBTP » se réussit avec un normaliseur, avec un compresseur suivi d'un gain, ou à la
// main : c'est l'élève qui choisit, et la mesure qui tranche.
//
// LES MESURES SONT CELLES DU LOGICIEL, PAS DES MESURES DE CIRCONSTANCE. La sonie, le vrai pic, le
// facteur de crête viennent de `audio/vumetre.ts`, celui-là même qu'affiche le VU-mètre : une
// épreuve ne peut donc pas déclarer réussi ce que le VU-mètre du catalogue déclarerait raté. Ce
// serait la faute la plus sournoise qu'un parcours puisse commettre — enseigner un chiffre qui
// n'existe que dans le parcours.
//
// CE QU'ON N'A PAS PRIS AU VU-MÈTRE, et pourquoi. La corrélation entre canaux, l'équilibre
// gauche-droite et les deux parts de bande sont calculés ici : le vu-mètre ne les connaît pas, et
// les trois disent des choses qu'un débutant doit apprendre à entendre — la largeur, le
// déséquilibre, et le fait qu'un son « trop sourd » est une question d'énergie sous 200 hertz et
// non de goût.
//
// LA HAUTEUR, ELLE, EST PRISE AU SUIVEUR DU CATALOGUE — le pYIN de `audio/hauteur.ts`, celui qu'un
// élève vient justement de brancher au chapitre de la hauteur. Une épreuve de justesse qui aurait
// eu son propre détecteur aurait pu annoncer un écart de trente cents là où le nœud en montre
// cinq, et personne n'aurait su lequel croire.
//
// LE SON SOUMIS N'EST PAS RELU EN ENTIER. Huit fenêtres réparties sur toute la durée suffisent à
// savoir où est l'énergie, et huit secondes suffisent à une hauteur médiane, quand tout relire
// coûterait des secondes sur une pièce de trois minutes — et la vue, elle, mesure à chaque fois
// qu'on le lui demande.

import { mesurerNiveau } from "../audio/vumetre";
import { hauteurMediane, partVoisee, suivreHauteur } from "../audio/hauteur";
import { fft } from "../audio/fft";
import { fenetreHann } from "../audio/stft";
import { chiffre } from "./conditions";
import type { Cible, Grandeur, Point } from "./types";

/** Le minimum qu'on exige d'un son pour le mesurer — un `AudioBuffer` en est un. */
export interface SonSoumis {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(canal: number): Float32Array;
}

/** Ce qu'on sait d'un son soumis. */
export interface MesureCopie {
  dureeSec: number;
  canaux: number;
  lufs: number;
  vraiPicDb: number;
  creteDb: number;
  facteurCreteDb: number;
  plageDynamiqueDb: number;
  /** Entre les deux canaux : 1 pour un son mono, 0 pour deux canaux sans rapport. */
  correlation: number;
  /** Écart de niveau entre canaux, en décibels. Zéro pour un mono. */
  equilibreDb: number;
  /** Part de l'énergie sous 200 Hz, en pour-cent. */
  partGravePc: number;
  /** Part de l'énergie au-dessus de 4 kHz, en pour-cent. */
  partAiguPc: number;
  /** Hauteur médiane des trames tenues, en hertz. Zéro quand aucune hauteur ne se tient. */
  hauteurHz: number;
  /** Écart au demi-ton le plus proche, en cents. `NaN` sans hauteur — et non zéro, qui se lirait juste. */
  justesseCents: number;
  /** Part des trames où une hauteur se tient, en pour-cent. */
  partVoiseePc: number;
  /** Écart SIGNÉ au demi-ton le plus proche, en cents : négatif en dessous, positif au-dessus. */
  ecartCents: number;
  /** Le demi-ton le plus proche, nommé — « A4 » pour un la 440. Vide sans hauteur tenue. */
  noteProche: string;
}

// `plageDynamiqueDb` A ÉTÉ RÉPARÉE DEPUIS, ET L'HISTOIRE VAUT D'ÊTRE GARDÉE. Elle annonçait 103 dB
// sur une boucle de batterie étirée — chiffre exact au sens où il était bien l'écart entre la sonie
// momentanée la plus forte et la plus faible, et sans aucun sens pour qui apprend, puisqu'un seul
// blanc suffisait à l'obtenir. Une épreuve écrite dessus se réussissait en laissant traîner un
// silence, et c'est pour cela que l'épreuve de la matière porte sur la densité et la couleur.
// La cause était plus profonde que cette grandeur : la sonie intégrée elle-même moyennait des
// décibels et ne gardait rien. Depuis sa réparation, la plage suit EBU Tech 3342 — blocs de trois
// secondes, porte relative, centiles — et vaut zéro sur un son qui ne varie pas.

const FENETRE = 2048;
const FENETRES_MAX = 8;
const GRAVE_HZ = 200;
const AIGU_HZ = 4000;

/** La corrélation de deux canaux, au sens de Pearson centré sur zéro. */
function correlationCanaux(g: Float32Array, d: Float32Array): number {
  let sgg = 0, sdd = 0, sgd = 0;
  const n = Math.min(g.length, d.length);
  for (let i = 0; i < n; i++) { sgg += g[i] * g[i]; sdd += d[i] * d[i]; sgd += g[i] * d[i]; }
  const den = Math.sqrt(sgg * sdd);
  return den > 1e-20 ? sgd / den : 1;
}

/** Le niveau efficace d'un canal, en décibels. */
function efficaceDb(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const rms = Math.sqrt(s / Math.max(1, x.length));
  return rms > 1e-12 ? 20 * Math.log10(rms) : -120;
}

/**
 * Où est l'énergie : la part sous 200 Hz et celle au-dessus de 4 kHz, en pour-cent.
 *
 * Un son plus court qu'une fenêtre n'a pas de spectre exploitable — on rend alors zéro plutôt
 * qu'un chiffre inventé sur du remplissage, qui aurait l'air d'une mesure.
 */
export function partsDeBande(son: SonSoumis): { gravePc: number; aiguPc: number } {
  const n = son.length;
  if (n < FENETRE) return { gravePc: 0, aiguPc: 0 };
  const canal = son.getChannelData(0);
  const pas = Math.max(FENETRE, Math.floor((n - FENETRE) / Math.max(1, FENETRES_MAX - 1)));
  const w = fenetreHann(FENETRE);
  const spectre = new Float64Array(FENETRE / 2);
  for (let debut = 0; debut + FENETRE <= n; debut += pas) {
    const re = new Float64Array(FENETRE);
    const im = new Float64Array(FENETRE);
    for (let i = 0; i < FENETRE; i++) re[i] = canal[debut + i] * w[i];
    fft(re, im, false);
    for (let k = 0; k < FENETRE / 2; k++) spectre[k] += re[k] * re[k] + im[k] * im[k];
  }
  let total = 0, grave = 0, aigu = 0;
  const parBin = son.sampleRate / FENETRE;
  for (let k = 0; k < FENETRE / 2; k++) {
    const f = k * parBin;
    total += spectre[k];
    if (f < GRAVE_HZ) grave += spectre[k];
    else if (f > AIGU_HZ) aigu += spectre[k];
  }
  if (total <= 0) return { gravePc: 0, aiguPc: 0 };
  return { gravePc: (grave / total) * 100, aiguPc: (aigu / total) * 100 };
}

/**
 * La hauteur du son, prise au suiveur pYIN du catalogue.
 *
 * DEUX CHOIX À DÉFENDRE. D'abord, ce sont `suivreHauteur` et `hauteurMediane` de `audio/hauteur.ts`,
 * c'est-à-dire exactement ce qu'affiche le nœud « Suiveur de hauteur » : une épreuve de justesse ne
 * peut donc pas contredire le nœud avec lequel l'élève la prépare. Ensuite, la médiane des trames
 * tenues plutôt qu'une moyenne — une seule trame fautive, sur une attaque ou un silence, décalerait
 * une moyenne de plusieurs demi-tons.
 *
 * L'analyse s'arrête aux huit premières secondes. Le coût est d'une transformée par trame, soit
 * quelques dizaines de millisecondes par seconde de son : sur une pièce de trois minutes, tout lire
 * coûterait plusieurs secondes à chaque rendu, pour une hauteur médiane que les huit premières
 * secondes donnent déjà.
 */
const SECONDES_HAUTEUR = 8;

/** Les douze noms, à l'anglaise : ce sont ceux des numéros MIDI, dans les deux langues du logiciel. */
const NOMS_DEMI_TONS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Le nom du demi-ton d'un numéro MIDI : 69 donne « A4 ». */
export function nomDemiTon(midi: number): string {
  const n = Math.round(midi);
  return `${NOMS_DEMI_TONS[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

export interface MesureHauteur {
  hauteurHz: number;
  justesseCents: number;
  partVoiseePc: number;
  ecartCents: number;
  noteProche: string;
}

export function mesurerHauteur(son: SonSoumis): MesureHauteur {
  const n = Math.min(son.length, Math.round(SECONDES_HAUTEUR * son.sampleRate));
  const rien = { hauteurHz: 0, justesseCents: Number.NaN, partVoiseePc: 0, ecartCents: Number.NaN, noteProche: "" };
  if (n < son.sampleRate * 0.05) return rien;
  const suivi = suivreHauteur(son.getChannelData(0).subarray(0, n), son.sampleRate);
  const f = hauteurMediane(suivi);
  const partVoiseePc = partVoisee(suivi) * 100;
  if (f <= 0) return { ...rien, partVoiseePc };
  // Le demi-ton le plus proche autour de 440 Hz : douze fois le logarithme en base deux du rapport
  // donne le numéro du demi-ton — 69 pour le la — et ce qui reste est l'écart en cents.
  const demiTons = 12 * Math.log2(f / 440);
  const ecartCents = (demiTons - Math.round(demiTons)) * 100;
  return {
    hauteurHz: f,
    justesseCents: Math.abs(ecartCents),
    partVoiseePc,
    ecartCents,
    noteProche: nomDemiTon(69 + Math.round(demiTons)),
  };
}

/** Ce qu'on peut ne pas demander : le suivi de hauteur, qui coûte une transformée par trame. */
export interface OptionsMesure {
  /** Faux pour sauter le suivi pYIN. Les champs de hauteur sont alors vides, non calculés à blanc. */
  hauteur?: boolean;
}

const SANS_HAUTEUR: MesureHauteur = {
  hauteurHz: 0, justesseCents: Number.NaN, partVoiseePc: 0, ecartCents: Number.NaN, noteProche: "",
};

/** Tout ce qu'une épreuve peut demander d'un son, mesuré d'un coup. */
export function mesurerCopie(son: SonSoumis, o: OptionsMesure = {}): MesureCopie {
  const niveau = mesurerNiveau(son as unknown as AudioBuffer);
  const stereo = son.numberOfChannels >= 2;
  const g = son.getChannelData(0);
  const d = stereo ? son.getChannelData(1) : g;
  const { gravePc, aiguPc } = partsDeBande(son);
  return {
    dureeSec: son.length / son.sampleRate,
    canaux: son.numberOfChannels,
    lufs: niveau.lufs,
    vraiPicDb: niveau.vraiPicDb,
    creteDb: niveau.peakDb,
    facteurCreteDb: niveau.crestFactorDb,
    plageDynamiqueDb: niveau.plageDynamiqueDb,
    correlation: stereo ? correlationCanaux(g, d) : 1,
    equilibreDb: stereo ? efficaceDb(g) - efficaceDb(d) : 0,
    partGravePc: gravePc,
    partAiguPc: aiguPc,
    ...(o.hauteur === false ? SANS_HAUTEUR : mesurerHauteur(son)),
  };
}

/** La grandeur demandée, lue sur la mesure. */
export function valeurDe(m: MesureCopie, g: Grandeur): number {
  switch (g) {
    case "duree": return m.dureeSec;
    case "canaux": return m.canaux;
    case "lufs": return m.lufs;
    case "vraiPic": return m.vraiPicDb;
    case "crete": return m.creteDb;
    case "facteurCrete": return m.facteurCreteDb;
    case "plageDynamique": return m.plageDynamiqueDb;
    case "correlation": return m.correlation;
    case "equilibre": return m.equilibreDb;
    case "partGrave": return m.partGravePc;
    case "partAigu": return m.partAiguPc;
    case "hauteur": return m.hauteurHz;
    case "justesse": return m.justesseCents;
    case "partVoisee": return m.partVoiseePc;
  }
}

/** L'unité dans laquelle chaque grandeur se dit. */
export const UNITES: Record<Grandeur, string> = {
  duree: " s", canaux: "", lufs: " LUFS", vraiPic: " dBTP", crete: " dBFS",
  facteurCrete: " dB", plageDynamique: " dB", correlation: "", equilibre: " dB",
  partGrave: " %", partAigu: " %", hauteur: " Hz", justesse: " cents", partVoisee: " %",
};

/** Un écart de niveau se lit en valeur absolue : à gauche ou à droite, c'est le même défaut. */
const ABSOLUES = new Set<Grandeur>(["equilibre"]);

/** La valeur retenue pour la comparaison — celle que l'épreuve juge. */
export const valeurJugee = (m: MesureCopie, g: Grandeur): number =>
  ABSOLUES.has(g) ? Math.abs(valeurDe(m, g)) : valeurDe(m, g);

/** La cible est-elle tenue par cette mesure ? */
export function cibleTenue(c: Cible, m: MesureCopie): boolean {
  const v = valeurJugee(m, c.grandeur);
  if (!Number.isFinite(v)) return false;
  if (c.min !== undefined && v < c.min) return false;
  if (c.max !== undefined && v > c.max) return false;
  return true;
}

/**
 * Le verdict d'une épreuve : l'exigence, suivie de ce qu'on a mesuré.
 *
 * LA PHRASE EST LA MÊME, RÉUSSIE OU RATÉE. Seule la coche change. Cacher le chiffre mesuré en cas
 * d'échec priverait l'élève de la seule chose qui lui permette de corriger : savoir de combien il
 * est loin. « −8,2 LUFS » n'est pas un reproche, c'est une indication de route.
 */
/** Les grandeurs qui n'existent que si une hauteur se tient. */
const DE_HAUTEUR = new Set<Grandeur>(["hauteur", "justesse"]);

export function jugerCibles(cibles: readonly Cible[], m: MesureCopie | null): Point[] {
  return cibles.map((c) => {
    // SANS HAUTEUR TENUE, ON LE DIT. Un écart en cents mesuré sur du bruit ou du silence n'est pas
    // un chiffre : le rendre comme tel ferait croire à une mesure ratée là où il n'y a rien à
    // mesurer, et l'élève chercherait à corriger une justesse qui n'existe pas.
    if (m && DE_HAUTEUR.has(c.grandeur) && m.hauteurHz <= 0) {
      return {
        satisfait: false,
        texte: `${c.exigence} — aucune hauteur tenue n'a été trouvée dans ce son.`,
        texteEn: `${c.exigenceEn} — no sustained pitch was found in this sound.`,
      };
    }
    if (!m) {
      return {
        satisfait: false,
        texte: `${c.exigence} — rien n'est encore branché sur l'entrée « Son à mesurer », ou rien n'a été lancé.`,
        texteEn: `${c.exigenceEn} — nothing is wired into the « Sound to measure » input yet, or nothing has been run.`,
      };
    }
    const v = valeurJugee(m, c.grandeur);
    const dit = (en: boolean) => `${chiffre(v, en)}${UNITES[c.grandeur]}`;
    return {
      satisfait: cibleTenue(c, m),
      texte: `${c.exigence} — mesuré : ${dit(false)}.`,
      texteEn: `${c.exigenceEn} — measured: ${dit(true)}.`,
    };
  });
}
