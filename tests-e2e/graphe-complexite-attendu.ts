// tests-e2e/graphe-complexite-attendu.ts — Ce que « gestion_graphe_complexite » doit faire entendre,
// calculé à la main AVANT tout lancement, et la façon de le relever dans le son rendu.
//
// ═══ POURQUOI L'ATTENDU EST ÉCRIT EN NOMBRES ═══
//
// Le graphe met ensemble ce que l'application sait faire séparément : trois boucles par passes
// emboîtées (créneau, voix, cercle), une bulle dans une bulle, puis un méta-composant fait par le
// geste « Grouper en outil ». Un test qui comparerait le son à celui d'un premier lancement ne
// dirait rien de la conception : il figerait ce que le moteur rend, juste ou faux. L'attendu vient
// donc de ce que chaque composant et chaque boucle doivent faire, et le calcul est écrit ici en
// clair. AUCUNE FONCTION DE L'APPLICATION N'EST APPELÉE pour le produire : le test fabriquerait
// sinon ce qu'il vérifie.
//
// ═══ LE CALCUL ═══
//
// LA BOUCLE PAR CERCLE. Le cercle mélodique « 1100 », fondamentale 69, réparti sur l'octave, a
// quatre places de trois demi-tons : c0 = {0:69, 1:72}. Chaque tour applique, dans l'ordre de la
// bulle : tourner d'une place, renverser les intervalles autour de la note la plus grave, refléter
// autour de la place zéro. La fin recueille ce que chaque tour produit, et chaque tour part du
// précédent :
//   T c0  = {2:66, 3:69}      T² c0 = {0:63, 1:66}      T³ c0 = {2:60, 3:63}
// Le rendu, à trente tours par minute et un tour par variation, donne une place de 0,5 s :
//   M = 66@1,0  69@1,5 | 63@2,0  66@2,5 | 60@5,0  63@5,5      (six notes, six secondes)
//
// LA POLYPHONIE. La note du créneau (60) donne ses hauteurs à l'arbre « (2/4 (1 1)) » : deux
// noires de 60. L'arbre « (3/4 (1 1 1)) » sur « 48 » en donne trois de 48. Le mélangeur en fait
// deux voix, et la séquence dure 1,5 s ; chaque voix extraite garde cette durée.
//
// LA BOUCLE PAR VOIX. Chaque voix reçoit M à son bout, à 1,5 s, puis chaque note monte d'autant de
// demi-tons que son rang dans SA voix :
//   A' = 60 61 | 66+2 69+3 63+4 66+5 60+6 63+7 = 68 72 67 71 66 70
//   B' = 48 49 50 | 66+3 69+4 63+5 66+6 60+7 63+8 = 69 73 68 72 67 71
//
// LA BOUCLE PAR CRÉNEAU. Le premier créneau se pose à 0 s sur 7,5 s, au facteur 1 ; le second à
// 8 s sur 3,75 s, plié au facteur 0,5. La sortie Audio de la fin rend la réunion en sinus pur, au
// volume 80 : une note pèse vélocité / 127 × 0,32, soit 0,2268 à 90 et 0,2520 à 100, avec une
// attaque de 20 ms et une relâche de 150 ms.
//
// ═══ CE QUE L'ATTENDU SÉPARE ═══
//
// Une boucle de cercle qui ne réinjecterait pas rendrait trois fois {2:66, 3:69}. Une boucle de
// cercle qui ne repartirait pas de zéro à la voix suivante donnerait à la seconde T⁴..T⁶, donc 57.
// Une formule appliquée à la polyphonie entière entrelacerait les rangs. Un créneau non plié
// durerait 7,5 s, et le son 15,5 s. Chacun change au moins un segment du tableau.

/** La fréquence de travail d'un projet qui n'en déclare pas. */
export const FREQUENCE = 44100;
/** La fin du second créneau : 8 + 7,5 / 2. */
export const DUREE_S = 11.75;
export const TRAMES = Math.ceil(DUREE_S * FREQUENCE);
/** Douze exécutions du graphe : deux créneaux, deux voix, trois variations. */
export const PASSES = 2 * 2 * 3;

/** Un moment du son : les notes MIDI qui y sonnent, aucune pour un silence. */
export interface Segment { debut: number; fin: number; notes: number[] }

/** Le premier créneau, tel que la boucle par voix le rend. */
const CRENEAU: readonly Segment[] = [
  { debut: 0, fin: 0.5, notes: [48, 60] },
  { debut: 0.5, fin: 1, notes: [49, 61] },
  { debut: 1, fin: 1.5, notes: [50] },
  { debut: 1.5, fin: 2.5, notes: [] },
  { debut: 2.5, fin: 3, notes: [68, 69] },
  { debut: 3, fin: 3.5, notes: [72, 73] },
  { debut: 3.5, fin: 4, notes: [67, 68] },
  { debut: 4, fin: 4.5, notes: [71, 72] },
  { debut: 4.5, fin: 6.5, notes: [] },
  { debut: 6.5, fin: 7, notes: [66, 67] },
  { debut: 7, fin: 7.5, notes: [70, 71] },
];

/** Le son entier : le créneau à 0 s, un silence, puis le même à 8 s, deux fois plus vite. */
export const SEGMENTS: readonly Segment[] = [
  ...CRENEAU,
  { debut: 7.5, fin: 8, notes: [] },
  ...CRENEAU.map((s) => ({ debut: 8 + s.debut / 2, fin: 8 + s.fin / 2, notes: s.notes })),
];

/**
 * La crête : deux notes de vélocité 100 ensemble, 2 × 0,2520 = 0,504, que deux sinus voisins
 * atteignent à quelques millièmes près en un demi-temps.
 */
export const CRETE = { min: 0.49, max: 0.51 };

/**
 * La valeur efficace globale, par l'énergie de chaque note : g² / 2 × ∫ enveloppe². Une note de
 * 0,5 s y met 0,3867 s, une de 0,25 s 0,1367 s. Cinq notes à 90 et douze à 100 par créneau donnent
 * 0,2666, sur 11,75 s : 0,1506, soit −16,44 dBFS. Les termes croisés de deux sinus voisins
 * l'écartent de quelques centièmes de décibel.
 */
export const RMS_DB = { attendu: -16.44, tolerance: 0.3 };

/** Ce que chaque début et chaque fin de boucle doit annoncer après le dernier tour. */
export const MESSAGES: Readonly<Record<string, readonly string[]>> = {
  "cercle-debut": ["variation 3/3"],
  "cercle-fin": ["3 variations", "4 places"],
  "voix-debut": ["voix 2/2"],
  "voix-fin": ["2 voix réunies", "17 notes", "7.50 s"],
  "creneau-debut": ["créneau 2/2", "8.00 s", "3.75 s"],
  "creneau-fin": ["2 créneaux remplis", "34 notes", "11.75 s", "1 pliés"],
};

// ═══ LE RELEVÉ ═══

const hertz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Les hauteurs cherchées dans chaque segment : toutes celles qu'une erreur plausible ferait sonner. */
const CANDIDATES: readonly number[] = Array.from({ length: 41 }, (_, i) => 40 + i);

/** L'amplitude d'un sinus de fréquence `f` dans la fenêtre, par l'algorithme de Goertzel. */
function amplitude(x: Float32Array, debut: number, fin: number, f: number, taux: number): number {
  const w = (2 * Math.PI * f) / taux;
  const coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = debut; i < fin; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  const re = s1 - s2 * Math.cos(w);
  const im = s2 * Math.sin(w);
  return (2 * Math.hypot(re, im)) / Math.max(1, fin - debut);
}

export interface SegmentReleve {
  debut: number;
  fin: number;
  attendues: number[];
  /** Les hauteurs qui atteignent la moitié de la plus forte, ou rien sous le seuil du silence. */
  entendues: number[];
  /** La valeur efficace de la fenêtre. */
  rms: number;
  /** La plus faible des attendues sur la plus forte des autres : au-dessus de 2, la séparation est nette. */
  marge: number;
}

/** Sous ce niveau, une fenêtre est un silence : −80 dBFS. */
export const SEUIL_SILENCE = 1e-4;

/**
 * Relève chaque segment du tableau dans le canal donné.
 *
 * LA FENÊTRE ÉVITE LES BORDS de cinq ou dix millisecondes, pour ne pas y prendre la note voisine.
 * Une hauteur est entendue quand son amplitude atteint la moitié de la plus forte de la fenêtre.
 */
export function releverSegments(x: Float32Array, taux: number): SegmentReleve[] {
  return SEGMENTS.map((s) => {
    const bord = s.fin - s.debut >= 0.5 ? 0.01 : 0.005;
    const a = Math.round((s.debut + bord) * taux);
    const b = Math.min(x.length, Math.round((s.fin - bord) * taux));
    let carre = 0;
    for (let i = a; i < b; i++) carre += x[i] * x[i];
    const rms = Math.sqrt(carre / Math.max(1, b - a));
    if (rms < SEUIL_SILENCE) {
      return { debut: s.debut, fin: s.fin, attendues: s.notes, entendues: [], rms, marge: Infinity };
    }
    const amps = CANDIDATES.map((m) => ({ m, a: amplitude(x, a, b, hertz(m), taux) }));
    const forte = Math.max(...amps.map((p) => p.a));
    const entendues = amps.filter((p) => p.a >= forte / 2).map((p) => p.m).sort((u, v) => u - v);
    const attendues = amps.filter((p) => s.notes.includes(p.m)).map((p) => p.a);
    const autres = amps.filter((p) => !s.notes.includes(p.m)).map((p) => p.a);
    const marge = attendues.length > 0 ? Math.min(...attendues) / Math.max(1e-12, ...autres) : 0;
    return { debut: s.debut, fin: s.fin, attendues: s.notes, entendues, rms, marge };
  });
}

/** Une ligne lisible par segment, pour qu'un échec dise où le son s'écarte. */
export function decrire(r: SegmentReleve): string {
  const t = `[${r.debut.toFixed(2)} ; ${r.fin.toFixed(2)}]`;
  const att = r.attendues.length ? r.attendues.join("+") : "silence";
  const ent = r.entendues.length ? r.entendues.join("+") : "silence";
  const marge = Number.isFinite(r.marge) ? ` · marge ${r.marge.toFixed(1)}` : "";
  return `${t.padEnd(18)} attendu ${att.padEnd(8)} entendu ${ent.padEnd(8)} · ${(20 * Math.log10(Math.max(r.rms, 1e-9))).toFixed(1)} dB${marge}`;
}
