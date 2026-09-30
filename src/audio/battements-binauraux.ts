// audio/battements-binauraux.ts — Un battement qui n'est dans aucun des deux signaux.
//
// D'OÙ VIENT CE STIMULUS. Heinrich Wilhelm Dove le décrit en 1839 : deux sons purs de fréquences
// voisines, envoyés séparément à chaque oreille, font entendre une pulsation lente que ni l'un ni
// l'autre ne porte. Gerald Oster, « Auditory beats in the brain », Scientific American 229(4), 1973,
// p. 94-102, en donne la revue qui a fait connaître le phénomène.
//
// CE QUI LE SÉPARE DU BATTEMENT ORDINAIRE, ET C'EST TOUT LE SUJET. Deux sons voisins mélangés dans
// l'air donnent un battement ACOUSTIQUE : leur somme est une modulation d'amplitude, présente dans
// le signal, qu'un microphone relève et qu'un haut-parleur suffit à faire entendre. Ici les deux
// sons ne se mélangent nulle part avant les oreilles : chaque canal est un son pur d'amplitude
// CONSTANTE, aucun des deux ne bat, et leur spectre ne porte rien à la fréquence entendue. La
// pulsation naît plus loin, là où les deux voies se rejoignent.
//
// LA PORTEUSE A UNE LIMITE, ET ELLE EST MESURÉE. J. C. R. Licklider, J. C. Webster et J. M. Hedlun,
// « On the frequency limits of binaural beats », Journal of the Acoustical Society of America 22,
// 1950, p. 468-473 : le battement binaural s'entend pour des porteuses basses et se perd au-delà
// d'un millier de hertz environ, là où le battement acoustique, lui, s'entend à toute hauteur.

/** Les deux fréquences envoyées, encadrant la porteuse. */
export interface Couple {
  basse: number;
  haute: number;
}

/**
 * Les deux fréquences d'un couple.
 *
 * LE BATTEMENT EST CENTRÉ SUR LA PORTEUSE, et non posé au-dessus d'elle : les deux sons s'écartent
 * chacun de la moitié, de sorte que la hauteur entendue reste celle qu'on a demandée.
 */
export function frequencesDuCouple(porteuse: number, battement: number): Couple {
  const centre = Math.max(1, porteuse);
  const ecart = Math.max(0, battement) / 2;
  return { basse: Math.max(0.5, centre - ecart), haute: centre + ecart };
}

export interface OptionsRendu {
  porteuse: number;
  /** L'écart entre les deux sons, en hertz, qui est la vitesse du battement. */
  battement: number;
  /** Vrai pour une fréquence par oreille ; faux pour les deux dans les deux. */
  parOreille: boolean;
  /** Vrai si l'oreille droite reçoit la plus haute des deux. Sans effet hors du mode par oreille. */
  aiguADroite: boolean;
  /** La durée, en secondes. */
  duree: number;
  /** Le fondu d'entrée et de sortie, en secondes. */
  fondu: number;
  /** Le niveau, de 0 à 1. */
  niveau: number;
  sampleRate: number;
}

/** Le fondu d'entrée et de sortie, en cosinus surélevé. */
function bords(i: number, n: number, fondu: number): number {
  if (fondu <= 0) return 1;
  const montee = i < fondu ? (i + 0.5) / fondu : 1;
  const descente = n - 1 - i < fondu ? (n - i - 0.5) / fondu : 1;
  const u = Math.max(0, Math.min(1, Math.min(montee, descente)));
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

/**
 * Les deux canaux rendus en échantillons.
 *
 * DANS LE MODE PAR OREILLE, CHAQUE CANAL EST UN SON PUR : son amplitude ne varie pas d'un bout à
 * l'autre, hors des fondus. C'est la propriété qui fait le phénomène, et un cas permanent la mesure.
 * Dans l'autre mode les deux sons sont additionnés dans chaque canal, et le battement devient une
 * modulation d'amplitude ordinaire, inscrite dans le signal.
 */
export function echantillonsBinauraux(
  o: OptionsRendu,
): { gauche: Float32Array; droite: Float32Array } {
  const sr = Math.max(1, Math.round(o.sampleRate));
  const n = Math.max(1, Math.round(Math.max(0, o.duree) * sr));
  const { basse, haute } = frequencesDuCouple(o.porteuse, o.battement);
  const gauche = new Float32Array(n);
  const droite = new Float32Array(n);
  const fondu = Math.max(0, Math.min(Math.floor(n / 2), Math.round(Math.max(0, o.fondu) * sr)));
  const niveau = Math.max(0, Math.min(1, o.niveau));
  const aG = o.aiguADroite ? basse : haute;
  const aD = o.aiguADroite ? haute : basse;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = bords(i, n, fondu) * niveau;
    if (o.parOreille) {
      gauche[i] = Math.sin(2 * Math.PI * aG * t) * e;
      droite[i] = Math.sin(2 * Math.PI * aD * t) * e;
    } else {
      // Les deux sons dans chaque oreille : la somme est divisée par deux, pour que le mode ne
      // change pas le niveau de sortie sous prétexte qu'il additionne.
      const v = (Math.sin(2 * Math.PI * basse * t) + Math.sin(2 * Math.PI * haute * t)) / 2;
      gauche[i] = v * e;
      droite[i] = v * e;
    }
  }
  return { gauche, droite };
}

/**
 * La coupure du filtre qui sépare l'enveloppe de la porteuse.
 *
 * ELLE DOIT LAISSER PASSER LE BATTEMENT ET ARRÊTER LA PORTEUSE, ce qui laisse peu de place quand les
 * deux se rapprochent : la borne haute la tient au quart de la porteuse, pour qu'aucune mesure ne
 * soit rendue sur un signal que le filtre ne sépare plus.
 */
function coupureDeMesure(porteuse: number, battement: number): number {
  return Math.min(Math.max(1, porteuse) / 4, Math.max(20, 3 * Math.max(0.25, battement)));
}

/**
 * L'enveloppe d'un signal, par démodulation autour de sa porteuse.
 *
 * LA MESURE PAR FENÊTRES GLISSANTES NE CONVENAIT PAS, ET C'EST MESURÉ : une valeur efficace prise
 * sur quatre périodes de porteuse annonçait 1,6 % de modulation sur un son parfaitement constant, et
 * ne trouvait que 90 % de profondeur là où le battement descend jusqu'au silence, la fenêtre étant
 * trop large pour en voir le creux. Allonger la fenêtre corrigeait le premier défaut et aggravait le
 * second. Multiplier le signal par un cosinus et un sinus à la porteuse, puis filtrer les deux, rend
 * les deux composantes d'un vecteur dont la LONGUEUR est l'enveloppe et l'angle la phase : le filtre
 * n'a plus à choisir entre les deux, et une atténuation de la bande passante ne change pas la
 * profondeur, puisqu'elle met tout le vecteur à la même échelle.
 */
export function enveloppeParDemodulation(
  x: Float32Array, porteuse: number, battement: number, sampleRate: number,
): Float32Array {
  const sr = Math.max(1, sampleRate);
  const a = Math.exp((-2 * Math.PI * coupureDeMesure(porteuse, battement)) / sr);
  const i3 = [0, 0, 0];
  const q3 = [0, 0, 0];
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const w = (2 * Math.PI * porteuse * n) / sr;
    let vi = x[n] * Math.cos(w);
    let vq = x[n] * Math.sin(w);
    // TROIS PÔLES, parce qu'un seul laisserait passer le double de la porteuse à moins de trente
    // décibels, ce qui suffirait à faire battre un son constant au rythme de sa propre fréquence.
    for (let k = 0; k < 3; k++) {
      i3[k] = a * i3[k] + (1 - a) * vi;
      q3[k] = a * q3[k] + (1 - a) * vq;
      vi = i3[k];
      vq = q3[k];
    }
    out[n] = 2 * Math.sqrt(vi * vi + vq * vq);
  }
  return out;
}

/**
 * La profondeur de modulation d'un signal, de 0 pour une amplitude constante à 1 pour un battement
 * qui descend jusqu'au silence.
 *
 * LES BORDS SONT ÉCARTÉS, parce que les fondus d'entrée et de sortie sont eux aussi une variation
 * d'amplitude : les compter ferait passer un son parfaitement constant pour un son qui bat. Le
 * filtre a besoin du même écart pour s'établir.
 */
export function profondeurDeModulation(
  x: Float32Array, porteuse: number, battement: number, sampleRate: number,
): number {
  const env = enveloppeParDemodulation(x, porteuse, battement, sampleRate);
  const marge = Math.min(Math.floor(env.length / 4), Math.max(1, Math.round(env.length * 0.15)));
  let bas = Infinity;
  let haut = 0;
  for (let i = marge; i < env.length - marge; i++) {
    bas = Math.min(bas, env[i]);
    haut = Math.max(haut, env[i]);
  }
  return haut > 0 ? (haut - bas) / haut : 0;
}
