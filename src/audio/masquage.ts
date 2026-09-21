// audio/masquage.ts — Ce qu'une piste rend inaudible dans une autre.
//
// D'après Eberhard Zwicker, « Subdivision of the Audible Frequency Range into Critical Bands »,
// Journal of the Acoustical Society of America 33(2), 1961, pour l'échelle des bandes critiques ;
// et Manfred Schroeder, Brian Atal et Joseph Hall, « Optimizing digital speech coders by
// exploiting masking properties of the human ear », JASA 66(6), 1979, pour la fonction
// d'étalement — celle que les codeurs perceptifs emploient depuis.
//
// CE QUI MANQUAIT. Attic sait dire ce qu'un mixage perd en mono — c'est le goniomètre — et mesure
// niveau, centroïde, rolloff, corrélation de phase. Aucun nœud ne dit ce qu'une piste CACHE. C'est
// pourtant la question qu'on se pose vraiment devant un mixage qui ne dégage pas : non pas « cette
// piste est-elle trop forte », mais « qu'est-ce qu'elle rend inaudible ».
//
// CE QUE LE MODÈLE DIT, ET POURQUOI IL EST ASYMÉTRIQUE. Un son fort élève le seuil d'audition
// autour de lui, et pas également des deux côtés : il masque BEAUCOUP plus vers l'aigu que vers le
// grave. C'est une conséquence de la mécanique de la cochlée, où l'onde progresse du grave vers
// l'aigu. D'où la grosse caisse qui mange le bas-médium sans toucher les cymbales, et la voix qui
// recouvre tout ce qui est au-dessus d'elle. La fonction de Schroeder donne cette pente en une
// ligne :
//
//     SF(Δz) = 15,81 + 7,5·(Δz + 0,474) − 17,5·√(1 + (Δz + 0,474)²)   décibels
//
// où `Δz` est l'écart en bandes critiques. Elle culmine à zéro sur le masquant lui-même et tombe
// de part et d'autre, mais pas au même rythme. Les valeurs, calculées : **−4,3 dB une bande
// au-dessus contre −7,9 une bande en dessous** ; à trois bandes, **−21,4 contre −50,7**. L'écart
// se creuse avec la distance, et c'est là que le modèle devient franc — loin du masquant, la pente
// vaut environ dix décibels par bande vers l'aigu et vingt-cinq vers le grave. Ces deux chiffres-là
// sont les pentes ASYMPTOTIQUES et non les valeurs à une bande, que la courbure près du sommet
// rend bien plus douces : les confondre fait annoncer un masquage trois fois trop fort.

/** Nombre de bandes critiques retenues : 0 à 24 barks couvrent l'audible jusqu'à 15,5 kHz. */
export const NB_BANDES = 24;

/**
 * L'échelle des bandes critiques de Zwicker, en barks.
 *
 * Un bark vaut une bande critique, c'est-à-dire la largeur en deçà de laquelle l'oreille ne
 * sépare plus deux sons. Elle vaut une centaine de hertz dans le grave et près d'un sixième de la
 * fréquence dans l'aigu — ce qui est exactement pourquoi une tierce grave sonne trouble.
 */
export function bark(frequence: number): number {
  const f = Math.max(0, frequence);
  return 13 * Math.atan(0.00076 * f) + 3.5 * Math.atan(Math.pow(f / 7500, 2));
}

/**
 * La fonction d'étalement de Schroeder : de combien de décibels un masquant élève le seuil à
 * `dz` bandes critiques de lui.
 *
 * Toujours négative ou presque nulle — un masquant ne masque jamais plus fort que lui-même — et
 * FRANCHEMENT ASYMÉTRIQUE, ce qui est tout l'intérêt du modèle.
 */
export function etalement(dz: number): number {
  const x = dz + 0.474;
  return 15.81 + 7.5 * x - 17.5 * Math.sqrt(1 + x * x);
}

/**
 * L'énergie d'un spectre répartie en bandes critiques.
 *
 * On somme les ÉNERGIES et non les amplitudes : deux partiels d'une même bande ne s'additionnent
 * pas en amplitude — ils ne sont pas en phase —, mais leurs puissances, oui.
 */
export function bandesCritiques(
  modules: Float64Array | Float32Array, frequence: number, taille: number,
): Float64Array {
  const bandes = new Float64Array(NB_BANDES);
  const demi = Math.min(modules.length, Math.floor(taille / 2));
  for (let i = 1; i < demi; i++) {
    const z = bark((i * frequence) / taille);
    const b = Math.min(NB_BANDES - 1, Math.floor(z));
    bandes[b] += modules[i] * modules[i];
  }
  return bandes;
}

/** Un niveau en décibels, avec un plancher qui évite le logarithme de zéro. */
export function enDecibels(energie: number, plancherDb = -120): number {
  return energie > 0 ? Math.max(plancherDb, 10 * Math.log10(energie)) : plancherDb;
}

/**
 * Le seuil de masquage que produit un son, bande par bande.
 *
 * Chaque bande du masquant élève le seuil de toutes les autres, de sa propre valeur diminuée de
 * l'étalement. On garde le PLUS GRAND des seuils ainsi produits plutôt que leur somme : additionner
 * des seuils en décibels n'a pas de sens, et la somme des énergies surestimerait fortement le
 * masquage quand le masquant est large.
 *
 * `offsetDb` est ce qu'on retranche pour tenir compte de la nature du masquant. Un son tonal
 * masque moins qu'un bruit de même énergie — l'oreille le sépare mieux du reste — et les codeurs
 * perceptifs retranchent couramment une dizaine de décibels pour un son tonal contre cinq pour un
 * bruit. C'est un réglage et non une constante, parce qu'une piste réelle est entre les deux.
 */
export function seuilMasquage(bandesMasquant: Float64Array, offsetDb: number): Float64Array {
  const seuils = new Float64Array(NB_BANDES).fill(-Infinity);
  const niveaux = Float64Array.from(bandesMasquant, (e) => enDecibels(e));
  for (let i = 0; i < NB_BANDES; i++) {
    for (let j = 0; j < NB_BANDES; j++) {
      const candidat = niveaux[j] + etalement(i - j) - offsetDb;
      if (candidat > seuils[i]) seuils[i] = candidat;
    }
  }
  return seuils;
}

export interface MasquageBande {
  bande: number;
  /** Niveau du son masqué, en dB. */
  niveauDb: number;
  /** Seuil que le masquant impose, en dB. */
  seuilDb: number;
  /** De combien le son passe SOUS le seuil. Positif : il est masqué de ce nombre de décibels. */
  enfouiDb: number;
}

/** Bande par bande, ce que le masquant cache du masqué. */
export function masquageParBande(
  bandesMasque: Float64Array, bandesMasquant: Float64Array, offsetDb: number,
): MasquageBande[] {
  const seuils = seuilMasquage(bandesMasquant, offsetDb);
  return Array.from({ length: NB_BANDES }, (_, b) => {
    const niveauDb = enDecibels(bandesMasque[b]);
    return { bande: b, niveauDb, seuilDb: seuils[b], enfouiDb: seuils[b] - niveauDb };
  });
}

/**
 * La proportion de l'énergie du masqué qui tombe sous le seuil.
 *
 * C'est le chiffre qu'on veut voir bouger quand on corrige un mixage : zéro, rien n'est caché ;
 * un, tout l'est. Les bandes vides ne comptent pas — une bande sans énergie n'est pas « masquée »,
 * elle est silencieuse, et l'y compter ferait monter le chiffre sans qu'aucun son ne disparaisse.
 */
export function proportionMasquee(
  bandesMasque: Float64Array, bandesMasquant: Float64Array, offsetDb: number,
): number {
  const par = masquageParBande(bandesMasque, bandesMasquant, offsetDb);
  let total = 0, cachee = 0;
  for (let b = 0; b < NB_BANDES; b++) {
    const e = bandesMasque[b];
    if (e <= 0) continue;
    total += e;
    if (par[b].enfouiDb > 0) cachee += e;
  }
  return total > 0 ? cachee / total : 0;
}
