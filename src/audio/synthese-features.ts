// audio/synthese-features.ts — Fabriquer un son à partir des quarante mesures qui le décrivent.
//
// CE QUE CE MODULE NE PEUT PAS FAIRE, ET IL FAUT LE DIRE D'ABORD. Le vecteur de caractéristiques
// ne détermine pas un son : il en détermine une classe INFINIE. Deux pistes très différentes
// peuvent partager leur tempo, leur centroïde, leur chroma et leurs coefficients cepstraux. Ce
// module ne « reproduit » donc rien — il fabrique UN son dont le vecteur mesuré s'approche de la
// cible, et la seule preuve possible est de repasser le résultat dans l'extracteur et de regarder
// l'écart. C'est pourquoi `ecartParFamille` fait partie du module et non des tests.
//
// LES QUATRE FAMILLES NE S'INVERSENT PAS ÉGALEMENT.
//
//   TEMPO   — ce n'est pas une mesure à retrouver mais un réglage à poser : on choisit la cadence.
//   CHROMA  — douze poids, douze classes de hauteur à faire sonner dans ces proportions. Direct.
//   CENTROÏDE — pour une série harmonique dont les amplitudes décroissent en 1/k^α, le centroïde
//             est une fonction MONOTONE de α. On inverse donc α par dichotomie, exactement.
//   CEPSTRE — le seul qui résiste. Meyda calcule treize coefficients sur vingt-six bandes mel :
//             remonter donne une enveloppe LISSÉE, puisque treize nombres ne peuvent pas redire ce
//             que vingt-six bandes contenaient. C'est à cela que servent les MFCC — jeter ce
//             détail —, et aucune inversion ne le rendra.
//
// LES VARIANCES CEPSTRALES sont le cas le plus mou, et le module ne prétend pas mieux : elles
// disent « le timbre bouge de tant » sans dire comment. On fait osciller l'enveloppe jusqu'à
// approcher la variance visée, ce qui choisit une trajectoire parmi une infinité.

/** L'échelle mel, dans la forme usuelle — celle des bancs de filtres. */
export const melDepuisHz = (hz: number) => 1127 * Math.log(1 + Math.max(0, hz) / 700);
export const hzDepuisMel = (mel: number) => 700 * (Math.exp(mel / 1127) - 1);

/** Le découpage en bandes du vecteur, tel que `features-piste.ts` l'écrit. */
export interface CibleFeatures {
  tempo: number;
  centroide: number;
  /** Douze poids, un par classe de hauteur, do en tête. */
  chroma: number[];
  /** Moyennes des coefficients cepstraux. */
  cepstreMoyennes: number[];
  /** Variances des mêmes. */
  cepstreVariances: number[];
}

/** Relit un vecteur de quarante nombres d'après ses étiquettes. */
export function lireCible(vecteur: readonly number[], etiquettes: readonly string[]): CibleFeatures {
  const cible: CibleFeatures = { tempo: 120, centroide: 2000, chroma: [], cepstreMoyennes: [], cepstreVariances: [] };
  etiquettes.forEach((l, i) => {
    const v = vecteur[i] ?? 0;
    if (l.startsWith("Tempo")) cible.tempo = v;
    else if (l.startsWith("Centroïde")) cible.centroide = v;
    else if (l.startsWith("Chroma")) cible.chroma.push(v);
    else if (l.endsWith("(moyenne)")) cible.cepstreMoyennes.push(v);
    else if (l.endsWith("(variance)")) cible.cepstreVariances.push(v);
  });
  return cible;
}

/**
 * Le centroïde d'une série harmonique dont les amplitudes décroissent en 1/k^alpha.
 *
 * Écrit à part parce que c'est la fonction qu'on inverse : sans elle sous les yeux, on ne voit pas
 * qu'elle est monotone, et l'on chercherait une solution approchée là où il y en a une exacte.
 */
export function centroideDeSerie(f0: number, nPartiels: number, alpha: number): number {
  let numerateur = 0, denominateur = 0;
  for (let k = 1; k <= nPartiels; k++) {
    const a = Math.pow(k, -alpha);
    numerateur += a * k * f0;
    denominateur += a;
  }
  return denominateur > 0 ? numerateur / denominateur : f0;
}

/**
 * Le centroïde du spectre RÉELLEMENT produit : la série inclinée ET pondérée par l'enveloppe.
 *
 * C'EST LA FONCTION QU'IL FAUT INVERSER, et non la précédente. Le premier jet inversait la série
 * nue, puis appliquait l'enveloppe cepstrale par-dessus — laquelle déplaçait le centroïde qu'on
 * venait d'ajuster. Mesuré sur le tour complet : **53 % d'écart** au lieu des moins de trente
 * attendus. Inverser ce que l'on produit vraiment, et non ce qu'on produirait sans l'enveloppe,
 * est la différence entre un réglage et un vœu.
 */
export function centroideProduit(
  f0: number, nPartiels: number, alpha: number, enveloppe: Float64Array, frequence: number,
): number {
  let numerateur = 0, denominateur = 0;
  for (let k = 1; k <= nPartiels; k++) {
    const f = f0 * k;
    if (f >= frequence / 2) break;
    const a = Math.pow(k, -alpha) * gainAFrequence(enveloppe, f, frequence);
    numerateur += a * f;
    denominateur += a;
  }
  return denominateur > 0 ? numerateur / denominateur : f0;
}

/**
 * La décroissance qui donne le centroïde visé, par dichotomie.
 *
 * Bornée à [-2, 8] : au-delà, la série n'a plus de sens musical — à −2 les partiels aigus
 * écrasent la fondamentale, à 8 il ne reste qu'elle. Hors de portée, on rend la borne la plus
 * proche plutôt que de diverger, et le tour complet montrera l'écart.
 *
 * Avec une enveloppe, c'est le spectre produit qu'on inverse ; sans, la série nue.
 */
export function alphaPourCentroide(
  cible: number, f0: number, nPartiels: number,
  enveloppe?: Float64Array, frequence = 44100,
): number {
  const mesurer = (alpha: number) => (enveloppe
    ? centroideProduit(f0, nPartiels, alpha, enveloppe, frequence)
    : centroideDeSerie(f0, nPartiels, alpha));
  let bas = -2, haut = 8;
  if (mesurer(haut) > cible) return haut;
  if (mesurer(bas) < cible) return bas;
  for (let i = 0; i < 60; i++) {
    const milieu = (bas + haut) / 2;
    if (mesurer(milieu) > cible) bas = milieu; else haut = milieu;
  }
  return (bas + haut) / 2;
}

/**
 * L'enveloppe spectrale que des coefficients cepstraux décrivent.
 *
 * DCT inverse sur les bandes mel, puis exponentielle : c'est l'inverse du chemin que prend le
 * calcul des MFCC — banc mel, logarithme, DCT. Les coefficients manquants valent zéro, ce qui
 * revient à dire que l'enveloppe ne varie pas plus vite qu'eux ne le décrivent.
 *
 * Rend un gain par bande mel, normalisé sur son maximum : les MFCC ne portent pas le niveau
 * absolu, seulement la forme, et prétendre le contraire ferait sortir des sons dont le volume
 * dépendrait de l'enregistrement d'origine.
 */
export function enveloppeDepuisCepstre(coeffs: readonly number[], nBandes = 26): Float64Array {
  const bandes = new Float64Array(nBandes);
  for (let n = 0; n < nBandes; n++) {
    let somme = 0;
    for (let k = 0; k < coeffs.length; k++) {
      somme += coeffs[k] * Math.cos((Math.PI * k * (n + 0.5)) / nBandes);
    }
    bandes[n] = Math.exp(somme / nBandes);
  }
  const max = Math.max(...bandes);
  return max > 0 ? Float64Array.from(bandes, (v) => v / max) : bandes.fill(1);
}

/** Le gain de l'enveloppe à une fréquence donnée, par interpolation entre bandes mel. */
export function gainAFrequence(enveloppe: Float64Array, hz: number, frequence: number): number {
  const melMax = melDepuisHz(frequence / 2);
  const position = (melDepuisHz(hz) / melMax) * (enveloppe.length - 1);
  if (!Number.isFinite(position) || position < 0) return enveloppe[0] ?? 1;
  if (position >= enveloppe.length - 1) return enveloppe[enveloppe.length - 1] ?? 1;
  const i = Math.floor(position), f = position - i;
  return enveloppe[i] * (1 - f) + enveloppe[i + 1] * f;
}

export interface OptionsSynthese {
  dureeSec: number;
  frequence: number;
  /** Octave de la fondamentale des notes jouées. */
  octave: number;
  nPartiels: number;
  graine: number;
}

/** Générateur reproductible : une graine donnée rejoue le même son. */
function tirage(graine: number): () => number {
  let g = (graine | 0) || 1;
  return () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
}

/**
 * La suite des classes de hauteur à jouer, pour que leurs proportions soient celles du chroma.
 *
 * RÉPARTITION EXACTE ET NON TIRAGE AU SORT, et c'est une correction mesurée. Le premier jet tirait
 * chaque note au sort selon les poids ; sur seize notes, le bruit d'échantillonnage suffisait à
 * faire ressortir une autre classe dominante que celle visée — le tour complet rendait « do » là
 * où la cible disait « mi ». Un chroma est une distribution, et quand on peut RÉPARTIR plutôt
 * qu'échantillonner, échantillonner n'ajoute que de la variance.
 *
 * La répartition se fait au plus fort reste, puis les classes sont entrelacées plutôt que posées
 * en blocs : douze do suivis de huit mi donneraient un chroma juste et une musique qui ne l'est
 * pas.
 */
export function sequenceClasses(chroma: readonly number[], nNotes: number, alea?: () => number): number[] {
  const poids = chroma.map((v) => Math.max(0, v));
  const total = poids.reduce((a, b) => a + b, 0);
  if (total <= 0 || nNotes <= 0) return new Array(Math.max(0, nNotes)).fill(0);

  const exacts = poids.map((p) => (p / total) * nNotes);
  const comptes = exacts.map(Math.floor);
  let reste = nNotes - comptes.reduce((a, b) => a + b, 0);
  // Le plus fort reste emporte les notes qui manquent après l'arrondi vers le bas.
  const ordre = exacts.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; k < ordre.length && reste > 0; k++, reste--) comptes[ordre[k].i]++;

  // Entrelacement : on prend une note à la classe qui en a le plus à placer, tour après tour.
  const restants = [...comptes];
  const suite: number[] = [];
  while (suite.length < nNotes) {
    let meilleur = -1;
    for (let i = 0; i < restants.length; i++) if (restants[i] > 0 && (meilleur < 0 || restants[i] > restants[meilleur])) meilleur = i;
    if (meilleur < 0) break;
    suite.push(meilleur);
    restants[meilleur]--;
  }

  // BRASSER L'ORDRE, EN GARDANT LES PROPORTIONS. L'entrelacement régulier fabrique une période
  // courte — trois classes qui tournent donnent un cycle de trois notes — et le détecteur de tempo
  // se cale dessus plutôt que sur le battement : mesuré, 40 battements par minute rendus pour 120
  // demandés, soit exactement le tiers. Un brassage à graine fixe supprime cette période sans
  // toucher aux comptes, qui restent exacts.
  if (alea) {
    for (let i = suite.length - 1; i > 0; i--) {
      const j = Math.floor(alea() * (i + 1));
      [suite[i], suite[j]] = [suite[j], suite[i]];
    }
  }
  return suite;
}

/**
 * Le son.
 *
 * Une note par battement, sa classe de hauteur tirée selon le chroma, son spectre donné par
 * l'enveloppe cepstrale et incliné pour atteindre le centroïde visé. Chaque note a une attaque
 * franche et une décroissance : sans elles le détecteur de tempo n'aurait rien à détecter, et le
 * tempo — pourtant la plus simple des quatre familles — ne reviendrait pas.
 */
export function synthetiser(cible: CibleFeatures, o: OptionsSynthese): Float32Array {
  const n = Math.max(1, Math.round(o.dureeSec * o.frequence));
  const sortie = new Float32Array(n);
  const alea = tirage(o.graine);
  const enveloppe = enveloppeDepuisCepstre(cible.cepstreMoyennes);
  const parBattement = Math.max(0.05, 60 / Math.max(1, cible.tempo));
  const echParNote = Math.round(parBattement * o.frequence);

  // Ce que la variance cepstrale demande : de combien l'enveloppe doit bouger d'une note à l'autre.
  const variance = cible.cepstreVariances.reduce((a, b) => a + b, 0) / Math.max(1, cible.cepstreVariances.length);
  const amplitudeVariation = Math.min(0.9, Math.sqrt(Math.max(0, variance)) / 20);

  const suite = sequenceClasses(cible.chroma, Math.max(1, Math.ceil(n / echParNote)), alea);
  let rang = 0;
  for (let debut = 0; debut < n; debut += echParNote, rang++) {
    const classe = suite[rang % suite.length];
    const f0 = 440 * Math.pow(2, (classe - 9) / 12 + (o.octave - 4));
    // L'enveloppe est passée à l'inversion : c'est le spectre PRODUIT qu'on ajuste, et non la
    // série nue que l'enveloppe déformerait ensuite.
    const alpha = alphaPourCentroide(cible.centroide, f0, o.nPartiels, enveloppe, o.frequence);
    // L'inclinaison varie d'une note à l'autre, d'autant que la variance visée est grande.
    const inclinaison = alpha * (1 + (alea() * 2 - 1) * amplitudeVariation);
    const longueur = Math.min(echParNote, n - debut);

    for (let k = 1; k <= o.nPartiels; k++) {
      const f = f0 * k;
      if (f >= o.frequence / 2) break;
      const gain = Math.pow(k, -inclinaison) * gainAFrequence(enveloppe, f, o.frequence);
      const phase = alea() * 2 * Math.PI;
      for (let i = 0; i < longueur; i++) {
        // Attaque de cinq millisecondes puis décroissance exponentielle : une note, pas un palier.
        const t = i / o.frequence;
        const attaque = Math.min(1, t / 0.005);
        const chute = Math.exp(-7 * t / parBattement);
        sortie[debut + i] += gain * attaque * chute * Math.sin(2 * Math.PI * f * t + phase);
      }
    }
  }

  // Normalisation : le vecteur ne porte pas le niveau absolu, et un son qui sature ne se mesure pas.
  let crete = 0;
  for (let i = 0; i < n; i++) crete = Math.max(crete, Math.abs(sortie[i]));
  if (crete > 0) for (let i = 0; i < n; i++) sortie[i] = (sortie[i] / crete) * 0.9;
  return sortie;
}

export interface EcartFamille {
  famille: string;
  /** Écart relatif moyen, entre 0 et 1 et au-delà. Zéro : la cible est atteinte. */
  ecart: number;
}

/**
 * L'écart entre un vecteur visé et un vecteur obtenu, famille par famille.
 *
 * RELATIF ET NON ABSOLU, parce que les quatre familles n'ont ni les mêmes unités ni les mêmes
 * ordres de grandeur : un écart de cinq sur un tempo de 120 n'est pas un écart de cinq sur un
 * coefficient cepstral qui vaut 0,3. Le rapporter à la taille de la cible est la seule façon de
 * mettre les quatre sur la même page.
 */
export function ecartParFamille(
  vise: readonly number[], obtenu: readonly number[], etiquettes: readonly string[],
): EcartFamille[] {
  const familles = new Map<string, { somme: number; compte: number }>();
  etiquettes.forEach((l, i) => {
    const f = l.startsWith("Tempo") ? "tempo"
      : l.startsWith("Centroïde") ? "centroïde"
      : l.startsWith("Chroma") ? "chroma"
      : l.endsWith("(variance)") ? "cepstre (variance)" : "cepstre (moyenne)";
    const a = vise[i] ?? 0, b = obtenu[i] ?? 0;
    const echelle = Math.max(Math.abs(a), 1e-9);
    const courant = familles.get(f) ?? { somme: 0, compte: 0 };
    courant.somme += Math.abs(b - a) / echelle;
    courant.compte++;
    familles.set(f, courant);
  });
  return [...familles].map(([famille, { somme, compte }]) => ({ famille, ecart: somme / compte }));
}
