// ui/dictee/commandes-dictee.ts — Ce qu'une dictée demande au canevas.
//
// POURQUOI UNE LANGUE DE COMMANDES, et non une phrase. Un composant de dictée transcrivait une
// consigne entière, puis « Prompt → graphe » en tirait un graphe : il fallait bâtir quatre nœuds
// pour dire une phrase, et la dictée seule ne posait rien. Parler est un GESTE D'ÉDITION, comme
// tirer un nœud depuis la palette ; ce module traduit donc la parole en gestes, un par un.
//
// LE LIEN NE SE DIT PRESQUE JAMAIS, et c'est ce qui rend la chose praticable. Nommer un composant
// le pose ET le branche sur le composant courant, qui devient à son tour le courant : « réverbération »
// puis « compresseur » puis « sortie audio » construit la chaîne sans un seul mot de liaison. Le
// courant étant la sélection du canevas, on peut cliquer sur un nœud existant et reprendre à la voix
// depuis lui.
//
// POUR LE RESTE, IL FAUT DES MOTS, et ils sont peu nombreux : relier deux composants déjà posés, en
// poser un sans l'enchaîner, défaire, et s'arrêter.
//
// LA RECONNAISSANCE EST À VOCABULAIRE FERMÉ, et c'est ce qui rend ces mots sûrs. Mesuré sur une
// phrase dite : la liste des noms de composants rend le texte exact en 1,79 s quand le vocabulaire
// entier du modèle met 3,37 s. Son défaut connu est de recomposer un faux nom à partir de mots de
// la liste ; ici chaque mot pose un nœud, donc l'erreur se voit à l'instant où elle est faite, et
// « annuler » la retire.

/** Un composant tel que la dictée peut le nommer. */
export interface NomDicte {
  ficheId: string;
  /** Le nom en minuscules, accents gardés, tel que le moteur le rend. */
  nom: string;
}

export type Commande =
  /** Poser un composant. Enchaîné sur le courant, sauf si « en parallèle » vient de se dire. */
  | { quoi: "poser"; ficheId: string; nom: string; parallele: boolean }
  /** Relier deux composants DÉJÀ posés, nommés par leur fiche. */
  | { quoi: "relier"; de: string; vers: string }
  | { quoi: "annuler" }
  | { quoi: "terminer" }
  /** Un passage que le moteur n'a pas compris, gardé pour qu'on puisse le dire. */
  | { quoi: "inconnu"; mot: string };

/**
 * Les mots de commande, par langue.
 *
 * ILS SONT PLUSIEURS PAR GESTE parce qu'on ne dit pas deux fois la même chose : « relier »,
 * « brancher » et « connecter » désignent le même geste, et imposer un seul des trois ferait buter
 * sur un mot qu'on vient pourtant de prononcer clairement.
 */
export const MOTS_COMMANDE: Record<"fr" | "en", Record<string, string[]>> = {
  fr: {
    relier: ["relier", "brancher", "connecter"],
    vers: ["à", "a", "sur", "vers", "au"],
    parallele: ["parallèle", "parallele"],
    annuler: ["annuler", "annule", "retour"],
    terminer: ["terminé", "termine", "fin", "stop"],
  },
  en: {
    relier: ["link", "connect", "wire"],
    vers: ["to", "into", "onto"],
    parallele: ["parallel"],
    annuler: ["undo", "cancel", "back"],
    terminer: ["done", "finished", "stop"],
  },
};

/** Le jeton d'inconnu que le moteur rend là où il n'a reconnu aucun mot de la liste. */
export const JETON_INCONNU = "[unk]";

/** Les mots qu'une grammaire de reconnaissance doit porter, en plus des noms de composants. */
export function motsDeCommande(langue: "fr" | "en"): string[] {
  return [...new Set(Object.values(MOTS_COMMANDE[langue]).flat())];
}

/**
 * La grammaire complète : les noms des composants, et les mots de commande.
 *
 * Les deux listes sont jointes, le moteur n'ayant qu'un vocabulaire. Un nom qui serait aussi un mot
 * de commande ne paraît qu'une fois.
 */
export function grammaireDeDictee(noms: readonly NomDicte[], langue: "fr" | "en"): string[] {
  return [...new Set([...noms.map((n) => n.nom), ...motsDeCommande(langue)])];
}

type Jeton =
  | { sorte: "composant"; ficheId: string; nom: string; longueur: number }
  | { sorte: "commande"; geste: string; longueur: number }
  | { sorte: "inconnu"; mot: string; longueur: number };

/**
 * Découpe une dictée en jetons, par la PLUS LONGUE correspondance à chaque position.
 *
 * LA PLUS LONGUE, ET NON LA PREMIÈRE : « réverbération à convolution » est un composant, et
 * s'arrêter sur « réverbération » en laisserait désigner un autre, puis prendrait « à » pour un mot
 * de liaison. La position compte aussi, et c'est ce qu'une recherche de sous-chaîne sur toute la
 * phrase ne donne pas : « relier X à Y » demande de savoir lequel des deux noms est de quel côté.
 */
export function segmenter(
  texte: string, noms: readonly NomDicte[], langue: "fr" | "en",
): Jeton[] {
  const mots = texte.toLowerCase().split(/\s+/).filter(Boolean);
  const gestes = MOTS_COMMANDE[langue];
  // Les noms du plus long au plus court : à position égale, le plus long gagne.
  const tries = [...noms].map((n) => ({ ...n, mots: n.nom.split(/\s+/) }))
    .sort((a, b) => b.mots.length - a.mots.length);
  const out: Jeton[] = [];
  let i = 0;
  while (i < mots.length) {
    const composant = tries.find((n) =>
      n.mots.every((m, k) => mots[i + k] === m));
    if (composant) {
      out.push({ sorte: "composant", ficheId: composant.ficheId, nom: composant.nom, longueur: composant.mots.length });
      i += composant.mots.length;
      continue;
    }
    const geste = Object.keys(gestes).find((g) => gestes[g].includes(mots[i]));
    if (geste) {
      out.push({ sorte: "commande", geste, longueur: 1 });
      i += 1;
      continue;
    }
    out.push({ sorte: "inconnu", mot: mots[i], longueur: 1 });
    i += 1;
  }
  return out;
}

/**
 * Les gestes qu'une dictée demande.
 *
 * « EN PARALLÈLE » PORTE SUR LE COMPOSANT QUI SUIT, et sur lui seul : c'est une parenthèse, non un
 * mode. Dit sans qu'aucun composant ne suive, il ne fait rien, ce qui vaut mieux que de rester armé
 * pour la phrase d'après.
 *
 * « RELIER » N'A DE SENS QU'AVEC DEUX NOMS, et il les prend tels qu'ils viennent, le mot de liaison
 * étant facultatif : le moteur l'avale souvent. S'il n'en trouve qu'un, rien n'est demandé plutôt
 * qu'un lien à moitié désigné.
 */
export function interpreterDictee(
  texte: string, noms: readonly NomDicte[], langue: "fr" | "en",
): Commande[] {
  const jetons = segmenter(texte, noms, langue);
  const out: Commande[] = [];
  let parallele = false;
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i];
    if (j.sorte === "inconnu") {
      if (j.mot === JETON_INCONNU) out.push({ quoi: "inconnu", mot: j.mot });
      continue;
    }
    if (j.sorte === "composant") {
      out.push({ quoi: "poser", ficheId: j.ficheId, nom: j.nom, parallele });
      parallele = false;
      continue;
    }
    if (j.geste === "parallele") { parallele = true; continue; }
    if (j.geste === "annuler") { out.push({ quoi: "annuler" }); continue; }
    if (j.geste === "terminer") { out.push({ quoi: "terminer" }); continue; }
    if (j.geste === "relier") {
      const suite = jetons.slice(i + 1).filter((x) => x.sorte === "composant");
      if (suite.length >= 2) {
        out.push({ quoi: "relier", de: suite[0].ficheId, vers: suite[1].ficheId });
      }
      // LES NOMS QUI SUIVENT SONT CONSOMMÉS DANS LES DEUX CAS. Avec deux noms, ils forment le lien
      // et ne posent rien, puisqu'ils désignent des composants déjà là. Avec un seul, la phrase est
      // tronquée, et le poser serait faire autre chose que ce qui a été demandé : on ne fait rien.
      let restants = Math.min(2, suite.length);
      let k = i + 1;
      while (k < jetons.length && restants > 0) {
        if (jetons[k].sorte === "composant") restants--;
        k++;
      }
      i = k - 1;
      continue;
    }
  }
  return out;
}
