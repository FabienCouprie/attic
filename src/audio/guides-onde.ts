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
//
// LE REFUS DE PARLER NE S'ENTEND PLUS QUE SUR LE CUIVRE, et c'est un arbitrage assumé. La
// clarinette, qui ne s'établit pas sous 0,65 de pression, voyait les deux tiers bas de son
// réglage ne rien produire et tout son timbre écrasé sur le dernier tiers ; son réglage
// commence donc à son seuil, comme celui de la flûte commence à 0,85. Le modèle, lui, refuse
// toujours : c'est l'échelle du réglage qui ne descend plus jusque-là.

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
  /**
   * Niveau rendu, de 0 à 1 : la nuance de la note. Défaut 1.
   *
   * POURQUOI LE MODÈLE PORTE SON NIVEAU AU LIEU DE L'EFFACER. La boucle d'un guide d'onde a une
   * amplitude qui ne dépend guère du souffle — l'anche écrête —, de sorte qu'il faut normaliser pour
   * que l'instrument sonne. Mais normaliser CHAQUE note à la même crête efface la nuance : mesuré,
   * deux notes d'une même ligne jouées à vélocité 127 et 1 sortaient à 0,7174 et 0,7193, la plus
   * faible même imperceptiblement plus forte. Le facteur écrit pour la vélocité ne commandait rien.
   * La normalisation vise donc désormais `0,9 × niveau` et non 0,9, et c'est l'appelant qui dit la
   * nuance ; le mélange, lui, se normalise une fois, comme `versBuffer` l'énonce.
   */
  niveau?: number;
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
 * La pression sous laquelle chaque modèle ne parle pas encore proprement, mesurée.
 *
 * La clarinette est celle qui demande le plus de souffle : sous le seuil, l'anche ne s'établit pas
 * et il ne sort qu'un bruit. C'est pourquoi la valeur par défaut du nœud est haute.
 *
 * CETTE TABLE EST LE SEUIL, et non une documentation du seuil. Elle a longtemps été exportée sans
 * être lue par personne d'autre que son propre test, pendant que `parle` se contentait de demander
 * s'il sortait du signal : le bruit de souffle en donne, de sorte que la clarinette se déclarait
 * parlante dès 0,04.
 *
 * ET LA VALEUR DE LA CLARINETTE ÉTAIT FAUSSE, ce que personne ne pouvait voir tant que rien ne la
 * lisait. Mesuré sur sept notes de 82 à 587 Hz, le premier harmonique rapporté à son niveau établi
 * vaut 0,001 à 0,50 de pression et 0,027 encore à 0,55 ; la transition court de 0,57 à 0,63, et ce
 * n'est qu'à partir de 0,65 que TOUTES les notes du registre atteignent 0,96 de leur niveau. Le
 * seuil annoncé, 0,4, tombait donc en plein régime de souffle. Les deux autres sont confirmés : le
 * cuivre passe de 0,001 à 0,14 de pression à 0,52 à 0,16, et la flûte, dont la pression est ramenée
 * dans la plage où le modèle tient sa hauteur, parle à tout réglage.
 */
export const SEUILS: Record<Vent, number> = {
  clarinette: 0.65,
  flute: 0,
  cuivre: 0.2,
};

/**
 * Ce à quoi la pression 0 du réglage correspond, instrument par instrument.
 *
 * LE RÉGLAGE COUVRE LA PLAGE OÙ LE MODÈLE EST JUSTE, et non l'intervalle abstrait de zéro à un.
 * Sans cela, les deux tiers bas du curseur d'une clarinette ne produisent rien et son timbre se
 * trouve écrasé sur le dernier tiers, alors qu'il y change : à 220 Hz, le centre de gravité du
 * spectre descend de 1234 à 968 Hz entre le seuil et la pleine pression, et les harmoniques impairs
 * culminent au milieu de la plage.
 *
 * LE CUIVRE GARDE SON ÉCHELLE, parce qu'il n'y gagnerait rien : son seuil ne lui retire qu'un
 * cinquième de course, et son timbre s'ouvre du tout au tout sur ce qui reste, de 1473 à 3399 Hz de
 * centre de gravité. C'est donc chez lui, désormais, que s'entend le refus de parler d'un modèle
 * trop peu excité.
 */
export const PLANCHERS: Record<Vent, number> = {
  // L'anche ne s'établit pas sous son seuil : le réglage y commence.
  clarinette: SEUILS.clarinette,
  // La flûte parle à toute pression, mais ne tient sa hauteur qu'au-dessus de 0,85.
  flute: 0.85,
  cuivre: 0,
};

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
  // LA PRESSION DEMANDÉE EST RAMENÉE DANS LA PLAGE OÙ LE MODÈLE EST JUSTE, par `PLANCHERS`. Deux
  // raisons distinctes y mènent, et il vaut de les dire séparément.
  //   LA FLÛTE ne tient sa hauteur qu'au-dessus de 0,85 : en dessous, elle s'installe sur le
  //   cinquième mode du tuyau — un la 220 sort à 372 Hz —, et ce n'est PAS l'octaviation d'une
  //   vraie flûte, où souffler plus fort monte le registre ; ici c'est souffler moins. Un artefact,
  //   donc, et le réglage agit sur la dynamique, non sur le registre.
  //   LA CLARINETTE, elle, est juste dès qu'elle parle, mais ne parle pas sous 0,65 : les deux
  //   tiers bas du réglage ne produisaient rien, et tout son timbre était écrasé sur le dernier
  //   tiers. Le réglage commence donc à son seuil.
  const plancher = PLANCHERS[config.instrument];
  const pression = plancher + (1 - plancher) * demandee;

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

  // Sous une certaine pression, l'anche ne décolle pas : le modèle reste muet, et c'est le
  // comportement d'un vrai instrument, non un défaut à corriger. Le seuil est celui de `SEUILS`,
  // mesuré par instrument ; la valeur efficace ne sert plus qu'à écarter le cas dégénéré d'une
  // boucle qui n'a pas démarré du tout, puisque le bruit de souffle, lui, en donne toujours.
  // LA COMPARAISON PORTE SUR LA PRESSION RAMENÉE, celle que la boucle a réellement reçue, et non
  // sur le réglage : un instrument dont le réglage commence à son seuil parle donc partout, ce qui
  // est le propos de `PLANCHERS`. Seul le cuivre, qui garde son échelle, refuse encore de parler.
  const rms = Math.sqrt(energie / longueur);
  const parle = rms > 0.005 && pression >= SEUILS[config.instrument];

  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
  if (crete > 0.001) {
    const g = (0.9 * Math.max(0, Math.min(1, config.niveau ?? 1))) / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return { signal, parle };
}
