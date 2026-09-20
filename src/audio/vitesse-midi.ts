// audio/vitesse-midi.ts — Jouer un MIDI plus lentement, ou plus vite.
//
// Attic étire le temps depuis longtemps, mais seulement sur de l'audio — vocodeur de phase,
// SoundTouch. Sur du MIDI, il n'y avait rien : sur les vingt-six nœuds qui prennent un MIDI et
// en rendent un, aucun ne touchait à la vitesse. C'est pourtant le geste le plus ordinaire qui
// soit — ralentir un passage pour l'apprendre, caler deux morceaux au même tempo — et il est
// ici EXACT, là où l'audio ne fait qu'approcher : on ne rééchantillonne rien, on déplace des
// événements, et les hauteurs ne bougent pas d'un centième de ton.
//
// DEUX CHOSES QUE CE MODULE SAIT ET QU'IL FAUT SAVOIR AUSSI.
//
// 1. LE TEMPO ÉCRIT DOIT SUIVRE. Étirer les instants sans toucher au tempo du fichier donne un
//    fichier qui sonne juste et se NOTE faux : une noire y devient une blanche. Le bon encodage
//    garde la notation et change le tempo — et il tombe tout seul, parce que les deux
//    opérations se compensent exactement. Voir `tempoEtire`.
// 2. UNE DURÉE NE SE DIVISE PAS INDÉFINIMENT. À huit fois plus vite, une double croche tombe
//    sous les cinq millisecondes : ce n'est plus une note, c'est un clic. Un plancher explicite
//    vaut mieux qu'un rendu qui claque sans qu'on sache pourquoi, et le nombre de notes
//    écourtées est rendu à l'appelant pour qu'il puisse le dire.

/** Ce qu'il faut d'une note pour l'étirer. Le reste des champs est conservé tel quel. */
export interface NoteTemps {
  debut: number;
  fin: number;
}

/** Bornes du facteur. Au-delà, on ne joue plus la musique, on la déforme. */
export const FACTEUR_MIN = 0.1;
export const FACTEUR_MAX = 8;

/** Plancher de durée par défaut, en secondes. */
export const DUREE_MIN_DEFAUT = 0.02;

export interface OptionsEtirement {
  /** Durée minimale d'une note après étirement, en secondes. */
  dureeMin?: number;
}

/** Ramène un facteur dans ses bornes, et refuse ce qui n'est pas un nombre. */
export function facteurValide(facteur: number): number {
  if (!Number.isFinite(facteur) || facteur <= 0) return 1;
  return Math.min(FACTEUR_MAX, Math.max(FACTEUR_MIN, facteur));
}

/**
 * Étire une suite de notes.
 *
 * `facteur` est une VITESSE : 2 joue deux fois plus vite, 0,5 deux fois plus lentement. Les
 * instants et les durées sont donc divisés par lui. C'est le sens qu'on emploie en parlant
 * (« jouer à deux fois la vitesse »), et l'inverse de celui d'un facteur d'étirement — d'où
 * cette phrase, parce que se tromper de sens est l'erreur qu'on fait une fois sur deux.
 *
 * Le premier instant n'est pas ramené à zéro : un fichier qui commence après un silence garde
 * son silence, proportionnellement. Le nœud qui voudrait le supprimer le fera lui-même.
 */
export function etirerNotes<T extends NoteTemps>(
  notes: T[], facteur: number, o: OptionsEtirement = {},
): { notes: T[]; ecourtees: number } {
  const f = facteurValide(facteur);
  const dureeMin = Math.max(0, o.dureeMin ?? DUREE_MIN_DEFAUT);
  let ecourtees = 0;
  const sortie = notes.map((n) => {
    const debut = n.debut / f;
    const duree = (n.fin - n.debut) / f;
    if (duree < dureeMin && n.fin > n.debut) ecourtees++;
    return { ...n, debut, fin: debut + Math.max(dureeMin, duree) };
  });
  return { notes: sortie, ecourtees };
}

/**
 * Le facteur qui mène d'un tempo à un autre.
 *
 * « Ce fichier est à 120, joue-le à 90 » : 90 / 120 = 0,75. C'est la façon de penser quand on
 * cale deux morceaux l'un sur l'autre, et elle évite le calcul mental à l'envers.
 */
export function facteurDepuisTempo(source: number, cible: number): number {
  if (!Number.isFinite(source) || source <= 0) return 1;
  if (!Number.isFinite(cible) || cible <= 0) return 1;
  return facteurValide(cible / source);
}

/**
 * Le tempo à écrire dans le fichier étiré.
 *
 * Deux fois plus vite, c'est deux fois plus de battements par minute : le tempo est multiplié
 * par le facteur. Et c'est là que les deux opérations se compensent — l'écriture d'Attic
 * convertit des secondes en tics par `tics = secondes × tpm × tempo / 60`. Avec des secondes
 * divisées par f et un tempo multiplié par f, les tics retombent EXACTEMENT sur ceux d'origine :
 * le fichier garde sa notation, note pour note, et ne change que de tempo. C'est ce qu'un
 * musicien attend d'un ralenti, et ce qu'un ré-encodage naïf perd.
 */
export function tempoEtire(tempoSource: number, facteur: number): number {
  const t = Number.isFinite(tempoSource) && tempoSource > 0 ? tempoSource : 120;
  return t * facteurValide(facteur);
}

/** Un événement de piste MIDI, réduit à ce qui porte le tempo. */
export interface EvenementTempo {
  type: string;
  microsecondsPerBeat?: number;
}

/**
 * Le tempo déclaré par un fichier, et combien de fois il y change.
 *
 * Un fichier peut porter plusieurs `setTempo`. L'analyse d'Attic les a déjà résolus — elle rend
 * des secondes —, si bien que le son de l'étirement est juste quoi qu'il arrive ; mais la
 * notation, elle, est aplatie sur un tempo unique à la réécriture. Le compte est rendu pour que
 * le nœud puisse le DIRE au lieu de le taire.
 */
export interface MidiParse<E extends EvenementTempo = EvenementTempo> {
  header: unknown;
  tracks: E[][];
}

/**
 * Étire un fichier en ne touchant QU'À SON TEMPO.
 *
 * C'est la bonne façon de faire, et elle vaut mieux que de réencoder les notes : les positions
 * en tics ne bougent pas d'un iota, si bien que canaux, changements de programme, contrôleurs,
 * pédale, pistes nommées — tout ce qu'un réencodage à partir des seules hauteurs perdrait —
 * traverse l'opération intact. Un fichier de piano à deux mains sur deux canaux ressort à deux
 * canaux ; réencodé, il serait aplati sur un seul.
 *
 * Un fichier sans `setTempo` vaut 120 par convention MIDI : on l'écrit alors explicitement, en
 * tête de la première piste, plutôt que de laisser le lecteur supposer un tempo qui n'est plus
 * le bon.
 */
export function reglerTempoMidi<E extends EvenementTempo>(
  midi: MidiParse<E>, facteur: number,
): { midi: MidiParse<E>; ajoute: boolean } {
  const f = facteurValide(facteur);
  const { changements } = tempoDuMidi(midi.tracks);
  const tracks = midi.tracks.map((piste) => piste.map((evt) => (
    evt.type === "setTempo" && evt.microsecondsPerBeat
      ? { ...evt, microsecondsPerBeat: Math.max(1, Math.round(evt.microsecondsPerBeat / f)) }
      : evt
  )));
  if (changements === 0) {
    const entete = { type: "setTempo", microsecondsPerBeat: Math.round(500_000 / f), deltaTime: 0 };
    if (tracks.length === 0) tracks.push([]);
    tracks[0] = [entete as unknown as E, ...tracks[0]];
  }
  return { midi: { ...midi, tracks }, ajoute: changements === 0 };
}

export function tempoDuMidi(
  pistes: EvenementTempo[][], defaut = 120,
): { tempo: number; changements: number } {
  let premier: number | null = null;
  let changements = 0;
  for (const piste of pistes) {
    for (const evt of piste) {
      if (evt.type !== "setTempo" || !evt.microsecondsPerBeat) continue;
      changements++;
      if (premier === null) premier = 60_000_000 / evt.microsecondsPerBeat;
    }
  }
  return { tempo: premier ?? defaut, changements };
}
