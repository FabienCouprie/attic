// audio/egaliseur-parametrique.ts — Un égaliseur dont chaque bande se place, se dose et se resserre.
//
// ═══ POURQUOI IL EXISTE À CÔTÉ DE L'ÉGALISEUR À NEUF BANDES ═══
//
// « Égaliseur » (`equaliser` dans `effets-filtres.ts`) enchaîne neuf cloches FIXES, de 32 Hz à
// 8 kHz, toutes au même Q de 1,4. Il remonte bien une présence à 2 ou 4 kHz, mais rien au-dessus :
// calculé sur la cloche RBJ qu'il emploie, sa bande à 8 kHz poussée à +6 dB ne rend plus que
// +1,70 dB à 12 kHz, +0,85 dB à 14 kHz et +0,43 dB à 16 kHz. Il n'a ni plateau, ni passe-haut, ni
// fréquence ou largeur réglables : une résonance à 340 Hz ne s'y retire pas sans emporter l'octave.
//
// LE BESOIN EST NÉ D'UNE MESURE, le 2026-10-28, sur une chanson rendue par ACE-Step : 4,4 dB de
// présence en moins entre 2 et 6 kHz qu'une référence produite du même genre, et 2 dB de moins entre
// 6 et 16 kHz. La seconde moitié du manque est hors de portée des neuf bandes.
//
// ═══ CE QU'IL CALCULE ═══
//
// Les filtres sont ceux de `BiquadFilterNode`, que la norme Web Audio définit d'après le livre de
// recettes de Robert Bristow-Johnson (« Cookbook formulae for audio EQ biquad filter
// coefficients ») : cloche (`peaking`), plateaux (`lowshelf`, `highshelf`, pente S = 1, la moitié
// du gain à la fréquence charnière) et passe-haut. Le moteur natif les rend hors du fil de
// l'interface, comme il le fait pour l'égaliseur à neuf bandes.
//
// UNE BANDE À ZÉRO DÉCIBEL N'EST PAS UN ÉTAGE, et elle est SAUTÉE plutôt que traversée. Ce n'est
// pas une affaire d'exactitude : relevé en la faisant traverser, quatre cloches neutres rendent le son
// à l'échantillon près sous le moteur des tests, leurs coefficients étant égaux deux à deux. C'est
// une affaire de compte : un étage sauté ne coûte rien, et le message ne compte que ce qui agit.
//
// LE PASSE-HAUT EST UN BUTTERWORTH DU SECOND ORDRE, douze décibels par octave et −3 dB à la
// coupure. Pour un passe-haut, la norme Web Audio lit le Q en DÉCIBELS : le Q linéaire de 1/√2 s'y
// écrit 20·log10(1/√2) ≈ −3,0103. Le lui donner en linéaire poserait une bosse de résonance.

/** Une cloche : son centre, ce qu'elle ajoute ou retire, et sa largeur. */
import { versDb } from "./decibels";

export interface Cloche {
  frequence: number;
  gainDb: number;
  q: number;
}

/** Tout ce que l'égaliseur règle. Une fréquence de passe-haut nulle veut dire : pas de passe-haut. */
export interface ReglagesEgaliseur {
  passeHaut: number;
  graveFrequence: number;
  graveGainDb: number;
  cloches: Cloche[];
  aiguFrequence: number;
  aiguGainDb: number;
}

/** Un étage du chemin, tel qu'il sera posé sur un `BiquadFilterNode`. */
export interface Etage {
  type: "highpass" | "lowshelf" | "peaking" | "highshelf";
  frequence: number;
  gainDb: number;
  q: number;
}

/** Le Q d'un Butterworth du second ordre, exprimé en décibels comme la norme le lit pour un passe-haut. */
export const Q_BUTTERWORTH_DB = versDb(Math.SQRT1_2);

/**
 * La fréquence la plus haute qu'un étage reçoit : un peu sous la moitié de la cadence.
 *
 * À LA FRÉQUENCE DE NYQUIST, une cloche et un plateau dégénèrent, leurs deux pôles se rejoignant
 * sur le cercle unité. Une bande réglée à 18 kHz sur un son à 32 kHz est donc ramenée juste
 * dessous plutôt que de rendre un filtre sans sens.
 */
const plafond = (frequence: number, sr: number) => Math.min(Math.max(frequence, 1), sr * 0.49);

/** Les étages qui agissent, dans l'ordre du signal : passe-haut, plateau grave, cloches, plateau aigu. */
export function etagesActifs(r: ReglagesEgaliseur, sr: number): Etage[] {
  const etages: Etage[] = [];
  if (r.passeHaut > 0) etages.push({ type: "highpass", frequence: plafond(r.passeHaut, sr), gainDb: 0, q: Q_BUTTERWORTH_DB });
  if (r.graveGainDb !== 0) etages.push({ type: "lowshelf", frequence: plafond(r.graveFrequence, sr), gainDb: r.graveGainDb, q: 1 });
  for (const c of r.cloches) {
    if (c.gainDb !== 0) etages.push({ type: "peaking", frequence: plafond(c.frequence, sr), gainDb: c.gainDb, q: c.q });
  }
  if (r.aiguGainDb !== 0) etages.push({ type: "highshelf", frequence: plafond(r.aiguFrequence, sr), gainDb: r.aiguGainDb, q: 1 });
  return etages;
}

/** Fait passer le son par les étages actifs. Sans aucun, il rend une copie exacte de ce qu'il reçoit. */
export async function egaliserParametrique(buffer: AudioBuffer, r: ReglagesEgaliseur): Promise<AudioBuffer> {
  const etages = etagesActifs(r, buffer.sampleRate);
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  let precedent: AudioNode = source;
  for (const e of etages) {
    const filtre = ctx.createBiquadFilter();
    filtre.type = e.type;
    filtre.frequency.value = e.frequence;
    filtre.gain.value = e.gainDb;
    filtre.Q.value = e.q;
    precedent.connect(filtre);
    precedent = filtre;
  }
  precedent.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}
