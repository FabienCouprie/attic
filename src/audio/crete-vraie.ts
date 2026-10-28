// audio/crete-vraie.ts — La crête vraie selon BS.1770-4 : la plus haute valeur ENTRE les échantillons.
//
// ═══ POURQUOI CE MODULE EXISTE ═══
//
// LA « CRÊTE VRAIE » DU DÉPÔT N'EN ÉTAIT PAS UNE, relevé le 2026-10-28. `vumetre.ts` la calculait par
// interpolation LINÉAIRE entre deux échantillons, et une droite entre deux points ne dépasse jamais
// le plus grand des deux : |a(1 − t) + bt| ≤ (1 − t)|a| + t|b| ≤ max(|a|, |b|). La valeur annoncée en
// dBTP était donc toujours la crête des échantillons. Le VU-mètre l'affichait, la fiche de son du
// parcours jugeait dessus « le vrai pic reste sous −1 dBTP », et le Normaliseur en tirait son plafond.
// Or un sinus à un quart de la cadence, déphasé de 45°, a ses échantillons à 0,707 de sa crête : une
// sortie annoncée à −3 dBTP pouvait toucher 0 dB une fois convertie en analogique.
//
// ═══ CE QU'IL CALCULE ═══
//
// La méthode de l'annexe 2 de la recommandation UIT-R BS.1770-4 : suréchantillonner par quatre et
// prendre la plus grande valeur absolue. Les trois points intermédiaires de chaque intervalle sont
// rendus par un sinus cardinal fenêtré de Kaiser, huit coefficients de chaque côté et β = 6. Réglé
// sur la mesure : de 50 Hz à 21,6 kHz à 48 kHz, cinq phases chacun, l'erreur sur la crête d'un sinus
// n'excède pas 0,0053 dB ; le sinus à fs/4 déphasé de 45° est lu à −0,0004 dB de sa crête. Douze
// coefficients ne faisaient pas mieux (0,0067 dB) pour moitié plus de calcul, et six, la longueur de
// l'exemple que donne la norme, s'écartaient jusqu'à 0,068 dB.
//
// CE QUE LA MÉTHODE NE DIT PAS, ET QUE LA NORME ADMET : un pic qui tombe entre deux points du
// suréchantillonnage est lu un peu bas, d'autant plus que sa fréquence est haute. C'est la limite
// connue d'un facteur quatre.
//
// ═══ ET IL EST EXACT EN SAUTANT ═══
//
// Interpoler chaque intervalle coûte quarante-huit multiplications par échantillon et par canal.
// Mais une valeur interpolée ne peut pas dépasser la norme L1 du filtre fois le plus grand
// échantillon de sa fenêtre : quand cette borne reste sous la crête déjà trouvée, l'intervalle ne
// peut rien changer et il est sauté. Une seconde borne, plus serrée, prend les quatre échantillons
// centraux au mot et ne majore que la queue. Le résultat est le même, au bit près, que sans saut.
// Relevé sur un morceau masterisé de 214 s en stéréo : 923 ms au premier jet, 605 ms avec le filtre
// court et les trois phases d'un seul passage, 219 ms une fois la première borne prise par blocs.
// Avec une borne exacte par échantillon, 1,2 million d'intervalles sur 20,6 franchissaient la
// première, et 9 960 seulement la seconde : c'était le calcul des bornes qui coûtait, non
// l'interpolation.

const DEMI = 8;
const BETA = 6;
const TAILLE = 2 * DEMI;

function besselI0(x: number): number {
  let somme = 1, terme = 1;
  for (let k = 1; k < 40; k++) { terme *= (x / (2 * k)) ** 2; somme += terme; }
  return somme;
}

/** Les trois phases intermédiaires (un quart, une moitié, trois quarts), chacune sur 2 × DEMI échantillons. */
const PHASES: Float64Array[] = [1, 2, 3].map((p) => {
  const decalage = p / 4, h = new Float64Array(2 * DEMI);
  for (let k = -DEMI + 1; k <= DEMI; k++) {
    const x = k - decalage, r = x / DEMI;
    const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
    h[k + DEMI - 1] = sinc * besselI0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / besselI0(BETA);
  }
  return h;
});

const [H1, H2, H3] = PHASES;

/** Le plus grand gain qu'une phase peut donner à une fenêtre bornée par 1. */
const L1_MAX = Math.max(...PHASES.map((h) => h.reduce((s, v) => s + Math.abs(v), 0)));

/** Les quatre coefficients centraux de chaque phase, qui portent x[i − 1] à x[i + 2]. */
const CENTRE = DEMI - 2;
/** Ce que les douze autres coefficients d'une phase peuvent ajouter, au plus, à une fenêtre bornée par 1. */
const QUEUE_L1 = PHASES.map((h) => h.reduce((s, v, k) => (k >= CENTRE && k < CENTRE + 4 ? s : s + Math.abs(v)), 0));

/**
 * Une borne de l'intervalle [i, i + 1] plus serrée que la norme L1 entière : la contribution exacte
 * des quatre échantillons centraux, plus ce que la queue peut ajouter au plus. Douze multiplications
 * au lieu de quarante-huit, et la plupart des intervalles d'un passage fort s'arrêtent là.
 */
// LES DOUZE COEFFICIENTS CENTRAUX SONT DES CONSTANTES, et non des cases de tableau : cette borne est
// consultée sur presque chaque échantillon d'un passage fort, et douze lectures de mémoire de moins
// par appel s'y voient.
const [c10, c11, c12, c13] = PHASES[0].slice(CENTRE, CENTRE + 4);
const [c20, c21, c22, c23] = PHASES[1].slice(CENTRE, CENTRE + 4);
const [c30, c31, c32, c33] = PHASES[2].slice(CENTRE, CENTRE + 4);
const [Q1, Q2, Q3] = QUEUE_L1;

function borneCentrale(x: Float32Array, i: number, maxFenetre: number): number {
  const n = x.length;
  const a = i >= 1 ? x[i - 1] : 0, b = x[i], c = i + 1 < n ? x[i + 1] : 0, d = i + 2 < n ? x[i + 2] : 0;
  let s1 = c10 * a + c11 * b + c12 * c + c13 * d, s2 = c20 * a + c21 * b + c22 * c + c23 * d;
  let s3 = c30 * a + c31 * b + c32 * c + c33 * d;
  s1 = (s1 < 0 ? -s1 : s1) + Q1 * maxFenetre;
  s2 = (s2 < 0 ? -s2 : s2) + Q2 * maxFenetre;
  s3 = (s3 < 0 ? -s3 : s3) + Q3 * maxFenetre;
  return s1 > s2 ? (s1 > s3 ? s1 : s3) : (s2 > s3 ? s2 : s3);
}

/** La longueur d'un bloc : la fenêtre d'un intervalle du bloc k tient dans les blocs k − 1, k et k + 1. */
const BLOC = DEMI;

/**
 * Le plus grand |x| de chaque bloc de huit échantillons, en une seule passe.
 *
 * LA BORNE SE PREND PAR BLOCS ET NON PAR ÉCHANTILLON, et c'est mesuré. La fenêtre de l'intervalle
 * [i, i + 1] va de i − 7 à i + 8 ; pour tout i du bloc k, elle tient dans les blocs k − 1 à k + 1, et
 * le plus grand de ces trois maxima la borne, un peu largement mais sûrement. Calculer le maximum
 * exact de chaque fenêtre coûtait 322 ms sur les 446 de la mesure entière d'un morceau de 214 s en
 * stéréo, pour seulement 1,2 million d'intervalles sur 20,6 qui méritaient ensuite un regard.
 */
function maximaDeBlocs(x: Float32Array): Float32Array {
  const blocs = new Float32Array(Math.ceil(x.length / BLOC) + 1);
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]), k = (i / BLOC) | 0;
    if (v > blocs[k]) blocs[k] = v;
  }
  return blocs;
}

/** La borne des fenêtres de tous les intervalles du bloc k. */
const borneDeBloc = (blocs: Float32Array, k: number) =>
  Math.max(k > 0 ? blocs[k - 1] : 0, blocs[k], blocs[k + 1] ?? 0);

/**
 * La valeur absolue la plus haute entre x[i] et x[i + 1], échantillons hors du tampon comptés nuls.
 *
 * LES TROIS PHASES SE CALCULENT D'UN SEUL PASSAGE, chaque échantillon lu une fois pour les trois.
 * Le chemin sans test de bornes est celui de presque tous les intervalles ; seuls les huit premiers
 * et les huit derniers d'un tampon prennent l'autre.
 */
function creteIntervalle(x: Float32Array, i: number): number {
  const debut = i - DEMI + 1;
  let s1 = 0, s2 = 0, s3 = 0;
  if (debut >= 0 && debut + TAILLE <= x.length) {
    for (let k = 0; k < TAILLE; k++) {
      const v = x[debut + k];
      s1 += H1[k] * v; s2 += H2[k] * v; s3 += H3[k] * v;
    }
  } else {
    for (let k = 0; k < TAILLE; k++) {
      const j = debut + k;
      if (j < 0 || j >= x.length) continue;
      const v = x[j];
      s1 += H1[k] * v; s2 += H2[k] * v; s3 += H3[k] * v;
    }
  }
  return Math.max(Math.abs(s1), Math.abs(s2), Math.abs(s3));
}

/**
 * L'enveloppe de crête vraie : pour chaque intervalle [i, i + 1], la plus haute valeur absolue sur
 * tous les canaux, échantillons compris. Seuls les intervalles dont la borne dépasse `seuil` sont
 * interpolés ; les autres reçoivent la crête de leurs échantillons, dont on sait alors qu'elle et la
 * valeur vraie restent toutes deux sous `seuil`.
 */
export function enveloppeCreteVraie(canaux: Float32Array[], seuil = 0): Float32Array {
  const n = canaux[0]?.length ?? 0, env = new Float32Array(n);
  for (const x of canaux) {
    const blocs = maximaDeBlocs(x);
    for (let k = 0; k * BLOC < n; k++) {
      const borne = borneDeBloc(blocs, k), fin = Math.min(n, (k + 1) * BLOC);
      const regarder = borne * L1_MAX > seuil;
      for (let i = k * BLOC; i < fin; i++) {
        const xi = x[i] < 0 ? -x[i] : x[i], xs = i + 1 < n ? (x[i + 1] < 0 ? -x[i + 1] : x[i + 1]) : 0;
        const a = xi > xs ? xi : xs;
        const v = regarder && borneCentrale(x, i, borne) > (seuil > a ? seuil : a) ? Math.max(a, creteIntervalle(x, i)) : a;
        if (v > env[i]) env[i] = v;
      }
    }
  }
  return env;
}

/** La crête vraie de plusieurs canaux, en valeur linéaire. */
export function creteVraie(canaux: Float32Array[]): number {
  let m = 0;
  for (const x of canaux) {
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > m) m = Math.abs(x[i]);
  }
  for (const x of canaux) {
    const blocs = maximaDeBlocs(x);
    for (let k = 0; k * BLOC < x.length; k++) {
      const borne = borneDeBloc(blocs, k);
      if (borne * L1_MAX <= m) continue;
      const fin = Math.min(x.length, (k + 1) * BLOC);
      for (let i = k * BLOC; i < fin; i++) {
        if (borneCentrale(x, i, borne) <= m) continue;
        const v = creteIntervalle(x, i);
        if (v > m) m = v;
      }
    }
  }
  return m;
}

/** La crête vraie d'un tampon en dBTP, avec le plancher de −120 du VU-mètre pour un silence. */
export function creteVraieDb(buffer: AudioBuffer): number {
  const canaux = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const m = creteVraie(canaux);
  return m > 1e-9 ? 20 * Math.log10(m) : -120;
}
