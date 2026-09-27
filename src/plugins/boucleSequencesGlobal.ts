// plugins/boucleSequencesGlobal.ts — L'état ambiant d'une boucle qui itère sur une VALEUR.
//
// CE QUE CELLE-CI AJOUTE AUX TROIS AUTRES. Attic répétait déjà de trois façons : la boucle de
// graphe et l'instrument recopient la chaîne avant l'exécution, la boucle de collection rejoue le
// graphe une fois par fichier. Les trois ont en commun de connaître leur compte AVANT d'exécuter
// quoi que ce soit : un paramètre pour les deux premières, un dossier lu pour la troisième. Aucune
// ne sait itérer sur ce qui arrive par un câble, dont le compte ne se connaît qu'une fois l'amont
// exécuté. C'est ce que `COMPOSITION-ASSISTEE.md` désignait derrière les fonctions d'ordre
// supérieur et la seconde moitié de la maquette : la même difficulté sous deux noms.
//
// LA PREMIÈRE PASSE DÉCOUVRE, LES SUIVANTES RÉPÈTENT. Le pilote lance une passe sans savoir combien
// il en faudra ; le nœud de début, en s'exécutant, lit son entrée, en tire les morceaux et les
// publie ici. Le pilote lit alors le compte et poursuit. C'est la seule façon de connaître une
// valeur sans exécuter ce qui la produit, et elle ne coûte rien : la passe de découverte est la
// première passe utile, non une passe de plus.
//
// POURQUOI DES PASSES ET NON UN DÉPLIAGE, la raison est celle de la boucle de collection : déplier
// demanderait de connaître le compte d'avance, ce qui est précisément ce qui manque.
//
// LE MOTIF DE L'ÉTAT AMBIANT EST CELUI DU DÉPÔT, déjà en place dans `lotGlobal.ts`,
// `grapheGlobal.ts` et `soundfontGlobal.ts` : le contrat d'exécution donne à un nœud ses entrées et
// ses paramètres, rien d'autre. Un nœud qui a besoin de savoir à quelle passe il en est lit un
// module à part, que l'interface pose avant chaque passe.

import type { Sequence } from "../audio/sequence";

export const FICHE_BOUCLE_DEBUT = "boucle-voix-debut";
export const FICHE_BOUCLE_FIN = "boucle-voix-fin";
export const FICHE_CRENEAU_DEBUT = "boucle-creneau-debut";
export const FICHE_CRENEAU_FIN = "boucle-creneau-fin";
export const FICHE_CERCLE_DEBUT = "cercle-boucle-debut";
export const FICHE_CERCLE_FIN = "cercle-boucle-fin";

/**
 * Les nœuds qui ouvrent une boucle sur une valeur.
 *
 * LE PILOTE N'A PAS À LES CONNAÎTRE UN PAR UN. Ce qui fait une boucle n'est pas ce sur quoi elle
 * itère, c'est qu'elle découvre son compte en s'exécutant : voix, créneaux ou ce qu'on voudra, le
 * pilote lance une passe et regarde. Un début de boucle qui découperait par mesure ou par accord
 * s'ajoute ici, et rien d'autre ne bouge.
 */
export const FICHES_BOUCLE_DEBUT: readonly string[] =
  [FICHE_BOUCLE_DEBUT, FICHE_CRENEAU_DEBUT, FICHE_CERCLE_DEBUT];

export interface BoucleCourante {
  /** Le nœud de début qui commande cette boucle, pour invalider son cache à chaque passe. */
  debutId: string;
  /** Les nœuds qui la referment. */
  finsIds: string[];
  /** La passe en cours, à partir de zéro. */
  index: number;
  /**
   * Les morceaux à parcourir, publiés par le nœud de début à sa première passe.
   *
   * Vides tant que la découverte n'a pas eu lieu : le pilote lance alors une passe et regarde.
   *
   * LE TYPE EST OUVERT PARCE QUE LE PILOTE N'EN LIT QUE LA LONGUEUR. Ce sur quoi une boucle itère
   * ne le regarde pas : des voix et des créneaux sont des séquences, une boucle de transformation
   * parcourt des cercles. Chaque sorte de boucle relit ses morceaux avec son propre accesseur, et
   * c'est là que le type revient.
   */
  morceaux: unknown[];
  /** Ce que la fin de boucle a recueilli, une entrée par passe. */
  recoltes: unknown[];
}

/**
 * Les boucles en cours, de la plus extérieure à la plus intérieure.
 *
 * UNE PILE ET NON UNE SEULE BOUCLE, pour qu'elles s'emboîtent. Une boîte de maquette qui contient
 * une polyphonie demande deux boucles l'une dans l'autre : pour chaque créneau, pour chaque voix.
 * Le graphe s'exécutant d'un bloc, une passe correspond à UNE combinaison d'index, et le pilote les
 * énumère comme un compteur dont le chiffre des unités est la boucle la plus intérieure.
 *
 * CHAQUE NŒUD RETROUVE LA SIENNE PAR SON IDENTIFIANT, non par la position dans la pile : deux
 * boucles de même sorte ne se distingueraient pas autrement, et le début comme la fin doivent
 * pouvoir lire leur propre état.
 */
let pile: BoucleCourante[] = [];

/** Posée par l'interface avant chaque passe, et vidée quand les boucles sont finies. */
export function publierBoucles(boucles: readonly BoucleCourante[]): void {
  pile = [...boucles];
}

/** Compatible avec l'ancien appel : une seule boucle, ou aucune. */
export function publierBoucle(b: BoucleCourante | null): void {
  pile = b ? [b] : [];
}

/** Toutes les boucles en cours, de la plus extérieure à la plus intérieure. */
export function boucles(): readonly BoucleCourante[] {
  return pile;
}

/** La boucle la plus intérieure, ou null. Ce que lisait l'ancien appel. */
export function boucleCourante(): BoucleCourante | null {
  return pile.length > 0 ? pile[pile.length - 1] : null;
}

/** La boucle que commande ce nœud de début, ou null. */
export function boucleDuDebut(debutId: string): BoucleCourante | null {
  return pile.find((b) => b.debutId === debutId) ?? null;
}

/** La boucle que referme ce nœud de fin, ou null. */
export function boucleDeLaFin(finId: string): BoucleCourante | null {
  return pile.find((b) => b.finsIds.includes(finId)) ?? null;
}

/**
 * Inscrit les morceaux découverts par un début, si ce n'est pas déjà fait.
 *
 * LA DÉCOUVERTE N'A LIEU QU'UNE FOIS PAR TOUR DE LA BOUCLE QUI L'ENTOURE. Dans une boucle seule,
 * c'est une fois pour toutes : l'entrée ne change pas d'une passe à l'autre, et la réinscrire
 * ferait varier le compte en cours de route. Emboîtée, c'est autre chose : quand le créneau change,
 * les voix qu'il porte changent aussi, et la boucle intérieure doit redécouvrir. Le pilote efface
 * donc les morceaux des boucles intérieures quand il fait avancer une boucle extérieure.
 */
export function decouvrirPour(debutId: string, morceaux: readonly unknown[]): void {
  const b = boucleDuDebut(debutId);
  if (b && b.morceaux.length === 0) b.morceaux = [...morceaux];
}

/** Compatible avec l'ancien appel : la boucle la plus intérieure. */
export function decouvrir(morceaux: readonly Sequence[]): void {
  const b = boucleCourante();
  if (b && b.morceaux.length === 0) b.morceaux = [...morceaux];
}

/** Le morceau de la passe en cours, pour ce début. Les boucles sur séquence relisent ainsi. */
export function morceauPour(debutId: string): Sequence | null {
  const b = boucleDuDebut(debutId);
  return b ? ((b.morceaux[b.index] as Sequence | undefined) ?? null) : null;
}

/** Compatible avec l'ancien appel : la boucle la plus intérieure. */
export function morceauCourant(): Sequence | null {
  const b = boucleCourante();
  return b ? ((b.morceaux[b.index] as Sequence | undefined) ?? null) : null;
}

/** La fin de boucle dépose ce que la passe a produit, dans SA boucle. */
export function recolterPour(finId: string, valeur: unknown): void {
  const b = boucleDeLaFin(finId);
  if (b) b.recoltes[b.index] = valeur;
}

/** Compatible avec l'ancien appel : la boucle la plus intérieure. */
export function recolter(sequence: Sequence): void {
  const courante = boucleCourante();
  if (courante) courante.recoltes[courante.index] = sequence;
}

/**
 * Ce que la fin a recueilli à la passe PRÉCÉDENTE, pour ce début.
 *
 * C'EST LA RÉTROACTION, ET ELLE NE PASSE PAS PAR UNE ARÊTE. Une boucle qui transforme veut donner à
 * la passe k ce que la passe k−1 a produit : trois rotations d'une place sont une rotation de trois,
 * mais trois permutations tirées sont autre chose que la troisième. Relier la fin au début fermerait
 * un cycle, et le graphe l'interdit à juste titre. Le début s'exécutant avant la fin dans une passe,
 * il lit ici ce que la fin a déposé au tour d'avant : le graphe reste acyclique, et la valeur
 * chemine par le même module ambiant que le reste de la boucle.
 *
 * RIEN À LA PREMIÈRE PASSE, et l'appelant y met sa source : c'est ce qui amorce la chaîne.
 */
export function recoltePrecedentePour(debutId: string): unknown {
  const b = boucleDuDebut(debutId);
  if (!b || b.index <= 0) return null;
  return b.recoltes[b.index - 1] ?? null;
}

/** Ce qu'une planification rend au pilote. */
export interface PlanBoucle {
  debutId: string;
  /**
   * Les fins de boucle du graphe, dont l'amont est le CORPS et doit rejouer à chaque passe.
   *
   * POURQUOI LA FIN ET PAS SEULEMENT LE DÉBUT. Le pilote invalidait le cache du début et de son
   * aval, ce qui suffit quand le corps lit le début. Une boucle par créneau n'y oblige pas : un
   * contenu qui ne consulte pas sa place n'est PAS un descendant du début, et le cache le gelait
   * alors, la boucle rendant trois fois la même passe. Relevé dans l'application, le début
   * annonçant « créneau 3/3 » quand la fin en était restée à « passe 1/3 ». Le corps se désigne
   * donc par l'autre bout : c'est ce qui alimente la fin.
   */
  finsIds: string[];
  /** Vrai quand plusieurs débuts se disputent le commandement. */
  plusieursDebuts: boolean;
}

export const FICHES_BOUCLE_FIN: readonly string[] =
  [FICHE_BOUCLE_FIN, FICHE_CRENEAU_FIN, FICHE_CERCLE_FIN];

/** Quelle fin referme quel début. Une boucle par créneau ne se referme pas par une fin de voix. */
const FIN_DE_DEBUT: Record<string, string> = {
  [FICHE_BOUCLE_DEBUT]: FICHE_BOUCLE_FIN,
  [FICHE_CRENEAU_DEBUT]: FICHE_CRENEAU_FIN,
  [FICHE_CERCLE_DEBUT]: FICHE_CERCLE_FIN,
};

/**
 * Cherche un début de boucle dans le graphe.
 *
 * ELLE NE DIT PAS COMBIEN DE PASSES, et c'est toute la différence avec la planification d'un lot :
 * le compte n'existe pas encore. Elle dit seulement qu'il y a une boucle à mener, ce qui suffit au
 * pilote pour lancer la première passe et regarder ce qu'elle a découvert.
 */
export function planifierBoucle(
  noeuds: readonly { id: string; data?: { ficheId?: string } }[],
): PlanBoucle | null {
  const debuts = noeuds.filter((n) => FICHES_BOUCLE_DEBUT.includes(n.data?.ficheId ?? ""));
  if (debuts.length === 0) return null;
  return {
    debutId: debuts[0].id,
    finsIds: noeuds.filter((n) => FICHES_BOUCLE_FIN.includes(n.data?.ficheId ?? "")).map((n) => n.id),
    plusieursDebuts: debuts.length > 1,
  };
}

/** Une boucle repérée dans le graphe, avec ce qui la referme. */
export interface BouclePlanifiee {
  debutId: string;
  finsIds: string[];
}

export interface PlanBoucles {
  /** Les boucles, de la plus extérieure à la plus intérieure. */
  boucles: BouclePlanifiee[];
  /**
   * Vrai quand deux boucles ne s'emboîtent pas, aucune ne contenant l'autre.
   *
   * CE CAS N'EST PAS SUPPORTABLE TEL QUEL, et il vaut mieux le dire. Le graphe s'exécutant d'un
   * bloc, une passe est une combinaison d'index : deux boucles indépendantes tourneraient l'une
   * DANS l'autre, chacune autant de fois que le produit, au lieu de tourner côte à côte. Le pilote
   * les mène donc emboîtées et le signale, plutôt que de rendre un résultat qu'on croirait juste.
   */
  independantes: boolean;
}

/**
 * Repère toutes les boucles et les ordonne de l'extérieure à l'intérieure.
 *
 * L'EMBOÎTEMENT SE LIT DANS LE GRAPHE, non dans un réglage : une boucle est dans une autre quand
 * son début descend du début de l'autre, ou quand sa fin alimente la fin de l'autre. Les deux
 * critères disent la même chose par les deux bouts, et le second rattrape le cas d'un contenu qui
 * ne consulte pas sa place, lequel ne descend d'aucun début.
 */
export function planifierBoucles(
  noeuds: readonly { id: string; data?: { ficheId?: string } }[],
  descendantsDe: (id: string) => readonly string[],
  ancetresDe: (id: string) => readonly string[],
): PlanBoucles | null {
  const debuts = noeuds.filter((n) => FICHES_BOUCLE_DEBUT.includes(n.data?.ficheId ?? ""));
  if (debuts.length === 0) return null;

  // CHAQUE DÉBUT PREND LES FINS DE SA SORTE, et c'est ce qui les distingue. Les prendre par l'aval
  // seul donnait à une boucle extérieure toutes les fins, y compris celle de la boucle intérieure,
  // et les deux se contenaient alors l'une l'autre : l'ordre en sortait au hasard, un comparateur
  // qui répond oui dans les deux sens ne triant rien.
  const brutes: BouclePlanifiee[] = debuts.map((d) => {
    const finDeSaSorte = FIN_DE_DEBUT[d.data?.ficheId ?? ""] ?? "";
    const siennes = noeuds.filter((n) => n.data?.ficheId === finDeSaSorte);
    const aval = new Set(descendantsDe(d.id));
    const enAval = siennes.filter((f) => aval.has(f.id)).map((f) => f.id);
    // Un contenu qui ne consulte pas sa place n'est branché à aucun début : à défaut d'aval, on
    // prend toutes les fins de la sorte.
    return { debutId: d.id, finsIds: enAval.length > 0 ? enAval : siennes.map((f) => f.id) };
  });

  /** a contient-elle b ? */
  const contient = (a: BouclePlanifiee, b: BouclePlanifiee): boolean => {
    if (descendantsDe(a.debutId).includes(b.debutId)) return true;
    return a.finsIds.some((fa) => b.finsIds.some((fb) => fb !== fa && ancetresDe(fa).includes(fb)));
  };

  let independantes = false;
  for (let i = 0; i < brutes.length; i++) {
    for (let j = i + 1; j < brutes.length; j++) {
      if (!contient(brutes[i], brutes[j]) && !contient(brutes[j], brutes[i])) independantes = true;
    }
  }

  const ordonnees = [...brutes].sort((a, b) => (contient(a, b) ? -1 : contient(b, a) ? 1 : 0));
  return { boucles: ordonnees, independantes };
}

/** Le nombre de passes qui restent après la découverte. Zéro quand rien n'a été découvert. */
export const passesRestantes = (b: BoucleCourante | null): number =>
  Math.max(0, (b?.morceaux.length ?? 0) - 1);

/**
 * Combien de tours au plus pour une boucle.
 *
 * LA BORNE EXISTE PARCE QUE LE COMPTE VIENT DES DONNÉES. Une boucle par voix fait un tour par voix,
 * une boucle par créneau un tour par créneau : ni l'un ni l'autre n'est écrit dans un réglage, et
 * un fichier mal formé pourrait en annoncer des milliers. Trente-deux est la borne que le dépliage
 * de boucle applique déjà à son propre compte de tours.
 */
export const PASSES_MAX_BOUCLE = 32;

/**
 * Et une borne sur le PRODUIT, qui n'est pas la même chose.
 *
 * Deux boucles de trente-deux emboîtées feraient mille vingt-quatre exécutions du graphe entier :
 * la borne par boucle ne suffit plus dès qu'elles s'emboîtent, et trois boucles la rendraient
 * dérisoire. Celle-ci porte sur le nombre total de passes, quelle que soit la profondeur.
 */
export const PASSES_MAX_TOTAL = 256;

/**
 * Fait avancer le compteur, la boucle la plus INTÉRIEURE d'abord, et dit s'il reste un tour.
 *
 * C'EST UN COMPTEUR KILOMÉTRIQUE, et il se termine pour la même raison qu'un compteur : chaque
 * appel augmente d'un cran le rang le plus à droite qui peut l'être, et remet à zéro tout ce qui
 * suit. Aucun rang ne dépasse `PASSES_MAX_BOUCLE`, donc le nombre d'états est fini, donc la suite
 * des appels s'arrête — elle rend `false` quand tous les rangs sont au bout.
 *
 * QUAND UNE BOUCLE EXTÉRIEURE AVANCE, CE QU'ELLE CONTIENT EST OUBLIÉ. Les voix d'un créneau ne sont
 * pas celles du suivant : une boucle intérieure doit redécouvrir ses morceaux, faute de quoi elle
 * rejouerait ceux du premier tour pendant toute la pièce. C'est ce qui permet aussi aux morceaux de
 * GRANDIR d'un tour à l'autre sans que la terminaison en souffre : la borne ne bouge pas.
 *
 * SORTI DU HOOK POUR ÊTRE ÉPROUVÉ. Une mécanique qui doit s'arrêter ne se vérifie pas à l'œil, et un
 * compteur enfermé dans un composant React n'est atteignable par aucun test de ce dépôt.
 */
export function avancerBoucles(etats: BoucleCourante[]): boolean {
  for (let k = etats.length - 1; k >= 0; k--) {
    const combien = Math.min(etats[k].morceaux.length, PASSES_MAX_BOUCLE);
    // LE RANG EST RAMENÉ DANS SES BORNES AVANT D'ÊTRE LU. Aucun chemin d'aujourd'hui ne pose un rang
    // négatif — il naît à zéro et n'est qu'incrémenté ou remis à zéro —, mais le compteur le
    // suivrait s'il en trouvait un : à moins cinq sur une boucle sans morceau, il rendrait `true`
    // cinq fois, c'est-à-dire cinq exécutions du graphe entier pour une boucle vide. Mesuré, puis
    // clos. Une fonction dont tout l'intérêt est de s'arrêter doit s'arrêter sur n'importe quelle
    // entrée que sa signature permet, et non seulement sur celles que ses appelants lui donnent.
    const rang = Math.max(0, Math.floor(etats[k].index));
    etats[k].index = rang;
    if (rang + 1 < combien) {
      etats[k].index = rang + 1;
      for (let p = k + 1; p < etats.length; p++) {
        etats[p].index = 0;
        etats[p].morceaux = [];
        etats[p].recoltes = [];
      }
      return true;
    }
  }
  return false;
}
