// audio/cloche-risset.ts — La cloche de Jean-Claude Risset, par synthèse
// additive.
//
// Ce timbre vient de son « Introductory Catalogue of Computer Synthesized
// Sounds » (Bell Labs, 1969) et a fait école pour une raison précise : il a
// montré qu'un timbre n'est pas un spectre figé mais une ÉVOLUTION. Une cloche
// ne sonne pas cloche parce qu'elle contient telles fréquences, mais parce que
// ses partiels s'éteignent à des vitesses différentes — les aigus vite, les
// graves lentement. D'où la colonne « durée » ci-dessous, aussi importante que
// les deux autres.
//
// Second enseignement : les partiels sont INHARMONIQUES. Aucun n'est un multiple
// entier de la fondamentale, ce qui explique qu'une cloche n'ait pas de hauteur
// franche — l'oreille hésite entre plusieurs candidates. Le paramètre
// d'inharmonicité de `clocheRisset` permet d'entendre cette bascule : ramenés
// sur les harmoniques, ces mêmes partiels ne sonnent plus du tout comme une
// cloche.
//
// Les deux désaccords de 1 Hz et 1,7 Hz sur les partiels doublés ne sont pas du
// bruit : ils font BATTRE ces paires, et c'est ce battement lent qui donne à la
// cloche sa vie.

/** Un partiel de la cloche. */
export interface PartielCloche {
  /** Multiplicateur de la fréquence de base. */
  ratio: number;
  /** Écart ajouté en Hz, qui fait battre les paires de partiels voisins. */
  desaccordHz: number;
  /** Amplitude relative. */
  amplitude: number;
  /** Durée relative de la décroissance : 1 = la plus longue. */
  duree: number;
}

/**
 * Les onze partiels du catalogue.
 *
 * Valeurs vérifiées contre deux sources concordantes plutôt que reprises de
 * mémoire — voir la notice du nœud. L'ordre des colonnes compte : c'est la
 * décroissance de la colonne `duree` (1 → 0,075) qui fait la cloche.
 */
export const PARTIELS_CLOCHE_RISSET: readonly PartielCloche[] = [
  { ratio: 0.56, desaccordHz: 0,   amplitude: 1,    duree: 1 },
  { ratio: 0.56, desaccordHz: 1,   amplitude: 0.67, duree: 0.9 },
  { ratio: 0.92, desaccordHz: 0,   amplitude: 1,    duree: 0.65 },
  { ratio: 0.92, desaccordHz: 1.7, amplitude: 1.8,  duree: 0.55 },
  { ratio: 1.19, desaccordHz: 0,   amplitude: 2.67, duree: 0.325 },
  { ratio: 1.7,  desaccordHz: 0,   amplitude: 1.67, duree: 0.35 },
  { ratio: 2,    desaccordHz: 0,   amplitude: 1.46, duree: 0.25 },
  { ratio: 2.74, desaccordHz: 0,   amplitude: 1.33, duree: 0.2 },
  { ratio: 3,    desaccordHz: 0,   amplitude: 1.33, duree: 0.15 },
  { ratio: 3.76, desaccordHz: 0,   amplitude: 1,    duree: 0.1 },
  { ratio: 4.07, desaccordHz: 0,   amplitude: 1.33, duree: 0.075 },
];

export interface OptionsCloche {
  /** Fréquence de base, en Hz. Ce n'est PAS la hauteur perçue : aucun partiel ne s'y trouve. */
  frequenceHz: number;
  /** Durée de la note, celle du partiel qui tient le plus longtemps. */
  dureeSec: number;
  sampleRate: number;
  /** Nombre de partiels retenus, du plus grave au plus aigu. Défaut : les onze. */
  partiels?: number;
  /**
   * 1 = les rapports de Risset. 0 = chaque partiel ramené sur l'harmonique
   * entier le plus proche, ce qui fait disparaître la cloche.
   */
  inharmonicite?: number;
  /** Échelle appliquée aux désaccords. 0 = plus aucun battement. */
  battement?: number;
  canaux?: number;
}

/** Rapport ramené vers l'harmonique entier le plus proche, selon le taux voulu. */
export function ratioInharmonique(ratio: number, taux: number): number {
  const harmonique = Math.max(1, Math.round(ratio));
  return harmonique + (ratio - harmonique) * taux;
}

export function clocheRisset(options: OptionsCloche): AudioBuffer {
  const sr = options.sampleRate;
  const n = Math.max(1, Math.round(options.dureeSec * sr));
  const canaux = Math.max(1, options.canaux ?? 1);
  const nbPartiels = Math.max(1, Math.min(PARTIELS_CLOCHE_RISSET.length, Math.round(options.partiels ?? PARTIELS_CLOCHE_RISSET.length)));
  const inharmonicite = options.inharmonicite ?? 1;
  const battement = options.battement ?? 1;

  const retenus = PARTIELS_CLOCHE_RISSET.slice(0, nbPartiels);
  const total = retenus.reduce((s, p) => s + p.amplitude, 0) || 1;

  // Attaque très courte : sans elle, démarrer une sinusoïde à pleine amplitude
  // produit un clic qui masque justement l'attaque de la cloche.
  const attaque = Math.min(Math.round(0.004 * sr), Math.floor(n / 2)) || 1;
  // La décroissance exponentielle est calée pour atteindre −60 dB au bout de la
  // durée du partiel : c'est ce qui donne un sens à la colonne `duree`.
  const LN_MILLE = Math.log(1000);

  const out = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  const canal = new Float64Array(n);

  for (const p of retenus) {
    const f = options.frequenceHz * ratioInharmonique(p.ratio, inharmonicite) + p.desaccordHz * battement;
    const omega = (2 * Math.PI * f) / sr;
    const tau = Math.max(1e-4, p.duree * options.dureeSec);
    const k = LN_MILLE / (tau * sr);
    const a = p.amplitude / total;
    for (let i = 0; i < n; i++) {
      const attaqueGain = i < attaque ? i / attaque : 1;
      canal[i] += a * attaqueGain * Math.exp(-k * i) * Math.sin(omega * i);
    }
  }

  for (let c = 0; c < canaux; c++) out.getChannelData(c).set(canal);
  return out;
}
