// audio/interpolation.test.ts — Ce que l'interpolation coûte, mesuré plutôt qu'affirmé.
//
// ═══ POURQUOI CES CAS, ET CE QU'ILS DOIVENT EMPÊCHER ═══
//
// « Un cubique vaut mieux qu'un linéaire » est une phrase de manuel. Ce qu'elle vaut sur CE chemin,
// à CES rapports de transposition, se mesure — sans quoi on remplacerait du code par du code sans
// savoir si l'on a gagné quelque chose, ni combien.
//
// LA MESURE EST UN RAPPORT SIGNAL / PARASITES. On transpose une sinusoïde pure : tout ce qui n'est
// pas à sa fréquence d'arrivée est un parasite que l'interpolation a fabriqué. On compare l'énergie
// de la raie attendue à celle de tout le reste, par une transformée faite sur place — le dépôt n'a
// pas besoin d'une bibliothèque pour une mesure de cette taille.
//
// ET LA DIRECTION COMPTE, c'est ce que ces cas disent de plus utile : vers le grave, l'erreur de
// l'interpolateur domine et le cubique gagne franchement ; vers l'aigu, c'est le repliement qui
// domine, et aucun interpolateur n'y peut rien sans un filtre AVANT la décimation.
import { describe, expect, it } from "vitest";
import { echantillonCubique, echantillonLineaire } from "./interpolation";

const SR = 44100;

/** Une sinusoïde pure, et rien d'autre : tout parasite mesuré est le fait de l'interpolation. */
function sinus(frequence: number, n: number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * frequence * i) / SR);
  return x;
}

/** Lecture bornée, comme un sampler qui s'arrête au bord de son échantillon. */
const lecteur = (x: Float32Array) => (i: number) => x[Math.min(x.length - 1, Math.max(0, i))];

/** Transpose par lecture à pas constant, avec l'interpolateur donné. */
function transposer(
  x: Float32Array, ratio: number, n: number,
  echantillon: (lire: (i: number) => number, pos: number) => number,
): Float32Array {
  const lire = lecteur(x);
  const y = new Float32Array(n);
  for (let j = 0; j < n; j++) y[j] = echantillon(lire, j * ratio);
  return y;
}

/** Le nombre d'échantillons analysés. Une puissance de deux, et la longueur de sortie. */
const N = 2048;

/**
 * Le rapport, en décibels, entre la raie attendue et tout le reste.
 *
 * ═══ LA FRÉQUENCE DE SORTIE TOMBE SUR UN RANG EXACT, ET C'EST TOUT CE QUI REND CECI MESURABLE ═══
 *
 * MON PREMIER JET FENÊTRAIT EN HANN et écartait trois rangs de part et d'autre. Il annonçait
 * **46,9 dB en linéaire et 47,0 en cubique** : un gain de 0,1 dB, c'est-à-dire rien. C'était faux, et
 * le nombre le disait — les deux interpolateurs touchaient LE MÊME PLAFOND, donc ce plafond n'était
 * pas le leur. C'était la fuite de ma propre fenêtre que je mesurais.
 *
 * Quand la fréquence de sortie vaut exactement `k × SR / N`, le signal boucle sur la fenêtre : une
 * transformée sans fenêtrage ne fuit alors sur aucun autre rang, et tout ce qui n'est pas au rang `k`
 * est bel et bien fabriqué par l'interpolation. On choisit donc la fréquence de SORTIE d'abord, et
 * l'on en déduit celle de la source.
 */
function raieSurParasites(y: Float32Array, rangRaie: number): number {
  const rangs = N >> 1;
  let signal = 0, reste = 0;
  for (let k = 1; k < rangs; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) {
      const w = (-2 * Math.PI * k * i) / N;
      a += y[i] * Math.cos(w);
      b += y[i] * Math.sin(w);
    }
    const p = a * a + b * b;
    if (k === rangRaie) signal += p; else reste += p;
  }
  return 10 * Math.log10(signal / Math.max(reste, 1e-30));
}

describe("ce que l'interpolation fabrique de parasites", () => {
  /**
   * Le gain du cubique sur le linéaire, en décibels de rapport signal/parasites.
   *
   * LE RANG 93 N'EST PAS UN GOÛT : il est impair et premier, de sorte qu'aucun de ses multiples ne
   * retombe sur un rang bas, et il place la raie à 2 002,6 Hz — dans la région où l'oreille est le
   * plus sensible, et assez loin de Nyquist pour que le repliement ne vienne pas tout masquer.
   */
  const RANG = 93;
  const gain = (ratio: number) => {
    const fSortie = (RANG * SR) / N;
    // LA SOURCE EST CHOISIE POUR QUE LA SORTIE TOMBE JUSTE. C'est l'inverse du premier jet, qui
    // fixait la source et laissait la sortie où elle voulait.
    const source = sinus(fSortie / ratio, Math.ceil(N * ratio) + 8);
    const lin = raieSurParasites(transposer(source, ratio, N, echantillonLineaire), RANG);
    const cub = raieSurParasites(transposer(source, ratio, N, echantillonCubique), RANG);
    return { lin, cub, gain: cub - lin };
  };

  it("VERS LE GRAVE, LE CUBIQUE GAGNE FRANCHEMENT : c'est là que l'interpolateur décide", () => {
    // Une tierce mineure vers le bas, puis une octave : les deux transpositions qu'un sampler fait
    // le plus souvent quand sa zone est au-dessus de la note jouée.
    const tierce = gain(2 ** (-3 / 12));
    const octave = gain(0.5);
    console.log(`tierce basse · linéaire ${tierce.lin.toFixed(1)} dB · cubique ${tierce.cub.toFixed(1)} dB`
      + ` · gain ${tierce.gain.toFixed(1)} dB`);
    console.log(`octave basse · linéaire ${octave.lin.toFixed(1)} dB · cubique ${octave.cub.toFixed(1)} dB`
      + ` · gain ${octave.gain.toFixed(1)} dB`);
    expect(tierce.gain, [
      "",
      "Le cubique n'apporte rien vers le grave, là où il devrait apporter le plus.",
      "",
      "C'est le cas où chaque échantillon de sortie tombe ENTRE deux échantillons de source :",
      "l'erreur de l'interpolateur y domine, et un cubique à quatre points doit s'y voir.",
      "",
    ].join("\n")).toBeGreaterThan(6);
    expect(octave.gain).toBeGreaterThan(6);
  });

  it("ET VERS L'AIGU AUSSI, tant que la source reste loin de Nyquist", () => {
    // J'AVAIS ÉCRIT LE CONTRAIRE, et la mesure m'a reprise. J'annonçais « vers l'aigu, c'est le
    // repliement qui domine, et un cubique y gagne peu » — c'est faux sur une source à 1 337 Hz
    // transposée d'une quinte : rien ne passe au-dessus de Nyquist, donc il n'y a rien à replier, et
    // le gain mesuré est de 24,5 dB. La réserve ne vaut que pour une source QUI PORTE DE L'AIGU, ce
    // que le cas suivant mesure.
    const quinte = gain(2 ** (7 / 12));
    console.log(`quinte haute · linéaire ${quinte.lin.toFixed(1)} dB · cubique ${quinte.cub.toFixed(1)} dB`
      + ` · gain ${quinte.gain.toFixed(1)} dB`);
    expect(quinte.gain, "sans aigu à replier, le cubique gagne autant qu'ailleurs").toBeGreaterThan(6);
  });

  it("MAIS IL NE RATTRAPE PAS LE REPLIEMENT, et c'est la borne de ce qu'on annonce", () => {
    // ═══ CE CAS BORNE L'ANNONCE, ET C'EST SON SEUL OBJET ═══
    //
    // Transposer vers l'aigu DÉCIME : ce qui, dans la source, passerait au-dessus de Nyquist se
    // replie plus bas, et aucun interpolateur n'y peut rien — il faudrait filtrer AVANT de décimer,
    // ce qui est un autre chantier. On le montre avec une source qui PORTE de l'aigu : 16 kHz
    // transposé d'une quinte voudrait sortir à près de 24 kHz, c'est-à-dire au-delà des 22,05 kHz
    // que la fréquence permet.
    const ratio = 2 ** (7 / 12);
    const source = sinus(16000, Math.ceil(N * ratio) + 8);
    const lin = raieSurParasites(transposer(source, ratio, N, echantillonLineaire), RANG);
    const cub = raieSurParasites(transposer(source, ratio, N, echantillonCubique), RANG);
    console.log(`16 kHz transposé d'une quinte · linéaire ${lin.toFixed(1)} dB · cubique ${cub.toFixed(1)} dB`);
    // La raie attendue n'est PAS au rang 93 ici : tout est parasite, et les deux le sont autant.
    // Ce qu'on vérifie est qu'aucun des deux ne prétend rendre un signal propre.
    expect(lin, "la source repliée ne laisse rien de propre au rang mesuré").toBeLessThan(0);
    expect(cub, "et le cubique n'y change rien : le repliement n'est pas son affaire")
      .toBeLessThan(0);
  });

  it("et à rapport UNITÉ, les deux rendent la source sans y toucher", () => {
    // Un sampler joue souvent la note de référence : ce chemin-là ne doit rien dégrader du tout.
    const n = 4096;
    for (const f of [echantillonLineaire, echantillonCubique]) {
      const y = transposer(sinus((RANG * SR) / N, n + 8), 1, n, f);
      let pire = 0;
      const ref = sinus((RANG * SR) / N, n + 8);
      for (let i = 2; i < n - 2; i++) pire = Math.max(pire, Math.abs(y[i] - ref[i]));
      expect(pire, "à rapport unité, l'interpolation doit être l'identité").toBeLessThan(1e-6);
    }
  });

  it("ET LE NOYAU LIT PAR L'ACCESSEUR QU'ON LUI DONNE : c'est ce qui permet une boucle", () => {
    // Un sampler SF2 boucle sur une portion de son échantillon. Le noyau ne doit donc jamais toucher
    // au tableau lui-même : s'il le faisait, les deux points qu'il regarde au-delà du bord
    // sortiraient de la boucle et l'on entendrait un clic à chaque tour.
    const vus: number[] = [];
    echantillonCubique((i) => { vus.push(i); return 0; }, 10.5);
    expect(vus, "quatre points, centrés sur la position").toEqual([9, 10, 11, 12]);
  });
});
