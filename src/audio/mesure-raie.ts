// audio/mesure-raie.ts — Combien un traitement fabrique de parasites, en décibels.
//
// POURQUOI CE MODULE EXISTE, ET IL ARRIVE EN TROISIÈME. `interpolation.test.ts` et
// `sf2-ratio.test.ts` portaient CHACUN sa copie de cette mesure, identiques au paramètre `n` près —
// celle du second disant d'ailleurs « même mesure qu'`interpolation` » dans son commentaire, ce qui
// est l'aveu d'une seconde écriture. Mesurer la conversion de fréquence en demandait une troisième,
// et c'était le moment de n'en avoir qu'une : deux écritures d'une règle finissent toujours par se
// séparer, et une mesure qui se sépare de son jumeau rend deux chiffres incomparables.
//
// ═══ LA FRÉQUENCE DE SORTIE DOIT TOMBER SUR UN RANG EXACT, ET C'EST TOUT CE QUI REND CECI MESURABLE ═══
//
// LA LEÇON EST PAYÉE, et elle est à garder sous les yeux de qui emploie ceci. Un premier jet
// d'`interpolation.test.ts` fenêtrait en Hann et écartait trois rangs de part et d'autre. Il
// annonçait 46,9 dB en linéaire et 47,0 en cubique — un gain de 0,1 dB, c'est-à-dire rien. C'était
// faux, et le nombre le disait : les deux interpolateurs touchaient LE MÊME PLAFOND, donc ce plafond
// n'était pas le leur. C'était la fuite de sa propre fenêtre qu'il mesurait.
//
// Quand la fréquence de sortie vaut exactement `k × frequence / n`, le signal boucle sur la fenêtre :
// une transformée sans fenêtrage ne fuit alors sur aucun autre rang, et tout ce qui n'est pas au
// rang `k` est bel et bien fabriqué par le traitement. ON CHOISIT DONC LA FRÉQUENCE DE SORTIE
// D'ABORD, et l'on en déduit celle de la source.

/**
 * Le rapport, en décibels, entre la raie attendue au rang `rang` et toute l'énergie restante.
 *
 * `y` doit porter au moins `n` échantillons, `n` être une puissance de deux, et la fréquence de la
 * raie tomber sur `rang` exactement — voir l'en-tête, qui dit ce qu'il advient sinon.
 */
export function raieSurParasites(y: ArrayLike<number>, rang: number, n: number): number {
  let signal = 0, reste = 0;
  for (let k = 1; k < n >> 1; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const w = (-2 * Math.PI * k * i) / n;
      a += y[i] * Math.cos(w);
      b += y[i] * Math.sin(w);
    }
    const p = a * a + b * b;
    if (k === rang) signal += p; else reste += p;
  }
  return 10 * Math.log10(signal / Math.max(reste, 1e-30));
}

// ═══ LA HAUTEUR D'UNE RAIE, BALAYÉE AU VINGTIÈME DE CENT ═══
//
// L'AUTRE QUESTION, QUAND LA FRÉQUENCE N'EST PAS CHOISIE : où tombe la raie qu'un composant rend. La
// transformée se calcule alors directement à la fréquence essayée, sous une fenêtre de Hann, sans
// rang ni puissance de deux. `audio/tone-synths.test.ts` l'écrivait pour lui seul, balayée au
// demi-cent ; la corde de Karplus-Strong en demandait une seconde, et elle vit désormais ici.
//
// L'AUTOCORRÉLATION À RETARD ENTIER NE SUFFIT PAS DANS L'AIGU : à 44,1 kHz, la période d'un do7 vaut
// 21,07 échantillons, et un échantillon d'écart y fait quatre-vingts cents.

/** Le module de la transformée de `x[i0 … i0+n[`, sous Hann, à la fréquence `f`. */
function moduleSousHann(x: ArrayLike<number>, i0: number, n: number, f: number, sr: number): number {
  const w = (2 * Math.PI * f) / sr;
  // LA ROTATION SE FAIT PAR RÉCURRENCE, un produit complexe par échantillon : deux trigonométriques
  // par échantillon et par fréquence essayée rendaient la mesure d'une note aiguë de plusieurs
  // secondes. En double précision, sur une demi-seconde, l'erreur cumulée reste sous 1e-10.
  const cw = Math.cos(w), sw = Math.sin(w);
  let c = 1, s = 0, re = 0, im = 0;
  for (let k = 0; k < n; k++) {
    const v = (x[i0 + k] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1)));
    re += v * c;
    im -= v * s;
    const c2 = c * cw - s * sw;
    s = s * cw + c * sw;
    c = c2;
  }
  return Math.hypot(re, im);
}

/**
 * L'amplitude de la raie de fréquence `f` sur `[debut, fin]` secondes de `x`, sous Hann : la moitié
 * du module, normalisée par la somme de la fenêtre, si bien qu'un sinus d'amplitude A rend A.
 */
export function amplitudeDeRaie(x: ArrayLike<number>, sr: number, debut: number, fin: number, f: number): number {
  const i0 = Math.round(debut * sr), n = Math.max(2, Math.round((fin - debut) * sr));
  return (2 * moduleSousHann(x, i0, n, f, sr)) / ((n - 1) / 2);
}

/**
 * La fréquence de la raie la plus forte entre `fMin` et `fMax`, sur `[debut, fin]` secondes de `x`.
 *
 * DEUX BALAYAGES : au cent sur tout l'intervalle, puis au vingtième de cent sur deux cents de part
 * et d'autre du meilleur. Le lobe principal d'une fenêtre de Hann d'un dixième de seconde déjà couvre
 * plusieurs dizaines de cents dans le grave : un pas d'un cent ne peut pas sauter le sommet.
 */
export function raieLaPlusForte(
  x: ArrayLike<number>, sr: number, debut: number, fin: number, fMin: number, fMax: number,
): number {
  const i0 = Math.round(debut * sr), n = Math.max(2, Math.round((fin - debut) * sr));
  const balayer = (de: number, a: number, pas: number) => {
    let meilleure = de, plusHaute = -1;
    for (let f = de; f <= a; f *= pas) {
      const m = moduleSousHann(x, i0, n, f, sr);
      if (m > plusHaute) { plusHaute = m; meilleure = f; }
    }
    return meilleure;
  };
  const grossiere = balayer(fMin, fMax, 2 ** (1 / 1200));
  return balayer(grossiere * 2 ** (-2 / 1200), grossiere * 2 ** (2 / 1200), 2 ** (1 / 24000));
}

/** L'écart entre deux fréquences, en cents, signé. */
export const centsEntre = (obtenue: number, attendue: number) => 1200 * Math.log2(obtenue / attendue);
