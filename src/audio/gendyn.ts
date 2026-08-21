// audio/gendyn.ts — Synthèse stochastique dynamique, d'après Iannis Xenakis
// (« GENDY », puis GENDY3, 1991).
//
// Xenakis prend le problème de la synthèse par l'autre bout. Plutôt que de
// partir d'un modèle acoustique — des partiels, un filtre, une enveloppe — il
// s'attaque directement à la forme d'onde, considérée comme une simple ligne
// brisée reliant quelques points. Et plutôt que de fixer ces points, il les
// laisse SE DÉPLACER : à chaque période, l'abscisse et l'ordonnée de chaque
// point font un pas aléatoire.
//
// Il n'y a donc ici ni hauteur, ni timbre, ni enveloppe au sens habituel : ces
// notions ne sont plus des paramètres mais des conséquences. La hauteur émerge
// de la somme des durées des segments, le timbre de la forme du polygone, et
// tous deux dérivent d'eux-mêmes puisque les points ne cessent de bouger. C'est
// une musique où l'on ne règle pas le son mais la LOI qui le fait évoluer.
//
// Le dispositif ne tient qu'à une chose : des barrières RÉFLÉCHISSANTES. Sans
// elles, une marche aléatoire finit toujours par s'échapper — les amplitudes
// saturent, les durées deviennent absurdes, et le son meurt. Réfléchies, les
// valeurs restent bornées à jamais tout en continuant de se promener.

export interface OptionsGendyn {
  dureeSec: number;
  sampleRate: number;
  /** Nombre de points de la ligne brisée. Peu de points = son simple ; beaucoup = timbre riche et instable. */
  points: number;
  /** Durée minimale d'un segment, en millisecondes. Fixe la borne aiguë de la dérive. */
  dureeMinMs: number;
  /** Durée maximale d'un segment. Fixe la borne grave. */
  dureeMaxMs: number;
  /** Amplitude du pas de la marche sur les durées, de 0 (figé) à 1 (chaotique). */
  pasTemps: number;
  /** Amplitude du pas de la marche sur les ordonnées. */
  pasAmplitude: number;
  graine: number;
}

/**
 * Barrière réfléchissante : ramène une valeur dans [min, max] en la « faisant
 * rebondir » sur les bords, autant de fois que nécessaire.
 *
 * Ce n'est pas un simple écrêtage, et la différence est tout sauf cosmétique :
 * écrêter colle les valeurs contre les bornes, où elles restent — la marche
 * s'immobilise et le son se fige. La réflexion, elle, renvoie la valeur vers
 * l'intérieur, si bien que la promenade continue indéfiniment sans jamais
 * sortir du domaine.
 */
export function miroir(valeur: number, min: number, max: number): number {
  if (!(max > min)) return min;
  let v = valeur;
  // Boucle plutôt que formule modulaire : un pas peut dépasser plusieurs fois
  // la largeur du domaine, et il faut alors rebondir autant de fois.
  let garde = 0;
  while ((v < min || v > max) && garde++ < 1000) {
    if (v < min) v = 2 * min - v;
    if (v > max) v = 2 * max - v;
  }
  return Math.min(max, Math.max(min, v));
}

/** Générateur déterministe : une même graine doit rendre exactement le même son. */
function alea(graine: number): () => number {
  let etat = (graine | 0) || 1;
  return () => {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    return etat / 0x7fffffff;
  };
}

export function gendyn(options: OptionsGendyn): AudioBuffer {
  const sr = options.sampleRate;
  const n = Math.max(1, Math.round(options.dureeSec * sr));
  const nPoints = Math.max(2, Math.round(options.points));
  const dMin = Math.max(1, (options.dureeMinMs / 1000) * sr);
  const dMax = Math.max(dMin + 1, (options.dureeMaxMs / 1000) * sr);
  const pasT = Math.max(0, Math.min(1, options.pasTemps));
  const pasA = Math.max(0, Math.min(1, options.pasAmplitude));
  const tirage = alea(options.graine);

  // État initial de la ligne brisée : durées et ordonnées tirées au hasard dans
  // leurs domaines respectifs.
  const durees = new Float64Array(nPoints);
  const amplitudes = new Float64Array(nPoints);
  for (let i = 0; i < nPoints; i++) {
    durees[i] = dMin + tirage() * (dMax - dMin);
    amplitudes[i] = tirage() * 2 - 1;
  }

  const out = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = out.getChannelData(0);

  let ecriture = 0;
  while (ecriture < n) {
    // Une période : chaque point fait son pas, puis on trace le polygone.
    for (let i = 0; i < nPoints; i++) {
      durees[i] = miroir(durees[i] + (tirage() * 2 - 1) * pasT * (dMax - dMin), dMin, dMax);
      amplitudes[i] = miroir(amplitudes[i] + (tirage() * 2 - 1) * pasA, -1, 1);
    }
    for (let i = 0; i < nPoints && ecriture < n; i++) {
      const a = amplitudes[i];
      const b = amplitudes[(i + 1) % nPoints];
      const longueur = Math.max(1, Math.round(durees[i]));
      for (let j = 0; j < longueur && ecriture < n; j++) {
        // Interpolation linéaire d'un sommet au suivant : la « ligne brisée »
        // est bien le signal lui-même, pas une enveloppe appliquée à autre chose.
        d[ecriture++] = a + ((b - a) * j) / longueur;
      }
    }
  }
  return out;
}
