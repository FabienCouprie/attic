// audio/illusion-octave.ts — L'illusion d'octave de Diana Deutsch.
//
// D'OÙ VIENT CE STIMULUS. Diana Deutsch, « An auditory illusion », Nature 251, 1974, p. 307-309.
// Deux sons séparés d'une octave alternent au casque : quand l'oreille droite reçoit l'aigu, la
// gauche reçoit le grave, et l'assignation s'échange au pas suivant. Les deux oreilles reçoivent
// donc un son en permanence, et jamais le même. Or la plupart des auditeurs entendent UN seul son,
// qui saute d'une oreille à l'autre en changeant de hauteur.
//
// LE MODÈLE À DEUX VOIES, ET C'EST CE QUI EN FAIT AUTRE CHOSE QU'UNE CURIOSITÉ. Diana Deutsch et
// Philip Roll, « Separate "what" and "where" decision mechanisms in processing a dichotic tonal
// sequence », Journal of Experimental Psychology: Human Perception and Performance 2(1), 1976,
// p. 23-29, séparent deux décisions que l'écoute ordinaire ne distingue pas : la HAUTEUR suit ce que
// reçoit l'oreille dominante, et le CÔTÉ suit l'oreille qui reçoit le son le plus aigu. Les deux
// décisions se rapportent au même instant et ne portent pourtant pas sur la même oreille : c'est de
// leur désaccord que naît le percept.
//
// D'OÙ LA RÉPONSE DÉPEND DE L'AUDITEUR. Diana Deutsch, « The octave illusion in relation to
// handedness and familial handedness background », Neuropsychologia 21(3), 1983, p. 289-293, relie
// l'orientation de la réponse à la latéralité et à celle de la famille. Une dominance droite fait
// entendre l'aigu à droite et le grave à gauche ; une dominance gauche donne l'image inverse.
//
// L'ÉPREUVE QUI TRANCHE EST D'ÉCHANGER LES DEUX CANAUX. Si le percept tenait à la place d'un son
// dans la suite, il s'inverserait ; s'il tient à l'oreille, il ne bouge pas. C'est ce que le réglage
// « Aigu d'abord à » permet de refaire sans toucher au casque.

/** Ce que les deux oreilles reçoivent à un pas donné, en hertz. */
export interface Pas {
  rang: number;
  gauche: number;
  droite: number;
}

export interface OptionsSequence {
  /** Le son grave, en hertz. */
  frequence: number;
  /** L'écart entre les deux sons, en demi-tons. Douze font l'octave. */
  ecart: number;
  /** Le nombre de pas de la suite. */
  alternances: number;
  /** Vrai si le premier pas envoie l'aigu à l'oreille droite. */
  aiguADroiteDabord: boolean;
}

/**
 * Ce qui est envoyé à chaque oreille, pas par pas.
 *
 * AUCUNE OREILLE NE SE TAIT JAMAIS, et c'est la condition de l'illusion : une suite où une oreille
 * se tairait pendant que l'autre sonne ne serait qu'une alternance, entendue pour ce qu'elle est.
 * Ici les deux reçoivent un son à chaque instant, et ce sont deux sons différents.
 */
export function pasDeLaSequence(o: OptionsSequence): Pas[] {
  const grave = Math.max(1, o.frequence);
  const aigu = grave * Math.pow(2, Math.max(0, o.ecart) / 12);
  const combien = Math.max(1, Math.round(o.alternances));
  return Array.from({ length: combien }, (_, rang) => {
    // L'OREILLE QUI TIENT L'AIGU CHANGE À CHAQUE PAS : c'est le seul mouvement du stimulus.
    const aiguADroite = (rang % 2 === 0) === o.aiguADroiteDabord;
    return { rang, gauche: aiguADroite ? grave : aigu, droite: aiguADroite ? aigu : grave };
  });
}

/** Le percept que le modèle à deux voies prédit à un pas donné. */
export interface Percept {
  rang: number;
  /** La hauteur entendue, en hertz. */
  hauteur: number;
  /** Le côté où elle s'entend. */
  cote: "gauche" | "droite";
}

/**
 * Ce que le modèle de Deutsch et Roll prédit, pour une oreille dominante donnée.
 *
 * LES DEUX DÉCISIONS NE REGARDENT PAS LA MÊME OREILLE, et le calcul le dit en deux lignes : la
 * hauteur vient de l'oreille dominante, le côté vient de l'oreille qui tient l'aigu. À un pas sur
 * deux ces deux oreilles sont la même, à l'autre elles ne le sont pas, et la hauteur s'entend alors
 * du côté où elle n'a pas été envoyée.
 */
export function perceptsDuModele(
  pas: readonly Pas[], dominante: "gauche" | "droite",
): Percept[] {
  return pas.map((p) => ({
    rang: p.rang,
    hauteur: dominante === "droite" ? p.droite : p.gauche,
    cote: p.droite > p.gauche ? "droite" : "gauche",
  }));
}

export interface OptionsRendu {
  /** La durée d'un pas, en secondes. */
  dureeDunTon: number;
  /** Le fondu aux deux bouts de chaque pas, en secondes. */
  fondu: number;
  /** Le niveau, de 0 à 1. */
  niveau: number;
  sampleRate: number;
}

/**
 * L'enveloppe d'un pas : un fondu en cosinus surélevé aux deux bouts, et rien entre les deux.
 *
 * SANS LUI CHAQUE CHANGEMENT EST UN CLIC, et un clic porte toutes les fréquences : il désignerait
 * l'alternance à l'oreille aussi sûrement qu'un métronome, alors que c'est précisément elle que
 * l'auditeur ne doit pas entendre.
 */
function enveloppe(j: number, n: number, fondu: number): number {
  if (fondu <= 0) return 1;
  const montee = j < fondu ? (j + 0.5) / fondu : 1;
  const descente = n - 1 - j < fondu ? (n - j - 0.5) / fondu : 1;
  const u = Math.max(0, Math.min(1, Math.min(montee, descente)));
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

/**
 * Les deux canaux rendus en échantillons.
 *
 * LE TEMPS EST COMPTÉ D'UN BOUT À L'AUTRE DE LA SUITE, et non depuis le début de chaque pas : une
 * fréquence qui revient reprend ainsi la phase qu'elle aurait eue sans interruption, et le raccord
 * ne laisse rien d'audible sous le fondu.
 */
export function echantillonsDichotiques(
  pas: readonly Pas[], o: OptionsRendu,
): { gauche: Float32Array; droite: Float32Array } {
  const sr = Math.max(1, Math.round(o.sampleRate));
  const parPas = Math.max(1, Math.round(Math.max(0, o.dureeDunTon) * sr));
  const gauche = new Float32Array(parPas * pas.length);
  const droite = new Float32Array(parPas * pas.length);
  const fondu = Math.max(0, Math.min(Math.floor(parPas / 2), Math.round(Math.max(0, o.fondu) * sr)));
  const niveau = Math.max(0, Math.min(1, o.niveau));

  for (let k = 0; k < pas.length; k++) {
    const debut = k * parPas;
    for (let j = 0; j < parPas; j++) {
      const i = debut + j;
      const t = i / sr;
      const e = enveloppe(j, parPas, fondu) * niveau;
      gauche[i] = Math.sin(2 * Math.PI * pas[k].gauche * t) * e;
      droite[i] = Math.sin(2 * Math.PI * pas[k].droite * t) * e;
    }
  }
  return { gauche, droite };
}
