// ui/niveau-ecoute.ts — À quel niveau un composant se fait entendre.
//
// UN LECTEUR DE COMPOSANT NE S'OUVRE JAMAIS À PLEINE PUISSANCE, et c'est une règle du dépôt, rappelée
// par Fabien. Un graphe se parcourt en lançant l'écoute d'un nœud après l'autre, souvent au casque,
// et sur des sons dont le niveau n'est pas connu d'avance : un rendu peut sortir à pleine échelle
// comme vingt décibels plus bas. Ouvrir à fond fait sursauter une fois sur deux, et c'est la personne
// qui écoute qui s'ajuste ensuite, jamais l'inverse.
//
// POURQUOI CETTE VALEUR EST ICI, ET NON RECOPIÉE. Elle l'était : sept fois, en clair, dans six
// fichiers de vue, sans nom et sans rien qui la tienne. C'est exactement pour cela que la ligne de
// temps du Montage y a échappé en apportant sa propre écoute — il n'y avait mécaniquement rien à quoi
// échapper. Nommée une fois et éprouvée par `niveau-ecoute.test.ts`, elle vaut pour tout lecteur,
// qu'il soit un élément audio ou un graphe Web Audio monté en direct.
//
// CE N'EST PAS UN RÉGLAGE DU SON, mais du confort d'écoute : le niveau du fichier produit ne bouge
// pas d'un décibel, et les commandes du lecteur restent à la disposition de qui écoute.

/**
 * Le niveau auquel un lecteur de composant s'ouvre, en gain linéaire.
 *
 * Trois dixièmes, soit environ dix décibels et demi sous la pleine échelle.
 */
export const NIVEAU_ECOUTE = 0.3;

/**
 * À poser sur `onLoadedMetadata` de tout élément audio d'un composant.
 *
 * Le niveau se pose à ce moment-là et non à la construction : un élément audio ne retient pas un
 * volume écrit avant qu'il ait sa source, et l'écoute repartirait à fond au premier son chargé.
 */
export function ouvrirAuNiveauDEcoute(e: { currentTarget: HTMLAudioElement | HTMLVideoElement }): void {
  e.currentTarget.volume = NIVEAU_ECOUTE;
}

/**
 * Joue un tampon déjà rendu, au niveau d'écoute, et rend la source pour pouvoir l'arrêter.
 *
 * POURQUOI CE SECOND POINT D'ENTRÉE. Un bouton « Rejouer » ne passe par aucun élément audio : il
 * monte un graphe Web Audio, trois lignes, et branche sa source sur la destination. Les deux cas qui
 * tenaient la règle ne regardaient que les balises `<audio>` et la lecture vive du Montage, si bien
 * que TROIS boutons « Rejouer » y échappaient, un par clavier jouable, chacun ouvrant à la pleine
 * puissance de son rendu.
 *
 * ET CE N'EST PAS LE NIVEAU DU SON RENDU QUI CHANGE : celui-là reste ce que le réglage « Volume » du
 * nœud en a fait, et le fichier produit ne bouge pas d'un décibel. Ce gain-ci est le confort
 * d'écoute, posé par-dessus, comme le `volume` d'un élément audio l'est par-dessus un fichier.
 */
export function ecouterTampon(ctx: BaseAudioContext, tampon: AudioBuffer): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = tampon;
  const gain = ctx.createGain();
  gain.gain.value = NIVEAU_ECOUTE;
  source.connect(gain).connect(ctx.destination);
  source.start();
  return source;
}
