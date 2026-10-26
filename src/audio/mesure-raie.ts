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
