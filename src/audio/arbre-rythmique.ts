// audio/arbre-rythmique.ts — Le rythme comme division, et non comme liste de durées.
//
// CE QUE CELA CHANGE. Une liste de durées dit « une seconde, un tiers de seconde, un tiers, un
// tiers ». Elle ne dit pas que les trois tiers forment un triolet, c'est-à-dire un temps divisé en
// trois. La différence n'est pas d'écriture : elle décide de ce qu'on peut faire ensuite. Sur un
// arbre, changer la métrique, subdiviser encore, remplacer une division par une autre sont des
// opérations locales ; sur une liste de durées, chacune demande de tout recalculer.
//
// LA STRUCTURE EST CELLE D'OPENMUSIC, parce qu'elle est bonne et publiée. Une mesure porte une
// métrique et une liste de proportions. Chaque proportion est une note, un silence quand elle est
// négative, ou une division quand elle porte elle-même une liste. Les proportions n'ont pas
// d'unité : ce qui compte est leur rapport. Une liste `(1 1 2)` sur une mesure de quatre temps
// donne un temps, un temps, deux temps ; la même liste sur trois temps donne trois quarts de temps,
// trois quarts, et un temps et demi.
//
// LA NOTATION TEXTUELLE EST CELLE DES LISTES LISP, `(4/4 (1 1 (1 (1 1 1)) 1))`, pour la même
// raison : c'est ainsi que les arbres rythmiques s'échangent depuis trente ans, et quiconque en a
// écrit un ailleurs peut le coller ici. Rien de ce code ne vient d'une source sous licence GPL ;
// une syntaxe n'est pas un programme. Voir la section 4 de `COMPOSITION-ASSISTEE.md`.

/**
 * Un nœud de l'arbre : une proportion, et ce qu'elle contient.
 *
 * LE POIDS EST TOUJOURS POSITIF, et le silence est un champ. Écrire le silence par un nombre
 * négatif, comme le fait la notation textuelle, est commode à taper et mauvais à manipuler : chaque
 * calcul de proportion doit alors se souvenir de prendre une valeur absolue, et l'oubli ne se voit
 * qu'à l'audition. La lecture du texte fait la traduction une fois pour toutes.
 */
export interface NoeudRythme {
  /** Poids proportionnel, strictement positif. Sans unité : seul son rapport aux voisins compte. */
  valeur: number;
  /** Silence plutôt que note. */
  silence?: boolean;
  /** Liée à l'événement qui précède : les deux durées se fondent en une. */
  liee?: boolean;
  /** Division de ce poids entre des nœuds fils. */
  enfants?: NoeudRythme[];
}

export interface Mesure {
  /** Numérateur et dénominateur, par exemple [4, 4] ou [6, 8]. */
  metrique: [number, number];
  contenu: NoeudRythme[];
}

export interface EvenementRythme {
  /** Début en secondes depuis le commencement de l'arbre. */
  debut: number;
  duree: number;
  silence: boolean;
  /** Rang de la mesure, depuis zéro. */
  mesure: number;
  /**
   * Le dénominateur de la division qui porte cet événement, quand il n'est pas une puissance de
   * deux : 3 pour un triolet, 5 pour un quintolet. Zéro quand la division est binaire.
   *
   * SERT À LA GRAVURE, ET NON AU SON : le son est déjà juste, puisque les durées sont exactes.
   * C'est l'écriture qui a besoin de savoir qu'un groupe est un triolet plutôt que trois durées
   * bizarres.
   */
  nolet: number;
  /**
   * Le rang de la division qui porte cet événement, unique dans l'arbre.
   *
   * SANS LUI, ON COMPTE DES NOTES EN CROYANT COMPTER DES GROUPES. Un triolet porte trois
   * événements ; les dénombrer par leur n-olet et leur instant en fait trois groupes, et le relevé
   * annonce trois triolets là où il y en a un.
   */
  groupe: number;
}

// ── Lecture du texte ───────────────────────────────────────────────────

type Jeton = string;

function decouper(texte: string): Jeton[] {
  return texte.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/).filter(Boolean);
}

/**
 * Lit un arbre rythmique écrit en listes : `(4/4 (1 1 (1 (1 1 1)) 1))`.
 *
 * PLUSIEURS MESURES S'ÉCRIVENT L'UNE APRÈS L'AUTRE, éventuellement dans une liste englobante. Les
 * deux formes se rencontrent dans les partitions échangées, et refuser la seconde obligerait à
 * retoucher à la main tout arbre venu d'ailleurs.
 *
 * UNE ERREUR DE SYNTAXE EST NOMMÉE AVEC SA POSITION. Un arbre se tape à la main, donc il se tape
 * faux : une parenthèse manquante sur une ligne de quarante signes ne se trouve pas à l'œil.
 */
export function lireArbre(texte: string): Mesure[] {
  const jetons = decouper(texte);
  let i = 0;
  const erreur = (m: string): never => {
    throw new Error(`${m} (jeton ${i + 1} sur ${jetons.length}${jetons[i] ? ` : « ${jetons[i]} »` : ""})`);
  };

  const lireNoeud = (): NoeudRythme => {
    if (jetons[i] === "(") {
      i++;
      const poids = lireNombre();
      const enfants = lireListe();
      if (jetons[i] !== ")") erreur("parenthèse fermante attendue après une division");
      i++;
      // UNE DIVISION NE SONNE PAS, DONC ELLE N'EST NI SILENCE NI LIÉE, et le signe qui le
      // prétendrait est abandonné ici. Écrit à la main, `(-1 (1 1))` était accepté, DESSINÉ avec
      // les hachures d'un silence, et joué en deux notes : le déroulement descend dans la division
      // et jette le signe. Le dessin disait une chose et l'oreille en entendait une autre, ce qui
      // est le pire des deux mondes. Un arbre tapé à la main mérite d'être pardonné plutôt que
      // rejeté ; il est donc corrigé, et se réécrit sans le signe, de sorte que ce qui est dessiné
      // redevienne ce qui est entendu. Relevé par Fabien, qui demandait à quoi sert « Note ».
      return { valeur: Math.abs(poids.valeur), enfants };
    }
    const n = lireNombre();
    return { valeur: Math.abs(n.valeur), silence: n.valeur < 0, liee: n.liee };
  };

  const lireNombre = (): { valeur: number; liee: boolean } => {
    const j = jetons[i];
    if (j === undefined) erreur("nombre attendu");
    if (!/^-?\d+(\.\d+)?$/.test(j)) erreur("nombre attendu");
    i++;
    // LA VIRGULE MARQUE LA LIAISON, et c'est la convention d'origine : « 1.0 » est une durée d'un
    // temps liée à ce qui précède, « 1 » une note neuve. Les deux valent un, seule l'écriture les
    // distingue, et c'est pourquoi la liaison est relevée ici plutôt que déduite du nombre.
    return { valeur: Number(j), liee: j.includes(".") };
  };

  const lireListe = (): NoeudRythme[] => {
    if (jetons[i] !== "(") erreur("liste attendue");
    i++;
    const out: NoeudRythme[] = [];
    while (i < jetons.length && jetons[i] !== ")") out.push(lireNoeud());
    if (jetons[i] !== ")") erreur("parenthèse fermante attendue à la fin d'une liste");
    i++;
    return out;
  };

  const lireMesure = (): Mesure => {
    if (jetons[i] !== "(") erreur("une mesure commence par une parenthèse");
    i++;
    const m = /^(\d+)\/(\d+)$/.exec(jetons[i] ?? "");
    if (!m) erreur("métrique attendue, de la forme 4/4");
    i++;
    const contenu = lireListe();
    if (jetons[i] !== ")") erreur("parenthèse fermante attendue à la fin d'une mesure");
    i++;
    return { metrique: [Number(m![1]), Number(m![2])], contenu };
  };

  if (jetons.length === 0) return [];
  const mesures: Mesure[] = [];
  // Une liste englobante est reconnue à ceci que son premier élément est lui-même une liste.
  const englobante = jetons[0] === "(" && jetons[1] === "(";
  if (englobante) i++;
  while (i < jetons.length && jetons[i] === "(") mesures.push(lireMesure());
  if (englobante) {
    if (jetons[i] !== ")") erreur("parenthèse fermante attendue à la fin de la liste de mesures");
    i++;
  }
  if (i < jetons.length) erreur("texte en trop après le dernier arbre");
  return mesures;
}

/** Réécrit un arbre dans la notation en listes, pour le relire ou le transmettre. */
export function ecrireArbre(mesures: readonly Mesure[]): string {
  const noeud = (n: NoeudRythme): string => {
    const v = (n.silence ? -n.valeur : n.valeur) + (n.liee ? ".0" : "");
    return n.enfants && n.enfants.length > 0
      ? `(${v} (${n.enfants.map(noeud).join(" ")}))`
      : String(v);
  };
  const une = (m: Mesure) => `(${m.metrique[0]}/${m.metrique[1]} (${m.contenu.map(noeud).join(" ")}))`;
  return mesures.length === 1 ? une(mesures[0]) : `(${mesures.map(une).join(" ")})`;
}

// ── Déroulement en durées ──────────────────────────────────────────────

/** La durée d'une mesure, en secondes, pour un tempo donné en noires par minute. */
export function dureeMesure(metrique: readonly [number, number], tempo: number): number {
  const noires = (metrique[0] * 4) / Math.max(1, metrique[1]);
  return (noires * 60) / Math.max(1, tempo);
}

/** Puissance de deux : une division binaire ne fait pas de n-olet. */
const estPuissanceDeDeux = (n: number) => n > 0 && (n & (n - 1)) === 0;

/**
 * Déroule un arbre en événements datés, en secondes.
 *
 * LA DURÉE SE RÉPARTIT AU PRORATA DES POIDS, à chaque étage. Un poids de 2 parmi des poids qui font
 * 6 prend le tiers de ce que son parent lui laisse, et le subdivise à son tour selon la même règle.
 * C'est toute la définition, et elle suffit à produire triolets, quintolets et divisions gigognes
 * sans que rien n'ait à les connaître.
 *
 * LES LIAISONS SE FONDENT DANS L'ÉVÉNEMENT PRÉCÉDENT plutôt que d'en créer un nouveau : une note
 * liée n'est pas réattaquée, c'est la même qui dure plus longtemps. Une liaison qui n'a rien devant
 * elle, au tout début, devient une note ordinaire faute de pouvoir se rattacher.
 */
export function derouler(mesures: readonly Mesure[], tempo: number): EvenementRythme[] {
  const out: EvenementRythme[] = [];
  const compteur = { groupe: 0 };
  let t = 0;
  mesures.forEach((m, rang) => {
    const duree = dureeMesure(m.metrique, tempo);
    poser(m.contenu, t, duree, rang, 0, compteur.groupe, compteur, out);
    t += duree;
  });
  return out;
}

function poser(
  noeuds: readonly NoeudRythme[], debut: number, duree: number,
  mesure: number, noletHerite: number, groupeHerite: number,
  compteur: { groupe: number }, out: EvenementRythme[],
): void {
  const somme = noeuds.reduce((s, n) => s + Math.max(0, n.valeur), 0);
  if (somme <= 0) return;
  // Le n-olet est le NOMBRE DE PARTS de la division, quand il n'est pas une puissance de deux :
  // trois parts font un triolet, cinq un quintolet, quatre ou huit ne font rien de particulier.
  const irreguliere = !estPuissanceDeDeux(noeuds.length);
  const nolet = irreguliere ? noeuds.length : noletHerite;
  const groupe = irreguliere ? ++compteur.groupe : groupeHerite;
  let t = debut;
  for (const n of noeuds) {
    const part = (duree * Math.max(0, n.valeur)) / somme;
    if (n.enfants && n.enfants.length > 0) {
      poser(n.enfants, t, part, mesure, nolet, groupe, compteur, out);
    } else if (n.liee && out.length > 0) {
      out[out.length - 1].duree += part;
    } else {
      out.push({ debut: t, duree: part, silence: !!n.silence, mesure, nolet, groupe });
    }
    t += part;
  }
}

/** La durée totale d'un arbre, en secondes : la somme de ses mesures. */
export function dureeArbre(mesures: readonly Mesure[], tempo: number): number {
  return mesures.reduce((s, m) => s + dureeMesure(m.metrique, tempo), 0);
}
