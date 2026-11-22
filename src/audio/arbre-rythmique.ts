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

import { traduire } from "../i18n";

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
  // LE REFUS SE DIT DANS LA LANGUE DE L'INTERFACE : trois composants le rendent tel quel en message,
  // et il s'affichait en français dans l'interface anglaise. `cle` est une clé du dictionnaire.
  const erreur = (cle: string, ou = i): never => {
    throw new Error(jetons[ou]
      ? traduire("msg.arbre.position_jeton", traduire(cle), ou + 1, jetons.length, jetons[ou])
      : traduire("msg.arbre.position", traduire(cle), ou + 1, jetons.length));
  };
  // CE QUI SONNE JUSTE AVANT, dans l'ordre de lecture, à travers les divisions et les barres : une
  // liaison ne prolonge qu'une note.
  let precedente: "note" | "silence" | null = null;

  // CE QUE LE MANUEL D'OPENMUSIC NE DÉFINIT PAS EST REFUSÉ, ET NOMMÉ. Revue des notations en texte,
  // décision de Fabien du 2026-11-22, « Refuse them, named ». Une division ne sonne pas, et ne porte
  // donc ni signe ni liaison : `(-1 (1 1))` était corrigé en silence, et `(1.0 (1 1))` aussi. Une
  // liaison derrière un silence prolongeait le silence, une liaison en tête devenait une note, et un
  // silence lié prolongeait la note d'avant, si bien que le silence écrit sonnait.
  const lireNoeud = (): NoeudRythme => {
    if (jetons[i] === "(") {
      i++;
      const ou = i;
      const poids = lireNombre();
      if (poids.valeur < 0) erreur("msg.arbre.division_negative", ou);
      if (poids.liee) erreur("msg.arbre.division_liee", ou);
      const enfants = lireListe();
      if (jetons[i] !== ")") erreur("msg.arbre.fermante_division");
      i++;
      return { valeur: poids.valeur, enfants };
    }
    const ou = i;
    const n = lireNombre();
    const silence = n.valeur < 0;
    if (n.liee && silence) erreur("msg.arbre.silence_lie", ou);
    if (n.liee && precedente !== "note") erreur("msg.arbre.liaison_sans_note", ou);
    if (!n.liee) precedente = silence ? "silence" : "note";
    return { valeur: Math.abs(n.valeur), silence, liee: n.liee };
  };

  const lireNombre = (): { valeur: number; liee: boolean } => {
    const j = jetons[i];
    if (j === undefined) erreur("msg.arbre.nombre");
    if (!/^-?\d+(\.\d+)?$/.test(j)) erreur("msg.arbre.nombre");
    // UN POIDS NUL NE DURE RIEN, ET LE MANUEL REFUSE « les valeurs entre 0 et 1 ». Revue des notations
    // en texte, 2026-11-22 : « 0 » rendait une note de durée nulle, et « 0.5 » se lisait comme une
    // liaison d'un demi-poids.
    const absolu = Math.abs(Number(j));
    if (absolu === 0) erreur("msg.arbre.poids_nul");
    if (absolu < 1) erreur("msg.arbre.poids_fractionnaire");
    i++;
    // LA VIRGULE MARQUE LA LIAISON, et c'est la convention d'origine : « 1.0 » est une durée d'un
    // temps liée à ce qui précède, « 1 » une note neuve. Les deux valent un, seule l'écriture les
    // distingue, et c'est pourquoi la liaison est relevée ici plutôt que déduite du nombre.
    return { valeur: Number(j), liee: j.includes(".") };
  };

  const lireListe = (): NoeudRythme[] => {
    if (jetons[i] !== "(") erreur("msg.arbre.liste");
    const ouvrante = i;
    i++;
    const out: NoeudRythme[] = [];
    while (i < jetons.length && jetons[i] !== ")") out.push(lireNoeud());
    if (jetons[i] !== ")") erreur("msg.arbre.fermante_liste");
    // Une liste sans proportion ne divise rien : « (4/4 ()) » rendait quatre temps de rien.
    if (out.length === 0) erreur("msg.arbre.liste_vide", ouvrante);
    i++;
    return out;
  };

  /** Une métrique en liste, « (4 4) », à la position `k` : deux entiers entre parenthèses. */
  const metriqueEnListe = (k: number) =>
    jetons[k] === "(" && /^\d+$/.test(jetons[k + 1] ?? "") && /^\d+$/.test(jetons[k + 2] ?? "") && jetons[k + 3] === ")";

  // LA MÉTRIQUE S'ÉCRIT « 4/4 », OU COMME DANS OPENMUSIC, « 4//4 » ou « (4 4) ». Décision de Fabien du
  // 2026-11-22, « Read them » : le manuel donne « n // n or ( n n ) », et ces arbres étaient refusés.
  const lireMesure = (): Mesure => {
    if (jetons[i] !== "(") erreur("msg.arbre.ouvrante_mesure");
    i++;
    const ou = i;
    let termes: [string, string];
    if (metriqueEnListe(i)) {
      termes = [jetons[i + 1], jetons[i + 2]];
      i += 4;
    } else {
      const m = /^(\d+)\/\/?(\d+)$/.exec(jetons[i] ?? "");
      if (!m) erreur("msg.arbre.metrique");
      termes = [m![1], m![2]];
      i++;
    }
    // UNE MÉTRIQUE DONT UN TERME EST NUL NE MESURE RIEN. « 4/0 » se lisait 4/1, seize temps, et « 0/4 »
    // rendait des notes de durée nulle, sans un mot.
    if (Number(termes[0]) === 0 || Number(termes[1]) === 0) erreur("msg.arbre.metrique_nulle", ou);
    const contenu = lireListe();
    if (jetons[i] !== ")") erreur("msg.arbre.fermante_mesure");
    i++;
    return { metrique: [Number(termes[0]), Number(termes[1])], contenu };
  };

  if (jetons.length === 0) return [];
  const mesures: Mesure[] = [];
  // UNE VOIX D'OPENMUSIC, « (? ((4//4 (1 1 1 1)) …)) » : son premier élément est « ? » ou le nombre de
  // ses mesures, et la liste de ses mesures suit. Un nombre qui ne compte pas les mesures portées est
  // refusé : on ne sait plus laquelle des deux choses il fallait dire.
  const voix = jetons[0] === "(" && (jetons[1] === "?" || /^\d+$/.test(jetons[1] ?? "")) && jetons[2] === "(" && jetons[3] === "(";
  const annonce = voix ? 1 : -1;
  if (voix) i = 2;
  // Une liste englobante est reconnue à ceci que son premier élément est lui-même une mesure, et non
  // la métrique en liste d'une mesure seule, « ((4 4) (1 1 1 1)) ».
  const englobante = voix || (jetons[0] === "(" && jetons[1] === "(" && !metriqueEnListe(1));
  if (englobante) i++;
  while (i < jetons.length && jetons[i] === "(") mesures.push(lireMesure());
  if (englobante) {
    if (jetons[i] !== ")") erreur("msg.arbre.fermante_mesures");
    i++;
  }
  if (voix) {
    if (jetons[i] !== ")") erreur("msg.arbre.fermante_voix");
    i++;
    if (jetons[annonce] !== "?" && Number(jetons[annonce]) !== mesures.length) erreur("msg.arbre.nombre_mesures", annonce);
  }
  if (i < jetons.length) erreur("msg.arbre.texte_en_trop");
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

/** Une durée binaire, en rondes : un entier sur une puissance de deux, ce que s'écrit sans n-olet. */
const estBinaire = (rondes: number) => {
  // Un tiers, multiplié par 2^24, laisse un tiers après la virgule ; une durée binaire, l'erreur
  // d'arrondi seule, loin sous le millième.
  const y = rondes * 2 ** 24;
  return Math.abs(y - Math.round(y)) < 1e-3;
};

/** La plus grande puissance de deux qui ne dépasse pas n : le « normal » d'un n-olet. */
const puissanceDeDeuxSous = (n: number) => { let p = 1; while (p * 2 <= n) p *= 2; return p; };

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
  // Une ronde dure 240 / tempo secondes : quatre noires.
  const ronde = 240 / Math.max(1, tempo);
  mesures.forEach((m, rang) => {
    const duree = dureeMesure(m.metrique, tempo);
    poser(m.contenu, t, duree, rang, 0, compteur.groupe, compteur, out, 1, ronde);
    t += duree;
  });
  return out;
}

function poser(
  noeuds: readonly NoeudRythme[], debut: number, duree: number,
  mesure: number, noletHerite: number, groupeHerite: number,
  compteur: { groupe: number }, out: EvenementRythme[],
  rapport: number, ronde: number,
): void {
  const somme = noeuds.reduce((s, n) => s + Math.max(0, n.valeur), 0);
  if (somme <= 0) return;
  // UNE DIVISION EST UN N-OLET QUAND LA DURÉE ÉCRITE DE SON UNITÉ N'EST PAS BINAIRE. Revue des
  // notations en texte, 2026-11-22 : le n-olet se comptait au nombre de parts, et « (3/4 (1 1 1)) »,
  // trois noires exactes, passait pour un triolet, quand « (4/4 (2 1)) », un triolet de blanches,
  // n'en était pas un. La durée est l'ÉCRITE, celle qu'allonge le rapport des n-olets englobants :
  // la moitié d'une note de triolet est une croche de triolet, et non un n-olet de plus. Le n-olet
  // porte la somme des poids, trois pour « (2 1) », comme le MusicXML l'écrit.
  const irreguliere = !estBinaire(((duree / ronde) * rapport) / somme);
  const nolet = irreguliere ? Math.round(somme) : noletHerite;
  const groupe = irreguliere ? ++compteur.groupe : groupeHerite;
  const monRapport = irreguliere ? (rapport * somme) / puissanceDeDeuxSous(somme) : rapport;
  let t = debut;
  for (const n of noeuds) {
    const part = (duree * Math.max(0, n.valeur)) / somme;
    if (n.enfants && n.enfants.length > 0) {
      poser(n.enfants, t, part, mesure, nolet, groupe, compteur, out, monRapport, ronde);
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
