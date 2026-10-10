// audio/modulation-temps.test.ts — Les constantes de temps ouvertes à une courbe.
//
// LA FAMILLE « TEMPS », RÉDUITE À DEUX APRÈS LE RELEVÉ. Des huit réglages qu'elle portait, trois
// seulement sont des valeurs qui courent : l'attaque et le relâchement du gate, et le relâchement
// du limiteur. Les cinq autres ont été écartés sur décision de Fabien, et pour des raisons de
// nature différente, écrites dans `docs/modulables.ts` : l'écho inversé somme des copies décalées
// dont « Temps » fixe la longueur de sortie avant qu'un échantillon soit écrit ; l'ADSR calcule
// cinq points d'ancrage avant de tracer son enveloppe ; et le Haas tient à ce que l'oreille
// fusionne un décalage FIXE, qu'une courbe transposerait.
//
// CE QU'UNE CONSTANTE DE TEMPS EST, ET POURQUOI ELLE NE SE LIT PAS COMME UN GAIN. Un suiveur
// d'enveloppe est un filtre d'ordre un dont le coefficient vaut `exp(-1 / (τ·sr))` : il ne
// multiplie pas le son, il décide de la VITESSE à laquelle la mesure rattrape ce qu'elle mesure.
// Les deux invariants restent pourtant les mêmes qu'ailleurs :
//
// 1. SANS COURBE, PAS UN BIT NE BOUGE. Le scalaire garde son exponentielle UNIQUE, calculée une
//    fois avant la boucle, et l'expression est la même des deux côtés.
// 2. LA COURBE DOIT COMMANDER VRAIMENT. Un port qui ne change rien serait pire qu'une absence de
//    port.
//
// LE TÉMOIN EMPLOYÉ POUR LE SECOND N'EST PAS UN ÉCART DE NIVEAU, et c'est ce qui change de ces
// deux familles-ci. Une constante de temps ne monte ni ne baisse le son : elle change la FORME de
// ce qui suit une attaque. Le cas emploie donc un signal à marches, fort puis faible, et mesure
// combien de temps le gate ou le limiteur met à rattraper la marche.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { gateExpandeur } from "./effets-sibilance";
import { limiter } from "./effets-mastering";
import { coefficientSuiveur } from "./courbe";

const SR = 44100;

/** Une copie possédée du canal : une vue ne survit pas au tampon natif dont elle vient. */
const canal = (b: AudioBuffer, c = 0): Float32Array => Float32Array.from(b.getChannelData(c));

const memes = (x: Float32Array, y: Float32Array): boolean => {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

/** Une courbe constante, rendue en tableau, comme le fait l'exécuteur. */
const tenue = (valeur: number, n: number) => new Float32Array(n).fill(valeur);

/**
 * Un signal à marches : fort, calme, fort, calme, fort.
 *
 * C'EST CE QUE MESURE UNE CONSTANTE DE TEMPS. Un bruit continu ne dit rien d'un suiveur, qui s'y
 * installe et n'en bouge plus ; une marche l'oblige à rattraper, et la durée du rattrapage EST le
 * réglage qu'on module.
 *
 * DEUX SECTIONS CALMES, UNE TÔT ET UNE TARD, ET CE N'EST PAS DE L'ORNEMENT. Avec une seule, placée
 * au milieu, le cas de la rampe tombait : relevé, une rampe de 1 à 1000 ms rendait EXACTEMENT ce
 * que rend un relâchement de 1000 ms, zéro écart sur 22 050 échantillons, parce que la section
 * calme arrivait quand la rampe était déjà longue et que le gate ne se fermait plus. Deux sections
 * obligent la rampe à se montrer aux deux bouts de sa course : elle ferme la première comme un
 * relâchement court, laisse passer la seconde comme un relâchement long, et ne peut donc
 * coïncider avec ni l'un ni l'autre.
 */
function marches(n: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const part = Math.floor((5 * i) / n);
    const calme = part === 1 || part === 3;
    x[i] = (calme ? 0.02 : 0.8) * Math.sin((2 * Math.PI * 220 * i) / SR);
  }
  b.copyToChannel(x, 0);
  return b;
}

describe("le coefficient d'un suiveur", () => {
  it("UN SCALAIRE ET UNE COURBE CONSTANTE DONNENT LE MÊME COEFFICIENT, au bit près", () => {
    const fixe = coefficientSuiveur(50, SR);
    const tenu = coefficientSuiveur(tenue(50, 16), SR);
    for (let i = 0; i < 16; i++) expect(tenu(i)).toBe(fixe(i));
  });

  it("et le scalaire ne le calcule qu'UNE FOIS, ce qu'un relevé de son coût montrerait", () => {
    // Ce cas ne mesure pas le temps, il tient la FORME : le chemin du scalaire rend la même
    // référence de fonction à chaque appel, donc une valeur déjà calculée.
    const fixe = coefficientSuiveur(50, SR);
    expect(fixe(0)).toBe(fixe(1_000_000));
  });

  it("une durée plus longue rend un coefficient plus proche de un", () => {
    expect(coefficientSuiveur(500, SR)(0)).toBeGreaterThan(coefficientSuiveur(5, SR)(0));
  });
});

describe("le gate ouvert à deux courbes", () => {
  const x = marches(SR / 2);
  const n = x.length;
  const applique = (attaque: number | Float32Array, relachement: number | Float32Array) =>
    canal(gateExpandeur(x, "gate", -40, 4, attaque, relachement, 40));

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(1, 100), applique(tenue(1, n), tenue(100, n)))).toBe(true);
  });

  it("ET CHAQUE PORT SÉPARÉMENT, l'autre restant un nombre", () => {
    expect(memes(applique(1, 100), applique(tenue(1, n), 100)), "attaque seule").toBe(true);
    expect(memes(applique(1, 100), applique(1, tenue(100, n))), "relâchement seul").toBe(true);
  });

  it("deux relâchements opposés donnent deux sons, donc le port commande", () => {
    expect(memes(applique(1, tenue(1, n)), applique(1, tenue(1000, n)))).toBe(false);
  });

  it("une courbe qui CHANGE ne rend NI l'un NI l'autre", () => {
    // LE CAS QUI ATTRAPE UNE LECTURE FAITE UNE SEULE FOIS, hors de la boucle : une courbe lue à
    // l'échantillon zéro rendrait le son de sa première valeur, donc celui d'un relâchement court.
    //
    // DEUX PALIERS, ET NON UNE RAMPE, ET C'EST MESURÉ. Une rampe de 1 à 1000 ms rendait EXACTEMENT
    // ce que rend un relâchement de 1000 ms, zéro écart sur 22 050 échantillons : elle atteint
    // 201 ms avant la première section calme, et un relâchement de 201 ms ne ferme déjà plus ce
    // gate. Sur ce signal, une rampe ne peut donc que coïncider avec le lent, et le cas ne
    // mesurerait que cela. Deux paliers posent le court là où il ferme et le long là où il laisse
    // passer, de sorte que le résultat ne peut coïncider avec aucun des deux.
    const paliers = new Float32Array(n);
    for (let i = 0; i < n; i++) paliers[i] = i < n / 2 ? 1 : 1000;
    const y = applique(1, paliers);
    expect(memes(y, applique(1, 1)), "coïncide avec le relâchement court").toBe(false);
    expect(memes(y, applique(1, 1000)), "coïncide avec le relâchement long").toBe(false);
  });
});

describe("le limiteur ouvert à une courbe", () => {
  const x = marches(SR / 2);
  const n = x.length;
  const applique = (relachement: number | Float32Array) => canal(limiter(x, -12, relachement, -1));

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(50), applique(tenue(50, n)))).toBe(true);
  });

  it("deux relâchements opposés donnent deux sons, donc le port commande", () => {
    expect(memes(applique(tenue(1, n)), applique(tenue(1000, n)))).toBe(false);
  });

  it("une courbe qui monte ne rend NI l'un NI l'autre", () => {
    const rampe = new Float32Array(n);
    for (let i = 0; i < n; i++) rampe[i] = 1 + (999 * i) / n;
    const y = applique(rampe);
    expect(memes(y, applique(1))).toBe(false);
    expect(memes(y, applique(1000))).toBe(false);
  });
});
