// audio/peigne.ts — Un banc de filtres en peigne accordés.
//
// Un filtre en peigne à réinjection renvoie le son dans une ligne à retard de D échantillons : tout
// ce qui revient avec une période D se renforce, et le filtre résonne à sr/D et à TOUS ses
// multiples — une série harmonique entière, comme une corde. Accorder D, c'est accorder cette corde.
// Plusieurs peignes, accordés sur les notes d'un accord, font sonner l'accord dans n'importe quel son.
//
// D'après Julius O. Smith III, « Physical Audio Signal Processing », 2010, chapitre « Feedback Comb
// Filters » ; l'amortissement dans la boucle est celui de Karplus et Strong (1983).

import { valeurA } from "./courbe";

export interface OptionsPeigne {
  /** Les fréquences des peignes, en hertz. */
  frequences: number[];
  /** Temps de décroissance de 60 dB de la résonance, en secondes. */
  t60: number;
  /** 0 à 100 : la perte des aigus à chaque passage dans la boucle. */
  amortissement: number;
  mix: number;
  /** Un facteur de transposition échantillon par échantillon, si une courbe pilote l'accord. */
  transpositions?: Float32Array | null;
}

const pic = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const x = b.getChannelData(c); for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); }
  return m;
};

/**
 * Le banc de peignes. Le gain de réinjection se déduit du T60 : g = 10^(−3·D / (sr·T60)), si bien que
 * la résonance dure le temps demandé quelle que soit la note — un peigne grave, dont la boucle est
 * longue, réinjecte davantage à chaque tour qu'un aigu.
 *
 * LE RETARD FRACTIONNAIRE PASSE PAR UN PASSE-TOUT, ET NON PAR UNE INTERPOLATION LINÉAIRE. Celle-ci
 * est un léger passe-bas, et il est DANS la boucle : un peigne à 880 Hz la traverse 880 fois par
 * seconde, et perdait ainsi 6 dB de plus que son T60 — mesuré, 66 dB en une seconde pour 60. Le
 * passe-tout du premier ordre de Thiran accorde la boucle sans rien retrancher à l'amplitude ; c'est
 * l'accord des cordes de Karplus et Strong (Jaffe et Smith, 1983). Une queue de T60 secondes
 * (plafonnée à vingt) laisse les peignes s'éteindre ; le niveau de sortie est ramené à celui de
 * l'entrée.
 */
/** Tout ce qu'une voie demande, en un seul objet sérialisable : c'est tout ce qu'un ouvrier reçoit. */
export interface OptionsPeigneVoie extends Omit<OptionsPeigne, "mix"> {
  /** La fréquence d'échantillonnage : un tableau de nombres ne la porte pas. */
  frequence: number;
}

/** La longueur que rend un peigne : le son, plus sa traîne. */
export const longueurAvecTraine = (longueur: number, t60: number, frequence: number) =>
  longueur + Math.round(Math.min(20, Math.max(0.01, t60)) * frequence);

/**
 * Une voie passée dans les peignes, et RIEN D'AUTRE : le son humide seul.
 *
 * CE CŒUR EXISTE POUR QUE LE COMPOSANT QUITTE LE FIL DE L'INTERFACE. **Mesuré avant, sur trois
 * secondes de son : 248 millisecondes, et pas un seul message pendant ce temps.**
 *
 * LA NORMALISATION ET LE MÉLANGE NE SONT PAS ICI, et c'est voulu : le niveau humide se ramène à la
 * crête de l'ENTRÉE ENTIÈRE, tous canaux confondus. Une voie seule ne peut pas la connaître ; c'est
 * le composant qui l'applique une fois ses voies rassemblées.
 */
export function peignesVoie(x: Float32Array, o: OptionsPeigneVoie): Float32Array {
  const sr = o.frequence;
  const t60 = Math.max(0.01, o.t60);
  const n = longueurAvecTraine(x.length, t60, sr);
  const freqs = o.frequences.filter((f) => f >= 20 && f < sr / 2);
  const amort = Math.max(0, Math.min(0.99, o.amortissement / 100));
  const y = new Float32Array(n);
  // La ligne doit tenir le peigne le plus grave, transposé au plus bas.
  // Par une boucle : un tableau par échantillon déborderait la pile d'un `Math.min(...t)`.
  let minT = 1;
  if (o.transpositions) { minT = Infinity; for (const v of o.transpositions) if (v < minT) minT = v; }
  const taille = Math.ceil(sr / Math.max(1, Math.min(...freqs, sr) * Math.max(0.05, minT))) + 4;

  {
    const lignes = freqs.map(() => new Float64Array(taille));
    const filtres = freqs.map(() => 0);
    const passeTout = freqs.map(() => 0);
    let ecr = 0;
    for (let i = 0; i < n; i++) {
      const entree = i < x.length ? x[i] : 0;
      const tr = o.transpositions ? o.transpositions[Math.min(i, o.transpositions.length - 1)] : 1;
      let s = 0;
      for (let k = 0; k < freqs.length; k++) {
        // Le passe-bas de l'amortissement retarde lui aussi, d'autant plus qu'il amortit : on retranche
        // son retard de phase à la fondamentale, sans quoi la note baisserait à mesure qu'on l'étouffe.
        const w = (2 * Math.PI * freqs[k] * tr) / sr;
        const retardPB = amort > 0 ? Math.atan2(amort * Math.sin(w), 1 - amort * Math.cos(w)) / w : 0;
        const D = Math.min(taille - 3, Math.max(2, sr / (freqs[k] * tr) - retardPB));
        const g = Math.pow(10, (-3 * D) / (sr * t60));
        // Partie entière et fraction dans [0,1 ; 1,1[ : la plage où le passe-tout reste bien conditionné.
        const entier = Math.floor(D - 0.1), eta = D - entier;
        const C = (1 - eta) / (1 + eta);
        const l = lignes[k];
        const u = l[(((ecr - entier) % taille) + taille) % taille], u1 = l[(((ecr - entier - 1) % taille) + taille) % taille];
        const retour = C * u + u1 - C * passeTout[k];
        passeTout[k] = retour;
        // Un passe-bas d'un pôle dans la boucle : les aigus s'éteignent avant les graves, comme sur une corde.
        filtres[k] = (1 - amort) * retour + amort * filtres[k];
        const v = entree + g * filtres[k];
        l[ecr] = v;
        s += v;
      }
      y[i] = s;
      ecr = (ecr + 1) % taille;
    }
  }
  return y;
}

/**
 * Le son humide ramené au niveau de l'entrée, puis mélangé au sec.
 *
 * LE NIVEAU SE RAMÈNE SUR LA CRÊTE DE L'ENTRÉE ENTIÈRE, tous canaux confondus : un peigne accordé
 * accumule, et sans ce rattrapage la sortie passerait franchement au-dessus de ce qu'on lui a donné.
 */
/**
 * Le mélange des peignes avec le son sec, après recalage de niveau.
 *
 * LE RECALAGE SE FAIT SUR LE SON ENTIER, AVANT LE MÉLANGE : une courbe ne le déplace donc pas, elle
 * règle ce qui en sort. C'est ce qui rend ce réglage modulable exactement, le mélange n'étant plus
 * qu'un gain sur ce qui est déjà calculé.
 */
export function melangerPeignes(
  b: AudioBuffer, humides: Float32Array[], mixPc: number | Float32Array,
): AudioBuffer {
  const sr = b.sampleRate, n = humides[0]?.length ?? b.length;
  const sortie = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: sr });
  let piqueHumide = 0;
  for (const h of humides) for (let i = 0; i < h.length; i++) piqueHumide = Math.max(piqueHumide, Math.abs(h[i]));
  const niveau = piqueHumide > 0 ? pic(b) / piqueHumide : 0;
  // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
  const mixA = (i: number) => Math.max(0, Math.min(1, valeurA(mixPc, i) / 100));
  for (let c = 0; c < b.numberOfChannels; c++) {
    const h = humides[c], s = b.getChannelData(c), d = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const mix = mixA(i);
      d[i] = h[i] * niveau * mix + (i < s.length ? s[i] : 0) * (1 - mix);
    }
  }
  return sortie;
}

export function peignes(b: AudioBuffer, o: OptionsPeigne): AudioBuffer {
  const humides = Array.from({ length: b.numberOfChannels }, (_, c) =>
    peignesVoie(b.getChannelData(c), { ...o, frequence: b.sampleRate }));
  return melangerPeignes(b, humides, o.mix);
}
