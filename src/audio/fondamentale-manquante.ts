// audio/fondamentale-manquante.ts — Le son dont la hauteur n'est pas jouée.
//
// D'OÙ VIENT CE STIMULUS. August Seebeck l'observe dès 1841 contre Ohm, qui tenait la hauteur pour
// la fréquence présente dans le signal. Jan Frederik Schouten, « The perception of subjective
// tones », Proceedings of the Koninklijke Nederlandse Akademie van Wetenschappen 41, 1938,
// p. 1086-1093, en fait le RÉSIDU : une suite d'harmoniques sans son fondamental s'entend à la
// hauteur de ce fondamental absent. J. C. R. Licklider, « Periodicity pitch and place pitch »,
// Journal of the Acoustical Society of America 26, 1954, p. 945, montre que la hauteur survit à un
// bruit qui masque la région du fondamental : elle n'est donc pas un produit de distorsion né dans
// l'oreille ou dans le haut-parleur. Ernst Terhardt, « Pitch, consonance, and harmony », même
// journal 55(5), 1974, p. 1061-1069, en tire la hauteur virtuelle.
//
// LE DÉCALAGE DE SCHOUTEN, ET C'EST LA MESURE QUI TRANCHE ENTRE DEUX EXPLICATIONS. Si l'on ajoute le
// MÊME nombre de hertz à tous les partiels, leurs écarts ne changent pas : une oreille qui n'écouterait
// que la période de l'enveloppe entendrait la même hauteur. Or la hauteur perçue se déplace, d'à peu
// près le décalage divisé par le rang moyen. Schouten, Ritsma et Cardozo, « Pitch of the residue »,
// Journal of the Acoustical Society of America 34(9), 1962, p. 1418-1424, en font la mesure. Le
// réglage « Décalage » le reproduit.

/** Un partiel présent dans le son : son rang, sa fréquence et son amplitude. */
export interface Partiel {
  rang: number;
  frequence: number;
  amplitude: number;
}

export interface OptionsComplexe {
  /** La fondamentale, en hertz. Elle n'est jouée que si le premier rang vaut un. */
  fondamentale: number;
  /** Le rang du premier harmonique présent. À un, la fondamentale est là. */
  premierRang: number;
  /** Le nombre de rangs consécutifs présents. */
  harmoniques: number;
  /** La pente des amplitudes, de 0 pour toutes égales à 100 pour une décroissance en 1/rang. */
  decroissance: number;
  /** Le décalage de Schouten, en hertz, ajouté à TOUS les partiels. */
  decalage: number;
}

/**
 * Les partiels présents.
 *
 * LE DÉCALAGE S'AJOUTE, IL NE MULTIPLIE PAS, et c'est tout le sens de l'épreuve : multiplier
 * transposerait le son sans rien apprendre, quand ajouter garde les écarts et déplace pourtant la
 * hauteur perçue. Un complexe décalé n'est plus harmonique, et c'est voulu.
 */
export function partielsDuComplexe(o: OptionsComplexe): Partiel[] {
  const f = Math.max(1, o.fondamentale);
  const premier = Math.max(1, Math.round(o.premierRang));
  const combien = Math.max(1, Math.round(o.harmoniques));
  const pente = Math.max(0, Math.min(100, o.decroissance)) / 100;
  return Array.from({ length: combien }, (_, i) => {
    const rang = premier + i;
    return {
      rang,
      frequence: rang * f + o.decalage,
      // À pente nulle tous les partiels pèsent un ; à pente pleine, le rang k pèse 1/k.
      amplitude: 1 / Math.pow(rang, pente),
    };
  }).filter((p) => p.frequence > 0);
}

/**
 * La hauteur que la théorie du résidu prédit pour un complexe décalé.
 *
 * PREMIER ORDRE, ET LA NOTICE LE DIT : la hauteur se déplace d'environ le décalage divisé par le
 * rang moyen des partiels présents. La mesure de Schouten, Ritsma et Cardozo donne cette pente ; la
 * hauteur exacte dépend du rang qui domine, que ce calcul ne cherche pas.
 */
export function hauteurPrediteDuResidu(o: OptionsComplexe): number {
  const partiels = partielsDuComplexe({ ...o, decalage: 0 });
  if (partiels.length === 0) return 0;
  const rangMoyen = partiels.reduce((s, p) => s + p.rang, 0) / partiels.length;
  return Math.max(0, o.fondamentale + o.decalage / rangMoyen);
}

/** Le fondu aux deux bouts : sans lui l'attaque est un clic, qui porte toutes les fréquences. */
const FONDU = 0.02;

/**
 * Le complexe rendu en échantillons, avec son bruit de masquage s'il en porte un.
 *
 * LE MASQUE EST LA PREUVE DE LICKLIDER. Un bruit passe-bas couvrant la région du fondamental absent
 * ne fait pas disparaître la hauteur : elle ne vient donc pas d'un produit de distorsion qui serait
 * né à cette fréquence-là, dans l'oreille ou dans l'appareil. Le bruit est filtré par un pôle
 * unique, dont la fréquence de coupure est posée sous le premier partiel présent.
 */
export function echantillonsDuComplexe(
  partiels: readonly Partiel[],
  o: { duree: number; niveau: number; masque: number; coupure: number; sampleRate: number; graine: number },
): Float32Array {
  const sr = Math.max(1, Math.round(o.sampleRate));
  const n = Math.max(1, Math.round(Math.max(0, o.duree) * sr));
  const x = new Float32Array(n);
  const somme = partiels.reduce((s, p) => s + p.amplitude, 0) || 1;
  const fondu = Math.max(1, Math.round(FONDU * sr));

  // Un bruit reproductible : le masque doit être le même d'une écoute à l'autre, sans quoi deux
  // épreuves ne se compareraient pas.
  let graine = Math.max(1, Math.floor(o.graine)) >>> 0;
  const suivant = () => {
    graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
    return graine / 4294967296 - 0.5;
  };
  const a = Math.exp((-2 * Math.PI * Math.max(1, o.coupure)) / sr);
  let bas = 0;
  const partMasque = Math.max(0, Math.min(1, o.masque));

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (const p of partiels) v += Math.sin(2 * Math.PI * p.frequence * t) * p.amplitude;
    v /= somme;
    if (partMasque > 0) {
      bas = a * bas + (1 - a) * suivant();
      // Le pôle unique rabote beaucoup d'énergie : on la rend, pour que le réglage se lise comme
      // une part du niveau et non comme un chiffre sans rapport avec ce qu'on entend.
      v += bas * partMasque * 6;
    }
    const montee = Math.min(1, i / fondu);
    const descente = Math.min(1, (n - i) / fondu);
    x[i] = v * o.niveau * Math.max(0, Math.min(montee, descente));
  }
  return x;
}

/** Une sinusoïde seule, pour entendre la hauteur que le complexe fera naître. */
export function echantillonsDuSinus(
  frequence: number, duree: number, niveau: number, sampleRate: number,
): Float32Array {
  const sr = Math.max(1, Math.round(sampleRate));
  const n = Math.max(1, Math.round(Math.max(0, duree) * sr));
  const x = new Float32Array(n);
  const fondu = Math.max(1, Math.round(FONDU * sr));
  for (let i = 0; i < n; i++) {
    const montee = Math.min(1, i / fondu);
    const descente = Math.min(1, (n - i) / fondu);
    x[i] = Math.sin((2 * Math.PI * frequence * i) / sr) * niveau * Math.max(0, Math.min(montee, descente));
  }
  return x;
}
