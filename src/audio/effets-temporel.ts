// audio/effets-temporel.ts — Boucler, et retarder.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { poserParam } from "./automation";
import { valeurMax } from "./courbe";

const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

export function tailleFenetreSuivante(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}

export function bouclerAudio(
  entree: AudioBuffer,
  dureeSec: number,
  repetitions: number,
  fonduMs: number
): AudioBuffer {
  const sampleRate = entree.sampleRate;
  const longueurSegment = Math.max(1, Math.round(dureeSec * sampleRate));
  const nbRepetitions = Math.max(1, Math.round(repetitions));
  const fonduEch = Math.min(
    Math.floor(longueurSegment / 2),
    Math.max(0, Math.round((fonduMs / 1000) * sampleRate))
  );

  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: longueurSegment * nbRepetitions,
    sampleRate,
  });

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const src = entree.getChannelData(c);
    const segment = new Float32Array(longueurSegment);
    for (let i = 0; i < longueurSegment; i++) segment[i] = i < src.length ? src[i] : 0;

    const dst = resultat.getChannelData(c);
    for (let r = 0; r < nbRepetitions; r++) {
      const offset = r * longueurSegment;
      for (let i = 0; i < longueurSegment; i++) {
        let echantillon = segment[i];
        if (r > 0 && fonduEch > 0 && i < fonduEch) {
          const poids = i / fonduEch;
          const echantillonPrecedent = segment[longueurSegment - fonduEch + i];
          echantillon = echantillonPrecedent * (1 - poids) + segment[i] * poids;
        }
        dst[offset + i] = echantillon;
      }
    }
  }

  return resultat;
}



/**
 * Un delay stéréo dont les deux temps et la réinjection acceptent une courbe.
 *
 * LES TROIS FIXENT LA LONGUEUR DE SORTIE, et c'est ce qui demandait une décision. La queue ajoutée
 * après le son se déduit du retard le plus long et du nombre de tours que la réinjection laisse
 * passer, et elle est calculée AVANT qu'un échantillon soit écrit : un contexte hors ligne a sa
 * durée au moment où on le crée. Une courbe est donc lue DEUX FOIS, pour deux usages différents —
 * son maximum décide de la longueur, et toute sa course commande le paramètre audio. C'est le
 * précédent de l'écho ping-pong, dont la queue « se calcule sur le pire cas ».
 *
 * FAIRE BOUGER UN TEMPS DE RETARD FAIT GLISSER LA HAUTEUR des répétitions, comme un écho à bande
 * dont on touche la vitesse. C'est le son attendu de ce geste, et non un défaut : la tête de
 * lecture se déplace dans la ligne à retard pendant qu'elle lit.
 */
export async function appliquerDelay(
  entree: AudioBuffer,
  tempsGaucheMs: number | Float32Array,
  tempsDroitMs: number | Float32Array,
  feedbackPct: number | Float32Array,
  mixPct: number | Float32Array
): Promise<AudioBuffer> {
  // Les trois transformations restent CELLES D'AVANT, appliquées par `poserParam` au nombre comme
  // à chaque point de la courbe : sans courbe, le graphe est exactement celui d'hier, au bit près.
  // Aucun plafond n'est ajouté à la réinjection — la course du réglage et celle de ses bornes
  // s'arrêtent où il faut, et en poser un ici changerait ce que rend un nœud déjà enregistré.
  const versSec = (ms: number) => Math.max(0.001, ms) / 1000;
  const versFeedback = (p: number) => Math.max(0, p / 100);
  // Le mélange accepte une courbe ; `poserParam` pose un nombre comme avant, au bit près.
  const versGain = (x: number) => Math.max(0, Math.min(1, x / 100));
  // `valeurMax` rend un scalaire tel quel : la longueur calculée ici est celle d'avant, inchangée.
  const dMax = Math.max(versSec(valeurMax(tempsGaucheMs)), versSec(valeurMax(tempsDroitMs)));
  const feedback = versFeedback(valeurMax(feedbackPct));
  const rep = feedback > 0.001 && feedback < 0.999 ? Math.ceil(Math.log(1e-4) / Math.log(feedback)) : feedback >= 0.999 ? 40 : 0;
  const coda = Math.max(3, dMax * Math.min(rep, 40));
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * entree.sampleRate), entree.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = entree;

  const dryG = offline.createGain();
  poserParam(dryG.gain, mixPct, duree, (x) => 1 - versGain(x));
  source.connect(dryG).connect(offline.destination);

  const splitter = offline.createChannelSplitter(2);
  const merger = offline.createChannelMerger(2);
  source.connect(splitter);

  function faireCanal(chan: number, tempsMs: number | Float32Array) {
    // LA LIGNE À RETARD EST DIMENSIONNÉE SUR LE PIRE CAS, et non sur la valeur du moment : sa
    // longueur se fixe à la construction, et une courbe qui monterait au-delà verrait son retard
    // écrêté en silence.
    const delai = offline.createDelay(dMax + 1);
    poserParam(delai.delayTime, tempsMs, duree, versSec);
    const fb = offline.createGain(); poserParam(fb.gain, feedbackPct, duree, versFeedback);
    const flt = offline.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 8000;
    const wet = offline.createGain(); poserParam(wet.gain, mixPct, duree, versGain);
    splitter.connect(delai, chan, 0);
    delai.connect(flt).connect(fb).connect(delai);
    flt.connect(wet).connect(merger, 0, chan);
  }

  faireCanal(0, tempsGaucheMs);
  faireCanal(1, tempsDroitMs);

  merger.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}



/** Ce qu'une courbe peut piloter sur l'écho : le temps de retard et la réinjection. */
