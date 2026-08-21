// audio/risset.ts — Glissando de Risset : l'illusion d'une hauteur qui descend
// (ou monte) sans jamais arriver nulle part, appliquée à un son quelconque.
//
// Principe, tel que Jean-Claude Risset l'a formulé en rendant continu le son
// étagé de Shepard : on superpose N voix espacées d'exactement UNE OCTAVE, qui
// glissent toutes ensemble à la même vitesse. Comme l'écart entre voix vaut une
// octave, l'ensemble redevient rigoureusement identique à lui-même après qu'une
// voix a parcouru une octave : la voix k a pris la place qu'occupait la voix
// k+1. Rien ne permet donc de dater une écoute — d'où le mouvement perpétuel.
//
// Ce qui rend l'illusion crédible, c'est l'ENVELOPPE : l'amplitude de chaque
// voix ne dépend que de sa hauteur absolue, suivant une cloche fixe qui vaut
// zéro aux deux bords de l'étendue. Une voix qui atteint le haut s'est donc déjà
// tue, et celle qui réapparaît en bas est inaudible — le saut d'octave se
// produit dans le silence, personne ne l'entend.
//
// Appliqué à un ÉCHANTILLON plutôt qu'à des sinusoïdes, chaque voix relit le son
// à une vitesse variable : la hauteur et le débit changent ensemble, comme sur
// une bande magnétique. C'est la version que Risset lui-même a explorée, et elle
// impose de boucler la source — d'où `boucleSansCouture` ci-dessous.

/**
 * Deux façons de faire glisser une voix :
 *
 * - `bande` : on relit la source plus ou moins vite, comme une bande magnétique.
 *   Hauteur et débit changent ensemble. C'est la version historique, la plus
 *   propre au sens du signal — aucun artefact, puisqu'on ne fait que lire.
 * - `hauteur` : on transpose sans toucher au débit, par grains superposés. Le
 *   tempo de la source est préservé, au prix des artefacts granulaires
 *   caractéristiques, d'autant plus audibles que la transposition est ample.
 */
export type ModeRisset = "bande" | "hauteur";

/**
 * Rôle du rendu granulaire. Les deux valeurs partagent exactement la même
 * machinerie de grains : seules les deux horloges y sont échangées.
 *
 * - `hauteur` : l'ancre avance au rythme réel, la lecture interne va plus ou
 *   moins vite → on transpose sans toucher au tempo.
 * - `rythme`  : l'ancre avance plus ou moins vite, la lecture interne reste à
 *   vitesse normale → on change le tempo sans toucher à la hauteur.
 *
 * Cette dualité n'est pas une coquetterie d'implémentation : c'est la raison
 * pour laquelle le glissando de Risset et le rythme de Risset sont le même
 * phénomène, l'un sur l'axe des hauteurs, l'autre sur celui du temps.
 */
type RoleGranulaire = "hauteur" | "rythme";

export interface OptionsRisset {
  /** Durée du son produit, en secondes. Le glissando étant sans fin, elle est arbitraire. */
  dureeSec: number;
  /** Temps que met une voix pour parcourir une octave. Plus il est court, plus le glissando file. */
  cycleSec: number;
  /** Nombre de voix, donc étendue en octaves (les voix sont espacées d'une octave). */
  octaves: number;
  /** true = la hauteur semble monter sans fin ; false = elle semble descendre. */
  montant: boolean;
  /** Fondu enchaîné utilisé pour rendre la source bouclable sans clic. */
  fonduBoucleSec?: number;
  /** Défaut : `bande`. */
  mode?: ModeRisset;
  /** Taille des grains du mode `hauteur`, en secondes. Sans effet en mode `bande`. */
  grainSec?: number;
}

export interface VoixRisset {
  /** Position dans l'étendue, en octaves depuis le bas (0 ≤ octave < nombre de voix). */
  octave: number;
  /** Poids de la voix, entre 0 (aux deux bords) et 1 (au centre). */
  amplitude: number;
  /** Facteur de relecture de la source : 1 = vitesse d'origine. */
  vitesse: number;
}

/**
 * État des voix à l'instant `t`. Isolé du rendu audio parce que c'est ici que
 * réside toute l'illusion : c'est donc ici qu'elle se teste, sans avoir à
 * analyser un spectre.
 */
export function voixRisset(t: number, options: OptionsRisset): VoixRisset[] {
  const n = Math.max(2, Math.round(options.octaves));
  const voix: VoixRisset[] = [];
  for (let k = 0; k < n; k++) voix.push({ octave: 0, amplitude: 0, vitesse: 1 });
  remplirVoix(t, options, voix);
  return voix;
}

/**
 * Même calcul, mais écrit dans un tableau fourni. Le rendu audio appelle cette
 * fonction une fois par échantillon : allouer là un tableau d'objets neuf à
 * chaque tour coûtait plus cher que tout le reste du traitement réuni. La
 * formule reste ici et une seule fois, pour que la version testée
 * (`voixRisset`) et celle qui tourne dans la boucle ne puissent pas diverger.
 */
function remplirVoix(t: number, options: OptionsRisset, cible: VoixRisset[]): void {
  const n = cible.length;
  const cycle = Math.max(1e-6, options.cycleSec);
  const sens = options.montant ? 1 : -1;
  // La voix du milieu joue la source à sa vitesse d'origine : le glissando
  // s'étend alors symétriquement de part et d'autre du son fourni, au lieu de
  // le transposer systématiquement vers l'aigu ou vers le grave.
  const centre = (n - 1) / 2;
  for (let k = 0; k < n; k++) {
    // Le modulo ramène la voix en bas dès qu'elle sort par le haut. Ce saut est
    // inaudible parce qu'il tombe exactement là où la cloche vaut zéro.
    const octave = (((k + (sens * t) / cycle) % n) + n) % n;
    const v = cible[k];
    v.octave = octave;
    // Cloche de Hann sur l'étendue : nulle aux deux bords, maximale au centre.
    // Son intérêt n'est pas esthétique mais arithmétique — voir `gainTotal`.
    v.amplitude = 0.5 * (1 - Math.cos((2 * Math.PI * octave) / n));
    v.vitesse = Math.pow(2, octave - centre);
  }
}

/**
 * Somme des amplitudes des voix. Vaut n/2 quel que soit `t` : les N cosinus de
 * la cloche, régulièrement répartis sur un tour, s'annulent. C'est ce qui fait
 * que le glissando ne pulse pas au rythme des voix qui se relaient — et c'est
 * vérifiable exactement, sans mesure perceptive.
 */
export function gainTotal(voix: VoixRisset[]): number {
  return voix.reduce((s, v) => s + v.amplitude, 0);
}

/**
 * Rend un buffer bouclable : la fin est fondue par-dessus le début, et le
 * résultat est raccourci d'autant. Sans cela, chaque voix produirait un clic à
 * chaque tour de boucle — et comme les voix lisent à des vitesses différentes,
 * ces clics arriveraient à contretemps, très audibles sur un fond continu.
 */
export function boucleSansCouture(buffer: AudioBuffer, fonduSec = 0.05): AudioBuffer {
  const sr = buffer.sampleRate;
  // Le fondu est plafonné au tiers de la source : au-delà, il mangerait le son
  // au lieu d'en raccorder les bouts.
  const fondu = Math.min(Math.round(fonduSec * sr), Math.floor(buffer.length / 3));
  // En deçà d'une poignée d'échantillons, le fondu ne raccorde plus rien — il ne
  // ferait que raccourcir une source déjà minuscule. On la rend telle quelle :
  // à cette échelle, la boucle est de toute façon un bourdonnement, pas un son.
  const FONDU_MIN = 32;
  if (fondu < FONDU_MIN) return buffer;
  const len = buffer.length - fondu;
  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[i];
    for (let i = 0; i < fondu; i++) {
      const w = i / fondu;
      dst[i] = src[i] * w + src[len + i] * (1 - w);
    }
  }
  return out;
}

/** Lecture interpolée linéairement, avec rebouclage de l'index sur la source. */
function lire(canal: Float32Array, pos: number): number {
  const len = canal.length;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = canal[((i % len) + len) % len];
  const b = canal[(((i + 1) % len) + len) % len];
  return a * (1 - f) + b * f;
}

export function glissandoRisset(buffer: AudioBuffer, options: OptionsRisset): AudioBuffer {
  if (options.mode === "hauteur") return rendreGranulaire(buffer, options, "hauteur");

  const sr = buffer.sampleRate;
  const nCanaux = buffer.numberOfChannels;
  const nSorties = Math.max(1, Math.round(options.dureeSec * sr));
  const nVoix = Math.max(2, Math.round(options.octaves));

  const src = boucleSansCouture(buffer, options.fonduBoucleSec ?? 0.05);
  const canaux: Float32Array[] = [];
  for (let c = 0; c < nCanaux; c++) canaux.push(src.getChannelData(c));

  // Les voix démarrent à des endroits différents de la source : sans cela elles
  // liraient toutes le même instant du son, et la superposition sonnerait comme
  // un simple accord d'octaves plutôt que comme une nappe.
  const positions = new Float64Array(nVoix);
  for (let k = 0; k < nVoix; k++) positions[k] = (k / nVoix) * src.length;

  const out = new AudioBuffer({ numberOfChannels: nCanaux, length: nSorties, sampleRate: sr });
  const sorties: Float32Array[] = [];
  for (let c = 0; c < nCanaux; c++) sorties.push(out.getChannelData(c));

  // Gain de référence constant (voir `gainTotal`) : diviser par lui garde le
  // niveau de sortie comparable à celui de l'entrée, sans compression.
  const gain = nVoix / 2;

  const voix = voixRisset(0, options);
  for (let n = 0; n < nSorties; n++) {
    remplirVoix(n / sr, options, voix);
    for (let k = 0; k < nVoix; k++) {
      const { amplitude, vitesse } = voix[k];
      const pos = positions[k];
      if (amplitude > 1e-6) {
        for (let c = 0; c < nCanaux; c++) sorties[c][n] += (amplitude * lire(canaux[c], pos)) / gain;
      }
      // La position avance même quand la voix est muette : elle doit réapparaître
      // en bas au bon endroit du son, pas figée là où elle s'est tue.
      positions[k] = (pos + vitesse) % src.length;
    }
  }
  return out;
}

/**
 * Variante à tempo conservé : la source défile à sa vitesse réelle, seule la
 * hauteur glisse.
 *
 * Technique granulaire classique. On découpe la SORTIE en grains courts qui se
 * recouvrent de moitié, chacun fenêtré par une cloche de Hann. Deux horloges
 * cohabitent alors, et c'est tout le principe :
 *
 *   - le DÉBUT de chaque grain avance au rythme réel dans la source, ce qui
 *     préserve le tempo ;
 *   - à l'INTÉRIEUR d'un grain, la lecture se fait à la vitesse `vitesse` de la
 *     voix, ce qui transpose.
 *
 * En mode `bande`, ces deux horloges n'en font qu'une — d'où le couplage
 * hauteur/débit qu'on défait ici.
 *
 * Le recouvrement de moitié avec une fenêtre de Hann est choisi parce que ces
 * fenêtres se somment alors exactement à 1 : la reconstruction n'introduit
 * aucune modulation d'amplitude, et l'invariant de niveau du glissando reste
 * valable. En contrepartie, découper puis recoller le son laisse les artefacts
 * granulaires caractéristiques, d'autant plus audibles que la transposition est
 * ample — ce que le mode `bande`, qui ne fait que lire, ne produit jamais.
 */
function rendreGranulaire(buffer: AudioBuffer, options: OptionsRisset, role: RoleGranulaire): AudioBuffer {
  const sr = buffer.sampleRate;
  const nCanaux = buffer.numberOfChannels;
  const nSorties = Math.max(1, Math.round(options.dureeSec * sr));
  const nVoix = Math.max(2, Math.round(options.octaves));

  const src = boucleSansCouture(buffer, options.fonduBoucleSec ?? 0.05);
  const canaux: Float32Array[] = [];
  for (let c = 0; c < nCanaux; c++) canaux.push(src.getChannelData(c));

  // Un grain trop court hache le son, trop long le fait traîner : quelques
  // dizaines de millisecondes est le compromis usuel. Le pas vaut la moitié du
  // grain — la condition du recouvrement qui somme à 1.
  const grain = Math.max(64, Math.round((options.grainSec ?? 0.06) * sr));
  const pas = Math.max(1, Math.floor(grain / 2));

  const fenetre = new Float64Array(grain);
  for (let i = 0; i < grain; i++) fenetre[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / grain));

  const out = new AudioBuffer({ numberOfChannels: nCanaux, length: nSorties, sampleRate: sr });
  const sorties: Float32Array[] = [];
  for (let c = 0; c < nCanaux; c++) sorties.push(out.getChannelData(c));

  const gain = nVoix / 2;
  // Le point de départ des couches dans la boucle diffère selon le rôle :
  //
  //   - en rôle `hauteur`, chaque voix est décalée d'une fraction de la source.
  //     Sans ce décalage, toutes liraient le même instant du son et l'on
  //     entendrait un accord d'octaves plutôt qu'une nappe.
  //   - en rôle `rythme`, elles partent toutes du MÊME point. Sur une boucle
  //     rythmique, un décalage arbitraire ferait jouer simultanément des endroits
  //     différents du motif — la grosse caisse de l'une contre la caisse claire
  //     de l'autre. Parties ensemble, et les tempos étant dans un rapport de 2,
  //     les couches rapides subdivisent exactement la plus lente.
  //
  // Honnêteté sur la portée de ce choix : la relation de subdivision exacte ne
  // tient que jusqu'au premier rebouclage d'une couche par le haut de l'étendue,
  // après quoi les phases dérivent. Les deux variantes ont d'ailleurs été
  // comparées sur un rendu de 16 s sans qu'aucune mesure ne les sépare (facteur
  // de crête 11,5 contre 11,8 ; autocorrélation d'enveloppe 0,058 contre 0,056).
  // L'alignement est donc retenu pour sa justification musicale, pas sur la foi
  // d'un gain mesuré.
  const decalages: number[] = [];
  for (let k = 0; k < nVoix; k++) decalages.push(role === "rythme" ? 0 : (k / nVoix) * src.length);

  // Les ancres sont INTÉGRÉES grain après grain plutôt que déduites de `debut`.
  // En mode rythme la vitesse d'avance change au fil du temps : la recalculer
  // comme `debut * vitesse` supposerait qu'elle a toujours valu la valeur
  // courante, et ferait sauter la lecture à chaque changement.
  const ancres = Float64Array.from(decalages);

  const voix = voixRisset(0, options);
  for (let debut = 0; debut < nSorties; debut += pas) {
    remplirVoix(debut / sr, options, voix);
    const longueur = Math.min(grain, nSorties - debut);
    for (let k = 0; k < nVoix; k++) {
      const { amplitude, vitesse } = voix[k];
      // Les deux horloges, échangées selon le rôle — c'est là, et nulle part
      // ailleurs, que se joue la différence entre transposer et étirer.
      const avance = role === "hauteur" ? 1 : vitesse;      // progression de l'ancre
      const lecture = role === "hauteur" ? vitesse : 1;     // vitesse dans le grain
      const ancre = ancres[k];
      ancres[k] = (ancre + pas * avance) % src.length;
      if (amplitude <= 1e-6) continue;
      for (let i = 0; i < longueur; i++) {
        const p = ancre + i * lecture;
        const w = (amplitude * fenetre[i]) / gain;
        for (let c = 0; c < nCanaux; c++) sorties[c][debut + i] += w * lire(canaux[c], p);
      }
    }
  }
  return out;
}

/**
 * Rythme de Risset : une pulsation qui accélère (ou ralentit) sans jamais
 * arriver nulle part.
 *
 * Strictement le même phénomène que le glissando, transposé de l'axe des
 * hauteurs à celui du temps. On superpose N copies du motif dont les tempos sont
 * dans un rapport de 2, toutes en train d'accélérer ; comme l'écart entre
 * couches vaut un doublement, l'ensemble redevient identique à lui-même dès
 * qu'une couche a doublé de tempo. La couche devenue trop rapide s'est déjà
 * tue, celle qui réapparaît lente est encore inaudible : le saut ne s'entend
 * jamais.
 *
 * La hauteur, elle, ne doit surtout PAS bouger — sans quoi on retomberait sur le
 * glissando. D'où le rendu granulaire en rôle `rythme` : seule l'ancre des
 * grains accélère, la lecture à l'intérieur reste à vitesse normale.
 */
export function rythmeRisset(buffer: AudioBuffer, options: OptionsRisset): AudioBuffer {
  return rendreGranulaire(buffer, options, "rythme");
}
