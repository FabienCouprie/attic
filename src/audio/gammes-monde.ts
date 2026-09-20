// audio/gammes-monde.ts — Les gammes que le tempérament égal ne sait pas écrire.
//
// CE QUI MANQUAIT, ET CE QUE CELA DIT DU CATALOGUE. Le nœud Gamme connaît sept modes d'église et
// deux pentatoniques ; le nœud Tempérament connaît les tempéraments occidentaux historiques. Ni
// maqam, ni raga, ni gamelan. Ce n'est pas un oubli de liste : c'est que ces systèmes ne tiennent
// PAS dans les douze demi-tons égaux. Le maqam Rast a une tierce à mi-chemin entre la majeure et
// la mineure ; les shrutis indiennes divisent l'octave en vingt-deux degrés inégaux ; le slendro
// javanais n'a ni octave juste ni intervalle égal. Les écrire demande des CENTS, pas des numéros
// de note — et c'est pour cela que ce module ne rend jamais de notes MIDI mais des écarts mesurés.
//
// LES SOURCES DES CHIFFRES. Les maqamat suivent la division en quarts de ton adoptée au Congrès du
// Caire de 1932, qui reste la référence écrite même si les praticiens en dévient. Les ragas sont
// donnés dans le système des shrutis en intonation juste, tel que le codifie la tradition
// hindoustanie. Les gammes de gamelan sont des MOYENNES : chaque ensemble javanais ou balinais est
// accordé pour lui-même, et deux gamelans ne jouent pas la même gamme — c'est une propriété du
// genre, pas une imprécision de la mesure, et le nœud le dit plutôt que de laisser croire à une
// norme.
//
// POURQUOI CELA RÉPOND À LA COURBE DE DISSONANCE. L'exemple central de Sethares est précisément le
// gamelan : les métallophones ont des spectres inharmoniques, et slendro comme pelog suivent ces
// spectres plutôt que la série harmonique. Brancher un enregistrement de gamelan sur « Courbe de
// dissonance » et comparer les creux obtenus aux degrés listés ici est la vérification que
// Sethares propose lui-même.

export interface GammeMonde {
  id: string;
  nom: string;
  nomEn: string;
  /** Famille : « maqam », « raga », « gamelan », « autre ». */
  famille: string;
  /** Les degrés, en cents depuis la tonique. Le dernier n'est pas forcément 1200. */
  cents: number[];
  /** Ce que le lecteur doit savoir avant de s'en servir. */
  note: string;
  noteEn: string;
}

/** Un quart de ton du système du Caire : cinquante cents. */
const Q = 50;

export const GAMMES: GammeMonde[] = [
  // ── MAQAMAT ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "rast", nom: "Maqam Rast", nomEn: "Maqam Rast", famille: "maqam",
    cents: [0, 200, 350, 500, 700, 900, 1050, 1200],
    note: "Le maqam le plus répandu, et celui par qui l'on entend d'emblée ce que le tempérament égal ne sait pas écrire : sa tierce à 350 cents tombe à mi-chemin entre la mineure et la majeure. Aucune touche de piano n'y est.",
    noteEn: "The most widespread maqam, and the one that immediately makes audible what equal temperament cannot write: its third at 350 cents falls midway between minor and major. No piano key sits there.",
  },
  {
    id: "bayati", nom: "Maqam Bayati", nomEn: "Maqam Bayati", famille: "maqam",
    cents: [0, 150, 300, 500, 700, 800, 1000, 1200],
    note: "Sa seconde à 150 cents — un trois-quarts de ton — est ce qui le distingue du mode phrygien, dont il partage tout le reste.",
    noteEn: "Its second at 150 cents — three quarters of a tone — is what distinguishes it from the Phrygian mode, with which it shares everything else.",
  },
  {
    id: "hijaz", nom: "Maqam Hijaz", nomEn: "Maqam Hijaz", famille: "maqam",
    cents: [0, 100, 400, 500, 700, 800, 1000, 1200],
    note: "Le seul des quatre qui s'écrive sans quart de ton : sa seconde augmentée de 300 cents entre le premier et le troisième degré existe telle quelle au piano. C'est aussi pourquoi il voyage le mieux.",
    noteEn: "The only one of the four that writes without quarter tones: its 300-cent augmented second between the first and third degrees exists as such on the piano. That is also why it travels best.",
  },
  {
    id: "saba", nom: "Maqam Saba", nomEn: "Maqam Saba", famille: "maqam",
    cents: [0, 150, 300, 400, 700, 800, 1000, 1200],
    note: "Sa quarte diminuée à 400 cents fait que l'octave n'est pas atteinte par les mêmes degrés en montant et en descendant. C'est le maqam dont la structure résiste le plus à l'idée de gamme.",
    noteEn: "Its diminished fourth at 400 cents means the octave is not reached by the same degrees going up and coming down. It is the maqam whose structure most resists the idea of a scale.",
  },
  // ── RAGAS ────────────────────────────────────────────────────────────────────────────────────
  {
    id: "bhairav", nom: "Raga Bhairav", nomEn: "Raga Bhairav", famille: "raga",
    cents: [0, 90, 386, 498, 702, 792, 1088, 1200],
    note: "Les degrés sont donnés en intonation juste, comme les shrutis les définissent : la tierce à 386 cents est la tierce majeure pure, et non les 400 cents du piano. Les deux komal — seconde et sixième — descendent à 90 et 792.",
    noteEn: "The degrees are given in just intonation, as the shrutis define them: the third at 386 cents is the pure major third, not the piano's 400. The two komal degrees — second and sixth — fall to 90 and 792.",
  },
  {
    id: "yaman", nom: "Raga Yaman", nomEn: "Raga Yaman", famille: "raga",
    cents: [0, 204, 386, 590, 702, 884, 1088, 1200],
    note: "Le lydien de l'Inde, à ceci près que sa quarte augmentée vaut 590 cents et non 600 : un tritempérament juste plutôt qu'une demi-octave.",
    noteEn: "India's Lydian, except that its augmented fourth is 590 cents and not 600: a just tritone rather than half an octave.",
  },
  {
    id: "todi", nom: "Raga Todi", nomEn: "Raga Todi", famille: "raga",
    cents: [0, 90, 294, 590, 702, 792, 1088, 1200],
    note: "Trois degrés abaissés et une quarte augmentée : c'est le raga le plus éloigné de tout mode occidental, et celui sur lequel l'écart entre intonation juste et tempérament égal s'entend le mieux.",
    noteEn: "Three lowered degrees and an augmented fourth: the raga furthest from any Western mode, and the one where the gap between just intonation and equal temperament is most audible.",
  },
  // ── GAMELAN ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "slendro", nom: "Slendro (gamelan)", nomEn: "Slendro (gamelan)", famille: "gamelan",
    cents: [0, 231, 474, 717, 955, 1208],
    note: "Cinq degrés presque également espacés, à quelque 240 cents — ni un ton ni une tierce mineure, rien qui existe ailleurs. Et l'octave y vaut 1208 cents et non 1200 : elle est ÉTIRÉE, comme le sont les spectres des métallophones qui la jouent. Ces valeurs sont une moyenne : chaque gamelan est accordé pour lui-même, et deux ensembles ne jouent pas la même gamme.",
    noteEn: "Five almost equally spaced degrees, at some 240 cents — neither a tone nor a minor third, nothing that exists elsewhere. And the octave here is 1208 cents, not 1200: it is STRETCHED, as are the spectra of the metallophones that play it. These values are an average: each gamelan is tuned for itself, and two ensembles do not play the same scale.",
  },
  {
    id: "pelog", nom: "Pelog (gamelan)", nomEn: "Pelog (gamelan)", famille: "gamelan",
    cents: [0, 120, 258, 539, 675, 785, 942, 1206],
    note: "Sept degrés franchement inégaux, dont on ne joue d'ordinaire que cinq à la fois. Comme le slendro, il est une moyenne d'accords réels et son octave est légèrement étirée.",
    noteEn: "Seven markedly unequal degrees, of which usually only five are played at a time. Like slendro, it is an average of real tunings and its octave is slightly stretched.",
  },
  // ── AUTRES ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "shruti22", nom: "Les vingt-deux shrutis", nomEn: "The twenty-two shrutis", famille: "raga",
    cents: [0, 90, 112, 182, 204, 294, 316, 386, 408, 498, 520, 590, 612, 702, 792, 814, 884, 906, 996, 1018, 1088, 1110, 1200],
    note: "La division complète de l'octave dont les ragas tirent leurs degrés. Vingt-deux intervalles inégaux, tous en rapports simples : ce n'est pas une gamme dont on joue tous les degrés, c'est le réservoir où les ragas puisent les leurs.",
    noteEn: "The complete division of the octave from which ragas draw their degrees. Twenty-two unequal intervals, all in simple ratios: it is not a scale one plays through, but the reservoir from which ragas take theirs.",
  },
];

/** Une gamme par son identifiant. */
export const gammeParId = (id: string): GammeMonde | undefined => GAMMES.find((g) => g.id === id);

/** Les écarts entre degrés successifs, en cents. */
export function intervalles(g: GammeMonde): number[] {
  return g.cents.slice(1).map((c, i) => c - g.cents[i]);
}

/**
 * Les fréquences d'une gamme, depuis une tonique donnée.
 *
 * En hertz et non en numéros de note MIDI : un degré à 350 cents ne tombe sur aucune touche, et
 * l'arrondir au demi-ton le plus proche détruirait précisément ce qui fait la gamme.
 */
export function frequences(g: GammeMonde, tonique: number): number[] {
  return g.cents.map((c) => tonique * Math.pow(2, c / 1200));
}

/**
 * L'écart de chaque degré au demi-ton tempéré le plus proche.
 *
 * C'est le chiffre qui dit ce qu'un clavier perd : zéro, la touche existe ; cinquante, le degré
 * tombe exactement entre deux touches et aucun clavier ne peut le jouer.
 */
export function ecartAuTempere(g: GammeMonde): number[] {
  return g.cents.map((c) => {
    const demiTon = Math.round(c / 100) * 100;
    return c - demiTon;
  });
}

/** Les degrés qu'un clavier à douze touches ne peut pas jouer, au-delà d'une tolérance. */
export function degresInjouables(g: GammeMonde, toleranceCents = 20): number[] {
  return ecartAuTempere(g)
    .map((e, i) => (Math.abs(e) > toleranceCents ? g.cents[i] : -1))
    .filter((c) => c >= 0);
}
