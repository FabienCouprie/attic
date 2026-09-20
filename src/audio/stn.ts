// audio/stn.ts — Sinus, transitoires et bruit : les trois matières d'un son, séparées d'un coup.
//
// D'après Leonardo Fierro et Vesa Välimäki, « Enhanced Fuzzy Decomposition of Sound Into Sines,
// Transients, and Noise », Journal of the Audio Engineering Society 71(7-8), 2023, p. 468-480 —
// préprint : https://arxiv.org/abs/2210.14041. La décomposition en trois remonte à Scott Levine
// et Julius O. Smith III (« A Sines+Transients+Noise Audio Representation », AES 1998) ; le
// filtrage médian qui la rend si simple vient de Derry Fitzgerald (DAFx-10), déjà employé par la
// séparation harmonique/percussive d'Attic.
//
// CE QUI MANQUAIT. Attic sépare déjà en DEUX, deux fois : la séparation harmonique/percussive
// par filtre médian, et SMS en déterministe plus stochastique. Aucune des deux n'isole les
// TRANSITOIRES — HPSS les range avec le percussif, SMS avec le bruit. Or l'attaque est ce qui
// fait reconnaître un instrument, et c'est la matière qu'on veut traiter à part : allonger un son
// sans étaler ses attaques, adoucir une percussion sans éteindre sa queue.
//
// LES DEUX APPORTS DE L'ARTICLE, et ils tiennent ensemble. Le premier est le FLOU : un point du
// spectrogramme n'est pas forcément sinusoïdal OU bruité, il peut être des deux, et le masque
// passe de zéro à un par une rampe en cosinus surélevé plutôt que par une marche. Le second est
// la RECONSTRUCTION PARFAITE : les trois masques somment à un en chaque point, si bien que les
// trois sorties remises ensemble redonnent le son de départ, échantillon pour échantillon. Ce
// n'est pas une élégance : c'est ce qui permet de ne retoucher qu'une matière et de réassembler
// sans que la somme ne trahisse le découpage.
//
// DEUX FENÊTRES, ET C'EST TOUT LE PROBLÈME. Une partielle se voit sur une fenêtre LONGUE — il
// faut du temps pour constater qu'une fréquence dure. Une attaque se voit sur une fenêtre COURTE
// — sur une longue, elle est déjà diluée dans les cinquante millisecondes qui l'entourent. Une
// seule analyse ne peut donc pas faire les deux, et l'article enchaîne deux passes : les sinus
// sur la fenêtre longue, puis, sur ce qui reste, les transitoires sur la fenêtre courte.
import {
  medianeFrequentielle, medianeTemporelle, spectrogrammeModules,
} from "./hpss";
import { analyseSynthese } from "./stft";

export interface ReglagesStn {
  /** Fenêtre longue, où une partielle a le temps de se montrer. */
  tailleSinus?: number;
  /** Fenêtre courte, où une attaque n'est pas encore diluée. */
  tailleTransitoires?: number;
  medianeTemps?: number;
  medianeFrequence?: number;
  /** Centre de la rampe floue : au-dessus, c'est de la matière tenue (ou brève). */
  seuil?: number;
  /** Largeur de la rampe. Zéro rend des masques tout ou rien. */
  flou?: number;
}

/**
 * La rampe floue de l'article : un cosinus surélevé entre deux bornes.
 *
 * Sous `betaBas`, le point n'appartient pas du tout à la classe ; au-dessus de `betaHaut`, il lui
 * appartient entièrement ; entre les deux, il appartient aux DEUX, en proportion. La rampe en
 * cosinus est préférée à une droite parce que ses raccords sont plats : un point qui traverse la
 * borne ne fait pas sauter la dérivée du masque, et donc n'introduit pas de clic.
 */
export function masqueFlou(r: number, betaBas: number, betaHaut: number): number {
  if (!(betaHaut > betaBas)) return r >= betaHaut ? 1 : 0;
  if (r <= betaBas) return 0;
  if (r >= betaHaut) return 1;
  const u = (r - betaBas) / (betaHaut - betaBas);
  return Math.sin((Math.PI / 2) * u) ** 2;
}

/**
 * Le rapport de l'article : ce que le filtre médian temporel garde, sur ce que les deux gardent.
 *
 * Il vaut un pour une partielle — qui survit au filtre temporel et disparaît au fréquentiel —,
 * zéro pour une attaque, et un demi pour du bruit, que ni l'un ni l'autre ne distingue. Là où les
 * deux médianes sont nulles — le silence —, on rend un demi : la matière n'est alors ni l'une ni
 * l'autre, et le partage est sans conséquence puisqu'il n'y a rien à partager.
 */
export function rapportTonal(
  mods: ArrayLike<number>[], medianeTemps: number, medianeFrequence: number,
): Float32Array[] {
  const H = medianeTemporelle(mods, medianeTemps);
  const V = medianeFrequentielle(mods, medianeFrequence);
  return mods.map((trame, t) => {
    const n = trame.length;
    const r = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const h = H[t][k], v = V[t][k];
      r[k] = h + v > 1e-20 ? h / (h + v) : 0.5;
    }
    return r;
  });
}

/**
 * Une passe : un signal en deux, selon un rapport et une rampe.
 *
 * La complémentarité est tenue par construction — le second masque est `1 − m`, jamais recalculé
 * —, et c'est ce qui fait que les deux sorties redonnent l'entrée. Toute autre écriture laisserait
 * la promesse à la merci d'un arrondi.
 */
function couper(
  signal: Float32Array, taille: number, masques: Float32Array[],
): [Float32Array, Float32Array] {
  const moitie = taille / 2 + 1;
  const [dedans, dehors] = analyseSynthese(signal, taille, 2, (re, im, sRe, sIm, t) => {
    const m = masques[t];
    if (!m) return;
    for (let k = 0; k < taille; k++) {
      // Bin négatif : même masque que son miroir positif, le signal étant réel.
      const kk = k < moitie ? k : taille - k;
      const a = m[kk];
      sRe[0][k] = re[k] * a; sIm[0][k] = im[k] * a;
      sRe[1][k] = re[k] * (1 - a); sIm[1][k] = im[k] * (1 - a);
    }
  });
  return [dedans, dehors];
}

export interface ResultatStn {
  sinus: Float32Array;
  transitoires: Float32Array;
  bruit: Float32Array;
  /** Part de l'énergie de chaque matière, de 0 à 1 : de quoi le son est fait. */
  parts: { sinus: number; transitoires: number; bruit: number };
}

/**
 * La chaîne entière, d'un signal à trois.
 *
 * Deux passes enchaînées, et l'ordre n'est pas interchangeable : on retire d'abord ce qui TIENT,
 * puis on cherche ce qui CLAQUE dans ce qui reste. L'inverse prendrait pour attaque le début de
 * chaque note tenue, puisqu'une note qui commence est aussi un événement bref.
 */
export function separerStn(signal: Float32Array, o: ReglagesStn = {}): ResultatStn {
  const tailleS = o.tailleSinus ?? 4096;
  const tailleT = o.tailleTransitoires ?? 512;
  const mt = o.medianeTemps ?? 17;
  const mf = o.medianeFrequence ?? 17;
  const seuil = Math.min(0.99, Math.max(0.01, o.seuil ?? 0.7));
  const flou = Math.max(0, o.flou ?? 0.2);
  const bas = Math.max(0, seuil - flou / 2), haut = Math.min(1, seuil + flou / 2);

  // Passe 1 — la fenêtre longue, et le rapport tel quel : haut pour ce qui tient.
  const modsS = spectrogrammeModules(signal, tailleS);
  const rS = rapportTonal(modsS, mt, mf);
  const masquesS = rS.map((r) => Float32Array.from(r, (v) => masqueFlou(v, bas, haut)));
  const [sinus, reste] = couper(signal, tailleS, masquesS);

  // Passe 2 — la fenêtre courte, sur le RESTE, et le rapport RETOURNÉ : ce qui est bref est ce
  // que le filtre fréquentiel garde et que le temporel efface, soit `1 − rapport`.
  const modsT = spectrogrammeModules(reste, tailleT);
  const rT = rapportTonal(modsT, mt, mf);
  const masquesT = rT.map((r) => Float32Array.from(r, (v) => masqueFlou(1 - v, bas, haut)));
  const [transitoires, bruit] = couper(reste, tailleT, masquesT);

  let eS = 0, eT = 0, eN = 0;
  for (let i = 0; i < signal.length; i++) {
    eS += sinus[i] * sinus[i];
    eT += transitoires[i] * transitoires[i];
    eN += bruit[i] * bruit[i];
  }
  const total = eS + eT + eN;
  const part = (e: number) => (total > 1e-20 ? e / total : 0);
  return {
    sinus, transitoires, bruit,
    parts: { sinus: part(eS), transitoires: part(eT), bruit: part(eN) },
  };
}
