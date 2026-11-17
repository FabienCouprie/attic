// audio/filtre-tb303.ts — Le passe-bas à échelle de diodes de la Roland TB-303.
//
// ═══ CE QUI EST MODÉLISÉ ═══
//
// - L'ÉCHELLE À DIODES. Quatre condensateurs reliés par des paires de diodes, le bas mené par une paire
//   de transistors. Dans une échelle à transistors, chaque étage est isolé du suivant ; ici le courant
//   d'un barreau charge les condensateurs des deux côtés, et les quatre étages se tiennent. Le courant
//   d'une paire de diodes vaut la tangente hyperbolique de la différence de tension à ses bornes ;
//   d'où, en tensions rapportées à deux fois la tension thermique (V. Zavalishin, « The Art of VA
//   Filter Design », rév. 2.1.2, § 5.10 « Diode ladder », éq. 5.18 et sa forme non linéaire) :
//     ẏ1 = ω1 (tanh(x) − tanh(y1 − y2))
//     ẏk = ωk (tanh(yk−1 − yk) − tanh(yk − yk+1)),  k = 2, 3
//     ẏ4 = ω4 (tanh(y3 − y4) − tanh(y4))
//   et x = entrée − k · passe-haut(y4). Les ωk suivent les condensateurs du schéma : C18 = 0,018 µF au
//   bas, 0,033 µF pour les trois autres. Linéarisé, le cœur a pour dénominateur, au rapport d'une
//   moitié exacte, s⁴ + 6,727 s³ + 14,142 s² + 9,514 s + 1 + k (T. E. Stinchcombe, « Analysis of the
//   Moog Transistor Ladder and Derivative Filters », 2008, et ses pages sur l'échelle de la TB-303) :
//   des pôles étalés, une pente qui s'accentue lentement, une oscillation à k = 17. Au rapport 18/33
//   du schéma, k = 17,019 à 1,3838 fois la pulsation d'étage.
// - LE PASSE-HAUT DE LA BOUCLE DE RÉSONANCE, à 92 Hz : le bloc 2 du modèle que Stinchcombe tire du
//   circuit. Il retire la contre-réaction du grave, qui garde donc une part de son niveau quand la
//   résonance monte. a1k0n donne 100 Hz ; Open303 prend 150 Hz, réglé à l'oreille.
// - LA RÉSONANCE, LINÉAIRE COMME SON POTENTIOMÈTRE (VR4, 50K(B) sur le schéma), jusqu'à un gain k de
//   0,943 fois celui qui ferait osciller l'échelle seule. L'instrument d'origine n'oscille pas de
//   lui-même, et 0,943 est la marge que l'analyse de Stinchcombe trouve à résonance pleine et à 820 Hz.
//   Prise ici comme rapport à 17,019, aucune coupure ne la dépasse : au croisement de phase, le gain de
//   boucle vaut 0,81 à 820 Hz et tend vers 0,943 aux coupures hautes, où le passe-haut ne recule plus
//   l'oscillation. Avec le gain de 18,72 de son modèle complet, ce module retrouve ses 0,943 à 820 Hz,
//   mais oscille au-dessus de 1 350 Hz de coupure : c'est l'option que Fabien a écartée le 2026-11-15.
// - « COUPURE » EST LA FRÉQUENCE OÙ SE FORME LA RÉSONANCE, la convention d'Open303 et celle de la
//   vérification des notes de service. À résonance nulle, le point à −3 dB est 9,5 fois plus bas.
//
// ═══ COMMENT IL EST RÉSOLU ═══
//
// À DEUX FOIS LA CADENCE (`surechantillonnage-double.ts`), par intégration trapézoïdale à retard nul :
// les quatre équations et le passe-haut sont résolus ENSEMBLE à chaque échantillon, la boucle de
// résonance comprise, ce qui place la résonance linéaire exactement à la coupure demandée et tient le
// filtre stable à toute résonance. Chaque tangente est remplacée par sa pente moyenne tanh(z)/z, prise
// d'abord au pas précédent puis à la première solution : deux passes du système tridiagonal. Relevé par
// le test, l'écart à la solution convergée reste sous −70 dB du signal ; il valait −76 dB au pire des
// neuf cas sondés.
//
// ═══ CE QUI N'EST PAS MODÉLISÉ ═══
//
// - Les autres réseaux de liaison du circuit : des pôles et des zéros sous 16 Hz, dans la boucle et hors
//   d'elle, qui font chez Stinchcombe une seconde résonance vers 8 à 10 Hz.
// - Le coefficient d'émission des diodes, et le mélange de types de diodes que Stinchcombe soupçonne de
//   donner 6 dB de plus à la bande passante ; la dispersion des composants ; le réglage d'usine TM4.
// - Aucune compensation du niveau : la résonance creuse la bande passante comme sur le circuit.
//   Décision de Fabien, le 2026-11-15, dans la règle du dépôt qui veut qu'amplifier soit un geste.
//
// L'enveloppe et l'accent, qui conduisent la coupure, sont dans `enveloppe-tb303.ts`.

import { monter, redescendre } from "./surechantillonnage-double";
import { valeurA } from "./courbe";

/**
 * Les rapports C / Cₖ des quatre condensateurs de l'échelle, du bas vers le haut.
 *
 * Le schéma de la TB-303 porte C18 = 0,018 µF au bas de l'échelle et C19, C24, C26 = 0,033 µF au-dessus.
 */
export const RAPPORTS_ETAGES = [33 / 18, 1, 1, 1] as const;

/**
 * La pulsation de résonance du cœur linéaire, en unités de la pulsation d'étage : celle où la boucle
 * ouverte tourne d'un demi-tour. √2 pour un condensateur du bas de moitié exacte ; 1,3838 pour 18/33.
 */
export const OMEGA_RESONANCE = 1.383796812043;

/** Le gain de boucle auquel le cœur linéaire oscille : 17 pour une moitié exacte, 17,019 pour 18/33. */
export const GAIN_OSCILLATION = 17.019260051854;

/** Le gain de boucle à « Résonance » 100 % : juste sous l'oscillation, à toute coupure. */
export const GAIN_MAX = 0.943 * GAIN_OSCILLATION;

/** La coupure du passe-haut posé dans la boucle de résonance, en hertz : 92 Hz chez Stinchcombe. */
export const PASSE_HAUT_BOUCLE = 92;

/** Le niveau d'entrée de l'échelle : un échantillon de 1 y vaut deux fois la tension thermique. */
export const ATTAQUE = 2;

/** Les itérations de la résolution par échantillon. */
export const ITERATIONS = 2;

export interface OptionsFiltreTb303 {
  /** La fréquence d'échantillonnage de la voie. */
  frequence: number;
  /** La fréquence de résonance, en hertz, constante ou une valeur par échantillon. */
  coupure: number | Float32Array;
  /** La résonance, de 0 à 1, constante ou une valeur par échantillon. */
  resonance: number | Float32Array;
}

export interface ResultatFiltreTb303 {
  voie: Float32Array;
}

/** tanh(z) / z, qui vaut 1 en zéro : la pente moyenne de la tangente entre 0 et z. */
const pente = (z: number) => (Math.abs(z) < 1e-6 ? 1 - (z * z) / 3 : Math.tanh(z) / z);

/** La coupure ramenée dans ce que le calcul sait tenir : de 10 Hz à 45 % de la fréquence d'échantillonnage. */
export const coupureUtile = (f: number, fe: number) =>
  Math.min(Math.max(Number.isFinite(f) ? f : 1000, 10), 0.45 * fe);

/**
 * L'échelle à diodes, à la cadence double, sur une voie déjà montée.
 *
 * `coupure` et `resonance` sont lus à la cadence d'origine : l'échantillon j de la voie double lit
 * la valeur de rang ⌊j / 2⌋.
 */
export function echelleDiodes(x: Float64Array, o: OptionsFiltreTb303, iterations = ITERATIONS): Float64Array {
  const fe2 = 2 * o.frequence;
  const y = new Float64Array(x.length);
  const [r1, r2, r3, r4] = RAPPORTS_ETAGES;
  // Les états des quatre intégrateurs et du passe-haut de la boucle, sous la forme trapézoïdale.
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, sh = 0;
  // Les arguments des cinq tangentes au pas précédent : la première estimation du pas courant.
  let zx = 0, z1 = 0, z2 = 0, z3 = 0, z4 = 0;
  const gh = Math.tan((Math.PI * PASSE_HAUT_BOUCLE) / fe2);
  const ch = 1 / (1 + gh);

  let coupurePrec = Number.NaN, G = 0;
  for (let j = 0; j < x.length; j++) {
    const i = j >> 1;
    const fc = coupureUtile(valeurA(o.coupure, i), o.frequence);
    if (fc !== coupurePrec) { G = Math.tan((Math.PI * fc) / fe2) / OMEGA_RESONANCE; coupurePrec = fc; }
    const res = Math.min(Math.max(valeurA(o.resonance, i), 0), 1);
    const k = GAIN_MAX * (Number.isFinite(res) ? res : 0);
    const g1 = G * r1, g2 = G * r2, g3 = G * r3, g4 = G * r4;
    const entree = Number.isFinite(x[j]) ? ATTAQUE * x[j] : 0;
    // Le passe-haut de la boucle rend une fonction affine de y4 : c·y4 + d.
    const d = -sh * ch;

    let y1 = 0, y2 = 0, y3 = 0, y4 = 0;
    for (let it = 0; it < iterations; it++) {
      const a0 = pente(zx), a1 = pente(z1), a2 = pente(z2), a3 = pente(z3), a4 = pente(z4);
      // Les quatre lignes, l'inconnue Y = y4 laissée en suspens dans les seconds membres (r + q·Y).
      const b1 = 1 + g1 * a1, c1 = -g1 * a1;
      const rr1 = g1 * a0 * (entree - k * d) + s1, q1 = -g1 * a0 * k * ch;
      const a2p = -g2 * a1, b2 = 1 + g2 * (a1 + a2), c2 = -g2 * a2;
      const a3p = -g3 * a2, b3 = 1 + g3 * (a2 + a3), q3 = g3 * a3;
      const a4p = -g4 * a3, b4 = 1 + g4 * (a3 + a4);
      const B2 = b2 - (a2p * c1) / b1, R2 = s2 - (a2p * rr1) / b1, Q2 = -(a2p * q1) / b1;
      const B3 = b3 - (a3p * c2) / B2, R3 = s3 - (a3p * R2) / B2, Q3 = q3 - (a3p * Q2) / B2;
      y4 = (s4 - (a4p * R3) / B3) / (b4 + (a4p * Q3) / B3);
      y3 = (R3 + Q3 * y4) / B3;
      y2 = (R2 + Q2 * y4 - c2 * y3) / B2;
      y1 = (rr1 + q1 * y4 - c1 * y2) / b1;
      zx = entree - k * (ch * y4 + d);
      z1 = y1 - y2; z2 = y2 - y3; z3 = y3 - y4; z4 = y4;
    }
    // Les états avancent : s ← 2y − s pour chaque intégrateur, et le passe-bas complémentaire du passe-haut.
    s1 = 2 * y1 - s1; s2 = 2 * y2 - s2; s3 = 2 * y3 - s3; s4 = 2 * y4 - s4;
    const passeBas = y4 - (ch * y4 + d);
    sh = 2 * passeBas - sh;
    if (!Number.isFinite(s1 + s2 + s3 + s4 + sh)) { s1 = s2 = s3 = s4 = sh = 0; zx = z1 = z2 = z3 = z4 = 0; y4 = 0; }
    y[j] = y4 / ATTAQUE;
  }
  return y;
}

/** Une voie filtrée : montée à la cadence double, passée dans l'échelle, redescendue. */
export function filtrerVoieTb303(voie: Float32Array, o: OptionsFiltreTb303): ResultatFiltreTb303 {
  return { voie: redescendre(echelleDiodes(monter(voie), o), voie.length) };
}
