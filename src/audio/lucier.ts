// audio/lucier.ts — « I Am Sitting in a Room » (Alvin Lucier, 1969).
//
// Le principe de la pièce tient en une phrase : on enregistre une voix dans une
// pièce, on rejoue l'enregistrement dans cette même pièce, on ré-enregistre, et
// ainsi de suite. À chaque passage, les fréquences que la pièce favorise sont
// renforcées et celles qu'elle absorbe s'effacent un peu plus. Au bout de
// quelques dizaines d'itérations, il ne reste plus de parole du tout : rien que
// les modes de résonance du lieu, devenus un accord tenu.
//
// Ce que cela démontre — et c'est pourquoi ce n'est PAS une réverbération très
// mouillée — c'est qu'un espace est un filtre, et qu'appliquer un filtre un
// grand nombre de fois ne fait pas « plus de la même chose » : cela transforme
// le filtre en son. Un seul passage de convolution ajoute une couleur ;
// quarante passages remplacent la source par la pièce.
//
// Trois précautions rendent l'itération possible, chacune pour une raison
// distincte — voir `pieceDeLucier`.

import { reverberationConvolution } from "./convolution";

/** Amplitude maximale d'un buffer. */
function pic(buffer: AudioBuffer): number {
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > max) max = v;
    }
  }
  return max;
}

/** Copie tronquée ou complétée de silence, à la longueur voulue. */
function ajusterLongueur(buffer: AudioBuffer, longueur: number): AudioBuffer {
  if (buffer.length === longueur) return buffer;
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: longueur,
    sampleRate: buffer.sampleRate,
  });
  const n = Math.min(longueur, buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(buffer.getChannelData(c).subarray(0, n));
  }
  return out;
}

function multiplier(buffer: AudioBuffer, gain: number): void {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
}

export interface OptionsLucier {
  /** Nombre de passages dans la pièce. C'est le seul paramètre de l'œuvre. */
  iterations: number;
  /**
   * Rappelée après chaque passage, avec l'état courant. Sert à exposer la
   * progression, et permet accessoirement d'observer la transformation.
   */
  surIteration?: (index: number, total: number) => void;
}

/**
 * Applique `iterations` passages de convolution par la même réponse
 * impulsionnelle.
 *
 * Trois précautions, chacune indispensable pour une raison différente :
 *
 * 1. **Passage entièrement mouillé.** On ne mélange pas de son direct : à chaque
 *    tour, ce qu'on entend a intégralement traversé la pièce. Garder du son sec
 *    reviendrait à réinjecter la voix d'origine à chaque passage, et elle ne
 *    disparaîtrait jamais — ce qui supprimerait précisément le phénomène.
 *
 * 2. **Retour à la longueur d'origine.** Une convolution allonge le signal de la
 *    durée de l'IR. Sans troncature, quarante passages produiraient un fichier
 *    interminable et un temps de calcul qui explose. Dans l'œuvre, chaque
 *    ré-enregistrement dure autant que le précédent : tronquer est donc fidèle,
 *    pas seulement économe.
 *
 * 3. **Renormalisation entre les passages.** La convolution modifie le niveau à
 *    chaque tour ; l'écart se cumule géométriquement et le signal finirait soit
 *    saturé, soit inaudible bien avant que le phénomène ne s'installe. On
 *    ramène donc le pic à sa valeur de départ après chaque passage. Cela ne
 *    change rien au SPECTRE, qui est le siège de l'effet.
 */
export async function pieceDeLucier(
  entree: AudioBuffer,
  ir: AudioBuffer,
  options: OptionsLucier,
): Promise<AudioBuffer> {
  const total = Math.max(1, Math.round(options.iterations));
  const longueur = entree.length;
  const picInitial = pic(entree) || 1;

  let courant = entree;
  for (let i = 0; i < total; i++) {
    const humide = await reverberationConvolution(courant, ir, 100);
    courant = ajusterLongueur(humide, longueur);
    const p = pic(courant);
    if (p > 1e-9) multiplier(courant, picInitial / p);
    options.surIteration?.(i + 1, total);
  }
  return courant;
}

/**
 * Platitude spectrale : moyenne géométrique divisée par moyenne arithmétique du
 * spectre de puissance. Proche de 1 pour un bruit large bande, proche de 0 pour
 * un son dont l'énergie se concentre sur quelques raies.
 *
 * C'est la mesure qui rend l'effet Lucier objectif plutôt qu'impressionniste :
 * elle doit DÉCROÎTRE à mesure que les modes de la pièce prennent le dessus.
 * Exportée pour cela, et utilisée par les tests.
 */
export function platitudeSpectrale(buffer: AudioBuffer, trame = 2048): number {
  const d = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const bandes: number[] = [];
  for (let i = 0; i < 48; i++) bandes.push(60 * Math.pow(2, (i * 7) / 48));

  // On agrège l'énergie de TRAMES COURTES plutôt que d'analyser le tampon d'un
  // seul tenant, et ce pour deux raisons apprises à la mesure :
  //
  //   - Goertzel devient numériquement instable sur des fenêtres longues : sa
  //     récurrence résonante finit par produire des valeurs aberrantes, au point
  //     de rendre une « platitude » de 5, impossible par construction puisque la
  //     moyenne géométrique ne dépasse jamais l'arithmétique ;
  //   - n'analyser que le DÉBUT du tampon ne marche pas davantage : le pré-délai
  //     de la pièce s'accumule d'un passage à l'autre et repousse le son vers la
  //     fin. Après huit passages sur une source de 0,5 s, les premiers milliers
  //     d'échantillons sont silencieux alors que le RMS global vaut encore 0,09.
  const n = Math.min(trame, d.length);
  const pas = Math.max(1, Math.floor(n / 2));
  const energie = new Float64Array(bandes.length);
  let trames = 0;
  for (let debut = 0; debut + n <= d.length; debut += pas) {
    trames++;
    for (let b = 0; b < bandes.length; b++) {
      const w = (2 * Math.PI * bandes[b]) / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < n; i++) {
        const x = d[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
        const s0 = x + c * s1 - s2; s2 = s1; s1 = s0;
      }
      energie[b] += Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2) / (n * n);
    }
  }
  if (trames === 0) return 1;

  let sommeLog = 0, somme = 0;
  for (let b = 0; b < bandes.length; b++) {
    const p = energie[b] / trames + 1e-15;
    sommeLog += Math.log(p);
    somme += p;
  }
  return Math.exp(sommeLog / bandes.length) / (somme / bandes.length);
}
