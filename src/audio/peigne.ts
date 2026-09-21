// audio/peigne.ts — Un banc de filtres en peigne accordés.
//
// Un filtre en peigne à réinjection renvoie le son dans une ligne à retard de D échantillons : tout
// ce qui revient avec une période D se renforce, et le filtre résonne à sr/D et à TOUS ses
// multiples — une série harmonique entière, comme une corde. Accorder D, c'est accorder cette corde.
// Plusieurs peignes, accordés sur les notes d'un accord, font sonner l'accord dans n'importe quel son.
//
// D'après Julius O. Smith III, « Physical Audio Signal Processing », 2010, chapitre « Feedback Comb
// Filters » ; l'amortissement dans la boucle est celui de Karplus et Strong (1983).

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
export function peignes(b: AudioBuffer, o: OptionsPeigne): AudioBuffer {
  const sr = b.sampleRate;
  const t60 = Math.max(0.01, o.t60);
  const n = b.length + Math.round(Math.min(20, t60) * sr);
  const freqs = o.frequences.filter((f) => f >= 20 && f < sr / 2);
  const amort = Math.max(0, Math.min(0.99, o.amortissement / 100));
  const humide = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: sr });
  // La ligne doit tenir le peigne le plus grave, transposé au plus bas.
  // Par une boucle : un tableau par échantillon déborderait la pile d'un `Math.min(...t)`.
  let minT = 1;
  if (o.transpositions) { minT = Infinity; for (const v of o.transpositions) if (v < minT) minT = v; }
  const taille = Math.ceil(sr / Math.max(1, Math.min(...freqs, sr) * Math.max(0.05, minT))) + 4;

  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = humide.getChannelData(c);
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
  const niveau = pic(humide) > 0 ? pic(b) / pic(humide) : 0;
  const mix = Math.max(0, Math.min(1, o.mix / 100));
  const sortie = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: sr });
  for (let c = 0; c < b.numberOfChannels; c++) {
    const h = humide.getChannelData(c), s = b.getChannelData(c), d = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = h[i] * niveau * mix + (i < s.length ? s[i] : 0) * (1 - mix);
  }
  return sortie;
}
