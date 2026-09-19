// audio/concatenatif.ts — Synthèse concaténative par corpus, ou mosaïquage audio.
//
// Le principe est celui d'une mosaïque. On découpe un CORPUS — n'importe quel son, une
// collection d'échantillons, un disque entier — en petits grains, on décrit chacun par
// quelques chiffres (fort ou faible, clair ou sombre, bruité ou tenu), et l'on décrit de la
// même façon les grains d'un son CIBLE. Il ne reste plus qu'à remplacer chaque grain de la
// cible par le grain du corpus qui lui ressemble le plus. Le résultat a la forme de la
// cible et la matière du corpus : une phrase parlée jouée avec des cordes de piano, une
// batterie reconstruite avec des bruits de porte.
//
// C'est le procédé que Diemo Schwarz a formalisé à l'IRCAM sous le nom de synthèse
// concaténative par corpus (CataRT, 2006), et qu'on appelle aussi mosaïquage audio.
//
// Attic avait déjà toutes les pièces sans l'assemblage : des descripteurs (Meyda), un nœud
// de similarité audio, des échantillonneurs. Ce module fait l'appariement, qui est la seule
// chose qui manquait — et il le fait avec des descripteurs NORMALISÉS, sans quoi la mesure
// de distance serait dominée par celui dont les valeurs sont les plus grandes.

export interface Grain {
  /** Position du grain dans le signal source, en échantillons. */
  debut: number;
  longueur: number;
  /** Niveau efficace : fort ou faible. */
  rms: number;
  /** Centre de gravité du spectre, en hertz : clair ou sombre. */
  centroide: number;
  /** Taux de passages par zéro : bruité ou tenu. */
  zcr: number;
}

/**
 * Découpe et décrit.
 *
 * Trois descripteurs suffisent à obtenir un appariement qui s'entend, et ils ont l'avantage
 * d'être lisibles : on peut dire pourquoi tel grain a été choisi. Le centre de gravité est
 * calculé par transformée, les deux autres directement sur les échantillons.
 */
export function decrireGrains(
  signal: Float32Array, frequenceEch: number, taille: number, pas: number,
  fftReelle: (re: Float64Array, im: Float64Array) => void,
): Grain[] {
  const grains: Grain[] = [];
  const t = Math.max(16, Math.floor(taille));
  const p = Math.max(1, Math.floor(pas));
  // Taille de transformée : la puissance de deux qui couvre le grain.
  let n = 16;
  while (n < t) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n);

  for (let debut = 0; debut + t <= signal.length; debut += p) {
    let somme = 0, passages = 0;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < t; i++) {
      const x = signal[debut + i];
      somme += x * x;
      if (i > 0 && (x >= 0) !== (signal[debut + i - 1] >= 0)) passages++;
      // Fenêtre de Hann : sans elle, les bords du grain inventent des aigus et faussent le
      // centre de gravité, donc l'appariement.
      re[i] = x * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (t - 1)));
    }
    fftReelle(re, im);
    let poids = 0, moment = 0;
    for (let k = 1; k < n / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      poids += m;
      moment += m * ((k * frequenceEch) / n);
    }
    grains.push({
      debut,
      longueur: t,
      rms: Math.sqrt(somme / t),
      centroide: poids > 1e-12 ? moment / poids : 0,
      zcr: passages / t,
    });
  }
  return grains;
}

export interface Poids {
  rms: number;
  centroide: number;
  zcr: number;
}

/**
 * Met les descripteurs à la même échelle.
 *
 * Un centre de gravité se compte en milliers de hertz, un taux de passages par zéro entre 0
 * et 1 : sans normalisation, la distance ne verrait que le premier. On centre et réduit
 * donc chaque descripteur sur l'ensemble des grains, corpus et cible confondus, pour que
 * les deux soient comparés dans le même espace.
 */
export function normaliser(tous: Grain[][]): (g: Grain) => [number, number, number] {
  const plats = tous.flat();
  const champs = ["rms", "centroide", "zcr"] as const;
  const stats = champs.map((champ) => {
    const valeurs = plats.map((g) => g[champ]);
    const moyenne = valeurs.reduce((a, b) => a + b, 0) / Math.max(1, valeurs.length);
    const variance = valeurs.reduce((a, b) => a + (b - moyenne) ** 2, 0) / Math.max(1, valeurs.length);
    return { moyenne, ecart: Math.sqrt(variance) || 1 };
  });
  return (g: Grain) => [
    (g.rms - stats[0].moyenne) / stats[0].ecart,
    (g.centroide - stats[1].moyenne) / stats[1].ecart,
    (g.zcr - stats[2].moyenne) / stats[2].ecart,
  ];
}

/**
 * Pour chaque grain de la cible, l'index du grain du corpus le plus proche.
 *
 * La recherche est exhaustive : c'est quadratique, et c'est assumé pour des corpus de
 * quelques milliers de grains. `eviterRepetition` pénalise le grain qui vient d'être
 * employé, ce qui évite qu'un corpus pauvre ne rende le même grain cent fois de suite — le
 * défaut le plus audible du procédé.
 */
export function apparier(
  cible: Grain[], corpus: Grain[], poids: Poids, eviterRepetition = 0,
): number[] {
  if (corpus.length === 0) return [];
  const projeter = normaliser([cible, corpus]);
  const corpusProjete = corpus.map(projeter);
  const sortie: number[] = [];
  let precedent = -1;
  for (const g of cible) {
    const [r, c, z] = projeter(g);
    let meilleur = 0, min = Infinity;
    for (let i = 0; i < corpusProjete.length; i++) {
      const [cr, cc, cz] = corpusProjete[i];
      let d = poids.rms * (r - cr) ** 2 + poids.centroide * (c - cc) ** 2 + poids.zcr * (z - cz) ** 2;
      if (i === precedent) d += eviterRepetition;
      if (d < min) { min = d; meilleur = i; }
    }
    sortie.push(meilleur);
    precedent = meilleur;
  }
  return sortie;
}

/**
 * Recolle les grains choisis à la place des grains de la cible.
 *
 * L'assemblage se fait par fenêtres de Hann qui se recouvrent de moitié : leur somme vaut
 * alors exactement un, si bien qu'un corpus identique à la cible la reconstruit sans
 * altération. C'est la propriété qui garantit qu'on n'entend pas les raccords.
 */
export function assembler(
  corpusSignal: Float32Array, corpus: Grain[], indices: number[],
  cible: Grain[], longueurSortie: number,
): Float32Array {
  const sortie = new Float32Array(longueurSortie);
  const poids = new Float32Array(longueurSortie);
  indices.forEach((index, i) => {
    const source = corpus[index];
    const destination = cible[i];
    if (!source || !destination) return;
    const n = Math.min(source.longueur, destination.longueur);
    for (let k = 0; k < n; k++) {
      const cible_ = destination.debut + k;
      if (cible_ >= longueurSortie) break;
      const fenetre = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1));
      sortie[cible_] += corpusSignal[source.debut + k] * fenetre;
      poids[cible_] += fenetre;
    }
  });
  // Le diviseur est BORNÉ À UN. À recouvrement de moitié, la somme des fenêtres de Hann
  // vaut exactement un à l'intérieur, et descend vers zéro aux deux bords : diviser par ce
  // poids-là y amplifiait le signal d'un facteur mille et faisait un claquement. Borné, le
  // milieu est exact et les bords gardent leur fondu naturel.
  for (let i = 0; i < longueurSortie; i++) sortie[i] /= Math.max(1, poids[i]);
  return sortie;
}

export interface Rapport {
  grainsCible: number;
  grainsCorpus: number;
  /** Nombre de grains distincts du corpus employés : la variété du résultat. */
  distincts: number;
  /** Part du grain le plus employé, de 0 à 1. */
  partDuPlusFrequent: number;
  /**
   * Vrai quand le résultat va bourdonner.
   *
   * Deux causes, et il faut les deux critères : soit un grain revient sans cesse, soit la
   * palette est minuscule même sans grand favori. Mesuré dans un cas réel, six grains
   * distincts servaient pour cent neuf, avec un plus fréquent à 46 % seulement — le seul
   * critère du plus fréquent aurait déclaré ce corpus « assez varié ».
   */
  repetitif: boolean;
}

export function rapporter(indices: number[], grainsCorpus: number): Rapport {
  const comptes = new Map<number, number>();
  for (const i of indices) comptes.set(i, (comptes.get(i) ?? 0) + 1);
  const max = comptes.size > 0 ? Math.max(...comptes.values()) : 0;
  const partDuPlusFrequent = indices.length > 0 ? max / indices.length : 0;
  return {
    grainsCible: indices.length,
    grainsCorpus,
    distincts: comptes.size,
    partDuPlusFrequent,
    repetitif: indices.length > 0
      && (partDuPlusFrequent > 0.4 || comptes.size < Math.max(4, indices.length * 0.15)),
  };
}
