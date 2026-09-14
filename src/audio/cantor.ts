// audio/cantor.ts — La poussière de Cantor appliquée au temps.
//
// LA PROPRIÉTÉ. On retire le tiers central d'un segment, puis le tiers central
// de chacun des deux morceaux restants, et ainsi de suite. À l'étage n il reste
// 2ⁿ fragments de longueur 3⁻ⁿ, soit (2/3)ⁿ de la durée : une infinité de
// fragments pour une durée qui tend vers zéro. Et l'ensemble est AUTO-SIMILAIRE :
// son premier tiers est l'ensemble entier, réduit trois fois.
//
// EN AUDIO. Le son est gardé sur les fragments et rendu au silence ailleurs. Un
// étage entendu seul est un bégaiement ; la propriété, elle, ne s'entend qu'en
// comparant les étages. D'où le mode « Construction », qui joue les étages 0, 1,
// 2… à la suite : on entend l'ensemble se creuser, chaque étage répétant dans
// chaque fragment le geste de l'étage précédent.
//
// LES BORDS. Couper net un son fait claquer chaque bord. Un fondu est posé à
// l'intérieur de chaque fragment gardé, pour que les parties retirées restent
// exactement silencieuses — c'est ce qui les rend mesurables. Il est borné à la
// moitié du fragment : aux étages profonds les fragments ne durent que quelques
// millisecondes.

export type SegmentCantor = { debut: number; fin: number };

/**
 * Fragments gardés à l'étage `etages`, en échantillons.
 *
 * Les bornes sont calculées en flottant et arrondies À LA FIN, ce qui place
 * chaque fragment à un demi-échantillon de sa position exacte. Arrondir à chaque
 * étage donnerait au contraire des longueurs rigoureusement égales, mais des
 * positions qui dérivent — MESURÉ sur des longueurs de 10 000 à 60 000
 * échantillons à 7 étages : jusqu'à 1,8 échantillon de décalage, contre 0,5 ici,
 * pour des longueurs à ±1 échantillon près. Les deux restent inaudibles
 * (0,04 ms) ; c'est la position qui porte l'auto-similarité, d'où ce choix.
 */
export function segmentsCantor(longueur: number, etages: number): SegmentCantor[] {
  let segments: [number, number][] = [[0, longueur]];
  for (let e = 0; e < etages; e++) {
    const suivants: [number, number][] = [];
    for (const [a, b] of segments) {
      const tiers = (b - a) / 3;
      suivants.push([a, a + tiers], [b - tiers, b]);
    }
    segments = suivants;
  }
  return segments.map(([a, b]) => ({ debut: Math.round(a), fin: Math.round(b) }));
}

/** Le son gardé sur les fragments, silence exact ailleurs, fondu intérieur à chaque bord. */
export function appliquerCantor(canal: Float32Array, segments: SegmentCantor[], fondu: number): Float32Array {
  const sortie = new Float32Array(canal.length);
  for (const { debut, fin } of segments) {
    const d = Math.min(fondu, Math.floor((fin - debut) / 2));
    for (let i = debut; i < fin; i++) {
      let g = 1;
      if (d > 0) {
        const depuisDebut = i - debut, avantFin = fin - 1 - i;
        if (depuisDebut < d) g = 0.5 - 0.5 * Math.cos((Math.PI * (depuisDebut + 0.5)) / d);
        else if (avantFin < d) g = 0.5 - 0.5 * Math.cos((Math.PI * (avantFin + 0.5)) / d);
      }
      sortie[i] = g * canal[i];
    }
  }
  return sortie;
}

export type ModeCantor = "construction" | "dernier";

export type OptionsCantor = {
  etages: number;
  mode: ModeCantor;
  fonduSec: number;
};

export const ETAGES_MAX = 7;

export function planCantor(longueur: number, sampleRate: number, o: OptionsCantor) {
  const etages = Math.max(1, Math.min(ETAGES_MAX, Math.round(o.etages)));
  const passages = o.mode === "construction" ? etages + 1 : 1;
  return { etages, passages, total: passages * longueur, dureeSec: (passages * longueur) / sampleRate };
}

export function rendreCantorCanaux(entree: Float32Array[], sampleRate: number, o: OptionsCantor) {
  const longueur = entree[0].length;
  const plan = planCantor(longueur, sampleRate, o);
  const fondu = Math.max(0, Math.round(o.fonduSec * sampleRate));
  const premier = o.mode === "construction" ? 0 : plan.etages;
  const canaux = entree.map(() => new Float32Array(plan.total));
  for (let k = 0; k < plan.passages; k++) {
    const segments = segmentsCantor(longueur, premier + k);
    entree.forEach((c, i) => canaux[i].set(appliquerCantor(c, segments, fondu), k * longueur));
  }
  return {
    canaux, plan,
    fragments: 2 ** plan.etages,
    /** Durée d'un fragment au dernier étage, en ms. */
    fragmentMs: (longueur / 3 ** plan.etages / sampleRate) * 1000,
    fractionGardee: (2 / 3) ** plan.etages,
  };
}
