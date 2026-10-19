// audio/tempo-reancrage.ts — Donner son vrai tempo a un MIDI sans deplacer une seule note.
//
// CE N'EST PAS UN CHANGEMENT DE VITESSE, ET C'EST TOUT L'INVERSE. `vitesse-midi.ts` garde la
// notation et change le son : les tics ne bougent pas, le tempo ecrit si, et le fichier se joue
// plus vite. Ici on garde le son et on change la notation : chaque evenement reste a sa seconde,
// le tempo ecrit devient celui qu'on lui donne, et les tics sont recalcules pour que les deux
// soient d'accord. Les deux gestes partent de la meme formule, `tics = secondes x tpm x tempo / 60`,
// pris dans les deux sens.
//
// A QUOI CELA SERT. Un transcripteur d'audio rend des instants justes et une notation vide de sens :
// il ecrit 120 battements par minute parce qu'un fichier MIDI doit porter un tempo, non parce qu'il
// l'a trouve. Les mesures qui en decoulent ne correspondent a rien du morceau. Reancrer sur un tempo
// estime par ailleurs rend des barres de mesure justes, et une indication de tempo juste, sans
// toucher a ce qui a ete entendu.
//
// CE QUE CELA NE FAIT PAS, et qu'il faut quantifier pour obtenir. Reancrer ne pose pas les notes sur
// les temps. Les attaques d'un transcripteur tombent sur son horloge d'analyse, pas sur une
// subdivision : mesure sur 1 650 attaques de MuScriptor, elles sont a 100 % sur un reseau de dix
// millisecondes, ecart moyen 0,000 ms. Contre une grille de double-croches, a n'importe quel tempo,
// leur ecart moyen vaut le quart du pas, c'est-a-dire ce que donnerait le hasard. C'est pourquoi
// `mesurerAlignement` existe : elle chiffre cet ecart, de sorte qu'un appelant puisse dire a quel
// point le tempo choisi explique le materiau, au lieu de le laisser croire.
//
// CE QUE LE REANCRAGE COUTE. Un tic, et pas plus. A 480 tics par noire et 166 battements par minute,
// un tic vaut 0,753 ms ; l'arrondi deplace donc chaque evenement de 0,38 ms au pire. La carte de
// tempo, en revanche, est ecrasee : plusieurs changements deviennent un tempo unique, et leur
// nombre est rendu a l'appelant pour qu'il le signale.

/** Un evenement de piste, avec l'instant ou il tombe. */
export interface EvenementDate {
  /** Secondes depuis le debut du fichier, carte de tempo suivie. */
  secondes: number;
  evt: any;
}

/** Ce qu'il faut d'un MIDI analyse pour le reancrer. */
export interface MidiAnalyse {
  header: { format?: number; numTracks?: number; ticksPerBeat?: number };
  tracks: any[][];
}

/** Resolution d'ecriture, en tics par noire. Celle qu'emploient les ecrivains du depot. */
export const TPM_SORTIE = 480;

/** Microsecondes par noire d'un tempo en battements par minute. */
const microsecondesParNoire = (bpm: number) => Math.max(1, Math.round(60_000_000 / bpm));

/**
 * Un tempo utilisable, en battements par minute.
 *
 * Les bornes ne sont pas un gout : en dessous de 20 un tic de 480e de noire depasse six
 * millisecondes et l'arrondi devient audible, au-dela de 400 aucune musique ne se note ainsi.
 */
export const TEMPO_MIN = 20;
export const TEMPO_MAX = 400;
export function tempoValide(bpm: number, defaut = 120): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return defaut;
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, bpm));
}

/** Les changements de tempo d'un fichier, en tics absolus, tous pistes confondues. */
function carteDeTempo(midi: MidiAnalyse): { tick: number; microsecondes: number }[] {
  const points: { tick: number; microsecondes: number }[] = [];
  for (const piste of midi.tracks) {
    let tick = 0;
    for (const evt of piste) {
      tick += evt.deltaTime ?? 0;
      if (evt.type === "setTempo" && evt.microsecondsPerBeat) {
        points.push({ tick, microsecondes: evt.microsecondsPerBeat });
      }
    }
  }
  points.sort((a, b) => a.tick - b.tick);
  // UN FICHIER SANS `setTempo` VAUT 120 par convention MIDI, et il faut l'ecrire pour pouvoir
  // convertir : sans point de depart, le premier intervalle n'a pas de duree.
  if (points.length === 0 || points[0].tick > 0) points.unshift({ tick: 0, microsecondes: 500_000 });
  return points;
}

/**
 * Les instants reels de tous les evenements, piste par piste.
 *
 * La conversion suit la carte de tempo intervalle par intervalle : c'est ce qui distingue cette
 * lecture d'une simple division, et c'est aussi ce qui permet d'ecraser la carte sans rien deplacer.
 */
export function instantsDesEvenements(midi: MidiAnalyse): EvenementDate[][] {
  const tpm = midi.header.ticksPerBeat || TPM_SORTIE;
  const carte = carteDeTempo(midi);

  function secondes(tick: number): number {
    let sec = 0;
    for (let i = 0; i < carte.length; i++) {
      const courant = carte[i];
      const suivant = carte[i + 1];
      if (!suivant || tick <= suivant.tick) {
        return sec + ((tick - courant.tick) / tpm) * (courant.microsecondes / 1_000_000);
      }
      sec += ((suivant.tick - courant.tick) / tpm) * (courant.microsecondes / 1_000_000);
    }
    return sec;
  }

  return midi.tracks.map((piste) => {
    let tick = 0;
    const dates: EvenementDate[] = [];
    for (const evt of piste) {
      tick += evt.deltaTime ?? 0;
      dates.push({ secondes: secondes(tick), evt });
    }
    return dates;
  });
}

/**
 * Le meme fichier, a un autre tempo ecrit, chaque evenement garde a sa seconde.
 *
 * Les pistes sont conservees une pour une : un transcripteur qui donne une piste par instrument
 * donne un fichier qu'un editeur de partition ouvre instrument par instrument, et fusionner les
 * pistes perdrait cela. Les changements de tempo d'origine sont retires, un seul est ecrit en tete
 * de la premiere piste, et leur nombre est rendu.
 */
export function reancrerTempo(
  midi: MidiAnalyse, tempoCible: number, tpmSortie = TPM_SORTIE,
): { midi: MidiAnalyse; changementsAbsorbes: number; ecartMaxMs: number } {
  const bpm = tempoValide(tempoCible);
  const dates = instantsDesEvenements(midi);

  // LE PAS SE CALCULE SUR LE TEMPO RÉELLEMENT ÉCRIT, et non sur celui qu'on a demandé. Un
  // `setTempo` porte un nombre ENTIER de microsecondes par noire : 84 battements par minute
  // s'écrivent 714 286 µs, ce qui vaut 83,999966 et non 84. Calculer les tics sur 84 pendant que
  // le lecteur les convertit sur 83,999966 laisse une dérive proportionnelle à la durée, mesurée
  // sur une minute de musique à 0,024 ms, assez pour dépasser la borne annoncée. Les deux côtés
  // partent donc du même entier, et l'arrondi au tic redevient la seule erreur.
  const microsecondes = microsecondesParNoire(bpm);
  const parTic = (tpmSortie * 1_000_000) / microsecondes;

  let changementsAbsorbes = 0;
  const tracks = dates.map((piste, rang) => {
    const lignes: { tick: number; evt: any }[] = [];
    for (const { secondes, evt } of piste) {
      if (evt.type === "setTempo") { changementsAbsorbes++; continue; }
      if (evt.type === "endOfTrack") continue;
      lignes.push({ tick: Math.round(secondes * parTic), evt: { ...evt } });
    }
    if (rang === 0) {
      lignes.unshift({ tick: 0, evt: { type: "setTempo", microsecondsPerBeat: microsecondes } });
    }
    // L'ORDRE DANS UN TIC N'EST PAS LIBRE : un note-off doit preceder le note-on qui relance la
    // meme hauteur, sans quoi la note relancee se referme aussitot. `midi-ordre.ts` porte la regle
    // et l'histoire ; elle est appliquee ici par le meme rang.
    lignes.sort((a, b) => a.tick - b.tick || rangDansLeTic(a.evt.type) - rangDansLeTic(b.evt.type));

    let courant = 0;
    const evenements = lignes.map(({ tick, evt }) => {
      const delta = tick - courant;
      courant = tick;
      return { ...evt, deltaTime: delta };
    });
    evenements.push({ type: "endOfTrack", deltaTime: 0 } as any);
    return evenements;
  });

  // L'ARRONDI AU TIC EST LE SEUL DEPLACEMENT, et il se chiffre sans mesurer : la moitie d'un tic.
  const ecartMaxMs = (0.5 / parTic) * 1000;

  return {
    midi: { header: { ...midi.header, format: 1, numTracks: tracks.length, ticksPerBeat: tpmSortie }, tracks },
    changementsAbsorbes,
    ecartMaxMs,
  };
}

/** Rang d'un type d'evenement dans un tic : reglages, puis note-off, puis note-on. */
function rangDansLeTic(type: string): number {
  if (type === "noteOn") return 2;
  if (type === "noteOff") return 1;
  return 0;
}

/** Ce que vaut un tempo pour un materiau donne. */
export interface Alignement {
  /** Pas de la grille, en secondes. */
  pas: number;
  /** Ecart moyen d'une attaque a la subdivision la plus proche, en millisecondes. */
  ecartMoyenMs: number;
  /**
   * L'ecart moyen rapporte a ce que donnerait le hasard.
   *
   * Des attaques posees au hasard tombent en moyenne a un quart de pas de la grille : l'indice vaut
   * alors 1. Des attaques deja sur la grille le font tomber a 0. Entre les deux il mesure a quel
   * point le tempo propose explique le materiau, et c'est la seule facon honnete de repondre a
   * « ce tempo est-il le bon ».
   */
  indice: number;
  /** Part des attaques a moins de vingt millisecondes d'une subdivision. */
  partProche: number;
  /** Nombre d'attaques mesurees. */
  attaques: number;
}

/**
 * L'alignement d'une suite d'attaques sur la grille d'un tempo.
 *
 * `divisions` est le nombre de subdivisions par noire : 4 pour des double-croches, 3 pour des
 * croches de triolet. Sans attaque, l'indice vaut 0 et la part 1 : rien a deplacer.
 */
export function mesurerAlignement(attaques: number[], bpm: number, divisions = 4): Alignement {
  const pas = 60 / tempoValide(bpm) / Math.max(1, Math.round(divisions));
  if (attaques.length === 0) return { pas, ecartMoyenMs: 0, indice: 0, partProche: 1, attaques: 0 };
  let somme = 0;
  let proches = 0;
  for (const t of attaques) {
    const ecart = Math.abs(t - Math.round(t / pas) * pas);
    somme += ecart;
    if (ecart <= 0.02) proches++;
  }
  const moyenne = somme / attaques.length;
  return {
    pas,
    ecartMoyenMs: moyenne * 1000,
    indice: moyenne / (pas / 4),
    partProche: proches / attaques.length,
    attaques: attaques.length,
  };
}
