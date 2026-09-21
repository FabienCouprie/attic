// audio/dither.ts — La dernière étape de toute chaîne audio, et elle manquait.
//
// CE QUI SE PASSAIT AVANT, et ce n'est pas une supposition : tout WAV produit par Attic est écrit
// en 16 bits, et la conversion se faisait par `setInt16`, qui TRONQUE vers zéro. Vérifié :
// 1,9 rend 1, −1,9 rend −1, 0,6 rend 0. L'erreur de quantification allait donc jusqu'à un LSB
// entier au lieu de ±½, elle était biaisée vers zéro, et surtout elle était CORRÉLÉE AU SIGNAL.
//
// POURQUOI LA CORRÉLATION EST LE VRAI SUJET. Une erreur corrélée n'est pas du bruit : c'est de la
// distorsion. Sur un son fort, elle se cache sous le signal et personne ne l'entend. Sur une fin
// de fondu ou une queue de réverbération — là où le signal descend vers les derniers bits — elle
// devient un grain rugueux qui suit la musique, et c'est exactement l'endroit où l'oreille est le
// plus attentive. Un sinus très faible quantifié sans dither ne rend plus un sinus mais un
// escalier de trois marches, dont le spectre est une série d'harmoniques.
//
// CE QUE LE DITHER FAIT, ET IL FAUT LE DIRE SANS MAGIE. Il AJOUTE du bruit — un peu — pour en
// retirer de la distorsion. On ajoute au signal, avant l'arrondi, un bruit de l'ordre du LSB ;
// l'erreur cesse alors de dépendre du signal et devient un souffle constant, immobile, que
// l'oreille ignore. Le plancher de bruit monte de quelques décibels ; la distorsion disparaît.
// C'est un échange, et c'est celui qu'on veut : à −93 dBFS, le souffle est sous le seuil d'audition
// de toute écoute ordinaire, là où la distorsion, elle, s'entend.
//
// POURQUOI TRIANGULAIRE (TPDF) ET PAS UNIFORME. Avec un bruit uniforme d'un LSB, l'erreur reste
// dépendante du signal au second ordre : sa VARIANCE se met à respirer au rythme du signal, ce qui
// s'entend comme une modulation du souffle. La somme de deux tirages uniformes indépendants donne
// une densité triangulaire de ±1 LSB, et c'est le plus petit bruit qui rende l'erreur
// complètement indépendante du signal, moyenne ET variance. C'est le choix standard, et les tests
// de ce module vérifient précisément cette propriété plutôt que de la citer.
//
// LE TIRAGE EST DÉTERMINISTE, ce qui n'est pas une contradiction : du bruit pseudo-aléatoire à
// graine fixe est du bruit pour l'oreille et reste reproductible pour le dépôt. Deux rendus du
// même graphe donnent donc deux fichiers identiques — c'est la convention de graine du projet, et
// cela évite qu'un aperçu change d'octets à chaque exécution sans que rien n'ait bougé.

import { creerAleatoire } from "../core/hasard";

/** La plus grande valeur d'un entier 16 bits signé. */
export const PLEINE_ECHELLE_16 = 32767;

export interface OptionsQuantification {
  /** Ajouter le bruit de dither avant l'arrondi. Défaut : vrai. */
  dither?: boolean;
  /** Graine du bruit. Même graine, mêmes octets. */
  graine?: number;
}

/**
 * Un quantificateur 16 bits : arrondi, dither, et bornes.
 *
 * Rendu comme une FERMETURE parce que le bruit a une mémoire — son générateur avance d'un tirage
 * à l'autre. Un quantificateur par fichier, et la boucle d'écriture ne change pas de forme.
 *
 * L'ÉCHELLE EST SYMÉTRIQUE, à 32767 des deux côtés. L'astuce courante — multiplier les négatifs
 * par 32768 pour gagner le dernier code — rend une onde symétrique asymétrique, donc ajoute des
 * harmoniques paires à ce qu'on vient précisément de nettoyer. Le code −32768 reste atteignable
 * par la borne, il n'est simplement pas fabriqué par l'échelle.
 */
export function creerQuantificateur16(o: OptionsQuantification = {}): (echantillon: number) => number {
  const avecDither = o.dither !== false;
  const alea = creerAleatoire(o.graine ?? 20260921);
  return (echantillon: number) => {
    const x = Number.isFinite(echantillon) ? echantillon : 0;
    // Deux tirages uniformes soustraits : densité triangulaire sur ±1 LSB.
    const bruit = avecDither ? alea() - alea() : 0;
    // ARRONDI SYMÉTRIQUE, à l'écart de zéro sur les demis. `Math.round` tranche les égalités vers
    // +l'infini : 16383,5 rendait 16384 et −16383,5 rendait −16383, si bien qu'une onde
    // parfaitement symétrique ressortait décalée d'un LSB d'un côté. Un test l'a attrapé.
    const echelle = x * PLEINE_ECHELLE_16 + bruit;
    const v = Math.sign(echelle) * Math.round(Math.abs(echelle));
    return Math.max(-32768, Math.min(PLEINE_ECHELLE_16, v));
  };
}

/**
 * L'erreur de quantification d'un signal, en LSB — l'outil de mesure des tests.
 *
 * C'est elle qu'il faut regarder, et non le signal quantifié : tout l'enjeu du dither est que
 * cette erreur cesse de ressembler au signal.
 */
export function erreurQuantification(
  signal: Float32Array, o: OptionsQuantification = {},
): Float32Array {
  const quantifier = creerQuantificateur16(o);
  return Float32Array.from(signal, (x) => quantifier(x) - x * PLEINE_ECHELLE_16);
}
