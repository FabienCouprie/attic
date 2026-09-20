// audio/velours.ts — Réverbération tardive par bruit de velours, à décroissance libre.
//
// D'après Vesa Välimäki, Bo Holm-Rasmussen, Benoit Alary et Heidi-Maria Lehtonen, « Late
// Reverberation Synthesis Using Filtered Velvet Noise », Applied Sciences / JAES, 2017 ; et pour
// la décroissance quelconque, Jon Fagerström, Nils Meyer-Kahlen, Sebastian J. Schlecht et Vesa
// Välimäki, « Dark Velvet Noise », DAFx-22 —
// https://dafx2020.mdw.ac.at/proceedings/papers/DAFx20in22_paper_31.pdf
// puis « Non-Exponential Reverberation Modeling Using Dark Velvet Noise », 2024 —
// https://arxiv.org/pdf/2403.20090
//
// LE BRUIT DE VELOURS est un bruit ÉPARS : une impulsion de ±1 par intervalle régulier, placée
// au hasard dans cet intervalle, et rien entre elles. À mille cinq cents impulsions par seconde,
// l'oreille n'entend plus les impulsions séparées mais une nappe — et une nappe plus LISSE que
// celle d'un bruit gaussien de même densité, parce qu'aucune impulsion n'est plus forte qu'une
// autre. C'est ce qui en fait une bonne réverbération tardive.
//
// CE QUE CELA AJOUTE À ATTIC, qui a déjà quatre réverbérations. La convolution demande un
// FICHIER de réponse impulsionnelle ; les trois autres décroissent exponentiellement, parce que
// c'est ce que fait une salle. Ici la décroissance est une COURBE QU'ON CHOISIT : exponentielle
// comme une salle, linéaire, en gonflement — un son qui enfle au lieu de s'éteindre, ce qu'on
// n'obtient autrement qu'en retournant un enregistrement —, ou en deux pentes, ce qui est la
// signature des salles couplées : une église et sa chapelle, une scène et sa cage de scène.
// Aucune salle réelle ne fait la première ni la troisième, et c'est précisément l'intérêt.
//
// SUR LE CALCUL, et pour être exact : l'article vante une convolution SANS MULTIPLICATION, les
// impulsions valant ±1 — c'est décisif en temps réel. Ici le traitement est hors ligne, et la
// réponse est convoluée par transformée de Fourier, ce qui est plus rapide encore à cette
// longueur. Ce qu'on garde du velours n'est donc pas son économie mais sa TEXTURE et la liberté
// de sa décroissance.

import { fft } from "./fft";

export type ProfilDecroissance = "exponentielle" | "lineaire" | "gonflement" | "couplee";

export interface OptionsVelours {
  /** Durée de la réponse, en secondes. */
  duree: number;
  sampleRate: number;
  /** Impulsions par seconde. En dessous de mille, on les entend une à une — ce qui est un effet. */
  densite?: number;
  profil?: ProfilDecroissance;
  /** Temps de chute de soixante décibels, pour les profils qui en ont un. */
  rt60?: number;
  /** Part de la durée où la seconde pente prend le relais, pour le profil couplé. */
  coude?: number;
  /**
   * Assombrissement : fréquence de coupure à la fin, en fraction de celle du début.
   *
   * Une salle avale les aigus plus vite que les graves ; sans cela, la queue reste brillante et
   * s'entend comme une nappe de bruit collée au son plutôt que comme un espace.
   */
  assombrissement?: number;
  graine?: number;
}

/** Générateur reproductible : deux réponses de même graine sont identiques. */
function hasard(graine: number): () => number {
  let g = (graine | 0) || 1;
  return () => {
    g = (g * 1103515245 + 12345) & 0x7fffffff;
    return g / 0x7fffffff;
  };
}

export interface SequenceVelours {
  positions: Int32Array;
  signes: Int8Array;
}

/**
 * Les positions et les signes des impulsions.
 *
 * UNE impulsion par intervalle, et une seule : c'est ce qui distingue le velours d'un bruit
 * épars quelconque, et ce qui lui donne sa régularité perceptive. Deux impulsions qui se
 * suivraient de trop près feraient entendre un grain ; aucune pendant longtemps ferait un trou.
 */
export function sequenceVelours(
  longueur: number, densite: number, sampleRate: number, graine = 1,
): SequenceVelours {
  const alea = hasard(graine);
  const intervalle = Math.max(1, Math.round(sampleRate / Math.max(1, densite)));
  const nombre = Math.max(0, Math.floor(longueur / intervalle));
  const positions = new Int32Array(nombre);
  const signes = new Int8Array(nombre);
  for (let k = 0; k < nombre; k++) {
    positions[k] = Math.min(longueur - 1, k * intervalle + Math.floor(alea() * intervalle));
    signes[k] = alea() < 0.5 ? -1 : 1;
  }
  return { positions, signes };
}

/**
 * La courbe de décroissance, en amplitude.
 *
 * C'est ici que se joue tout l'intérêt du nœud : l'amplitude de chaque impulsion est lue dans
 * cette courbe, qui n'a aucune raison d'être une exponentielle. Le profil « gonflement » est
 * exactement l'inverse — le son enfle et s'arrête net, ce qu'on n'obtient autrement qu'en
 * retournant un enregistrement —, et le profil « couplée » enchaîne deux pentes, signature d'une
 * salle qui en contient une autre.
 */
export function courbeDecroissance(
  longueur: number, sampleRate: number, o: Partial<OptionsVelours> = {},
): Float32Array {
  const profil = o.profil ?? "exponentielle";
  const rt60 = Math.max(0.05, o.rt60 ?? 1.5);
  const coude = Math.min(0.95, Math.max(0.05, o.coude ?? 0.3));
  const c = new Float32Array(longueur);
  // Une chute de soixante décibels, c'est un facteur mille.
  const tau = (sec: number) => Math.exp(-Math.log(1000) / Math.max(1e-6, sec * sampleRate));
  for (let n = 0; n < longueur; n++) {
    const u = longueur > 1 ? n / (longueur - 1) : 0;
    switch (profil) {
      case "lineaire":
        c[n] = 1 - u;
        break;
      case "gonflement":
        // Le miroir de l'exponentielle : ce qui décroît le plus vite devient ce qui monte le
        // plus tard, et la queue s'arrête net sur son maximum.
        c[n] = tau(rt60) ** (longueur - 1 - n);
        break;
      case "couplee": {
        // Deux salles : la petite s'éteint vite, la grande prend le relais et tient longtemps.
        const n2 = Math.floor(longueur * coude);
        c[n] = n < n2
          ? tau(rt60 * 0.35) ** n
          : (tau(rt60 * 0.35) ** n2) * tau(rt60) ** (n - n2);
        break;
      }
      default:
        c[n] = tau(rt60) ** n;
    }
  }
  return c;
}

/**
 * La réponse impulsionnelle complète.
 *
 * L'assombrissement est obtenu par un passe-bas d'ordre un dont le coefficient se resserre au
 * fil de la queue : les aigus s'éteignent avant les graves, comme dans toute salle. On l'applique
 * APRÈS la mise en place des impulsions, de sorte qu'il agisse sur la texture et non sur chaque
 * impulsion prise isolément.
 */
export function reponseVelours(o: OptionsVelours): Float32Array {
  const longueur = Math.max(1, Math.round(o.duree * o.sampleRate));
  const { positions, signes } = sequenceVelours(longueur, o.densite ?? 1500, o.sampleRate, o.graine ?? 1);
  const courbe = courbeDecroissance(longueur, o.sampleRate, o);
  const h = new Float32Array(longueur);
  for (let k = 0; k < positions.length; k++) h[positions[k]] = signes[k] * courbe[positions[k]];

  const assombrissement = Math.min(1, Math.max(0.01, o.assombrissement ?? 0.25));
  if (assombrissement < 1) {
    let etat = 0;
    for (let n = 0; n < longueur; n++) {
      const u = longueur > 1 ? n / (longueur - 1) : 0;
      // Le coefficient va de « presque transparent » à « très filtrant » au fil de la queue.
      const a = 1 - (1 - assombrissement) * u;
      etat += a * (h[n] - etat);
      h[n] = etat;
    }
    // Le filtre a mangé du niveau : on remet la réponse à son amplitude d'origine.
    let crete = 0;
    for (let n = 0; n < longueur; n++) crete = Math.max(crete, Math.abs(h[n]));
    if (crete > 1e-9) for (let n = 0; n < longueur; n++) h[n] /= crete;
  }
  return h;
}

/**
 * Convolution par transformée de Fourier.
 *
 * Une convolution directe coûterait le produit des deux longueurs — trois secondes de queue sur
 * cinq secondes de son font trente milliards d'opérations. Par transformée, c'est une seconde.
 */
export function convoluer(x: Float32Array, h: Float32Array): Float32Array {
  const n = x.length + h.length - 1;
  let N = 1;
  while (N < n) N *= 2;
  const xr = new Float64Array(N), xi = new Float64Array(N);
  const hr = new Float64Array(N), hi = new Float64Array(N);
  xr.set(x); hr.set(h);
  fft(xr, xi, false);
  fft(hr, hi, false);
  for (let k = 0; k < N; k++) {
    const re = xr[k] * hr[k] - xi[k] * hi[k];
    const im = xr[k] * hi[k] + xi[k] * hr[k];
    xr[k] = re; xi[k] = im;
  }
  fft(xr, xi, true);
  // `fft` inverse normalise déjà par la taille.
  return Float32Array.from(xr.subarray(0, n));
}

/**
 * La courbe de décroissance d'énergie, mesurée sur une réponse.
 *
 * Intégrale de Schroeder : l'énergie restante à partir de chaque instant, en décibels. C'est la
 * mesure qui permet de VÉRIFIER qu'une réponse décroît comme on l'a demandée, plutôt que de le
 * supposer — et c'est elle qui donne les RT60 dans la littérature.
 */
export function courbeSchroeder(h: Float32Array): Float32Array {
  const n = h.length;
  const c = new Float32Array(n);
  let somme = 0;
  for (let i = n - 1; i >= 0; i--) {
    somme += h[i] * h[i];
    c[i] = somme;
  }
  const total = c[0];
  if (total <= 1e-20) return c;
  for (let i = 0; i < n; i++) c[i] = 10 * Math.log10(Math.max(1e-12, c[i] / total));
  return c;
}
