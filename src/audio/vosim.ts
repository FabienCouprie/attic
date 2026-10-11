// audio/vosim.ts — Un formant sans aucun filtre, par un train d'impulsions en sinus carré.
//
// D'après Werner Kaegi et Stan Tempelaars, « VOSIM, a new sound synthesis system », Journal of the
// Audio Engineering Society 26(6), 1978, p. 418-426 ; le signal lui-même date de 1973, à
// l'Institut de sonologie d'Utrecht. Le spectre théorique est traité à part par Stan Tempelaars,
// « The VOSIM Signal Spectrum », Interface 6, 1977.
//
// D'OÙ VIENT LA LOI DES PARAMÈTRES, ET CE QUE JE N'AI PAS LU. L'article de 1978 n'est pas en accès
// libre et je ne l'ai pas eu. La loi écrite ici est celle de la spécification de l'opcode `vosim`
// du manuel Csound, qui crédite Kaegi et Tempelaars et donne les relations sans ambiguïté : un
// événement dure l'inverse de la fondamentale, une impulsion dure l'inverse du formant, et la
// largeur du formant tient au rapport du silence aux impulsions. La page de Kaegi lui-même renvoie
// aux deux publications ci-dessus sans redonner les formules. Cette provenance est écrite ici
// plutôt que passée sous silence.
//
// CE QUE LE PROCÉDÉ EST. Une période porte N impulsions en SINUS CARRÉ, chacune plus faible que la
// précédente d'un facteur, puis le silence qui reste. L'inverse de la durée d'une impulsion donne
// la position du formant ; l'inverse de la durée de l'événement donne la fondamentale. Il n'y a ni
// filtre, ni résonateur, ni rétroaction : le formant est le spectre de l'impulsion elle-même,
// échantillonné par le peigne du train.
//
// CE QUI LE DISTINGUE D'UN PULSAR, et la notice ne peut pas le dire, la règle interdisant la
// comparaison : un pulsar porte UNE forme d'onde par période, VOSIM en porte N. C'est ce nombre qui
// donne à VOSIM la LARGEUR de son formant, qu'un pulsar ne règle pas : plus la salve est longue,
// plus le pic est étroit.
//
// LES DEUX AXES NE SONT PAS INDÉPENDANTS, et c'est la contrainte du modèle. La salve occupe N fois
// la durée d'une impulsion, soit N/formant, et elle doit tenir dans l'événement, soit
// 1/fondamentale. Le nombre d'impulsions est donc plafonné par le rapport du formant à la
// fondamentale, et ce qui dépasse n'est pas écrit. Le manuel Csound le dit de la même façon : le
// rapport de la salve au silence ne se règle pas indépendamment. Le rapport rend le compte des
// impulsions jetées, pour que ce plafond soit visible et non deviné.
//
// LA DURÉE D'UNE IMPULSION N'EST PAS ARRONDIE À L'ÉCHANTILLON, et c'est une décision à dire. Le
// matériel de 1973 comptait des échantillons entiers, de sorte que le formant ne pouvait se poser
// qu'aux valeurs `sr/entier` : à 44,1 kHz, un balayage du formant autour de 1200 Hz y avancerait
// par marches de 33 Hz. L'impulsion est ici calculée sur une longueur FRACTIONNAIRE, ce qui rend le
// formant exact et un balayage continu. Le spectre est celui du procédé à la quantification près.
//
// LA SALVE EST UNIPOLAIRE PAR CONSTRUCTION, le sinus carré ne passant jamais sous zéro. Le train
// porte donc une composante continue, que le rapport donne. Elle n'est PAS retirée, et la raison
// est que le retirer détruirait la propriété la plus nette du procédé : hors des impulsions, la
// sortie est EXACTEMENT nulle. C'est ce qu'aucun filtre ne peut produire, puisqu'un résonateur
// excité par une impulsion continue de sonner.
import { valeurA } from "./courbe";

export interface OptionsVosim {
  sampleRate: number;
  dureeSec: number;
  /** Fondamentale, en Hz : un événement par période. Un tableau la fait varier. */
  fondamentale: number | Float32Array;
  /** Formant, en Hz : l'inverse de la durée d'une impulsion. Un tableau le fait varier. */
  formant: number | Float32Array;
  /** Nombre d'impulsions par événement, avant plafonnement. */
  impulsions: number;
  /** Facteur d'amplitude d'une impulsion à la suivante, de 0 à 1. Un tableau le fait varier. */
  decroissance?: number | Float32Array;
  /**
   * Facteur de vitesse de lecture d'une impulsion à la suivante.
   *
   * Au-dessus de un, les impulsions RACCOURCISSENT au fil de la salve, donc le formant monte à
   * l'intérieur même de l'événement. C'est le `kPulseFactor` de la spécification.
   */
  facteur?: number;
  /** Amplitude de la première impulsion de chaque salve, de 0 à 1. Un tableau la fait varier. */
  amplitude?: number | Float32Array;
}

export interface RapportVosim {
  evenements: number;
  /** Impulsions écrites, toutes périodes confondues. */
  impulsions: number;
  /** Impulsions non écrites parce qu'elles dépasseraient leur événement. */
  jetees: number;
  /** Part du rendu exactement nulle : le silence entre les salves. */
  partSilence: number;
  /** Composante continue, la salve étant unipolaire par construction. */
  continu: number;
}

/**
 * Le nombre d'impulsions qui tiennent dans un événement.
 *
 * C'EST LE PLAFOND DU MODÈLE, et il se calcule sans rien rendre : la salve occupe N fois la durée
 * d'une impulsion, et doit tenir dans la période. Un formant sous la fondamentale n'en laisse
 * tenir aucune, ce qui est la condition que la spécification écrit « le formant doit être plus
 * haut que la fondamentale ».
 */
export const impulsionsQuiTiennent = (fondamentale: number, formant: number): number =>
  Math.floor(Math.max(0, formant) / Math.max(1e-9, fondamentale));

/** La forme d'une impulsion : une demi-période de sinus, élevée au carré. */
export const impulsion = (u: number): number => {
  if (u < 0 || u >= 1) return 0;
  const s = Math.sin(Math.PI * u);
  return s * s;
};

/**
 * Le rendu, événement par événement.
 *
 * Les réglages sont lus À L'INSTANT OÙ L'ÉVÉNEMENT COMMENCE, une valeur par événement. C'est la
 * seule lecture qui ait un sens ici : la durée de l'événement et celle de ses impulsions sont
 * décidées avant qu'il s'écrive, et les relire en cours de salve ferait de chaque impulsion une
 * longueur différente sans que le formant annoncé veuille plus rien dire.
 */
export function vosim(o: OptionsVosim): { sortie: Float32Array; rapport: RapportVosim } {
  const sr = o.sampleRate;
  const n = Math.max(1, Math.round(o.dureeSec * sr));
  const sortie = new Float32Array(n);
  const nImpulsions = Math.max(1, Math.round(o.impulsions));
  const facteur = Math.max(0.1, Math.min(10, o.facteur ?? 1));

  let t = 0;
  let evenements = 0;
  let ecrites = 0;
  let jetees = 0;
  let garde = 0;

  while (t < n && garde++ < 2_000_000) {
    const i = Math.min(n - 1, Math.max(0, Math.round(t)));
    const f0 = Math.max(0.1, valeurA(o.fondamentale, i));
    const fF = Math.max(0.1, valeurA(o.formant, i));
    const L = sr / f0;
    const b = Math.min(1, Math.max(0, valeurA(o.decroissance ?? 1, i)));
    let amp = Math.min(1, Math.max(0, valeurA(o.amplitude ?? 1, i)));
    let T = sr / fF;
    let pos = 0;

    for (let p = 0; p < nImpulsions; p++) {
      // CE QUI DÉPASSE L'ÉVÉNEMENT N'EST PAS ÉCRIT, et c'est le plafond du modèle plutôt qu'une
      // précaution : une impulsion qui mordrait sur l'événement suivant ferait de la salve une
      // forme d'onde continue, et le silence qui porte le formant disparaîtrait.
      if (pos + T > L) { jetees += nImpulsions - p; break; }
      const debut = t + pos;
      const premier = Math.ceil(debut);
      const dernier = Math.ceil(debut + T);
      for (let k = premier; k < dernier; k++) {
        if (k < 0 || k >= n) continue;
        sortie[k] += amp * impulsion((k - debut) / T);
      }
      ecrites++;
      pos += T;
      amp *= b;
      T /= facteur;
    }

    t += L;
    evenements++;
  }

  let muets = 0;
  let somme = 0;
  for (let k = 0; k < n; k++) {
    if (sortie[k] === 0) muets++;
    somme += sortie[k];
  }

  return {
    sortie,
    rapport: {
      evenements, impulsions: ecrites, jetees,
      partSilence: muets / n,
      continu: somme / n,
    },
  };
}
