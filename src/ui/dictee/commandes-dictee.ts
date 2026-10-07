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

/**
 * Les mots qui PORTENT une consigne sans rien désigner : verbes de pose, articles, prépositions,
 * noms de la scène, politesse.
 *
 * POURQUOI ILS SONT DANS LA GRAMMAIRE, et c'est la mesure qui l'a imposé. Un vocabulaire fermé aux
 * seuls noms de composants ne peut rendre que des noms de composants : les mots de liaison d'une
 * phrase ordinaire, n'y figurant pas, sont FABRIQUÉS avec ce que la liste contient. Relevé sur
 * quatre phrases dictées, avant de les ajouter :
 *
 *   « s'il te plaît »   rendu « styles delay »
 *   « que tu poses »    rendu « gel de tempo »
 *   « canevas merci »   rendu « gamme inversée », qui posait un composant que personne n'a demandé
 *   « après »           rendu « entrée »
 *
 * C'est là qu'était le défaut constaté, « plusieurs composants se chargent à l'énoncé d'un seul » :
 * le moteur ne pouvait pas dire autre chose. Une fois ces mots dans la grammaire, les deux phrases
 * du milieu se transcrivent exactement, et la troisième ne pose plus rien.
 *
 * ET ILS SONT ÉCARTÉS À LA LECTURE, non pas ignorés : le découpage les reconnaît pour ce qu'ils
 * sont, de sorte qu'ils ne puissent pas non plus être rapprochés d'un nom par ressemblance.
 */
export const MOTS_PORTEURS: Record<"fr" | "en", string[]> = {
  fr: [
    "pose", "poses", "poser", "ajoute", "ajoutes", "ajouter", "mets", "met", "mettre",
    "place", "places", "placer", "crée", "créer", "veux", "voudrais", "faut",
    "un", "une", "le", "la", "les", "de", "du", "des", "au", "aux", "ce", "cette",
    "sur", "dans", "après", "avant", "puis", "ensuite", "et", "en", "à", "avec",
    "composant", "composants", "bloc", "blocs", "nœud", "noeud", "palette", "canevas", "graphe",
    "je", "tu", "que", "qu", "il", "te", "s'il", "plaît", "plait", "merci", "stp", "aussi",
  ],
  en: [
    "put", "place", "add", "create", "make", "want", "would", "like", "need",
    "a", "an", "the", "of", "this", "that",
    "on", "in", "after", "before", "then", "and", "to", "with",
    "node", "nodes", "block", "blocks", "palette", "canvas", "graph",
    "i", "you", "please", "thanks", "also",
  ],
};

/**
 * Les mots porteurs d'une langue, moins ceux qu'un composant porte déjà pour nom.
 *
 * UN NOM DE COMPOSANT NE PEUT PAS ÊTRE UN MOT DE PORTAGE, sans quoi on ne pourrait plus le dire.
 * Le catalogue livré n'en porte aucun des deux listes ci-dessus, mais il grandit : la soustraction
 * est faite à chaque appel plutôt que vérifiée une fois.
 */
export function porteursSurs(noms: readonly NomDicte[], langue: "fr" | "en"): string[] {
  const pris = new Set(noms.map((n) => n.nom.toLowerCase()));
  return MOTS_PORTEURS[langue].filter((m) => !pris.has(m));
}

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
  return [...new Set([
    ...noms.map((n) => n.nom),
    ...motsDeCommande(langue),
    ...porteursSurs(noms, langue),
  ])];
}

type Jeton =
  | { sorte: "composant"; ficheId: string; nom: string; longueur: number }
  | { sorte: "commande"; geste: string; longueur: number }
  | { sorte: "porteur"; mot: string; longueur: number }
  | { sorte: "inconnu"; mot: string; longueur: number };

/**
 * Ce qui sait reconnaître un nom que la reconnaissance a écorché, pour un passage donné.
 *
 * IL EST INJECTÉ, ET CE N'EST PAS UNE COQUETTERIE. L'appariement par ressemblance vit dans le
 * domaine, et ce module n'en connaît rien : lui faire importer `plugins/appariement-flou` ferait
 * entrer la dictée entière dans la liste des couplages assumés de `frontiere-domaine.test.ts`,
 * alors que seule sa prise au micro en relève. C'est la forme qu'`audio/abc-edition-llm.ts` donne
 * déjà à son appel de modèle, et pour la même raison : ce qui se teste sans le domaine se code
 * sans lui.
 */
export type ApparieurFlou = (fenetre: string) => { ficheId: string; score: number } | null;

/**
 * Découpe une dictée en jetons, par la PLUS LONGUE correspondance à chaque position.
 *
 * LA PLUS LONGUE, ET NON LA PREMIÈRE : « réverbération à convolution » est un composant, et
 * s'arrêter sur « réverbération » en laisserait désigner un autre, puis prendrait « à » pour un mot
 * de liaison. La position compte aussi, et c'est ce qu'une recherche de sous-chaîne sur toute la
 * phrase ne donne pas : « relier X à Y » demande de savoir lequel des deux noms est de quel côté.
 */
export function segmenter(
  texte: string, noms: readonly NomDicte[], langue: "fr" | "en", flou?: ApparieurFlou,
): Jeton[] {
  const mots = texte.toLowerCase().split(/\s+/).filter(Boolean);
  const gestes = MOTS_COMMANDE[langue];
  const estCommande = (m: string) => Object.values(gestes).some((l) => l.includes(m));
  const porteurs = new Set(porteursSurs(noms, langue));
  // Une fenêtre de ressemblance s'arrête sur l'un comme sur l'autre : ni le geste ni le portage ne
  // doivent se retrouver avalés dans un nom de composant.
  const bloquant = (m: string) => estCommande(m) || porteurs.has(m);
  // Les noms du plus long au plus court : à position égale, le plus long gagne.
  const tries = [...noms].map((n) => ({ ...n, mots: n.nom.split(/\s+/) }))
    .sort((a, b) => b.mots.length - a.mots.length);
  const parId = new Map(noms.map((n) => [n.ficheId, n.nom]));
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
    // LES MOTS DE PORTAGE PASSENT AVANT LA RESSEMBLANCE, et c'est ce qui les protège : rapprocher
    // « merci » ou « canevas » d'un nom de composant par ressemblance reviendrait à poser ce que la
    // politesse fait dire.
    if (porteurs.has(mots[i])) {
      out.push({ sorte: "porteur", mot: mots[i], longueur: 1 });
      i += 1;
      continue;
    }
    // LA RESSEMBLANCE NE PASSE QU'EN DERNIER, et jamais par-dessus un mot de commande. Elle ne
    // rattrape que ce que l'exact a laissé tomber ; la laisser juger avant ferait d'« annuler » un
    // nom de composant, et le geste d'annulation deviendrait impossible à dire.
    const approchant = flou ? meilleurApprochant(mots, i, flou, bloquant) : null;
    if (approchant) {
      out.push({
        sorte: "composant", ficheId: approchant.ficheId,
        nom: parId.get(approchant.ficheId) ?? approchant.ficheId, longueur: approchant.longueur,
      });
      i += approchant.longueur;
      continue;
    }
    out.push({ sorte: "inconnu", mot: mots[i], longueur: 1 });
    i += 1;
  }
  return out;
}

/**
 * Le composant que les mots suivants désignent le mieux, sur une à quatre places.
 *
 * LA FENÊTRE S'ARRÊTE AU PREMIER MOT DE COMMANDE : « réverbération annuler » ne doit pas devenir un
 * nom de composant de deux mots, sans quoi l'annulation serait avalée par ce qu'elle annule.
 */
function meilleurApprochant(
  mots: string[], depart: number, flou: ApparieurFlou, estCommande: (m: string) => boolean,
): { ficheId: string; longueur: number } | null {
  let meilleur: { ficheId: string; longueur: number; score: number } | null = null;
  for (let longueur = 1; longueur <= 4 && depart + longueur <= mots.length; longueur++) {
    if (longueur > 1 && estCommande(mots[depart + longueur - 1])) break;
    const r = flou(mots.slice(depart, depart + longueur).join(" "));
    if (r && (!meilleur || r.score > meilleur.score)) {
      meilleur = { ficheId: r.ficheId, longueur, score: r.score };
    }
  }
  return meilleur ? { ficheId: meilleur.ficheId, longueur: meilleur.longueur } : null;
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
  texte: string, noms: readonly NomDicte[], langue: "fr" | "en", flou?: ApparieurFlou,
): Commande[] {
  const jetons = segmenter(texte, noms, langue, flou);
  const out: Commande[] = [];
  let parallele = false;
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i];
    // Un mot de portage a fait son office en étant reconnu : il ne demande rien.
    if (j.sorte === "porteur") continue;
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
