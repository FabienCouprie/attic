// audio/surechantillonnage-double.ts — Monter une voie à deux fois sa cadence, et l'en redescendre.
//
// ═══ À QUOI IL SERT ═══
//
// Un calcul non linéaire échantillon par échantillon, une tangente hyperbolique par exemple, crée
// des harmoniques au-dessus de la moitié de la cadence, qui se replient alors dans la bande audible
// sous des fréquences sans rapport avec le son. Calculer à deux fois la cadence repousse ce
// repliement d'une octave, et le filtre qui redescend retire ce qui s'est formé au-dessus.
//
// ═══ CE QU'IL CALCULE ═══
//
// Un seul noyau sert aux deux sens : un sinus cardinal coupé au quart de la cadence double, donc à
// la moitié de la cadence d'origine, fenêtré par une fenêtre de Kaiser (β = 8) sur 65 points. C'est
// un filtre demi-bande : un coefficient sur deux est nul hors du centre. Le noyau est CENTRÉ, donc
// à phase nulle : l'échantillon j de la voie double est l'instant j / 2 de la voie d'origine, sans
// retard à rattraper, et la voie rendue a la longueur de la voie reçue.
//
// LA VOIE DOUBLE EST PROLONGÉE de 32 échantillons après la fin, calculés sur le silence qui suit :
// le noyau du retour, centré sur le dernier échantillon, y lit la queue de ce que le calcul du
// milieu a rendu, au lieu d'une coupure nette.
//
// Ce que le noyau laisse passer et ce qu'il retire est tenu, en décibels, par
// `audio/surechantillonnage-double.test.ts`.

/** Le demi-ordre du noyau : 65 points, de −32 à +32. */
const DEMI = 32;
/** Le paramètre de la fenêtre de Kaiser : plus il est grand, plus la réjection est profonde et la transition large. */
const BETA = 8;

/** Le prolongement de la voie double après la fin de la voie, en échantillons de la cadence double. */
export const PROLONGEMENT = DEMI;

function besselI0(x: number): number {
  let somme = 1, terme = 1;
  for (let k = 1; k < 50; k++) { terme *= (x / (2 * k)) ** 2; somme += terme; }
  return somme;
}

/**
 * Le noyau demi-bande, de −32 à +32.
 *
 * SES DEUX PHASES SONT NORMALISÉES CHACUNE À UNE DEMIE. Le coefficient central vaut exactement 0,5 et
 * les coefficients impairs somment à 0,5 : la voie double rend alors chaque échantillon reçu tel
 * quel à son rang pair, et le continu traverse chaque phase à son niveau. Ramener la somme entière à
 * un, sans distinguer les phases, écartait l'échantillon pair de l'échantillon reçu de deux
 * cent-millièmes de sa valeur.
 *
 * EN DOUBLE PRÉCISION, comme le noyau de décimation de l'oscillateur analogique.
 */
export const NOYAU: Float64Array = (() => {
  const h = new Float64Array(2 * DEMI + 1);
  let impairs = 0;
  for (let i = -DEMI; i <= DEMI; i++) {
    const cardinal = i === 0 ? 0.5 : Math.sin((Math.PI * i) / 2) / (Math.PI * i);
    const r = i / DEMI;
    const fenetre = besselI0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / besselI0(BETA);
    h[i + DEMI] = cardinal * fenetre;
    if (i % 2 !== 0) impairs += h[i + DEMI];
  }
  for (let i = -DEMI; i <= DEMI; i++) if (i % 2 !== 0) h[i + DEMI] *= 0.5 / impairs;
  h[DEMI] = 0.5;
  return h;
})();

/**
 * La voie à deux fois sa cadence : 2n échantillons, puis le prolongement.
 *
 * Un zéro est intercalé entre deux échantillons, puis le noyau est appliqué avec un gain de deux,
 * qui rend au son l'énergie que les zéros lui ont retirée.
 */
export function monter(voie: Float32Array): Float64Array {
  const n = voie.length;
  const total = 2 * n + PROLONGEMENT;
  const sortie = new Float64Array(total);
  for (let j = 0; j < total; j++) {
    // y[j] = 2 · Σ h[k] · x'[j − k], où x' porte x[m] au rang 2m et zéro ailleurs : seuls les k de
    // même parité que j comptent.
    let somme = 0;
    for (let k = (j & 1) === 0 ? -DEMI : -DEMI + 1; k <= DEMI; k += 2) {
      const rang = j - k;
      if (rang < 0) break;
      const m = rang >> 1;
      if (m < n) somme += NOYAU[k + DEMI] * voie[m];
    }
    sortie[j] = 2 * somme;
  }
  return sortie;
}

/** La voie ramenée à sa cadence d'origine, sur `longueur` échantillons : le noyau, puis un échantillon sur deux. */
export function redescendre(double: Float64Array, longueur: number): Float32Array {
  const sortie = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) {
    const centre = 2 * i;
    let somme = 0;
    for (let k = -DEMI; k <= DEMI; k++) {
      const rang = centre - k;
      if (rang >= 0 && rang < double.length) somme += NOYAU[k + DEMI] * double[rang];
    }
    sortie[i] = somme;
  }
  return sortie;
}
