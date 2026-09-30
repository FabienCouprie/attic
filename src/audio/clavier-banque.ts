// audio/clavier-banque.ts — Étaler un son sur les 88 touches, et le jouer.
//
// LE PROBLÈME, EN CHIFFRES. Un clavier de 88 touches va de La0 (27,5 Hz) à Do8 (4186 Hz) : un
// rapport de 152, sept octaves et une tierce mineure. Un échantillonneur naïf — celui que fait
// « Sampler MIDI » — rééchantillonne un seul son depuis une seule note de référence : le rapport de
// lecture va alors de 0,105 à 16, si bien qu'un son de deux secondes dure DIX-NEUF SECONDES en bas
// du clavier et CENT VINGT-CINQ MILLISECONDES en haut. Une attaque de 5 ms devient 48 ms de bouillie
// en bas et 0,3 ms de clic en haut. C'est l'effet « écureuil », et aucun réglage ne le rattrape.
//
// LA SOLUTION EST CELLE DES ÉCHANTILLONNEURS, et elle sépare deux transpositions qu'on confond
// souvent :
//
//  1. CONSTRUIRE la banque : le son source est transposé vers chaque note-racine par un procédé À
//     DURÉE CONSTANTE — un vocodeur de phase. Les intervalles sont grands, jusqu'à quatre octaves,
//     et c'est justement là qu'un rééchantillonnage écraserait la durée.
//  2. JOUER une note : la zone la plus proche est rééchantillonnée d'au plus `largeur` demi-tons.
//     À ±2 demi-tons, la durée ne bouge que de 12 %, ce qui ne s'entend pas comme un défaut — et le
//     rééchantillonnage, lui, est juste à la hauteur au cent près par construction.
//
// LA RÈGLE DES ZONES. La pratique des bibliothèques d'échantillons veut qu'on ne rééchantillonne
// pas de plus de deux ou trois demi-tons — la « règle de la tierce mineure ». À ±2, il faut dix-huit
// ou dix-neuf zones pour 88 touches ; à ±6, une par octave, et l'on entend le découpage.
//
// UNE ZONE EST TOUJOURS LE SON LUI-MÊME. La grille des racines est ancrée sur la note d'origine du
// son source, de sorte qu'une zone au moins ne subit AUCUNE transposition. C'est une ligne de code
// et un gain de qualité gratuit — au prix d'une zone de plus, la grille ne tombant alors pas
// exactement sur les bornes du clavier.
//
// LE SUIVI DE TOUCHE. Un instrument réel est plus COURT vers l'aigu : une corde de piano grave tient
// vingt secondes, une aiguë moins d'une. On raccourcit donc chaque zone selon sa racine, par
// troncature et fondu — et non par rééchantillonnage, qui changerait la hauteur.
import { changerTonalite } from "./effets-spectral";

import type { Note } from "./note";
/** La0, première touche d'un piano. */
export const NOTE_LA0 = 21;
/** Do8, dernière touche. */
export const NOTE_DO8 = 108;

export interface PlanZone {
  /** Note MIDI à laquelle l'échantillon de la zone est juste. */
  racine: number;
  /** Première et dernière touche couvertes, incluses. */
  basse: number;
  haute: number;
}

/** Les deux bornes d'une boucle de maintien, en échantillons de la zone. */
export interface Boucle {
  debut: number;
  fin: number;
}

export interface Zone extends PlanZone {
  /** L'échantillon transposé pour cette racine. */
  audio: AudioBuffer;
  /** Boucle de maintien, en échantillons, quand la note doit pouvoir tenir. */
  boucle?: Boucle;
  /**
   * Désaccord de la zone, en cents. Les banques construites par Attic n'en ont pas — leurs zones
   * sont justes par construction —, mais un SFZ lu peut en déclarer un par région (`tune`).
   */
  accord?: number;
  /** Gain de la zone, en facteur linéaire. Vient du `volume` d'une région SFZ, en décibels. */
  gain?: number;
  /**
   * La zone suit-elle la touche jouée ? Vrai par défaut.
   *
   * Faux pour un son de percussion : il sort tel qu'il est enregistré, quelle que soit la touche.
   * C'est ce que le format SFZ écrit `pitch_keytrack=0`, et ce que déclarent la plupart des kits.
   */
  suitLaTouche?: boolean;
  /**
   * Plage de vélocité de la zone, incluse — sa COUCHE.
   *
   * Un piano échantillonné sérieusement a trois à huit enregistrements par touche : joué doucement,
   * un marteau effleure la corde et le son est rond ; joué fort, il claque. Ce n'est pas une affaire
   * de niveau — un échantillon fort baissé de vingt décibels reste un échantillon fort, et c'est
   * précisément ce qu'on entendait : « un piano joué doucement sonne dur ».
   *
   * Absentes, ces bornes valent 0 et 127 : la zone couvre toutes les nuances, ce qui est le cas des
   * banques qu'Attic fabrique lui-même.
   */
  velBasse?: number;
  velHaute?: number;
  /**
   * De combien la vélocité fait encore varier le NIVEAU, de 0 à 100.
   *
   * `amp_veltrack` du format SFZ. Cent : le niveau suit la vélocité comme avant. Zéro : la vélocité
   * ne choisit que la couche, et le niveau ne bouge plus. C'est ce que règlent les bibliothèques à
   * couches, sous peine d'un double effet — la couche douce ET le niveau baissé —, qui rend les notes
   * jouées piano presque inaudibles.
   */
  suiviVelocite?: number;
}

export interface Banque {
  zones: Zone[];
  /** Note d'origine du son source. */
  racineSource: number;
  /** Demi-tons de rééchantillonnage tolérés de part et d'autre d'une racine. */
  largeur: number;
  noteBasse: number;
  noteHaute: number;
  /**
   * Combien de COUCHES DE VÉLOCITÉ distinctes la banque contient, 1 quand elle n'en a pas.
   *
   * Sert à le dire : « 8 zones × 3 couches » n'est pas la même banque que « 24 zones ».
   */
  couches?: number;
  /**
   * Vrai pour un KIT : une touche est un SON, pas une hauteur.
   *
   * C'est la convention des percussions — 36 grosse caisse, 38 caisse claire, 42 charley —, et elle
   * contredit celle d'une banque de hauteurs sur deux points. D'abord, une touche non couverte ne
   * joue RIEN : la chercher « la plus proche » ferait entendre la grosse caisse à la place d'un tom
   * absent, mesuré à un demi-ton près sur un vrai kit. Ensuite, un échantillon de kit se joue tel
   * qu'il a été enregistré, sans rééchantillonnage.
   */
  kit?: boolean;
}

/**
 * Les racines et leurs zones, ancrées sur la note d'origine.
 *
 * Une racine peut tomber HORS du clavier — sa zone n'en couvre alors qu'une partie —, ce qui vaut
 * mieux qu'une zone élargie aux bords : aucune touche ne se retrouve transposée de plus de
 * `largeur`, ce qui est toute la promesse.
 */
export function planZones(
  noteBasse: number, noteHaute: number, largeur: number, racineSource: number,
): PlanZone[] {
  const l = Math.max(1, Math.round(largeur));
  const pas = 2 * l + 1;
  // Première racine dont la zone atteint la note la plus grave.
  const k0 = Math.ceil((noteBasse - l - racineSource) / pas);
  const plan: PlanZone[] = [];
  for (let k = k0; ; k++) {
    const racine = racineSource + k * pas;
    const basse = Math.max(noteBasse, racine - l);
    const haute = Math.min(noteHaute, racine + l);
    if (basse > haute) { if (racine - l > noteHaute) break; else continue; }
    plan.push({ racine, basse, haute });
    if (racine + l >= noteHaute) break;
  }
  return plan;
}

export interface OptionsBanque {
  racineSource: number;
  noteBasse?: number;
  noteHaute?: number;
  largeur?: number;
  /**
   * Comment transposer vers chaque racine. Par défaut le vocodeur de phase d'Attic, qui garde la
   * durée ; injectable pour que les tests éprouvent la logique de zones sans dépendre du procédé.
   */
  transposer?: (source: AudioBuffer, demiTons: number) => AudioBuffer;
  /** Part du raccourcissement vers l'aigu, de 0 (aucun) à 1 (durée divisée par deux par octave). */
  suiviTouche?: number;
  /** Vrai : chaque zone reçoit une boucle de maintien, pour que la note puisse tenir. */
  boucle?: boolean;
  /** Début de la boucle, en part de l'échantillon. */
  boucleDebut?: number;
  /**
   * Longueur de la boucle, en SECONDES, et non en part de l'échantillon.
   *
   * POURQUOI EN SECONDES. La boucle allait du début choisi jusqu'à 95 % de l'échantillon : sur un
   * son d'une seconde cela fait un maintien, sur un son de trente secondes cela fait un cycle de
   * treize secondes, et l'on entend le son RECOMMENCER au lieu de tenir. Relevé par Fabien sur une
   * note tenue. Une boucle de maintien est courte par nature, et sa longueur ne dépend pas de celle
   * du son : elle se donne donc dans l'unité où on l'entend.
   *
   * La fin reste bornée à 95 % de l'échantillon : au-delà, la boucle mordrait sur l'extinction.
   */
  boucleLongueur?: number;
}

/**
 * Les bornes de la boucle de maintien d'une zone, ou rien si l'échantillon est trop court.
 *
 * UNE SEULE RÈGLE POUR LES DEUX FABRIQUES DE BANQUE, qui la recopiaient chacune de son côté.
 */
function bornesDeBoucle(
  audio: AudioBuffer, o: { boucleDebut?: number; boucleLongueur?: number },
): Boucle | undefined {
  const debut = Math.round(audio.length * Math.min(0.9, Math.max(0.05, o.boucleDebut ?? 0.5)));
  const bout = Math.round(audio.length * 0.95);
  const longueur = Math.round(Math.max(0.05, o.boucleLongueur ?? 2) * audio.sampleRate);
  const fin = Math.max(debut + 32, Math.min(bout, debut + longueur));
  return fin < audio.length ? { debut, fin } : undefined;
}

/** Tronque un échantillon avec un fondu, sans toucher à la hauteur. */
function tronquer(audio: AudioBuffer, longueur: number, fondu: number): AudioBuffer {
  const n = Math.max(1, Math.min(audio.length, Math.round(longueur)));
  const sortie = new AudioBuffer({
    numberOfChannels: audio.numberOfChannels, length: n, sampleRate: audio.sampleRate,
  });
  const f = Math.min(Math.round(fondu), n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const src = audio.getChannelData(c), dst = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) dst[i] = src[i];
    for (let i = 0; i < f; i++) dst[n - f + i] *= 1 - i / f;
  }
  return sortie;
}

/**
 * La banque : un échantillon par zone, transposé depuis le son source.
 *
 * C'est ici que tout le calcul a lieu — dix-neuf transpositions —, et c'est voulu : jouer devient
 * alors un simple rééchantillonnage de quelques pour cent.
 */
export function construireBanque(source: AudioBuffer, o: OptionsBanque): Banque {
  const noteBasse = o.noteBasse ?? NOTE_LA0;
  const noteHaute = o.noteHaute ?? NOTE_DO8;
  const largeur = Math.max(1, Math.round(o.largeur ?? 2));
  const transposer = o.transposer ?? ((a, d) => (d === 0 ? a : changerTonalite(a, d)));
  const suivi = Math.min(1, Math.max(0, o.suiviTouche ?? 0.5));
  const plan = planZones(noteBasse, noteHaute, largeur, o.racineSource);

  const zones: Zone[] = plan.map((p) => {
    const demiTons = p.racine - o.racineSource;
    let audio = transposer(source, demiTons);
    if (suivi > 0 && demiTons !== 0) {
      // Plus aigu, plus court : la durée est divisée par deux à l'octave quand le suivi vaut un.
      const facteur = Math.pow(2, (-suivi * demiTons) / 12);
      if (facteur < 1) audio = tronquer(audio, audio.length * facteur, audio.sampleRate * 0.01);
    }
    const zone: Zone = { ...p, audio };
    if (o.boucle) {
      zone.boucle = bornesDeBoucle(audio, o);
    }
    return zone;
  });
  return { zones, racineSource: o.racineSource, largeur, noteBasse, noteHaute };
}

/**
 * La zone qui couvre cette note, ou la plus proche si la note sort du clavier.
 *
 * SAUF DANS UN KIT, où il n'y a pas de « plus proche » qui ait un sens : une touche sans son est
 * silencieuse. Mesuré sur un vrai kit chargé comme une banque de hauteurs, le repli faisait jouer la
 * grosse caisse un demi-ton plus haut sur la touche 37, et le crash à ×1,888 sur la touche 60.
 */
export function choisirZone(banque: Banque, note: number, velocite?: number): Zone | null {
  if (banque.zones.length === 0) return null;
  const surLaTouche = banque.zones.filter((z) => note >= z.basse && note <= z.haute);
  if (surLaTouche.length > 0) return parVelocite(surLaTouche, velocite);
  if (banque.kit) return null;
  // Aucune zone ne couvre la note : on prend la racine la plus proche, puis la bonne couche parmi
  // celles qui la partagent — sans quoi une banque à couches jouerait la première venue.
  let meilleure = surLaTouche[0] ?? banque.zones[0];
  for (const z of banque.zones) {
    if (Math.abs(z.racine - note) < Math.abs(meilleure.racine - note)) meilleure = z;
  }
  return parVelocite(banque.zones.filter((z) => z.racine === meilleure.racine), velocite);
}

/**
 * La couche qui convient à cette vélocité, parmi des zones qui couvrent déjà la même touche.
 *
 * SANS VÉLOCITÉ DEMANDÉE, la première : c'est le comportement d'avant les couches, et tous les
 * appels qui ne parlent que de hauteur — la mesure d'un écart de zone, par exemple — le gardent.
 *
 * UNE PLAGE MANQUANTE NE REND PAS MUET. Une bibliothèque peut laisser un trou (couches 1–63 et
 * 65–127, la vélocité 64 n'appartenant à aucune) : on prend alors la couche la plus PROCHE, plutôt
 * que de ne rien jouer sur une note qui existe.
 */
function parVelocite(zones: Zone[], velocite?: number): Zone {
  if (zones.length === 1 || velocite === undefined) return zones[0];
  const v = Math.max(0, Math.min(127, velocite));
  const dedans = zones.find((z) => v >= (z.velBasse ?? 0) && v <= (z.velHaute ?? 127));
  if (dedans) return dedans;
  const distance = (z: Zone) => {
    const bas = z.velBasse ?? 0, haut = z.velHaute ?? 127;
    return v < bas ? bas - v : v > haut ? v - haut : 0;
  };
  let meilleure = zones[0];
  for (const z of zones) if (distance(z) < distance(meilleure)) meilleure = z;
  return meilleure;
}

/** Combien de demi-tons de rééchantillonnage cette note demande-t-elle ? */
export const ecartDeZone = (banque: Banque, note: number): number => {
  const z = choisirZone(banque, note);
  return z ? note - z.racine : 0;
};

export type NoteJouee = Note;

/**
 * Ce que la vélocité fait au NIVEAU, une fois la couche choisie.
 *
 * `suivi` est `amp_veltrack` en pour-cent : cent, le niveau suit la vélocité comme il l'a toujours
 * fait ; zéro, la vélocité ne sert qu'à choisir la couche et le niveau reste plein. Entre les deux, on
 * interpole — une simplification assumée de la courbe en décibels du format, dont l'écart ne se voit
 * pas à l'oreille et qui garde la fonction lisible.
 *
 * POURQUOI CELA EXISTE : sans ce réglage, une bibliothèque à couches subit un DOUBLE effet — la
 * couche douce est choisie, ET son niveau est encore divisé par trois. Les notes jouées piano
 * disparaissaient.
 */
function gainVelocite(velocite: number, suivi?: number): number {
  const v = Math.min(1, Math.max(0, velocite / 127));
  const k = Math.min(1, Math.max(0, (suivi ?? 100) / 100));
  return 1 - k + k * v;
}

/** De quoi jouer une note : la zone, à quelle vitesse la relire, et à quel niveau. */
export interface Voix {
  zone: Zone;
  /** Rapport de lecture de l'échantillon, désaccord de la zone compris. */
  ratio: number;
  /** Gain appliqué à l'échantillon, vélocité et gain de zone compris. */
  gain: number;
}

/**
 * Ce qu'il faut pour faire sonner une note.
 *
 * Cette fonction est le SEUL endroit où se calcule le rapport de lecture, et c'est voulu : le rendu
 * hors ligne — « Sampler multi-zones » — et le jeu en direct au clavier du nœud l'appellent tous les
 * deux. Ailleurs, ce qu'on entend en jouant pouvait diverger de ce que le graphe rendait, et cela ne
 * se voit à l'oreille que si l'écart dépasse quelques cents.
 *
 * `srSortie` DEMANDE LA CONVERSION DE FRÉQUENCE, et seul un lecteur qui recopie les échantillons à la
 * main en a besoin — c'est-à-dire `rendreNotes`. Le matériel audio, lui, convertit tout seul le
 * tampon qu'on lui confie : le jeu en direct ne passe donc pas ce paramètre, sous peine de convertir
 * deux fois. Le défaut mesuré avant cette correction : une zone échantillonnée à 48 kHz dans une
 * banque rendue à 44,1 kHz sortait à 808,5 Hz au lieu de 880 — **147 cents trop bas**, soit un
 * demi-ton et demi, ce qui arrive dès qu'une bibliothèque SFZ mélange deux fréquences.
 */
export function voixPourNote(
  banque: Banque, note: number, velocite = 100, volume = 1, srSortie?: number,
): Voix | null {
  const zone = choisirZone(banque, note, velocite);
  if (!zone) return null;
  // Une zone qui ne suit pas la touche garde sa vitesse : seul son désaccord éventuel s'applique.
  const demiTons = zone.suitLaTouche === false ? 0 : note - zone.racine;
  const conversion = srSortie && srSortie > 0 ? zone.audio.sampleRate / srSortie : 1;
  return {
    zone,
    ratio: conversion * Math.pow(2, demiTons / 12 + (zone.accord ?? 0) / 1200),
    gain: Math.min(1, Math.max(0, volume)) * gainVelocite(velocite, zone.suiviVelocite) * (zone.gain ?? 1),
  };
}

/** Ce qu'il faut poser sur un `AudioBufferSourceNode` pour jouer une note en direct. */
export interface ParametresLecture {
  audio: AudioBuffer;
  /** `playbackRate` : le rapport de lecture. */
  vitesse: number;
  /** Gain à poser sur le nœud de gain qui suit la source. */
  gain: number;
  boucle: boolean;
  /** `loopStart` et `loopEnd`, en SECONDES — l'unité qu'attend Web Audio, là où la zone les garde
   *  en échantillons. La conversion oubliée faisait boucler sur les premières millisecondes. */
  boucleDebut: number;
  boucleFin: number;
}

/**
 * L'échantillon dont le RACCORD DE BOUCLE est déjà fondu, prêt à être bouclé tel quel.
 *
 * POURQUOI LE FONDU EST CUIT DANS LE TAMPON. Web Audio boucle tout seul, et il saute de `loopEnd` à
 * `loopStart` SANS RIEN FONDRE : l'onde ne revient pas à la même phase, et chaque tour laisse un
 * clic. C'est ce que la notice du composant promettait pourtant d'éviter, « le raccord est fondu,
 * faute de quoi chaque tour laisserait un clic ». Relevé par Fabien sur une note tenue : un
 * cliquetis, une reprise du son, un cliquetis, une reprise.
 *
 * LE FONDU SE FAIT AVEC CE QUI PRÉCÈDE LE DÉBUT DE BOUCLE, et non avec ce qui le suit. C'est la
 * seule façon qu'un saut de `fin` vers `debut` soit continu : la queue de la boucle est amenée à
 * ressembler à ce qui précède `debut`, si bien que l'échantillon d'après le saut prolonge celui
 * d'avant. Fondre vers ce qui SUIT `debut` rendrait la queue semblable à `debut + fondu`, et le saut
 * répéterait alors la fenêtre du fondu : c'est ce que faisait le rendu hors ligne, et cela laissait
 * un saut de 48 % de la crête mesuré sur une note tenue de six secondes.
 *
 * LE RÉSULTAT EST GARDÉ, parce qu'une banque a quatre-vingt-huit zones et qu'un son long en pèse
 * autant : le recalculer à chaque touche appuyée coûterait une copie complète par note jouée.
 */
const fondusEnCache = new WeakMap<AudioBuffer, Map<number, AudioBuffer>>();

export function audioBoucleFondue(audio: AudioBuffer, boucle: Boucle, fonduEch: number): AudioBuffer {
  const f = Math.max(1, Math.min(
    Math.round(fonduEch), boucle.debut, Math.floor((boucle.fin - boucle.debut) / 2),
  ));
  const parFondu = fondusEnCache.get(audio) ?? new Map<number, AudioBuffer>();
  const deja = parFondu.get(f);
  if (deja) return deja;

  const out = new AudioBuffer({
    numberOfChannels: audio.numberOfChannels, length: audio.length, sampleRate: audio.sampleRate,
  });
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const x = audio.getChannelData(c);
    const y = out.getChannelData(c);
    y.set(x);
    for (let k = 0; k < f; k++) {
      // Le poids ne touche ni zéro ni un : aux deux bouts, la fenêtre doit rejoindre ses voisines
      // sans marche.
      const w = (k + 1) / (f + 1);
      const i = boucle.fin - f + k;
      y[i] = x[i] * (1 - w) + x[boucle.debut - f + k] * w;
    }
  }
  parFondu.set(f, out);
  fondusEnCache.set(audio, parFondu);
  return out;
}

/**
 * Les réglages de lecture d'une note, prêts pour Web Audio.
 *
 * Le jeu en direct — clavier d'un nœud — ne passe pas par `rendreNotes` : il confie l'échantillon au
 * matériel, qui le relit et le boucle tout seul. Ce qu'il faut lui donner se calcule ici, depuis la
 * MÊME voix que le rendu hors ligne, pour que les deux ne puissent pas diverger.
 *
 * ET CE QU'IL LUI CONFIE EST L'ÉCHANTILLON AU RACCORD FONDU, faute de quoi la promesse ci-dessus
 * était fausse sur le seul point qui s'entend.
 */
export function parametresLecture(voix: Voix, fonduBoucle = 0.02): ParametresLecture {
  const sr = voix.zone.audio.sampleRate;
  const b = voix.zone.boucle;
  return {
    audio: b ? audioBoucleFondue(voix.zone.audio, b, fonduBoucle * sr) : voix.zone.audio,
    vitesse: voix.ratio,
    gain: voix.gain,
    boucle: !!b,
    boucleDebut: b ? b.debut / sr : 0,
    boucleFin: b ? b.fin / sr : 0,
  };
}

export interface OptionsRendu {
  volume?: number;
  /** Fondu de relâchement, en secondes. */
  relachement?: number;
  /** Fondu du raccord de boucle, en secondes. */
  fonduBoucle?: number;
}

/**
 * Joue des notes avec la banque.
 *
 * Le rééchantillonnage se fait par interpolation linéaire, ce qui suffit ici : l'écart ne dépasse
 * jamais `largeur` demi-tons, soit un rapport de 1,12 à ±2 — très loin des rapports extrêmes où
 * l'interpolation linéaire s'entendrait.
 *
 * La BOUCLE DE MAINTIEN est ce qui permet à une touche tenue de sonner plus longtemps que
 * l'échantillon. Elle est relue en avant, avec un fondu au raccord ; sans ce fondu, chaque tour
 * laisserait un clic, l'onde ne revenant pas à la même phase.
 */
export function rendreNotes(
  notes: NoteJouee[], banque: Banque, o: OptionsRendu = {},
): AudioBuffer {
  const sr = banque.zones[0]?.audio.sampleRate ?? 44100;
  const volume = Math.min(1, Math.max(0, o.volume ?? 0.8));
  const relachement = Math.max(0, o.relachement ?? 0.05);
  const fonduBoucle = Math.max(0.001, o.fonduBoucle ?? 0.02);
  const duree = notes.reduce((m, n) => Math.max(m, n.fin), 0) + relachement + 0.1;
  const longueur = Math.max(1, Math.ceil(duree * sr));
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: longueur, sampleRate: sr });
  const g = sortie.getChannelData(0), d = sortie.getChannelData(1);

  for (const n of notes) {
    // `sr` est la fréquence de sortie : la passer ici est ce qui aligne une zone dont l'échantillon
    // a été enregistré à une autre fréquence.
    const voix = n.fin > n.debut ? voixPourNote(banque, n.note, n.velocite, volume, sr) : null;
    if (!voix) continue;
    const { zone, ratio, gain } = voix;
    // LE MÊME ÉCHANTILLON QUE LE JEU EN DIRECT, raccord de boucle déjà fondu. Le rendu avait sa
    // propre mécanique de fondu, qui mélangeait la queue de la boucle avec ce qui SUIT son début
    // puis sautait à son début : la fenêtre du fondu se répétait, et il restait un saut de 48 % de
    // la crête, mesuré sur une note tenue de six secondes. Une seule mise en œuvre, donc, et les
    // deux chemins ne peuvent plus diverger.
    const source = zone.boucle
      ? audioBoucleFondue(zone.audio, zone.boucle, fonduBoucle * zone.audio.sampleRate)
      : zone.audio;
    const srcG = source.getChannelData(0);
    const srcD = source.numberOfChannels > 1 ? source.getChannelData(1) : srcG;
    const debutEch = Math.max(0, Math.round(n.debut * sr));
    const finEch = Math.min(longueur, Math.round((n.fin + relachement) * sr));
    const finTenue = Math.min(longueur, Math.round(n.fin * sr));
    const fonduEch = Math.max(1, Math.round(relachement * sr));

    let pos = 0; // position de lecture dans l'échantillon, en échantillons source
    for (let i = debutEch; i < finEch; i++) {
      // Fin de l'échantillon : on boucle si l'on peut, sinon la note s'éteint.
      if (pos >= zone.audio.length - 1) {
        if (!zone.boucle) break;
        pos = zone.boucle.debut;
      }
      if (zone.boucle && pos >= zone.boucle.fin) pos = zone.boucle.debut + (pos - zone.boucle.fin);

      const k = Math.floor(pos);
      const f = pos - k;
      const vg = srcG[k] * (1 - f) + (srcG[k + 1] ?? srcG[k]) * f;
      const vd = srcD[k] * (1 - f) + (srcD[k + 1] ?? srcD[k]) * f;
      // Relâchement : la note s'éteint après la fin de la touche.
      let env = 1;
      if (i >= finTenue) env = Math.max(0, 1 - (i - finTenue) / fonduEch);
      g[i] += vg * gain * env;
      d[i] += vd * gain * env;
      pos += ratio;
    }
  }
  return sortie;
}

/**
 * Place un son dans l'espace stéréo, à puissance constante.
 *
 * LA LOI EN COSINUS ET NON EN LIGNE DROITE : un panoramique linéaire fait CHUTER le niveau au centre
 * de trois décibels, parce que deux canaux à 0,5 ne font pas un canal à 1 quand on somme des
 * puissances. Avec cosinus et sinus, la somme des carrés vaut un partout, et un instrument déplacé de
 * gauche à droite garde le même niveau perçu en passant par le milieu.
 *
 * Le panoramique va de −1 (tout à gauche) à +1 (tout à droite). Un tampon mono devient stéréo.
 */
export function appliquerPanoramique(audio: AudioBuffer, panoramique: number): AudioBuffer {
  const pan = Math.min(1, Math.max(-1, panoramique));
  if (pan === 0 && audio.numberOfChannels === 2) return audio;
  const angle = ((pan + 1) * Math.PI) / 4; // −1 → 0, 0 → π/4, +1 → π/2
  const gG = Math.cos(angle), gD = Math.sin(angle);
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: audio.length, sampleRate: audio.sampleRate });
  const srcG = audio.getChannelData(0);
  const srcD = audio.numberOfChannels > 1 ? audio.getChannelData(1) : srcG;
  const g = sortie.getChannelData(0), d = sortie.getChannelData(1);
  // Le facteur √2 rend le centre NEUTRE : cos(π/4) = 0,707, et sans compensation un son centré
  // perdrait trois décibels par le simple fait de passer par cette fonction.
  const k = Math.SQRT2;
  for (let i = 0; i < audio.length; i++) {
    g[i] = srcG[i] * gG * k;
    d[i] = srcD[i] * gD * k;
  }
  return sortie;
}

// ── Export SFZ ──────────────────────────────────────────────────────────────────

export interface OptionsSfz {
  /** Nom du dossier où sont écrits les échantillons, tel qu'il apparaîtra dans le texte. */
  dossier: string;
  /** Relâchement, en secondes, écrit dans l'enveloppe globale. */
  relachement?: number;
  /** Nom du son, pour l'en-tête. */
  nom?: string;
}

/**
 * Nom de fichier d'une zone : la racine sur trois chiffres, pour que l'ordre alphabétique suive.
 *
 * UNE COUCHE AJOUTE SA VÉLOCITÉ HAUTE au nom. Sans cela, trois couches d'une même touche portaient le
 * même nom : l'export écrivait un seul WAV — le dernier — et le fichier SFZ le désignait trois fois.
 * La banque relue aurait alors eu trois couches identiques, ce qui est pire que pas de couche du tout.
 */
export const nomEchantillon = (zone: PlanZone & { velBasse?: number; velHaute?: number }): string => {
  const base = `zone-${String(zone.racine).padStart(3, "0")}`;
  const couche = zone.velHaute !== undefined && zone.velHaute < 127 || (zone.velBasse ?? 0) > 0
    ? `-v${String(zone.velHaute ?? 127).padStart(3, "0")}` : "";
  return `${base}${couche}.wav`;
};

/**
 * Le texte SFZ d'une banque.
 *
 * SFZ est un format TEXTE, ce qui le rend exportable en une fonction pure et vérifiable : le test
 * relit ce qu'on écrit et vérifie que les quatre-vingt-huit touches sont couvertes une fois chacune.
 * Un SF2 serait un autre chantier — c'est un format binaire avec ses tables et ses générateurs.
 *
 * Trois champs portent tout : `pitch_keycenter` dit à quelle note l'échantillon est juste,
 * `lokey`/`hikey` bornent la zone, et l'échantillonneur en déduit la transposition. La boucle, quand
 * elle existe, s'écrit en échantillons avec `loop_mode=loop_sustain` — elle ne tourne alors que
 * pendant que la touche est tenue, ce qui est exactement ce que fait le sampler d'Attic.
 */
export function versSfz(banque: Banque, o: OptionsSfz): string {
  const relachement = o.relachement ?? 0.3;
  const lignes: string[] = [
    `// Banque de clavier exportée par Attic${o.nom ? ` — ${o.nom}` : ""}`,
    `// ${banque.zones.length} zones de ±${banque.largeur} demi-tons, racine du son : ${banque.racineSource}`
      + (banque.couches && banque.couches > 1 ? ` — ${banque.couches} couches de vélocité` : ""),
    `// Touches couvertes : ${banque.noteBasse} à ${banque.noteHaute}`,
    "",
    "<global>",
    `ampeg_release=${relachement.toFixed(3)}`,
    "",
  ];
  for (const zone of banque.zones) {
    lignes.push("<region>");
    lignes.push(`sample=${o.dossier}/${nomEchantillon(zone)}`);
    lignes.push(`lokey=${zone.basse} hikey=${zone.haute} pitch_keycenter=${zone.racine}`);
    // Les bornes de vélocité ne s'écrivent que si la zone est une couche : un fichier plein de
    // `lovel=0 hivel=127` se lit moins bien, et ces valeurs sont celles du format par défaut.
    if ((zone.velBasse ?? 0) > 0 || (zone.velHaute ?? 127) < 127) {
      lignes.push(`lovel=${zone.velBasse ?? 0} hivel=${zone.velHaute ?? 127}`);
    }
    if (zone.suiviVelocite !== undefined && zone.suiviVelocite !== 100) {
      lignes.push(`amp_veltrack=${Math.round(zone.suiviVelocite)}`);
    }
    if (zone.boucle) {
      lignes.push("loop_mode=loop_sustain");
      lignes.push(`loop_start=${zone.boucle.debut} loop_end=${zone.boucle.fin}`);
    } else {
      lignes.push("loop_mode=no_loop");
    }
    lignes.push("");
  }
  return lignes.join("\n");
}

// ── Une banque faite de rendus, et non de transpositions ────────────────────────

/**
 * Bâtit une banque à partir d'un échantillon PAR RACINE, déjà rendu.
 *
 * C'est l'autre façon d'étaler un son sur le clavier : au lieu de transposer un enregistrement, on
 * rejoue la recette à chaque hauteur. Il n'y a alors plus rien à transposer — chaque zone est juste
 * par construction —, et cette fonction ne fait que poser les bornes et les boucles.
 *
 * Les bornes suivent la même règle que `planZones` : ±`largeur` autour de la racine, rognées au
 * clavier, et la première et la dernière zone s'étendent jusqu'aux bords pour qu'aucune touche ne
 * reste sans zone.
 */
export function banqueDepuisRendus(
  racines: number[], audios: AudioBuffer[], o: {
    largeur: number; noteBasse: number; noteHaute: number;
    boucle?: boolean; boucleDebut?: number;
  },
): Banque {
  const largeur = Math.max(0, Math.round(o.largeur));
  const zones: Zone[] = [];
  racines.forEach((racine, i) => {
    const audio = audios[i];
    if (!audio) return;
    const premier = i === 0, dernier = i === racines.length - 1;
    const basse = premier ? o.noteBasse : Math.max(o.noteBasse, racine - largeur);
    const haute = dernier ? o.noteHaute : Math.min(o.noteHaute, racine + largeur);
    const zone: Zone = { racine, basse, haute, audio };
    if (o.boucle) {
      zone.boucle = bornesDeBoucle(audio, o);
    }
    zones.push(zone);
  });
  return {
    zones,
    racineSource: racines[Math.floor(racines.length / 2)] ?? 60,
    largeur, noteBasse: o.noteBasse, noteHaute: o.noteHaute,
  };
}
