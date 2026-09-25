// audio/quadrafuzz.ts — Distorsion à quatre bandes.
//
// Une distorsion ordinaire écrase tout le spectre ensemble : les graves, qui portent le
// plus d'énergie, saturent les premiers et étouffent le reste. Le quadrafuzz découpe le
// signal en quatre bandes, sature CHACUNE séparément, puis les rassemble — si bien qu'on
// peut mordre les médiums en laissant la basse propre, ou l'inverse.
//
// Le découpage emploie de VRAIS filtres — un passe-bas, deux passe-bande, un passe-haut.
// Un premier essai les remplaçait par des différences de passe-bas emboîtés, dont la somme
// redonne exactement le signal d'origine ; mesuré, ce découpage sépare mal, parce que deux
// filtres de phases différentes ne se soustraient pas proprement : saturer les aigus
// modifiait encore le grave de six pour cent. La séparation étant tout l'intérêt du nœud,
// elle l'emporte sur la reconstruction parfaite.
import { plafonnerCrete } from "./commun";
import { valeurA } from "./courbe";

/**
 * Courbe de saturation, pour un waveshaper.
 *
 * Une tangente hyperbolique normalisée : douce au milieu, écrasée aux extrêmes, et qui
 * atteint exactement ±1 en ±1. À saturation nulle, elle devient l'identité : la bande
 * traverse alors le nœud sans qu'aucune harmonique ne s'ajoute.
 */
export function courbeFuzz(saturation: number, nbPoints = 4096): Float32Array {
  const courbe = new Float32Array(nbPoints);
  // 0 à 100 dans l'interface, 0 à 20 pour la tangente : au-delà, la courbe devient un
  // simple écrêtage carré et le réglage ne s'entend plus.
  const a = Math.max(0, Math.min(100, saturation)) / 5;
  for (let i = 0; i < nbPoints; i++) {
    const x = (i / (nbPoints - 1)) * 2 - 1;
    courbe[i] = a < 1e-6 ? x : Math.tanh(a * x) / Math.tanh(a);
  }
  return courbe;
}

/** Applique une courbe à une valeur, par interpolation linéaire — comme un WaveShaper. */
export function appliquerCourbe(courbe: Float32Array, x: number): number {
  const n = courbe.length;
  const pos = ((Math.max(-1, Math.min(1, x)) + 1) / 2) * (n - 1);
  const i = Math.floor(pos);
  if (i >= n - 1) return courbe[n - 1];
  const f = pos - i;
  return courbe[i] * (1 - f) + courbe[i + 1] * f;
}

export interface ReglagesQuadrafuzz {
  /** Saturation de chaque bande, de 0 à 100. */
  graves: number;
  basMediums: number;
  hautsMediums: number;
  aigus: number;
  /** Fréquences de coupure entre les bandes, en hertz. */
  f1: number;
  f2: number;
  f3: number;
  /** Équilibre signal d'origine / signal traité, de 0 à 100. Une courbe le pilote au fil du son. */
  mix: number | Float32Array;
  /** Gain de sortie, en décibels. */
  sortie: number;
}

async function filtrer(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  frequence: number,
  q: number,
): Promise<AudioBuffer> {
  const nyquist = buffer.sampleRate / 2;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filtre = ctx.createBiquadFilter();
  filtre.type = type;
  filtre.frequency.value = Math.max(20, Math.min(nyquist - 100, frequence));
  filtre.Q.value = q;
  source.connect(filtre).connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

/**
 * Les quatre bandes : un passe-bas, deux passe-bande, un passe-haut.
 *
 * Les passe-bande sont centrés sur la moyenne GÉOMÉTRIQUE de leurs bornes — le milieu de
 * l'oreille, qui entend en octaves et non en hertz — et leur facteur de qualité est celui
 * qui fait passer la bande par ses deux bornes. Les fréquences sont remises dans l'ordre
 * si on les croise.
 */
export async function separerEnBandes(
  buffer: AudioBuffer,
  f1: number,
  f2: number,
  f3: number,
): Promise<AudioBuffer[]> {
  const [a, b, c] = [f1, f2, f3].sort((x, y) => x - y);
  const centre = (x: number, y: number) => Math.sqrt(x * y);
  const qualite = (x: number, y: number) => Math.max(0.3, Math.sqrt(x * y) / Math.max(1, y - x));
  return Promise.all([
    filtrer(buffer, "lowpass", a, 0.707),
    filtrer(buffer, "bandpass", centre(a, b), qualite(a, b)),
    filtrer(buffer, "bandpass", centre(b, c), qualite(b, c)),
    filtrer(buffer, "highpass", c, 0.707),
  ]);
}

/** Sature chaque bande séparément, puis rassemble. */
export async function quadrafuzz(buffer: AudioBuffer, r: ReglagesQuadrafuzz): Promise<AudioBuffer> {
  const bandes = await separerEnBandes(buffer, r.f1, r.f2, r.f3);
  const courbes = [r.graves, r.basMediums, r.hautsMediums, r.aigus].map((s) => courbeFuzz(s));
  const gainSortie = 10 ** (r.sortie / 20);

  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch);
    const sec = buffer.getChannelData(ch);
    const src = bandes.map((b) => b.getChannelData(ch));
    for (let i = 0; i < buffer.length; i++) {
      let traite = 0;
      for (let b = 0; b < 4; b++) traite += appliquerCourbe(courbes[b], src[b][i]);
      // Le mélange accepte une courbe ; `valeurA` lit le nombre comme le tableau, sans second chemin.
      const melange = Math.max(0, Math.min(100, valeurA(r.mix, i))) / 100;
      dst[i] = (traite * melange + sec[i] * (1 - melange)) * gainSortie;
    }
  }
  // Quatre bandes saturées chacune à ±1, puis sommées : la crête passait 1 (mesuré 1,23).
  return plafonnerCrete(out);
}
