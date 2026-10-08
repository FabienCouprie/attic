// audio/oscillateur-analogique.ts — Les quatre gestes d'un oscillateur à tension, et le
// repliement qu'ils fabriquent.
//
// POURQUOI UN SECOND OSCILLATEUR, à côté de celui qui existe. Celui du dépôt somme des
// harmoniques sous Nyquist : son spectre est exact et il ne replie rien. C'est la bonne
// manière de montrer le lien entre une forme d'onde et ses harmoniques, et c'est aussi ce
// qui le rend incapable des quatre gestes qui font le son d'un synthétiseur analogique.
// La largeur du créneau, la remise à zéro forcée, la pile désaccordée et la déformation de
// la phase produisent toutes une discontinuité ou une dérivée très grande, donc un spectre
// qui ne s'arrête pas à Nyquist. Une série de Fourier tronquée ne peut pas les décrire :
// il faut calculer l'onde échantillon par échantillon, et payer le repliement.
//
// CE QUE COÛTE DE LES ÉCRIRE NAÏVEMENT. Un créneau calculé directement à 44 100 Hz replie
// tout ce qui dépasse : les partiels au-delà de Nyquist reviennent se poser à des
// fréquences qui ne sont pas des multiples de la fondamentale, et s'entendent comme une
// rugosité inharmonique qui se déplace quand la hauteur se déplace.
//
// LE SURÉCHANTILLONNAGE SEUL NE SUFFIT PAS, et c'est la mesure qui l'a dit contre le
// premier jet de ce fichier. Calculer à huit fois la cadence porte Nyquist à 176 400 Hz,
// mais les partiels qui se replient dans la bande viennent alors du rang 176 environ, où
// une scie vaut encore un cent-soixante-seizième de sa fondamentale, soit 45 décibels en
// dessous, et ils sont nombreux : relevé à huit fois, le repliement d'une scie ne descend
// qu'à 31,8 décibels sous le signal. Doubler le facteur n'en gagne que six de plus, et
// atteindre 55 décibels demanderait soixante-quatre fois la cadence.
//
// LE REMÈDE EST DONC AILLEURS, DANS LA POSITION DE LA RUPTURE. Ce qui replie n'est pas la
// hauteur du saut mais le fait qu'il tombe entre deux échantillons et soit reporté sur le
// suivant : l'instant de la rupture est arrondi, et cet arrondi est un bruit à large bande.
// Un polyBLEP calcule où la rupture est tombée dans l'échantillon et corrige les deux
// échantillons qui l'encadrent, ce qui replace le saut à sa place au lieu de l'arrondir.
// Les deux remèdes se composent, et le second fait l'essentiel du travail.
//
// LE SAUT N'EST JAMAIS ÉCRIT EN DUR : il est lu comme la différence entre la valeur d'avant
// la rupture et celle d'après. C'est ce qui fait que le même code traite la descente d'une
// scie, les deux fronts d'un créneau et la remise à zéro d'un esclave, dont la hauteur
// dépend de la phase qu'il avait ; et c'est ce qui fait que la phase déformée, continue au
// passage du cycle, ne reçoit aucune correction, son saut étant nul.
//
// LE CALCUL EST ENTIÈREMENT DÉTERMINÉ. Les phases de départ de la pile sont réparties
// régulièrement et non tirées au hasard : deux runs aux mêmes réglages rendent le même
// son, ce dont le banc d'empreintes a besoin.

/** Les trois formes, qui ne se ramènent pas l'une à l'autre. */
export type FormeVco = "sawtooth" | "impulsion" | "phase";

export interface ReglagesVco {
  forme: FormeVco;
  /** Hauteur de la remise à zéro, en hertz : c'est elle qu'on entend. */
  frequence: number;
  duree: number;
  /** Part du cycle passée en haut, de 0 à 1. Sert de genou à la phase déformée. */
  largeur: number;
  /** Profondeur du balayage de largeur, de 0 à 1 de ce que les bornes laissent. */
  modulationLargeur: number;
  /** Vitesse du balayage de largeur, en hertz. */
  vitesseModulation: number;
  /** Nombre d'oscillateurs empilés. */
  voix: number;
  /** Écart total de la pile, en cents, réparti autour de la fréquence. */
  desaccord: number;
  /** Rapport de la remise à zéro. À 1, le maître n'intervient pas. */
  sync: number;
  /** Déformation de la phase, de 0 à 1. À 0, la forme « phase » rend une sinusoïde. */
  distorsion: number;
}

export interface ResultatVco {
  signal: Float32Array;
  /** La composante continue retirée, que le créneau étroit fabrique. */
  continu: number;
  /** La longueur du filtre de décimation, en coefficients. */
  coefficients: number;
}

export const SUR_ECHANTILLONNAGE = 8;
/** La coupure du filtre de décimation, sous le Nyquist de la cadence de sortie. */
export const COUPURE = 20000;
export const LARGEUR_MIN = 0.01;
export const LARGEUR_MAX = 0.99;
export const VOIX_MAX = 9;

const borner = (x: number, bas: number, haut: number) => Math.min(haut, Math.max(bas, x));

/**
 * Un échantillon de la forme, à une phase et une largeur données.
 *
 * LA PHASE DÉFORMÉE EST LUE PAR DEUX DROITES qui se rejoignent au genou : la première
 * traverse la moitié du cycle de la sinusoïde avant le genou, la seconde l'autre moitié
 * après. Le genou au milieu, les deux droites n'en font qu'une et la sinusoïde ressort
 * intacte ; déplacé, il comprime une moitié de la sinusoïde dans une portion de cycle plus
 * courte, ce qui fabrique des harmoniques hautes sans changer la période.
 */
export function echantillonVco(forme: FormeVco, phase: number, largeur: number, distorsion: number): number {
  if (forme === "sawtooth") return 2 * phase - 1;
  if (forme === "impulsion") return phase < largeur ? 1 : -1;
  const genou = borner(0.5 + (largeur - 0.5) * distorsion, LARGEUR_MIN, LARGEUR_MAX);
  const lue = phase < genou
    ? 0.5 * phase / genou
    : 0.5 + 0.5 * (phase - genou) / (1 - genou);
  return Math.sin(2 * Math.PI * lue);
}

/**
 * Les deux corrections d'un polyBLEP, pour une rupture d'amplitude `saut` tombée `d`
 * échantillon avant celui qui la suit.
 *
 * `apres` se pose sur l'échantillon qui suit la rupture, `avant` sur celui qui la précède.
 * Le premier échantillon après une rupture franche est ainsi ramené au MILIEU du saut, ce
 * qu'une marche à bande limitée fait, au lieu de prendre déjà toute sa valeur.
 */
export function residuBlep(saut: number, d: number): { avant: number; apres: number } {
  return { avant: (saut / 2) * d * d, apres: -(saut / 2) * (1 - d) * (1 - d) };
}

/**
 * L'onde, calculée à la cadence demandée, sans décimation.
 *
 * LA BOUCLE EST PAR VOIX ET NON PAR ÉCHANTILLON, parce qu'un polyBLEP corrige l'échantillon
 * qui PRÉCÈDE la rupture : il faut pouvoir revenir dessus, et une boucle par échantillon
 * aurait déjà sommé les autres voix par-dessus.
 *
 * Les voix sont moyennées et non sommées : une pile de neuf scies qui se croisent
 * atteindrait neuf fois la crête d'une seule, et la normalisation qui suit l'aurait
 * ramenée au même niveau en écrasant tout le reste.
 */
export function ondeVco(r: ReglagesVco, echantillonnage: number): Float32Array {
  const voix = Math.max(1, Math.min(VOIX_MAX, Math.round(r.voix)));
  const total = Math.max(1, Math.floor(echantillonnage * r.duree));
  const sortie = new Float32Array(total);
  const syncActif = r.sync > 1;
  const largeurReglee = borner(r.largeur, LARGEUR_MIN, LARGEUR_MAX);
  const pasMaitre = r.frequence / echantillonnage;
  const pasLfo = r.vitesseModulation / echantillonnage;

  // L'AMPLEUR DU BALAYAGE SE BORNE À CE QUI RESTE de part et d'autre de la largeur réglée.
  // À cent pour cent, le balayage atteint les bornes sans les franchir : un écrêtage de la
  // largeur aurait ajouté sa propre rupture, qui se serait entendue comme un défaut du
  // traitement du repliement alors qu'elle serait venue d'ici.
  const marge = Math.min(largeurReglee - LARGEUR_MIN, LARGEUR_MAX - largeurReglee);
  const ampleur = Math.max(0, r.modulationLargeur) * marge;

  for (let v = 0; v < voix; v++) {
    const ecart = voix === 1 ? 0 : (r.desaccord / 2) * ((2 * v) / (voix - 1) - 1);
    const pas = (r.frequence * (syncActif ? r.sync : 1) * 2 ** (ecart / 1200)) / echantillonnage;
    let phase = voix === 1 ? 0 : v / voix;
    let maitre = 0;
    let lfo = 0;
    let enAttente = 0;

    for (let i = 0; i < total; i++) {
      const largeur = largeurReglee + ampleur * Math.sin(2 * Math.PI * lfo);
      lfo += pasLfo;
      if (lfo >= 1) lfo -= Math.floor(lfo);

      let y = echantillonVco(r.forme, phase, largeur, r.distorsion) + enAttente;
      enAttente = 0;

      // LA RUPTURE DESCENDANTE DU CRÉNEAU se traite avant l'avance de phase, le passage de
      // la largeur n'étant pas un passage du cycle : il n'arrive donc pas au même instant.
      const suivante = phase + pas;
      if (r.forme === "impulsion" && phase < largeur && suivante >= largeur) {
        const res = residuBlep(-2, (suivante - largeur) / pas);
        y += res.avant;
        enAttente += res.apres;
      }

      maitre += pasMaitre;
      const remise = syncActif && maitre >= 1;
      if (maitre >= 1) maitre -= Math.floor(maitre);

      if (remise) {
        // LE SAUT EST LU, NON ÉCRIT : la remise à zéro interrompt l'esclave là où il en
        // était, et la hauteur du saut est donc celle de la phase qu'il avait atteinte.
        const d = maitre / pasMaitre;
        const avant = echantillonVco(r.forme, suivante, largeur, r.distorsion);
        phase = d * pas;
        const res = residuBlep(echantillonVco(r.forme, phase, largeur, r.distorsion) - avant, d);
        y += res.avant;
        enAttente += res.apres;
      } else {
        phase = suivante;
        if (phase >= 1) {
          phase -= Math.floor(phase);
          const d = phase / pas;
          const res = residuBlep(
            echantillonVco(r.forme, phase, largeur, r.distorsion)
            - echantillonVco(r.forme, suivante, largeur, r.distorsion), d);
          y += res.avant;
          enAttente += res.apres;
        }
      }
      sortie[i] += y / voix;
    }
  }
  return sortie;
}

/**
 * Le filtre qui redescend du calcul suréchantillonné à la cadence de sortie.
 *
 * C'est un sinus cardinal fenêtré par une Blackman, donc à phase linéaire : il retarde
 * toutes les fréquences du même temps et ne déforme pas l'attaque. Sa somme est ramenée à
 * un pour que le continu traverse à son niveau, ce qui laisse la mesure du continu dire ce
 * que la forme fabrique et non ce que le filtre a ajouté.
 */
export function noyauDecimation(facteur: number, coupure = COUPURE, echantillonnageSortie = 44100): Float64Array {
  const longueur = 32 * facteur + 1;
  const milieu = (longueur - 1) / 2;
  const coupureNormalisee = coupure / (echantillonnageSortie * facteur);
  // LE NOYAU EST EN DOUBLE PRÉCISION, et le signal reste en simple. En simple, la
  // quantification de chaque coefficient écarte la somme de l'unité d'un dix-millionième,
  // c'est-à-dire autant que ce que la normalisation corrige : elle passait alors sous le
  // bruit de l'arrondi, et la retirer ne se mesurait plus. Deux cent cinquante-sept nombres
  // ne coûtent rien à garder larges.
  const noyau = new Float64Array(longueur);
  let somme = 0;
  for (let i = 0; i < longueur; i++) {
    const x = i - milieu;
    const cardinal = x === 0
      ? 2 * coupureNormalisee
      : Math.sin(2 * Math.PI * coupureNormalisee * x) / (Math.PI * x);
    const fenetre = 0.42
      - 0.5 * Math.cos((2 * Math.PI * i) / (longueur - 1))
      + 0.08 * Math.cos((4 * Math.PI * i) / (longueur - 1));
    noyau[i] = cardinal * fenetre;
    somme += noyau[i];
  }
  for (let i = 0; i < longueur; i++) noyau[i] /= somme;
  return noyau;
}

/** Un échantillon gardé sur `facteur`, le filtre appliqué autour de celui qu'on garde. */
export function decimer(signal: Float32Array, facteur: number, noyau: Float64Array): Float32Array {
  const milieu = (noyau.length - 1) / 2;
  const total = Math.max(1, Math.floor(signal.length / facteur));
  const sortie = new Float32Array(total);
  for (let j = 0; j < total; j++) {
    const centre = j * facteur;
    let somme = 0;
    for (let k = 0; k < noyau.length; k++) {
      const i = centre + k - milieu;
      if (i >= 0 && i < signal.length) somme += noyau[k] * signal[i];
    }
    sortie[j] = somme;
  }
  return sortie;
}

/** Retire la composante continue et rend celle qui a été retirée. */
export function retirerLeContinu(signal: Float32Array): number {
  if (signal.length === 0) return 0;
  let somme = 0;
  for (let i = 0; i < signal.length; i++) somme += signal[i];
  const moyenne = somme / signal.length;
  for (let i = 0; i < signal.length; i++) signal[i] -= moyenne;
  return moyenne;
}

/** L'onde calculée haut, redescendue, et débarrassée de son continu. */
export function synthetiserVco(r: ReglagesVco, echantillonnageSortie = 44100,
  facteur = SUR_ECHANTILLONNAGE): ResultatVco {
  const haut = ondeVco(r, echantillonnageSortie * facteur);
  const noyau = noyauDecimation(facteur, COUPURE, echantillonnageSortie);
  const signal = decimer(haut, facteur, noyau);
  return { signal, continu: retirerLeContinu(signal), coefficients: noyau.length };
}
