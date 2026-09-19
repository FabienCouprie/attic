// audio/guides-onde.ts — Instruments à vent par guide d'onde.
//
// Un instrument à vent n'est pas un oscillateur muni d'un filtre : c'est un TUYAU dans
// lequel une onde de pression fait l'aller-retour, et une anche — ou une lèvre, ou un jet
// d'air — qui décide, à chaque retour, de ce qu'elle laisse passer. Julius Smith a montré
// dans les années 1980 qu'on pouvait simuler cela avec une simple ligne de retard bouclée
// sur elle-même et une non-linéarité à l'entrée : le guide d'onde numérique. Perry Cook en
// a tiré les instruments du Synthesis ToolKit, dont ces trois-ci s'inspirent.
//
// L'intérêt n'est pas l'économie — Attic a déjà de la FM et des échantillons — mais le
// COMPORTEMENT. Un modèle de ce genre fait de lui-même des choses qu'aucun échantillon ne
// fait : il met un temps à s'établir, il refuse de sonner si l'on souffle trop peu, il
// passe dans le registre supérieur si l'on souffle trop, et la clarinette n'y produit que
// des harmoniques impairs parce que son tuyau est fermé à un bout. Rien de tout cela n'est
// programmé comme un effet : cela tombe du modèle.

export type Vent = "clarinette" | "flute" | "cuivre";

export interface ConfigVent {
  instrument: Vent;
  /** Fréquence jouée, en hertz : elle fixe la longueur du tuyau. */
  frequence: number;
  duree: number;
  frequenceEch: number;
  /** Pression de souffle, de 0 à 1. En dessous du seuil, l'instrument ne parle pas. */
  pression: number;
  /** Part de bruit de souffle, de 0 à 1. */
  souffle: number;
  /** Profondeur du vibrato, de 0 à 1. */
  vibrato: number;
  /** Fréquence du vibrato, en hertz. */
  frequenceVibrato: number;
  /** Durées d'attaque et d'extinction du souffle, en secondes. */
  attaque: number;
  extinction: number;
}

/** Une ligne de retard à longueur fractionnaire, interpolée linéairement. */
function ligneRetard(longueurMax: number) {
  const tampon = new Float32Array(Math.max(4, Math.ceil(longueurMax) + 4));
  let ecriture = 0;
  let longueur = 1;
  return {
    regler(l: number) { longueur = Math.max(1, Math.min(tampon.length - 2, l)); },
    lire(): number {
      const pos = ecriture - longueur + tampon.length;
      const i = Math.floor(pos) % tampon.length;
      const f = pos - Math.floor(pos);
      return tampon[i] * (1 - f) + tampon[(i + 1) % tampon.length] * f;
    },
    ecrire(x: number) {
      tampon[ecriture] = x;
      ecriture = (ecriture + 1) % tampon.length;
    },
  };
}

/** Un passe-bas à un pôle : les pertes du tuyau, qui mangent les aigus à chaque tour. */
function unPole(pole: number, gain = 1) {
  let y = 0;
  return (x: number): number => {
    y = gain * (1 - Math.abs(pole)) * x + pole * y;
    return y;
  };
}

/**
 * Le retard qu'ajoute le filtre de pertes, en échantillons.
 *
 * Sans cette correction, l'instrument sonne faux : le filtre allonge la boucle, donc
 * baisse la hauteur. Mesuré avant correction, la clarinette rendait 218 Hz pour 220
 * demandés ; c'est exactement ce retard-là qui manquait.
 */
const retardDuPole = (pole: number): number => Math.abs(pole) / (1 - Math.abs(pole));

/** Coupe la composante continue, qui ferait dériver la boucle vers la saturation. */
function bloqueurContinu() {
  let x1 = 0, y1 = 0;
  return (x: number): number => {
    const y = x - x1 + 0.995 * y1;
    x1 = x;
    y1 = y;
    return y;
  };
}

/**
 * La table d'anche : une droite bornée.
 *
 * C'est la pièce qui fait tout. La différence de pression entre la bouche et le tuyau
 * commande l'ouverture de l'anche, et la bornée à ±1 suffit à engendrer le régime
 * auto-entretenu — l'anche se ferme quand la pression est trop forte, ce qui produit
 * l'oscillation. Cook donne une pente de −0,3 autour d'une ouverture de 0,7.
 */
const tableAnche = (x: number): number => Math.max(-1, Math.min(1, 0.7 - 0.3 * x));

/** La table du jet d'air d'une flûte : un cube, qui sature de part et d'autre. */
const tableJet = (x: number): number => {
  const y = x * (x * x - 1);
  return Math.max(-1, Math.min(1, y));
};

/** Enveloppe de souffle : montée, tenue, chute. */
function enveloppe(i: number, longueur: number, attaque: number, extinction: number, fs: number): number {
  const a = Math.max(1, attaque * fs);
  const e = Math.max(1, extinction * fs);
  if (i < a) return i / a;
  if (i > longueur - e) return Math.max(0, (longueur - i) / e);
  return 1;
}

export interface ResultatVent {
  signal: Float32Array;
  /** Vrai si l'instrument a parlé : sous le seuil de pression, il reste muet. */
  parle: boolean;
}

/**
 * Synthétise une note.
 *
 * Les trois instruments partagent la même boucle — retard, pertes, non-linéarité — et ne
 * diffèrent que par la longueur du tuyau et par ce qui se passe à son entrée. La
 * CLARINETTE réfléchit l'onde en l'inversant, ce qui ne laisse vivre dans le tuyau que les
 * harmoniques impairs et explique son timbre creux ; elle sonne une octave plus bas qu'un
 * tuyau ouvert de même longueur. La FLÛTE, ouverte aux deux bouts, garde tous les
 * harmoniques. Le CUIVRE remplace l'anche par une lèvre qui a sa propre fréquence de
 * résonance, ce qui lui permet de choisir l'harmonique sur lequel il s'accroche.
 */
export function synthetiserVent(config: ConfigVent, aleatoire: () => number): ResultatVent {
  const fs = config.frequenceEch;
  const longueur = Math.max(1, Math.ceil(config.duree * fs));
  const signal = new Float32Array(longueur);
  const f = Math.max(20, Math.min(fs / 4, config.frequence));
  const demandee = Math.max(0, Math.min(1, config.pression));
  // LA FLÛTE, et c'est une limite dite plutôt que tue : son modèle ne tient sa hauteur
  // qu'au-dessus de 0,85 de pression. En dessous, il s'installe sur le cinquième mode du
  // tuyau — un la 220 sort à 372 Hz —, et ce n'est PAS l'octaviation d'une vraie flûte,
  // où souffler plus fort monte le registre : ici c'est souffler moins. C'est donc un
  // artefact, et la pression demandée est ramenée dans la plage où le modèle est juste.
  // Le réglage agit alors sur la dynamique, non sur le registre.
  const pression = config.instrument === "flute" ? 0.85 + 0.15 * demandee : demandee;

  // Le tuyau. La clarinette est fermée à un bout : un aller-retour ne fait qu'une
  // DEMI-période, et la réflexion inverse l'onde. La flûte est ouverte des deux côtés, et
  // le modèle la fait parler sur son troisième partiel, comme une flûte réelle qu'on fait
  // octavier — d'où la longueur de tuyau une fois et demie plus grande.
  const polePertes = config.instrument === "flute" ? 0.85 : 0.7;
  const pertes = unPole(polePertes, config.instrument === "flute" ? -0.95 : 1);
  const retardBrut = config.instrument === "clarinette"
    ? fs / f / 2
    : config.instrument === "flute"
      ? fs / (f * (2 / 3))
      : fs / f;
  // La flûte parle sur son troisième mode, où le filtre de pertes ne retarde plus autant
  // qu'au continu : la compenser comme la clarinette la rendrait trop haute d'un demi-ton.
  const retard = config.instrument === "clarinette"
    ? Math.max(2, retardBrut - retardDuPole(polePertes))
    : retardBrut;
  const tuyau = ligneRetard(retardBrut + 8);
  tuyau.regler(retard);

  const jet = ligneRetard(retardBrut + 8);
  jet.regler(retard * 0.32); // rapport jet/tuyau d'une flûte
  const continu = bloqueurContinu();
  const continuLevre = bloqueurContinu();

  // L'ATTAQUE DÉCIDE DU REGISTRE. Un tuyau ouvert a plusieurs modes et rien, dans la
  // boucle, ne dit lequel doit s'installer : mesuré, la flûte et le cuivre choisissaient
  // seuls le mode qui leur plaisait, et un la 440 demandé sortait à 164 Hz. C'est le
  // problème d'un débutant, qui obtient n'importe quel partiel. On l'amorce donc en
  // remplissant le tuyau d'une onde à la note visée, ce qui est la traduction numérique
  // d'une attaque nette : le mode qui démarre est celui qui reste.
  if (config.instrument !== "clarinette") {
    for (let k = 0; k < Math.ceil(retard); k++) {
      tuyau.ecrire(0.3 * Math.sin((2 * Math.PI * f * k) / fs));
    }
  }

  let energie = 0;
  for (let i = 0; i < longueur; i++) {
    const env = enveloppe(i, longueur, config.attaque, config.extinction, fs);
    const vib = 1 + config.vibrato * 0.1 * Math.sin((2 * Math.PI * config.frequenceVibrato * i) / fs);
    const bruit = config.souffle * (2 * aleatoire() - 1);
    const souffle = pression * env * vib * (1 + bruit * 0.3);

    let sortie = 0;
    if (config.instrument === "clarinette") {
      // Réflexion inversée au bout fermé : d'où les harmoniques impairs.
      const retour = -0.95 * pertes(tuyau.lire());
      const differentiel = retour - souffle;
      sortie = souffle + differentiel * tableAnche(differentiel);
      tuyau.ecrire(sortie);
    } else if (config.instrument === "flute") {
      // Le jet d'air se réfléchit à l'embouchure et au bout du tuyau ; c'est le
      // déséquilibre entre les deux qui entretient l'oscillation.
      const retour = continu(pertes(tuyau.lire()));
      jet.ecrire(souffle - 0.5 * retour);
      sortie = tableJet(jet.lire()) + 0.5 * retour;
      tuyau.ecrire(sortie);
      sortie *= 0.3;
    } else {
      // Le cuivre : tuyau ouvert, donc réflexion NON inversée et tous les harmoniques.
      // La lèvre est remplacée par une saturation dont l'attaque monte avec la pression.
      // C'est une simplification assumée du modèle à lèvre résonante — elle ne sait donc
      // pas changer de partiel toute seule —, mais elle donne le trait qui fait le cuivre :
      // le son s'enrichit quand on souffle fort, parce que l'onde se raidit en se
      // propageant. Une lèvre résonante, essayée d'abord, tirait la hauteur de 10 %.
      // Les pertes remontent quand le souffle cesse : mesuré, la boucle seule gardait un
      // gain supérieur à un — la table d'anche écrête et le fait même monter aux grandes
      // amplitudes —, et la note continuait après l'enveloppe. Un joueur ferme aussi les
      // lèvres pour arrêter le son ; c'est ce que fait cet amortissement.
      const retour = 0.85 * (0.6 + 0.4 * env) * pertes(tuyau.lire());
      const differentiel = retour - souffle;
      const brut = souffle + differentiel * tableAnche(differentiel);
      // Le raidissement suit le souffle INSTANTANÉ, enveloppe comprise, et non le réglage
      // de pression. C'est ce qui donne au modèle son gain de boucle supérieur à un — donc
      // l'auto-oscillation — tout en le laissant retomber sous un quand on cesse de
      // souffler. Avec un raidissement fixé par le réglage, le son ne s'éteignait jamais.
      const attaque = 1 + 3 * Math.abs(souffle);
      sortie = Math.tanh(brut * attaque) / Math.tanh(attaque);
      tuyau.ecrire(continuLevre(sortie));
    }
    signal[i] = sortie;
    energie += sortie * sortie;
  }

  // Sous une certaine pression, l'anche ne décolle pas : le modèle reste muet, et c'est
  // le comportement d'un vrai instrument, non un défaut à corriger.
  const rms = Math.sqrt(energie / longueur);
  const parle = rms > 0.005;

  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
  if (crete > 0.001) {
    const g = 0.9 / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return { signal, parle };
}

/**
 * La pression sous laquelle chaque modèle ne parle pas encore proprement, mesurée.
 *
 * La clarinette est celle qui demande le plus de souffle : sous 0,4 l'anche ne s'établit
 * pas et il ne sort qu'un bruit. C'est le comportement d'une vraie anche, pas un défaut,
 * et c'est pourquoi la valeur par défaut du nœud est haute.
 */
export const SEUILS: Record<Vent, number> = {
  clarinette: 0.4,
  flute: 0,
  cuivre: 0.2,
};
