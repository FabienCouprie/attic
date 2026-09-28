// audio/effets-echo.ts — Les echos, en va-et-vient et a l'envers.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { estCourbe, valeursParametre } from "./courbe";

export interface ModulationsEcho {
  temps?: unknown;
  bornesTemps?: { min: number; max: number };
  feedback?: unknown;
  bornesFeedback?: { min: number; max: number };
}

/** Points par seconde des courbes posées sur les paramètres audio : le navigateur interpole entre. */
const POINTS_PAR_SECONDE = 200;

export async function appliquerEchoPingPong(
  entree: AudioBuffer,
  tempsMs: number,
  feedbackPct: number,
  repartitionPct: number,
  modulations: ModulationsEcho = {},
): Promise<AudioBuffer> {
  const delai = Math.max(0.001, tempsMs) / 1000;
  const feedback = Math.max(0, feedbackPct / 100);

  // LES COURBES PASSENT PAR LES PARAMÈTRES AUDIO du navigateur, et non par une boucle à nous : le
  // retard, la réinjection et la vitesse du ping-pong sont des AudioParam, qui suivent une courbe
  // nativement. Faire varier le retard fait glisser la hauteur des répétitions, comme un écho à
  // bande dont on touche la vitesse — c'est le son attendu, et non un défaut. Sans courbe, aucune
  // de ces lignes ne s'exécute : le graphe est exactement celui d'avant.
  const points = Math.max(2, Math.ceil(entree.duration * POINTS_PAR_SECONDE));
  const retards = estCourbe(modulations.temps)
    ? Float32Array.from(valeursParametre(modulations.temps, points, tempsMs, {
        min: modulations.bornesTemps?.min ?? 100, max: modulations.bornesTemps?.max ?? 800,
      }), (ms) => Math.min(5, Math.max(0.001, ms / 1000)))
    : null;
  const reinjections = estCourbe(modulations.feedback)
    ? Float32Array.from(valeursParametre(modulations.feedback, points, feedbackPct, {
        min: modulations.bornesFeedback?.min ?? 0, max: modulations.bornesFeedback?.max ?? 80,
      }), (pct) => Math.min(0.95, Math.max(0, pct / 100)))
    : null;
  // La queue se calcule sur le pire cas : le plus long retard et la plus forte réinjection.
  const delaiQueue = retards ? Math.max(...retards) : delai;
  const feedbackQueue = reinjections ? Math.max(...reinjections) : feedback;
  const repetitions = feedbackQueue > 0.001 && feedbackQueue < 0.99 ? Math.ceil(Math.log(1e-4) / Math.log(feedbackQueue)) : feedbackQueue >= 0.99 ? 40 : 0;
  const coda = Math.max(5, delaiQueue * Math.min(repetitions, 40));
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * entree.sampleRate), entree.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = entree;

  // Dry
  source.connect(offline.destination);

  // Wet : delay → panner → destination + feedback
  const delay = offline.createDelay(5);
  delay.delayTime.value = delai;

  const wetGain = offline.createGain();
  wetGain.gain.value = 0.7;

  const panner = offline.createStereoPanner();
  const pannerGain = offline.createGain();
  pannerGain.gain.value = Math.min(1, Math.max(0, repartitionPct / 100));

  const feedbackGain = offline.createGain();
  feedbackGain.gain.value = feedback;

  // LFO : ondule sinusoïdale pour éviter les clics du carré ; la transition
  // douce entre gauche et droite conserve l'effet ping-pong sans artefact.
  const lfo = offline.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 1 / (2 * delai);

  source.connect(wetGain);
  wetGain.connect(delay);
  delay.connect(panner);
  panner.connect(offline.destination);
  // LA RÉINJECTION SE PREND AVANT LE PANORAMIQUE, et non après. Elle se prenait après : nourri d'un
  // signal stéréo, le panoramique ajoute un canal à l'autre, et le gain de la boucle dépassait 1 alors
  // que la réinjection restait sous 100 %. Mesuré sur une seconde de bruit, répartition à 50 % : la
  // fin du fichier montait à une amplitude de 273 à 90 % de réinjection, de 2 423 à 95 %. Prise
  // avant, la boucle ne contient plus que le retard et le gain : son gain EST la réinjection. Le
  // ping-pong, lui, ne change pas de principe — le panoramique balaie toujours chaque répétition.
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);

  // La sortie du LFO (±1) est multipliée par pannerGain puis connectée à
  // panner.pan (valeur nominale). Avec une onde triangle, la panoramique
  // varie linéairement d'un extrême à l'autre, sans discontinuité.
  lfo.connect(pannerGain);
  pannerGain.connect(panner.pan);

  if (retards) {
    delay.delayTime.setValueCurveAtTime(retards, 0, entree.duration);
    // Le ping-pong garde son pas : un aller-retour par deux répétitions, quel que soit le retard.
    // L'oscillateur intègre sa phase lui-même — une fréquence qui varie y est exacte.
    lfo.frequency.setValueCurveAtTime(Float32Array.from(retards, (d) => 1 / (2 * d)), 0, entree.duration);
  }
  if (reinjections) feedbackGain.gain.setValueCurveAtTime(reinjections, 0, entree.duration);

  source.start(0);
  lfo.start(0);
  return offline.startRendering();
}



// Echo inverse (reverse echo / pre-echo) : les répétitions atténuées apparaissent
// AVANT le son principal. Principe : on inverse le signal, on applique un echo
// classique, puis on ré-inverse le résultat.
export function appliquerEchoInverse(
  entree: AudioBuffer,
  tempsMs: number,
  feedbackPct: number,
): AudioBuffer {
  const sr = entree.sampleRate;
  const delay = Math.max(1, Math.round((Math.max(0.001, tempsMs) / 1000) * sr));
  const feedback = Math.max(0, Math.min(0.99, feedbackPct / 100));
  const repetitions =
    feedback > 0.001 && feedback < 0.99
      ? Math.ceil(Math.log(1e-4) / Math.log(feedback))
      : feedback >= 0.99 ? 40 : 0;
  const tail = delay * repetitions;
  const length = entree.length + tail;

  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length,
    sampleRate: sr,
  });

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const src = entree.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let amp = 1;
    for (let r = 0; r <= repetitions; r++) {
      const offset = tail - r * delay;
      for (let i = 0; i < src.length; i++) {
        dst[offset + i] += src[i] * amp;
      }
      amp *= feedback;
    }
  }

  return resultat;
}

