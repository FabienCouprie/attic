// audio/assaisonnement.ts — Déplacer un son vers la région d'un goût.
//
// L'IDÉE VIENT DE L'ALGORITHME DE MESZ. Sa composition d'après les goûts ne vise pas des valeurs
// absolues : elle mesure où se tient un fragment dans l'espace à cinq dimensions, puis le modifie
// pour RÉDUIRE SA DISTANCE à la région du goût voulu (Front. Hum. Neurosci. 6, 2012). On fait ici
// la même chose sur du son enregistré, avec les moyens du son enregistré.
//
// CE QU'ON PEUT DÉPLACER, ET CE QU'ON NE PEUT PAS. Une partition se transpose, se ralentit, se
// détache ou se lie note à note ; un enregistrement, non. Chaque dimension se traite donc par ce
// qui la déplace vraiment dans un signal :
//
//   registre      transposition, qui garde la durée ;
//   vitesse       étirement temporel, qui garde la hauteur ;
//   articulation  vers le piqué, une porte qui creuse les silences ; vers le lié, une queue de
//                 résonance qui les remplit ;
//   consonance    vers le rugueux, une copie désaccordée qui bat contre l'original ; vers le
//                 consonant, un filtre qui ôte les partiels aigus, d'où vient la rugosité ;
//   intensité     un gain.
//
// La consonance est la plus faible des cinq : on ne rend pas consonant un accord qui ne l'est pas,
// on ne fait qu'ôter ce qui bat. C'est dit dans la notice du nœud plutôt que tu.

import { changerTempo, changerTonalite } from "./effets-spectral";
import { respirer } from "../core/respirer";
import { mesurer, profil, REGIONS, type DimensionsGout, type Gout } from "./gout";

export interface Assaisonnement {
  /** Demi-tons de transposition appliqués. */
  demiTons: number;
  /** Facteur d'étirement : 2 pour deux fois plus rapide. */
  vitesse: number;
  /** Profondeur de la porte, de 0 (rien) à 1 (silences francs). */
  porte: number;
  /** Durée de la queue de résonance ajoutée, en secondes. */
  queue: number;
  /** Désaccord de la copie ajoutée, en cents. 0 : aucune copie. */
  desaccord: number;
  /** Coupure du filtre, en hertz. 0 : aucun filtre. */
  coupure: number;
  /** Gain appliqué, en dB. */
  gainDb: number;
}

const borner = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

/**
 * Ce qu'il faut faire au son pour l'amener vers la région, à la dose demandée.
 *
 * La dose (0 à 1) multiplie chaque écart : à 0,5, le son fait la moitié du chemin. C'est ce qui
 * permet d'assaisonner sans dénaturer — et de mesurer, avec le nœud « Le goût d'un son », que le
 * point s'est bien déplacé dans la direction voulue.
 */
export function doserAssaisonnement(actuel: DimensionsGout, gout: Gout, dose: number): Assaisonnement {
  return doserVersPoint(actuel, REGIONS[gout], dose);
}

/**
 * Le même dosage, vers un POINT quelconque de l'espace plutôt que vers une des quatre régions.
 *
 * POURQUOI CETTE FORME EST LA VRAIE, relevé par Fabien : « il faut adapter l'assaisonnement pour les
 * combinaisons sucré, salé, amer, acide, comme dans l'accord mets-musique ». Une dégustation n'est
 * presque jamais d'un seul goût ; `accord-mets.ts` savait déjà en faire un point, par barycentre des
 * quatre régions pondéré par les intensités, et l'assaisonnement ne savait viser qu'un sommet. Rien
 * dans le calcul ne l'exigeait : il ne lit de la région que ses cinq coordonnées.
 *
 * VISER ENTRE LES RÉGIONS N'EST PAS VISER MOINS FORT, et c'est la nuance qui compte. La dose règle
 * la part du chemin ; le point, lui, dit OÙ l'on va. Un profil mêlant deux goûts tombe entre leurs
 * deux régions, ce qui est une direction en soi, et non une demi-mesure vers l'un des deux.
 */
export function doserVersPoint(actuel: DimensionsGout, cible: DimensionsGout, dose: number): Assaisonnement {
  const d = borner(dose, 0, 1);
  // Cinq octaves d'étendue pour la dimension : un écart de 0,1 vaut une demi-octave.
  const demiTons = borner((cible.hauteur - actuel.hauteur) * 60 * d, -12, 12);
  // Quatre octaves de vitesse : de deux secondes entre deux attaques à huit par seconde.
  const vitesse = borner(Math.pow(2, (cible.vitesse - actuel.vitesse) * 4 * d), 0.5, 2);
  const ecartArticulation = (cible.articulation - actuel.articulation) * d;
  const ecartConsonance = (cible.consonance - actuel.consonance) * d;
  return {
    demiTons,
    vitesse,
    porte: ecartArticulation < 0 ? borner(-ecartArticulation, 0, 1) : 0,
    queue: ecartArticulation > 0 ? borner(ecartArticulation, 0, 1) * 0.6 : 0,
    desaccord: ecartConsonance < 0 ? borner(-ecartConsonance, 0, 1) * 50 : 0,
    // De 16 kHz (rien) à 1,5 kHz (sourd) : c'est dans l'aigu que se tient la rugosité.
    coupure: ecartConsonance > 0 ? 16000 * Math.pow(1500 / 16000, borner(ecartConsonance, 0, 1)) : 0,
    gainDb: borner((cible.intensite - actuel.intensite) * 40 * d, -24, 24),
  };
}

/** Une copie de tampon, même forme, même fréquence. */
function memeForme(b: AudioBuffer, longueur = b.length): AudioBuffer {
  return new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: Math.max(1, longueur), sampleRate: b.sampleRate });
}

/**
 * Creuse les silences entre les notes : sous le seuil, le son est atténué, au-dessus il passe.
 *
 * Les bords sont adoucis sur cinq millisecondes — une porte franche sur une forme d'onde fait un
 * clic à chaque ouverture, et l'on entendrait la porte plutôt que le piqué qu'elle produit.
 */
export function porter(b: AudioBuffer, profondeur: number): AudioBuffer {
  if (profondeur <= 0) return b;
  const sr = b.sampleRate;
  const attaque = Math.max(1, Math.round(sr * 0.005));
  const sortie = memeForme(b);
  // Le seuil monte avec la profondeur : à 1, tout ce qui est sous −18 dB de la crête est coupé.
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = sortie.getChannelData(c);
    let crete = 0;
    for (let i = 0; i < x.length; i++) crete = Math.max(crete, Math.abs(x[i]));
    const seuil = crete * Math.pow(10, (-18 * profondeur) / 20);
    let suivi = 0, gain = 0;
    for (let i = 0; i < x.length; i++) {
      const v = Math.abs(x[i]);
      suivi = v > suivi ? v : suivi * 0.999 + v * 0.001;
      const vise = suivi >= seuil ? 1 : 1 - profondeur;
      gain += (vise - gain) / attaque;
      y[i] = x[i] * gain;
    }
  }
  return sortie;
}

/** Remplit les silences d'une queue de résonance : ce qui vient de sonner continue de sonner. */
export function lier(b: AudioBuffer, secondes: number): AudioBuffer {
  if (secondes <= 0) return b;
  const sr = b.sampleRate;
  const queue = Math.round(secondes * sr);
  const sortie = memeForme(b, b.length + queue);
  // Une décroissance exponentielle par récurrence : chaque échantillon garde une part du précédent.
  const alpha = Math.exp(-1 / (secondes * sr / 4));
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = sortie.getChannelData(c);
    let etat = 0;
    for (let i = 0; i < y.length; i++) {
      const entree = i < x.length ? x[i] : 0;
      etat = entree + etat * alpha;
      // Le mélange garde le son d'origine intact et ajoute sa traîne : on lie, on ne noie pas.
      y[i] = entree + (etat - entree) * 0.5;
    }
  }
  return sortie;
}

/** Ajoute une copie désaccordée : deux partiels voisins battent, et c'est cela, la rugosité. */
export function desaccorder(b: AudioBuffer, cents: number): AudioBuffer {
  if (cents <= 0) return b;
  const copie = changerTonalite(b, cents / 100);
  const sortie = memeForme(b);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), z = copie.getChannelData(Math.min(c, copie.numberOfChannels - 1)), y = sortie.getChannelData(c);
    for (let i = 0; i < y.length; i++) y[i] = (x[i] + (i < z.length ? z[i] : 0)) * 0.5;
  }
  return sortie;
}

/** Ôte l'aigu, où se tient la rugosité. Un pôle par étage, deux étages : 12 dB par octave. */
export function adoucir(b: AudioBuffer, coupure: number): AudioBuffer {
  if (coupure <= 0 || coupure >= b.sampleRate / 2) return b;
  const alpha = Math.exp((-2 * Math.PI * coupure) / b.sampleRate);
  const sortie = memeForme(b);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = sortie.getChannelData(c);
    let a = 0, d = 0;
    for (let i = 0; i < x.length; i++) {
      a = x[i] * (1 - alpha) + a * alpha;
      d = a * (1 - alpha) + d * alpha;
      y[i] = d;
    }
  }
  return sortie;
}

export interface ResultatAssaisonnement {
  son: AudioBuffer;
  reglages: Assaisonnement;
  avant: DimensionsGout;
  apres: DimensionsGout;
  /** Part du goût visé, avant et après. Vaut zéro quand la cible est un point et non une région. */
  partAvant: number;
  partApres: number;
  /**
   * La distance du son au point visé, avant et après.
   *
   * C'EST LA SEULE MESURE QUI VAILLE POUR UNE COMBINAISON. La part d'un goût ne dit rien d'un point
   * situé ENTRE deux régions : viser le mélange d'un sucré et d'un salé peut faire baisser les deux
   * parts, et pourtant s'approcher de la cible. La distance, elle, répond à la question posée.
   */
  distanceAvant: number;
  distanceApres: number;
}

/** La distance dans l'espace à cinq dimensions, celle dont `gout.ts` se sert déjà pour ses parts. */
export function distanceAuPoint(a: DimensionsGout, b: DimensionsGout): number {
  return Math.sqrt(
    (a.hauteur - b.hauteur) ** 2 + (a.articulation - b.articulation) ** 2
    + (a.vitesse - b.vitesse) ** 2 + (a.consonance - b.consonance) ** 2
    + (a.intensite - b.intensite) ** 2);
}

/**
 * Assaisonne un son, et rend de quoi vérifier qu'il a bougé dans la bonne direction.
 *
 * L'ORDRE DES OPÉRATIONS N'EST PAS INDIFFÉRENT. La porte travaille sur l'enveloppe d'origine, donc
 * avant tout étirement qui la déformerait ; la transposition vient après l'étirement, sans quoi
 * l'un défait ce que l'autre fait ; le gain passe en dernier, pour que rien ne le contredise.
 */
export async function assaisonner(
  b: AudioBuffer, gout: Gout, dose: number,
): Promise<ResultatAssaisonnement> {
  const r = await assaisonnerVers(b, REGIONS[gout], dose);
  const part = (d: DimensionsGout) => profil(d).find((p) => p.gout === gout)!.part;
  return { ...r, partAvant: part(r.avant), partApres: part(r.apres) };
}

/**
 * Le même geste, vers un POINT quelconque de l'espace.
 *
 * C'est la forme générale : viser une des quatre régions n'en est que le cas particulier, et
 * `assaisonner` le lui délègue. Voir `doserVersPoint` pour la raison.
 */
export async function assaisonnerVers(
  b: AudioBuffer, cible: DimensionsGout, dose: number,
): Promise<ResultatAssaisonnement> {
  // UNE IMAGE ENTRE CHAQUE ÉTAPE. Ce composant figeait l'interface tout le temps de son calcul, et
  // son coût est RÉPARTI : mesuré sur trois secondes de stéréo, 312 ms pour chacune des deux mesures
  // et le reste distribué sur six traitements. Aucune étape ne domine, si bien que rendre la main
  // entre elles borne le gel à la plus longue au lieu de la somme. Les pauses sont posées ici plutôt
  // que dans les boucles : elles ne coûtent qu'un millième de seconde chacune et ne changent aucune
  // signature de traitement. Un worker aurait demandé un cœur par voie pour chacun des cinq
  // traitements, et `mesurer` n'en a pas : il porte des propriétés globales au son, le registre et
  // les attaques, qui ne se décomposent pas canal par canal.
  const mesureAvant = mesurer(b);
  await respirer();
  const reglages = doserVersPoint(mesureAvant.dimensions, cible, dose);
  let son = b;
  if (reglages.porte > 0) { son = porter(son, reglages.porte); await respirer(); }
  if (reglages.queue > 0) { son = lier(son, reglages.queue); await respirer(); }
  if (reglages.desaccord > 0) { son = desaccorder(son, reglages.desaccord); await respirer(); }
  if (reglages.coupure > 0) { son = adoucir(son, reglages.coupure); await respirer(); }
  if (Math.abs(reglages.vitesse - 1) > 0.01) {
    son = changerTempo(son, reglages.vitesse * 100);
    await respirer();
  }
  if (Math.abs(reglages.demiTons) > 0.05) {
    son = changerTonalite(son, reglages.demiTons);
    await respirer();
  }
  if (Math.abs(reglages.gainDb) > 0.1) {
    const g = Math.pow(10, reglages.gainDb / 20);
    const sortie = memeForme(son);
    for (let c = 0; c < son.numberOfChannels; c++) {
      const x = son.getChannelData(c), y = sortie.getChannelData(c);
      for (let i = 0; i < x.length; i++) y[i] = Math.max(-1, Math.min(1, x[i] * g));
    }
    son = sortie;
    await respirer();
  }
  const mesureApres = mesurer(son);
  return {
    son,
    reglages,
    avant: mesureAvant.dimensions,
    apres: mesureApres.dimensions,
    // LA PART N'A DE SENS QUE POUR UNE RÉGION, et `assaisonner` la remplit lui-même. Ici la cible
    // peut être n'importe quel point : il n'y a pas de goût dont donner la part.
    partAvant: 0,
    partApres: 0,
    distanceAvant: distanceAuPoint(mesureAvant.dimensions, cible),
    distanceApres: distanceAuPoint(mesureApres.dimensions, cible),
  };
}
