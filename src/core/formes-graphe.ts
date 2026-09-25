// core/formes-graphe.ts — Les deux formes d'un même graphe, et pourquoi on ne les confond pas.
//
// POURQUOI CE FICHIER EXISTE, et c'est une faute de ma part qu'il répare. Deux fois de suite, en
// discutant de ce que la documentation doit dire d'un sous-graphe, j'ai pris une forme pour l'autre :
// j'ai écrit « documenter ce qui est visible » là où la règle est « documenter ce qui calcule », puis
// l'inverse. Les deux formes sont des `{ noeuds, aretes }` : rien, dans le code, ne m'aurait arrêté.
//
// LES DEUX FORMES SONT OPPOSÉES, et c'est tout ce qu'il faut retenir :
//
//   CE QU'ON VOIT           `GrapheVisible` — les conteneurs sont LÀ, et le contenu de ceux qui sont
//                           repliés n'y est PAS. C'est la forme du canevas, et d'elle seule.
//
//   CE QUI CALCULE          `GrapheSansConteneurs` — les conteneurs n'y sont PAS, leur contenu y est,
//                           jusqu'au fond. C'est la forme de la documentation, et d'elle seule.
//
// CE QUI EMPÊCHE DE LES ÉCHANGER : elles ne sont pas le même type. Chacune porte un champ `forme`
// qui la nomme, si bien qu'un `{ noeuds, aretes }` ordinaire n'en satisfait aucune et qu'une fonction
// qui demande l'une refuse l'autre à la compilation. Ce n'est plus une consigne d'en-tête, c'est le
// compilateur. Les construire passe par les fabriques d'ici, nulle part ailleurs.
//
// NI L'UNE NI L'AUTRE N'EST LA FORME EXÉCUTÉE. Le moteur va plus loin : il recopie les nœuds d'une
// boucle une fois par tour et ceux d'un instrument une fois par note. Personne ne reconnaîtrait son
// graphe dans ces copies numérotées, et c'est pourquoi la documentation s'arrête au dépliage des
// conteneurs. Voir `core/boucle-graphe.ts` et `core/instrument-graphe.ts`.

import { aplatirGraphe, type AreteG, type MetaComposant, type NoeudG } from "./meta";

/**
 * CE QU'ON VOIT sur le canevas : les conteneurs, et le contenu de ceux qui sont ouverts.
 *
 * ATTENTION AU PIÈGE DE `hidden`. Le réalisateur de démonstration s'en sert pour faire apparaître
 * les nœuds un à un (`ui/demo/useRealisateurDemo.tsx`) : un nœud caché n'est donc pas forcément le
 * membre d'un conteneur replié. La source de vérité est l'appartenance et l'état de repli, jamais
 * `hidden`, qui n'en est que la conséquence à l'affichage.
 *
 * SA FABRIQUE ARRIVE AVEC LES CONTENEURS DE PROJET, et son absence ici est volontaire : il n'y a
 * aujourd'hui rien à replier, et une fabrique sans repli serait l'identité, donc un test qui ne peut
 * pas échouer. Le type, lui, est déclaré dès maintenant pour que le vocabulaire existe avant son
 * premier emploi, et que la forme opposée ne puisse pas se glisser à sa place.
 */
export interface GrapheVisible {
  readonly forme: "visible";
  noeuds: NoeudG[];
  aretes: AreteG[];
}

/** CE QUI CALCULE : aucun conteneur, leur contenu à leur place, jusqu'au fond. */
export interface GrapheSansConteneurs {
  readonly forme: "sans-conteneurs";
  noeuds: NoeudG[];
  aretes: AreteG[];
  /**
   * Les conteneurs retirés, avec les arêtes qui les touchaient.
   *
   * DEUX CAS S'Y TROUVENT. Le conteneur purement visuel, qui n'a rien à déplier puisque son contenu
   * est déjà dans le graphe. Et celui qui se contient lui-même : l'aplatissement s'arrête alors sur
   * sa garde de boucle et le laisse en place, or le garder trahirait la règle.
   *
   * CE QUI N'Y EST PAS : un nœud dont la définition a disparu. Le cœur ne peut pas savoir qu'un
   * identifiant inconnu désignait un conteneur, et le deviner par son préfixe serait le substitut que
   * ce dépôt regrette ailleurs. Ce nœud reste donc, et le documenteur le signale comme composant
   * INCONNU, ce qui est la vérité.
   */
  conteneursRetires: string[];
}

/**
 * La forme que documente : les méta-composants dépliés, les autres conteneurs retirés.
 *
 * `estConteneur` nomme ce qui, en plus des méta-composants, n'a pas à figurer : les conteneurs
 * purement visuels, qui ne se déplient pas puisque leur contenu est déjà dans le graphe. Le cœur ne
 * connaît aucun identifiant de domaine, l'appelant le lui dit.
 */
export function grapheSansConteneurs(
  noeuds: readonly NoeudG[],
  aretes: readonly AreteG[],
  getMeta: (ficheId: string) => MetaComposant | undefined,
  estConteneur: (ficheId: string) => boolean = () => false,
): GrapheSansConteneurs {
  const plat = aplatirGraphe([...noeuds], [...aretes], getMeta);
  const aRetirer = new Set<string>();
  for (const n of plat.noeuds) {
    // Un méta encore là malgré l'aplatissement se contient lui-même : la garde de boucle a arrêté
    // son expansion. Un conteneur visuel, lui, n'avait rien à déplier.
    if (getMeta(n.data.ficheId) || estConteneur(n.data.ficheId)) aRetirer.add(n.id);
  }
  if (aRetirer.size === 0) {
    return { forme: "sans-conteneurs", noeuds: plat.noeuds, aretes: plat.aretes, conteneursRetires: [] };
  }
  return {
    forme: "sans-conteneurs",
    noeuds: plat.noeuds.filter((n) => !aRetirer.has(n.id)),
    aretes: plat.aretes.filter((a) => !aRetirer.has(a.source) && !aRetirer.has(a.target)),
    conteneursRetires: [...aRetirer],
  };
}
